// محدودیت تلاش ناموفق ورود (server/loginLimiter.js) و اتصال آن به POST /api/auth/login
const assert = require("assert");
const H = require("./helpers");
const { run } = H;

const clock = (t0 = 1_000_000) => { let t = t0; const now = () => t; now.add = (ms) => { t += ms; }; return now; };

exports["محدودیت ورود: ۶ تلاش ناموفق برای (نام کاربری + IP) ← مسدود؛ IP یا نام دیگر آزاد"] = async () => {
  const { createLoginLimiter } = H.load("loginLimiter.js");
  const L = createLoginLimiter({ now: clock() });
  assert.deepStrictEqual([L.limits.perUser, L.limits.perIp, L.limits.windowMs], [6, 30, 600000]);   // پیش‌فرض‌ها
  for (let i = 0; i < 5; i++) { assert.ok(!L.blocked("1.1.1.1", "ali"), `تلاش ${i + 1}`); L.fail("1.1.1.1", "ali"); }
  assert.ok(!L.blocked("1.1.1.1", "ali"), "پس از ۵ شکست هنوز آزاد");
  L.fail("1.1.1.1", "ali");
  assert.ok(L.blocked("1.1.1.1", "ali"), "پس از ۶ شکست مسدود");
  assert.ok(L.blocked("1.1.1.1", "ALI"), "نام کاربری بدون حساسیت به حروف");
  assert.ok(!L.blocked("2.2.2.2", "ali"), "IP دیگر آزاد");
  assert.ok(!L.blocked("1.1.1.1", "reza"), "نام کاربری دیگر از همان IP آزاد (تا سقف IP)");
};

exports["محدودیت ورود: سقف ۳۰ تلاش برای هر IP روی نام‌های کاربری مختلف"] = async () => {
  const { createLoginLimiter } = H.load("loginLimiter.js");
  const L = createLoginLimiter({ now: clock() });
  for (let i = 0; i < 29; i++) L.fail("9.9.9.9", "user" + i);
  assert.ok(!L.blocked("9.9.9.9", "fresh"), "۲۹ شکست ← هنوز آزاد");
  L.fail("9.9.9.9", "user29");
  assert.ok(L.blocked("9.9.9.9", "fresh"), "۳۰ شکست ← همهٔ نام‌ها از این IP مسدود");
  assert.ok(!L.blocked("8.8.8.8", "fresh"), "IP دیگر آزاد");
};

exports["محدودیت ورود: پایان پنجرهٔ ۱۰ دقیقه آزاد می‌کند؛ هر شکست تازه پنجره را تمدید می‌کند"] = async () => {
  const { createLoginLimiter } = H.load("loginLimiter.js");
  const now = clock();
  const L = createLoginLimiter({ now, windowMs: 60_000 });
  for (let i = 0; i < 6; i++) L.fail("1.1.1.1", "ali");
  assert.ok(L.blocked("1.1.1.1", "ali"));
  now.add(59_999); assert.ok(L.blocked("1.1.1.1", "ali"), "پیش از پایان پنجره");
  now.add(1); assert.ok(!L.blocked("1.1.1.1", "ali"), "پایان پنجره ← آزاد");
  // پس از انقضا، شمارش از صفر شروع می‌شود
  L.fail("1.1.1.1", "ali");
  assert.ok(!L.blocked("1.1.1.1", "ali"), "شمارنده باید پس از انقضا صفر شده باشد");
};

exports["محدودیت ورود: ورود موفق فقط شمارندهٔ همان نام را صفر می‌کند، نه شمارندهٔ IP"] = async () => {
  const { createLoginLimiter } = H.load("loginLimiter.js");
  const L = createLoginLimiter({ now: clock(), perUser: 3, perIp: 5 });
  L.fail("1.1.1.1", "ali"); L.fail("1.1.1.1", "ali");
  L.success("1.1.1.1", "ali");
  L.fail("1.1.1.1", "ali"); L.fail("1.1.1.1", "ali");
  assert.ok(!L.blocked("1.1.1.1", "ali"), "پس از موفقیت، شمارندهٔ نام صفر شده");
  L.fail("1.1.1.1", "reza");   // پنجمین شکست از این IP
  assert.ok(L.blocked("1.1.1.1", "someone"), "شمارندهٔ IP با ورود موفق صفر نمی‌شود");
};

exports["محدودیت ورود: سقف سخت حافظه (maxEntries) و پاک‌سازی ردیف‌های منقضی"] = async () => {
  const { createLoginLimiter } = H.load("loginLimiter.js");
  const now = clock();
  const L = createLoginLimiter({ now, maxEntries: 50, perIp: 1e9 });
  for (let i = 0; i < 5000; i++) L.fail("10.0.0." + (i % 7), "rand" + i);
  const s = L.size();
  assert.ok(s.users <= 50 && s.ips <= 50, JSON.stringify(s));
  // تازه‌ترین ردیف‌ها حفظ می‌شوند، قدیمی‌ترین‌ها حذف
  for (let i = 0; i < 5; i++) L.fail("1.1.1.1", "keep");
  L.fail("1.1.1.1", "keep");
  assert.ok(L.blocked("1.1.1.1", "keep"));
  now.add(L.limits.windowMs + 1);
  L.sweep();
  assert.deepStrictEqual(L.size(), { users: 0, ips: 0 });
  assert.strictEqual(createLoginLimiter({ maxEntries: 1 }).limits.maxEntries, 10, "کف ۱۰ ردیف");
};

// ---- اتصال به مسیر واقعی ورود ----
function loginRig(user) {
  let selects = 0;
  H.setPool({ async query(sql) {
    if (/^SELECT \* FROM users WHERE username/.test(sql)) { selects++; return [[user].filter(Boolean)]; }
    return [[]];
  } });
  const before = H.routers.length;
  H.load("routes/auth.js");
  const routers = H.routers.slice(before);
  const login = routers.find((r) => r.handlers["POST /login"]).handlers["POST /login"];
  return { login, selects: () => selects };
}
const post = (login, ip, username, password) => run(login, { method: "POST", ip, body: { username, password } });

exports["ورود: پس از ۶ رمز اشتباه، حتی رمز درست ۴۲۹ می‌گیرد و دیتابیس پرس‌وجو نمی‌شود"] = async () => {
  const { hashPassword } = H.load("auth.js");
  const rig = loginRig({ id: 3, username: "ali", password_hash: hashPassword("secret-1"), active: 1, is_admin: 0, permissions: "[]", must_change: 0 });
  for (let i = 0; i < 6; i++) {
    const r = await post(rig.login, "5.5.5.5", "ali", "wrong" + i);
    assert.strictEqual(r.status, 401, `تلاش ${i + 1}`);
    assert.strictEqual(r.body.error, "bad_credentials");
  }
  const q = rig.selects();
  const blocked = await post(rig.login, "5.5.5.5", "ali", "secret-1");
  assert.strictEqual(blocked.status, 429);
  assert.strictEqual(blocked.body.error, "too_many");
  assert.strictEqual(rig.selects(), q, "درخواست مسدود نباید به دیتابیس برسد");
  // IP دیگر با رمز درست وارد می‌شود
  const ok = await post(rig.login, "6.6.6.6", "ali", "secret-1");
  assert.ok(ok.body && ok.body.token, JSON.stringify(ok.body));
};

exports["ورود: نام کاربری ناموجود هم شمرده می‌شود؛ ورودی خالی/خیلی بلند پیش از محدودیت ۴۰۰ می‌گیرد"] = async () => {
  const rig = loginRig(null);
  for (let i = 0; i < 6; i++) assert.strictEqual((await post(rig.login, "7.7.7.7", "ghost", "x")).status, 401);
  assert.strictEqual((await post(rig.login, "7.7.7.7", "ghost", "x")).status, 429);
  assert.strictEqual((await post(rig.login, "7.7.7.7", "", "x")).status, 400);
  assert.strictEqual((await post(rig.login, "7.7.7.7", "a".repeat(101), "x")).status, 400);
  assert.strictEqual((await post(rig.login, "7.7.7.7", "ghost2", "p".repeat(1025))).status, 400);
};
