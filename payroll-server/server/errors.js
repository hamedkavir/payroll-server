// مدیریت یکپارچهٔ خطا: جزئیات داخلی (پیام MySQL، مسیر فایل، stack) فقط در لاگ سرور می‌ماند و به کاربر پیام عمومی می‌رسد.
// پیام‌های «تجاری/اعتبارسنجی» که خودمان برای کاربر نوشته‌ایم با UserError (یا bad(res, ...) در مسیرها) می‌رسند و حفظ می‌شوند.
const GENERIC = "خطای داخلی سرور؛ اگر تکرار شد، با مدیر سیستم تماس بگیرید.";
const GENERIC_BAD_INPUT = "ورودی نامعتبر است.";

class UserError extends Error {
  constructor(message, status = 400, error = "invalid_input") {
    super(message);
    this.name = "UserError";
    this.expose = true;
    this.status = status;
    this.error = error;
  }
}
// خطای تجاریِ ساده (new Error("متن فارسی")) که کد MySQL/سیستم ندارد؛ TypeError/RangeError/... خطای برنامه‌اند، نه پیام کاربر
const isBusinessError = (e) => !!e && e instanceof Error && !e.code && (e.expose === true || e.constructor === Error);

function logError(err, req) {
  const where = req ? `${req.method} ${String(req.originalUrl || req.url || "").split("?")[0]}` : "";
  console.error(`[خطا] ${where}`, err && err.stack ? err.stack : err);
}
// پاسخ خطای سرور: status پیش‌فرض ۵۰۰ و پیام عمومی؛ UserError پیام خودش را (با status خودش) می‌دهد
function sendError(res, err, opts = {}) {
  if (res.headersSent) return;
  if (err && err.expose === true) return res.status(err.status || 400).json({ error: err.error || "invalid_input", message: err.message });
  if (err && err.code === "E_BAD_SQL_PARAM") return res.status(400).json({ error: "invalid_input", message: GENERIC_BAD_INPUT });
  logError(err, res.req);
  return res.status(opts.status || 500).json({ error: opts.error || "db_error", message: opts.message || GENERIC });
}
// پیام امن برای خطای اعتبارسنجی ورودی: پیام فارسی خودمان (خطای تجاری/UserError) عیناً؛ هر خطای برنامه‌ای دیگر (TypeError، خطای MySQL، ...) فقط در لاگ و پیام عمومی به کاربر
function userMsg(err) {
  if (err && (err.expose === true || isBusinessError(err))) return err.message;
  logError(err);
  return GENERIC_BAD_INPUT;
}
module.exports = { UserError, isBusinessError, sendError, logError, userMsg, GENERIC };
