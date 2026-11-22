// وضعیت «وظیفه بگیر» (وارث بازنشسته: ردیف ورثه > ۰ در فایل بازنشستگان)
// وظیفه‌بگیر مجاز به دریافت خدمات (مساعده، کالا، وام، وام امداد، خدمات موسسات و ...) نیست.
const HEIR = "وظیفه بگیر";
const HEIR_MSG = "وظیفه‌بگیر اجازهٔ دریافت خدمات (مساعده، کالا، وام، امداد، خدمات موسسات و ...) را ندارد.";
const CUT_MSG = "فرد «قطع رابطه» است و اجازهٔ دریافت و ثبت وام، مساعده و کالا را ندارد.";
const isCutStatus = (st) => /قطع.?رابطه/.test(String(st || ""));
const isHeirStatus = (st) => /وظیفه.?بگیر/.test(String(st || ""));
const toNumLatin = (v) => Number(String(v == null ? "" : v).replace(/[۰-۹]/g, (d) => "۰۱۲۳۴۵۶۷۸۹".indexOf(d)).replace(/[٠-٩]/g, (d) => "٠١٢٣٤٥٦٧٨٩".indexOf(d)).replace(/[^\d.]/g, "")) || 0;
// آیا رکورد فیش بازنشسته (data) مربوط به وارث است؟ (info.heir عددی؛ برای دادهٔ قدیمی: empType «وارث بازنشسته»)
function isHeirRecord(data) {
  let d = data;
  if (typeof d === "string") { try { d = JSON.parse(d); } catch (e) { d = {}; } }
  d = d || {};
  const info = d.info || {};
  // فایل بازنشستگان: ستون «ردیف ورثه» در data.heir ذخیره می‌شود (info.heir برای نمای محاسبه‌شده)
  const raw = d.heir !== undefined && d.heir !== null && d.heir !== "" ? d.heir : info.heir;
  if (raw !== undefined && raw !== null && raw !== "") return toNumLatin(raw) > 0;
  return /وارث/.test(String(info.empType || ""));
}
// q: pool یا connection. اگر فرد وظیفه‌بگیر یا «قطع رابطه» باشد پیام خطا برمی‌گرداند، وگرنه null
// (برای ثبت وام، مساعده، کالا و وام امداد)
async function heirBlock(q, code) {
  const [r] = await q.query("SELECT status FROM personnel WHERE code = ?", [code]);
  if (!r[0]) return null;
  if (isHeirStatus(r[0].status)) return HEIR_MSG;
  if (isCutStatus(r[0].status)) return CUT_MSG;
  return null;
}
module.exports = { HEIR, HEIR_MSG, CUT_MSG, isCutStatus, isHeirStatus, isHeirRecord, heirBlock };
