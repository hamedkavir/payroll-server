const express = require("express");
const { sendError, isBusinessError } = require("../errors");
const router = express.Router({ mergeParams: true });
const pool = require("../db");
const { syncPersonnelFromPeriod } = require("../personnelSync");
const { syncLoanQueue } = require("../loanQueueSync");
const { rebuildPeriod } = require("../deductionSummary");
const { applyBankList, freezeBank } = require("../slipBank");

// GET /api/periods/:id/people  -> فهرست همهٔ افراد یک دوره (هم کارکنان هم بازنشستگان)
router.get("/", async (req, res) => {
  try {
    const [rows] = await pool.query(
      "SELECT id, kind, code, name, national_id, data, bank_account, shaba, bank_name, bank_frozen FROM people WHERE period_id = ?",
      [req.params.id]
    );
    // مرتب‌سازی در Node (نه SQL): ستون data حجیم است و ORDER BY روی آن خطای sort memory می‌دهد
    rows.sort((a, b) => (a.name || "").localeCompare(b.name || "", "fa"));
    try { await applyBankList(pool, rows); } catch (e) { /* بدون جدول پرسنل/ستون: همان دادهٔ فایل */ }
    res.json(
      rows.map((r) => ({
        id: r.id,
        kind: r.kind,
        code: r.code,
        name: r.name,
        nationalId: require("../textNormalize").padNid(r.national_id),
        data: r.data,
      }))
    );
  } catch (err) {
    sendError(res, err);
  }
});

// POST /api/periods/:id/people/import
// body: { kind: 'active'|'retiree', people: [{ code, name, nationalId, data }, ...], fileName }
// جایگزینی کامل افراد همان kind در این دوره: درج/به‌روزرسانی موارد جدید،
// و حذف کسانی که در فایل تازه نیستند (یعنی از فهرست کارکنان حذف شده‌اند).
// در همین تراکنش، جدول personnel هم بر همین اساس همگام‌سازی می‌شود
// (شاغل/بازنشسته/قطع رابطه) — نگاه کنید به personnelSync.js.
router.post("/import", async (req, res) => {
  const periodId = req.params.id;
  const { kind, people, fileName, fileYm } = req.body || {};
  if (!["active", "retiree"].includes(kind) || !Array.isArray(people)) {
    return res.status(400).json({ error: "invalid_input", message: "kind و فهرست people لازم است." });
  }
  // کنترل دوره: اگر کلاینت سال/ماهِ داخل فایل را فرستاده باشد باید با دورهٔ انتخاب‌شده یکی باشد
  if (Array.isArray(fileYm) && fileYm.length === 2) {
    const [[per]] = await pool.query("SELECT year, month FROM periods WHERE id = ?", [periodId]).then((r) => [[r[0][0]]]);
    if (per && (Number(fileYm[0]) !== Number(per.year) || Number(fileYm[1]) !== Number(per.month))) {
      return res.status(400).json({ error: "period_mismatch", message: `سال و ماه داخل فایل (${fileYm[0]}/${fileYm[1]}) با دورهٔ انتخاب‌شده (${per.year}/${per.month}) یکی نیست.` });
    }
  }
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const codes = people.map((p, i) => String(p.code || `row${i}`));
    let inserted = 0, updated = 0;
    // گزارش تغییرات فایل: افراد جدید، حذف‌شده از فایل و فیش‌های تغییرکرده
    const canon = (v) => JSON.stringify(v, (k, x) => (x && typeof x === "object" && !Array.isArray(x) ? Object.keys(x).sort().reduce((o, kk) => ((o[kk] = x[kk]), o), {}) : x));
    const [oldRows] = await conn.query("SELECT code, name, national_id, data FROM people WHERE period_id = ? AND kind = ?", [periodId, kind]);
    const oldMap = new Map(oldRows.map((r) => [String(r.code), r]));
    const slipChanges = { created: [], removed: [], changed: [] };
    const netOf = (d) => { try { d = typeof d === "string" ? JSON.parse(d) : d; return d && (d.net != null ? d.net : d.info && d.info.net != null ? d.info.net : ""); } catch (e) { return ""; } };
    const codeSet = new Set(codes);
    for (const r of oldRows) if (!codeSet.has(String(r.code))) slipChanges.removed.push({ code: String(r.code), name: r.name || "" });
    people.forEach((p, i) => {
      const o = oldMap.get(codes[i]);
      if (!o) { slipChanges.created.push({ code: codes[i], name: p.name || "" }); return; }
      let od = o.data; try { if (typeof od === "string") od = JSON.parse(od); } catch (e) { /* */ }
      if (canon(od) !== canon(p.data || {})) slipChanges.changed.push({ code: codes[i], name: p.name || "", oldNet: netOf(od), newNet: netOf(p.data) });
    });

    for (let i = 0; i < people.length; i++) {
      const p = people[i];
      const code = codes[i];
      const [result] = await conn.query(
        `INSERT INTO people (period_id, kind, code, name, national_id, data)
         VALUES (?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           name = VALUES(name), national_id = VALUES(national_id), data = VALUES(data)`,
        [periodId, kind, code, p.name || "", require("../textNormalize").padNid(p.nationalId), JSON.stringify(p.data || {})]
      );
      // insertId=0 و affectedRows=2 یعنی سطر موجود به‌روزرسانی شد (رفتار ON DUPLICATE KEY در mysql2)
      if (result.affectedRows === 1) inserted++; else updated++;
    }

    let deleted = 0;
    if (codes.length) {
      const placeholders = codes.map(() => "?").join(",");
      const [delResult] = await conn.query(
        `DELETE FROM people WHERE period_id = ? AND kind = ? AND code NOT IN (${placeholders})`,
        [periodId, kind, ...codes]
      );
      deleted = delResult.affectedRows;
    } else {
      const [delResult] = await conn.query("DELETE FROM people WHERE period_id = ? AND kind = ?", [periodId, kind]);
      deleted = delResult.affectedRows;
    }

    if (fileName) {
      const col = kind === "active" ? "active_file" : "retiree_file";
      await conn.query(`UPDATE periods SET ${col} = ? WHERE id = ?`, [fileName, periodId]);
    }

    const sync = await syncPersonnelFromPeriod(conn, periodId);
    await freezeBank(conn, { periodId, kind });   // حساب/شبا/بانک این فیش‌ها همین حالا ثبت می‌شود (تغییرات بعدی پرسنل اثر نمی‌گذارد)
    const loanSync = await syncLoanQueue(conn, periodId);
    await rebuildPeriod(conn, periodId);   // گزارش تجمیعی کسورات و جمع‌های دوره

    await conn.commit();
    res.json({ ok: true, inserted, updated, deleted, personnelSync: sync, loanQueueSync: loanSync, slipChanges });
  } catch (err) {
    await conn.rollback();
    sendError(res, err);
  } finally {
    conn.release();
  }
});

// DELETE /api/periods/:id/people/:personId  -> حذف تکی یک نفر
router.delete("/:personId", async (req, res) => {
  try {
    const [result] = await pool.query("DELETE FROM people WHERE id = ? AND period_id = ?", [
      req.params.personId,
      req.params.id,
    ]);
    if (!result.affectedRows) return res.status(404).json({ error: "not_found" });
    try { await rebuildPeriod(pool, req.params.id); } catch (e) { /* خلاصه بعداً با بازسازی درست می‌شود */ }
    res.json({ ok: true });
  } catch (err) {
    sendError(res, err);
  }
});

module.exports = router;
