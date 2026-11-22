// سربرگ‌های امنیتی و سیاست Cache (server/httpHeaders.js)
const assert = require("assert");
const H = require("./helpers");

function fakeRes(req) {
  const h = new Map([["x-powered-by", "Express"]]);
  return {
    req,
    setHeader(k, v) { h.set(String(k).toLowerCase(), String(v)); },
    removeHeader(k) { h.delete(String(k).toLowerCase()); },
    get: (k) => h.get(String(k).toLowerCase()),
    has: (k) => h.has(String(k).toLowerCase()),
  };
}
function apply(mw, path, url) {
  const req = { path, originalUrl: url || path, url: url || path };
  const res = fakeRes(req);
  let nextCalled = 0;
  mw(req, res, () => { nextCalled++; });
  assert.strictEqual(nextCalled, 1, "next باید دقیقاً یک بار صدا زده شود");
  return res;
}

exports["سربرگ‌ها: سربرگ‌های پایه روی همهٔ پاسخ‌ها؛ X-Powered-By حذف می‌شود"] = async () => {
  const { securityHeaders } = H.load("httpHeaders.js");
  const mw = securityHeaders({ env: {} });
  for (const p of ["/", "/api/health", "/css/theme.css", "/payslip-online.html", "/js/core/api.js"]) {
    const res = apply(mw, p);
    assert.ok(!res.has("X-Powered-By"), `${p}: X-Powered-By`);
    assert.strictEqual(res.get("X-Content-Type-Options"), "nosniff");
    assert.strictEqual(res.get("X-Frame-Options"), "SAMEORIGIN");
    assert.strictEqual(res.get("Referrer-Policy"), "no-referrer");
    assert.strictEqual(res.get("X-Permitted-Cross-Domain-Policies"), "none");
    assert.match(res.get("Permissions-Policy"), /camera=\(\).*microphone=\(\).*geolocation=\(\)/);
    assert.ok(!res.has("Strict-Transport-Security"), "HSTS بدون HSTS=1 نباید باشد");
  }
};

exports["سربرگ‌ها: API ← no-store و Pragma، بدون CSP و CORP (تا CORS مجاز کار کند)"] = async () => {
  const { securityHeaders } = H.load("httpHeaders.js");
  const mw = securityHeaders({ env: {} });
  for (const p of ["/api/health", "/api/personnel/1/profile", "/api/sync"]) {
    const res = apply(mw, p);
    assert.strictEqual(res.get("Cache-Control"), "no-store", p);
    assert.strictEqual(res.get("Pragma"), "no-cache", p);
    assert.ok(!res.has("Content-Security-Policy"), `${p}: CSP لازم نیست`);
    assert.ok(!res.has("Cross-Origin-Resource-Policy"), `${p}: CORP نباید روی API باشد`);
  }
  // «/api» بدون اسلش پایانی و «/apix» مسیر API حساب نمی‌شوند (رفتار فعلی)
  assert.ok(apply(mw, "/apix").has("Content-Security-Policy"));
};

exports["سربرگ‌ها: صفحهٔ HTML ← CSP + no-store؛ فایل ثابت ← CSP و CORP بدون Cache-Control میان‌افزار"] = async () => {
  const { securityHeaders } = H.load("httpHeaders.js");
  const mw = securityHeaders({ env: {} });
  for (const p of ["/", "/index.html", "/payslip-online.html", "/x/Page.HTM"]) {
    const res = apply(mw, p);
    assert.ok(res.has("Content-Security-Policy"), p);
    assert.strictEqual(res.get("Cache-Control"), "no-store", p);
    assert.strictEqual(res.get("Cross-Origin-Resource-Policy"), "same-origin");
  }
  const css = apply(mw, "/css/theme.css", "/css/theme.css?v=112");
  assert.ok(css.has("Content-Security-Policy"));
  assert.ok(!css.has("Cache-Control"), "Cache فایل ثابت را staticCache تعیین می‌کند");
};

exports["سربرگ‌ها: CSP — منابع فقط از همین مبدأ؛ object-src none؛ frame-ancestors self"] = async () => {
  const { buildCsp } = H.load("httpHeaders.js");
  const csp = buildCsp({});
  const dir = Object.fromEntries(csp.split(/;\s*/).map((d) => { const [k, ...v] = d.split(/\s+/); return [k, v.join(" ")]; }));
  assert.strictEqual(dir["default-src"], "'self'");
  assert.strictEqual(dir["object-src"], "'none'");
  assert.strictEqual(dir["frame-ancestors"], "'self'");
  assert.strictEqual(dir["base-uri"], "'self'");
  assert.strictEqual(dir["form-action"], "'self'");
  assert.strictEqual(dir["connect-src"], "'self' blob: data:");
  assert.ok(!/\*/.test(csp), "هیچ wildcard نباید باشد");
  assert.ok(!/unsafe-eval/.test(csp), "unsafe-eval نباید باشد");
};

exports["سربرگ‌ها: CSP_CONNECT_SRC فقط آدرس http(s) معتبر را می‌پذیرد (تزریق دستور CSP رد می‌شود)"] = async () => {
  const { buildCsp } = H.load("httpHeaders.js");
  const csp = buildCsp({ CSP_CONNECT_SRC: "https://api.example.org, http://10.0.0.5:4000 'self' javascript:alert(1) https://evil.com;script-src * *" });
  const connect = csp.split(/;\s*/).find((d) => d.startsWith("connect-src"));
  assert.strictEqual(connect, "connect-src 'self' blob: data: https://api.example.org http://10.0.0.5:4000");
  assert.ok(!/evil|javascript|\*/.test(csp), csp);
  assert.strictEqual(csp.split(/;\s*/).filter((d) => d.startsWith("script-src")).length, 1, "دستور script-src اضافه نشود");
};

exports["سربرگ‌ها: HSTS فقط با HSTS=1"] = async () => {
  const { securityHeaders } = H.load("httpHeaders.js");
  assert.ok(!apply(securityHeaders({ env: { HSTS: "0" } }), "/").has("Strict-Transport-Security"));
  assert.ok(!apply(securityHeaders({ env: { HSTS: "true" } }), "/").has("Strict-Transport-Security"));
  assert.match(apply(securityHeaders({ env: { HSTS: "1" } }), "/api/x").get("Strict-Transport-Security"), /^max-age=\d+; includeSubDomains$/);
};

exports["سربرگ‌ها: staticCache — HTML no-store، نسخه‌دار immutable یک‌ساله، فونت ۳۰ روز، بقیه no-cache"] = async () => {
  const { staticCache, isVersioned } = H.load("httpHeaders.js");
  const cc = (file, url) => { const res = fakeRes({ originalUrl: url, url }); staticCache(res, file); return res.get("Cache-Control"); };
  assert.strictEqual(cc("/c/payslip-online.html", "/payslip-online.html?v=112"), "no-store");   // HTML حتی با ?v= هم Cache نمی‌شود
  assert.strictEqual(cc("/c/css/theme.css", "/css/theme.css?v=112"), "public, max-age=31536000, immutable");
  assert.strictEqual(cc("/c/js/core/api.js", "/js/core/api.js?x=1&v=abc"), "public, max-age=31536000, immutable");
  assert.strictEqual(cc("/c/fonts/Vazirmatn-Bold.woff2", "/fonts/Vazirmatn-Bold.woff2"), "public, max-age=2592000");
  assert.strictEqual(cc("/c/css/theme.css", "/css/theme.css"), "no-cache");
  assert.strictEqual(cc("/c/css/theme.css", "/css/theme.css?v="), "no-cache");
  assert.strictEqual(cc("/c/js/x.js", "/js/x.js?version=1"), "no-cache");
  assert.ok(isVersioned({ originalUrl: "/a.js?v=1" }));
  assert.ok(!isVersioned({ originalUrl: "/a.js?nv=1" }));
};

exports["سربرگ‌ها: app.js میان‌افزار را پیش از همهٔ مسیرها و X-Powered-By را خاموش ثبت می‌کند"] = async () => {
  const fs = require("fs"), path = require("path");
  const src = fs.readFileSync(path.join(H.SRV, "app.js"), "utf8");
  const iHeaders = src.indexOf("app.use(securityHeaders())");
  assert.ok(iHeaders > 0, "securityHeaders ثبت نشده");
  assert.ok(src.indexOf('app.disable("x-powered-by")') > 0);
  assert.ok(iHeaders < src.indexOf("mountRoutes(app)"), "سربرگ‌ها باید پیش از مسیرهای API باشند");
  assert.ok(iHeaders < src.indexOf("express\").static("), "سربرگ‌ها باید پیش از فایل‌های ثابت باشند");
  assert.ok(/setHeaders:\s*staticCache/.test(src), "staticCache روی express.static");
};
