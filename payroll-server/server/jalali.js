// کمک‌کارهای تاریخ شمسی (رشتهٔ yyyy/mm/dd) — برای «بستن فایل حقوق» و گزارش‌های مالی
const pad2 = (n) => String(n).padStart(2, "0");
const DATE_RE = /^\d{4}\/\d{2}\/\d{2}$/;
// سال کبیسهٔ شمسی (الگوی ۳۳ ساله؛ برای سال‌های ۱۲۴۳ تا ۱۴۷۲ درست است)
const isLeap = (y) => [1, 5, 9, 13, 17, 22, 26, 30].includes(y % 33);
const daysIn = (y, m) => (m <= 6 ? 31 : m <= 11 ? 30 : isLeap(y) ? 30 : 29);
function parse(s) {
  if (!DATE_RE.test(String(s || ""))) return null;
  const [y, m, d] = s.split("/").map(Number);
  if (m < 1 || m > 12 || d < 1 || d > daysIn(y, m)) return null;
  return { y, m, d };
}
const fmt = (y, m, d) => `${y}/${pad2(m)}/${pad2(d)}`;
// روز بعد از یک تاریخ
function nextDay(s) {
  const t = parse(s); if (!t) return null;
  let { y, m, d } = t; d++;
  if (d > daysIn(y, m)) { d = 1; m++; if (m > 12) { m = 1; y++; } }
  return fmt(y, m, d);
}
const monthEnd = (y, m) => fmt(y, m, daysIn(y, m));
// تبدیل میلادی ↔ شمسی (الگوریتم استاندارد jdf)
function toJalali(gy, gm, gd) {
  const gdm = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];
  let jy = gy <= 1600 ? 0 : 979;
  gy -= gy <= 1600 ? 621 : 1600;
  const gy2 = gm > 2 ? gy + 1 : gy;
  let days = 365 * gy + Math.floor((gy2 + 3) / 4) - Math.floor((gy2 + 99) / 100) + Math.floor((gy2 + 399) / 400) - 80 + gd + gdm[gm - 1];
  jy += 33 * Math.floor(days / 12053); days %= 12053;
  jy += 4 * Math.floor(days / 1461); days %= 1461;
  if (days > 365) { jy += Math.floor((days - 1) / 365); days = (days - 1) % 365; }
  const jm = days < 186 ? 1 + Math.floor(days / 31) : 7 + Math.floor((days - 186) / 30);
  const jd = 1 + (days < 186 ? days % 31 : (days - 186) % 30);
  return { y: jy, m: jm, d: jd };
}
function toGregorian(jy, jm, jd) {
  jy += 1595;
  let days = -355668 + 365 * jy + Math.floor(jy / 33) * 8 + Math.floor(((jy % 33) + 3) / 4) + jd + (jm < 7 ? (jm - 1) * 31 : (jm - 7) * 30 + 186);
  let gy = 400 * Math.floor(days / 146097); days %= 146097;
  if (days > 36524) { gy += 100 * Math.floor(--days / 36524); days %= 36524; if (days >= 365) days++; }
  gy += 4 * Math.floor(days / 1461); days %= 1461;
  if (days > 365) { gy += Math.floor((days - 1) / 365); days = (days - 1) % 365; }
  let gd = days + 1;
  const sal = [0, 31, (gy % 4 === 0 && gy % 100 !== 0) || gy % 400 === 0 ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  let gm = 0;
  for (; gm < 13 && gd > sal[gm]; gm++) gd -= sal[gm];
  return { y: gy, m: gm, d: gd };
}
// Date (زمان محلی سرور) → "1405/07/23 14:05"
function dateTimeFa(dt) {
  if (!dt) return "";
  const d = new Date(dt); if (isNaN(d)) return "";
  const j = toJalali(d.getFullYear(), d.getMonth() + 1, d.getDate());
  return `${fmt(j.y, j.m, j.d)} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}
module.exports = { DATE_RE, parse, nextDay, monthEnd, daysIn, pad2, fmt, toJalali, toGregorian, dateTimeFa };
