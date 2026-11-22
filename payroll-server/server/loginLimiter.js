// محدودیت تلاش ناموفق ورود (نسخهٔ ۱۱۱)
// - برای هر (نام کاربری + IP): حداکثر ۶ تلاش ناموفق در ۱۰ دقیقه (رفتار قبلی حفظ شده)
// - برای هر IP (همهٔ نام‌های کاربری با هم): حداکثر ۳۰ تلاش ناموفق در ۱۰ دقیقه ← جلوی امتحان رمز روی نام‌های کاربری زیاد را می‌گیرد
// - سقف سخت حافظه: هر نقشه حداکثر maxEntries ردیف؛ اگر پر شود اول ردیف‌های منقضی و بعد قدیمی‌ترین‌ها حذف می‌شوند
//   (Map ترتیب درج را نگه می‌دارد؛ با هر به‌روزرسانی ردیف به انتهای نقشه منتقل می‌شود) ← حمله با نام‌های کاربری تصادفی حافظه را پر نمی‌کند.
function createLoginLimiter(opts = {}) {
  const perUser = opts.perUser || 6;
  const perIp = opts.perIp || 30;
  const windowMs = opts.windowMs || 10 * 60 * 1000;
  const maxEntries = Math.max(10, opts.maxEntries || 10000);
  const now = opts.now || (() => Date.now());
  const users = new Map(), ips = new Map();

  const keyOf = (ip, username) => `${String(username || "").toLowerCase().slice(0, 100)}|${String(ip || "")}`;
  const ipOf = (ip) => String(ip || "");
  const live = (f) => f && f.until > now();

  function prune(map) {
    const t = now();
    for (const [k, f] of map) if (f.until <= t) map.delete(k);
  }
  function capped(map) {
    if (map.size < maxEntries) return;
    prune(map);
    while (map.size >= maxEntries) map.delete(map.keys().next().value);   // قدیمی‌ترین ردیف
  }
  function bump(map, k, limit) {
    const f = map.get(k);
    const count = (live(f) ? f.count : 0) + 1;
    map.delete(k);       // انتقال به انتهای ترتیب درج (تازه‌ترین)
    capped(map);
    map.set(k, { count, until: now() + windowMs });
    return count >= limit;
  }

  return {
    // آیا این ورود باید پیش از بررسی رمز رد شود؟ (۴۲۹)
    blocked(ip, username) {
      const u = users.get(keyOf(ip, username)), i = ips.get(ipOf(ip));
      return !!((live(u) && u.count >= perUser) || (live(i) && i.count >= perIp));
    },
    fail(ip, username) {
      bump(users, keyOf(ip, username), perUser);
      bump(ips, ipOf(ip), perIp);
    },
    // ورود موفق فقط شمارندهٔ همان نام کاربری را صفر می‌کند (شمارندهٔ IP صفر نمی‌شود تا ورود موفق یک حساب، امتحان حساب‌های دیگر را باز نکند)
    success(ip, username) { users.delete(keyOf(ip, username)); },
    sweep() { prune(users); prune(ips); },
    size() { return { users: users.size, ips: ips.size }; },
    limits: { perUser, perIp, windowMs, maxEntries },
  };
}

module.exports = { createLoginLimiter };
