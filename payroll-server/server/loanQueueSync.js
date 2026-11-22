// تشخیص اتمام اقساط و ثبت خودکار نوبت وام (صندوق وام ضروری)
//
// سناریوی نهایی (طبق تأیید کاربر):
// ۱) وقتی در فایل کسور شاغلین (گزارش اقساط) یا فایل بازنشستگان، «مانده» قلم کد ۷۱۰ صفر شود،
//    برای آن نفر یک نوبت وام ساخته می‌شود.
// ۲) تاریخ نوبت = دوره‌ای که کد ۷۱۰ صفر شد + «مدت انتظار» ماه (پیش‌فرض ۱۲ ماه = یک سال بعد).
// ۳) مبلغ وام = («مانده» کد ۷۹۶ در همان فایلی که ۷۱۰ در آن صفر شده + مدت انتظار × سهم صندوق) × ۳
//    رند به بالا تا مضرب ده‌میلیون (۷ رقم) و در صورت بیشتر شدن، برابر «حداکثر وام».
//    مدت انتظار، سهم صندوق و حداکثر وام قابل تنظیم‌اند (form_settings: loanWaitMonths, loanFundShare, loanMax).
// ۴) قسط = مبلغ وام ÷ ۳۶ (تعداد ماه قابل تغییر)، رند به بالا تا مضرب یک‌میلیون (۶ رقم).
// همهٔ مبلغ‌ها همان لحظهٔ ثبت نوبت محاسبه و ذخیره می‌شوند.

const { ROUND_DEFAULTS, stepOf } = require("./rounding"); // گام رند وام و قسط وام از «تنظیمات ← گرد کردن مبالغ» (پیش‌فرض ۱۰ میلیون و ۱ میلیون)
const { loadKeyCodes, KEY_CODE_DEFAULTS, kcFor } = require("./keyCodes");
const { pendingCapital } = require("./capitalEffective");   // کد وام (loan1) و سرمایه (capital) از «تعریف کدهای مهم»
const DEFAULT_INSTALLMENT_MONTHS = 36;
const DEFAULT_LOAN_PARAMS = { wait: 12, share: 6000000, max: 0, roundLoan: ROUND_DEFAULTS.roundLoan, roundInst: ROUND_DEFAULTS.roundLoanInst };   // max = 0 یعنی بدون سقف
const LOAN_MULTIPLIER = 3;

// رند به بالا (با تحمل خطای اعشاری)
function roundUpToStep(x, step) {
  const n = Math.round(Number(x) || 0);
  return step > 1 ? Math.ceil(n / step) * step : n;
}

// پارامترهای فرمول وام از تنظیمات (q می‌تواند pool یا connection باشد)
async function loadLoanParams(q) {
  try {
    const [rows] = await q.query("SELECT data FROM form_settings WHERE id = 1");
    let d = rows[0] && rows[0].data; if (typeof d === "string") d = JSON.parse(d);
    d = d || {};
    const n = (v, def) => (v === undefined || v === null || v === "" || !Number.isFinite(Number(v)) ? def : Math.max(0, Number(v)));
    return { wait: n(d.loanWaitMonths, DEFAULT_LOAN_PARAMS.wait), share: n(d.loanFundShare, DEFAULT_LOAN_PARAMS.share), max: n(d.loanMax, DEFAULT_LOAN_PARAMS.max),
      roundLoan: stepOf(d.roundLoan, DEFAULT_LOAN_PARAMS.roundLoan), roundInst: stepOf(d.roundLoanInst, DEFAULT_LOAN_PARAMS.roundInst) };
  } catch (e) { return { ...DEFAULT_LOAN_PARAMS }; }
}

// افزودن ماه به (سال، ماه) شمسی: addMonths(1405, 6, 10) => { year: 1406, month: 4 }
function addMonths(year, month, n) {
  const t = Number(year) * 12 + (Number(month) - 1) + Math.max(0, Math.round(Number(n) || 0));
  return { year: Math.floor(t / 12), month: (t % 12) + 1 };
}

// وام = (سرمایهٔ اولیه + مدت انتظار × سهم صندوق) × ۳ ← رند به بالا (۷ رقم) ← حداکثر وام
function computeFigures(capital, months, params) {
  const P = params || DEFAULT_LOAN_PARAMS;
  const cap = Math.round(Number(capital) || 0);
  const raw = (cap + P.wait * P.share) * LOAN_MULTIPLIER;
  let loanAmount = roundUpToStep(raw, P.roundLoan);
  if (P.max > 0 && loanAmount > P.max) loanAmount = P.max;
  const installment = roundUpToStep(loanAmount / (months || DEFAULT_INSTALLMENT_MONTHS), P.roundInst);
  return { capital: cap, loanAmount, installment };
}

function findItem(items, code) {
  return (items || []).find((it) => String(it.code) === String(code));
}

async function hasOpenEntry(conn, code) {
  const [rows] = await conn.query("SELECT id FROM loan_queue WHERE code = ? AND status = 'pending' LIMIT 1", [code]);
  return rows.length > 0;
}

// سرمایهٔ جدیدِ افزایش‌یافته که هنوز در فیش نیامده، جای سرمایهٔ فیش را می‌گیرد
async function effCap(conn, code, year, month, fromSlip) {
  const p = await pendingCapital(conn, code, Number(year) * 12 + Number(month));
  return p ? p.newCapital : fromSlip;
}
async function createEntry(conn, { code, periodId, year, month, capital }) {
  const params = await loadLoanParams(conn);
  const f = computeFigures(capital, DEFAULT_INSTALLMENT_MONTHS, params);
  const due = addMonths(year, month, params.wait);   // نوبت = ماه اتمام قسط + مدت انتظار
  await conn.query(
    `INSERT IGNORE INTO loan_queue
      (code, registration_period_id, registration_year, registration_month, due_year, due_month,
       capital_amount, loan_amount, installment_months, installment_amount, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')`,
    [code, periodId, year, month, due.year, due.month, f.capital, f.loanAmount, DEFAULT_INSTALLMENT_MONTHS, f.installment]
  );
}

// شاغلین: نگاشت loans_data همان دوره (از فایل «گزارش کسر اقساط»)؛ سرمایه هم از همان فایل خوانده می‌شود
async function scanActiveLoans(conn, periodId, year, month, loansMap, kc = KEY_CODE_DEFAULTS, skip = null) {
  const created = [];
  for (const code in loansMap || {}) {
    if (skip && skip.has(String(code))) continue;   // قطع رابطه / سهم صندوق کسر نمی‌شود
    const items = loansMap[code];
    const loanItem = findItem(items, kc.loan1);
    if (!loanItem) continue;
    if (Math.round(Number(loanItem.remaining) || 0) > 0) continue; // هنوز مانده دارد
    if (await hasOpenEntry(conn, code)) continue;
    const cap = findItem(items, kc.capital);
    await createEntry(conn, { code, periodId, year, month, capital: await effCap(conn, code, year, month, cap ? cap.remaining : 0) });
    created.push(code);
  }
  return created;
}

// بازنشستگان: آرایهٔ items خام هر نفر (با remaining درون‌خطی در همان فایل)
const { isHeirRecord } = require("./eligibility");
async function scanRetireeLoans(conn, periodId, year, month, retireeRows, kc = KEY_CODE_DEFAULTS, skip = null) {
  const created = [];
  for (const r of retireeRows) {
    if (isHeirRecord(r.data)) continue;   // وظیفه‌بگیر مجاز به دریافت وام نیست
    const items = (r.data && r.data.items) || [];
    const kr = kcFor(kc, "retiree");   // کدهای بازنشستگان
    const loanItem = findItem(items, kr.loan1);
    if (!loanItem) continue;
    if (Math.round(Number(loanItem.remaining) || 0) > 0) continue;
    const code = r.code;
    if (skip && skip.has(String(code))) continue;
    if (!code || (await hasOpenEntry(conn, code))) continue;
    const cap = findItem(items, kr.capital);
    await createEntry(conn, { code, periodId, year, month, capital: await effCap(conn, code, year, month, cap ? cap.remaining : 0) });
    created.push(code);
  }
  return created;
}

// ثبت «دریافت وام» و تاریخ شروع/پایان اقساط
// ۱) فردِ در نوبت (pending) که در فایل کسور شاغلین/فیش بازنشستگان این دوره ردیف کد ۷۱۰ با «مانده > ۰» دارد
//    (و دورهٔ فایل بعد از ماه ثبت نوبت است) ← وضعیت «دریافت کرد»؛ شروع اقساط = همین دوره.
// ۲) پایان اقساط = دوره + ceil(مانده ÷ مبلغ قسط همان ماه). اگر در ماه‌های بعد مبلغ قسط عوض شود پایان هم به‌روز می‌شود.
//    «مانده» بعد از کسر همین ماه است (همان فرض تشخیص اتمام اقساط). دوره‌های قدیمی‌تر از آخرین دورهٔ دیده‌شده، تاریخ را عقب نمی‌برند.
function loanLines(period, retireeRows, kc = KEY_CODE_DEFAULTS) {
  const out = new Map();   // code → { amount, remaining }
  const put = (code, it, abs) => {
    if (!it || !code) return;
    const amount = Math.abs(Math.round(Number(it.v) || 0));
    out.set(String(code), { amount, remaining: Math.round(Number(it.remaining) || 0), paid: Math.abs(Math.round(Number(it.principal != null ? it.principal : it.loanAmt) || 0)) });
  };
  const lm = period.loans_data || {};
  for (const code in lm) put(code, findItem(lm[code], kc.loan1));
  for (const r of retireeRows) put(r.code, findItem((r.data && r.data.items) || [], kcFor(kc, "retiree").loan1));
  return out;
}
// خطوط وام دورهٔ قبل از این دوره (برای تشخیص «وام تازه»)؛ null اگر دورهٔ قبلی نیست
async function prevLoanLines(conn, pm, kc) {
  const [pr] = await conn.query("SELECT id, year, month, loans_data FROM periods WHERE year * 12 + month < ? ORDER BY year DESC, month DESC LIMIT 1", [pm]);
  if (!pr.length) return null;
  let ld = pr[0].loans_data; if (typeof ld === "string") { try { ld = JSON.parse(ld); } catch (e) { ld = {}; } }
  const [rr] = await conn.query("SELECT code, data FROM people WHERE period_id = ? AND kind = 'retiree'", [pr[0].id]);
  for (const r of rr) if (typeof r.data === "string") { try { r.data = JSON.parse(r.data); } catch (e) { r.data = {}; } }
  return loanLines({ year: pr[0].year, month: pr[0].month, loans_data: ld || {} }, rr, kc);
}
async function syncLoanReceipts(conn, period, periodId, retireeRows, kc = KEY_CODE_DEFAULTS) {
  const pm = Number(period.year) * 12 + Number(period.month);
  const received = [], endUpdated = [], registered = [];
  const prev = await prevLoanLines(conn, pm, kc);
  for (const [code, ln] of loanLines(period, retireeRows, kc)) {
    if (!(ln.amount > 0)) continue;
    const [ents] = await conn.query("SELECT * FROM loan_queue WHERE code = ? AND status IN ('pending','received') ORDER BY id DESC", [code]);
    const pending = ents.find((e) => e.status === "pending");
    const lastRecv = ents.find((e) => e.status === "received");
    const endOf = () => addMonths(period.year, period.month, ln.remaining > 0 ? Math.ceil(ln.remaining / ln.amount) : 0);
    if (pending && ln.remaining > 0 && (!pending.registration_year || pm > Number(pending.registration_year) * 12 + Number(pending.registration_month))) {
      const e = endOf();
      await conn.query(
        `UPDATE loan_queue SET status = 'received', received_at = COALESCE(received_at, NOW()),
           inst_start_year = ?, inst_start_month = ?, inst_end_year = ?, inst_end_month = ?, inst_current_amount = ?, inst_seen_ym = ?, inst_loan_paid = ? WHERE id = ?`,
        [period.year, period.month, e.year, e.month, ln.amount, pm, ln.paid || null, pending.id]);
      received.push({ code, start: `${period.year}/${period.month}`, end: `${e.year}/${e.month}`, amount: ln.amount, paid: ln.paid || 0 });
    } else if (!pending && lastRecv && lastRecv.inst_start_year) {
      const startYm = Number(lastRecv.inst_start_year) * 12 + Number(lastRecv.inst_start_month);
      if (pm < startYm || pm < Number(lastRecv.inst_seen_ym || 0)) continue;
      const e = endOf();
      const changed = Number(lastRecv.inst_end_year) !== e.year || Number(lastRecv.inst_end_month) !== e.month;
      await conn.query("UPDATE loan_queue SET inst_end_year = ?, inst_end_month = ?, inst_current_amount = ?, inst_seen_ym = ? WHERE id = ?", [e.year, e.month, ln.amount, pm, lastRecv.id]);
      if (changed) endUpdated.push({ code, old: `${lastRecv.inst_end_year}/${lastRecv.inst_end_month}`, end: `${e.year}/${e.month}`, amount: ln.amount });
    }
    // وام تازه برای کسی که در نوبت نبوده: برایش رکورد «دریافت‌شده» ثبت می‌شود.
    // «تازه» = در دورهٔ قبل ردیف وام با مانده > ۰ نداشته؛ اگر دورهٔ قبلی نیست، فقط وقتی «مبلغ وام» با مانده + قسط ماه اول جور باشد.
    if (!pending && ln.remaining > 0) {
      const pl = prev ? prev.get(String(code)) : null;
      const isNew = prev ? !(pl && pl.remaining > 0) : (ln.paid > 0 && ln.remaining + ln.amount >= ln.paid - 1);
      const sameLoan = lastRecv && lastRecv.inst_start_year && Number(lastRecv.inst_start_year) * 12 + Number(lastRecv.inst_start_month) === pm;
      if (isNew && !sameLoan) {
        const e = addMonths(period.year, period.month, Math.ceil(ln.remaining / ln.amount));
        const months = ln.paid > 0 ? Math.max(1, Math.ceil(ln.paid / ln.amount)) : DEFAULT_INSTALLMENT_MONTHS;
        try {
          await conn.query(
            `INSERT INTO loan_queue (code, registration_period_id, registration_year, registration_month, due_year, due_month,
               capital_amount, loan_amount, installment_months, installment_amount, status, received_at,
               inst_start_year, inst_start_month, inst_end_year, inst_end_month, inst_current_amount, inst_seen_ym, inst_loan_paid)
             VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?, ?, 'received', NOW(), ?, ?, ?, ?, ?, ?, ?)`,
            [code, periodId, period.year, period.month, period.year, period.month, ln.paid || ln.amount * months, months, ln.amount, period.year, period.month, e.year, e.month, ln.amount, pm, ln.paid || null]);
          registered.push({ code, start: `${period.year}/${period.month}`, end: `${e.year}/${e.month}`, amount: ln.amount, paid: ln.paid || 0 });
        } catch (err) { console.warn("ثبت وام دریافت‌شدهٔ خارج از نوبت ممکن نشد:", code, err.message); }
      }
    }
  }
  return { received, endUpdated, registered };
}

// کسانی که نباید نوبت وام داشته باشند: «قطع رابطه»، «وظیفه‌بگیر»، و کسی که در فیش این دوره سهم صندوق (کد سرمایه) از او کسر نمی‌شود.
// محافظ: اگر در کل این دوره تقریباً کسی کد سرمایه ندارد (فایل کسور هنوز نیامده یا کد اشتباه تعریف شده)، قاعدهٔ «کسر نمی‌شود» اعمال نمی‌شود.
// قاعدهٔ «سهم صندوق کسر نمی‌شود» برای هر گروه (شاغلین / بازنشستگان) جداگانه و فقط وقتی فایل همان گروه واقعاً بارگذاری شده سنجیده می‌شود؛
// ترتیب بارگذاری فایل‌ها (فیش شاغل، کسر اقساط شاغل، بازنشستگان) دیگر نتیجه را عوض نمی‌کند:
//  - شاغلین: فقط وقتی فایل کسر اقساط شاغلین (loans_data) این دوره آمده و دست‌کم ۵٪ شاغلین کد سرمایه دارند.
//  - بازنشستگان: فقط وقتی دست‌کم ۵٪ بازنشستگان همین دوره کد سرمایه دارند.
// اگر قاعده برای یک گروه اعمال نشود، در notes توضیح داده می‌شود (و هیچ نوبتی از آن گروه حذف نمی‌شود).
async function blockedPeople(conn, periodId, kc, loansMap, retireeRows, notes = []) {
  const out = new Map();
  const [cut] = await conn.query("SELECT code FROM personnel WHERE status LIKE '%قطع%'");
  for (const r of cut) out.set(String(r.code), "قطع رابطه");
  const [heirs] = await conn.query("SELECT code FROM personnel WHERE status LIKE '%وظیفه%'");
  const heirSet = new Set(heirs.map((r) => String(r.code)));
  for (const c of heirSet) if (!out.has(c)) out.set(c, "وظیفه‌بگیر");   // وظیفه‌بگیر مجاز به دریافت وام نیست
  const hasWith = (cap) => (items) => (items || []).some((it) => String(it.code) === String(cap) && Math.abs(Number(it.v) || 0) > 0);
  const has = hasWith(kc.capital), hasRet = hasWith(kcFor(kc, "retiree").capital);   // کد سرمایهٔ شاغلین / بازنشستگان
  const [act] = await conn.query("SELECT code FROM people WHERE period_id = ? AND kind = 'active'", [periodId]);
  const lm = loansMap || {};
  const actEntries = act.map((r) => [String(r.code), has(lm[r.code] || lm[String(r.code)])]);
  const retEntries = retireeRows.map((r) => [String(r.code), hasRet((r.data && r.data.items) || [])]);
  const apply = (entries, label, loaded) => {
    if (!entries.length) return;
    if (!loaded) { notes.push(`فایل کسر اقساط ${label} این دوره هنوز بارگذاری نشده است؛ نوبت‌های ${label} حذف نشد.`); return; }
    const withCap = entries.filter((e) => e[1]).length;
    if (withCap < entries.length * 0.05) { notes.push(`در فایل ${label} تقریباً کسی کد سرمایه ندارد (کد اشتباه یا فایل ناقص)؛ قاعدهٔ «سهم صندوق کسر نمی‌شود» برای ${label} اعمال نشد.`); return; }
    for (const [code, ok] of entries) if (!ok && !heirSet.has(code) && !out.has(code)) out.set(code, "سهم صندوق کسر نمی‌شود");
  };
  apply(actEntries, "شاغلین", Object.keys(lm).length > 0);
  apply(retEntries, "بازنشستگان", true);
  return out;
}
// نوبت‌های «در انتظار» افراد مسدود:
//  - «قطع رابطه» و «وظیفه‌بگیر» (بر اساس وضعیت فرد): حذف نمی‌شود، «لغو شده» می‌شود و علت در توضیحات می‌ماند (AUTO_CANCEL_PREFIX)
//    تا اگر در دوره‌های بعد وضعیت فرد به شاغل/بازنشسته برگشت، دوباره «در انتظار نوبت» شود (reviveUnblockedQueue).
//  - «سهم صندوق کسر نمی‌شود» (برآمده از فایل حقوق، نه وضعیت فرد): مثل قبل حذف می‌شود.
// خروجی: [{code, reason, action: "cancelled" | "deleted"}]
const AUTO_CANCEL_PREFIX = "لغو خودکار — ";
const STATUS_BLOCK_REASONS = new Set(["قطع رابطه", "وظیفه‌بگیر"]);
async function pruneBlockedQueue(conn, blocked) {
  if (!blocked.size) return [];
  const [pend] = await conn.query("SELECT id, code FROM loan_queue WHERE status = 'pending'");
  const hit = pend.filter((q) => blocked.has(String(q.code)));
  if (!hit.length) return [];
  const out = [], toDelete = [];
  for (const q of hit) {
    const reason = blocked.get(String(q.code));
    if (STATUS_BLOCK_REASONS.has(reason)) {
      await conn.query("UPDATE loan_queue SET status = 'cancelled', notes = ? WHERE status = 'pending' AND id = ?", [AUTO_CANCEL_PREFIX + reason, q.id]);
      out.push({ code: String(q.code), reason, action: "cancelled" });
    } else { toDelete.push(q.id); out.push({ code: String(q.code), reason, action: "deleted" }); }
  }
  if (toDelete.length) await conn.query("DELETE FROM loan_queue WHERE status = 'pending' AND id IN (?)", [toDelete]);
  return out;
}
// نوبتِ «لغو شده»ٔ خودکار که فردش دیگر قطع رابطه/وظیفه‌بگیر نیست (وضعیتش شاغل یا بازنشسته شد) ← دوباره «در انتظار نوبت».
// لغوهای دستی (بدون پیشوند AUTO_CANCEL_PREFIX) هرگز برنمی‌گردند؛ اگر فرد نوبت باز دیگری دارد هم برنمی‌گردد.
async function reviveUnblockedQueue(conn, blocked) {
  const [rows] = await conn.query("SELECT id, code FROM loan_queue WHERE status = 'cancelled' AND notes LIKE ?", [AUTO_CANCEL_PREFIX + "%"]);
  const back = [], seen = new Set();
  for (const r of rows) {
    const code = String(r.code);
    if (blocked.has(code) || seen.has(code)) continue;
    if (await hasOpenEntry(conn, code)) continue;
    await conn.query("UPDATE loan_queue SET status = 'pending', notes = NULL WHERE status = 'cancelled' AND id = ?", [r.id]);
    seen.add(code); back.push({ code });
  }
  return back;
}

// نقطهٔ ورود: پس از هر وارد‌کردن فایل شاغلین/بازنشستگان/اقساط صدا زده می‌شود و تکرارش بی‌خطر است
async function syncLoanQueue(conn, periodId) {
  const kc = await loadKeyCodes(conn);
  const [[period]] = await conn.query("SELECT year, month, loans_data FROM periods WHERE id = ?", [periodId]);
  if (!period) return { activeCreated: [], retireeCreated: [] };
  const [retRows0] = await conn.query("SELECT code, data FROM people WHERE period_id = ? AND kind = 'retiree'", [periodId]);
  for (const r of retRows0) if (typeof r.data === "string") { try { r.data = JSON.parse(r.data); } catch (e) { r.data = {}; } }
  let pl = period.loans_data; if (typeof pl === "string") { try { pl = JSON.parse(pl); } catch (e) { pl = {}; } }
  const receipts = await syncLoanReceipts(conn, { year: period.year, month: period.month, loans_data: pl || {} }, periodId, retRows0, kc);
  const [retireeRows] = await conn.query("SELECT code, data FROM people WHERE period_id = ? AND kind = 'retiree'", [periodId]);
  for (const r of retireeRows) if (typeof r.data === "string") { try { r.data = JSON.parse(r.data); } catch (e) { r.data = {}; } }
  const ruleNotes = [];
  const blocked = await blockedPeople(conn, periodId, kc, pl || {}, retireeRows, ruleNotes);
  const queueRevived = await reviveUnblockedQueue(conn, blocked);   // وضعیت فرد درست شد ← «در انتظار نوبت»
  const queueRemoved = await pruneBlockedQueue(conn, blocked);      // قطع رابطه/وظیفه‌بگیر ← «لغو شده»؛ بدون کسر سهم صندوق ← حذف
  const activeCreated = await scanActiveLoans(conn, periodId, period.year, period.month, period.loans_data || {}, kc, blocked);
  const retireeCreated = await scanRetireeLoans(conn, periodId, period.year, period.month, retireeRows, kc, blocked);
  try { await backfillReceived(conn, kc); } catch (e) { console.warn("تکمیل تاریخ دریافت وام ممکن نشد:", e.message); }
  return { activeCreated, retireeCreated, receivedNow: receipts.received, endDateUpdated: receipts.endUpdated, registeredNew: receipts.registered, queueRemoved, queueRevived, ruleNotes };
}

// تکمیل «تاریخ دریافت وام» و «مبلغ وام دریافتی» برای ردیف‌های دریافت‌شده‌ای که قبل از v46 ثبت شده‌اند (یا دستی):
// اولین دورهٔ بعد از ماه درخواست که ردیف ۷۱۰ با مانده > ۰ دارد = دورهٔ دریافت؛ مبلغ وام = «مبلغ وام» همان ردیف.
async function backfillReceived(conn, kc) {
  kc = kc || await loadKeyCodes(conn);
  const [ents] = await conn.query("SELECT * FROM loan_queue WHERE status = 'received' AND (inst_start_year IS NULL OR inst_loan_paid IS NULL)");
  if (!ents.length) return 0;
  const [periods] = await conn.query("SELECT id, year, month, loans_data FROM periods ORDER BY year, month");
  const pj = (v) => { if (typeof v === "string") { try { return JSON.parse(v); } catch (e) { return {}; } } return v || {}; };
  let fixed = 0;
  for (const e of ents) {
    const regYm = e.registration_year ? Number(e.registration_year) * 12 + Number(e.registration_month) : 0;
    const [ret] = await conn.query("SELECT period_id, data FROM people WHERE kind = 'retiree' AND code = ?", [e.code]);
    const retBy = new Map(ret.map((r) => [Number(r.period_id), pj(r.data)]));
    for (const per of periods) {
      const pm = Number(per.year) * 12 + Number(per.month);
      if (pm <= regYm) continue;
      if (e.inst_start_year && (Number(e.inst_start_year) * 12 + Number(e.inst_start_month)) !== pm) continue;
      const it = findItem(pj(per.loans_data)[e.code] || [], kc.loan1) || findItem((retBy.get(Number(per.id)) || {}).items || [], kcFor(kc, "retiree").loan1);
      if (!it) continue;
      const amount = Math.abs(Math.round(Number(it.v) || 0)), remaining = Math.round(Number(it.remaining) || 0);
      if (!(amount > 0 && remaining > 0)) continue;
      const paid = Math.abs(Math.round(Number(it.principal != null ? it.principal : it.loanAmt) || 0)) || null;
      if (e.inst_start_year) {
        await conn.query("UPDATE loan_queue SET inst_loan_paid = ? WHERE id = ?", [paid, e.id]);
      } else {
        const en = addMonths(per.year, per.month, Math.ceil(remaining / amount));
        await conn.query("UPDATE loan_queue SET inst_start_year = ?, inst_start_month = ?, inst_end_year = ?, inst_end_month = ?, inst_current_amount = ?, inst_seen_ym = ?, inst_loan_paid = ? WHERE id = ?",
          [per.year, per.month, en.year, en.month, amount, pm, paid, e.id]);
      }
      fixed++;
      break;
    }
  }
  return fixed;
}

module.exports = {
  blockedPeople, pruneBlockedQueue, reviveUnblockedQueue, AUTO_CANCEL_PREFIX, backfillReceived, syncLoanQueue, scanActiveLoans, scanRetireeLoans, computeFigures, loadLoanParams, roundUpToStep, addMonths,
  DEFAULT_INSTALLMENT_MONTHS,
};
