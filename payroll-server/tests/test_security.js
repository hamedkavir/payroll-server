const assert = require("assert");
const fs = require("fs");
const path = require("path");
const H = require("./helpers");
const { run } = H;

const userRow = (o = {}) => ({ id: 1, username: "u1", full_name: "کاربر", is_admin: 0, active: 1, permissions: JSON.stringify(["slips"]), must_change: 0, created_at: new Date(), nav_order: null, ...o });
// دیتابیس ساختگی برای authenticate: یک نشست معتبر برای کاربر داده‌شده
const authPool = (u, extra) => ({ async query(sql, p) { if (/FROM user_sessions s JOIN users u/.test(sql)) return [[u]]; if (extra) return extra(sql, p); return [[]]; } });
const hit = async (method, url, user) => {
  H.setPool(authPool(user));
  const { authenticate } = H.load("auth.js");
  return run([authenticate], { method, originalUrl: url, url, headers: { "x-auth-token": "tok" } });
};

// ۱) کاربری که باید رمز را عوض کند نتواند APIهای غیرمجاز را فراخوانی کند
exports["mustChange: API غیرمجاز ۴۰۳ می‌شود"] = async () => {
  const u = userRow({ must_change: 1 });
  for (const [m, url] of [["GET", "/api/personnel"], ["GET", "/api/personnel?q=1"], ["POST", "/api/loan-queue"], ["GET", "/api/auth/prefs"], ["PUT", "/api/auth/prefs"], ["GET", "/api/photos/123"], ["GET", "/api/settings"]]) {
    const r = await hit(m, url, u);
    assert.strictEqual(r.status, 403, `${m} ${url}`);
    assert.strictEqual(r.body.error, "password_change_required");
    assert.ok(!r.passed);
  }
};
exports["mustChange: فقط me / password / logout مجازند"] = async () => {
  const u = userRow({ must_change: 1 });
  for (const [m, url] of [["GET", "/api/auth/me"], ["GET", "/api/auth/me/"], ["GET", "/api/auth/me?x=1"], ["PUT", "/api/auth/password"], ["POST", "/api/auth/logout"]]) {
    const r = await hit(m, url, u);
    assert.ok(r.passed, `${m} ${url} باید مجاز باشد`);
  }
  // متد اشتباه روی مسیر مجاز مجاز نیست
  assert.strictEqual((await hit("DELETE", "/api/auth/password", u)).status, 403);
};
// ۲) پس از تغییر رمز دسترسی عادی برقرار شود
exports["بعد از تغییر رمز: دسترسی عادی برقرار می‌شود"] = async () => {
  const { hashPassword } = H.load("auth.js");
  let mustChange = 1, sessionsDeleted = 0;
  const pool = { async query(sql, p) {
    if (/FROM user_sessions s JOIN users u/.test(sql)) return [[userRow({ must_change: mustChange })]];
    if (/^SELECT \* FROM users WHERE id/.test(sql)) return [[{ id: 1, password_hash: hashPassword("oldpass") }]];
    if (/UPDATE users SET password_hash = \?, must_change = 0/.test(sql)) { mustChange = 0; return [{}]; }
    if (/DELETE FROM user_sessions/.test(sql)) { sessionsDeleted++; return [{}]; }
    return [[]];
  } };
  H.setPool(pool);
  const { authenticate } = H.load("auth.js");
  assert.strictEqual((await run([authenticate], { method: "GET", originalUrl: "/api/personnel", headers: { "x-auth-token": "t" } })).status, 403);
  // تغییر رمز از مسیر واقعی
  const before = H.routers.length;
  const authRoutes = H.load("routes/auth.js");
  const r = H.routers.slice(before)[0].handlers["PUT /password"];
  const out = await run(r, { method: "PUT", originalUrl: "/api/auth/password", headers: { "x-auth-token": "t" }, body: { oldPassword: "oldpass", newPassword: "newpass1" } });
  assert.ok(out.body && out.body.ok, JSON.stringify(out));
  assert.strictEqual(mustChange, 0);
  const after = await run([authenticate], { method: "GET", originalUrl: "/api/personnel", headers: { "x-auth-token": "t" } });
  assert.ok(after.passed, "بعد از تغییر رمز باید عبور کند");
};
exports["نشست نامعتبر یا بدون توکن ← ۴۰۱ (رفتار ورود/انقضا حفظ است)"] = async () => {
  H.setPool({ async query() { return [[]]; } });   // نشست پیدا نمی‌شود
  const { authenticate } = H.load("auth.js");
  const r = await run([authenticate], { method: "GET", originalUrl: "/api/personnel", headers: { "x-auth-token": "bad" } });
  assert.strictEqual(r.status, 401);
  const r2 = await run([authenticate], { method: "GET", originalUrl: "/api/personnel", headers: {} });
  assert.strictEqual(r2.status, 401);
};

// ۳) خطای داخلی دیتابیس اطلاعات حساس را نشان ندهد
exports["خطای دیتابیس: پیام عمومی و بدون جزئیات"] = async () => {
  const secret = "ER_ACCESS_DENIED_ERROR: Access denied for user 'payroll'@'10.9.8.7' (using password: YES) SECRET_TABLE_xyz";
  const err = Object.assign(new Error(secret), { code: "ER_ACCESS_DENIED_ERROR", sql: "SELECT secret FROM hidden" });
  H.setPool({ async query() { throw err; }, async getConnection() { throw err; } });
  const logged = []; const oe = console.error; console.error = (...a) => logged.push(a.join(" "));
  try {
    const before = H.routers.length;
    H.load("routes/loanQueue.js");
    const rt = H.routers.slice(before)[0];
    const r = await run(rt.handlers["GET /export"], { method: "GET", originalUrl: "/api/loan-queue/export", query: {} });
    assert.strictEqual(r.status, 500);
    const txt = JSON.stringify(r.body);
    assert.ok(!/10\.9\.8\.7|SECRET|ER_ACCESS|hidden|payroll/.test(txt), "نشت: " + txt);
    assert.ok(r.body.message && r.body.message.length > 5);
    assert.ok(logged.join("\n").includes("SECRET_TABLE_xyz"), "جزئیات باید در لاگ سرور بماند");
    // خطای برنامه‌نویسی (TypeError) هم نشت نکند
    H.setPool({ async query() { throw new TypeError("Cannot read properties of undefined (reading 'secretField')"); } });
    const r2 = await run(rt.handlers["GET /export"], { method: "GET", originalUrl: "/x", query: {} });
    assert.ok(!/secretField/.test(JSON.stringify(r2.body)));
  } finally { console.error = oe; }
};
exports["خطای تجاری/اعتبارسنجی حفظ می‌شود (UserError)"] = async () => {
  const { UserError, sendError, isBusinessError } = H.load("errors.js");
  let out; const res = { req: {}, headersSent: false, status(c) { out = { c }; return this; }, json(b) { out.b = b; return this; } };
  sendError(res, new UserError("پیام فارسی برای کاربر", 409, "busy"));
  assert.deepStrictEqual(out, { c: 409, b: { error: "busy", message: "پیام فارسی برای کاربر" } });
  assert.ok(isBusinessError(new Error("x")));
  assert.ok(!isBusinessError(new TypeError("x")));
  assert.ok(!isBusinessError(Object.assign(new Error("x"), { code: "ER_X" })));
};
exports["هندلر خطای نهایی app.js پیام داخلی نمی‌دهد"] = async () => {
  const txt = fs.readFileSync(path.join(H.SRV, "app.js"), "utf8");
  assert.ok(!/message:\s*err\.message/.test(txt), "app.js هنوز err.message را برمی‌گرداند");
  // هیچ مسیری نباید پیام خام خطا را برگرداند (الگوهای قدیمی)
  for (const f of fs.readdirSync(path.join(H.SRV, "routes"))) {
    const t = fs.readFileSync(path.join(H.SRV, "routes", f), "utf8");
    assert.ok(!/status\(500\)\.json\(\{[^}]*message:\s*(err|e)\.message/.test(t), `${f}: پاسخ ۵۰۰ با پیام خام`);
  }
};

// ۷) API Key
exports["API Key: نامعتبر رد و معتبر قبول می‌شود (زمان‌ثابت)"] = async () => {
  const requireApiKey = H.load("middleware/auth.js");
  const k = process.env.API_KEY;
  const t = async (v) => { const r = await run([requireApiKey], { headers: v === undefined ? {} : { "x-api-key": v } }); return r; };
  assert.ok((await t(k)).passed);
  for (const bad of [undefined, "", "wrong", k + "x", k.slice(0, -1), "A".repeat(100000), ["a", "b"], 123, { a: 1 }, null]) {
    const r = await t(bad);
    assert.strictEqual(r.status, 401, `باید رد شود: ${JSON.stringify(bad && String(bad).slice(0, 20))}`);
    assert.ok(!r.passed);
  }
  const { safeEqual } = H.load("safeEqual.js");
  assert.ok(safeEqual("abc", "abc")); assert.ok(!safeEqual("abc", "abd")); assert.ok(!safeEqual("abc", "abcd")); assert.ok(!safeEqual("", ""));
  const src = fs.readFileSync(path.join(H.SRV, "middleware", "auth.js"), "utf8");
  assert.ok(!/provided\s*!==\s*expected/.test(src), "مقایسهٔ رشته‌ای معمولی نباید باقی بماند");
  // بدون API_KEY در .env ← خطای پیکربندی (باز نماندن API)
  const sv = process.env.API_KEY; delete process.env.API_KEY;
  assert.strictEqual((await run([requireApiKey], { headers: { "x-api-key": "x" } })).status, 500);
  process.env.API_KEY = sv;
};

// ۱۰) مسیر عکس‌ها: مجوز personnel
// (از نسخهٔ ۱۱۲ تعریف مسیرها در جدول Declarative ‏routeTable.js است، نه در app.js)
exports["عکس‌ها: routeTable با [personnel] ثبت شده و gate درست کار می‌کند"] = async () => {
  const { ROUTES, permsFor } = H.load("routeTable.js");
  const row = ROUTES.find((r) => r.path === "/api/photos");
  assert.ok(row, "ردیف /api/photos در routeTable نیست");
  assert.strictEqual(row.module, "routes/photos");
  assert.deepStrictEqual([row.read, row.write], [["personnel"], ["personnel"]], "ردیف /api/photos باید [personnel],[personnel] باشد");
  const { gate } = H.load("auth.js");
  const g = gate((req) => permsFor(row, req));
  const mk = (u, method) => run([(req, res, next) => { req.user = u; next(); }, g], { method });
  const U = (permissions, isAdmin = false) => ({ isAdmin, permissions });
  for (const method of ["GET", "HEAD", "POST", "PUT", "DELETE"]) {
    assert.strictEqual((await mk(U([]), method)).status, 403, `${method} بدون مجوز`);
    assert.strictEqual((await mk(U(["loanform", "slips", "goods"]), method)).status, 403, `${method} مجوز دیگر`);
    assert.ok((await mk(U(["personnel"]), method)).passed, `${method} با personnel`);
    assert.ok((await mk(U([], true), method)).passed, `${method} مدیر`);
  }
};
exports["عکس‌ها: روتر فقط خواندنی است (بدون آپلود/حذف)"] = async () => {
  const before = H.routers.length;
  H.load("routes/photos.js");
  const keys = Object.keys(H.routers.slice(before)[0].handlers);
  assert.deepStrictEqual(keys.sort(), ["GET /", "GET /:code"]);
};
exports["عکس‌ها: کد پرسنلی ناامن (مسیر) رد می‌شود"] = async () => {
  const before = H.routers.length; H.load("routes/photos.js");
  const h = H.routers.slice(before)[0].handlers["GET /:code"];
  for (const code of ["../../etc/passwd", "..%2f..%2fsecret", "a b", "x".repeat(60), "a/b"]) {
    const r = await run(h, { params: { code } });
    assert.strictEqual(r.status, 404, code);
  }
};

// SQL guard
exports["SQL: شیء در پارامتر رد می‌شود، SET ? سروری مجاز است"] = async () => {
  const { guardParams } = H.load("sqlGuard.js");
  assert.throws(() => guardParams("SELECT * FROM t WHERE code = ?", [{ a: 1 }]), (e) => e.code === "E_BAD_SQL_PARAM");
  assert.throws(() => guardParams("SELECT * FROM t WHERE code = ?", [{ $ne: 1 }]));
  assert.throws(() => guardParams("SELECT * FROM t WHERE c IN (?)", [[1, { a: 1 }]]));
  assert.throws(() => guardParams("UPDATE t SET a = ? WHERE id = ?", [() => 1, 2]));
  guardParams("SELECT * FROM t WHERE code = ? AND d = ?", ["x", new Date()]);
  guardParams("INSERT INTO t (a,b) VALUES ?", [[["x", 1], ["y", null]]]);
  guardParams("INSERT INTO institutions SET ?", [{ name: "a", n: 1, d: null }]);
  assert.throws(() => guardParams("INSERT INTO institutions SET ?", [{ name: { x: 1 } }]));
  assert.throws(() => guardParams("UPDATE t SET x = ? WHERE id = ?", [{ x: 1 }, 1]), (e) => e.code === "E_BAD_SQL_PARAM");   // شیء بدون الگوی «SET ?» رد می‌شود
};
