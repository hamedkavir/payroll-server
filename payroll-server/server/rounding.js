// پارامترهای گرد کردن مبالغ (قابل تنظیم از «تنظیمات ← گرد کردن مبالغ»؛ ذخیره در form_settings)
// همهٔ رندها «به بالا» تا مضرب مقدار تنظیم‌شده‌اند. مقدار ۱ (یا ۰) یعنی بدون رند.
const ROUND_DEFAULTS = {
  roundLoan: 10000000,       // مبلغ وام (فرمول نوبت خودکار)
  roundLoanInst: 1000000,    // قسط وام
  roundAdvance: 1000000,     // مبلغ مساعده
  roundAdvInst: 1000000,     // قسط مساعده
  roundGoods: 1000000,       // جمع کل درخواست کالا
  roundGoodsInst: 1000000,   // قسط کالا
};
const ROUND_KEYS = Object.keys(ROUND_DEFAULTS);

// مقدار تنظیم‌شده → گام معتبر (≥ ۱)
const stepOf = (v, def) => {
  if (v === undefined || v === null || v === "") return def;
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.max(1, n) : def;
};

// رند به بالا تا مضرب step (ابتدا به ریال صحیح گرد می‌شود تا خطای اعشاری یک پلهٔ اضافه نسازد)
function ceilStep(x, step) {
  const n = Math.round(Number(x) || 0);
  const s = Math.round(Number(step) || 0);
  return s > 1 ? Math.ceil(n / s) * s : n;
}

// q می‌تواند pool یا connection باشد
async function loadRounding(q) {
  try {
    const [rows] = await q.query("SELECT data FROM form_settings WHERE id = 1");
    let d = rows[0] && rows[0].data; if (typeof d === "string") d = JSON.parse(d);
    d = d || {};
    return Object.fromEntries(ROUND_KEYS.map((k) => [k, stepOf(d[k], ROUND_DEFAULTS[k])]));
  } catch (e) { return { ...ROUND_DEFAULTS }; }
}

module.exports = { ROUND_DEFAULTS, ROUND_KEYS, stepOf, ceilStep, loadRounding };
