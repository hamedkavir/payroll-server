// جدول Declarative مسیرها (server/routeTable.js): همان سطح دسترسی‌ها و همان ترتیب ثبت نسخهٔ ۱۱۲
const assert = require("assert");
const H = require("./helpers");
const { run } = H;

// ---------------------------------------------------------------------------
// مرجع: تعریف‌های درون‌خطیِ app.js نسخهٔ ۱۱۲ (عیناً کپی‌شده). هر تغییری در routeTable.js باید با این‌ها برابر بماند،
// مگر آنکه تغییر سطح دسترسی آگاهانه باشد (در آن صورت همین مرجع و README هم به‌روز می‌شوند).
// ---------------------------------------------------------------------------
const LEGACY_PERSON_READ = ["personnel", "loanform", "advance", "goods", "slips", "loans", "services", "emdad", "changes", "life", "schools", "insurance", "mehr", "cheque"];
const LEGACY = [
  ["/api/health", "public"],
  ["/api/auth", "apiKey"],
  ["/api/users", "admin"],
  ["/api/admin", "admin"],
  ["/api/backup", "admin"],
  ["/api/settings", "gated", null, ["settings", "set_slip"]],
  ["/api/sync", "gated", null, null],
  ["/api/periods", "gated", null, ["import"]],
  ["/api/periods/:id/people", "gated", null, ["import"]],
  ["/api/personnel", "gated", (req) => (req.method === "GET" ? (/\/profile$|^\/export/.test(req.path) ? (req.path.startsWith("/export") ? ["personnel"] : ["personnel", "slips"]) : LEGACY_PERSON_READ) : ["personnel"]), null],
  ["/api/dashboard", "gated", ["dashboard"], ["dashboard"]],
  ["/api/loan-queue", "gated", (req) => (req.method !== "GET" && (req.path === "/recompute-pending" || req.path === "/import") ? ["loans", "loanform", "settings", "set_loan"] : ["loans", "loanform"]), null],
  ["/api/form-settings", "gated", null, ["settings", "set_slip", "set_forms", "set_round", "set_codes"]],
  ["/api/loan-params", "gated", null, ["settings", "set_loan"]],
  ["/api/advances", "gated", ["advance"], ["advance"]],
  ["/api/inventory", "gated", (req) => (req.path.startsWith("/orders") ? ["goods"] : (req.method === "GET" ? ["inventory", "goods"] : ["inventory"])), null],
  ["/api/photos", "gated", ["personnel"], ["personnel"]],
  ["/api/reports", "gated", ["reports"], ["reports"]],
  ["/api/institutions", "gated", (req) => (req.method === "GET" ? ["institutions", "services"] : ["institutions"]), null],
  ["/api/services", "gated", ["services"], ["services"]],
  ["/api/emdad", "gated", ["emdad"], ["emdad"]],
  ["/api/mehr-loans", "gated", ["mehr"], ["mehr"]],
  ["/api/cheques", "gated", ["cheque"], ["cheque"]],
  ["/api/banks", "gated", ["cheque", "schools", "banks"], ["banks"]],
  ["/api/assets", "gated", null, ["settings", "set_forms"]],
  ["/api/changes/codes", "gated", ["changes"], ["changes"]],
  ["/api/dcodes", "gated", ["dcodes", "changes"], ["dcodes"]],
  ["/api/life", "gated", ["life"], ["life"]],
  ["/api/deceased", "gated", ["deceased"], ["deceased"]],
  ["/api/schools", "gated", ["schools"], ["schools"]],
  ["/api/status-history", "gated", ["statushistory"], ["statushistory"]],
  ["/api/insurance", "gated", ["insurance"], ["insurance"]],
  ["/api/vefagh", "gated", ["loanform"], ["loanform"]],
  ["/api/capital-increase", "gated", ["loanform"], ["loanform"]],
  ["/api/changes", "gated", ["changes"], ["changes"]],
  ["/api/closings", "gated", ["closing", "reports", "dashboard"], ["closing"]],
];
// روتر/خروجی هر مسیر در app.js نسخهٔ ۱۱۲
const LEGACY_MODULES = {
  "/api/auth": "routes/auth.auth", "/api/users": "routes/auth.users", "/api/admin": "routes/admin", "/api/backup": "routes/backup.router",
  "/api/settings": "routes/settings", "/api/sync": "routes/sync", "/api/periods": "routes/periods", "/api/periods/:id/people": "routes/people",
  "/api/personnel": "routes/personnel", "/api/dashboard": "routes/dashboard", "/api/loan-queue": "routes/loanQueue",
  "/api/form-settings": "routes/extras.formSettings", "/api/loan-params": "routes/extras.loanParams", "/api/advances": "routes/extras.advances",
  "/api/inventory": "routes/extras.inventory", "/api/photos": "routes/photos", "/api/reports": "routes/reports",
  "/api/institutions": "routes/services.institutions", "/api/services": "routes/services.requests", "/api/emdad": "routes/emdad",
  "/api/mehr-loans": "routes/mehrLoans", "/api/cheques": "routes/cheques", "/api/banks": "routes/banks", "/api/assets": "routes/assets",
  "/api/changes/codes": "routes/changes.codes", "/api/dcodes": "routes/dcodes", "/api/life": "routes/life", "/api/deceased": "routes/deceased",
  "/api/schools": "routes/schools", "/api/status-history": "routes/statusHistory", "/api/insurance": "routes/insurance.router",
  "/api/vefagh": "routes/vefagh", "/api/capital-increase": "routes/capitalIncrease.router", "/api/changes": "routes/changes.router",
  "/api/closings": "routes/closings.router",
};

const METHODS = ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"];
const SUBPATHS = ["/", "/1", "/search", "/export", "/export/xlsx", "/exports", "/123/profile", "/profile", "/123/profile/x", "/orders", "/orders/7", "/order", "/recompute-pending", "/recompute-pending/x", "/import", "/import/", "/x/import", "/goods", "/a/b/c"];

const userRow = (o = {}) => ({ id: 7, username: "u7", full_name: "کاربر", is_admin: 0, active: 1, permissions: "[]", must_change: 0, created_at: new Date(), nav_order: null, ...o });

function legacyChain(entry, auth) {
  const [, kind, read, write] = entry;
  if (kind === "public") return "public";
  if (kind === "apiKey") return "apiKey";
  if (kind === "admin") return "admin";
  return auth.gate(read, write);
}
// اجرای یک middleware دسترسی با کاربر داده‌شده ← "pass" یا کد خطا
async function decide(mw, user, method, subpath) {
  const out = await run([mw], { method, path: subpath, originalUrl: subpath, user });
  return out.passed ? "pass" : `${out.status}:${out.body && out.body.error}`;
}
// ثبت مسیرها روی یک app ساختگی با وابستگی‌های نشانه‌دار
function mountFake(opts = {}) {
  const auth = H.load("auth.js");
  const RT = H.load("routeTable.js");
  const calls = [];
  const tag = (name) => Object.assign((req, res, next) => next(), { tag: name });
  const app = {
    use: (p, ...h) => calls.push({ kind: "use", path: p, handlers: h }),
    get: (p, ...h) => calls.push({ kind: "get", path: p, handlers: h }),
  };
  const deps = { requireApiKey: tag("apiKey"), authenticate: tag("authenticate"), requireAdmin: Object.assign(auth.requireAdmin, { tag: "requireAdmin" }), gate: auth.gate, ...(opts.deps || {}) };
  // بدون بارگذاری واقعی: هر ماژول/خروجی یک روتر خالیِ نشانه‌دار است
  if (!opts.realLoad) deps.load = (m) => new Proxy({}, { get: (_, k) => ({ stub: `${m}.${String(k)}` }) });
  const n = RT.mountRoutes(app, { deps });
  return { calls, RT, auth, n };
}

exports["جدول مسیرها: بدون خطای اعتبارسنجی؛ همهٔ مجوزها در PERMS تعریف شده‌اند"] = async () => {
  H.setPool({ async query() { return [[]]; } });
  const RT = H.load("routeTable.js");
  const { PERMS } = H.load("auth.js");
  assert.deepStrictEqual(RT.validateRoutes(RT.ROUTES, PERMS), []);
  for (const r of RT.ROUTES) assert.ok(Object.isFrozen(r), `${r.path} باید تغییرناپذیر باشد`);
};

exports["جدول مسیرها: همان مسیرها، همان ترتیب ثبت و همان نوع دسترسی (کلید/مدیر/مجوز) نسخهٔ ۱۱۲"] = async () => {
  H.setPool({ async query() { return [[]]; } });
  const RT = H.load("routeTable.js");
  assert.deepStrictEqual(RT.ROUTES.map((r) => r.path), LEGACY.map((e) => e[0]));
  assert.deepStrictEqual(RT.ROUTES.map((r) => r.access), LEGACY.map((e) => e[1]));
  assert.deepStrictEqual([...RT.PERSON_READ], LEGACY_PERSON_READ);
  for (const r of RT.ROUTES) {
    if (r.handler) continue;
    assert.strictEqual(`${r.module}${r.export ? "." + r.export : ""}`, LEGACY_MODULES[r.path], `روتر ${r.path}`);
  }
  // /api/changes/codes باید پیش از /api/changes و /api/periods پیش از /api/periods/:id/people ثبت شود (رفتار Express)
  const idx = (p) => RT.ROUTES.findIndex((r) => r.path === p);
  assert.ok(idx("/api/changes/codes") < idx("/api/changes"));
  assert.ok(idx("/api/periods") < idx("/api/periods/:id/people"));
};

exports["جدول مسیرها: زنجیرهٔ middleware هر مسیر (کلید API ← نشست ← مدیر/مجوز ← روتر)"] = async () => {
  H.setPool({ async query() { return [[]]; } });
  const { calls, n } = mountFake();
  assert.strictEqual(n, LEGACY.length);
  assert.strictEqual(calls.length, LEGACY.length);
  calls.forEach((c, i) => {
    const [p, kind] = LEGACY[i];
    assert.strictEqual(c.path, p);
    const tags = c.handlers.slice(0, -1).map((h) => h.tag || "gate");
    if (kind === "public") { assert.strictEqual(c.kind, "get"); assert.deepStrictEqual(tags, []); }
    if (kind === "apiKey") assert.deepStrictEqual(tags, ["apiKey"], p);
    if (kind === "admin") assert.deepStrictEqual(tags, ["apiKey", "authenticate", "requireAdmin"], p);
    if (kind === "gated") assert.deepStrictEqual(tags, ["apiKey", "authenticate", "gate"], p);
    if (kind !== "public") assert.strictEqual(c.kind, "use");
  });
};

exports["جدول مسیرها: تصمیم دسترسی برای هر مسیر × متد × زیرمسیر × کاربر دقیقاً مثل نسخهٔ ۱۱۲"] = async () => {
  H.setPool({ async query() { return [[]]; } });
  const { calls, auth } = mountFake();
  const { PERMS } = auth;
  // کاربران: مدیر، بدون مجوز، هر مجوز تکی، و چند ترکیب
  const users = [userRow({ is_admin: 1 }), userRow(), ...PERMS.map((p) => userRow({ permissions: JSON.stringify([p]) })),
    userRow({ permissions: JSON.stringify(["loans", "settings"]) }), userRow({ permissions: JSON.stringify(["personnel", "slips"]) }),
    userRow({ permissions: JSON.stringify(["goods", "inventory"]) }), userRow({ permissions: JSON.stringify(PERMS) })].map(auth.userJSON);
  let checked = 0;
  for (let i = 0; i < LEGACY.length; i++) {
    const legacy = legacyChain(LEGACY[i], auth);
    const handlers = calls[i].handlers;
    const mw = handlers[handlers.length - 2];   // آخرین middleware پیش از روتر
    for (const user of users) for (const m of METHODS) for (const sp of SUBPATHS) {
      let want, got;
      if (legacy === "public" || legacy === "apiKey") continue;   // زنجیرهٔ این دو در تست قبلی بررسی شده است
      if (legacy === "admin") { want = user.isAdmin ? "pass" : "403:forbidden"; got = await decide(mw, user, m, sp); }
      else { want = await decide(legacy, user, m, sp); got = await decide(mw, user, m, sp); }
      assert.strictEqual(got, want, `${m} ${LEGACY[i][0]}${sp} perms=${JSON.stringify(user.permissions)} admin=${user.isAdmin}`);
      checked++;
    }
  }
  assert.ok(checked > 50000, `تعداد حالت‌های بررسی‌شده کم است: ${checked}`);
};

exports["جدول مسیرها: نمونه‌های مهم (HEAD، خروجی پرسنل، ورود اکسل نوبت وام، درخواست کالا)"] = async () => {
  H.setPool({ async query() { return [[]]; } });
  const RT = H.load("routeTable.js");
  const r = (p) => RT.ROUTES.find((x) => x.path === p);
  const P = (p, method, path) => RT.permsFor(r(p), { method, path });
  assert.strictEqual(P("/api/settings", "GET", "/"), null);
  assert.strictEqual(P("/api/settings", "HEAD", "/"), null);                       // read/write: HEAD = خواندن
  assert.deepStrictEqual(P("/api/settings", "PUT", "/"), ["settings", "set_slip"]);
  assert.deepStrictEqual(P("/api/personnel", "HEAD", "/"), ["personnel"]);          // rules: HEAD ≠ GET (رفتار قبلی)
  assert.deepStrictEqual(P("/api/personnel", "GET", "/export"), ["personnel"]);
  assert.deepStrictEqual(P("/api/personnel", "GET", "/export/x/profile"), ["personnel"]);
  assert.deepStrictEqual(P("/api/personnel", "GET", "/96077189/profile"), ["personnel", "slips"]);
  assert.deepStrictEqual([...P("/api/personnel", "GET", "/")], LEGACY_PERSON_READ);
  assert.deepStrictEqual(P("/api/loan-queue", "POST", "/import"), ["loans", "loanform", "settings", "set_loan"]);
  assert.deepStrictEqual(P("/api/loan-queue", "GET", "/import"), ["loans", "loanform"]);
  assert.deepStrictEqual(P("/api/loan-queue", "POST", "/receive-import"), ["loans", "loanform"]);
  assert.deepStrictEqual(P("/api/inventory", "DELETE", "/orders/5"), ["goods"]);
  assert.deepStrictEqual(P("/api/inventory", "GET", "/items"), ["inventory", "goods"]);
  assert.deepStrictEqual(P("/api/inventory", "POST", "/items"), ["inventory"]);
};

exports["جدول مسیرها: ردیف نامعتبر (مجوز ناشناخته، قاعدهٔ بدون پیش‌فرض، مسیر تکراری) هنگام mount رد می‌شود"] = async () => {
  H.setPool({ async query() { return [[]]; } });
  const RT = H.load("routeTable.js");
  const { PERMS } = H.load("auth.js");
  const errs = (routes) => RT.validateRoutes(routes, PERMS);
  assert.ok(errs([{ path: "/api/x", access: "gated", read: ["no_such_perm"], write: null, module: "m" }]).some((e) => /no_such_perm/.test(e)));
  assert.ok(errs([{ path: "/api/x", access: "gated", read: [], write: null, module: "m" }]).length);
  assert.ok(errs([{ path: "/api/x", access: "gated", read: null, module: "m" }]).some((e) => /write/.test(e)));
  assert.ok(errs([{ path: "/api/x", access: "gated", rules: [{ method: "GET", perms: ["reports"] }], module: "m" }]).some((e) => /آخرین قاعده/.test(e)));
  assert.ok(errs([{ path: "/api/x", access: "gated", rules: [{ methd: "GET", perms: ["reports"] }, { perms: ["reports"] }], module: "m" }]).some((e) => /methd/.test(e)));
  assert.ok(errs([{ path: "/api/x", access: "admin", read: null, write: null, module: "m" }]).length);
  assert.ok(errs([{ path: "/api/x", access: "everyone", module: "m" }]).length);
  assert.ok(errs([{ path: "/x", access: "apiKey", module: "m" }]).length);
  const dup = { path: "/api/x", access: "gated", read: null, write: null, module: "m" };
  assert.ok(errs([dup, dup]).some((e) => /تکراری/.test(e)));
  assert.throws(() => RT.mountRoutes({ use() {}, get() {} }, { routes: [{ path: "/api/x", access: "gated", read: ["nope"], write: null, module: "m" }], deps: { load: () => ({}) } }), /نامعتبر/);
};

exports["جدول مسیرها: همهٔ ماژول‌های روتر واقعی پیدا و بارگذاری می‌شوند"] = async () => {
  H.setPool({ async query() { return [[]]; } });
  const { calls } = mountFake({ realLoad: true });
  for (const c of calls) {
    const last = c.handlers[c.handlers.length - 1];
    if (c.kind === "get") { assert.strictEqual(typeof last, "function"); continue; }
    assert.ok(last && typeof last === "object" && last.handlers, `${c.path}: خروجی روتر Express نیست`);
    assert.ok(Object.keys(last.handlers).length > 0, `${c.path}: روتر هیچ مسیری ندارد`);
  }
};

exports["جدول مسیرها: زنجیرهٔ واقعی — بدون کلید ۴۰۱، بدون نشست ۴۰۱، بدون مجوز ۴۰۳، با مجوز عبور؛ health بدون کلید"] = async () => {
  let user = userRow({ permissions: JSON.stringify(["reports"]) });
  H.setPool({ async query(sql) { if (/FROM user_sessions s JOIN users u/.test(sql)) return [[user]]; return [[]]; } });
  const auth = H.load("auth.js");
  const RT = H.load("routeTable.js");
  const calls = [];
  const app = { use: (p, ...h) => calls.push({ p, h }), get: (p, ...h) => calls.push({ p, h }) };
  RT.mountRoutes(app, { deps: { requireApiKey: H.load("middleware/auth.js"), authenticate: auth.authenticate, requireAdmin: auth.requireAdmin, gate: auth.gate, load: () => ({ router: {}, auth: {}, users: {}, formSettings: {}, loanParams: {}, advances: {}, inventory: {}, institutions: {}, requests: {}, codes: {} }) } });
  const chain = (p) => calls.find((c) => c.p === p).h.slice(0, -1);
  const KEY = process.env.API_KEY;
  const go = (p, method, headers) => run(chain(p), { method, path: "/", originalUrl: p, headers });

  const health = calls.find((c) => c.p === "/api/health");
  const hr = await run(health.h, { method: "GET", originalUrl: "/api/health" });
  assert.strictEqual(hr.body.ok, true);

  assert.strictEqual((await go("/api/reports", "GET", {})).status, 401);
  assert.strictEqual((await go("/api/reports", "GET", {})).body.error, "unauthorized");
  assert.strictEqual((await go("/api/reports", "GET", { "x-api-key": "wrong" })).status, 401);
  const noTok = await go("/api/reports", "GET", { "x-api-key": KEY });
  assert.strictEqual(noTok.status, 401); assert.strictEqual(noTok.body.error, "login_required");
  assert.ok((await go("/api/reports", "GET", { "x-api-key": KEY, "x-auth-token": "t" })).passed);
  const f = await go("/api/emdad", "GET", { "x-api-key": KEY, "x-auth-token": "t" });
  assert.strictEqual(f.status, 403); assert.strictEqual(f.body.error, "forbidden");
  // مسیرهای مدیر
  const adm = await go("/api/users", "GET", { "x-api-key": KEY, "x-auth-token": "t" });
  assert.strictEqual(adm.status, 403);
  user = userRow({ is_admin: 1 });
  assert.ok((await go("/api/users", "GET", { "x-api-key": KEY, "x-auth-token": "t" })).passed);
  assert.ok((await go("/api/backup", "POST", { "x-api-key": KEY, "x-auth-token": "t" })).passed);
  // ورود: فقط کلید (بدون نشست)
  assert.ok((await go("/api/auth", "POST", { "x-api-key": KEY })).passed);
  assert.strictEqual((await go("/api/auth", "POST", {})).status, 401);
  // اجبار تغییر رمز همچنان پیش از مجوز بخش اعمال می‌شود
  user = userRow({ is_admin: 1, must_change: 1 });
  const mc = await run(chain("/api/reports"), { method: "GET", path: "/", originalUrl: "/api/reports", headers: { "x-api-key": KEY, "x-auth-token": "t" } });
  assert.strictEqual(mc.body.error, "password_change_required");
};

exports["جدول مسیرها: خلاصهٔ خوانا برای README همهٔ مسیرها را دارد"] = async () => {
  H.setPool({ async query() { return [[]]; } });
  const RT = H.load("routeTable.js");
  const d = RT.describeRoutes();
  assert.strictEqual(d.length, RT.ROUTES.length);
  assert.ok(d.find((x) => x.path === "/api/personnel").read.includes("/export…"));
  assert.strictEqual(d.find((x) => x.path === "/api/users").access, "فقط مدیر");
};
