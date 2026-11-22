const express = require("express");
const { sendError, isBusinessError } = require("../errors");
const { heirBlock } = require("../eligibility");
const { personPayroll } = require("../personPayroll");
const router = express.Router();
const pool = require("../db");
const { loadKeyCodes, kcFor } = require("../keyCodes");
const { pendingCapital } = require("../capitalEffective");
const { insertChange } = require("../monthlyChange");   // کدهای مهم (وام، سرمایه، مساعده) از تنظیمات
const { computeFigures, loadLoanParams, roundUpToStep, addMonths } = require("../loanQueueSync");
const { sqlNormExpr, likePattern, normalizeSearch, toLatinDigits } = require("../textNormalize");
const J = require("../jalali");

const SELECT_BASE = `
  SELECT lq.*, p.first_name, p.last_name, p.status AS person_status, p.national_id
  FROM loan_queue lq
  LEFT JOIN personnel p ON p.code = lq.code
`;

// مشخصات ضامن (اختیاری): ستون ← مقدار پاک‌سازی‌شده
const G_FIELDS = [["gCode", "g_code", 50, false], ["gName", "g_name", 120, true], ["gNationalId", "g_national_id", 20, false], ["gBirthDate", "g_birth_date", 10, false], ["gMobile", "g_mobile", 30, false], ["gWorkplace", "g_workplace", 150, true]];
function guarantorOf(b) {
  const o = {};
  for (const [k, col, max, keep] of G_FIELDS) if (b[k] !== undefined) {
    const raw = b[k] == null ? "" : String(b[k]).trim();
    o[col] = (keep ? raw : (col === "g_national_id" || col === "g_mobile" ? toLatinDigits(raw).replace(/\D/g, "") : toLatinDigits(raw))).slice(0, max);
  }
  return o;
}
function toJSON(row) {
  return {
    id: row.id,
    code: row.code,
    name: [row.first_name, row.last_name].filter(Boolean).join(" "),
    registrationYear: row.registration_year,
    registrationMonth: row.registration_month,
    dueYear: row.due_year,
    dueMonth: row.due_month,
    capital: Number(row.capital_amount),
    loanAmount: Number(row.loan_amount),
    installmentMonths: row.installment_months,
    installmentAmount: Number(row.installment_amount),
    status: row.status,
    loanNumber: row.loan_number || "",
    requestDate: row.request_date || "",
    notes: row.notes || "",
    gCode: row.g_code || "", gName: row.g_name || "", gNationalId: row.g_national_id || "", gBirthDate: row.g_birth_date || "", gMobile: row.g_mobile || "", gWorkplace: row.g_workplace || "",
    source: row.source || "auto",
    personStatus: row.person_status || "",
    nationalId: row.national_id || "",
    instStartYear: row.inst_start_year || null,
    instStartMonth: row.inst_start_month || null,
    instEndYear: row.inst_end_year || null,
    instEndMonth: row.inst_end_month || null,
    instLoanPaid: row.inst_loan_paid == null ? null : Number(row.inst_loan_paid),
    instCurrentAmount: row.inst_current_amount == null ? null : Number(row.inst_current_amount),
  };
}
const byName = (a, b) => (a.name || "").localeCompare(b.name || "", "fa");
const byDue = (a, b) => a.dueYear - b.dueYear || a.dueMonth - b.dueMonth || byName(a, b);

// GET /api/loan-queue?status=pending&q=&page=1&pageSize=50
router.get("/", async (req, res) => {
  const { status, q } = req.query;
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const pageSize = Math.min(200, Math.max(1, parseInt(req.query.pageSize, 10) || 50));
  const where = [], vals = [];
  if (status) { where.push("lq.status = ?"); vals.push(status); }
  if (q && normalizeSearch(q)) {
    where.push(`(${sqlNormExpr("lq.code")} LIKE ? OR ${sqlNormExpr("CONCAT(p.first_name, p.last_name)")} LIKE ? OR ${sqlNormExpr("CONCAT(p.last_name, p.first_name)")} LIKE ?)`);
    const pat = likePattern(q);
    vals.push(pat, pat, pat);
  }
  const whereSql = where.length ? "WHERE " + where.join(" AND ") : "";
  try {
    const [[{ total }]] = await pool.query(
      `SELECT COUNT(*) AS total FROM loan_queue lq LEFT JOIN personnel p ON p.code = lq.code ${whereSql}`, vals);
    const [rows] = await pool.query(
      `${SELECT_BASE} ${whereSql} ORDER BY lq.due_year, lq.due_month, lq.id LIMIT ? OFFSET ?`,
      [...vals, pageSize, (page - 1) * pageSize]);
    res.json({ total, page, pageSize, items: rows.map(toJSON) });
  } catch (err) {
    sendError(res, err);
  }
});

// GET /api/loan-queue/report?year=1406&month=7
// نوبتِ همین ماه + عقب‌افتاده‌ها. عمداً ORDER BY در SQL ندارد (مرتب‌سازی در Node انجام می‌شود)
// تا روی سرورهایی که sort buffer کوچک دارند خطای «Out of sort memory» ندهد.
router.get("/report", async (req, res) => {
  const year = parseInt(req.query.year, 10);
  const month = parseInt(req.query.month, 10);
  if (!year || !month || month < 1 || month > 12) {
    return res.status(400).json({ error: "invalid_input", message: "سال و ماه معتبر لازم است." });
  }
  try {
    const [dueRows] = await pool.query(
      `${SELECT_BASE} WHERE lq.status='pending' AND lq.due_year=? AND lq.due_month=?`, [year, month]);
    const [overRows] = await pool.query(
      `${SELECT_BASE} WHERE lq.status='pending' AND (lq.due_year < ? OR (lq.due_year = ? AND lq.due_month < ?))`,
      [year, year, month]);
    res.json({
      year, month,
      dueThisMonth: dueRows.map(toJSON).sort(byName),
      overdue: overRows.map(toJSON).sort(byDue),
    });
  } catch (err) {
    sendError(res, err);
  }
});

// ---------------------------------------------------------------------------
// انتقال نوبت‌های وام بین دو سیستم: خروجی (اکسل) و ورودی
// کلید تطبیق هر نوبت: کد پرسنلی + سال و ماهِ ثبت نوبت. شناسهٔ دورهٔ حقوقی منتقل نمی‌شود (در هر سیستم فرق دارد)؛
// هنگام ورود، اگر دورهٔ همان سال/ماه در این سیستم باشد به آن وصل می‌شود، وگرنه بدون دوره ثبت می‌شود.
// ---------------------------------------------------------------------------
const EXPORT_COLS = [
  "id", "code", "nationalId", "name", "registrationYear", "registrationMonth", "dueYear", "dueMonth", "capital", "loanAmount",
  "installmentMonths", "installmentAmount", "status", "receivedAt", "loanNumber", "requestDate", "notes", "source",
  "instStartYear", "instStartMonth", "instEndYear", "instEndMonth", "instCurrentAmount", "instSeenYm", "instLoanPaid",
  "gCode", "gName", "gNationalId", "gBirthDate", "gMobile", "gWorkplace",
];
// GET /api/loan-queue/export?status=all|pending|received|cancelled -> همهٔ نوبت‌ها با همهٔ ستون‌های لازم برای انتقال
router.get("/export", async (req, res) => {
  try {
    const st = String(req.query.status || "all");
    const where = ["pending", "received", "cancelled"].includes(st) ? "WHERE lq.status = ?" : "";
    const [rows] = await pool.query(`${SELECT_BASE} ${where} ORDER BY lq.id`, where ? [st] : []);
    const items = rows.map((r) => ({
      ...toJSON(r), receivedAt: r.received_at ? new Date(r.received_at).toISOString() : "", instSeenYm: r.inst_seen_ym == null ? null : Number(r.inst_seen_ym),
    }));
    res.json({ columns: EXPORT_COLS, count: items.length, items });
  } catch (err) { sendError(res, err); }
});

const iN = (v) => { const n = parseInt(toLatinDigits(v == null ? "" : String(v)).replace(/[,٬\s]/g, ""), 10); return Number.isFinite(n) ? n : null; };
const sN = (v, max) => (v == null ? "" : String(v)).trim().slice(0, max);
// POST /api/loan-queue/import { mode: "add"|"update"|"replace", dryRun: bool, items: [...] }
//  add     = فقط نوبت‌های جدید اضافه شود (موجودها دست نمی‌خورند)
//  update  = جدیدها اضافه و موجودها (هم‌کلید) با مقدار فایل به‌روز شوند
//  replace = ابتدا همهٔ نوبت‌های فعلی حذف و سپس نوبت‌های فایل ثبت شود
// dryRun=true فقط گزارش می‌دهد و چیزی نمی‌نویسد (همه‌چیز در تراکنش انجام و برگردانده می‌شود).
router.post("/import", async (req, res) => {
  const b = req.body || {};
  const mode = ["add", "update", "replace"].includes(b.mode) ? b.mode : "add";
  const dry = !!b.dryRun;
  const items = Array.isArray(b.items) ? b.items : [];
  if (!items.length) return res.status(400).json({ error: "invalid_input", message: "فایل ورودی هیچ نوبتی ندارد." });
  if (items.length > 50000) return res.status(400).json({ error: "invalid_input", message: "تعداد ردیف‌ها بیش از حد مجاز است." });
  const conn = await pool.getConnection();
  const out = { mode, dryRun: dry, added: 0, updated: 0, unchanged: 0, skipped: [], deleted: 0 };
  try {
    await conn.beginTransaction();
    const [pers] = await conn.query("SELECT code FROM personnel");
    const known = new Set(pers.map((r) => String(r.code)));
    const [per] = await conn.query("SELECT id, year, month FROM periods");
    const periodOf = new Map(per.map((r) => [Number(r.year) * 100 + Number(r.month), r.id]));
    if (mode === "replace") { const [d] = await conn.query("DELETE FROM loan_queue"); out.deleted = d.affectedRows; }
    const [cur] = await conn.query("SELECT * FROM loan_queue");
    const idx = new Map(cur.map((r) => [`${r.code}|${r.registration_year}|${r.registration_month}`, r]));
    const hasPend = new Set(cur.filter((r) => r.status === "pending").map((r) => String(r.code)));
    const seen = new Set();
    let rowNo = 0;
    for (const it of items) {
      rowNo++;
      const skip = (why) => out.skipped.push({ row: rowNo, code: String((it && it.code) || ""), reason: why });
      const code = sN(toLatinDigits(it && it.code != null ? String(it.code) : ""), 50);
      const ry = iN(it.registrationYear), rm = iN(it.registrationMonth), dy = iN(it.dueYear), dm = iN(it.dueMonth);
      const status = ["pending", "received", "cancelled"].includes(String(it.status)) ? String(it.status) : null;
      if (!code) { skip("کد پرسنلی خالی است"); continue; }
      if (!known.has(code)) { skip("این کد پرسنلی در این سیستم نیست"); continue; }
      if (!ry || !rm || rm < 1 || rm > 12 || !dy || !dm || dm < 1 || dm > 12) { skip("سال/ماه ثبت یا نوبت نامعتبر است"); continue; }
      if (!status) { skip("وضعیت نامعتبر است"); continue; }
      const key = `${code}|${ry}|${rm}`;
      if (seen.has(key)) { skip("ردیف تکراری در فایل (همان فرد و ماه ثبت)"); continue; }
      seen.add(key);
      const vals = {
        registration_year: ry, registration_month: rm, due_year: dy, due_month: dm,
        capital_amount: iN(it.capital) || 0, loan_amount: iN(it.loanAmount) || 0, installment_months: Math.max(1, Math.min(120, iN(it.installmentMonths) || 36)),
        installment_amount: iN(it.installmentAmount) || 0, status,
        loan_number: sN(it.loanNumber, 20) || null, request_date: sN(toLatinDigits(it.requestDate || ""), 10) || null, notes: sN(it.notes, 500) || null,
        source: it.source === "manual" ? "manual" : "auto",
        inst_start_year: iN(it.instStartYear), inst_start_month: iN(it.instStartMonth), inst_end_year: iN(it.instEndYear), inst_end_month: iN(it.instEndMonth),
        inst_current_amount: iN(it.instCurrentAmount), inst_seen_ym: iN(it.instSeenYm), inst_loan_paid: iN(it.instLoanPaid),
        g_code: sN(it.gCode, 50) || null, g_name: sN(it.gName, 120) || null, g_national_id: sN(it.gNationalId, 20) || null,
        g_birth_date: sN(it.gBirthDate, 10) || null, g_mobile: sN(it.gMobile, 30) || null, g_workplace: sN(it.gWorkplace, 150) || null,
      };
      const ex = idx.get(key);
      if (ex) {
        if (mode === "add") { out.unchanged++; continue; }
        const changed = Object.keys(vals).filter((k) => String(ex[k] == null ? "" : ex[k]) !== String(vals[k] == null ? "" : vals[k]));
        if (!changed.length) { out.unchanged++; continue; }
        if (vals.status === "pending" && ex.status !== "pending" && hasPend.has(code)) { skip("این فرد نوبت «در انتظار» دیگری دارد"); continue; }
        await conn.query(`UPDATE loan_queue SET ${changed.map((k) => `${k} = ?`).join(", ")} WHERE id = ?`, [...changed.map((k) => vals[k]), ex.id]);
        if (vals.status === "pending") hasPend.add(code); else if (ex.status === "pending") hasPend.delete(code);
        out.updated++;
        continue;
      }
      if (status === "pending" && hasPend.has(code)) { skip("این فرد نوبت «در انتظار» دیگری دارد"); continue; }
      const cols = Object.keys(vals);
      try {
        await conn.query(
          `INSERT INTO loan_queue (code, registration_period_id, ${cols.join(", ")}, received_at) VALUES (?, ?, ${cols.map(() => "?").join(", ")}, ?)`,
          [code, periodOf.get(ry * 100 + rm) || null, ...cols.map((k) => vals[k]), status === "received" && it.receivedAt && !isNaN(new Date(it.receivedAt)) ? new Date(it.receivedAt) : null]);
        if (status === "pending") hasPend.add(code);
        out.added++;
      } catch (e) { { if (e.code !== "ER_DUP_ENTRY") console.error("[خطا] ورود نوبت", e); skip(e.code === "ER_DUP_ENTRY" ? "نوبت مشابهی از قبل هست" : "خطا در ثبت این ردیف"); } }
    }
    if (dry) await conn.rollback(); else await conn.commit();
    res.json({ ok: true, ...out });
  } catch (err) {
    await conn.rollback();
    sendError(res, err);
  } finally { conn.release(); }
});

// آخرین فیش فرد → «مانده» کد ۷۹۶ (سرمایهٔ صندوق وام ضروری) و «مانده» کد ۷۱۰ (وام ضروری)
async function fundSnapshot(code) {
  const [r] = await personPayroll(pool, code, 1);
  if (!r) return null;
  let data = r.data;
  if (typeof data === "string") { try { data = JSON.parse(data); } catch (e) { data = {}; } }
  const kc = kcFor(await loadKeyCodes(pool), r.kind);   // کد شاغل یا بازنشسته
  const items = r.kind === "active" ? (r.loans || []) : ((data && data.items) || []);
  const it = items.find((x) => String(x.code) === kc.capital);
  const loanItems = items.filter((x) => String(x.code) === kc.loan1);
  const loanRemaining = loanItems.reduce((s, x) => s + Math.max(0, Math.round(Number(x.remaining) || 0)), 0);
  const pend = await pendingCapital(pool, code, r.year * 12 + r.month);   // افزایش سرمایهٔ ثبت‌شده که هنوز در فیش نیامده
  return { capital: pend ? pend.newCapital : (it ? Math.round(Number(it.remaining) || 0) : 0), pending: !!pend, member: !!it, loanRemaining, hasLoan: loanItems.length > 0, year: r.year, month: r.month, codes: kc };
}

// GET /api/loan-queue/capital/:code -> آخرین «مانده» کد ۷۹۶ (سرمایهٔ صندوق وام ضروری) در آخرین فیش حقوقی فرد
router.get("/capital/:code", async (req, res) => {
  const code = toLatinDigits(req.params.code).trim();
  try {
    const f = await fundSnapshot(code);
    if (!f) return res.json({ capital: null });
    res.json({ capital: f.capital, pending: f.pending, member: f.member, year: f.year, month: f.month });
  } catch (err) { sendError(res, err); }
});

// GET /api/loan-queue/slip-codes/:code -> اطلاعات کدهای ۷۱۰ (وام ضروری) و ۷۳۳ (مساعده) در آخرین فیش فرد: کل (مبلغ وام)، قسط، مانده
router.get("/slip-codes/:code", async (req, res) => {
  const code = toLatinDigits(req.params.code).trim();
  try {
    const [r] = await personPayroll(pool, code, 1);
    if (!r) return res.json({ found: false });
    let data = r.data;
    if (typeof data === "string") { try { data = JSON.parse(data); } catch (e) { data = {}; } }
    const kc = kcFor(await loadKeyCodes(pool), r.kind);   // کد شاغل یا بازنشسته
    const n = (v) => Math.round(Number(v) || 0);
    const sum = (c) => {
      if (!c) return { has: false, total: 0, installment: 0, remaining: 0 };
      const out = { has: false, total: 0, installment: 0, remaining: 0 };
      if (r.kind === "active") {
        for (const x of r.loans || []) if (String(x.code) === c) { out.has = true; out.total += n(x.principal); out.installment += n(x.v); out.remaining += Math.max(0, n(x.remaining)); }
        if (!out.has) for (const x of (data && data.dedBase) || []) if (String(x.code) === c && n(x.v)) { out.has = true; out.installment += n(x.v); }
      } else {
        for (const x of (data && data.items) || []) if (String(x.code) === c && n(x.v) < 0) { out.has = true; out.total += n(x.loanAmt); out.installment += -n(x.v); out.remaining += Math.max(0, n(x.remaining)); }
      }
      return out;
    };
    res.json({ found: true, year: r.year, month: r.month, cLoan: sum(kc.loan1), cLoan2: sum(kc.loan2), cAdvance: sum(kc.advance), codes: kc });
  } catch (err) { sendError(res, err); }
});

// GET /api/loan-queue/settlement/:code -> تسویهٔ لغو عضویت: سرمایه (۷۹۶) منهای آخرین مانده وام (۷۱۰)
router.get("/settlement/:code", async (req, res) => {
  const code = toLatinDigits(req.params.code).trim();
  try {
    const [[p]] = await pool.query("SELECT membership_cancel_date AS d, membership_cancel_amount AS a FROM personnel WHERE code = ?", [code]);
    if (!p) return res.status(404).json({ error: "not_found", message: "این کد پرسنلی در کارگزینی نیست." });
    const f = await fundSnapshot(code);
    const capital = f ? f.capital : null, loanRemaining = f ? f.loanRemaining : 0;
    res.json({
      hasPayslip: !!f, capital, loanRemaining, hasLoan: f ? f.hasLoan : false, member: f ? f.member : false,
      payable: capital == null ? null : Math.max(0, capital - loanRemaining), negative: capital != null && loanRemaining > capital,
      year: f ? f.year : null, month: f ? f.month : null, codes: f ? f.codes : null,
      cancelDate: p.d || "", cancelAmount: p.a == null ? null : Number(p.a),
    });
  } catch (err) { sendError(res, err); }
});

// POST /api/loan-queue/cancel-membership/:code { date, amount } -> ثبت تاریخ و مبلغ لغو عضویت؛ نوبت‌های «در انتظار» فرد به «انصراف» می‌روند
router.post("/cancel-membership/:code", async (req, res) => {
  const code = toLatinDigits(req.params.code).trim();
  const b = req.body || {};
  const date = toLatinDigits(b.date).trim();
  if (!/^\d{4}\/\d{2}\/\d{2}$/.test(date)) return res.status(400).json({ error: "invalid_input", message: "تاریخ لغو عضویت را به‌صورت 1405/07/21 وارد کنید." });
  const amount = Math.max(0, Math.round(toNum(b.amount)));
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [r] = await conn.query("UPDATE personnel SET membership_cancel_date = ?, membership_cancel_amount = ? WHERE code = ?", [date, amount, code]);
    if (!r.affectedRows) { await conn.rollback(); return res.status(404).json({ error: "not_found", message: "این کد پرسنلی در کارگزینی نیست." }); }
    const [q] = await conn.query("DELETE FROM loan_queue WHERE code = ? AND status = 'pending'", [code]);   // نوبت «در انتظار» با لغو عضویت حذف می‌شود
    // تغییرات ماهانه: حذف کد وام و حذف کد سرمایه (دو ردیف)؛ ردیف باز مشابه در همان تاریخ دوباره ساخته نمی‌شود
    const [lastSlip] = await personPayroll(conn, code, 1);
    const kc = kcFor(await loadKeyCodes(conn), lastSlip ? lastSlip.kind : "active"), by = (req.user && (req.user.fullName || req.user.username)) || "";   // کدهای گروهِ فرد
    const made = [];
    for (const dcode of [kc.loan1, kc.capital]) {
      const [ex] = await conn.query("SELECT id FROM monthly_changes WHERE code = ? AND deduction_code = ? AND change_date = ? AND action = 3 AND closed = 0", [code, dcode, date]);
      if (!ex.length) made.push(await insertChange(conn, { code, date, dcode, action: 3, notes: "لغو عضویت", by }));
    }
    await conn.commit();
    res.json({ ok: true, cancelledQueue: q.affectedRows, changeRows: made.length });
  } catch (err) {
    await conn.rollback();
    sendError(res, err);
  } finally { conn.release(); }
});

// GET /api/loan-queue/overview?year=1405&month=7
// خلاصهٔ ۱۲ ماه (از ماه انتخابی) برای نمودار و اکسل: تعداد افراد و جمع مبلغ وام‌های در انتظار + فهرست همهٔ نوبت‌های در انتظار (خودکار و دستی)
router.get("/overview", async (req, res) => {
  const year = parseInt(req.query.year, 10), month = parseInt(req.query.month, 10);
  if (!year || !month || month < 1 || month > 12) return res.status(400).json({ error: "invalid_input", message: "سال و ماه معتبر لازم است." });
  try {
    const [rows] = await pool.query(`${SELECT_BASE} WHERE lq.status = 'pending'`);
    const items = rows.map(toJSON).sort(byDue);
    const start = year * 12 + month - 1;
    const months = [];
    for (let i = 0; i < 12; i++) { const idx = start + i; months.push({ year: Math.floor(idx / 12), month: (idx % 12) + 1, count: 0, amount: 0 }); }
    const overdue = { count: 0, amount: 0 }, later = { count: 0, amount: 0 };
    for (const it of items) {
      const d = it.dueYear * 12 + it.dueMonth - 1 - start;
      const b = d < 0 ? overdue : d > 11 ? later : months[d];
      b.count++; b.amount += it.loanAmount;
    }
    res.json({ year, month, months, overdue, later, items });
  } catch (err) { sendError(res, err); }
});

// GET /api/loan-queue/list?status=pending|received|all  -> گزارش افراد در نوبت و دریافت‌کننده‌ها (مبلغ محاسبه‌شده و مبلغ واریزی)
router.get("/list", async (req, res) => {
  const st = String(req.query.status || "all");
  try {
    const where = st === "pending" ? "lq.status = 'pending'" : st === "received" ? "lq.status = 'received'" : "lq.status IN ('pending','received')";
    const [rows] = await pool.query(`${SELECT_BASE} WHERE ${where}`);
    const items = rows.map(toJSON).sort((a, b) => (a.status === b.status ? byDue(a, b) : a.status === "pending" ? -1 : 1));
    res.json({ status: st, items });
  } catch (err) { sendError(res, err); }
});

const pad2 = (n) => String(n).padStart(2, "0");
const toNum = (v) => { const n = Number(toLatinDigits(v).replace(/[,٬\s]/g, "")); return Number.isFinite(n) ? n : 0; };

// شمارهٔ وام = تاریخ (yyyymmdd) + ردیف دو رقمی همان روز؛ مثل ۱۴۰۴۰۱۲۴۰۳
async function nextLoanNumber(conn, date) {
  const digits = toLatinDigits(date).replace(/\D/g, "").slice(0, 8);
  const [[{ c }]] = await conn.query("SELECT COUNT(*) AS c FROM loan_queue WHERE loan_number LIKE ?", [digits + "%"]);
  let seq = c + 1;
  for (;;) {
    const n = digits + pad2(seq);
    const [[{ k }]] = await conn.query("SELECT COUNT(*) AS k FROM loan_queue WHERE loan_number = ?", [n]);
    if (!k) return n;
    seq++;
  }
}

// GET /api/loan-queue/by-person/:code -> همهٔ وام‌های یک نفر (هر وضعیتی)
// نوبت‌های خودکارِ قدیمی که هنوز شماره ندارند، همین‌جا شماره می‌گیرند (تاریخ ثبت = ماه ثبت‌نام).
router.get("/by-person/:code", async (req, res) => {
  try {
    const [rows] = await pool.query(`${SELECT_BASE} WHERE lq.code = ?`, [req.params.code]);
    for (const r of rows) {
      if (!r.loan_number) {
        const date = r.request_date || `${r.registration_year}/${pad2(r.registration_month)}/01`;
        r.loan_number = await nextLoanNumber(pool, date);
        r.request_date = r.request_date || date;
        await pool.query("UPDATE loan_queue SET loan_number = ?, request_date = ? WHERE id = ?", [r.loan_number, r.request_date, r.id]);
      }
    }
    rows.sort((a, b) => b.due_year - a.due_year || b.due_month - a.due_month || b.id - a.id);
    res.json({ items: rows.map(toJSON) });
  } catch (err) {
    sendError(res, err);
  }
});

// POST /api/loan-queue  -> ثبت دستی یک وام/نوبت
// body: { code, requestDate:'1405/07/07', dueYear, dueMonth, capital, loanAmount?, installmentMonths?, installmentAmount?, notes }
// اگر loanAmount خالی باشد از روی سرمایه و فرمول سیستم محاسبه می‌شود.
router.post("/", async (req, res) => {
  const b = req.body || {};
  const code = toLatinDigits(b.code).trim();
  const requestDate = toLatinDigits(b.requestDate).trim();
  const dueYear = parseInt(toLatinDigits(b.dueYear), 10), dueMonth = parseInt(toLatinDigits(b.dueMonth), 10);
  const months = parseInt(toLatinDigits(b.installmentMonths), 10) || 36;
  if (!code) return res.status(400).json({ error: "invalid_input", message: "کد پرسنلی لازم است." });
  if (!/^\d{4}\/\d{2}\/\d{2}$/.test(requestDate)) return res.status(400).json({ error: "invalid_input", message: "تاریخ درخواست را به‌صورت ۱۴۰۵/۰۷/۰۷ وارد کنید." });
  if (!dueYear || !dueMonth || dueMonth < 1 || dueMonth > 12) return res.status(400).json({ error: "invalid_input", message: "سال و ماهِ دریافت وام را مشخص کنید." });
  if (months < 1 || months > 120) return res.status(400).json({ error: "invalid_input", message: "تعداد اقساط باید بین ۱ تا ۱۲۰ باشد." });
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [p] = await conn.query("SELECT code FROM personnel WHERE code = ?", [code]);
    if (!p.length) { await conn.rollback(); return res.status(404).json({ error: "not_found", message: "این کد پرسنلی در کارگزینی نیست." }); }
    { const hb = await heirBlock(conn, code); if (hb) { await conn.rollback(); return res.status(409).json({ error: "not_allowed", message: hb }); } }
    const capital = Math.round(toNum(b.capital));
    let loanAmount = Math.round(toNum(b.loanAmount));
    let installment = Math.round(toNum(b.installmentAmount));
    if (!loanAmount) { if (capital <= 0) { await conn.rollback(); return res.status(400).json({ error: "invalid_input", message: "سرمایه یا مبلغ وام را وارد کنید." }); } loanAmount = computeFigures(capital, months, await loadLoanParams(conn)).loanAmount; }
    if (!installment) installment = roundUpToStep(loanAmount / months, (await loadLoanParams(conn)).roundInst); // رند به بالا طبق تنظیمات گرد کردن
    // اگر فرد نوبت وامِ در انتظار دارد، وام جدید (در انتظار) ثبت نمی‌شود
    if (!b.status || b.status === "pending") {
      const [pend] = await conn.query("SELECT due_year, due_month FROM loan_queue WHERE code = ? AND status = 'pending' LIMIT 1", [code]);
      if (pend.length) { await conn.rollback(); return res.status(409).json({ error: "invalid_input", message: `برای این فرد نوبت وام قبلاً ثبت شده است (نوبت دریافت: ${pend[0].due_year}/${pad2(pend[0].due_month)}). ابتدا آن را دریافت یا لغو کنید یا همان را ویرایش کنید.` }); }
    }
    const number = await nextLoanNumber(conn, requestDate);
    const [ry, rm] = requestDate.split("/").map(Number);
    const [r] = await conn.query(
      `INSERT INTO loan_queue (code, registration_period_id, registration_year, registration_month, due_year, due_month,
         capital_amount, loan_amount, installment_months, installment_amount, status, loan_number, request_date, notes, source,
         g_code, g_name, g_national_id, g_birth_date, g_mobile, g_workplace)
       VALUES (?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?, 'manual', ?, ?, ?, ?, ?, ?)`,
      [code, ry, rm, dueYear, dueMonth, capital, loanAmount, months, installment, number, requestDate, String(b.notes || "").slice(0, 500),
        guarantorOf(b).g_code || null, guarantorOf(b).g_name || null, guarantorOf(b).g_national_id || null, guarantorOf(b).g_birth_date || null, guarantorOf(b).g_mobile || null, guarantorOf(b).g_workplace || null]);
    await conn.commit();
    res.json({ ok: true, id: r.insertId, loanNumber: number, loanAmount, installmentAmount: installment });
  } catch (err) {
    await conn.rollback();
    sendError(res, err);
  } finally { conn.release(); }
});

// PATCH /api/loan-queue/:id -> ویرایش هر فیلد + تغییر وضعیت (pending | received | cancelled)
router.patch("/:id", async (req, res) => {
  const b = req.body || {}, sets = [], vals = [];
  const put = (c, v) => { sets.push(`${c} = ?`); vals.push(v); };
  if (b.requestDate !== undefined) {
    const d = toLatinDigits(b.requestDate).trim();
    if (!/^\d{4}\/\d{2}\/\d{2}$/.test(d)) return res.status(400).json({ error: "invalid_input", message: "تاریخ نامعتبر است." });
    put("request_date", d);
  }
  if (b.dueYear !== undefined) put("due_year", parseInt(toLatinDigits(b.dueYear), 10) || 0);
  if (b.dueMonth !== undefined) {
    const m = parseInt(toLatinDigits(b.dueMonth), 10);
    if (!m || m < 1 || m > 12) return res.status(400).json({ error: "invalid_input", message: "ماه نامعتبر است." });
    put("due_month", m);
  }
  if (b.capital !== undefined) put("capital_amount", Math.round(toNum(b.capital)));
  if (b.loanAmount !== undefined) put("loan_amount", Math.round(toNum(b.loanAmount)));
  if (b.installmentMonths !== undefined) {
    const n = parseInt(toLatinDigits(b.installmentMonths), 10);
    if (!n || n < 1 || n > 120) return res.status(400).json({ error: "invalid_input", message: "تعداد اقساط باید بین ۱ تا ۱۲۰ باشد." });
    put("installment_months", n);
  }
  if (b.installmentAmount !== undefined) put("installment_amount", Math.round(toNum(b.installmentAmount)));
  if (b.notes !== undefined) put("notes", String(b.notes || "").slice(0, 500));
  for (const [col, v] of Object.entries(guarantorOf(b))) put(col, v || null);
  if (b.status !== undefined) {
    if (!["pending", "received", "cancelled"].includes(b.status)) return res.status(400).json({ error: "invalid_input", message: "وضعیت نامعتبر است." });
    put("status", b.status);
    sets.push(b.status === "received" ? "received_at = COALESCE(received_at, NOW())" : "received_at = NULL");
  }
  if (!sets.length) return res.status(400).json({ error: "invalid_input", message: "چیزی برای ذخیره نیست." });
  try {
    const [r] = await pool.query(`UPDATE loan_queue SET ${sets.join(", ")} WHERE id = ?`, [...vals, req.params.id]);
    if (!r.affectedRows) return res.status(404).json({ error: "not_found" });
    res.json({ ok: true });
  } catch (err) {
    sendError(res, err);
  }
});

// PUT /api/loan-queue/:id  { installmentMonths }  -> فقط تعداد ماه؛ مبلغ قسط دوباره حساب می‌شود
router.put("/:id", async (req, res) => {
  const { installmentMonths } = req.body || {};
  if (!Number.isInteger(installmentMonths) || installmentMonths < 1 || installmentMonths > 120) {
    return res.status(400).json({ error: "invalid_input", message: "تعداد ماه اقساط معتبر (۱ تا ۱۲۰) لازم است." });
  }
  try {
    const [[rec]] = await pool.query("SELECT capital_amount FROM loan_queue WHERE id=? AND status='pending'", [req.params.id]);
    if (!rec) return res.status(404).json({ error: "not_found", message: "نوبت پیدا نشد یا در وضعیت «در انتظار» نیست." });
    const f = computeFigures(rec.capital_amount, installmentMonths, await loadLoanParams(pool));
    await pool.query("UPDATE loan_queue SET installment_months=?, installment_amount=? WHERE id=?",
      [installmentMonths, f.installment, req.params.id]);
    res.json({ ok: true, installmentAmount: f.installment });
  } catch (err) {
    sendError(res, err);
  }
});

// PUT /api/loan-queue/:id/receive  -> علامت «دریافت شد» (مبلغ‌ها از قبل ثبت شده‌اند)
router.put("/:id/receive", async (req, res) => {
  try {
    const [[rec]] = await pool.query("SELECT loan_amount, installment_amount, capital_amount, status FROM loan_queue WHERE id=?", [req.params.id]);
    if (!rec) return res.status(404).json({ error: "not_found" });
    if (rec.status !== "pending") {
      return res.status(400).json({ error: "invalid_state", message: "فقط نوبت‌های «در انتظار» قابل ثبتِ دریافت‌اند." });
    }
    await pool.query("UPDATE loan_queue SET status='received', received_at=NOW() WHERE id=?", [req.params.id]);
    res.json({ ok: true, capital: Number(rec.capital_amount), loanAmount: Number(rec.loan_amount), installmentAmount: Number(rec.installment_amount) });
  } catch (err) {
    sendError(res, err);
  }
});

// ---------------------------------------------------------------------------
// ثبت دریافت وام از اکسل: فایلی با ستون‌های «کد پرسنلی، مبلغ وام، مبلغ قسط، تاریخ دریافت» (افرادی که وامشان پرداخت شده)
// POST /api/loan-queue/receive-import { dryRun, items: [{ code, loanAmount, installmentAmount, receivedDate }] }
// برای هر ردیف، نوبتِ «در انتظار» همان فرد «دریافت شده» می‌شود: تاریخ دریافت (شمسی) ← received_at و شروع اقساط (سال/ماهِ همان تاریخ)،
// مبلغ وام و مبلغ قسط از فایل، تعداد اقساط = ⌈وام ÷ قسط⌉ و پایان اقساط = شروع + (تعداد − ۱) ماه.
// ردیفی که نوبت «در انتظار» ندارد (قبلاً دریافت‌شده، لغو شده یا بدون نوبت)، تکراری یا نامعتبر باشد رد می‌شود و دلیلش گزارش می‌شود.
// ---------------------------------------------------------------------------
const RECV_MAX_ROWS = 5000;
function normJDate(v) {
  let t = toLatinDigits(v == null ? "" : String(v)).trim().replace(/[-.\\]/g, "/");
  if (/^\d{8}$/.test(t)) t = `${t.slice(0, 4)}/${t.slice(4, 6)}/${t.slice(6)}`;
  const m = /^(\d{4})\/(\d{1,2})\/(\d{1,2})$/.exec(t);
  return m ? J.fmt(+m[1], +m[2], +m[3]) : "";
}
router.post("/receive-import", async (req, res) => {
  const items = Array.isArray((req.body || {}).items) ? req.body.items : null;
  const dry = !!(req.body || {}).dryRun;
  if (!items || !items.length) return res.status(400).json({ error: "invalid_input", message: "ردیفی برای ثبت نیست." });
  if (items.length > RECV_MAX_ROWS) return res.status(400).json({ error: "invalid_input", message: `حداکثر ${RECV_MAX_ROWS} ردیف در هر فایل.` });
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const skipped = [], done = [], seen = new Set();
    for (let i = 0; i < items.length; i++) {
      const it = items[i] || {};
      const code = toLatinDigits(it.code == null ? "" : String(it.code)).trim();
      const skip = (reason) => skipped.push({ row: i + 1, code, reason });
      if (!code) { skip("کد پرسنلی خالی است."); continue; }
      const loan = Math.round(toNum(it.loanAmount)), inst = Math.round(toNum(it.installmentAmount));
      if (!(loan > 0)) { skip("مبلغ وام نامعتبر است."); continue; }
      if (!(inst > 0)) { skip("مبلغ قسط نامعتبر است."); continue; }
      const dt = normJDate(it.receivedDate), pd = dt ? J.parse(dt) : null;
      if (!pd) { skip("تاریخ دریافت را به‌صورت 1405/07/21 وارد کنید."); continue; }
      if (seen.has(code)) { skip("ردیف تکراری برای این کد (فقط اولین ردیف ثبت می‌شود)."); continue; }
      const [ents] = await conn.query("SELECT id, status FROM loan_queue WHERE code = ? ORDER BY id DESC", [code]);
      const pend = ents.find((e) => e.status === "pending");
      if (!pend) { skip(!ents.length ? "برای این کد نوبتی ثبت نشده است." : ents.some((e) => e.status === "received") ? "وام این فرد قبلاً «دریافت شده» ثبت شده است." : "نوبت این فرد «لغو شده» است."); continue; }
      seen.add(code);
      const months = Math.max(1, Math.min(120, Math.ceil(loan / inst)));
      const end = addMonths(pd.y, pd.m, months - 1);
      const g = J.toGregorian(pd.y, pd.m, pd.d), at = `${g.y}-${String(g.m).padStart(2, "0")}-${String(g.d).padStart(2, "0")} 12:00:00`;
      done.push({ row: i + 1, code, loanAmount: loan, installmentAmount: inst, receivedDate: dt, installmentMonths: months, endYear: end.year, endMonth: end.month });
      if (!dry) await conn.query(
        `UPDATE loan_queue SET status = 'received', received_at = ?, loan_amount = ?, installment_amount = ?, installment_months = ?,
                inst_loan_paid = ?, inst_current_amount = ?, inst_start_year = ?, inst_start_month = ?, inst_end_year = ?, inst_end_month = ?
          WHERE id = ? AND status = 'pending'`,
        [at, loan, inst, months, loan, inst, pd.y, pd.m, end.year, end.month, pend.id]);
    }
    if (dry) await conn.rollback(); else await conn.commit();
    res.json({ ok: true, dryRun: dry, received: done.length, skipped, items: done.slice(0, 300) });
  } catch (err) { await conn.rollback(); sendError(res, err); } finally { conn.release(); }
});

// POST /api/loan-queue/recompute-pending   { includeManual?: boolean }
// بعد از تغییر پارامترهای فرمول (مدت انتظار، سهم صندوق، حداکثر وام) روی همهٔ نوبت‌های «در انتظار» اعمال می‌شود:
//  ۱) مبلغ وام و قسط از روی سرمایهٔ ثبت‌شده با فرمول تازه دوباره حساب می‌شود؛
//  ۲) ماه نوبت = ماه ثبت (اتمام قسط) + مدت انتظار. مثلاً ثبت شهریور ۱۴۰۵ با انتظار ۱۰ ماه ← تیر ۱۴۰۶.
// نوبت‌های ثبت دستی فقط اگر includeManual=true باشد جابه‌جا می‌شوند (ماه نوبتشان را خود کاربر تعیین کرده).
router.post("/recompute-pending", async (req, res) => {
  const includeManual = !!(req.body || {}).includeManual;
  try {
    const [rows] = await pool.query("SELECT id, capital_amount, installment_months, registration_year, registration_month, due_year, due_month, source FROM loan_queue WHERE status='pending'");
    let updated = 0, shifted = 0;
    const params = await loadLoanParams(pool);
    for (const r of rows) {
      const f = computeFigures(r.capital_amount, r.installment_months, params);
      const canShift = r.registration_year && r.registration_month && (r.source !== "manual" || includeManual);
      if (canShift) {
        const due = addMonths(r.registration_year, r.registration_month, params.wait);
        if (due.year !== r.due_year || due.month !== r.due_month) shifted++;
        await pool.query("UPDATE loan_queue SET loan_amount=?, installment_amount=?, due_year=?, due_month=? WHERE id=?", [f.loanAmount, f.installment, due.year, due.month, r.id]);
      } else {
        await pool.query("UPDATE loan_queue SET loan_amount=?, installment_amount=? WHERE id=?", [f.loanAmount, f.installment, r.id]);
      }
      updated++;
    }
    res.json({ ok: true, updated, shifted, wait: params.wait });
  } catch (err) {
    sendError(res, err);
  }
});

// DELETE /api/loan-queue/:id -> لغو نوبت (برای حفظ تاریخچه حذف واقعی نمی‌شود)
router.delete("/:id", async (req, res) => {
  try {
    const [result] = await pool.query("UPDATE loan_queue SET status='cancelled' WHERE id=? AND status='pending'", [req.params.id]);
    if (!result.affectedRows) return res.status(404).json({ error: "not_found" });
    res.json({ ok: true });
  } catch (err) {
    sendError(res, err);
  }
});

// DELETE /api/loan-queue/:id/permanent -> حذف کامل ردیف وام (هر وضعیتی)
router.delete("/:id/permanent", async (req, res) => {
  try {
    const [result] = await pool.query("DELETE FROM loan_queue WHERE id = ?", [req.params.id]);
    if (!result.affectedRows) return res.status(404).json({ error: "not_found", message: "ردیف وام پیدا نشد." });
    res.json({ ok: true });
  } catch (err) {
    sendError(res, err);
  }
});

module.exports = router;
