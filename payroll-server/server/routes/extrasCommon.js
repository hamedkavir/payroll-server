// کمک‌کارهای مشترک مسیرهای تنظیمات فرم، مساعده، انبار/کالا و پارامترهای وام (از routes/extras.js نسخهٔ ۱۱۰ جدا شد)
const { sendError, userMsg } = require("../errors");
const { toLatinDigits } = require("../textNormalize");
const { planInst, lastOf } = require("../installments");

const fail = (res, err, code = 500) => (code === 500 ? sendError(res, err) : res.status(code).json({ error: "invalid_input", message: userMsg(err) }));   // ۵۰۰ = پیام عمومی؛ کدهای دیگر پیام تجاری خودمان
const bad = (res, message, code = 400) => res.status(code).json({ error: code === 404 ? "not_found" : "invalid_input", message });
const num = (v) => { const n = Number(toLatinDigits(v).replace(/[,٬\s]/g, "")); return Number.isFinite(n) ? n : 0; };
const str = (v, max = 255) => toLatinDigits(v == null ? "" : String(v)).trim().slice(0, max);
const strKeep = (v, max = 255) => (v == null ? "" : String(v)).trim().slice(0, max); // بدون تبدیل ارقام (متن آزاد)
const pad2 = (n) => String(n).padStart(2, "0");
// planInst / lastOf (حساب خالص اقساط) از نسخهٔ ۱۲۰ در server/installments.js است؛ برای سازگاری همین‌جا هم صادر می‌شوند.
const DATE_RE = /^\d{4}\/\d{2}\/\d{2}$/;

// شمارهٔ یکتا = تاریخ (yyyymmdd) + ردیف دو رقمی همان روز، مثل ۱۴۰۴۰۱۲۴۰۳
async function nextNumber(conn, table, column, date) {
  const digits = toLatinDigits(date).replace(/\D/g, "").slice(0, 8);
  const [[{ c }]] = await conn.query(`SELECT COUNT(*) AS c FROM ${table} WHERE ${column} LIKE ?`, [digits + "%"]);
  let seq = c + 1, n;
  for (;;) {
    n = digits + pad2(seq);
    const [[{ k }]] = await conn.query(`SELECT COUNT(*) AS k FROM ${table} WHERE ${column} = ?`, [n]);
    if (!k) return n;
    seq++;
  }
}


module.exports = { fail, bad, num, str, strKeep, pad2, planInst, lastOf, DATE_RE, nextNumber };
