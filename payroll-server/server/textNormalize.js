// نرمال‌سازی متن فارسی/عربی برای جست‌وجو
//
// مشکل: داده‌ها گاهی با «ي» و «ك» عربی ذخیره شده‌اند و کاربر با «ی» و «ک» فارسی
// جست‌وجو می‌کند (یا برعکس). همین‌طور ارقام فارسی (۱۲۳) / عربی (١٢٣) / لاتین (123)،
// نیم‌فاصله، فاصله و اعراب. MySQL با collation معمولی این‌ها را یکی نمی‌داند.
//
// راه‌حل: هم عبارت جست‌وجو (در Node) و هم ستون‌ها (در SQL) با «یک نقشهٔ واحد»
// نرمال می‌شوند و بعد مقایسه انجام می‌شود. چون هر دو سمت از همین نقشه ساخته می‌شوند،
// هیچ‌وقت ناهماهنگ نمی‌شوند.

// نگاشت نویسه‌ها (از -> به). به == "" یعنی حذف.
const MAP = [
  // ی
  ["\u064A", "\u06CC"], // ي عربی
  ["\u0649", "\u06CC"], // ى الف مقصوره
  ["\u06CD", "\u06CC"], // ۍ
  ["\u0626", "\u06CC"], // ئ
  // ک
  ["\u0643", "\u06A9"], // ك عربی
  // الف
  ["\u0623", "\u0627"], // أ
  ["\u0625", "\u0627"], // إ
  ["\u0622", "\u0627"], // آ
  ["\u0671", "\u0627"], // ٱ
  // و / ه
  ["\u0624", "\u0648"], // ؤ
  ["\u0629", "\u0647"], // ة
  ["\u06C0", "\u0647"], // ۀ
  // ارقام فارسی -> لاتین
  ["\u06F0", "0"], ["\u06F1", "1"], ["\u06F2", "2"], ["\u06F3", "3"], ["\u06F4", "4"],
  ["\u06F5", "5"], ["\u06F6", "6"], ["\u06F7", "7"], ["\u06F8", "8"], ["\u06F9", "9"],
  // ارقام عربی -> لاتین
  ["\u0660", "0"], ["\u0661", "1"], ["\u0662", "2"], ["\u0663", "3"], ["\u0664", "4"],
  ["\u0665", "5"], ["\u0666", "6"], ["\u0667", "7"], ["\u0668", "8"], ["\u0669", "9"],
  // حذف: اعراب، کشیده، نیم‌فاصله و نشانه‌های جهت، فاصله و جداکننده‌ها
  ["\u064B", ""], ["\u064C", ""], ["\u064D", ""], ["\u064E", ""], ["\u064F", ""],
  ["\u0650", ""], ["\u0651", ""], ["\u0652", ""], ["\u0670", ""],
  ["\u0640", ""],               // کشیده ـ
  ["\u200C", ""], ["\u200D", ""], ["\u200E", ""], ["\u200F", ""], ["\u00A0", ""],
  [" ", ""], ["\t", ""], ["_", ""], [".", ""], ["-", ""], ["(", ""], [")", ""],
];

const FROM_TO = new Map(MAP);

// نسخهٔ JavaScript
function normalizeSearch(s) {
  let out = "";
  for (const ch of String(s == null ? "" : s)) {
    out += FROM_TO.has(ch) ? FROM_TO.get(ch) : ch;
  }
  return out.toLowerCase();
}

// نسخهٔ SQL: عبارتی می‌سازد که مقدار یک ستون/عبارت را همانند normalizeSearch نرمال می‌کند.
// نکته: ستون با COLLATE utf8mb4_bin مقایسه می‌شود تا REPLACE دقیقاً نویسه‌به‌نویسه کار کند
// (collation‌های ci ممکن است اعراب را «بی‌وزن» بگیرند و REPLACE را بی‌اثر یا خراب کنند).
function sqlLit(s) {
  // مقادیر فقط از ثابت‌های بالا می‌آیند، نه از ورودی کاربر؛ با این حال escape می‌کنیم.
  return "'" + s.replace(/\\/g, "\\\\").replace(/'/g, "\\'") + "'";
}
function sqlNormExpr(expr) {
  let e = `CAST(${expr} AS CHAR CHARACTER SET utf8mb4) COLLATE utf8mb4_bin`;
  for (const [from, to] of MAP) e = `REPLACE(${e}, ${sqlLit(from)}, ${sqlLit(to)})`;
  return `LOWER(${e})`;
}

// کاراکترهای خاص LIKE را خنثی می‌کند (تا مثلاً «%» یا «_» در ورودی کاربر wildcard نشود)
function escapeLike(s) {
  return s.replace(/[\\%_]/g, (c) => "\\" + c);
}

// الگوی آمادهٔ LIKE برای عبارت جست‌وجو (بعد از نرمال‌سازی)
function likePattern(q) {
  return `%${escapeLike(normalizeSearch(q))}%`;
}

// فقط ارقام فارسی/عربی را به لاتین برمی‌گرداند (برای تاریخ و شماره‌ها)
function toLatinDigits(s) {
  return String(s == null ? "" : s)
    .replace(/[\u06F0-\u06F9]/g, (d) => String(d.charCodeAt(0) - 0x06F0))
    .replace(/[\u0660-\u0669]/g, (d) => String(d.charCodeAt(0) - 0x0660));
}

// تبدیل «ي» و «ك» عربی به «ی» و «ک» فارسی برای «ذخیره» (آ، أ و ... دست‌نخورده می‌ماند)
function fixArabic(s) {
  return typeof s === "string" ? s.replace(/\u064A/g, "\u06CC").replace(/\u0643/g, "\u06A9") : s;
}
function fixDeep(v) {
  if (typeof v === "string") return fixArabic(v);
  if (Array.isArray(v)) { for (let i = 0; i < v.length; i++) v[i] = fixDeep(v[i]); return v; }
  if (v && typeof v === "object") { for (const k of Object.keys(v)) v[k] = fixDeep(v[k]); return v; }
  return v;
}

// کد ملی: فقط ارقام؛ ۸ رقمی ← دو صفر و ۹ رقمی ← یک صفر در ابتدا. غیر از این‌ها دست‌نخورده برمی‌گردد (اعتبارسنجی جداست).
function padNid(v) {
  const t = toLatinDigits(v == null ? "" : String(v)).trim();
  if (!t) return "";
  if (!/^\d+$/.test(t)) return t;
  return t.length === 8 ? "00" + t : t.length === 9 ? "0" + t : t;
}
const isNid10 = (v) => /^\d{10}$/.test(String(v == null ? "" : v));

module.exports = { padNid, isNid10, fixArabic, fixDeep, normalizeSearch, sqlNormExpr, likePattern, escapeLike, toLatinDigits };
