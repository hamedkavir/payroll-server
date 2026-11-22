// محاسبهٔ برنامهٔ اقساط (نسخهٔ ۱۲۰، بند ۴۰ PLAN.md)
// پیش‌تر planInst/lastOf در routes/extrasCommon.js کنار کمک‌کارهای HTTP و ورودی بودند و routes/emdad.js نسخهٔ تکراریِ lastOf
// را داشت. این فایل فقط حساب خالص است (بدون Express، دیتابیس یا تنظیمات) تا یک مالک و یک مجموعه تست داشته باشد.
// routes/extrasCommon.js همین توابع را دوباره صادر می‌کند؛ کدهای قدیمی (advances، inventory، extras.js) دست‌نخورده کار می‌کنند.
const { ceilStep } = require("./rounding");

// برنامهٔ اقساط: قسط عادی رند‌به‌بالا تا مضرب «step» (از تنظیمات گرد کردن؛ پیش‌فرض یک میلیون ریال) و «قسط آخر» = مابه‌التفاوت
// (تا جمع اقساط دقیقاً برابر مانده شود). اگر مبلغ نسبت به تعداد اقساط کم باشد، تعداد مؤثر اقساط کمتر می‌شود
// (مثلاً ۱۰ میلیون در ۶ قسط ← ۵ قسط ۲ میلیونی).
function planInst(rem, n, step = 1e6) {
  rem = Math.max(0, Math.round(rem)); n = Math.max(1, parseInt(n, 10) || 1);
  if (rem === 0 || n === 1) return { inst: rem, last: rem, n: 1 };
  const inst = Math.max(step > 1 ? step : 1, ceilStep(rem / n, step));   // رند به بالا
  const k = Math.min(n, Math.ceil(rem / inst));
  return { inst, last: rem - inst * (k - 1), n: k };
}

// قسط آخر یک بدهی با قسط ثابت (برای مساعده/وام/امداد که قسط را کاربر می‌تواند دستی بدهد)؛
// اگر قسط‌ها (رند به بالا) زودتر بدهی را تمام کنند، تعداد مؤثر اقساط کمتر می‌شود
const lastOf = (total, inst, n) => {
  total = Math.round(total); n = Math.max(1, n);
  if (!(inst > 0)) return Math.max(0, total);
  const k = Math.min(n, Math.ceil(total / inst));
  return Math.max(0, total - inst * (k - 1));
};

module.exports = { planInst, lastOf };
