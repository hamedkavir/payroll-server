// وام وفاق: عملیات عضویت، افزایش سرمایه، تسویه وام و لغو عضویت — مشابه «عملیات وام» صفحهٔ ثبت وام، با کدهای کسر و سوابق جداگانه
// (تنظیمات ← تعریف کدهای مهم: «کد سرمایه وام وفاق» و «کد وام وفاق»). هر ثبت یک ردیف در «تغییرات ماهانهٔ کسورات» می‌سازد:
//  - افزایش سرمایه (همان فرمول «عملیات وام» صفحهٔ ثبت وام، با بازهٔ الف/ب): کد سرمایهٔ وفاق، وضعیت «اصلاح»، قسط = قسط همان کد در آخرین فیش، کل و مانده = «سرمایهٔ جدید»:
//      الف) از روز بعد از تاریخ بستن آخرین حقوق تا قبل از ساخت دورهٔ همان ماه:  سرمایهٔ فعلی + مبلغ + سهم صندوق
//      ب) از ساخت دوره تا تاریخ بستن حقوق ماه بعد:                           سرمایهٔ فعلی + مبلغ
//      (اگر افزایشِ قبلی هنوز در فیش نیامده، سرمایهٔ فعلی = سرمایهٔ جدیدِ آن و سهم صندوق دوباره اضافه نمی‌شود)
//  - تسویه وام: کد وام وفاق، وضعیت «حذف».
//  - عضویت: کد سرمایهٔ وفاق، وضعیت «ایجاد»، کل و مانده = مبلغ، قسط = سهم صندوق (در فرم می‌توان قسط دیگری وارد کرد).
//  «سهم صندوق وفاق» از آخرین فیش خوانده می‌شود: مبلغ (قسط) همان «کد سرمایهٔ وام وفاق» در فیش شاغل یا بازنشستهٔ همین فرد (کد شاغلین/بازنشستگان در تنظیمات ← تعریف کدهای مهم).
//  فقط اگر فرد در فیش آن کد را نداشته باشد (مثلاً عضو جدید)، «میزان سهم صندوق» تنظیمات ← پارامترهای وام جایگزین می‌شود.
//  - لغو عضویت: کد وام وفاق (اگر تعریف شده) و کد سرمایهٔ وفاق، هر دو «حذف»؛ مبلغ قابل پرداخت = سرمایه − مانده وام.
// نوبت‌دهی وام ضروری، سهم صندوق و سرمایهٔ جدیدِ وام ضروری به این بخش ربطی ندارد.
const express = require("express");
const { sendError, userMsg } = require("../errors");
const pool = require("../db");
const { toLatinDigits } = require("../textNormalize");
const { heirBlock } = require("../eligibility");
const { loadKeyCodes, kcFor } = require("../keyCodes");
const { insertChange } = require("../monthlyChange");
const { personPayroll } = require("../personPayroll");
const { loadCtx, phaseOf } = require("./capitalIncrease");   // بستن‌ها، تاریخ ساخت دوره‌ها، سهم صندوق و بازهٔ الف/ب

const router = express.Router();
const bad = (res, message, code = 400) => res.status(code).json({ error: code === 404 ? "not_found" : code === 409 ? "not_allowed" : "invalid_input", message });
const DATE_RE = /^\d{4}\/\d{2}\/\d{2}$/;
const n0 = (v) => Math.round(Number(v) || 0);
const num = (v) => { const n = Number(toLatinDigits(v == null ? "" : String(v)).replace(/[,٬\s]/g, "")); return Number.isFinite(n) ? n : 0; };
const KIND_TEXT = { 1: "افزایش سرمایه", 2: "تسویه وام", 3: "عضویت", 4: "لغو عضویت" };
const userName = (req) => (req.user && (req.user.fullName || req.user.username)) || "";
const fundCodes = (kc, kind) => { const k = kcFor(kc || {}, kind); return { capital: k.vcapital || "", loan: k.vloan || "" }; };   // کدهای وفاقِ شاغل یا بازنشسته
const NO_CODE = "کد سرمایهٔ وام وفاق در «تنظیمات ← تعریف کدهای مهم» تعریف نشده است.";

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
// کدهای وفاق از نوع آخرین فیش فرد (شاغل / بازنشسته) خوانده می‌شود؛ بدون فیش = کد شاغلین
async function snapshot(q, code, kc) {
  const [r] = await personPayroll(q, code, 1);
  if (!r) return null;
  const fc = fundCodes(kc, r.kind);
  let data = r.data; if (typeof data === "string") { try { data = JSON.parse(data); } catch (e) { data = {}; } }
  return { year: r.year, month: r.month, kind: r.kind, codes: fc, capital: codeInfo(r, data, fc.capital), loan: codeInfo(r, data, fc.loan) };
}
// سهم صندوق وفاق: قسط کد وفاق در آخرین فیش؛ در غیاب آن مقدار تنظیمات
const shareOf = (snap, ctx) => (snap && snap.capital.has && snap.capital.installment > 0 ? { amount: snap.capital.installment, source: "slip" } : { amount: Number((ctx && ctx.fundShare) || 0), source: "settings" });
const SEL = "SELECT v.*, m.closed AS change_closed FROM vefagh_ops v LEFT JOIN monthly_changes m ON m.id = v.change_id";
const toJSON = (r) => ({
  id: r.id, code: r.code, kind: r.kind, kindText: KIND_TEXT[r.kind] || "", date: r.pay_date, amount: Number(r.amount), slipNo: r.slip_no || "",
  prevCapital: r.prev_capital == null ? null : Number(r.prev_capital), newCapital: r.new_capital == null ? null : Number(r.new_capital),
  loanRemaining: r.loan_remaining == null ? null : Number(r.loan_remaining), installment: r.installment == null ? null : Number(r.installment),
  applyYm: r.apply_ym == null ? null : Number(r.apply_ym),
  changeId: r.change_id || null, changeClosed: r.change_id ? !!r.change_closed : null, createdBy: r.created_by || "",
});
const lastIn = (rows) => rows.slice().sort((a, b) => b.pay_date.localeCompare(a.pay_date) || b.id - a.id);
// افزایش سرمایه/عضویتِ ثبت‌شده که هنوز در فیش نیامده (apply_ym بعد از ماه آخرین فیش)
const pendingOf = (rows, slipYm, excludeId) => lastIn(rows.filter((x) => [1, 3].includes(x.kind) && x.new_capital != null && Number(x.apply_ym) > slipYm && x.id !== excludeId))[0] || null;
async function anyClosed(conn, o) {
  const ids = [o.change_id, o.change_id2].filter(Boolean);
  if (!ids.length) return false;
  const [m] = await conn.query("SELECT id FROM monthly_changes WHERE id IN (?) AND closed = 1", [ids]);
  return m.length > 0;
}
async function dropChanges(conn, o) { for (const id of [o.change_id, o.change_id2]) if (id) await conn.query("DELETE FROM monthly_changes WHERE id = ? AND closed = 0", [id]); }

// GET /api/vefagh/by-person/:code -> سوابق + وضعیت آخرین فیش + وضعیت عضویت
router.get("/by-person/:code", async (req, res) => {
  const code = toLatinDigits(req.params.code).trim();
  try {
    const kc = await loadKeyCodes(pool);
    const [rows] = await pool.query(`${SEL} WHERE v.code = ?`, [code]);
    const items = lastIn(rows);
    const last = items[0];
    const snap = await snapshot(pool, code, kc);
    const fc = snap ? snap.codes : fundCodes(kc, "active");
    const ctx0 = await loadCtx(pool), sh = shareOf(snap, ctx0), ctx = { ...ctx0, fundShare: sh.amount, shareSource: sh.source };   // سهم صندوق از فیش
    const slipYm = snap ? snap.year * 12 + snap.month : 0;
    const pr = pendingOf(rows, slipYm, 0);
    res.json({ items: items.map(toJSON), snapshot: snap, codes: fc, ctx, pending: pr ? { id: pr.id, newCapital: Number(pr.new_capital), applyYm: Number(pr.apply_ym) } : null, cancelDate: last && last.kind === 4 ? last.pay_date : "" });
  } catch (e) { sendError(res, e); }
});

// GET /api/vefagh/settlement/:code -> پیش‌فرض‌های دیالوگ لغو عضویت (سرمایه و مانده وام آخرین فیش)
router.get("/settlement/:code", async (req, res) => {
  const code = toLatinDigits(req.params.code).trim();
  try {
    const kc = await loadKeyCodes(pool);
    const snap = await snapshot(pool, code, kc);
    const fc = snap ? snap.codes : fundCodes(kc, "active");
    res.json({ codes: fc, hasPayslip: !!snap, member: !!(snap && snap.capital.has), capital: snap ? snap.capital.remaining : null, loanRemaining: snap ? snap.loan.remaining : 0,
      year: snap ? snap.year : null, month: snap ? snap.month : null });
  } catch (e) { sendError(res, e); }
});

function readBody(b) {
  const kind = parseInt(num(b.kind), 10);
  if (![1, 2, 3].includes(kind)) throw new Error("نوع باید افزایش سرمایه، تسویه وام یا عضویت باشد.");
  const date = toLatinDigits(b.date || "").trim();
  if (!DATE_RE.test(date)) throw new Error("تاریخ را به‌صورت 1405/07/21 وارد کنید.");
  const amount = Math.round(num(b.amount));
  if (!(amount > 0)) throw new Error("مبلغ را وارد کنید.");
  const slipNo = toLatinDigits(b.slipNo || "").trim().slice(0, 30);
  if (!slipNo) throw new Error("شمارهٔ فیش را وارد کنید.");
  const installment = Math.max(0, Math.round(num(b.installment)));
  return { kind, date, amount, slipNo, installment };
}

async function save(req, res, id) {
  const code = id ? null : toLatinDigits((req.body || {}).code || "").trim();
  let rec; try { rec = readBody(req.body || {}); } catch (e) { return bad(res, userMsg(e)); }
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    let old = null;
    if (id) {
      const [[o]] = await conn.query(`${SEL} WHERE v.id = ? FOR UPDATE`, [id]);
      if (!o) { await conn.rollback(); return bad(res, "ردیف پیدا نشد.", 404); }
      if (o.kind === 4) { await conn.rollback(); return bad(res, "ردیف «لغو عضویت» قابل ویرایش نیست؛ آن را حذف و دوباره ثبت کنید.", 409); }
      if (await anyClosed(conn, o)) { await conn.rollback(); return bad(res, "ردیف تغییرات ماهانهٔ این ثبت بسته شده است؛ ابتدا در «تغییرات ماهانه» تیک «بسته شدن» را بردارید.", 409); }
      old = o; rec.code = o.code;
    } else {
      rec.code = code;
      const [p] = await conn.query("SELECT code FROM personnel WHERE code = ?", [code]);
      if (!p.length) { await conn.rollback(); return bad(res, "این کد پرسنلی در کارگزینی نیست.", 404); }
    }
    const hb = await heirBlock(conn, rec.code);
    if (hb) { await conn.rollback(); return bad(res, hb, 409); }
    const kc = await loadKeyCodes(conn);
    const snap = await snapshot(conn, rec.code, kc);
    const fc = snap ? snap.codes : fundCodes(kc, "active");
    if (rec.kind === 2 ? !fc.loan : !fc.capital) { await conn.rollback(); return bad(res, rec.kind === 2 ? "کد وام وفاق در «تنظیمات ← تعریف کدهای مهم» تعریف نشده است." : NO_CODE, 409); }
    if (rec.kind === 1 && (!snap || !snap.capital.has)) { await conn.rollback(); return bad(res, `در آخرین فیش این فرد کد ${fc.capital} (سرمایهٔ وام وفاق) پیدا نشد؛ افزایش سرمایه ثبت نمی‌شود. اگر عضو جدید است «عضویت» را انتخاب کنید.`, 409); }
    const by = userName(req);
    if (old) await dropChanges(conn, old);
    const slipYm = snap ? snap.year * 12 + snap.month : 0;
    const ctx0 = await loadCtx(conn), ctx = { ...ctx0, fundShare: shareOf(snap, ctx0).amount };   // سهم صندوق = قسط کد وفاق در آخرین فیش
    const ph = phaseOf(rec.date, ctx, snap), applyYm = ph.applyYm;   // بازهٔ الف/ب: بعد از بستن حقوق تا ساخت دورهٔ همان ماه = الف
    let pend = null;
    if (rec.kind === 1) {
      const [prs] = await conn.query("SELECT * FROM vefagh_ops WHERE code = ? AND kind IN (1, 3) AND apply_ym > ? AND id <> ?", [rec.code, slipYm, id || 0]);
      pend = pendingOf(prs, slipYm, id || 0);
    }
    let prevCap = snap ? snap.capital.remaining : null, newCap = null, inst = null, spec, share = 0;
    const note = `وام وفاق — ${KIND_TEXT[rec.kind]} ${rec.amount.toLocaleString("en-US")} ریال — فیش ${rec.slipNo}`;
    if (rec.kind === 1) {
      prevCap = pend ? Number(pend.new_capital) : snap.capital.remaining;
      share = ph.phase === "A" && !pend ? ctx.fundShare : 0;     // سهم صندوق فقط در بازهٔ «الف»
      newCap = prevCap + rec.amount + share; inst = snap.capital.installment;
      spec = { dcode: fc.capital, action: 2, inst, total: newCap, rem: newCap, notes: note + (share ? ` + سهم صندوق ${share.toLocaleString("en-US")}` : "") };
    } else if (rec.kind === 3) {
      prevCap = 0; newCap = rec.amount; inst = rec.installment > 0 ? rec.installment : ctx.fundShare;
      spec = { dcode: fc.capital, action: 1, inst, total: rec.amount, rem: rec.amount, notes: note };
    } else {
      if (pend) prevCap = Number(pend.new_capital);
      spec = { dcode: fc.loan, action: 3, notes: note };
    }
    const changeId = await insertChange(conn, { code: rec.code, date: rec.date, by, ...spec });
    const vals = [rec.kind, rec.date, rec.amount, rec.slipNo, prevCap, snap ? snap.loan.remaining : null, newCap, inst, applyYm, changeId];
    let rid = id;
    if (id) await conn.query("UPDATE vefagh_ops SET kind=?, pay_date=?, amount=?, slip_no=?, prev_capital=?, loan_remaining=?, new_capital=?, installment=?, apply_ym=?, change_id=?, change_id2=NULL WHERE id=?", [...vals, id]);
    else { const [r] = await conn.query("INSERT INTO vefagh_ops (kind, pay_date, amount, slip_no, prev_capital, loan_remaining, new_capital, installment, apply_ym, change_id, code, created_by) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)", [...vals, rec.code, by]); rid = r.insertId; }
    await conn.commit();
    res.json({ ok: true, id: rid, changeId, changeValue: newCap, prevCapital: prevCap, newCapital: newCap, fundShare: share, phase: ph.phase });
  } catch (e) { await conn.rollback(); sendError(res, e); } finally { conn.release(); }
}
router.post("/", (req, res) => save(req, res, null));
router.patch("/:id", (req, res) => save(req, res, parseInt(req.params.id, 10)));

// POST /api/vefagh/cancel/:code { date, capital, loanRemaining } -> لغو عضویت (مبلغ قابل پرداخت = سرمایه − مانده وام)
router.post("/cancel/:code", async (req, res) => {
  const code = toLatinDigits(req.params.code).trim();
  const b = req.body || {};
  const date = toLatinDigits(b.date || "").trim();
  if (!DATE_RE.test(date)) return bad(res, "تاریخ لغو عضویت را به‌صورت 1405/07/21 وارد کنید.");
  const cap = Math.max(0, Math.round(num(b.capital))), rem = Math.max(0, Math.round(num(b.loanRemaining))), payable = Math.max(0, cap - rem);
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [p] = await conn.query("SELECT code FROM personnel WHERE code = ?", [code]);
    if (!p.length) { await conn.rollback(); return bad(res, "این کد پرسنلی در کارگزینی نیست.", 404); }
    const hb = await heirBlock(conn, code);
    if (hb) { await conn.rollback(); return bad(res, hb, 409); }
    const snap = await snapshot(conn, code, await loadKeyCodes(conn));
    const fc = snap ? snap.codes : fundCodes(await loadKeyCodes(conn), "active"), by = userName(req);
    if (!fc.capital) { await conn.rollback(); return bad(res, NO_CODE, 409); }
    const made = []; let first = null, second = null;
    for (const dcode of [fc.loan, fc.capital].filter(Boolean)) {
      const [ex] = await conn.query("SELECT id FROM monthly_changes WHERE code = ? AND deduction_code = ? AND change_date = ? AND action = 3 AND closed = 0", [code, dcode, date]);
      if (ex.length) continue;
      const cid = await insertChange(conn, { code, date, dcode, action: 3, notes: "وام وفاق — لغو عضویت", by });
      made.push(cid); if (first == null) first = cid; else second = cid;
    }
    const [r] = await conn.query("INSERT INTO vefagh_ops (kind, pay_date, amount, slip_no, prev_capital, loan_remaining, new_capital, installment, apply_ym, change_id, change_id2, code, created_by) VALUES (4,?,?,'',?,?,NULL,NULL,?,?,?,?,?)",
      [date, payable, cap, rem, phaseOf(date, await loadCtx(conn), snap).applyYm, first, second, code, by]);
    await conn.commit();
    res.json({ ok: true, id: r.insertId, changeRows: made.length, payable });
  } catch (e) { await conn.rollback(); sendError(res, e); } finally { conn.release(); }
});

router.delete("/:id", async (req, res) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [[o]] = await conn.query(`${SEL} WHERE v.id = ? FOR UPDATE`, [req.params.id]);
    if (!o) { await conn.rollback(); return bad(res, "ردیف پیدا نشد.", 404); }
    if (await anyClosed(conn, o)) { await conn.rollback(); return bad(res, "ردیف تغییرات ماهانهٔ این ثبت بسته شده است؛ ابتدا در «تغییرات ماهانه» تیک «بسته شدن» را بردارید.", 409); }
    await dropChanges(conn, o);
    await conn.query("DELETE FROM vefagh_ops WHERE id = ?", [o.id]);
    await conn.commit();
    res.json({ ok: true });
  } catch (e) { await conn.rollback(); sendError(res, e); } finally { conn.release(); }
});

module.exports = router;
