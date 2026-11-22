// سربرگ‌های امنیتی و سیاست Cache (نسخهٔ ۱۱۱)
// - X-Powered-By حذف می‌شود (app.disable در app.js + removeHeader این‌جا برای اطمینان)
// - nosniff، X-Frame-Options، Referrer-Policy، Permissions-Policy، CSP
// - CSP اسکریپت/استایل inline را مجاز می‌گذارد: پنجره‌های چاپ (print/forms.js) با document.write و اسکریپت inline ساخته می‌شوند
//   و بخش‌هایی از رابط از onclick/style درون‌خطی استفاده می‌کنند؛ بقیهٔ منابع فقط از همین مبدأ.
// - Cache: HTML و API ← no-store (اطلاعات حقوقی نباید در Cache مرورگر/پراکسی بماند)؛
//   فایل‌های ثابتِ نسخه‌دار (?v=...) ← یک سال immutable؛ فایل‌های ثابت بدون نسخه ← no-cache (هر بار با ETag بررسی می‌شود).
const DEFAULT_CONNECT = "'self' blob: data:";

function buildCsp(env = process.env) {
  // CSP_CONNECT_SRC: اگر صفحهٔ برنامه از این سرور باز می‌شود ولی باید به سرور API دیگری وصل شود، آدرس آن را این‌جا اضافه کنید
  const extra = String(env.CSP_CONNECT_SRC || "").split(/[\s,]+/).filter((s) => /^(https?:\/\/[^\s'";]+|'self')$/.test(s));
  const connect = [DEFAULT_CONNECT, ...extra.filter((s) => s !== "'self'")].join(" ");
  return [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    `connect-src ${connect}`,
    "worker-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'self'",
  ].join("; ");
}

const isVersioned = (req) => /[?&]v=[^&]+/.test(req.originalUrl || req.url || "");
const isHtmlPath = (p) => p === "/" || /\.html?$/i.test(p);

function securityHeaders(opts = {}) {
  const csp = buildCsp(opts.env || process.env);
  const hsts = (opts.env || process.env).HSTS === "1";
  return function securityHeadersMw(req, res, next) {
    res.removeHeader("X-Powered-By");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "SAMEORIGIN");
    res.setHeader("Referrer-Policy", "no-referrer");
    res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=(), usb=()");
    res.setHeader("Cross-Origin-Resource-Policy", "same-origin");
    res.setHeader("X-Permitted-Cross-Domain-Policies", "none");
    if (hsts) res.setHeader("Strict-Transport-Security", "max-age=15552000; includeSubDomains");   // فقط پشت HTTPS: HSTS=1 در .env
    const p = String(req.path || "/");
    if (p.startsWith("/api/")) {
      // پاسخ‌های API: هرگز Cache نشوند (اطلاعات شخصی و حقوقی). CSP لازم ندارند (JSON) ولی CORP همچنان اعمال است؛
      // CORS برای دسترسی از مبدأهای مجاز (CORS_ORIGIN) جداگانه در app.js تنظیم می‌شود و Cross-Origin-Resource-Policy مانع fetch آن نیست.
      res.setHeader("Cache-Control", "no-store");
      res.setHeader("Pragma", "no-cache");
      res.removeHeader("Cross-Origin-Resource-Policy");
    } else {
      res.setHeader("Content-Security-Policy", csp);
      if (isHtmlPath(p)) res.setHeader("Cache-Control", "no-store");
    }
    next();
  };
}

// گزینهٔ setHeaders برای express.static: نسخه‌دار ← Cache بلندمدت؛ HTML ← no-store؛ بقیه ← no-cache (اعتبارسنجی با ETag)
function staticCache(res, filePath) {
  const req = res.req || {};
  if (/\.html?$/i.test(filePath)) res.setHeader("Cache-Control", "no-store");
  else if (isVersioned(req)) res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
  else if (/\.woff2?$/i.test(filePath)) res.setHeader("Cache-Control", "public, max-age=2592000");   // فونت‌ها: ۳۰ روز (نامشان با نسخه عوض نمی‌شود ولی محتوا ثابت است)
  else res.setHeader("Cache-Control", "no-cache");
}

module.exports = { securityHeaders, staticCache, buildCsp, isVersioned };
