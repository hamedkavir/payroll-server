// جدول متمرکز و Declarative مسیرهای API و سطح دسترسی‌ها (نسخهٔ ۱۱۲)
// ---------------------------------------------------------------------------
// پیش از این، هر مسیر با یک فراخوانی API(path, read, write, router) داخل app.js ثبت می‌شد و قاعده‌های خاص
// (مثلاً «خروجی پرسنل فقط با مجوز personnel») به‌صورت تابع‌های درون‌خطی نوشته شده بودند. حالا همهٔ مسیرها
// یک‌جا و فقط به‌صورت «داده» تعریف می‌شوند و app.js فقط mountRoutes(app) را صدا می‌زند.
//
// هر ردیف:
//   path     مسیر mount (مثل app.use)؛ ترتیب ردیف‌ها همان ترتیب ثبت در Express است و مهم است
//            (مثلاً /api/changes/codes پیش از /api/changes).
//   access   "public"  بدون کلید API (فقط بررسی سلامت)
//            "apiKey"  فقط کلید API؛ خود روتر نشست را بررسی می‌کند (ورود/خروج/تغییر رمز)
//            "admin"   کلید API + کاربر واردشده + مدیر
//            "gated"   (پیش‌فرض) کلید API + کاربر واردشده + مجوز بخش (read/write یا rules)
//   read     مجوزهای GET/HEAD؛ null = هر کاربر واردشده
//   write    مجوزهای بقیهٔ متدها (POST/PUT/PATCH/DELETE/...)؛ null = هر کاربر واردشده
//   rules    به‌جای read/write: فهرست قاعده‌ها؛ اولین قاعده‌ای که بخورد مجوزها را تعیین می‌کند. شرط‌ها:
//              method     متد دقیق (رشته یا آرایه؛ توجه: در rules، HEAD با GET یکی حساب نمی‌شود — رفتار قبلی)
//              notMethod  هر متدی به‌جز این
//              prefix     req.path (نسبت به path) با این شروع شود
//              suffix     req.path با این تمام شود
//              paths      req.path دقیقاً یکی از این‌ها باشد
//            آخرین قاعده باید بدون شرط باشد (پیش‌فرض)؛ validateRoutes این را بررسی می‌کند.
//   module   فایل روتر نسبت به پوشهٔ server (مثل "routes/settings")؛ export = نام خروجی در صورت نیاز
//
// قاعدهٔ مشترک: مدیر همیشه دسترسی دارد؛ کاربری که باید رمزش را عوض کند فقط به me/password/logout می‌رسد (auth.js).
// افزودن مسیر تازه: یک ردیف به ROUTES اضافه کنید و مجوزهای جدید را در PERMS (auth.js) تعریف کنید؛
// tests/test_routes.js همهٔ مجوزها را با PERMS و رفتار نسخهٔ قبل مقایسه می‌کند.
const path = require("path");

// مجوزهایی که خواندن فهرست/پروفایل پرسنل را باز می‌کنند (همهٔ بخش‌هایی که فرد انتخاب می‌کنند)
const PERSON_READ = Object.freeze(["personnel", "loanform", "advance", "goods", "slips", "loans", "services", "emdad", "changes", "life", "schools", "insurance", "mehr", "cheque"]);
const ANY = null;   // هر کاربر واردشده

const ROUTES = Object.freeze([
  // بررسی سلامت سرور، بدون نیاز به کلید API (برای مانیتورینگ)
  { path: "/api/health", access: "public", method: "GET", handler: (req, res) => res.json({ ok: true, time: new Date().toISOString() }) },

  // ورود، خروج، من، تغییر رمز (نشست داخل خود روتر بررسی می‌شود)
  { path: "/api/auth", access: "apiKey", module: "routes/auth", export: "auth" },
  { path: "/api/users", access: "admin", module: "routes/auth", export: "users" },
  { path: "/api/admin", access: "admin", module: "routes/admin" },                 // راه‌اندازی اولیه
  { path: "/api/backup", access: "admin", module: "routes/backup", export: "router" }, // پشتیبان‌گیری و بازیابی

  { path: "/api/settings", read: ANY, write: ["settings", "set_slip"], module: "routes/settings" },
  { path: "/api/sync", read: ANY, write: ANY, module: "routes/sync" },             // همگام‌سازی سبک پس‌زمینه
  { path: "/api/periods", read: ANY, write: ["import"], module: "routes/periods" },
  { path: "/api/periods/:id/people", read: ANY, write: ["import"], module: "routes/people" },
  {
    path: "/api/personnel", module: "routes/personnel",
    rules: [
      { method: "GET", prefix: "/export", perms: ["personnel"] },          // خروجی اکسل پرسنل
      { method: "GET", suffix: "/profile", perms: ["personnel", "slips"] }, // پروندهٔ کامل فرد (فیش‌ها)
      { method: "GET", perms: PERSON_READ },                                // جست‌وجو و انتخاب فرد
      { perms: ["personnel"] },                                             // هر تغییر (و HEAD)
    ],
  },
  { path: "/api/dashboard", read: ["dashboard"], write: ["dashboard"], module: "routes/dashboard" },
  {
    path: "/api/loan-queue", module: "routes/loanQueue",
    rules: [
      // محاسبهٔ دوباره و ورود از اکسل، پارامترهای وام را هم تغییر می‌دهند
      { notMethod: "GET", paths: ["/recompute-pending", "/import"], perms: ["loans", "loanform", "settings", "set_loan"] },
      { perms: ["loans", "loanform"] },
    ],
  },
  { path: "/api/form-settings", read: ANY, write: ["settings", "set_slip", "set_forms", "set_round", "set_codes"], module: "routes/extras", export: "formSettings" },
  { path: "/api/loan-params", read: ANY, write: ["settings", "set_loan"], module: "routes/extras", export: "loanParams" },
  { path: "/api/advances", read: ["advance"], write: ["advance"], module: "routes/extras", export: "advances" },
  {
    path: "/api/inventory", module: "routes/extras", export: "inventory",
    rules: [
      { prefix: "/orders", perms: ["goods"] },                 // درخواست کالا (همهٔ متدها)
      { method: "GET", perms: ["inventory", "goods"] },
      { perms: ["inventory"] },
    ],
  },
  { path: "/api/photos", read: ["personnel"], write: ["personnel"], module: "routes/photos" },   // عکس پرسنل
  { path: "/api/reports", read: ["reports"], write: ["reports"], module: "routes/reports" },
  // موسسات: خواندن فهرست برای ثبت‌کنندگان درخواست خدمات هم آزاد است
  {
    path: "/api/institutions", module: "routes/services", export: "institutions",
    rules: [
      { method: "GET", perms: ["institutions", "services"] },
      { perms: ["institutions"] },
    ],
  },
  { path: "/api/services", read: ["services"], write: ["services"], module: "routes/services", export: "requests" },
  { path: "/api/emdad", read: ["emdad"], write: ["emdad"], module: "routes/emdad" },
  { path: "/api/mehr-loans", read: ["mehr"], write: ["mehr"], module: "routes/mehrLoans" },        // وام بانک مهر
  { path: "/api/cheques", read: ["cheque"], write: ["cheque"], module: "routes/cheques" },         // صدور دسته چک
  { path: "/api/banks", read: ["cheque", "schools", "banks"], write: ["banks"], module: "routes/banks" },
  { path: "/api/assets", read: ANY, write: ["settings", "set_forms"], module: "routes/assets" },   // امضای مدیر
  { path: "/api/changes/codes", read: ["changes"], write: ["changes"], module: "routes/changes", export: "codes" },
  { path: "/api/dcodes", read: ["dcodes", "changes"], write: ["dcodes"], module: "routes/dcodes" },
  { path: "/api/life", read: ["life"], write: ["life"], module: "routes/life" },
  { path: "/api/deceased", read: ["deceased"], write: ["deceased"], module: "routes/deceased" },
  { path: "/api/schools", read: ["schools"], write: ["schools"], module: "routes/schools" },
  { path: "/api/status-history", read: ["statushistory"], write: ["statushistory"], module: "routes/statusHistory" },
  { path: "/api/insurance", read: ["insurance"], write: ["insurance"], module: "routes/insurance", export: "router" },
  { path: "/api/vefagh", read: ["loanform"], write: ["loanform"], module: "routes/vefagh" },        // مجوز همان «ثبت وام»
  { path: "/api/capital-increase", read: ["loanform"], write: ["loanform"], module: "routes/capitalIncrease", export: "router" },
  { path: "/api/changes", read: ["changes"], write: ["changes"], module: "routes/changes", export: "router" },
  { path: "/api/closings", read: ["closing", "reports", "dashboard"], write: ["closing"], module: "routes/closings", export: "router" },
].map((r) => Object.freeze({ access: "gated", ...r })));

const ACCESS = new Set(["public", "apiKey", "admin", "gated"]);
const RULE_KEYS = new Set(["method", "notMethod", "prefix", "suffix", "paths", "perms"]);
const asList = (v) => (Array.isArray(v) ? v : [v]);

function ruleMatches(rule, req) {
  const m = String(req.method || "").toUpperCase();
  const p = String(req.path || "/");
  if (rule.method !== undefined && !asList(rule.method).includes(m)) return false;
  if (rule.notMethod !== undefined && asList(rule.notMethod).includes(m)) return false;
  if (rule.prefix !== undefined && !p.startsWith(rule.prefix)) return false;
  if (rule.suffix !== undefined && !p.endsWith(rule.suffix)) return false;
  if (rule.paths !== undefined && !rule.paths.includes(p)) return false;
  return true;
}

// مجوزهای لازم برای یک درخواست روی یک ردیف «gated» (null = هر کاربر واردشده)
function permsFor(route, req) {
  if (route.rules) {
    for (const rule of route.rules) if (ruleMatches(rule, req)) return rule.perms;
    return [];   // هیچ قاعده‌ای نخورد ← فقط مدیر (validateRoutes نمی‌گذارد این حالت پیش بیاید)
  }
  return req.method === "GET" || req.method === "HEAD" ? route.read : route.write;
}

// بررسی سازگاری جدول (هنگام mount و در تست‌ها): مجوز ناشناخته، مسیر تکراری، قاعدهٔ ناقص، access نامعتبر
function validateRoutes(routes = ROUTES, perms = require("./auth").PERMS) {
  const errors = [];
  const known = new Set(perms);
  const seen = new Set();
  const checkPerms = (where, list) => {
    if (list === null) return;
    if (!Array.isArray(list) || !list.length) return errors.push(`${where}: مجوزها باید آرایهٔ غیرخالی یا null باشد`);
    for (const p of list) if (!known.has(p)) errors.push(`${where}: مجوز ناشناخته «${p}» (در PERMS تعریف نشده)`);
  };
  routes.forEach((r, i) => {
    const where = `${r.path || "#" + i}`;
    if (!/^\/api(\/|$)/.test(String(r.path || ""))) errors.push(`${where}: مسیر باید با /api شروع شود`);
    const key = `${r.method || "USE"} ${r.path}`;
    if (seen.has(key)) errors.push(`${where}: مسیر تکراری`);
    seen.add(key);
    if (!ACCESS.has(r.access)) errors.push(`${where}: access نامعتبر «${r.access}»`);
    if (!r.handler && !r.module) errors.push(`${where}: module یا handler لازم است`);
    if (r.access !== "gated") {
      if (r.rules || "read" in r || "write" in r) errors.push(`${where}: read/write/rules فقط برای access=gated است`);
      return;
    }
    if (r.rules) {
      if ("read" in r || "write" in r) errors.push(`${where}: rules و read/write با هم نمی‌آیند`);
      if (!r.rules.length) errors.push(`${where}: rules خالی است`);
      r.rules.forEach((rule, j) => {
        for (const k of Object.keys(rule)) if (!RULE_KEYS.has(k)) errors.push(`${where} قاعدهٔ ${j + 1}: کلید ناشناخته «${k}»`);
        checkPerms(`${where} قاعدهٔ ${j + 1}`, rule.perms);
      });
      const last = r.rules[r.rules.length - 1];
      if (last && Object.keys(last).some((k) => k !== "perms")) errors.push(`${where}: آخرین قاعده باید بدون شرط (پیش‌فرض) باشد`);
    } else {
      if (!("read" in r) || !("write" in r)) errors.push(`${where}: read و write هر دو لازم‌اند (null = هر کاربر واردشده)`);
      checkPerms(`${where} read`, r.read);
      checkPerms(`${where} write`, r.write);
    }
  });
  return errors;
}

function defaultDeps() {
  const { authenticate, requireAdmin, gate } = require("./auth");
  return { requireApiKey: require("./middleware/auth"), authenticate, requireAdmin, gate, load: (m) => require(path.join(__dirname, m)) };
}

// زنجیرهٔ middleware هر ردیف (بدون روتر)
function chainFor(route, deps) {
  switch (route.access) {
    case "public": return [];
    case "apiKey": return [deps.requireApiKey];
    case "admin": return [deps.requireApiKey, deps.authenticate, deps.requireAdmin];
    default: return [deps.requireApiKey, deps.authenticate, deps.gate((req) => permsFor(route, req))];
  }
}

function resolveRouter(route, deps) {
  const mod = deps.load(route.module);
  const router = route.export ? mod && mod[route.export] : mod;
  if (!router) throw new Error(`روتر ${route.module}${route.export ? "." + route.export : ""} برای ${route.path} پیدا نشد`);
  return router;
}

// ثبت همهٔ مسیرها روی app به ترتیب جدول
function mountRoutes(app, opts = {}) {
  const routes = opts.routes || ROUTES;
  const deps = { ...defaultDeps(), ...(opts.deps || {}) };
  const errors = validateRoutes(routes, opts.perms);
  if (errors.length) throw new Error("جدول مسیرها نامعتبر است:\n  " + errors.join("\n  "));
  for (const r of routes) {
    const chain = chainFor(r, deps);
    if (r.handler) app[String(r.method || "get").toLowerCase()](r.path, ...chain, r.handler);
    else app.use(r.path, ...chain, resolveRouter(r, deps));
  }
  return routes.length;
}

// خلاصهٔ خوانا (برای README و `npm run routes`)
function describeRoutes(routes = ROUTES) {
  const fmt = (p) => (p === null ? "هر کاربر واردشده" : p.join("، "));
  return routes.map((r) => {
    if (r.access === "public") return { path: r.path, access: "عمومی (بدون کلید)", read: "-", write: "-" };
    if (r.access === "apiKey") return { path: r.path, access: "کلید API (نشست در خود روتر)", read: "-", write: "-" };
    if (r.access === "admin") return { path: r.path, access: "فقط مدیر", read: "مدیر", write: "مدیر" };
    if (r.rules) {
      const txt = r.rules.map((x) => {
        const cond = [x.method && `${asList(x.method).join("/")}`, x.notMethod && `غیر ${asList(x.notMethod).join("/")}`, x.prefix && `${x.prefix}…`, x.suffix && `…${x.suffix}`, x.paths && x.paths.join(" | ")].filter(Boolean).join(" ");
        return `${cond || "بقیه"}: ${fmt(x.perms)}`;
      }).join("؛ ");
      return { path: r.path, access: "قاعده‌ای", read: txt, write: "" };
    }
    return { path: r.path, access: "مجوز بخش", read: fmt(r.read), write: fmt(r.write) };
  });
}

module.exports = { ROUTES, PERSON_READ, permsFor, ruleMatches, validateRoutes, chainFor, mountRoutes, describeRoutes };

// خط فرمان: node routeTable.js ← جدول Markdown مسیرها و مجوزها
if (require.main === module) {
  const errs = validateRoutes();
  console.log("| مسیر | نوع دسترسی | خواندن (GET) | نوشتن |\n|---|---|---|---|");
  for (const d of describeRoutes()) console.log(`| \`${d.path}\` | ${d.access} | ${d.read} | ${d.write} |`);
  if (errs.length) { console.error("\n✖ " + errs.join("\n✖ ")); process.exitCode = 1; }
}
