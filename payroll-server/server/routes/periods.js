const express = require("express");
const { sendError, isBusinessError } = require("../errors");
const router = express.Router();
const pool = require("../db");
const { syncLoanQueue } = require("../loanQueueSync");
const { rebuildPeriod } = require("../deductionSummary");

const isoTime = (v) => { if (!v) return ""; const d = new Date(v); return Number.isNaN(d.getTime()) ? String(v) : d.toISOString(); };
function toPeriodJSON(row) {
  return {
    id: row.id,
    year: row.year,
    month: row.month, // 1..12
    issueDate: row.issue_date || "",
    activeFile: row.active_file || "",
    retireeFile: row.retiree_file || "",
    loanFile: row.loan_file || "",
    peopleCount: row.people_count != null ? Number(row.people_count) : undefined,
    // نسخهٔ ۱۱۱: زمان آخرین تغییر دوره (امضای periodSig در کلاینت؛ همگام‌سازی پس‌زمینه با /api/sync)
    updatedAt: isoTime(row.updated_at),
  };
}

// فهرست دوره‌ها (مشترک بین GET /api/periods و GET /api/sync)
async function listPeriods(db = pool) {
  // نکته: عمداً ستون‌ها را صریح انتخاب می‌کنیم و loans_data (که JSON و می‌تواند حجیم باشد)
  // را نمی‌آوریم، و به‌جای JOIN+GROUP BY از یک زیرکوئری برای شمارش استفاده می‌کنیم.
  // ترکیب GROUP BY با یک ستون JSON بزرگ باعث خطای «Out of sort memory» در MySQL می‌شود
  // چون MySQL باید آن ستون را هم در جدول موقتِ گروه‌بندی نگه دارد.
  const [rows] = await db.query(
    `SELECT p.id, p.year, p.month, p.issue_date, p.active_file, p.retiree_file, p.loan_file, p.updated_at,
            (SELECT COUNT(*) FROM people pe WHERE pe.period_id = p.id) AS people_count
     FROM periods p
     ORDER BY p.year, p.month`
  );
  return rows.map(toPeriodJSON);
}

// GET /api/periods  -> فهرست دوره‌ها به‌همراه تعداد افراد هرکدام
router.get("/", async (req, res) => {
  try {
    res.json(await listPeriods());
  } catch (err) {
    sendError(res, err);
  }
});

// POST /api/periods  { year, month }  -> اگر از قبل بود همان را برمی‌گرداند (idempotent)
router.post("/", async (req, res) => {
  const { year, month } = req.body || {};
  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
    return res.status(400).json({ error: "invalid_input", message: "سال و ماه (۱ تا ۱۲) معتبر لازم است." });
  }
  try {
    await pool.query(
      `INSERT INTO periods (year, month) VALUES (?, ?)
       ON DUPLICATE KEY UPDATE id = LAST_INSERT_ID(id)`,
      [year, month]
    );
    const [rows] = await pool.query("SELECT * FROM periods WHERE year = ? AND month = ?", [year, month]);
    res.json(toPeriodJSON(rows[0]));
  } catch (err) {
    sendError(res, err);
  }
});

// GET /api/periods/:id  -> جزئیات کامل یک دوره، شامل نگاشت اقساط
// GET /api/periods/person-slips?code=&fy=&fm=&ty=&tm=  ← فیش‌های یک فرد از دورهٔ fy/fm تا دورهٔ ty/tm (با دو سر)
// برای چاپ فیش‌های یک نفر در چند دوره؛ فقط ردیف همان فرد و قسط‌های همان دوره را برمی‌گرداند (نه کل افراد دوره).
// باید پیش از "/:id" ثبت شود.
const PS_MAX_MONTHS = 36;
router.get("/person-slips", async (req, res) => {
  const { toLatinDigits } = require("../textNormalize");
  const iv = (v) => parseInt(toLatinDigits(v == null ? "" : String(v)), 10) || 0;
  const code = toLatinDigits(req.query.code == null ? "" : String(req.query.code)).trim();
  const fy = iv(req.query.fy), fm = iv(req.query.fm), ty = iv(req.query.ty), tm = iv(req.query.tm);
  const okYm = (y, m) => y >= 1300 && y <= 1600 && m >= 1 && m <= 12;
  const bad = (message) => res.status(400).json({ error: "invalid_input", message });
  if (!code || code.length > 50) return bad("کد پرسنلی را مشخص کنید.");
  if (!okYm(fy, fm) || !okYm(ty, tm)) return bad("دورهٔ «از» و «تا» را درست انتخاب کنید.");
  const a = fy * 12 + fm - 1, b = ty * 12 + tm - 1;
  if (a > b) return bad("«از دوره» نباید بعد از «تا دوره» باشد.");
  if (b - a + 1 > PS_MAX_MONTHS) return bad(`بازه حداکثر ${PS_MAX_MONTHS} ماه می‌تواند باشد.`);
  try {
    const [pers] = await pool.query("SELECT id, year, month, issue_date, loans_data FROM periods WHERE (year * 12 + month - 1) BETWEEN ? AND ? ORDER BY year, month", [a, b]);
    const items = [];
    for (const per of pers) {
      const [rows] = await pool.query("SELECT id, kind, code, name, data FROM people WHERE period_id = ? AND code = ?", [per.id, code]);
      if (!rows.length) continue;
      let loansAll = per.loans_data;
      if (typeof loansAll === "string") { try { loansAll = JSON.parse(loansAll); } catch (e) { loansAll = null; } }
      const r = rows[0];
      let data = r.data; if (typeof data === "string") { try { data = JSON.parse(data); } catch (e) { data = null; } }
      if (!data) continue;
      items.push({ period: { id: per.id, year: per.year, month: per.month, issueDate: per.issue_date || "" }, person: { id: r.id, kind: r.kind, code: r.code, name: r.name, data }, loans: ((loansAll || {})[r.code]) || [] });
    }
    res.json({ code, items });
  } catch (err) { sendError(res, err); }
});

router.get("/:id", async (req, res) => {
  try {
    const [rows] = await pool.query("SELECT * FROM periods WHERE id = ?", [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: "not_found" });
    const p = toPeriodJSON(rows[0]);
    p.loans = rows[0].loans_data || {};
    res.json(p);
  } catch (err) {
    sendError(res, err);
  }
});

// PUT /api/periods/:id  -> به‌روزرسانی جزئی؛ فقط فیلدهای ارسالی تغییر می‌کنند
// اگر «loans» ارسال شده باشد (یعنی فایل گزارش کسر اقساط وارد شده)، بلافاصله
// بررسی می‌شود چه کسانی قسط کد ۷۱۰ آن‌ها تمام شده و نوبت وام‌شان ثبت می‌شود.
router.put("/:id", async (req, res) => {
  const allowed = { issueDate: "issue_date", activeFile: "active_file", retireeFile: "retiree_file", loanFile: "loan_file" };
  const sets = [], vals = [];
  for (const key of Object.keys(allowed)) {
    if (Object.prototype.hasOwnProperty.call(req.body || {}, key)) {
      sets.push(`${allowed[key]} = ?`);
      vals.push(req.body[key]);
    }
  }
  const hasLoans = Object.prototype.hasOwnProperty.call(req.body || {}, "loans");
  if (hasLoans) {
    sets.push("loans_data = ?");
    vals.push(JSON.stringify(req.body.loans || {}));
  }
  if (!sets.length) return res.status(400).json({ error: "invalid_input", message: "هیچ فیلدی برای به‌روزرسانی ارسال نشده است." });
  vals.push(req.params.id);

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [result] = await conn.query(`UPDATE periods SET ${sets.join(", ")} WHERE id = ?`, vals);
    if (!result.affectedRows) {
      await conn.rollback();
      return res.status(404).json({ error: "not_found" });
    }
    let loanQueueSync = null;
    if (hasLoans) {
      loanQueueSync = await syncLoanQueue(conn, req.params.id);
      await rebuildPeriod(conn, req.params.id);   // اقساط فایل وام در کسورات شاغلین اثر می‌گذارد
    }
    await conn.commit();
    res.json({ ok: true, loanQueueSync });
  } catch (err) {
    await conn.rollback();
    sendError(res, err);
  } finally {
    conn.release();
  }
});

// DELETE /api/periods/:id  -> حذف دوره و همهٔ افراد آن (به‌خاطر ON DELETE CASCADE)
router.delete("/:id", async (req, res) => {
  try {
    // تاریخچهٔ تغییر وضعیتی که بارگذاری همین دوره ایجاد کرده بود هم پاک می‌شود
    const [[ex]] = await pool.query("SELECT id FROM periods WHERE id = ?", [req.params.id]).then((r) => [[r[0][0]]]);
    if (!ex) return res.status(404).json({ error: "not_found" });
    const [logDel] = await pool.query("DELETE FROM personnel_status_log WHERE period_id = ?", [req.params.id]);
    const [result] = await pool.query("DELETE FROM periods WHERE id = ?", [req.params.id]);
    if (!result.affectedRows) return res.status(404).json({ error: "not_found" });
    res.json({ ok: true, statusLogDeleted: logDel.affectedRows || 0 });
  } catch (err) {
    sendError(res, err);
  }
});

module.exports = router;
module.exports.listPeriods = listPeriods;   // برای GET /api/sync (routes/sync.js)
module.exports.isoTime = isoTime;
