// عملیات وام (تب صفحهٔ «ثبت وام و چاپ فرم‌ها»): ۱ افزایش سرمایه، ۲ تسویه وام، ۳ عضویت. هر ثبت یک ردیف در «تغییرات ماهانهٔ کسورات» می‌سازد:
//  - افزایش سرمایه: کد سرمایه، وضعیت «اصلاح»، قسط = قسط همان کد در آخرین فیش، کل و مانده = «سرمایهٔ جدید»:
//      الف) از روز بعد از تاریخ بستن آخرین حقوق تا قبل از ساخت دورهٔ همان ماه:  سرمایهٔ فعلی + مبلغ + سهم صندوق
//      ب) از ساخت دوره تا تاریخ بستن حقوق ماه بعد:                           سرمایهٔ فعلی + مبلغ
//  - تسویه وام: کد وام ضروری ۱، وضعیت «حذف».
//  - عضویت: کد سرمایه، وضعیت «ایجاد»، کل و مانده = مبلغ، قسط = سهم صندوق.
// «سرمایهٔ جدید» تا آمدن فیشِ ماهِ اعمال در صفحهٔ پرسنلی، ثبت وام و نوبت‌دهی به‌جای سرمایهٔ فیش استفاده می‌شود
// و روی نوبت‌های «در انتظار» همان فرد هم اعمال می‌شود (سرمایه، مبلغ وام و قسط).
const express = require("express");
const { sendError, isBusinessError, userMsg } = require("../errors");
const pool = require("../db");
const { toLatinDigits } = require("../textNormalize");
const { heirBlock } = require("../eligibility");
const { loadKeyCodes, kcFor } = require("../keyCodes");
const { insertChange } = require("../monthlyChange");
const J = require("../jalali");
const { personPayroll } = require("../personPayroll");
const { pendingCapital } = require("../capitalEffective");
const { loadLoanParams, computeFigures } = require("../loanQueueSync");

const router = express.Router();
const fail = (res, e) => sendError(res, e);
const bad = (res, message, code = 400) => res.status(code).json({ error: code === 404 ? "not_found" : code === 409 ? "not_allowed" : "invalid_input", message });
const DATE_RE = /^\d{4}\/\d{2}\/\d{2}$/;
const n0 = (v) => Math.round(Number(v) || 0);
const num = (v) => { const n = Number(toLatinDigits(v == null ? "" : String(v)).replace(/[,٬\s]/g, "")); return Number.isFinite(n) ? n : 0; };
const KIND_TEXT = { 1: "افزایش سرمایه", 2: "تسویه وام", 3: "عضویت" };

// اطلاعات یک کد در آخرین فیش: { has, installment, remaining }
function codeInfo(r, data, code) {
  const out = { has: false, installment: 0, remaining: 0 };
  if (!code) return out;
  if (r.kind === "active") {
    for (const x of r.loans || []) if (String(x.code) === code) { out.has = true; out.installment += n0(x.v); out.remaining += Math.max(0, n0(x.remaining)); }
    if (!out.has) for (const x of (data && data.dedBase) || []) if (String(x.code) === code && n0(x.v)) { out.has = true; out.installment += n0(x.v); }
  } else {
    for (const x of (data && data.items) || []) if (String(x.code) === code && n0(x.v) < 0) { out.has = true; out.installment += -n0(x.v); out.remaining += Math.max(0, n0(x.remaining)); }
  }
  return out;
}
async function snapshot(q, code, kc) {
  const [r] = await personPayroll(q, code, 1);
  if (!r) return null;
  let data = r.data; if (typeof data === "string") { try { data = JSON.parse(data); } catch (e) { data = {}; } }
  const k = kcFor(kc, r.kind);   // شاغل و بازنشسته کد کسر جدا دارند
  return { year: r.year, month: r.month, kind: r.kind, codes: k, capital: codeInfo(r, data, k.capital), loan1: codeInfo(r, data, k.loan1), loan2: codeInfo(r, data, k.loan2) };
}
// سهم صندوق = «میزان سهم صندوق» در تنظیمات ← پارامترهای وام (پیش‌فرض ۶٬۰۰۰٬۰۰۰ ریال)
async function loadFundShare(q) { return Math.round((await loadLoanParams(q)).share); }
// بستن‌ها و تاریخ ساخت دوره‌ها (برای تعیین بازهٔ الف/ب)
async function loadCtx(q) {
  const [cl] = await q.query("SELECT year, month, close_date FROM payroll_closings ORDER BY year, month");
  const [pr] = await q.query("SELECT year, month, created_at FROM periods ORDER BY year, month");
  const periods = pr.map((x) => ({ year: x.year, month: x.month, created: (J.dateTimeFa(x.created_at) || "").slice(0, 10) }));
  const last = periods.length ? periods[periods.length - 1] : null;
  return { closings: cl.map((x) => ({ year: x.year, month: x.month, closeDate: x.close_date })), periods, lastPeriod: last ? { year: last.year, month: last.month } : null, fundShare: await loadFundShare(q) };
}
// آخرین بستنِ قبل از تاریخ ← ماه M. اگر دورهٔ M هنوز ساخته نشده یا تاریخ قبل از ساخت آن باشد: «الف»؛ وگرنه «ب».
// applyYm = سال*12+ماهِ فیشی که اولین بار این تغییر در آن دیده می‌شود (ماه بعد از M).
function phaseOf(date, ctx, snap) {
  const before = ctx.closings.filter((c) => c.closeDate < date);
  const c = before.length ? before[before.length - 1] : null;
  if (!c) { const lp = ctx.lastPeriod || (snap ? { year: snap.year, month: snap.month } : null); return { phase: "B", closing: null, applyYm: lp ? lp.year * 12 + lp.month + 1 : 0 }; }
  const per = ctx.periods.find((x) => x.year === c.year && x.month === c.month);
  const phase = !per || date < per.created ? "A" : "B";
  return { phase, closing: c, periodCreated: per ? per.created : "", applyYm: c.year * 12 + c.month + 1 };
}
// اعمال سرمایهٔ تازه روی نوبت‌های «در انتظار» فرد (onlyFrom: فقط ردیف‌هایی که سرمایه‌شان همین مقدار است — برای برگرداندن)
async function pushCapitalToQueue(conn, code, toCap, onlyFrom) {
  const params = await loadLoanParams(conn);
  const [rows] = await conn.query("SELECT id, installment_months, source, capital_amount FROM loan_queue WHERE code = ? AND status = 'pending'", [code]);
  for (const r of rows) {
    if (onlyFrom != null && Math.round(Number(r.capital_amount)) !== Math.round(onlyFrom)) continue;
    if (r.source === "manual") { await conn.query("UPDATE loan_queue SET capital_amount = ? WHERE id = ?", [toCap, r.id]); continue; }
    const f = computeFigures(toCap, r.installment_months, params);
    await conn.query("UPDATE loan_queue SET capital_amount = ?, loan_amount = ?, installment_amount = ? WHERE id = ?", [toCap, f.loanAmount, f.installment, r.id]);
  }
}

const SEL = "SELECT c.*, m.closed AS change_closed FROM capital_increases c LEFT JOIN monthly_changes m ON m.id = c.change_id";
const toJSON = (r) => ({
  id: r.id, code: r.code, kind: r.kind, kindText: KIND_TEXT[r.kind] || "", date: r.pay_date, amount: Number(r.amount), slipNo: r.slip_no || "",
  prevCapital: r.prev_capital == null ? null : Number(r.prev_capital),
  newCapital: r.new_capital != null ? Number(r.new_capital) : (r.prev_capital == null ? null : Number(r.prev_capital)),
  loan1Remaining: r.loan1_remaining == null ? null : Number(r.loan1_remaining), loan2Remaining: r.loan2_remaining == null ? null : Number(r.loan2_remaining),
  changeId: r.change_id || null, changeClosed: r.change_id ? !!r.change_closed : null, createdBy: r.created_by || "",
});

// GET /api/capital-increase/by-person/:code -> ردیف‌های ثبت‌شده + وضعیت آخرین فیش (سرمایه، قسط، مانده وام‌ها)
router.get("/by-person/:code", async (req, res) => {
  const code = toLatinDigits(req.params.code).trim();
  try {
    const kc = await loadKeyCodes(pool);
    const [rows] = await pool.query(`${SEL} WHERE c.code = ?`, [code]);
    rows.sort((a, b) => b.pay_date.localeCompare(a.pay_date) || b.id - a.id);
    const snap = await snapshot(pool, code, kc);
    const ctx = await loadCtx(pool);
    const pend = snap ? await pendingCapital(pool, code, snap.year * 12 + snap.month) : null;
    res.json({ items: rows.map(toJSON), snapshot: snap, ctx, codes: snap ? snap.codes : kc, pending: pend });
  } catch (e) { fail(res, e); }
});

function readBody(b) {
  const kind = parseInt(num(b.kind), 10);
  if (![1, 2, 3].includes(kind)) throw new Error("نوع باید افزایش سرمایه، تسویه وام یا عضویت باشد.");
  const date = toLatinDigits(b.date || "").trim();
  if (!DATE_RE.test(date)) throw new Error("تاریخ را به‌صورت 1405/07/21 وارد کنید.");
  const amount = Math.round(num(b.amount));
  if (!(amount > 0)) throw new Error("مبلغ پرداختی را وارد کنید.");
  const slipNo = toLatinDigits(b.slipNo || "").trim().slice(0, 30);
  if (!slipNo) throw new Error("شمارهٔ فیش را وارد کنید.");
  return { kind, date, amount, slipNo };
}
const userName = (req) => (req.user && (req.user.fullName || req.user.username)) || "";

async function save(req, res, id) {
  const code = id ? null : toLatinDigits((req.body || {}).code || "").trim();
  let rec; try { rec = readBody(req.body || {}); } catch (e) { return bad(res, userMsg(e)); }
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    let old = null;
    if (id) {
      const [[o]] = await conn.query(`${SEL} WHERE c.id = ? FOR UPDATE`, [id]);
      if (!o) { await conn.rollback(); return bad(res, "ردیف پیدا نشد.", 404); }
      if (o.change_id && o.change_closed) { await conn.rollback(); return bad(res, "ردیف تغییرات ماهانهٔ این ثبت بسته شده است؛ ابتدا در «تغییرات ماهانه» تیک «بسته شدن» را بردارید.", 409); }
      old = o; rec.code = o.code;
    } else {
      rec.code = code;
      const [p] = await conn.query("SELECT code FROM personnel WHERE code = ?", [code]);
      if (!p.length) { await conn.rollback(); return bad(res, "این کد پرسنلی در کارگزینی نیست.", 404); }
    }
    const hb = await heirBlock(conn, rec.code);
    if (hb) { await conn.rollback(); return bad(res, hb, 409); }
    const kc0 = await loadKeyCodes(conn);
    const snap = await snapshot(conn, rec.code, kc0);
    const kc = snap ? snap.codes : kc0;   // کدهای گروهِ فرد (شاغل / بازنشسته)
    if (rec.kind === 1 && (!snap || !snap.capital.has)) { await conn.rollback(); return bad(res, `در آخرین فیش این فرد کد ${kc.capital} (سرمایه صندوق) پیدا نشد؛ افزایش سرمایه ثبت نمی‌شود. اگر عضو جدید است «عضویت» را انتخاب کنید.`, 409); }
    const ctx = await loadCtx(conn);
    const by = userName(req);
    if (old && old.change_id) await conn.query("DELETE FROM monthly_changes WHERE id = ? AND closed = 0", [old.change_id]);
    const slipYm = snap ? snap.year * 12 + snap.month : 0;
    const pend = await pendingCapital(conn, rec.code, slipYm, id || 0);
    const ph = phaseOf(rec.date, ctx, snap);
    let prevCap = snap ? snap.capital.remaining : null, newCap = null, applyYm = null, spec;
    const note = `${KIND_TEXT[rec.kind]} ${rec.amount.toLocaleString("en-US")} ریال — فیش ${rec.slipNo}`;
    if (rec.kind === 1) {
      prevCap = pend ? pend.newCapital : snap.capital.remaining;
      const share = ph.phase === "A" && !pend ? ctx.fundShare : 0;     // سهم صندوق فقط در بازهٔ «الف»
      newCap = prevCap + rec.amount + share; applyYm = ph.applyYm;
      spec = { dcode: kc.capital, action: 2, inst: snap.capital.installment, total: newCap, rem: newCap, notes: note + (share ? ` + سهم صندوق ${share.toLocaleString("en-US")}` : "") };
    } else if (rec.kind === 3) {
      prevCap = 0; newCap = rec.amount; applyYm = ph.applyYm;
      spec = { dcode: kc.capital, action: 1, inst: ctx.fundShare, total: rec.amount, rem: rec.amount, notes: note };
      await conn.query("UPDATE personnel SET membership_cancel_date = '', membership_cancel_amount = NULL WHERE code = ?", [rec.code]);   // عضویت دوباره = پایان لغو عضویت
    } else {
      if (pend) prevCap = pend.newCapital;
      spec = { dcode: kc.loan1, action: 3, notes: note };
    }
    const changeId = await insertChange(conn, { code: rec.code, date: rec.date, by, ...spec });
    const vals = [rec.kind, rec.date, rec.amount, rec.slipNo, prevCap, snap ? snap.loan1.remaining : null, snap ? snap.loan2.remaining : null, newCap, applyYm, changeId];
    let rid = id;
    if (id) await conn.query("UPDATE capital_increases SET kind=?, pay_date=?, amount=?, slip_no=?, prev_capital=?, loan1_remaining=?, loan2_remaining=?, new_capital=?, apply_ym=?, change_id=? WHERE id=?", [...vals, id]);
    else { const [r] = await conn.query("INSERT INTO capital_increases (kind, pay_date, amount, slip_no, prev_capital, loan1_remaining, loan2_remaining, new_capital, apply_ym, change_id, code, created_by) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)", [...vals, rec.code, by]); rid = r.insertId; }
    // نوبت‌های در انتظار: سرمایهٔ قدیمی (در ویرایش، سرمایهٔ جدیدِ قبلی) ← سرمایهٔ جدید
    if (old && old.new_capital != null && old.new_capital != newCap) await pushCapitalToQueue(conn, rec.code, prevCap, Number(old.new_capital));
    if (newCap != null) await pushCapitalToQueue(conn, rec.code, newCap);
    await conn.commit();
    res.json({ ok: true, id: rid, changeId, phase: ph.phase, changeValue: newCap, prevCapital: prevCap, newCapital: newCap });
  } catch (e) { await conn.rollback(); fail(res, e); } finally { conn.release(); }
}
router.post("/", (req, res) => save(req, res, null));
router.patch("/:id", (req, res) => save(req, res, parseInt(req.params.id, 10)));

router.delete("/:id", async (req, res) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [[o]] = await conn.query(`${SEL} WHERE c.id = ? FOR UPDATE`, [req.params.id]);
    if (!o) { await conn.rollback(); return bad(res, "ردیف پیدا نشد.", 404); }
    if (o.change_id && o.change_closed) { await conn.rollback(); return bad(res, "ردیف تغییرات ماهانهٔ این ثبت بسته شده است؛ ابتدا در «تغییرات ماهانه» تیک «بسته شدن» را بردارید.", 409); }
    if (o.change_id) await conn.query("DELETE FROM monthly_changes WHERE id = ? AND closed = 0", [o.change_id]);
    await conn.query("DELETE FROM capital_increases WHERE id = ?", [o.id]);
    if (o.new_capital != null && o.prev_capital != null) await pushCapitalToQueue(conn, o.code, Number(o.prev_capital), Number(o.new_capital));   // برگرداندن سرمایهٔ نوبت‌های در انتظار
    await conn.commit();
    res.json({ ok: true });
  } catch (e) { await conn.rollback(); fail(res, e); } finally { conn.release(); }
});

module.exports = { router, loadCtx, phaseOf };
