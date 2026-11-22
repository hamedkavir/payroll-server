// وام امداد: ثبت برای هر فرد، سوابق، فهرست همه (فیلتر تاریخ/وضعیت) و تغییر گروهی به «پرداخت‌شده»
// مبلغ وام «ناخالص» است؛ اگر «کسر کارمزد» فعال باشد مبلغ واریزی = مبلغ × (۱ − درصد کارمزد)
// «وام بلاعوض» بخشی از مبلغ وام است که بازپرداخت ندارد: مبلغ بازپرداخت = مبلغ وام − بلاعوض و قسط = (مبلغ وام − بلاعوض) ÷ تعداد اقساط (کارمزد هنوز روی کل مبلغ وام حساب می‌شود)
const express = require("express");
const { sendError, isBusinessError } = require("../errors");
const router = express.Router();
const pool = require("../db");
const { toLatinDigits, sqlNormExpr, likePattern, normalizeSearch } = require("../textNormalize");
const { ceilStep, loadRounding } = require("../rounding");
const { heirBlock } = require("../eligibility");
const { pageParams, limitSql, pageMeta } = require("../paging");

const fail = (res, err) => sendError(res, err);
const bad = (res, message, code = 400) => res.status(code).json({ error: code === 404 ? "not_found" : "invalid_input", message });
const num = (v) => { const n = Number(toLatinDigits(v).replace(/[,٬\s]/g, "")); return Number.isFinite(n) ? n : 0; };
const str = (v, max = 255) => toLatinDigits(v == null ? "" : String(v)).trim().slice(0, max);
const strKeep = (v, max = 255) => (v == null ? "" : String(v)).trim().slice(0, max);
const DATE_RE = /^\d{4}\/\d{2}\/\d{2}$/;
const TIME_RE = /^\d{1,2}:\d{2}$/;

const netOf = (amount, feeEnabled, feePercent) => Math.round(amount - (feeEnabled ? Math.round(amount * (Number(feePercent) || 0) / 100) : 0));
// قسط آخر (اگر قسط‌های رندشده زودتر وام را تمام کنند، تعداد مؤثر اقساط کمتر می‌شود) — نسخهٔ ۱۲۰: همان تابع مشترک server/installments.js
const { lastOf } = require("../installments");
const CLOSED_MSG = "این وام امداد در «بستن مساعده و امداد» بسته شده و قابل تغییر نیست.";
const SEL = "SELECT e.*, p.first_name, p.last_name, p.national_id, p.status AS person_status FROM emdad_loans e LEFT JOIN personnel p ON p.code = e.code";
const toJSON = (r) => ({
  id: r.id, code: r.code, firstName: r.first_name || "", lastName: r.last_name || "", nationalId: r.national_id || "",
  name: [r.first_name, r.last_name].filter(Boolean).join(" "), personStatus: r.person_status || "",
  requestDate: r.request_date, requestTime: r.request_time || "", amount: Number(r.amount),
  feeEnabled: !!r.fee_enabled, feePercent: Number(r.fee_percent), feeAmount: Math.round(Number(r.amount)) - netOf(Number(r.amount), !!r.fee_enabled, r.fee_percent),
  netAmount: netOf(Number(r.amount), !!r.fee_enabled, r.fee_percent),
  closed: !!r.closed, grantAmount: Number(r.grant_amount || 0), repayAmount: Math.round(Number(r.amount)) - Math.round(Number(r.grant_amount || 0)),
  installments: r.installments, installmentAmount: Number(r.installment_amount), lastInstallmentAmount: lastOf(Number(r.amount) - Number(r.grant_amount || 0), Number(r.installment_amount), r.installments),
  account: r.account || "", owner: r.account_owner || "", phone: r.phone || "", description: r.description || "", status: r.status, paidDate: r.paid_date || "", createdBy: r.created_by || "",
});

router.get("/by-person/:code", async (req, res) => {
  try {
    const [rows] = await pool.query(`${SEL} WHERE e.code = ?`, [toLatinDigits(req.params.code).trim()]);
    rows.sort((a, b) => b.request_date.localeCompare(a.request_date) || b.id - a.id);
    res.json({ items: rows.map(toJSON) });
  } catch (e) { fail(res, e); }
});

// GET /api/emdad?status=pending|paid|cancelled|all&from=&to=&q=
router.get("/", async (req, res) => {
  const where = [], vals = [];
  const st = String(req.query.status || "pending");
  if (st !== "all") { where.push("e.status = ?"); vals.push(st); }
  const from = String(req.query.from || "").trim(), to = String(req.query.to || "").trim();
  if (from) { if (!DATE_RE.test(from)) return bad(res, "تاریخ شروع نامعتبر است."); where.push("e.request_date >= ?"); vals.push(from); }
  if (to) { if (!DATE_RE.test(to)) return bad(res, "تاریخ پایان نامعتبر است."); where.push("e.request_date <= ?"); vals.push(to); }
  // فیلتر بر اساس تاریخ پرداخت (بین دو تاریخ)
  const pFrom = String(req.query.paidFrom || "").trim(), pTo = String(req.query.paidTo || "").trim();
  if (pFrom) { if (!DATE_RE.test(pFrom)) return bad(res, "تاریخ شروع پرداخت نامعتبر است."); where.push("e.paid_date >= ?"); vals.push(pFrom); }
  if (pTo) { if (!DATE_RE.test(pTo)) return bad(res, "تاریخ پایان پرداخت نامعتبر است."); where.push("e.paid_date <= ?"); vals.push(pTo); }
  const q = String(req.query.q || "").trim();
  if (q && normalizeSearch(q)) {
    where.push(`(${sqlNormExpr("e.code")} LIKE ? OR ${sqlNormExpr("CONCAT(p.first_name, p.last_name)")} LIKE ?)`);
    const pat = likePattern(q); vals.push(pat, pat);
  }
  try {
    const W = where.length ? "WHERE " + where.join(" AND ") : "";
    const pg = pageParams(req.query), [lim, limVals] = limitSql(pg);
    const [agg] = await pool.query(`SELECT e.amount, e.fee_enabled, e.fee_percent FROM emdad_loans e LEFT JOIN personnel p ON p.code = e.code ${W}`, vals);
    const sums = { amount: 0, net: 0 };
    for (const r of agg) { sums.amount += Number(r.amount); sums.net += netOf(Number(r.amount), !!r.fee_enabled, r.fee_percent); }
    const [rows] = await pool.query(`${SEL} ${W} ORDER BY e.request_date, e.id ${lim}`, [...vals, ...limVals]);
    res.json({ items: rows.map(toJSON), ...pageMeta(pg, agg.length), sums });
  } catch (e) { fail(res, e); }
});

// POST /api/emdad/bulk-status { ids:[...], status: pending|paid|cancelled, paidDate } — تغییر وضعیت دسته‌جمعی (برای «پرداخت‌شده» تاریخ پرداخت لازم است؛ برای بقیه تاریخ پرداخت پاک می‌شود)
router.post("/bulk-status", async (req, res) => {
  const ids = (Array.isArray((req.body || {}).ids) ? req.body.ids : []).map(Number).filter((n) => Number.isInteger(n) && n > 0);
  if (!ids.length) return bad(res, "موردی برای تغییر وضعیت انتخاب نشده است.");
  const status = String((req.body || {}).status || "");
  if (!["pending", "paid", "cancelled"].includes(status)) return bad(res, "وضعیت نامعتبر است.");
  let paidDate = null;
  if (status === "paid") { paidDate = str((req.body || {}).paidDate, 10); if (!DATE_RE.test(paidDate)) return bad(res, "تاریخ پرداخت را وارد کنید (مثلاً 1405/07/21)."); }
  try {
    const [r] = await pool.query(`UPDATE emdad_loans SET status = ?, paid_date = ? WHERE status <> ? AND closed = 0 AND id IN (${ids.map(() => "?").join(",")})`, [status, paidDate, status, ...ids]);
    res.json({ ok: true, changed: r.affectedRows });
  } catch (e) { fail(res, e); }
});

router.post("/bulk-paid", async (req, res) => {
  const ids = (Array.isArray((req.body || {}).ids) ? req.body.ids : []).map(Number).filter((n) => Number.isInteger(n) && n > 0);
  if (!ids.length) return bad(res, "موردی برای تغییر وضعیت انتخاب نشده است.");
  const paidDate = str((req.body || {}).paidDate, 10);
  if (!DATE_RE.test(paidDate)) return bad(res, "تاریخ پرداخت نامعتبر است.");
  try {
    const [r] = await pool.query(`UPDATE emdad_loans SET status = 'paid', paid_date = ? WHERE status = 'pending' AND id IN (${ids.map(() => "?").join(",")})`, [paidDate, ...ids]);
    res.json({ ok: true, changed: r.affectedRows });
  } catch (e) { fail(res, e); }
});

// فیلدهای مشترک ثبت/ویرایش؛ خطای ورودی با throw
function readBody(b, rd, partial) {
  const o = {};
  if (!partial || b.requestDate !== undefined) { const d = str(b.requestDate, 10); if (!DATE_RE.test(d)) throw new Error("تاریخ را به‌صورت 1405/07/07 وارد کنید."); o.request_date = d; }
  if (!partial || b.requestTime !== undefined) { const t = str(b.requestTime, 5); if (t && !TIME_RE.test(t)) throw new Error("ساعت را به‌صورت 09:30 وارد کنید."); o.request_time = t; }
  if (!partial || b.amount !== undefined) { const a = Math.round(num(b.amount)); if (a <= 0) throw new Error("مبلغ وام امداد باید بیشتر از صفر باشد."); o.amount = a; }
  if (!partial || b.grantAmount !== undefined) o.grant_amount = Math.max(0, Math.round(num(b.grantAmount)));
  if (o.amount !== undefined && (o.grant_amount || 0) >= o.amount) throw new Error("وام بلاعوض باید کمتر از مبلغ وام باشد.");
  if (!partial || b.installments !== undefined) o.installments = Math.max(1, Math.min(120, parseInt(num(b.installments), 10) || 1));
  if (b.feeEnabled !== undefined) o.fee_enabled = b.feeEnabled ? 1 : 0;
  if (b.feePercent !== undefined) { const f = num(b.feePercent); if (f < 0 || f > 100) throw new Error("درصد کارمزد نامعتبر است."); o.fee_percent = f; }
  if (b.installmentAmount !== undefined) o.installment_amount = Math.max(0, Math.round(num(b.installmentAmount)));
  if (b.account !== undefined) o.account = str(b.account, 50);
  if (b.owner !== undefined) o.account_owner = strKeep(b.owner, 100);   // نام صاحب حساب
  if (b.phone !== undefined) o.phone = str(b.phone, 30);
  if (b.description !== undefined) o.description = strKeep(b.description);
  return o;
}

router.post("/", async (req, res) => {
  const b = req.body || {};
  const code = str(b.code);
  if (!code) return bad(res, "کد پرسنلی لازم است.");
  try {
    const [p] = await pool.query("SELECT code, advance_account, advance_owner, bank_account FROM personnel WHERE code = ?", [code]);
    if (!p.length) return bad(res, "این کد پرسنلی در کارگزینی نیست.", 404);
    { const hb = await heirBlock(pool, code); if (hb) return bad(res, hb, 409); }
    const rd = await loadRounding(pool);
    const o = readBody(b, rd, false);
    if (o.account === undefined || !o.account) { o.account = String(p[0].advance_account || p[0].bank_account || "").trim(); if (o.account_owner === undefined && p[0].advance_account) o.account_owner = String(p[0].advance_owner || "").trim(); }
    if (!o.account) return bad(res, "شمارهٔ حساب را وارد کنید (یا در فرم پرسنلی ثبت کنید).");
    const [pend] = await pool.query("SELECT request_date, amount FROM emdad_loans WHERE code = ? AND status = 'pending' ORDER BY id DESC LIMIT 1", [code]);
    if (pend.length) return bad(res, `برای این فرد وام امداد در انتظار پرداخت ثبت شده است (تاریخ ${pend[0].request_date}، مبلغ ${Number(pend[0].amount).toLocaleString("en-US")} ریال). تا پرداخت یا لغو آن، وام امداد جدید ثبت نمی‌شود.`, 409);
    if (o.installment_amount === undefined || !o.installment_amount) o.installment_amount = ceilStep((o.amount - (o.grant_amount || 0)) / o.installments, rd.roundAdvInst);   // (مبلغ وام − بلاعوض) ÷ تعداد اقساط
    o.code = code; o.created_by = (req.user && (req.user.fullName || req.user.username)) || "";
    const cols = Object.keys(o);
    const [r] = await pool.query(`INSERT INTO emdad_loans (${cols.join(",")}) VALUES (${cols.map(() => "?").join(",")})`, cols.map((c) => o[c]));
    res.json({ ok: true, id: r.insertId });
  } catch (e) { if (isBusinessError(e)) return bad(res, e.message); fail(res, e); }
});

router.patch("/:id", async (req, res) => {
  const b = req.body || {};
  try {
    const o = readBody(b, null, true);
    if (b.status !== undefined) {
      if (!["pending", "paid", "cancelled"].includes(b.status)) return bad(res, "وضعیت نامعتبر است.");
      o.status = b.status;
      if (b.status === "paid") { const pd = str(b.paidDate, 10); if (!DATE_RE.test(pd)) return bad(res, "تاریخ پرداخت را وارد کنید (مثلاً 1405/07/21)."); o.paid_date = pd; }
      else o.paid_date = null;   // بازگشت به «در انتظار پرداخت» یا لغو: تاریخ پرداخت پاک می‌شود
    }
    const cols = Object.keys(o);
    if (!cols.length) return bad(res, "چیزی برای ذخیره نیست.");
    const [r] = await pool.query(`UPDATE emdad_loans SET ${cols.map((c) => `${c} = ?`).join(", ")} WHERE id = ? AND closed = 0`, [...cols.map((c) => o[c]), req.params.id]);
    if (!r.affectedRows) {
      const [ex] = await pool.query("SELECT closed FROM emdad_loans WHERE id = ?", [req.params.id]);
      return ex && ex.length && ex[0].closed ? bad(res, CLOSED_MSG, 409) : bad(res, "وام امداد پیدا نشد.", 404);
    }
    res.json({ ok: true });
  } catch (e) { if (isBusinessError(e)) return bad(res, e.message); fail(res, e); }
});

// حذف فقط برای وام‌های «پرداخت‌نشده»؛ وام پرداخت‌شده را «لغو» کنید تا سابقه بماند
router.delete("/:id", async (req, res) => {
  try {
    const [r] = await pool.query("DELETE FROM emdad_loans WHERE id = ? AND status <> 'paid' AND closed = 0", [req.params.id]);
    if (!r.affectedRows) return bad(res, "وام امداد پیدا نشد یا پرداخت‌شده/بسته است (پرداخت‌شده قابل حذف نیست).", 404);
    res.json({ ok: true });
  } catch (e) { fail(res, e); }
});

module.exports = router;
