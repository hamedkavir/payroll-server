// GET /api/sync (server/routes/sync.js): همگام‌سازی سبک پس‌زمینه
const assert = require("assert");
const H = require("./helpers");
const { run } = H;

// دیتابیس ساختگی با وضعیت قابل تغییر؛ همهٔ پرس‌وجوها ثبت می‌شوند
function syncPool(state) {
  const log = [];
  const pool = { log, async query(sql) {
    log.push(sql.replace(/\s+/g, " ").trim());
    if (state.fail && state.fail.test(sql)) throw Object.assign(new Error("ER_CONN host=10.1.1.1"), { code: "ECONNREFUSED" });
    if (/MAX\(updated_at\) AS u FROM periods/.test(sql)) return [[state.periods]];
    if (/MAX\(updated_at\) AS u FROM people/.test(sql)) return [[state.people]];
    if (/MAX\(updated_at\) AS u FROM settings/.test(sql)) return [[state.settings]];
    if (/SELECT \* FROM settings WHERE id = 1/.test(sql)) return [[{ id: 1, company_name: state.company || "شرکت", unit: "ریال", show_employer: 1, show_zero: 0 }]];
    if (/FROM periods p/.test(sql)) return [state.periodRows || []];
    return [[]];
  } };
  return pool;
}
const baseState = () => ({
  periods: { n: 2, mx: 2, u: new Date("2026-11-01T10:00:00Z") },
  people: { n: 300, mx: 300, u: new Date("2026-11-01T10:00:00Z") },
  settings: { u: new Date("2026-10-01T08:00:00Z") },
  periodRows: [{ id: 1, year: 1405, month: 7, issue_date: "", active_file: "a.xlsx", retiree_file: "", loan_file: "", updated_at: new Date("2026-10-01T00:00:00Z"), people_count: 150 },
    { id: 2, year: 1405, month: 8, issue_date: "", active_file: "b.xlsx", retiree_file: "", loan_file: "", updated_at: new Date("2026-11-01T10:00:00Z"), people_count: 150 }],
});
function rig(state) {
  const pool = syncPool(state);
  H.setPool(pool);
  const before = H.routers.length;
  const mod = H.load("routes/sync.js");
  const router = H.routers.slice(before).find((r) => r.handlers["GET /"]);
  const get = (query) => run(router.handlers["GET /"], { method: "GET", query });
  return { pool, mod, get };
}

exports["همگام‌سازی: بدون since ← changed:true همراه تنظیمات و فهرست دوره‌ها (همان خروجی /api/settings و /api/periods)"] = async () => {
  const { get } = rig(baseState());
  const r = await get({});
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.body.changed, true);
  assert.match(r.body.version, /^[a-f0-9]{32}$/);
  assert.strictEqual(r.body.settings.companyName, "شرکت");
  assert.deepStrictEqual(r.body.periods.map((p) => [p.id, p.year, p.month, p.peopleCount]), [[1, 1405, 7, 150], [2, 1405, 8, 150]]);
  assert.strictEqual(r.body.periods[1].updatedAt, "2026-11-01T10:00:00.000Z");
};

exports["همگام‌سازی: since برابر نسخهٔ فعلی ← changed:false و هیچ تنظیم/دوره‌ای خوانده نمی‌شود"] = async () => {
  const { get, pool } = rig(baseState());
  const v = (await get({})).body.version;
  pool.log.length = 0;
  const r = await get({ since: v });
  assert.deepStrictEqual(r.body, { changed: false, version: v });
  assert.strictEqual(pool.log.length, 3, "فقط سه پرس‌وجوی کوچک نسخه");
  assert.ok(!pool.log.some((q) => /SELECT \* FROM settings|FROM periods p/.test(q)), pool.log.join("\n"));
  assert.ok(pool.log.every((q) => /COUNT\(\*\)|MAX\(updated_at\)/.test(q)));
};

exports["همگام‌سازی: نسخه با هر تغییر دوره، افراد یا تنظیمات عوض می‌شود و برای وضعیت یکسان ثابت است"] = async () => {
  const st = baseState();
  const { mod } = rig(st);
  const v0 = await mod.syncState();
  assert.strictEqual(await mod.syncState(), v0, "وضعیت یکسان ← نسخهٔ یکسان");
  const variants = [
    (s) => { s.periods.n = 3; s.periods.mx = 3; },                       // دورهٔ تازه
    (s) => { s.periods.u = new Date("2026-11-02T00:00:00Z"); },          // ویرایش دوره
    (s) => { s.people.n = 299; },                                         // حذف فرد
    (s) => { s.people.mx = 301; },                                        // جایگزینی فرد (تعداد ثابت)
    (s) => { s.people.u = new Date("2026-11-01T10:00:01Z"); },           // ویرایش فرد
    (s) => { s.settings.u = new Date("2026-10-01T08:00:01Z"); },         // تغییر تنظیمات
  ];
  const seen = new Set([v0]);
  for (const f of variants) {
    const s = baseState(); f(s);
    H.setPool(syncPool(s));
    const v = await mod.syncState();
    assert.ok(!seen.has(v), "نسخه باید تغییر کند");
    seen.add(v);
  }
};

exports["همگام‌سازی: since قدیمی ← changed:true با داده؛ دیتابیس خالی هم نسخهٔ معتبر می‌دهد"] = async () => {
  const st = baseState();
  const { get } = rig(st);
  const v = (await get({})).body.version;
  st.people.u = new Date("2026-11-05T00:00:00Z");
  const r = await get({ since: v });
  assert.strictEqual(r.body.changed, true);
  assert.notStrictEqual(r.body.version, v);
  assert.ok(Array.isArray(r.body.periods) && r.body.settings);
  const empty = rig({ periods: { n: 0, mx: null, u: null }, people: { n: 0, mx: null, u: null }, settings: {}, periodRows: [] });
  const e = await empty.get({});
  assert.match(e.body.version, /^[a-f0-9]{32}$/);
  assert.deepStrictEqual(e.body.periods, []);
};

exports["همگام‌سازی: since نامعتبر ← ۴۰۰ بدون پرس‌وجو؛ خطای دیتابیس ← ۵۰۰ با پیام عمومی"] = async () => {
  const { get, pool } = rig(baseState());
  for (const since of ["xyz", "ABCDEF0123456789", "0123", "a".repeat(65), "' OR 1=1 --", "0123456789abcdef;DROP"]) {
    const r = await get({ since });
    assert.strictEqual(r.status, 400, since);
    assert.strictEqual(r.body.error, "invalid_input");
  }
  assert.strictEqual(pool.log.length, 0, "ورودی نامعتبر نباید به دیتابیس برسد");
  // آرایه در query (since[]=...) به رشته تبدیل و رد می‌شود
  assert.strictEqual((await get({ since: ["a", "b"] })).status, 400);
  const bad = rig(Object.assign(baseState(), { fail: /FROM people/ }));
  const origErr = console.error; console.error = () => {};
  try {
    const r = await bad.get({});
    assert.strictEqual(r.status, 500);
    assert.ok(!/10\.1\.1\.1|ER_CONN/.test(JSON.stringify(r.body)), "جزئیات داخلی نباید به کاربر برسد");
  } finally { console.error = origErr; }
};

exports["همگام‌سازی: مسیر برای هر کاربر واردشده باز است ولی کلید API و نشست لازم دارد"] = async () => {
  H.setPool({ async query() { return [[]]; } });
  const RT = H.load("routeTable.js");
  const row = RT.ROUTES.find((r) => r.path === "/api/sync");
  assert.strictEqual(row.access, "gated");
  assert.strictEqual(RT.permsFor(row, { method: "GET", path: "/" }), null);
  const { gate } = H.load("auth.js");
  const out = await run([gate((req) => RT.permsFor(row, req))], { method: "GET", user: { isAdmin: false, permissions: [] } });
  assert.ok(out.passed, "کاربر بدون مجوز بخش هم باید همگام شود");
};
