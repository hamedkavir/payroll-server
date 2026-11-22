// گزارش‌های مالی: جمع ماهانه و مانده اقساط مساعده، فروش اقساطی کالا و وام
// نکته: مانده‌ها «بر اساس برنامهٔ اقساط» برآورد می‌شوند (به فیش حقوقی وصل نیستند).
//
// ماه حقوقی بر اساس «تاریخ بستن فایل حقوق» (جدول payroll_closings) تعیین می‌شود:
// هر تاریخ، به ماه حقوقیِ نخستین بستنی که تاریخش بزرگ‌تر یا مساوی آن است تعلق دارد
// (مثلاً ۱۴۰۵/۰۶/۱۶ تا ۱۴۰۵/۰۷/۱۵ = حقوق مهر). تاریخ‌های بعد از آخرین بستن به «ماه حقوقی جاری (باز)» می‌روند.
// اگر هیچ بستنی ثبت نشده باشد، به‌ناچار ماه تقویمی استفاده می‌شود.
// ماه شروع کسر قابل تنظیم است: قسط k‌ام در ماه حقوقی (شروع + k) کسر می‌شود.
const express = require("express");
const { sendError, isBusinessError } = require("../errors");
const pool = require("../db");
const J = require("../jalali");
const { loadClosings } = require("./closings");
const { ceilStep, loadRounding } = require("../rounding");
const { rebuildPeriod, ensurePeriod } = require("../deductionSummary");
const { loadKeyCodes, kcFor } = require("../keyCodes");

const router = express.Router();
const toIdx = (y, m) => y * 12 + (m - 1);
const ymOf = (i) => `${Math.floor(i / 12)}/${J.pad2((i % 12) + 1)}`;
const calIdx = (s) => { const a = String(s || "").split("/").map(Number); return a.length >= 2 && a[0] && a[1] ? toIdx(a[0], a[1]) : null; };
const int = (v, d) => { const n = parseInt(v, 10); return Number.isFinite(n) ? n : d; };

// برنامهٔ اقساط: قسط آخر مابه‌التفاوت را می‌گیرد تا جمع دقیقاً برابر بدهی شود
function schedule(total, n, inst, startIdx) {
  const out = []; let left = total;
  for (let k = 0; k < n && left > 0; k++) {
    const a = k === n - 1 ? left : Math.min(inst || left, left);
    out.push({ idx: startIdx + k, amount: a });
    left -= a;
  }
  return out;
}

// GET /api/reports/summary?y=1405&m=7[&fy=1405&fm=6]&advOffset=0&goodsOffset=1&loanOffset=2
//   (y,m) = ماه حقوقیِ پایان (ماه مرجع)؛ (fy,fm) = ماه حقوقیِ شروع بازه (پیش‌فرض = همان ماه مرجع)
router.get("/summary", async (req, res) => {
  const y = int(req.query.y, 1405), m = int(req.query.m, 1);
  const R = toIdx(y, m);
  const F = req.query.fy && req.query.fm ? Math.min(R, toIdx(int(req.query.fy, y), int(req.query.fm, m))) : R;
  const off = { adv: int(req.query.advOffset, 0), goods: int(req.query.goodsOffset, 1), loan: int(req.query.loanOffset, 2) };
  try {
    const closings = await loadClosings();
    const hasClosings = closings.length > 0;
    const last = closings[closings.length - 1];
    // تاریخ ← شمارهٔ ماه حقوقی
    const payIdx = (s) => {
      const d = String(s || "");
      if (!J.parse(d)) return calIdx(d);
      if (!hasClosings) return calIdx(d);
      for (const c of closings) if (d <= c.closeDate) return c.idx;
      return last.idx + 1;
    };
    // بازهٔ تاریخیِ گزارش
    const prevClose = [...closings].reverse().find((c) => c.idx < F);
    const endClose = closings.find((c) => c.idx === R);
    const rangeFrom = prevClose ? J.nextDay(prevClose.closeDate) : J.fmt(Math.floor(F / 12), (F % 12) + 1, 1);
    const rangeTo = endClose ? endClose.closeDate : J.monthEnd(Math.floor(R / 12), (R % 12) + 1);
    const range = {
      from: rangeFrom, to: rangeTo, fromYm: ymOf(F), toYm: ymOf(R),
      exactFrom: !!prevClose, exactTo: !!endClose, hasClosings,
      lastClosing: last ? { ym: ymOf(last.idx), date: last.closeDate } : null,
    };

    const rd = await loadRounding(pool);
    const [adv] = await pool.query("SELECT a.*, p.first_name, p.last_name, p.national_id, p.status AS person_status, ac.apply_year, ac.apply_month FROM advances a LEFT JOIN personnel p ON p.code = a.code LEFT JOIN advance_closings ac ON ac.id = a.closing_id WHERE a.status <> 'cancelled'");
    // وام امداد: فقط برای ستون «ثبت‌شده در بازه» (بسته‌شده‌ها)؛ در محاسبات پیش‌بینی/مانده نقشی ندارد
    const [emd] = await pool.query("SELECT e.*, p.first_name, p.last_name, p.national_id, p.status AS person_status, ac.apply_year, ac.apply_month FROM emdad_loans e LEFT JOIN personnel p ON p.code = e.code JOIN advance_closings ac ON ac.id = e.closing_id WHERE e.closed = 1");
    const [ord] = await pool.query("SELECT o.*, p.first_name, p.last_name, p.national_id, p.status AS person_status FROM goods_orders o LEFT JOIN personnel p ON p.code = o.code WHERE o.status = 'active'");
    const [lq] = await pool.query("SELECT l.*, p.first_name, p.last_name, p.status AS person_status FROM loan_queue l LEFT JOIN personnel p ON p.code = l.code WHERE l.status IN ('pending','received')");

    const monthly = { advances: {}, goods: {}, loans: {} };
    const bump = (bucket, idx, amount) => {
      if (idx == null || idx > R || idx < R - 11) return;
      const k = ymOf(idx); const b = (bucket[k] = bucket[k] || { ym: k, count: 0, amount: 0 });
      b.count++; b.amount += amount;
    };
    const proj = {}; for (let i = R; i < R + 12; i++) proj[i] = { ym: ymOf(i), advance: 0, goods: 0, loan: 0 };
    const debts = { advances: [], goods: [], loans: [] };
    const ded = { advances: 0, goods: 0, loans: 0 };               // کسر برآوردی در ماه‌های حقوقی بازه
    const inRange = { advances: [], goods: [], loans: [] };        // ثبت‌شده‌ها در بازهٔ تاریخی
    const whoOf = (r) => ({ code: r.code, name: [r.first_name, r.last_name].filter(Boolean).join(" "), personStatus: r.person_status || "" });

    function addDebt(kind, key, item, total, n, inst, startIdx) {
      const sch = schedule(total, Math.max(1, n), inst, startIdx);
      let remCount = 0, remAmount = 0, dueNow = 0;
      for (const s of sch) {
        if (s.idx > R) { remCount++; remAmount += s.amount; }
        if (s.idx === R) dueNow += s.amount;
        if (s.idx >= F && s.idx <= R) ded[kind] += s.amount;
        if (proj[s.idx]) proj[s.idx][key] += s.amount;
      }
      const lastAmt = sch.length ? sch[sch.length - 1].amount : 0;
      if (remCount || dueNow) debts[kind].push({ ...item, total, installments: n, installmentAmount: inst, lastInstallmentAmount: lastAmt, startYm: ymOf(startIdx), remainingCount: remCount, remainingAmount: remAmount, dueNow });
    }
    const inR = (d) => d && d >= rangeFrom && d <= rangeTo;

    let pendingCount = 0, pendingAmount = 0;
    for (const a of adv) {
      const amount = Number(a.amount), inst = Number(a.installment_amount);
      bump(monthly.advances, payIdx(a.request_date), amount);
      if (inR(a.request_date)) inRange.advances.push({ ...whoOf(a), date: a.request_date, amount, installments: a.installments, installmentAmount: inst, status: a.status });
      if (a.status === "pending") { pendingCount++; pendingAmount += amount; continue; }
      const base = payIdx(a.paid_date) ?? payIdx(a.request_date);
      if (base != null) addDebt("advances", "advance", whoOf(a), amount, a.installments, inst, base + off.adv);
    }
    for (const o of ord) {
      const d = payIdx(o.order_date), total = Number(o.total);
      bump(monthly.goods, d, total);
      if (inR(o.order_date)) inRange.goods.push({ ...whoOf(o), date: o.order_date, amount: total, installments: o.installments, installmentAmount: Number(o.installment_amount), status: o.status });
      if (d != null) addDebt("goods", "goods", whoOf(o), total - Number(o.down_payment), o.installments, Number(o.installment_amount), d + off.goods);
    }
    for (const l of lq) {
      const d = payIdx(l.request_date) ?? toIdx(l.registration_year, l.registration_month);
      const amount = Number(l.loan_amount);
      bump(monthly.loans, d, amount);
      const rd = l.request_date;
      if (inR(rd)) inRange.loans.push({ ...whoOf(l), date: rd, amount, installments: l.installment_months, installmentAmount: Number(l.installment_amount), status: l.status });
      if (l.status === "received") addDebt("loans", "loan", whoOf(l), amount, l.installment_months, Number(l.installment_amount), toIdx(l.due_year, l.due_month) + off.loan);
    }

    // ---- ردیف‌های خروجی اکسل «ثبت‌شده در بازه»: مساعده + کالا (تجمیعی هر فرد) + تغییرات ماهانه
    const kc = await loadKeyCodes(pool);
    const stText = (s) => (/بازنشسته|وظیفه/.test(String(s || "")) ? "بازنشسته" : "شاغل");
    const who2 = (r) => ({ code: String(r.code), nationalId: r.national_id || "", firstName: r.first_name || "", lastName: r.last_name || "", status: stText(r.person_status) });
    const monthOf = (idx) => (idx == null ? "" : (idx % 12) + 1);          // ماه حقوقی (۱ تا ۱۲)
    const exportRows = [];
    // مساعده و وام امدادِ «بسته‌شده» که ماه حقوقیِ اعمالشان (بستن مساعده و امداد ← «اعمال در ماه حقوقی») در ماه‌های بازهٔ گزارش است
    const applyIdx = (r) => (r.apply_year && r.apply_month ? toIdx(r.apply_year, r.apply_month) : null);
    const inMonths = (idx) => idx != null && idx >= F && idx <= R;
    const kcOf = (r) => kcFor(kc, who2(r).status === "بازنشسته" ? "retiree" : "active");
    for (const a of adv) { const ai = applyIdx(a); if (a.closed && inMonths(ai)) exportRows.push({ ...who2(a), type: "مساعده", dcode: kcOf(a).advance, loanRow: monthOf(ai), total: Number(a.amount), installment: Number(a.installment_amount), remaining: Number(a.amount), statusCode: 1, _d: a.paid_date || a.request_date }); }
    for (const e of emd) { const ai = applyIdx(e); if (inMonths(ai)) exportRows.push({ ...who2(e), type: "وام امداد", dcode: kcOf(e).emdad || "", loanRow: monthOf(ai), total: Number(e.amount), installment: Number(e.installment_amount), remaining: Number(e.amount) - Number(e.grant_amount || 0), statusCode: 1, _d: e.paid_date || e.request_date }); }
    const gOrders = ord.filter((o) => inR(o.order_date));
    const gCodes = {};
    if (gOrders.length) {
      const [gi] = await pool.query("SELECT i.order_id, g.deduction_code FROM goods_order_items i LEFT JOIN products p ON p.id = i.product_id LEFT JOIN product_groups g ON g.id = p.group_id WHERE i.order_id IN (?)", [gOrders.map((o) => o.id)]);
      for (const r of gi) if (r.deduction_code) (gCodes[r.order_id] = gCodes[r.order_id] || new Set()).add(String(r.deduction_code));
    }
    const byPerson = new Map();
    for (const o of gOrders) {
      const g = byPerson.get(String(o.code)) || { ...who2(o), type: "کالا", codes: new Set(), loanDate: "", total: 0, installment: 0, remaining: 0, statusCode: 1 };
      g.total += Number(o.total); g.installment += Number(o.installment_amount); g.remaining += Number(o.total) - Number(o.down_payment);
      if (o.order_date > g.loanDate) g.loanDate = o.order_date;
      for (const c of gCodes[o.id] || []) g.codes.add(c);
      byPerson.set(String(o.code), g);
    }
    for (const g of byPerson.values()) exportRows.push({ code: g.code, nationalId: g.nationalId, firstName: g.firstName, lastName: g.lastName, status: g.status, type: "کالا", dcode: [...g.codes].join("، "), loanRow: monthOf(payIdx(g.loanDate)), total: g.total, installment: g.installment, remaining: g.remaining, statusCode: 1, _d: g.loanDate });
    const [chg] = await pool.query("SELECT m.*, p.first_name, p.last_name, p.national_id, p.status AS person_status FROM monthly_changes m LEFT JOIN personnel p ON p.code = m.code WHERE m.change_date >= ? AND m.change_date <= ?", [rangeFrom, rangeTo]);
    for (const c of chg) exportRows.push({ ...who2(c), type: "تغییرات ماهانه", dcode: String(c.deduction_code || ""), loanRow: c.loan_row || "", total: c.total_amount == null ? "" : Number(c.total_amount), installment: c.installment_amount == null ? "" : Number(c.installment_amount), remaining: c.remaining == null ? "" : Number(c.remaining), statusCode: c.action, _d: c.change_date });
    const ORDER = { "مساعده": 1, "وام امداد": 2, "کالا": 3, "تغییرات ماهانه": 4 };
    exportRows.sort((a, b) => ORDER[a.type] - ORDER[b.type] || String(a.code).localeCompare(String(b.code), "en", { numeric: true }) || String(a._d).localeCompare(String(b._d)));
    exportRows.forEach((r) => delete r._d);

    const sum = (arr, f) => arr.reduce((s, x) => s + x[f], 0);
    const block = (kind, extra = {}) => ({
      active: debts[kind].length, remainingAmount: sum(debts[kind], "remainingAmount"), dueNow: sum(debts[kind], "dueNow"),
      items: debts[kind].sort((a, b) => b.remainingAmount - a.remainingAmount),
      monthly: Object.values(monthly[kind]).sort((a, b) => a.ym.localeCompare(b.ym)),
      registered: { count: inRange[kind].length, amount: sum(inRange[kind], "amount"), items: inRange[kind].sort((a, b) => a.date.localeCompare(b.date)) },
      deducted: ded[kind], ...extra,
    });
    res.json({
      ref: ymOf(R), offsets: off, range, exportRows,
      advances: block("advances", { pendingCount, pendingAmount }),
      goods: block("goods"), loans: block("loans"),
      // جدول پیش‌بینی: هر عدد به بالا طبق گام قسط همان نوع (تنظیمات گرد کردن) رند می‌شود و جمع = جمع اعداد رندشده
      projection: Object.values(proj).map((p) => {
        const a = ceilStep(p.advance, rd.roundAdvInst), g = ceilStep(p.goods, rd.roundGoodsInst), l = ceilStep(p.loan, rd.roundLoanInst);
        return { ym: p.ym, advance: a, goods: g, loan: l, total: a + g + l };
      }),
    });
  } catch (e) { sendError(res, e); }
});

// ---------------------------------------------------------------------------
// گزارش تجمیعی کسورات یک ماه (شاغلین + بازنشستگان) با مقایسه با ماه قبل
// GET  /api/reports/deductions?year=1405&month=6
// POST /api/reports/deductions/rebuild  { year, month }   (بازسازی از فیش‌های واردشده)
// ---------------------------------------------------------------------------
const codeNum = (c) => (/^\d+$/.test(String(c || "")) ? Number(c) : Infinity);
async function periodOf(year, month) {
  const [[p]] = await pool.query("SELECT id, year, month, issue_date, active_file, retiree_file, loan_file FROM periods WHERE year = ? AND month = ?", [year, month]);
  return p || null;
}
async function loadSummary(periodId) {
  const [rows] = await pool.query("SELECT kind, ded_key, code, label, people_count, total_amount FROM deduction_summary WHERE period_id = ?", [periodId]);
  const [tot] = await pool.query("SELECT kind, people_count, gross, deductions, net, employer FROM period_totals WHERE period_id = ?", [periodId]);
  return { rows, tot };
}
const totObj = (tot, kind) => {
  const t = tot.find((x) => x.kind === kind);
  return t ? { people: Number(t.people_count), gross: Number(t.gross), deductions: Number(t.deductions), net: Number(t.net), employer: Number(t.employer) } : { people: 0, gross: 0, deductions: 0, net: 0, employer: 0 };
};
router.get("/deductions", async (req, res) => {
  const year = parseInt(req.query.year, 10), month = parseInt(req.query.month, 10);
  if (!(year >= 1300 && year <= 1600) || !(month >= 1 && month <= 12)) return res.status(400).json({ error: "invalid_input", message: "سال و ماه معتبر انتخاب کنید." });
  try {
    const per = await periodOf(year, month);
    if (!per) return res.json({ found: false, year, month });
    await ensurePeriod(pool, per.id);
    const cur = await loadSummary(per.id);
    // ماه قبلِ موجود (نزدیک‌ترین دورهٔ قبل از این ماه که فیش دارد)
    const [prevs] = await pool.query("SELECT id, year, month FROM periods WHERE (year < ? OR (year = ? AND month < ?)) ORDER BY year DESC, month DESC LIMIT 3", [year, year, month]);
    let prev = null, prevSum = null;
    for (const p of prevs) {
      await ensurePeriod(pool, p.id);
      const sm = await loadSummary(p.id);
      if (sm.tot.length) { prev = p; prevSum = sm; break; }
    }
    // شاغلین و بازنشستگان کد کسر و شرح جدا دارند؛ در جدول ردیفِ مشترک فقط وقتی ساخته می‌شود که شرح هر دو گروه یکی باشد.
    // اگر یک کد در دو گروه شرح متفاوت دارد، هر گروه ردیف خودش را دارد (کلید با پسوند گروه) تا شرح بازنشستگان با شاغلین قاطی نشود.
    const labs = new Map();   // ded_key ← { active: برچسب، retiree: برچسب } (دورهٔ جاری و قبل)
    const normLab = (t) => String(t || "").replace(/[يى]/g, "ی").replace(/ك/g, "ک").replace(/[\u200c\s]+/g, "");
    for (const r of [...cur.rows, ...(prevSum ? prevSum.rows : [])]) { const e = labs.get(r.ded_key) || {}; if (!e[r.kind] && r.label) e[r.kind] = r.label; labs.set(r.ded_key, e); }
    const split = (key) => { const e = labs.get(key) || {}; return !!(e.active && e.retiree && normLab(e.active) !== normLab(e.retiree)); };
    const map = new Map();
    const get = (r) => {
      const k = split(r.ded_key) ? r.ded_key + "\u0001" + r.kind : r.ded_key;
      let it = map.get(k);
      if (!it) { it = { key: k, code: r.code, label: r.label, activeLabel: "", retireeLabel: "", activeCount: 0, activeTotal: 0, retireeCount: 0, retireeTotal: 0, prevTotal: 0, prevActive: 0, prevRetiree: 0 }; map.set(k, it); }
      if (r.kind === "active") it.activeLabel = it.activeLabel || r.label; else it.retireeLabel = it.retireeLabel || r.label;
      return it;
    };
    for (const r of cur.rows) {
      const it = get(r);
      if (r.kind === "active") { it.activeCount = Number(r.people_count); it.activeTotal = Number(r.total_amount); }
      else { it.retireeCount = Number(r.people_count); it.retireeTotal = Number(r.total_amount); }
    }
    if (prevSum) for (const r of prevSum.rows) { const it = get(r), v = Number(r.total_amount); it.prevTotal += v; if (r.kind === "active") it.prevActive += v; else it.prevRetiree += v; }
    const items = [...map.values()].map((it) => ({ ...it, count: it.activeCount + it.retireeCount, total: it.activeTotal + it.retireeTotal, diff: it.activeTotal + it.retireeTotal - it.prevTotal }))
      .sort((a, b) => codeNum(a.code) - codeNum(b.code) || String(a.label).localeCompare(String(b.label), "fa"));
    const a = totObj(cur.tot, "active"), r = totObj(cur.tot, "retiree");
    res.json({
      found: true, hasData: cur.tot.length > 0,
      period: { id: per.id, year, month, issueDate: per.issue_date || "", activeFile: per.active_file || "", retireeFile: per.retiree_file || "", loanFile: per.loan_file || "" },
      prev: prev ? { year: prev.year, month: prev.month } : null,
      totals: { active: a, retiree: r, all: { people: a.people + r.people, gross: a.gross + r.gross, deductions: a.deductions + r.deductions, net: a.net + r.net, employer: a.employer + r.employer } },
      prevTotals: prevSum ? (() => { const pa = totObj(prevSum.tot, "active"), pr = totObj(prevSum.tot, "retiree"); return { deductions: pa.deductions + pr.deductions, net: pa.net + pr.net, gross: pa.gross + pr.gross, active: pa, retiree: pr }; })() : null,
      items,
    });
  } catch (err) { sendError(res, err); }
});
router.post("/deductions/rebuild", async (req, res) => {
  const year = parseInt((req.body || {}).year, 10), month = parseInt((req.body || {}).month, 10);
  try {
    const per = await periodOf(year, month);
    if (!per) return res.status(404).json({ error: "not_found", message: "برای این ماه دوره‌ای ساخته نشده است." });
    const r = await rebuildPeriod(pool, per.id);
    res.json({ ok: true, ...r });
  } catch (err) { sendError(res, err); }
});

// ---------------------------------------------------------------------------
// گزارش کسور اقساط: هر کسی که کد کسر مورد نظر در فیش‌اش بین دو دورهٔ حقوقی بوده (شاغلین و بازنشستگان جدا)
// GET /api/reports/deduction-people?fy=1405&fm=1&ty=1405&tm=6&code=733   (از دورهٔ fy/fm تا دورهٔ ty/tm، با دو سر)
// ---------------------------------------------------------------------------
const { dedItemsOf } = require("../deductionSummary");
const { toLatinDigits } = require("../textNormalize");
const MAX_DP_MONTHS = 36;
const faDigits = (v) => toLatinDigits(v == null ? "" : String(v));
const sameCode = (a, b) => { a = String(a || "").trim(); b = String(b || "").trim(); return !!a && !!b && (a === b || (/^\d+$/.test(a) && /^\d+$/.test(b) && Number(a) === Number(b))); };
router.get("/deduction-people", async (req, res) => {
  const fy = int(faDigits(req.query.fy), 0), fm = int(faDigits(req.query.fm), 0), ty = int(faDigits(req.query.ty), 0), tm = int(faDigits(req.query.tm), 0);
  const code = faDigits(req.query.code).trim();
  const okYm = (y, m) => y >= 1300 && y <= 1600 && m >= 1 && m <= 12;
  if (!okYm(fy, fm) || !okYm(ty, tm)) return res.status(400).json({ error: "invalid_input", message: "دورهٔ حقوقی «از» و «تا» را درست انتخاب کنید." });
  const fi = toIdx(fy, fm), ti = toIdx(ty, tm);
  if (fi > ti) return res.status(400).json({ error: "invalid_input", message: "«از دوره» نباید بعد از «تا دوره» باشد." });
  if (!code || code.length > 30) return res.status(400).json({ error: "invalid_input", message: "کد کسر را وارد کنید." });
  if (ti - fi + 1 > MAX_DP_MONTHS) return res.status(400).json({ error: "invalid_input", message: `بازه حداکثر ${MAX_DP_MONTHS} ماه حقوقی می‌تواند باشد.` });
  try {
    const [pers] = await pool.query("SELECT id, year, month, loans_data FROM periods WHERE (year * 12 + month - 1) BETWEEN ? AND ? ORDER BY year, month", [fi, ti]);
    const out = { active: new Map(), retiree: new Map() };   // کد پرسنلی ← فرد
    const periods = [];
    for (const per of pers) {
      periods.push(ymOf(toIdx(per.year, per.month)));
      let loansAll = per.loans_data;
      if (typeof loansAll === "string") { try { loansAll = JSON.parse(loansAll); } catch (e) { loansAll = null; } }
      loansAll = loansAll || {};
      const [rows] = await pool.query("SELECT kind, code, name, national_id, data FROM people WHERE period_id = ?", [per.id]);
      for (const r of rows) {
        let d = r.data; if (typeof d === "string") { try { d = JSON.parse(d); } catch (e) { d = null; } }
        if (!d) continue;
        const kind = r.kind === "retiree" ? "retiree" : "active";
        let amount = 0; const labels = [], refs = [], recs = [];   // recs = هر ردیف/سریِ تکراریِ همین کد یک رکورد جدا
        for (const it of dedItemsOf(kind, d, kind === "active" ? loansAll[r.code] : null)) {
          if (!sameCode(it.code, code)) continue;
          amount += Number(it.v) || 0;
          recs.push({ label: it.label || "", ref: String(it.ref || ""), amount: Number(it.v) || 0 });
          if (it.label && !labels.includes(it.label)) labels.push(it.label);
          if (it.ref && !refs.includes(String(it.ref))) refs.push(String(it.ref));
        }
        if (!amount) continue;
        let p = out[kind].get(r.code);
        if (!p) { p = { code: r.code, name: r.name, nationalId: r.national_id || "", firstName: "", lastName: "", total: 0, months: [], records: [] }; out[kind].set(r.code, p); }
        p.name = r.name || p.name; p.nationalId = r.national_id || p.nationalId;
        p.total += amount;
        const ym = ymOf(toIdx(per.year, per.month));
        p.months.push({ ym, amount, label: labels.join("، "), ref: refs.join("، ") });
        for (const x of recs) p.records.push({ ym, ...x });
      }
    }
    // نام و نام خانوادگی و کد ملی از بانک اطلاعات پرسنل؛ اگر نبود، نام کامل فیش (واژهٔ اول = نام، بقیه = نام خانوادگی)
    const codes = [...new Set([...out.active.keys(), ...out.retiree.keys()])];
    const pm = new Map();
    if (codes.length) {
      const [pr] = await pool.query("SELECT code, first_name, last_name, national_id FROM personnel WHERE code IN (?)", [codes]);
      for (const x of pr) pm.set(String(x.code), x);
    }
    for (const m of [out.active, out.retiree]) for (const p of m.values()) {
      const x = pm.get(String(p.code));
      if (x && (x.first_name || x.last_name)) { p.firstName = x.first_name || ""; p.lastName = x.last_name || ""; if (!p.nationalId) p.nationalId = x.national_id || ""; }
      else { const t = String(p.name || "").trim().split(/\s+/); p.firstName = t.shift() || ""; p.lastName = t.join(" "); }
    }
    const pack = (m) => {
      const people = [...m.values()].sort((a, b) => codeNum(a.code) - codeNum(b.code) || String(a.code).localeCompare(String(b.code)));
      return { people, count: people.length, total: people.reduce((s, p) => s + p.total, 0), rows: people.reduce((s, p) => s + p.months.length, 0) };
    };
    res.json({ code, fromYm: ymOf(fi), toYm: ymOf(ti), periods, active: pack(out.active), retiree: pack(out.retiree) });
  } catch (err) { sendError(res, err); }
});

module.exports = router;
