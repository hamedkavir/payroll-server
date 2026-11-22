// ابزارهای شمارهٔ حساب و شبا
// قاعده: شمارهٔ حساب همیشه ۱۳ رقم است و برابر ۱۳ رقم آخر شبا (IR + ۲۴ رقم).
const { toLatinDigits } = require("./textNormalize");

const ACCOUNT_LEN = 13;

// فقط ارقام انگلیسی؛ هر کاراکتر دیگر (فاصله، خط تیره، حروف) حذف می‌شود
function digitsOnly(v) {
  return toLatinDigits(v == null ? "" : String(v)).replace(/\D/g, "");
}

// null = خالی؛ در غیر این صورت رشتهٔ ارقام (ممکن است طولش اشتباه باشد)
function cleanAccount(v) {
  const d = digitsOnly(v);
  return d;
}
function isAccount13(v) { return /^\d{13}$/.test(String(v == null ? "" : v)); }

function cleanShaba(v) {
  return toLatinDigits(v == null ? "" : String(v)).replace(/[\s\-_.]/g, "").toUpperCase();
}
// فرمت IR + ۲۴ رقم و درستی رقم کنترلی (mod 97)
function isValidShaba(s) {
  if (!/^IR\d{24}$/.test(s)) return false;
  const t = s.slice(4) + s.slice(0, 4);
  let rem = 0;
  for (const ch of t) {
    const part = ch >= "A" && ch <= "Z" ? String(ch.charCodeAt(0) - 55) : ch;
    for (const d of part) rem = (rem * 10 + Number(d)) % 97;
  }
  return rem === 1;
}
function accountFromShaba(s) { return s.slice(-ACCOUNT_LEN); }

// نام بانک پیش‌فرض بر اساس وضعیت: بازنشسته/وظیفه‌بگیر ← صادرات، شاغل ← ملی، غیر از این خالی
function defaultBankName(status) {
  const s = String(status || "").trim();
  if (s === "بازنشسته" || s === "وظیفه بگیر") return "صادرات";
  if (s === "شاغل") return "ملی";
  return "";
}

module.exports = { defaultBankName, ACCOUNT_LEN, digitsOnly, cleanAccount, isAccount13, cleanShaba, isValidShaba, accountFromShaba };
