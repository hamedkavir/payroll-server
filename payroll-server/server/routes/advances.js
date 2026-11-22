// /api/advances — مساعده
// (از routes/extras.js نسخهٔ ۱۱۰ جدا شد؛ کد مسیرها بدون تغییر رفتار)
const express = require("express");
const { heirBlock } = require("../eligibility");
const pool = require("../db");
const { sqlNormExpr, likePattern, normalizeSearch } = require("../textNormalize");
const { ceilStep, loadRounding } = require("../rounding");
const { pageParams, limitSql, pageMeta } = require("../paging");
const { ACCOUNT_LEN, cleanAccount, isAccount13 } = require("../bankAccount");
const { fail, bad, num, str, strKeep, planInst, lastOf, DATE_RE } = require("./extrasCommon");

const advances = express.Router();
const CLOSED_MSG = "این مساعده در «بستن مساعده» بسته شده و قابل تغییر نیست.";
const advJSON = (r) => ({
  closed: !!r.closed,
  id: r.id, code: r.code, name: [r.first_name, r.last_name].filter(Boolean).join(" "),
  requestDate: r.request_date, amount: Number(r.amount), installments: r.installments,
  installmentAmount: Number(r.installment_amount), feePercent: Number(r.fee_percent),
  phone: r.phone, account: r.account, owner: r.account_owner || "", description: r.description, status: r.status, paidDate: r.paid_date || "",
  firstName: r.first_name || "", lastName: r.last_name || "", nationalId: r.national_id || "", createdBy: r.created_by || "",
  personStatus: r.person_status || "", lastInstallmentAmount: lastOf(Number(r.amount), Number(r.installment_amount), r.installments),
});
const ADV_SELECT = "SELECT a.*, p.first_name, p.last_name, p.national_id, p.status AS person_status FROM advances a LEFT JOIN personnel p ON p.code = a.code";

advances.get("/by-person/:code", async (req, res) => {
  try {
    const [rows] = await pool.query(`${ADV_SELECT} WHERE a.code = ?`, [req.params.code]);
    rows.sort((a, b) => b.id - a.id);
    res.json({ items: rows.map(advJSON) });
  } catch (e) { fail(res, e); }
});
// GET /api/advances?status=pending|paid|cancelled|all&from=1405/07/01&to=1405/07/30&q=
// تاریخ‌ها رشتهٔ yyyy/mm/dd هستند و مقایسهٔ رشته‌ای همان ترتیب تاریخ را می‌دهد.
advances.get("/", async (req, res) => {
  const where = [], vals = [];
  const st = String(req.query.status || "pending");
  if (st !== "all") { where.push("a.status = ?"); vals.push(st); }
  const from = String(req.query.from || "").trim(), to = String(req.query.to || "").trim();
  if (from) { if (!DATE_RE.test(from)) return bad(res, "تاریخ شروع نامعتبر است."); where.push("a.request_date >= ?"); vals.push(from); }
  if (to) { if (!DATE_RE.test(to)) return bad(res, "تاریخ پایان نامعتبر است."); where.push("a.request_date <= ?"); vals.push(to); }
  // فیلتر بر اساس تاریخ پرداخت (بین دو تاریخ؛ فقط مساعده‌های پرداخت‌شده تاریخ پرداخت دارند)
  const pFrom = String(req.query.paidFrom || "").trim(), pTo = String(req.query.paidTo || "").trim();
  if (pFrom) { if (!DATE_RE.test(pFrom)) return bad(res, "تاریخ شروع پرداخت نامعتبر است."); where.push("a.paid_date >= ?"); vals.push(pFrom); }
  if (pTo) { if (!DATE_RE.test(pTo)) return bad(res, "تاریخ پایان پرداخت نامعتبر است."); where.push("a.paid_date <= ?"); vals.push(pTo); }
  const q = String(req.query.q || "").trim();
  if (q && normalizeSearch(q)) {
    where.push(`(${sqlNormExpr("a.code")} LIKE ? OR ${sqlNormExpr("CONCAT(p.first_name, p.last_name)")} LIKE ?)`);
    const pat = likePattern(q); vals.push(pat, pat);
  }
  try {
    // صفحه‌بندی سمت سرور؛ جمع‌ها روی کل نتیجهٔ فیلترشده (نه فقط صفحهٔ جاری)
    const W = where.length ? "WHERE " + where.join(" AND ") : "";
    const pg = pageParams(req.query), [lim, limVals] = limitSql(pg);
    const [agg] = await pool.query(`SELECT a.amount, a.fee_percent FROM advances a LEFT JOIN personnel p ON p.code = a.code ${W}`, vals);
    const sums = { amount: 0, pay: 0 };
    for (const r of agg) { const am = Number(r.amount); sums.amount += am; sums.pay += Math.round(am * (1 - (Number(r.fee_percent) || 0) / 100)); }
    const [rows] = await pool.query(`${ADV_SELECT} ${W} ORDER BY a.request_date, a.id ${lim}`, [...vals, ...limVals]);
    res.json({ items: rows.map(advJSON), ...pageMeta(pg, agg.length), sums });
  } catch (e) { fail(res, e); }
});
// POST /api/advances/bulk-status { ids:[...], status: pending|paid|cancelled, paidDate }  -> تغییر وضعیت دسته‌جمعی (برای «پرداخت‌شده» تاریخ پرداخت لازم است؛ برای بقیه تاریخ پرداخت پاک می‌شود)
advances.post("/bulk-status", async (req, res) => {
  const ids = (Array.isArray((req.body || {}).ids) ? req.body.ids : []).map(Number).filter((n) => Number.isInteger(n) && n > 0);
  if (!ids.length) return bad(res, "موردی برای تغییر وضعیت انتخاب نشده است.");
  const status = String((req.body || {}).status || "");
  if (!["pending", "paid", "cancelled"].includes(status)) return bad(res, "وضعیت نامعتبر است.");
  let paidDate = null;
  if (status === "paid") { paidDate = str((req.body || {}).paidDate, 10); if (!DATE_RE.test(paidDate)) return bad(res, "تاریخ پرداخت را وارد کنید (مثلاً 1405/07/21)."); }
  try {
    const [r] = await pool.query(`UPDATE advances SET status = ?, paid_date = ? WHERE status <> ? AND closed = 0 AND id IN (${ids.map(() => "?").join(",")})`, [status, paidDate, status, ...ids]);
    res.json({ ok: true, changed: r.affectedRows });
  } catch (e) { fail(res, e); }
});
// POST /api/advances/bulk-paid { ids:[...], paidDate }  -> فقط مساعده‌های «در انتظار» به «پرداخت‌شده» می‌روند
advances.post("/bulk-paid", async (req, res) => {
  const ids = (Array.isArray((req.body || {}).ids) ? req.body.ids : []).map(Number).filter((n) => Number.isInteger(n) && n > 0);
  if (!ids.length) return bad(res, "موردی برای تغییر وضعیت انتخاب نشده است.");
  const paidDate = str((req.body || {}).paidDate, 10);
  if (!DATE_RE.test(paidDate)) return bad(res, "تاریخ پرداخت نامعتبر است.");
  try {
    const [r] = await pool.query(`UPDATE advances SET status = 'paid', paid_date = ? WHERE status = 'pending' AND id IN (${ids.map(() => "?").join(",")})`, [paidDate, ...ids]);
    res.json({ ok: true, changed: r.affectedRows });
  } catch (e) { fail(res, e); }
});
advances.post("/", async (req, res) => {
  const b = req.body || {};
  const code = str(b.code), rawAmount = Math.round(num(b.amount));
  const installments = Math.max(1, Math.min(24, parseInt(num(b.installments), 10) || 1));
  if (!code) return bad(res, "کد پرسنلی لازم است.");
  if (rawAmount <= 0) return bad(res, "مبلغ مساعده باید بیشتر از صفر باشد.");
  const date = str(b.requestDate, 10);
  if (!DATE_RE.test(date)) return bad(res, "تاریخ درخواست را به‌صورت ۱۴۰۵/۰۷/۰۷ وارد کنید.");
  try {
    const [p] = await pool.query("SELECT code, advance_account, advance_owner FROM personnel WHERE code = ?", [code]);
    if (!p.length) return bad(res, "این کد پرسنلی در کارگزینی نیست.", 404);
    { const hb = await heirBlock(pool, code); if (hb) return bad(res, hb, 409); }
    let account = String(p[0].advance_account || "").trim();
    if (b.account !== undefined && String(b.account).trim()) {   // حساب مساعده از همین صفحه وارد/اصلاح شده؛ در صفحهٔ پرسنلی هم به‌روز می‌شود
      const d = cleanAccount(b.account);
      if (!isAccount13(d)) return bad(res, `حساب مساعده باید دقیقاً ${ACCOUNT_LEN} رقم باشد (الان ${d.length} رقم است).`);
      if (d !== account) { await pool.query("UPDATE personnel SET advance_account = ? WHERE code = ?", [d, code]); account = d; }
    }
    if (!account) return bad(res, "حساب مساعده را وارد کنید (۱۳ رقم).");
    let owner = String(p[0].advance_owner || "").trim();
    if (b.owner !== undefined) {   // نام صاحب حساب هم از همین صفحه وارد/اصلاح می‌شود و در فرم پرسنلی به‌روز می‌شود
      const o = strKeep(b.owner, 100);
      if (o !== owner) { await pool.query("UPDATE personnel SET advance_owner = ? WHERE code = ?", [o, code]); owner = o; }
    }
    const [pend] = await pool.query("SELECT request_date, amount FROM advances WHERE code = ? AND status = 'pending' ORDER BY id DESC LIMIT 1", [code]);
    if (pend.length) return bad(res, `برای این فرد مساعده‌ای در انتظار پرداخت ثبت شده است (تاریخ ${pend[0].request_date}، مبلغ ${Number(pend[0].amount).toLocaleString("en-US")} ریال). تا پرداخت یا لغو آن، مساعدهٔ جدید ثبت نمی‌شود.`, 409);
    const rd = await loadRounding(pool);
    const amount = ceilStep(rawAmount, rd.roundAdvance);   // رند مبلغ مساعده طبق تنظیمات
    const instAmt = b.installmentAmount ? Math.round(num(b.installmentAmount)) : planInst(amount, installments, rd.roundAdvInst).inst;
    const [r] = await pool.query(
      `INSERT INTO advances (code, request_date, amount, installments, installment_amount, fee_percent, phone, account, account_owner, description, created_by)
       VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
      [code, date, amount, installments, instAmt, num(b.feePercent), str(b.phone, 30), account, owner, strKeep(b.description), (req.user && (req.user.fullName || req.user.username)) || ""]);
    res.json({ ok: true, id: r.insertId });
  } catch (e) { fail(res, e); }
});
// PATCH /api/advances/:id  {status, paidDate, amount, installments, installmentAmount, feePercent, phone, account, description, requestDate}
advances.patch("/:id", async (req, res) => {
  const b = req.body || {}, sets = [], vals = [];
  const put = (col, v) => { sets.push(`${col} = ?`); vals.push(v); };
  if (b.amount !== undefined) {
    const a = Math.round(num(b.amount)); if (a <= 0) return bad(res, "مبلغ نامعتبر است.");
    put("amount", ceilStep(a, (await loadRounding(pool)).roundAdvance));
  }
  if (b.installments !== undefined) put("installments", Math.max(1, Math.min(24, parseInt(num(b.installments), 10) || 1)));
  if (b.installmentAmount !== undefined) put("installment_amount", Math.round(num(b.installmentAmount)));
  if (b.feePercent !== undefined) put("fee_percent", num(b.feePercent));
  if (b.phone !== undefined) put("phone", str(b.phone, 30));
  if (b.description !== undefined) put("description", strKeep(b.description));
  let newOwner = null;
  if (b.owner !== undefined) { newOwner = strKeep(b.owner, 100); put("account_owner", newOwner); }
  let newAcc = "";
  if (b.account !== undefined && String(b.account).trim()) {
    newAcc = cleanAccount(b.account);
    if (!isAccount13(newAcc)) return bad(res, `حساب مساعده باید دقیقاً ${ACCOUNT_LEN} رقم باشد (الان ${newAcc.length} رقم است).`);
    put("account", newAcc);
  }
  if (b.requestDate !== undefined) {
    const d = str(b.requestDate, 10);
    if (!/^\d{4}\/\d{2}\/\d{2}$/.test(d)) return bad(res, "تاریخ نامعتبر است.");
    put("request_date", d);
  }
  if (b.status !== undefined) {
    if (!["pending", "paid", "cancelled"].includes(b.status)) return bad(res, "وضعیت نامعتبر است.");
    put("status", b.status);
    if (b.status === "paid") { const pd = str(b.paidDate, 10); if (!/^\d{4}\/\d{2}\/\d{2}$/.test(pd)) return bad(res, "تاریخ پرداخت را وارد کنید (مثلاً 1405/07/21)."); put("paid_date", pd); }
    else put("paid_date", null);   // بازگشت به «در انتظار پرداخت» یا لغو: تاریخ پرداخت پاک می‌شود
  }
  if (!sets.length) return bad(res, "چیزی برای ذخیره نیست.");
  try {
    const [r] = await pool.query(`UPDATE advances SET ${sets.join(", ")} WHERE id = ? AND closed = 0`, [...vals, req.params.id]);
    if (!r.affectedRows) {
      const [ex] = await pool.query("SELECT closed FROM advances WHERE id = ?", [req.params.id]);
      return ex && ex.length && ex[0].closed ? bad(res, CLOSED_MSG, 409) : bad(res, "مساعده پیدا نشد.", 404);
    }
    if (newAcc) await pool.query("UPDATE personnel SET advance_account = ? WHERE code = (SELECT code FROM advances WHERE id = ?)", [newAcc, req.params.id]);
    if (newOwner !== null) await pool.query("UPDATE personnel SET advance_owner = ? WHERE code = (SELECT code FROM advances WHERE id = ?)", [newOwner, req.params.id]);
    res.json({ ok: true });
  } catch (e) { fail(res, e); }
});

// حذف کامل یک مساعده (هر وضعیتی)
advances.delete("/:id", async (req, res) => {
  try {
    const [r] = await pool.query("DELETE FROM advances WHERE id = ? AND closed = 0", [req.params.id]);
    if (!r.affectedRows) {
      const [ex] = await pool.query("SELECT closed FROM advances WHERE id = ?", [req.params.id]);
      return ex && ex.length && ex[0].closed ? bad(res, CLOSED_MSG, 409) : bad(res, "مساعده پیدا نشد.", 404);
    }
    res.json({ ok: true });
  } catch (e) { fail(res, e); }
});

/* ------------------------------- انبارداری ------------------------------ */

module.exports = advances;
