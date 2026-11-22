// «بستن فایل حقوق»: برای هر ماه حقوقی، تاریخ بستن فایل حقوق ثبت می‌شود.
// مثال: حقوق مهر ۱۴۰۵ ← ۱۴۰۵/۰۷/۱۵؛ پس دورهٔ مهر از ۱۴۰۵/۰۶/۱۶ (روز بعد از بستن شهریور) تا ۱۴۰۵/۰۷/۱۵ است.
const express = require("express");
const { sendError, isBusinessError } = require("../errors");
const pool = require("../db");
const { toLatinDigits } = require("../textNormalize");
const J = require("../jalali");

const router = express.Router();
const fail = (res, e) => sendError(res, e);
const bad = (res, message, code = 400) => res.status(code).json({ error: code === 404 ? "not_found" : "invalid_input", message });
const idxOf = (y, m) => y * 12 + (m - 1);

async function loadClosings() {
  const [rows] = await pool.query("SELECT * FROM payroll_closings");
  return rows.map((r) => ({ id: r.id, year: r.year, month: r.month, idx: idxOf(r.year, r.month), closeDate: r.close_date, note: r.note || "", createdBy: r.created_by || "" }))
    .sort((a, b) => a.idx - b.idx);
}
// بازهٔ پوشش هر ماه: از «روز بعد از بستن ماهِ قبلی» تا «تاریخ بستن همین ماه»
function withRanges(list) {
  return list.map((c, i) => {
    const prev = list[i - 1];
    const prevOk = prev && prev.idx === c.idx - 1;      // ماه قبل هم بسته شده باشد
    return { ...c, from: prev ? J.nextDay(prev.closeDate) : null, fromIsPrevMonth: !!prevOk, to: c.closeDate };
  });
}

router.get("/", async (req, res) => {
  try { res.json({ items: withRanges(await loadClosings()).reverse() }); } catch (e) { fail(res, e); }
});

// POST /api/closings { year, month, closeDate:'1405/07/15', note }  — اگر برای آن ماه ثبت شده باشد، ویرایش می‌شود
router.post("/", async (req, res) => {
  const b = req.body || {};
  const year = parseInt(toLatinDigits(b.year), 10), month = parseInt(toLatinDigits(b.month), 10);
  const closeDate = toLatinDigits(b.closeDate || "").trim();
  if (!(year >= 1300 && year <= 1500) || !(month >= 1 && month <= 12)) return bad(res, "ماه یا سال حقوق نامعتبر است.");
  if (!J.parse(closeDate)) return bad(res, "تاریخ بستن را به‌صورت ۱۴۰۵/۰۷/۱۵ و معتبر وارد کنید.");
  try {
    const list = await loadClosings();
    const me = idxOf(year, month);
    const before = [...list].reverse().find((c) => c.idx < me), after = list.find((c) => c.idx > me);
    if (before && closeDate <= before.closeDate) return bad(res, `تاریخ بستن باید بعد از تاریخ بستن حقوق ${before.year}/${J.pad2(before.month)} (${before.closeDate}) باشد.`);
    if (after && closeDate >= after.closeDate) return bad(res, `تاریخ بستن باید قبل از تاریخ بستن حقوق ${after.year}/${J.pad2(after.month)} (${after.closeDate}) باشد.`);
    const by = (req.user && (req.user.fullName || req.user.username)) || "";
    await pool.query(
      `INSERT INTO payroll_closings (year, month, close_date, note, created_by) VALUES (?,?,?,?,?)
       ON DUPLICATE KEY UPDATE close_date = VALUES(close_date), note = VALUES(note), created_by = VALUES(created_by)`,
      [year, month, closeDate, String(b.note || "").trim().slice(0, 255), by]);
    // ردیف‌های «تغییرات ماهانه» که تاریخ ثبتشان ≤ تاریخ بستن حقوق است، «بسته‌شده» می‌شوند
    const [cr] = await pool.query("UPDATE monthly_changes SET closed = 1 WHERE closed = 0 AND change_date <= ?", [closeDate]);
    res.json({ ok: true, closedChanges: cr.affectedRows });
  } catch (e) { fail(res, e); }
});

// GET /api/closings/:id/changes -> گزارش «تغییرات ماهانه» همین بستن حقوق: ردیف‌هایی که تاریخ ثبتشان در بازهٔ پوشش آن ماه است
// (از روز بعد از بستن ماه قبل تا تاریخ بستن همین ماه)
router.get("/:id/changes", async (req, res) => {
  try {
    const list = withRanges(await loadClosings());
    const c = list.find((x) => String(x.id) === String(req.params.id));
    if (!c) return bad(res, "مورد پیدا نشد.", 404);
    const where = ["m.change_date <= ?"], vals = [c.to];
    if (c.from) { where.push("m.change_date >= ?"); vals.push(c.from); }
    const [rows] = await pool.query(
      `SELECT m.*, p.first_name, p.last_name, p.national_id, p.status AS person_status FROM monthly_changes m LEFT JOIN personnel p ON p.code = m.code WHERE ${where.join(" AND ")} LIMIT 10000`, vals);
    rows.sort((a, b) => a.change_date.localeCompare(b.change_date) || String(a.deduction_code).localeCompare(String(b.deduction_code)) || a.id - b.id);
    const AC = { 1: "ایجاد", 2: "اصلاح", 3: "حذف" };
    res.json({ closing: { id: c.id, year: c.year, month: c.month, from: c.from, to: c.to }, items: rows.map((r) => ({
      id: r.id, code: r.code, firstName: r.first_name || "", lastName: r.last_name || "", nationalId: r.national_id || "",
      name: [r.first_name, r.last_name].filter(Boolean).join(" "), personStatus: r.person_status || "",
      changeDate: r.change_date, deductionCode: r.deduction_code, deductionName: r.deduction_name || "", loanRow: r.loan_row || "",
      totalAmount: r.total_amount == null ? null : Number(r.total_amount), installmentAmount: r.installment_amount == null ? null : Number(r.installment_amount),
      remaining: r.remaining == null ? null : Number(r.remaining), action: r.action, actionText: AC[r.action] || "", closed: !!r.closed, notes: r.notes || "", createdBy: r.created_by || "",
    })) });
  } catch (e) { fail(res, e); }
});

// ---------------------------------------------------------------------------
// «بستن مساعده و امداد»: مثل بستن حقوق، برای هر ماه تاریخ بستن + «اعمال در ماه حقوقی» ثبت می‌شود.
// مساعده‌ها و وام‌های امدادِ «پرداخت‌شده»ای که تاریخ پرداختشان ≤ تاریخ بستن است «بسته» (قفل) می‌شوند و به نخستین بستنی نسبت داده می‌شوند
// که تاریخش به آن‌ها می‌رسد (closing_id)؛ ماه حقوقیِ اعمال همان بستن برای آن‌ها ثبت می‌شود. بسته‌شده‌ها دیگر ویرایش، برگشت به «در انتظار»،
// لغو یا حذف نمی‌شوند. با ثبت/ویرایش/حذف یک بستن، همهٔ قفل‌ها از نو (بر اساس بستن‌های موجود) حساب می‌شود.
// ---------------------------------------------------------------------------
const AID_TABLES = ["advances", "emdad_loans"];
async function loadAdvClosings(q = pool) {
  const [rows] = await q.query("SELECT * FROM advance_closings");
  return rows.map((r) => ({ id: r.id, year: r.year, month: r.month, idx: idxOf(r.year, r.month), closeDate: r.close_date,
    applyYear: r.apply_year || r.year, applyMonth: r.apply_month || r.month, note: r.note || "", createdBy: r.created_by || "" })).sort((a, b) => a.idx - b.idx);
}
// قفل مساعده و امداد را از نو حساب می‌کند. خروجی: { closed: تعداد تازه‌بسته‌شده، reopened: تعداد دوباره‌بازشده }
async function applyAidLocks(q, closings) {
  let closed = 0, reopened = 0;
  const ordered = [...closings].sort((a, b) => String(a.closeDate).localeCompare(String(b.closeDate)));
  for (const t of AID_TABLES) {
    const [before] = await q.query(`SELECT id FROM ${t} WHERE closed = 1`);
    const was = new Set(before.map((r) => Number(r.id)));
    await q.query(`UPDATE ${t} SET closed = 0, closing_id = NULL WHERE closed = 1`);
    for (const c of ordered) await q.query(`UPDATE ${t} SET closed = 1, closing_id = ? WHERE closed = 0 AND status = 'paid' AND paid_date IS NOT NULL AND paid_date <= ?`, [c.id, c.closeDate]);
    const [after] = await q.query(`SELECT id FROM ${t} WHERE closed = 1`);
    const now = new Set(after.map((r) => Number(r.id)));
    for (const id of now) if (!was.has(id)) closed++;
    for (const id of was) if (!now.has(id)) reopened++;
  }
  return { closed, reopened };
}
router.get("/advances", async (req, res) => {
  try {
    const list = await loadAdvClosings();
    // بستن‌های نسخهٔ قبل (قفل بدون closing_id): یک‌بار از نو نسبت داده می‌شوند
    const [[stale]] = await pool.query("SELECT (SELECT COUNT(*) FROM advances WHERE closed = 1 AND closing_id IS NULL) + (SELECT COUNT(*) FROM emdad_loans WHERE closed = 1 AND closing_id IS NULL) AS c");
    if (Number(stale.c) && list.length) await applyAidLocks(pool, list);
    const cnt = {};
    for (const [key, t] of [["advances", "advances"], ["emdad", "emdad_loans"]]) {
      const [rs] = await pool.query(`SELECT closing_id, COUNT(*) AS c, COALESCE(SUM(amount), 0) AS a FROM ${t} WHERE closed = 1 GROUP BY closing_id`);
      for (const r of rs) { const k = r.closing_id || 0; (cnt[k] = cnt[k] || {})[key] = { count: Number(r.c), amount: Number(r.a) }; }
    }
    const items = list.map((c, i) => ({ ...c, from: i ? J.nextDay(list[i - 1].closeDate) : null, to: c.closeDate,
      advances: (cnt[c.id] || {}).advances || { count: 0, amount: 0 }, emdad: (cnt[c.id] || {}).emdad || { count: 0, amount: 0 } })).reverse();
    const closedCount = Object.values(cnt).reduce((s, x) => s + ((x.advances || {}).count || 0) + ((x.emdad || {}).count || 0), 0);
    res.json({ items, closedCount });
  } catch (e) { fail(res, e); }
});
// GET /api/closings/advances/items?closingId=  — فهرست مساعده و امدادهای بسته‌شده (برای اکسل)؛ بدون closingId: همهٔ بسته‌شده‌ها
router.get("/advances/items", async (req, res) => {
  const cid = req.query.closingId ? parseInt(req.query.closingId, 10) : null;
  try {
    const list = await loadAdvClosings();
    const byId = new Map(list.map((c) => [c.id, c]));
    const out = [];
    const cond = cid ? "AND x.closing_id = ?" : "";
    const [adv] = await pool.query(`SELECT x.*, p.first_name, p.last_name, p.national_id, p.status AS person_status FROM advances x LEFT JOIN personnel p ON p.code = x.code WHERE x.closed = 1 ${cond} ORDER BY x.closing_id, CAST(x.code AS UNSIGNED), x.id`, cid ? [cid] : []);
    const [emd] = await pool.query(`SELECT x.*, p.first_name, p.last_name, p.national_id, p.status AS person_status FROM emdad_loans x LEFT JOIN personnel p ON p.code = x.code WHERE x.closed = 1 ${cond} ORDER BY x.closing_id, CAST(x.code AS UNSIGNED), x.id`, cid ? [cid] : []);
    const row = (kind, r) => {
      const c = byId.get(r.closing_id) || {};
      const amount = Number(r.amount), grant = Number(r.grant_amount || 0);
      return { kind, closingYm: c.year ? `${c.year}/${J.pad2(c.month)}` : "", closeDate: c.closeDate || "", applyYm: c.applyYear ? `${c.applyYear}/${J.pad2(c.applyMonth)}` : "",
        code: String(r.code), nationalId: r.national_id || "", firstName: r.first_name || "", lastName: r.last_name || "", personStatus: r.person_status || "",
        requestDate: r.request_date, paidDate: r.paid_date || "", amount, grantAmount: grant, repayAmount: amount - grant,
        installments: r.installments, installmentAmount: Number(r.installment_amount), account: r.account || "", owner: r.account_owner || "" };
    };
    for (const r of adv) out.push(row("مساعده", r));
    for (const r of emd) out.push(row("وام امداد", r));
    res.json({ closing: cid ? (byId.get(cid) || null) : null, items: out });
  } catch (e) { fail(res, e); }
});
// POST /api/closings/advances { year, month, closeDate, applyYear, applyMonth, note } — اگر برای آن ماه ثبت شده باشد، ویرایش می‌شود
router.post("/advances", async (req, res) => {
  const b = req.body || {};
  const year = parseInt(toLatinDigits(b.year), 10), month = parseInt(toLatinDigits(b.month), 10);
  const closeDate = toLatinDigits(b.closeDate || "").trim();
  if (!(year >= 1300 && year <= 1500) || !(month >= 1 && month <= 12)) return bad(res, "ماه یا سال نامعتبر است.");
  if (!J.parse(closeDate)) return bad(res, "تاریخ بستن را به‌صورت ۱۴۰۵/۰۷/۱۵ و معتبر وارد کنید.");
  const applyYear = b.applyYear == null || b.applyYear === "" ? year : parseInt(toLatinDigits(b.applyYear), 10);
  const applyMonth = b.applyMonth == null || b.applyMonth === "" ? month : parseInt(toLatinDigits(b.applyMonth), 10);
  if (!(applyYear >= 1300 && applyYear <= 1500) || !(applyMonth >= 1 && applyMonth <= 12)) return bad(res, "«اعمال در ماه حقوقی» را درست انتخاب کنید.");
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const list = await loadAdvClosings(conn);
    const me = idxOf(year, month);
    const before = [...list].reverse().find((c) => c.idx < me), after = list.find((c) => c.idx > me);
    if (before && closeDate <= before.closeDate) { await conn.rollback(); return bad(res, `تاریخ بستن باید بعد از تاریخ بستن ${before.year}/${J.pad2(before.month)} (${before.closeDate}) باشد.`); }
    if (after && closeDate >= after.closeDate) { await conn.rollback(); return bad(res, `تاریخ بستن باید قبل از تاریخ بستن ${after.year}/${J.pad2(after.month)} (${after.closeDate}) باشد.`); }
    const by = (req.user && (req.user.fullName || req.user.username)) || "";
    await conn.query(
      `INSERT INTO advance_closings (year, month, close_date, apply_year, apply_month, note, created_by) VALUES (?,?,?,?,?,?,?)
       ON DUPLICATE KEY UPDATE close_date = VALUES(close_date), apply_year = VALUES(apply_year), apply_month = VALUES(apply_month), note = VALUES(note), created_by = VALUES(created_by)`,
      [year, month, closeDate, applyYear, applyMonth, String(b.note || "").trim().slice(0, 255), by]);
    const r = await applyAidLocks(conn, await loadAdvClosings(conn));
    await conn.commit();
    res.json({ ok: true, closedAdvances: r.closed, reopenedAdvances: r.reopened });
  } catch (e) { await conn.rollback(); fail(res, e); } finally { conn.release(); }
});
router.delete("/advances/:id", async (req, res) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [d] = await conn.query("DELETE FROM advance_closings WHERE id = ?", [req.params.id]);
    if (!d.affectedRows) { await conn.rollback(); return bad(res, "مورد پیدا نشد.", 404); }
    const r = await applyAidLocks(conn, await loadAdvClosings(conn));
    await conn.commit();
    res.json({ ok: true, reopenedAdvances: r.reopened });
  } catch (e) { await conn.rollback(); fail(res, e); } finally { conn.release(); }
});

router.delete("/:id", async (req, res) => {
  try {
    const [r] = await pool.query("DELETE FROM payroll_closings WHERE id = ?", [req.params.id]);
    if (!r.affectedRows) return bad(res, "مورد پیدا نشد.", 404);
    res.json({ ok: true });
  } catch (e) { fail(res, e); }
});

module.exports = { router, loadClosings, withRanges };
