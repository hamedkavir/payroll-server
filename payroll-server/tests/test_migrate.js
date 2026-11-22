// سیستم Migration (server/migrate.js) — فقط با دیتابیس ساختگی؛ هیچ Migrationی روی دیتابیس واقعی اجرا نمی‌شود
const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const H = require("./helpers");

const quiet = { log() {}, warn() {}, error() {} };
const tmpDir = (files) => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), "payslip-mig-"));
  for (const [name, body] of Object.entries(files)) fs.writeFileSync(path.join(d, name), body);
  return d;
};
const mig = (body) => `module.exports = { description: "t", async up(conn, h) { ${body} } };`;

// اتصال ساختگی MySQL: قفل، جدول schema_migrations، information_schema و DDL ساده
function fakeDb(opts = {}) {
  const db = {
    lockOk: opts.lockOk !== false, locked: false, released: 0, releasedConn: 0, gotConn: 0,
    applied: (opts.applied || []).map((r) => ({ applied_at: new Date(), ...r })),
    tables: opts.tables || { people: { columns: ["id", "updated_at"], indexes: ["PRIMARY"] }, periods: { columns: ["id", "updated_at"], indexes: ["PRIMARY"] }, user_sessions: { columns: ["token_hash", "expires_at"], indexes: ["PRIMARY"] } },
    userRows: opts.userRows || 0, ddl: [], calls: [],
  };
  const q = async (sql, p = []) => {
    const s = sql.replace(/\s+/g, " ").trim();
    db.calls.push(s);
    if (/^SELECT GET_LOCK/.test(s)) { db.locked = db.lockOk; return [[{ l: db.lockOk ? 1 : 0 }]]; }
    if (/^SELECT RELEASE_LOCK/.test(s)) { db.locked = false; db.released++; return [[{ r: 1 }]]; }
    if (/^CREATE TABLE IF NOT EXISTS schema_migrations/.test(s)) return [{}];
    if (/^SELECT version, name, checksum, applied_at FROM schema_migrations/.test(s)) return [db.applied.slice().sort((a, b) => a.version.localeCompare(b.version))];
    if (/^INSERT INTO schema_migrations/.test(s)) { assert.ok(db.locked, "ثبت Migration باید داخل قفل باشد"); db.applied.push({ version: p[0], name: p[1], checksum: p[2], duration_ms: p[3], applied_at: new Date() }); return [{}]; }
    if (/FROM periods\) \+ \(SELECT COUNT\(\*\) FROM personnel\)/.test(s)) { if (db.userRows < 0) throw new Error("no table"); return [[{ n: db.userRows }]]; }
    if (/information_schema\.TABLES/.test(s)) return [[{ c: db.tables[p[0]] ? 1 : 0 }]];
    if (/information_schema\.COLUMNS/.test(s)) return [[{ c: db.tables[p[0]] && db.tables[p[0]].columns.includes(p[1]) ? 1 : 0 }]];
    if (/information_schema\.STATISTICS/.test(s)) return [[{ c: db.tables[p[0]] && db.tables[p[0]].indexes.includes(p[1]) ? 1 : 0 }]];
    let m;
    if ((m = /^CREATE INDEX `(\w+)` ON `(\w+)`/.exec(s))) { assert.ok(db.locked, "DDL باید داخل قفل باشد"); db.tables[m[2]].indexes.push(m[1]); db.ddl.push(s); return [{}]; }
    if ((m = /^ALTER TABLE `(\w+)` ADD COLUMN `(\w+)`/.exec(s))) { assert.ok(db.locked, "DDL باید داخل قفل باشد"); db.tables[m[1]].columns.push(m[2]); db.ddl.push(s); return [{}]; }
    if (/^THROW/.test(s)) throw new Error("ER_SYNTAX");
    db.ddl.push(s);
    return [{}];
  };
  db.pool = { getConnection: async () => { db.gotConn++; return { query: q, release() { db.releasedConn++; } }; }, query: q };
  return db;
}

exports["Migration: فهرست فایل‌ها — مرتب بر اساس نسخه، .sql نادیده، نام نامعتبر و نسخهٔ تکراری رد"] = async () => {
  const M = H.load("migrate.js");
  const d = tmpDir({ "010_b.js": mig(""), "007_a.js": mig(""), "002_old.sql": "DROP TABLE loan_queue;", "README.md": "x", "1000_c.js": mig("") });
  assert.deepStrictEqual(M.listMigrations(d).map((m) => `${m.version}_${m.name}`), ["007_a", "010_b", "1000_c"]);
  for (const m of M.listMigrations(d)) assert.match(m.checksum, /^[a-f0-9]{64}$/);
  assert.throws(() => M.listMigrations(tmpDir({ "7_a.js": mig("") })), /نامعتبر/);
  assert.throws(() => M.listMigrations(tmpDir({ "008_bad name.js": mig("") })), /نامعتبر/);
  assert.throws(() => M.listMigrations(tmpDir({ "008_a.js": mig(""), "008_b.js": mig("") })), /تکراری/);
  assert.deepStrictEqual(M.listMigrations(path.join(d, "no-such-dir")), []);
};

exports["Migration: فایل‌های مخزن معتبرند؛ ۰۰۶ تنها Migration خودکار است و .sql های تاریخی هرگز خودکار اجرا نمی‌شوند"] = async () => {
  const M = H.load("migrate.js");
  const list = M.listMigrations();
  assert.ok(list.length >= 1);
  assert.strictEqual(list[0].version, "006");
  assert.ok(list.every((m) => m.file.endsWith(".js")));
  const sqls = fs.readdirSync(M.DEFAULT_DIR).filter((f) => f.endsWith(".sql"));
  assert.ok(sqls.includes("002_loan_queue_new_formula.sql"), "فایل تاریخی ۰۰۲ هست ولی در فهرست خودکار نیست");
  for (const m of list) { const mod = require(m.file); assert.strictEqual(typeof mod.up, "function", m.file); }
};

exports["Migration: اجرای معلق‌ها به ترتیب، ثبت checksum، و اجرای دوباره بدون تغییر (idempotent)"] = async () => {
  const M = H.load("migrate.js");
  const order = [];
  global.__migOrder = order;
  const d = tmpDir({ "002_two.js": mig(`global.__migOrder.push("002"); await h.addColumn("people", "note2", "VARCHAR(10) NULL");`), "001_one.js": mig(`global.__migOrder.push("001"); await h.addIndex("people", "idx_x", ["updated_at"]);`) });
  const db = fakeDb();
  const r = await M.runMigrations(db.pool, { dir: d, log: quiet });
  assert.deepStrictEqual(r.applied, ["001", "002"]);
  assert.deepStrictEqual(order, ["001", "002"]);
  assert.deepStrictEqual(db.applied.map((x) => x.version), ["001", "002"]);
  const files = M.listMigrations(d);
  assert.deepStrictEqual(db.applied.map((x) => x.checksum), files.map((f) => f.checksum));
  assert.strictEqual(db.ddl.length, 2);
  assert.strictEqual(db.released, 1, "قفل آزاد شود");
  assert.strictEqual(db.releasedConn, db.gotConn, "اتصال برگردانده شود");
  const again = await M.runMigrations(db.pool, { dir: d, log: quiet });
  assert.deepStrictEqual(again.applied, []);
  assert.deepStrictEqual(order, ["001", "002"], "اجرای دوباره نباید چیزی را تکرار کند");
  assert.strictEqual(db.ddl.length, 2);
  delete global.__migOrder;
};

exports["Migration: خطا وسط کار ← توقف، نسخهٔ ناموفق ثبت نمی‌شود، بعدی‌ها اجرا نمی‌شوند، قفل آزاد می‌شود"] = async () => {
  const M = H.load("migrate.js");
  const d = tmpDir({ "001_ok.js": mig(`await h.addIndex("people", "idx_ok", ["updated_at"]);`), "002_bad.js": mig(`await conn.query("THROW");`), "003_never.js": mig(`await h.addIndex("people", "idx_never", ["updated_at"]);`) });
  const db = fakeDb();
  await assert.rejects(M.runMigrations(db.pool, { dir: d, log: quiet }), /002_bad.*ER_SYNTAX/);
  assert.deepStrictEqual(db.applied.map((x) => x.version), ["001"]);
  assert.ok(!db.tables.people.indexes.includes("idx_never"));
  assert.strictEqual(db.released, 1);
  assert.strictEqual(db.releasedConn, 1);
  // پس از رفع فایل، از همان ۰۰۲ ادامه می‌دهد
  fs.writeFileSync(path.join(d, "002_bad.js"), mig(""));
  const r = await M.runMigrations(db.pool, { dir: d, log: quiet });
  assert.deepStrictEqual(r.applied, ["002", "003"]);
};

exports["Migration: فایلِ اجراشده‌ای که تغییر کرده ← هیچ Migrationی اجرا نمی‌شود"] = async () => {
  const M = H.load("migrate.js");
  const d = tmpDir({ "001_a.js": mig(""), "002_b.js": mig(`await h.addIndex("people", "idx_b", ["updated_at"]);`) });
  const db = fakeDb({ applied: [{ version: "001", name: "a", checksum: "0".repeat(64) }] });
  await assert.rejects(M.runMigrations(db.pool, { dir: d, log: quiet }), /تغییر کرده/);
  assert.strictEqual(db.ddl.length, 0);
  assert.deepStrictEqual(db.applied.map((x) => x.version), ["001"]);
  assert.strictEqual(db.released, 1);
};

exports["Migration: قفل گرفته نشد (نمونهٔ دیگر در حال اجرا) ← خطا، بدون اجرا و بدون پشتیبان"] = async () => {
  const M = H.load("migrate.js");
  const d = tmpDir({ "001_a.js": mig(`await h.addIndex("people", "idx_a", ["updated_at"]);`) });
  const db = fakeDb({ lockOk: false, userRows: 10 });
  let backups = 0;
  await assert.rejects(M.runMigrations(db.pool, { dir: d, log: quiet, backup: async () => { backups++; } }), /قفل/);
  assert.strictEqual(db.ddl.length, 0);
  assert.strictEqual(db.applied.length, 0);
  assert.strictEqual(backups, 0);
  assert.strictEqual(db.releasedConn, 1);
};

exports["Migration: پشتیبان pre-migrate فقط وقتی معلق هست و دیتابیس داده دارد؛ شکست پشتیبان ← توقف (مگر allowNoBackup)"] = async () => {
  const M = H.load("migrate.js");
  const files = { "001_a.js": mig(`await h.addIndex("people", "idx_a", ["updated_at"]);`) };
  let n = 0;
  const backup = async () => { n++; return { name: "pre-migrate-x.ndjson.gz" }; };
  // دیتابیس تازه (بدون داده) ← بدون پشتیبان
  await M.runMigrations(fakeDb({ userRows: 0 }).pool, { dir: tmpDir(files), log: quiet, backup });
  assert.strictEqual(n, 0);
  await M.runMigrations(fakeDb({ userRows: -1 }).pool, { dir: tmpDir(files), log: quiet, backup });   // جدول‌ها هنوز نیستند
  assert.strictEqual(n, 0);
  // دیتابیس دارای داده ← پشتیبان پیش از اولین DDL
  const db = fakeDb({ userRows: 5 });
  const order = [];
  const r = await M.runMigrations(db.pool, { dir: tmpDir(files), log: quiet, backup: async () => { order.push("backup:" + db.ddl.length); return backup(); } });
  assert.deepStrictEqual(order, ["backup:0"]);
  assert.strictEqual(r.backup.name, "pre-migrate-x.ndjson.gz");
  // هیچ معلقی نیست ← بدون پشتیبان
  const before = n;
  await M.runMigrations(db.pool, { dir: tmpDir(files), log: quiet, backup });
  assert.strictEqual(n, before);
  // شکست پشتیبان
  const db2 = fakeDb({ userRows: 5 });
  await assert.rejects(M.runMigrations(db2.pool, { dir: tmpDir(files), log: quiet, backup: async () => { throw new Error("disk full"); } }), /پشتیبان.*disk full/);
  assert.strictEqual(db2.ddl.length, 0);
  assert.strictEqual(db2.applied.length, 0);
  const db3 = fakeDb({ userRows: 5 });
  const r3 = await M.runMigrations(db3.pool, { dir: tmpDir(files), log: quiet, allowNoBackup: true, backup: async () => { throw new Error("disk full"); } });
  assert.deepStrictEqual(r3.applied, ["001"]);
};

exports["Migration: status فقط گزارش می‌دهد (applied / pending / changed / missing) و چیزی اجرا نمی‌کند"] = async () => {
  const M = H.load("migrate.js");
  const d = tmpDir({ "001_a.js": mig(""), "002_b.js": mig(""), "003_c.js": mig(`throw new Error("must not run")`) });
  const files = M.listMigrations(d);
  const db = fakeDb({ applied: [
    { version: "001", name: "a", checksum: files[0].checksum },
    { version: "002", name: "b", checksum: "f".repeat(64) },
    { version: "000", name: "gone", checksum: "e".repeat(64) },
  ] });
  const st = await M.status(db.pool, { dir: d });
  assert.deepStrictEqual(st.list.map((m) => [m.version, m.state]), [["001", "applied"], ["002", "changed"], ["003", "pending"]]);
  assert.deepStrictEqual(st.missing.map((m) => [m.version, m.state]), [["000", "missing"]]);
  assert.strictEqual(st.pending.length, 1);
  assert.strictEqual(st.changed.length, 1);
  assert.strictEqual(db.ddl.length, 0);
  assert.ok(!db.calls.some((c) => /GET_LOCK|INSERT/.test(c)), "status قفل نمی‌گیرد و چیزی ثبت نمی‌کند");
};

exports["Migration: کمک‌کارها idempotent هستند و نام نامعتبر (تزریق SQL) را رد می‌کنند"] = async () => {
  const M = H.load("migrate.js");
  const db = fakeDb();
  db.locked = true;
  const conn = await db.pool.getConnection();
  const h = M.helpers(conn);
  assert.strictEqual(await h.addIndex("people", "idx_u", ["updated_at"]), true);
  assert.strictEqual(await h.addIndex("people", "idx_u", ["updated_at"]), false, "ایندکس موجود دوباره ساخته نمی‌شود");
  assert.strictEqual(await h.addColumn("people", "c1", "INT NULL"), true);
  assert.strictEqual(await h.addColumn("people", "c1", "INT NULL"), false);
  assert.strictEqual(await h.addColumn("no_table", "c1", "INT NULL"), false, "جدول ناموجود ← بدون کار");
  assert.strictEqual(await h.addIndex("no_table", "i", ["x"]), false);
  assert.strictEqual(db.ddl.length, 2);
  db.tables["people`; DROP TABLE users; --"] = { columns: [], indexes: [] };
  await assert.rejects(h.addIndex("people`; DROP TABLE users; --", "i", ["x"]), /نام نامعتبر/);
  await assert.rejects(h.addIndex("people", "idx_v", ["updated_at`) ; DROP TABLE x; --"]), /نام نامعتبر/);
  await assert.rejects(h.addColumn("people", "bad name", "INT"), /نام نامعتبر/);
  assert.strictEqual(db.ddl.length, 2);
};

exports["Migration ۰۰۶: سه ایندکس همگام‌سازی/نشست را می‌سازد و روی نصب تازه (ایندکس موجود) کاری نمی‌کند"] = async () => {
  const M = H.load("migrate.js");
  const db = fakeDb();
  const files = M.listMigrations().filter((m) => m.version === "006");
  const dir = tmpDir({ [path.basename(files[0].file)]: fs.readFileSync(files[0].file) });
  const r = await M.runMigrations(db.pool, { dir, log: quiet });
  assert.deepStrictEqual(r.applied, ["006"]);
  assert.ok(db.tables.people.indexes.includes("idx_people_updated"));
  assert.ok(db.tables.periods.indexes.includes("idx_periods_updated"));
  assert.ok(db.tables.user_sessions.indexes.includes("idx_sess_expires"));
  const fresh = fakeDb({ tables: { people: { columns: [], indexes: ["idx_people_updated"] }, periods: { columns: [], indexes: ["idx_periods_updated"] }, user_sessions: { columns: [], indexes: ["idx_sess_expires"] } } });
  await M.runMigrations(fresh.pool, { dir, log: quiet });
  assert.strictEqual(fresh.ddl.length, 0, "نصب تازه از schema.sql ایندکس‌ها را دارد");
  assert.deepStrictEqual(fresh.applied.map((x) => x.version), ["006"]);
  // schema.sql همان ایندکس‌ها را دارد (یکسانی نصب تازه و ارتقا)
  const schema = fs.readFileSync(path.join(H.SRV, "..", "schema.sql"), "utf8");
  for (const i of ["idx_people_updated", "idx_periods_updated", "idx_sess_expires"]) assert.ok(schema.includes(i), `schema.sql: ${i}`);
};
