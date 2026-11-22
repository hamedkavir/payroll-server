// مقایسهٔ زمان‌ثابت دو رشته (مثل کلید API): هر دو با SHA-256 به طول ثابت تبدیل و با timingSafeEqual مقایسه می‌شوند؛
// پس زمان پاسخ به طول یا محتوای کلید بستگی ندارد. ورودی غیررشته‌ای یا خیلی بلند رد می‌شود.
const crypto = require("crypto");
const MAX_LEN = 512;
function safeEqual(provided, expected) {
  if (typeof provided !== "string" || typeof expected !== "string") return false;
  if (!provided.length || provided.length > MAX_LEN || expected.length > MAX_LEN) return false;
  const a = crypto.createHash("sha256").update(provided, "utf8").digest();
  const b = crypto.createHash("sha256").update(expected, "utf8").digest();
  return crypto.timingSafeEqual(a, b);
}
module.exports = { safeEqual };
