// احراز هویت لایهٔ اول با یک کلید مشترک (Shared API Key)؛ بعد از آن هر کاربر با توکن خودش شناخته می‌شود (auth.js).
// مقایسهٔ کلید زمان‌ثابت است (safeEqual) و ورودی غیررشته‌ای/خالی/خیلی بلند رد می‌شود.
const { safeEqual } = require("../safeEqual");
module.exports = function requireApiKey(req, res, next) {
  const expected = process.env.API_KEY;
  if (!expected) {
    // اگر کلید در .env تنظیم نشده باشد، برای جلوگیری از باز ماندن ناخواستهٔ API متوقف می‌شویم
    return res.status(500).json({ error: "server_misconfigured", message: "API_KEY در .env تنظیم نشده است." });
  }
  const provided = req.headers["x-api-key"];   // اگر هدر تکرار شود Node رشتهٔ ترکیبی می‌دهد (نه آرایه)؛ هر حالت غیررشته‌ای رد می‌شود
  if (!safeEqual(provided, expected)) {
    return res.status(401).json({ error: "unauthorized", message: "کلید دسترسی نامعتبر یا وارد‌نشده است." });
  }
  next();
};
