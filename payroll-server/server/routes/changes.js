// تغییرات ماهانهٔ کسورات تعاون (ایجاد / اصلاح / حذف یک کد کسر برای فرد) + فهرست کدهای کسر
// هر ردیف تا «بسته شدن» (اعمال در حقوق ماه) قابل ویرایش است؛ ردیف بسته‌شده فقط با باز کردن دوباره قابل ویرایش می‌شود.
const express = require("express");
const { sendError, isBusinessError } = require("../errors");
const pool = require("../db");
const { toLatinDigits, sqlNormExpr, likePattern, normalizeSearch } = require("../textNormalize");
const { pageParams, limitSql, pageMeta } = require("../paging");

const fail = (res, err) => sendError(res, err);
const bad = (res, message, code = 400) => res.status(code).json({ error: code === 404 ? "not_found" : "invalid_input", message });
const num = (v) => { const n = Number(toLatinDigits(v).replace(/[,٬\s]/g, "")); return Number.isFinite(n) ? n : 0; };
const str = (v, max = 255) => toLatinDigits(v == null ? "" : String(v)).trim().slice(0, max);
const strKeep = (v, max = 255) => (v == null ? "" : String(v)).trim().slice(0, max);
const DATE_RE = /^\d{4}\/\d{2}\/\d{2}$/;
const optNum = (v) => (v === undefined || v === null || String(v).trim() === "" ? null : Math.round(num(v)));
const ACTIONS = { 1: "ایجاد", 2: "اصلاح", 3: "حذف" };

/* ---------------- کدهای کسر (فقط خواندنی؛ تعریف در صفحهٔ «تعریف کد کسر») ---------------- */
const codes = express.Router();
codes.get("/", async (req, res) => {
  try {
    const [rows] = await pool.query("SELECT code, name, emp_status FROM deduction_codes");
    rows.sort((a, b) => String(a.code).localeCompare(String(b.code), "en", { numeric: true }) || String(a.emp_status).localeCompare(String(b.emp_status)));
    res.json({ items: rows.map((r) => ({ code: r.code, name: r.name, empStatus: r.emp_status || "" })) });
  } catch (e) { fail(res, e); }
});

/* ---------------- تغییرات ---------------- */
const router = express.Router();
const SEL = "SELECT m.*, p.first_name, p.last_name, p.national_id, p.status AS person_status FROM monthly_changes m LEFT JOIN personnel p ON p.code = m.code";
const toJSON = (r) => ({
  id: r.id, code: r.code, firstName: r.first_name || "", lastName: r.last_name || "", nationalId: r.national_id || "",
  name: [r.first_name, r.last_name].filter(Boolean).join(" "), personStatus: r.person_status || "",
  changeDate: r.change_date, deductionCode: r.deduction_code, deductionName: r.deduction_name || "",
  loanRow: r.loan_row || "",
  totalAmount: r.total_amount == null ? null : Number(r.total_amount),
  installmentAmount: r.installment_amount == null ? null : Number(r.installment_amount),
  remaining: r.remaining == null ? null : Number(r.remaining),
  action: r.action, actionText: ACTIONS[r.action] || "", closed: !!r.closed, notes: r.notes || "", createdBy: r.created_by || "",
});

router.get("/by-person/:code", async (req, res) => {
  try {
    const [rows] = await pool.query(`${SEL} WHERE m.code = ?`, [str(req.params.code, 50)]);
    rows.sort((a, b) => b.change_date.localeCompare(a.change_date) || b.id - a.id);
    res.json({ items: rows.map(toJSON) });
  } catch (e) { fail(res, e); }
});

// GET /api/changes?from=&to=&closed=0|1|all&action=1|2|3&dcode=&q=
router.get("/", async (req, res) => {
  const where = [], vals = [];
  const from = String(req.query.from || "").trim(), to = String(req.query.to || "").trim();
  if (from) { if (!DATE_RE.test(from)) return bad(res, "تاریخ شروع نامعتبر است."); where.push("m.change_date >= ?"); vals.push(from); }
  if (to) { if (!DATE_RE.test(to)) return bad(res, "تاریخ پایان نامعتبر است."); where.push("m.change_date <= ?"); vals.push(to); }
  const closed = String(req.query.closed || "all");
  if (closed === "0" || closed === "1") { where.push("m.closed = ?"); vals.push(Number(closed)); }
  const action = parseInt(req.query.action, 10);
  if (action >= 1 && action <= 3) { where.push("m.action = ?"); vals.push(action); }
  const dcode = str(req.query.dcode, 20);
  if (dcode) { where.push("m.deduction_code = ?"); vals.push(dcode); }
  const q = String(req.query.q || "").trim();
  if (q && normalizeSearch(q)) {
    where.push(`(${sqlNormExpr("m.code")} LIKE ? OR ${sqlNormExpr("CONCAT(p.first_name, p.last_name)")} LIKE ?)`);
    const pat = likePattern(q); vals.push(pat, pat);
  }
  try {
    const W = where.length ? "WHERE " + where.join(" AND ") : "";
    const pg = pageParams(req.query), [lim, limVals] = limitSql(pg);
    const [agg] = await pool.query(`SELECT m.action, COUNT(*) AS c FROM monthly_changes m LEFT JOIN personnel p ON p.code = m.code ${W} GROUP BY m.action`, vals);
    const counts = { 1: 0, 2: 0, 3: 0 }; let total = 0;
    for (const r of agg) { counts[r.action] = Number(r.c); total += Number(r.c); }
    const [rows] = await pool.query(`${SEL} ${W} ORDER BY m.change_date, m.deduction_code, m.id ${lim}`, [...vals, ...limVals]);
    res.json({ items: rows.map(toJSON), ...pageMeta(pg, total), counts });
  } catch (e) { fail(res, e); }
});

// خواندن و اعتبارسنجی بدنه
function readBody(b, partial) {
  const o = {};
  if (!partial || b.changeDate !== undefined) { const d = str(b.changeDate, 10); if (!DATE_RE.test(d)) throw new Error("تاریخ را به‌صورت 1405/07/21 وارد کنید."); o.change_date = d; }
  if (!partial || b.deductionCode !== undefined) { const c = str(b.deductionCode, 20); if (!/^[A-Za-z0-9]{1,20}$/.test(c)) throw new Error("کد کسر را وارد کنید (فقط عدد/حرف)."); o.deduction_code = c; }
  if (b.deductionName !== undefined) o.deduction_name = strKeep(b.deductionName, 150);
  if (!partial || b.action !== undefined) { const a = parseInt(num(b.action), 10); if (![1, 2, 3].includes(a)) throw new Error("وضعیت باید ایجاد، اصلاح یا حذف باشد."); o.action = a; }
  if (b.loanRow !== undefined) o.loan_row = str(b.loanRow, 20);
  for (const [k, c] of [["totalAmount", "total_amount"], ["installmentAmount", "installment_amount"], ["remaining", "remaining"]]) {
    if (b[k] !== undefined) { const v = optNum(b[k]); if (v != null && v < 0) throw new Error("مبلغ نمی‌تواند منفی باشد."); o[c] = v; }
  }
  if (b.notes !== undefined) o.notes = strKeep(b.notes, 500);
  return o;
}
// کد کسرِ تازه (یا شرح تازه) در فهرست کدهای کسر ذخیره می‌شود تا دفعهٔ بعد خودکار پر شود
async function learnCode(conn, code, name) {
  if (!code || !name) return;
  await conn.query("INSERT IGNORE INTO deduction_codes (code, name, emp_status) SELECT ?, ?, '' FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM deduction_codes WHERE code = ?)", [code, name, code]);
}
async function fillName(conn, o) {
  if (o.deduction_code && !o.deduction_name) {
    const [r] = await conn.query("SELECT name FROM deduction_codes WHERE code = ? ORDER BY emp_status LIMIT 1", [o.deduction_code]);
    if (r.length) o.deduction_name = r[0].name;
  }
}

router.post("/", async (req, res) => {
  const b = req.body || {};
  const code = str(b.code, 50);
  if (!code) return bad(res, "کد پرسنلی لازم است.");
  try {
    const [p] = await pool.query("SELECT code FROM personnel WHERE code = ?", [code]);
    if (!p.length) return bad(res, "این کد پرسنلی در کارگزینی نیست.", 404);
    const o = readBody(b, false);
    await fillName(pool, o);
    if (o.action === 3) { o.total_amount = null; o.installment_amount = null; o.remaining = null; }   // حذف: مبلغی لازم نیست
    o.code = code; o.created_by = (req.user && (req.user.fullName || req.user.username)) || "";
    const cols = Object.keys(o);
    const [r] = await pool.query(`INSERT INTO monthly_changes (${cols.join(",")}) VALUES (${cols.map(() => "?").join(",")})`, cols.map((c) => o[c]));
    await learnCode(pool, o.deduction_code, o.deduction_name);
    res.json({ ok: true, id: r.insertId });
  } catch (e) { if (isBusinessError(e)) return bad(res, e.message); fail(res, e); }
});

router.patch("/:id", async (req, res) => {
  const b = req.body || {};
  try {
    const [[cur]] = await pool.query("SELECT closed FROM monthly_changes WHERE id = ?", [req.params.id]);
    if (!cur) return bad(res, "ردیف پیدا نشد.", 404);
    const o = readBody(b, true);
    const onlyClose = Object.keys(o).length === 0 && b.closed !== undefined;
    if (cur.closed && !onlyClose && !(b.closed !== undefined && !b.closed)) return bad(res, "این ردیف بسته شده است؛ ابتدا تیک «بسته شدن» را بردارید.", 409);
    await fillName(pool, o);
    if (o.action === 3) { o.total_amount = null; o.installment_amount = null; o.remaining = null; }
    if (b.closed !== undefined) o.closed = b.closed ? 1 : 0;
    const cols = Object.keys(o);
    if (!cols.length) return bad(res, "چیزی برای ذخیره نیست.");
    await pool.query(`UPDATE monthly_changes SET ${cols.map((c) => `${c} = ?`).join(", ")} WHERE id = ?`, [...cols.map((c) => o[c]), req.params.id]);
    await learnCode(pool, o.deduction_code, o.deduction_name);
    res.json({ ok: true });
  } catch (e) { if (isBusinessError(e)) return bad(res, e.message); fail(res, e); }
});

// POST /api/changes/bulk-close { ids:[...], closed:true|false }
router.post("/bulk-close", async (req, res) => {
  const ids = (Array.isArray((req.body || {}).ids) ? req.body.ids : []).map(Number).filter((n) => Number.isInteger(n) && n > 0);
  if (!ids.length) return bad(res, "موردی انتخاب نشده است.");
  try {
    const [r] = await pool.query(`UPDATE monthly_changes SET closed = ? WHERE id IN (${ids.map(() => "?").join(",")})`, [(req.body || {}).closed ? 1 : 0, ...ids]);
    res.json({ ok: true, changed: r.affectedRows });
  } catch (e) { fail(res, e); }
});

router.delete("/:id", async (req, res) => {
  try {
    const [r] = await pool.query("DELETE FROM monthly_changes WHERE id = ? AND closed = 0", [req.params.id]);
    if (!r.affectedRows) return bad(res, "ردیف پیدا نشد یا بسته شده است (ابتدا تیک «بسته شدن» را بردارید).", 404);
    res.json({ ok: true });
  } catch (e) { fail(res, e); }
});

module.exports = { router, codes };
