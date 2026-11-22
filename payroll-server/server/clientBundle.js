// بستهٔ یکجای اسکریپت‌های کلاینت (نسخهٔ ۱۱۸)
// صفحهٔ برنامه ۵۱ اسکریپت کلاسیک را به ترتیب client/js/manifest.json بارگذاری می‌کند. وقتی صفحه از همین سرور باز می‌شود،
// این میان‌افزار همهٔ آن‌ها را (به همان ترتیب) در یک فایل /js/bundle.js?v=<hash> می‌گذارد و در HTML به‌جای ۵۱ تگ <script>
// فقط یک تگ می‌نویسد؛ یک source map هم ساخته می‌شود تا خطاها و DevTools همان فایل و شمارهٔ خط اصلی را نشان دهند.
// - فایل payslip-online.html روی دیسک تغییر نمی‌کند: باز کردن مستقیم فایل (file://) یا هر سرور ایستای دیگر مثل قبل ۵۱ اسکریپت را می‌خواند.
// - همهٔ فایل‌ها با "use strict" شروع می‌شوند و بسته هم با همان شروع می‌شود، پس حالت strict هر فایل حفظ می‌شود.
// - ایمنی: اگر هر شرطی برقرار نباشد (فهرست تگ‌های HTML با manifest یکی نباشد، فایلی "use strict" نداشته باشد، بسته کامپایل نشود،
//   یا نام تابع سطح‌بالا در دو فایل تکرار شده باشد) بسته ساخته نمی‌شود و صفحه مثل قبل با اسکریپت‌های جدا ارائه می‌شود (هشدار در لاگ).
// - با تغییر هر فایل (mtime/اندازه) بسته در درخواست بعدی دوباره ساخته می‌شود؛ ?v= از hash محتوا ساخته می‌شود، پس Cache یک‌ساله امن است.
// - خاموش کردن: CLIENT_BUNDLE=0 در .env
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const vm = require("vm");

const HTML_PATHS = new Set(["/", "/index.html", "/payslip-online.html"]);
const BUNDLE_PATH = "/js/bundle.js";
const MAP_PATH = "/js/bundle.js.map";
const SCRIPT_TAG = /<script src="\.\/js\/([^"?]+)(?:\?v=[^"]*)?"><\/script>/g;

const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
function vlq(n) {
  let v = n < 0 ? (-n << 1) | 1 : n << 1;
  let out = "";
  do { let d = v & 31; v >>>= 5; if (v) d |= 32; out += B64[d]; } while (v);
  return out;
}

function readManifest(clientDir) {
  const list = JSON.parse(fs.readFileSync(path.join(clientDir, "js", "manifest.json"), "utf8"));
  if (!Array.isArray(list) || !list.length || list.some((f) => typeof f !== "string" || !/^[a-z0-9-]+\/[a-z0-9-]+\.js$/.test(f))) {
    throw new Error("js/manifest.json نامعتبر است");
  }
  if (new Set(list).size !== list.length) throw new Error("نام تکراری در js/manifest.json");
  return list;
}

// نام‌های سطح‌بالای var/function یک فایل، دقیقاً با موتور V8 (بدون اجرای کد برنامه): فایل در یک context خالی با
// «throw 0» درست بعد از "use strict" اجرا می‌شود؛ V8 پیش از اولین دستور همهٔ تعریف‌های function/var را می‌سازد و بعد متوقف می‌شود.
// نام‌ها از داخل خود context (globalThis) خوانده می‌شوند، نه از شیء sandbox بیرونی: sandbox فقط تابع‌ها را منعکس می‌کند و var ها را نه
// (و تکرار function/var بین فایل‌ها بی‌صدا رد می‌شد). let/const/class در این فهرست نیستند؛ تعریف تکراری‌شان را کامپایل بسته می‌گیرد.
// (متنِ داخل رشته‌ها و template literalها — مثل اسکریپت پنجرهٔ چاپ در print/forms.js — تعریف حساب نمی‌شود.)
const NAMES_PROBE = "Object.getOwnPropertyNames(globalThis).map((n) => [n, typeof globalThis[n]])";
function topLevelNames(src, filename) {
  const ctx = vm.createContext(Object.create(null));
  const before = new Set(vm.runInContext(NAMES_PROBE, ctx).map((x) => x[0]));
  try { new vm.Script(src.replace(/^"use strict";/, '"use strict";throw 0;'), { filename }).runInContext(ctx); }
  catch (e) { if (e !== 0) throw e; }
  const out = new Map();
  for (const [n, t] of vm.runInContext(NAMES_PROBE, ctx)) if (!before.has(n)) out.set(n, t === "function" ? "function" : "var");
  return out;
}

function buildBundle(clientDir) {
  const files = readManifest(clientDir);
  const lines = [];
  const map = [];
  const owners = new Map();
  let pSrc = 0;
  let pLine = 0;
  files.forEach((f, i) => {
    let src = fs.readFileSync(path.join(clientDir, "js", f), "utf8");
    if (src.charCodeAt(0) === 0xfeff) src = src.slice(1);
    src = src.replace(/\r\n?/g, "\n");   // پایان خط ویندوزی؛ در JS هر دو یک پایان خط‌اند (در template literal هم به \n تبدیل می‌شوند)
    if (!/^"use strict";/.test(src)) throw new Error(`js/${f} باید با "use strict"; شروع شود`);
    // تابع سطح‌بالا که نامش در فایل دیگری هم (به‌صورت function یا var) تعریف شده: در اسکریپت‌های جدا مقدار نهایی به ترتیب
    // بارگذاری فایل‌هاست، ولی در یک اسکریپت واحد تابع از همان ابتدا (hoisting) تعریف می‌شود؛ رفتار فرق می‌کند، پس بسته ساخته نمی‌شود.
    for (const [n, kind] of topLevelNames(src, `js/${f}`)) {
      const prev = owners.get(n);
      if (prev && (kind === "function" || prev.kind === "function")) throw new Error(`نام سطح‌بالای «${n}» هم در js/${prev.file} و هم در js/${f} تعریف شده است`);
      if (!prev) owners.set(n, { file: f, kind });
    }
    lines.push(`/* ==== js/${f} ==== */`); map.push("");
    const ls = src.split("\n");
    if (ls[ls.length - 1] === "") ls.pop();
    ls.forEach((l, n) => {
      lines.push(l);
      map.push(vlq(0) + vlq(i - pSrc) + vlq(n - pLine) + vlq(0));
      pSrc = i; pLine = n;
    });
    lines.push(";"); map.push("");   // جداکننده: فایل بعدی هرگز ادامهٔ عبارت پایانی فایل قبلی خوانده نمی‌شود
  });
  const body = lines.join("\n") + "\n";
  new vm.Script(body, { filename: "bundle.js" });   // فقط کامپایل (اجرا نمی‌شود): خطای نحوی یا تعریف تکراری let/const/class بین فایل‌ها
  const hash = crypto.createHash("sha256").update(body).digest("hex").slice(0, 12);
  const code = body + `//# sourceMappingURL=bundle.js.map?v=${hash}\n`;
  const sourceMap = JSON.stringify({ version: 3, file: "bundle.js", sources: files, names: [], mappings: map.join(";") });
  return { files, code, map: sourceMap, hash };
}

// تگ‌های <script src="./js/…"> صفحه باید دقیقاً همان فهرست manifest، به همان ترتیب و پشت سر هم باشند؛ وگرنه null
function rewriteHtml(html, files, bundleSrc) {
  const tags = [...html.matchAll(SCRIPT_TAG)];
  if (tags.length !== files.length || tags.some((m, i) => m[1] !== files[i])) return null;
  for (let i = 1; i < tags.length; i++) {
    const gap = html.slice(tags[i - 1].index + tags[i - 1][0].length, tags[i].index);
    if (/\S/.test(gap)) return null;
  }
  const start = tags[0].index;
  const end = tags[tags.length - 1].index + tags[tags.length - 1][0].length;
  return html.slice(0, start) + `<script src="${bundleSrc}"></script>` + html.slice(end);
}

function clientBundle({ clientDir, env = process.env, log = console } = {}) {
  const htmlFile = path.join(clientDir, "payslip-online.html");
  const manifestFile = path.join(clientDir, "js", "manifest.json");
  let state = null;

  const stamp = () => {
    const list = [htmlFile, manifestFile];
    try { for (const f of readManifest(clientDir)) list.push(path.join(clientDir, "js", f)); } catch (e) { /* خطا در buildBundle گزارش می‌شود */ }
    return list.map((f) => { try { const s = fs.statSync(f); return `${s.mtimeMs}:${s.size}`; } catch (e) { return "-"; } }).join("|");
  };
  const current = () => {
    const key = stamp();
    if (state && state.key === key) return state;
    try {
      const b = buildBundle(clientDir);
      const html = rewriteHtml(fs.readFileSync(htmlFile, "utf8"), b.files, `./js/bundle.js?v=${b.hash}`);
      if (html == null) throw new Error("تگ‌های <script> در payslip-online.html با js/manifest.json یکی نیستند");
      state = { key, ok: true, html, ...b };
      if (log && log.log) log.log(`بستهٔ اسکریپت‌های کلاینت: ${b.files.length} فایل، ${Math.round(b.code.length / 1024)}KB (v=${b.hash})`);
    } catch (e) {
      state = { key, ok: false };
      if (log && log.warn) log.warn("بستهٔ یکجای اسکریپت‌ها ساخته نشد؛ صفحه با اسکریپت‌های جدا ارائه می‌شود:", e.message);
    }
    return state;
  };

  return function clientBundleMw(req, res, next) {
    if (env.CLIENT_BUNDLE === "0" || (req.method !== "GET" && req.method !== "HEAD")) return next();
    const url = String(req.originalUrl || req.url || "/");
    const p = req.path || url.split("?")[0];
    const isHtml = HTML_PATHS.has(p);
    if (!isHtml && p !== BUNDLE_PATH && p !== MAP_PATH) return next();
    const s = current();
    if (!s.ok) return next();
    let body;
    if (isHtml) {
      body = s.html;
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.setHeader("Cache-Control", "no-store");
    } else {
      body = p === BUNDLE_PATH ? s.code : s.map;
      res.setHeader("Content-Type", p === BUNDLE_PATH ? "text/javascript; charset=utf-8" : "application/json; charset=utf-8");
      const v = new URLSearchParams(url.split("?")[1] || "").get("v");
      res.setHeader("Cache-Control", v === s.hash ? "public, max-age=31536000, immutable" : "no-cache");
    }
    const buf = Buffer.from(body, "utf8");
    res.statusCode = 200;
    res.setHeader("Content-Length", buf.length);
    res.end(req.method === "HEAD" ? undefined : buf);
  };
}

module.exports = { clientBundle, buildBundle, rewriteHtml, readManifest, vlq, BUNDLE_PATH, MAP_PATH };
