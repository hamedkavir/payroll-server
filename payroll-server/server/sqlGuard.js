// محافظ پارامترهای SQL: mysql2 در query() شیء ساده (plain object) را به «`کلید` = مقدار» باز می‌کند؛
// اگر ورودی کاربر (بدنهٔ JSON یا query-string) بدون تبدیل به رشته/عدد در پارامتر بیاید، شرط SQL عوض می‌شود.
// اینجا هر پارامتر مشکوک پیش از اجرا رد می‌شود. تنها استثنا: «SET ?» با شیء ساخته‌شدهٔ سرور (فقط مقدارهای ساده).
const isPlain = (v) => v !== null && typeof v === "object" && !Array.isArray(v) && !(v instanceof Date) && !Buffer.isBuffer(v) && (Object.getPrototypeOf(v) === Object.prototype || Object.getPrototypeOf(v) === null);
const bad = (why) => { const e = new Error("پارامتر SQL نامعتبر: " + why); e.code = "E_BAD_SQL_PARAM"; return e; };
function checkValue(v, depth = 0) {
  if (v === null || v === undefined) return;
  const t = typeof v;
  if (t === "string" || t === "number" || t === "boolean" || t === "bigint") return;
  if (v instanceof Date || Buffer.isBuffer(v)) return;
  if (Array.isArray(v)) { if (depth > 4) throw bad("آرایهٔ تودرتو"); for (const x of v) checkValue(x, depth + 1); return; }
  throw bad(t === "object" ? "شیء" : t);
}
function guardParams(sql, params) {
  const text = typeof sql === "string" ? sql : (sql && sql.sql) || "";
  let list = params !== undefined ? params : (sql && sql.values);
  if (list === undefined) return;
  if (!Array.isArray(list)) list = [list];
  const allowObj = /\bSET\s+\?/i.test(text);
  for (const p of list) {
    if (allowObj && isPlain(p)) { for (const v of Object.values(p)) checkValue(v, 1); continue; }
    checkValue(p);
  }
}
module.exports = { guardParams, isPlain };
