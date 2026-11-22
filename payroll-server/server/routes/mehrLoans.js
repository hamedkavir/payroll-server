// وام بانک مهر: ثبت برای هر فرد (مشخصات وام و وام‌گیرنده، مشخصات ضامن، تاییدیه حسابداری)، سوابق، فهرست همه و خروجی اکسل.
// عمداً هیچ فرمول وام صندوق (سرمایه، نوبت، سقف، سهم صندوق) اینجا اعمال نمی‌شود؛ مبلغ، تعداد و قسط‌ها را کاربر وارد می‌کند.
const express = require("express");
const { sendError, isBusinessError } = require("../errors");
const router = express.Router();
const pool = require("../db");
const { toLatinDigits, sqlNormExpr, likePattern, normalizeSearch } = require("../textNormalize");
const { pageParams, limitSql, pageMeta } = require("../paging");

const fail = (res, err) => sendError(res, err);
const bad = (res, message, code = 400) => res.status(code).json({ error: code === 404 ? "not_found" : "invalid_input", message });
const num = (v) => { const n = Number(toLatinDigits(v).replace(/[,٬\s]/g, "")); return Number.isFinite(n) ? n : 0; };
const str = (v, max = 255) => toLatinDigits(v == null ? "" : String(v)).trim().slice(0, max);
const strKeep = (v, max = 255) => (v == null ? "" : String(v)).trim().slice(0, max);
const digits = (v, max = 30) => toLatinDigits(v == null ? "" : String(v)).replace(/\D/g, "").slice(0, max);
const DATE_RE = /^\d{4}\/\d{2}\/\d{2}$/;
const ACC_ST = ["pending", "approved", "rejected"];
const STATUSES = ["pending", "paid", "failed", "cancelled"];   // در نوبت، دریافت‌شده، دریافت‌نشده (با علت)، لغو
const TURN_EXPR = "COALESCE(NULLIF(m.turn_date, ''), m.request_date)";   // ماه شارژ: ماهِ تاریخ نوبت (اگر نبود تاریخ درخواست)
const YM_EXPR = `SUBSTRING(${TURN_EXPR}, 1, 7)`;
const YM_RE = /^\d{4}\/\d{2}$/;

const SEL = "SELECT m.*, p.first_name, p.last_name, p.national_id, p.status AS person_status, p.workplace AS person_workplace FROM mehr_loans m LEFT JOIN personnel p ON p.code = m.code";
const toJSON = (r) => ({
  id: r.id, code: r.code, firstName: r.first_name || "", lastName: r.last_name || "", nationalId: r.national_id || "",
  name: [r.first_name, r.last_name].filter(Boolean).join(" "), personStatus: r.person_status || "", workplace: r.person_workplace || "",
  requestDate: r.request_date, loanAmount: Number(r.loan_amount), installments: r.installments,
  installmentAmount: Number(r.installment_amount), lastInstallmentAmount: Number(r.last_installment_amount), feePercent: Number(r.fee_percent),
  mehrAccount: r.mehr_account || "", phone: r.phone || "",
  gName: r.g_name || "", gNationalId: r.g_national_id || "", gCode: r.g_code || "", gBirthDate: r.g_birth_date || "", gMobile: r.g_mobile || "", gWorkplace: r.g_workplace || "",
  accStatus: r.acc_status, accDate: r.acc_date || "", accBy: r.acc_by || "", accNote: r.acc_note || "",
  description: r.description || "", status: r.status, paidDate: r.received_date || r.paid_date || "", createdBy: r.created_by || "",
  turnDate: r.turn_date || "", receivedDate: r.received_date || r.paid_date || "", failReason: r.fail_reason || "",
});

router.get("/by-person/:code", async (req, res) => {
  try {
    const [rows] = await pool.query(`${SEL} WHERE m.code = ?`, [toLatinDigits(req.params.code).trim()]);
    rows.sort((a, b) => b.request_date.localeCompare(a.request_date) || b.id - a.id);
    res.json({ items: rows.map(toJSON) });
  } catch (e) { fail(res, e); }
});

// GET /api/mehr-loans?status=pending|paid|cancelled|all&acc=pending|approved|rejected|all&from=&to=&q=&page=&pageSize=&all=1
router.get("/", async (req, res) => {
  const where = [], vals = [];
  const st = String(req.query.status || "all");
  if (st !== "all") { if (!STATUSES.includes(st)) return bad(res, "وضعیت نامعتبر است."); where.push("m.status = ?"); vals.push(st); }
  const DCOLS = { turn: TURN_EXPR, received: "m.received_date", request: "m.request_date" };
  const byKey = typeof req.query.by === "string" ? req.query.by : "request";
  const dcol = Object.prototype.hasOwnProperty.call(DCOLS, byKey) ? DCOLS[byKey] : "m.request_date";   // نام ستون فقط از فهرست ثابت (کلیدهایی مثل constructor پذیرفته نمی‌شوند)
  const acc = String(req.query.acc || "all");
  if (acc !== "all") { if (!ACC_ST.includes(acc)) return bad(res, "وضعیت تاییدیه نامعتبر است."); where.push("m.acc_status = ?"); vals.push(acc); }
  const from = String(req.query.from || "").trim(), to = String(req.query.to || "").trim();
  if (from) { if (!DATE_RE.test(from)) return bad(res, "تاریخ شروع نامعتبر است."); where.push(`${dcol} >= ?`); vals.push(from); }
  if (to) { if (!DATE_RE.test(to)) return bad(res, "تاریخ پایان نامعتبر است."); where.push(`${dcol} <= ?`); vals.push(to); }
  const q = String(req.query.q || "").trim();
  if (q && normalizeSearch(q)) {
    where.push(`(${sqlNormExpr("m.code")} LIKE ? OR ${sqlNormExpr("CONCAT(p.first_name, p.last_name)")} LIKE ?)`);
    const pat = likePattern(q); vals.push(pat, pat);
  }
  try {
    const W = where.length ? "WHERE " + where.join(" AND ") : "";
    const pg = pageParams(req.query), [lim, limVals] = limitSql(pg);
    const [[agg]] = await pool.query(`SELECT COUNT(*) AS n, COALESCE(SUM(m.loan_amount), 0) AS amount FROM mehr_loans m LEFT JOIN personnel p ON p.code = m.code ${W}`, vals);
    const [rows] = await pool.query(`${SEL} ${W} ORDER BY m.request_date, m.id ${lim}`, [...vals, ...limVals]);
    res.json({ items: rows.map(toJSON), ...pageMeta(pg, Number(agg.n)), sums: { amount: Number(agg.amount) } });
  } catch (e) { fail(res, e); }
});

router.post("/bulk-paid", async (req, res) => {
  const ids = (Array.isArray((req.body || {}).ids) ? req.body.ids : []).map(Number).filter((n) => Number.isInteger(n) && n > 0);
  if (!ids.length) return bad(res, "موردی برای تغییر وضعیت انتخاب نشده است.");
  const paidDate = str((req.body || {}).paidDate, 10);
  if (!DATE_RE.test(paidDate)) return bad(res, "تاریخ پرداخت نامعتبر است.");
  try {
    const [r] = await pool.query(`UPDATE mehr_loans SET status = 'paid', paid_date = ?, received_date = ?, fail_reason = '' WHERE status = 'pending' AND id IN (${ids.map(() => "?").join(",")})`, [paidDate, paidDate, ...ids]);
    res.json({ ok: true, changed: r.affectedRows });
  } catch (e) { fail(res, e); }
});

// فیلدهای مشترک ثبت/ویرایش؛ خطای ورودی با throw
function readBody(b, partial) {
  const o = {};
  if (!partial || b.requestDate !== undefined) { const d = str(b.requestDate, 10); if (!DATE_RE.test(d)) throw new Error("تاریخ را به‌صورت 1405/07/07 وارد کنید."); o.request_date = d; }
  if (!partial || b.loanAmount !== undefined) { const a = Math.round(num(b.loanAmount)); if (a <= 0) throw new Error("مبلغ وام باید بیشتر از صفر باشد."); o.loan_amount = a; }
  if (!partial || b.installments !== undefined) o.installments = Math.max(1, Math.min(240, parseInt(num(b.installments), 10) || 1));
  if (b.installmentAmount !== undefined) o.installment_amount = Math.max(0, Math.round(num(b.installmentAmount)));
  if (b.lastInstallmentAmount !== undefined) o.last_installment_amount = Math.max(0, Math.round(num(b.lastInstallmentAmount)));
  if (b.feePercent !== undefined) o.fee_percent = Math.max(0, Math.min(100, Number(toLatinDigits(b.feePercent)) || 0));
  if (b.turnDate !== undefined) { const d = str(b.turnDate, 10); if (d && !YM_RE.test(d) && !DATE_RE.test(d)) throw new Error("نوبت را به‌صورت ماه و سال (مثلاً 1405/08) وارد کنید (یا خالی بگذارید)."); o.turn_date = d; }
  if (b.receivedDate !== undefined) { const d = str(b.receivedDate, 10); if (d && !DATE_RE.test(d)) throw new Error("تاریخ دریافت را به‌صورت 1405/08/20 وارد کنید (یا خالی بگذارید)."); o.received_date = d; o.paid_date = d || null; }
  if (b.mehrAccount !== undefined) o.mehr_account = digits(b.mehrAccount, 50);
  if (b.phone !== undefined) o.phone = str(b.phone, 30);
  if (b.gName !== undefined) o.g_name = strKeep(b.gName, 120);
  if (b.gNationalId !== undefined) o.g_national_id = digits(b.gNationalId, 20);
  if (b.gCode !== undefined) o.g_code = str(b.gCode, 50);
  if (b.gBirthDate !== undefined) { const d = str(b.gBirthDate, 10); if (d && !DATE_RE.test(d)) throw new Error("تاریخ تولد ضامن را به‌صورت 1370/05/20 وارد کنید (یا خالی بگذارید)."); o.g_birth_date = d; }
  if (b.gMobile !== undefined) o.g_mobile = digits(b.gMobile, 30);
  if (b.gWorkplace !== undefined) o.g_workplace = strKeep(b.gWorkplace, 150);
  if (b.accStatus !== undefined) { if (!ACC_ST.includes(b.accStatus)) throw new Error("وضعیت تاییدیهٔ حسابداری نامعتبر است."); o.acc_status = b.accStatus; }
  if (b.accDate !== undefined) { const d = str(b.accDate, 10); if (d && !DATE_RE.test(d)) throw new Error("تاریخ تاییدیهٔ حسابداری را به‌صورت 1405/07/07 وارد کنید (یا خالی بگذارید)."); o.acc_date = d; }
  if (b.accBy !== undefined) o.acc_by = strKeep(b.accBy, 100);
  if (b.accNote !== undefined) o.acc_note = strKeep(b.accNote);
  if (b.description !== undefined) o.description = strKeep(b.description);
  return o;
}
// روش محاسبهٔ کارمزد (مصوب ۱۳۸۸): هر سال ۱۱ ماه اصل و یک قسط (اول هر سال: قسط ۱، ۱۳، ۲۵ ...) فقط کارمزد است.
// تعداد اقساط کارمزد = ceil(n/12)، تعداد اقساط اصل = n - ceil(n/12)، مبلغ هر قسط اصل = کل وام ÷ تعداد اقساط اصل.
// (فرمول وام صندوق اینجا اعمال نمی‌شود.) مبلغ قسط یا قسط آخرِ خالی/صفر با همین روش پر می‌شود؛ مقدار دستی کاربر حفظ می‌شود.
const feeCount = (n) => Math.ceil(Math.max(1, n) / 12);
const principalCount = (n) => Math.max(1, n - feeCount(n));
function fillLast(o, base) {
  const total = o.loan_amount !== undefined ? o.loan_amount : base && base.loan_amount;
  const n = o.installments !== undefined ? o.installments : base && base.installments;
  let inst = o.installment_amount !== undefined ? o.installment_amount : base && base.installment_amount;
  const last = o.last_installment_amount !== undefined ? o.last_installment_amount : base && base.last_installment_amount;
  if (!(total > 0 && n > 0)) return;
  const pc = principalCount(n);
  if (!(Number(inst) > 0)) { inst = Math.round(total / pc); o.installment_amount = inst; }
  if (!(Number(last) > 0)) o.last_installment_amount = Math.max(0, Math.round(total - inst * (pc - 1)));
}

router.post("/", async (req, res) => {
  const b = req.body || {};
  const code = str(b.code);
  if (!code) return bad(res, "کد پرسنلی لازم است.");
  try {
    const [p] = await pool.query("SELECT code, mehr_account, mobile FROM personnel WHERE code = ?", [code]);
    if (!p.length) return bad(res, "این کد پرسنلی در کارگزینی نیست.", 404);
    const o = readBody(b, false);
    if (!o.mehr_account) o.mehr_account = digits(p[0].mehr_account, 50);
    if (!o.mehr_account) return bad(res, "شمارهٔ حساب بانک مهر را وارد کنید (یا در فرم پرسنلی ثبت کنید).");
    if (o.mehr_account !== digits(p[0].mehr_account, 50)) await pool.query("UPDATE personnel SET mehr_account = ? WHERE code = ?", [o.mehr_account, code]);   // در صفحهٔ پرسنلی هم به‌روز شود
    if (o.phone === undefined) o.phone = String(p[0].mobile || "");
    fillLast(o, null);
    o.code = code; o.created_by = (req.user && (req.user.fullName || req.user.username)) || "";
    const cols = Object.keys(o);
    const [r] = await pool.query(`INSERT INTO mehr_loans (${cols.join(",")}) VALUES (${cols.map(() => "?").join(",")})`, cols.map((c) => o[c]));
    res.json({ ok: true, id: r.insertId });
  } catch (e) { if (isBusinessError(e)) return bad(res, e.message); fail(res, e); }
});

router.patch("/:id", async (req, res) => {
  const b = req.body || {};
  try {
    const o = readBody(b, true);
    if (b.status !== undefined) {
      if (!STATUSES.includes(b.status)) return bad(res, "وضعیت نامعتبر است.");
      o.status = b.status;
      if (b.status === "paid") { const d = str(b.paidDate, 10) || str(b.receivedDate, 10); if (d && !DATE_RE.test(d)) return bad(res, "تاریخ دریافت نامعتبر است."); if (d) { o.paid_date = d; o.received_date = d; } o.fail_reason = ""; }
      else if (b.status === "failed") { const why = strKeep(b.failReason, 255); if (!why) return bad(res, "علت عدم دریافت را بنویسید."); o.fail_reason = why; o.paid_date = null; o.received_date = ""; }
      else { o.fail_reason = ""; o.paid_date = null; o.received_date = ""; }
    }
    if (o.loan_amount !== undefined || o.installments !== undefined || o.installment_amount !== undefined || o.last_installment_amount !== undefined) {   // فقط وقتی مبلغ/تعداد/قسط‌ها در درخواست آمده‌اند
      const [cur] = await pool.query("SELECT loan_amount, installments, installment_amount, last_installment_amount FROM mehr_loans WHERE id = ?", [req.params.id]);
      if (!cur.length) return bad(res, "وام بانک مهر پیدا نشد.", 404);
      fillLast(o, { loan_amount: Number(cur[0].loan_amount), installments: cur[0].installments, installment_amount: Number(cur[0].installment_amount), last_installment_amount: Number(cur[0].last_installment_amount) });
    }
    const cols = Object.keys(o);
    if (!cols.length) return bad(res, "چیزی برای ذخیره نیست.");
    const [r] = await pool.query(`UPDATE mehr_loans SET ${cols.map((c) => `${c} = ?`).join(", ")} WHERE id = ?`, [...cols.map((c) => o[c]), req.params.id]);
    if (!r.affectedRows) return bad(res, "وام بانک مهر پیدا نشد.", 404);
    if (o.mehr_account) await pool.query("UPDATE personnel SET mehr_account = ? WHERE code = (SELECT code FROM mehr_loans WHERE id = ?)", [o.mehr_account, req.params.id]);
    res.json({ ok: true });
  } catch (e) { if (isBusinessError(e)) return bad(res, e.message); fail(res, e); }
});

// ---------- شارژ ماهانهٔ بانک مهر: هر وام ثبت‌شده (در نوبت یا دریافت‌شده) از شارژ ماهِ تاریخ نوبتش کم می‌شود ----------
async function chargeOf(ym) {
  const [[c]] = await pool.query("SELECT amount FROM mehr_charges WHERE ym = ?", [ym]);
  const [[u]] = await pool.query(`SELECT COUNT(*) AS n, COALESCE(SUM(m.loan_amount), 0) AS s FROM mehr_loans m WHERE m.status IN ('pending','paid') AND ${YM_EXPR} = ?`, [ym]);
  const amount = c ? Number(c.amount) : 0, used = Number(u.s);
  return { ym, amount, used, count: Number(u.n), remaining: amount - used, set: !!c };
}
// جدول شارژ و مصرف ۱۲ ماههٔ یک سال
router.get("/charges/year", async (req, res) => {
  const y = digits(req.query.year, 4);
  if (y.length !== 4) return bad(res, "سال را چهار رقمی وارد کنید.");
  try {
    const [ch] = await pool.query("SELECT ym, amount FROM mehr_charges WHERE ym LIKE ?", [y + "/%"]);
    const [us] = await pool.query(`SELECT ${YM_EXPR} AS ym, COUNT(*) AS n, COALESCE(SUM(m.loan_amount), 0) AS s FROM mehr_loans m WHERE m.status IN ('pending','paid') AND ${YM_EXPR} LIKE ? GROUP BY ym`, [y + "/%"]);
    const cm = Object.fromEntries(ch.map((c) => [c.ym, Number(c.amount)])), um = Object.fromEntries(us.map((u) => [u.ym, { n: Number(u.n), s: Number(u.s) }]));
    const items = Array.from({ length: 12 }, (_, i) => {
      const ym = `${y}/${String(i + 1).padStart(2, "0")}`, set = cm[ym] !== undefined, amount = set ? cm[ym] : 0, used = (um[ym] || { s: 0 }).s;
      return { ym, month: i + 1, set, amount, used, count: (um[ym] || { n: 0 }).n, remaining: amount - used };
    });
    res.json({ year: Number(y), items });
  } catch (e) { fail(res, e); }
});
router.put("/charges/bulk", async (req, res) => {
  const list = Array.isArray((req.body || {}).items) ? req.body.items.slice(0, 24) : [];
  const rows = [];
  for (const it of list) {
    const ym = str(it && it.ym, 7), amount = Math.round(num(it && it.amount));
    if (!YM_RE.test(ym) || !(amount >= 0)) return bad(res, "ماه یا مبلغ شارژ نامعتبر است.");
    rows.push([ym, amount]);
  }
  if (!rows.length) return bad(res, "مبلغی برای ذخیره وارد نشده است.");
  try {
    await pool.query("INSERT INTO mehr_charges (ym, amount) VALUES ? ON DUPLICATE KEY UPDATE amount = VALUES(amount)", [rows]);
    res.json({ ok: true, saved: rows.length });
  } catch (e) { fail(res, e); }
});
router.get("/charges", async (req, res) => {
  const ym = str(req.query.ym, 7);
  if (!YM_RE.test(ym)) return bad(res, "ماه را به‌صورت 1405/08 وارد کنید.");
  try { res.json(await chargeOf(ym)); } catch (e) { fail(res, e); }
});
router.put("/charges", async (req, res) => {
  const ym = str((req.body || {}).ym, 7), amount = Math.round(num((req.body || {}).amount));
  if (!YM_RE.test(ym)) return bad(res, "ماه را به‌صورت 1405/08 وارد کنید.");
  if (!(amount >= 0)) return bad(res, "مبلغ شارژ نامعتبر است.");
  try {
    await pool.query("INSERT INTO mehr_charges (ym, amount) VALUES (?, ?) ON DUPLICATE KEY UPDATE amount = VALUES(amount)", [ym, amount]);
    res.json(await chargeOf(ym));
  } catch (e) { fail(res, e); }
});

// گزارش و نمودار: تعداد/مبلغ به تفکیک وضعیت (کل و ماهانه بر اساس تاریخ نوبت)، علل عدم دریافت، شارژ و باقی‌ماندهٔ هر ماه
router.get("/stats", async (req, res) => {
  const from = String(req.query.from || "").trim(), to = String(req.query.to || "").trim();
  const where = [], vals = [];
  if (from) { if (!DATE_RE.test(from)) return bad(res, "تاریخ شروع نامعتبر است."); where.push(`${TURN_EXPR} >= ?`); vals.push(from); }
  if (to) { if (!DATE_RE.test(to)) return bad(res, "تاریخ پایان نامعتبر است."); where.push(`${TURN_EXPR} <= ?`); vals.push(to); }
  const W = where.length ? "WHERE " + where.join(" AND ") : "";
  try {
    const [rows] = await pool.query(`SELECT ${YM_EXPR} AS ym, m.status, COUNT(*) AS n, COALESCE(SUM(m.loan_amount), 0) AS s FROM mehr_loans m ${W} GROUP BY ym, m.status ORDER BY ym`, vals);
    const totals = Object.fromEntries(STATUSES.map((s) => [s, { count: 0, amount: 0 }]));
    const byMonth = {};
    for (const r of rows) {
      totals[r.status].count += Number(r.n); totals[r.status].amount += Number(r.s);
      const m = byMonth[r.ym] || (byMonth[r.ym] = { ym: r.ym, ...Object.fromEntries(STATUSES.map((s) => [s, { count: 0, amount: 0 }])) });
      m[r.status] = { count: Number(r.n), amount: Number(r.s) };
    }
    const [ch] = await pool.query("SELECT ym, amount FROM mehr_charges");
    const chMap = Object.fromEntries(ch.map((c) => [c.ym, Number(c.amount)]));
    const months = Object.values(byMonth).sort((a, b) => a.ym.localeCompare(b.ym)).map((m) => {
      const used = m.pending.amount + m.paid.amount, charge = chMap[m.ym] != null ? chMap[m.ym] : null;
      return { ...m, used, charge, remaining: charge == null ? null : charge - used };
    });
    const [reasons] = await pool.query(`SELECT m.fail_reason AS reason, COUNT(*) AS n FROM mehr_loans m ${W ? W + " AND" : "WHERE"} m.status = 'failed' GROUP BY m.fail_reason ORDER BY n DESC LIMIT 20`, vals);
    res.json({ totals, months, reasons: reasons.map((r) => ({ reason: r.reason || "(بدون علت)", count: Number(r.n) })) });
  } catch (e) { fail(res, e); }
});

// ثبت دریافت / عدم دریافت با کد پرسنلی یا کد ملی: ابتدا /find برای دیدن فرد و وام‌های «در نوبت»، سپس /receive
async function findPerson(q) {
  const x = toLatinDigits(q).trim();
  if (!x) return null;
  const [p] = await pool.query("SELECT code, first_name, last_name, national_id FROM personnel WHERE code = ? OR national_id = ? OR national_id = ? LIMIT 1", [x, x, x.padStart(10, "0")]);
  return p[0] || null;
}
router.get("/find", async (req, res) => {
  try {
    const p = await findPerson(req.query.query);
    if (!p) return res.json({ person: null, loans: [] });
    const [rows] = await pool.query(`${SEL} WHERE m.code = ? AND m.status = 'pending' ORDER BY m.request_date, m.id`, [p.code]);
    res.json({ person: { code: p.code, name: [p.first_name, p.last_name].filter(Boolean).join(" "), nationalId: p.national_id || "" }, loans: rows.map(toJSON) });
  } catch (e) { fail(res, e); }
});
class RErr extends Error { constructor(m, c = 400) { super(m); this.status = c; } }
// ثبت دریافت/عدم دریافت یک نفر (مشترک بین ثبت تکی و فایل اکسل)
async function applyReceive({ query, outcome, date, reason, loanId, pickFirst }) {
  if (outcome === "paid" && !DATE_RE.test(date)) throw new RErr("تاریخ دریافت را به‌صورت 1405/08/20 وارد کنید.");
  if (outcome === "failed" && !reason) throw new RErr("علت عدم دریافت را بنویسید.");
  const p = await findPerson(query);
  if (!p) throw new RErr("فردی با این کد پرسنلی/کد ملی پیدا نشد.", 404);
  const [loans] = await pool.query("SELECT id FROM mehr_loans WHERE code = ? AND status = 'pending' ORDER BY request_date, id", [p.code]);
  if (!loans.length) throw new RErr("برای این فرد وام بانک مهرِ «در نوبت» ثبت نشده است.", 404);
  const id = Number(loanId) || (loans.length === 1 || pickFirst ? loans[0].id : 0);
  if (!id || !loans.some((l) => l.id === id)) throw new RErr("این فرد چند وام در نوبت دارد؛ یکی را انتخاب کنید.");
  if (outcome === "paid") await pool.query("UPDATE mehr_loans SET status = 'paid', paid_date = ?, received_date = ?, fail_reason = '' WHERE id = ?", [date, date, id]);
  else await pool.query("UPDATE mehr_loans SET status = 'failed', paid_date = NULL, received_date = '', fail_reason = ? WHERE id = ?", [reason, id]);
  return { code: p.code, name: [p.first_name, p.last_name].filter(Boolean).join(" "), outcome, multi: loans.length > 1 };
}
router.post("/receive", async (req, res) => {
  const b = req.body || {};
  try {
    const r = await applyReceive({ query: b.query, outcome: b.outcome === "failed" ? "failed" : "paid", date: str(b.date, 10), reason: strKeep(b.reason, 255), loanId: b.loanId });
    res.json({ ok: true, code: r.code, name: r.name, outcome: r.outcome });
  } catch (e) { if (e instanceof RErr) return bad(res, e.message, e.status); fail(res, e); }
});
// ثبت گروهی از فایل اکسل: هر ردیف {query: کد پرسنلی یا کد ملی, date, reason}؛ علت پر = عدم دریافت، وگرنه تاریخ پر = دریافت
router.post("/receive-bulk", async (req, res) => {
  const rows = Array.isArray((req.body || {}).rows) ? req.body.rows.slice(0, 2000) : [];
  if (!rows.length) return bad(res, "ردیفی برای ثبت نیست.");
  const results = [];
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i] || {}, reason = strKeep(r.reason, 255), date = str(r.date, 10), outcome = reason ? "failed" : "paid";
    try {
      const x = await applyReceive({ query: r.query, outcome, date, reason, pickFirst: true });
      results.push({ row: r.row || i + 1, query: String(r.query || ""), ok: true, name: x.name, code: x.code, outcome, note: x.multi ? "چند وام در نوبت داشت؛ قدیمی‌ترین ثبت شد" : "" });
    } catch (e) {
      if (!(e instanceof RErr)) return fail(res, e);
      results.push({ row: r.row || i + 1, query: String(r.query || ""), ok: false, error: isBusinessError(e) ? e.message : "خطا در ثبت این ردیف" });
    }
  }
  res.json({ ok: true, done: results.filter((x) => x.ok).length, failed: results.filter((x) => !x.ok).length, results });
});

// حذف وام (هر وضعیتی)؛ اگر فقط می‌خواهید از شمارش خارج شود «لغو» کنید تا سابقه بماند
router.delete("/:id", async (req, res) => {
  try {
    const [r] = await pool.query("DELETE FROM mehr_loans WHERE id = ?", [req.params.id]);
    if (!r.affectedRows) return bad(res, "وام بانک مهر پیدا نشد.", 404);
    res.json({ ok: true });
  } catch (e) { fail(res, e); }
});

module.exports = router;
