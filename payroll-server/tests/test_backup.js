const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const zlib = require("zlib");
const { Readable } = require("stream");
const H = require("./helpers");

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "bk-"));
process.env.BACKUP_DIR = TMP;
const FORMAT = "payslip-backup-v1";

function makeDb() {
  const db = {
    tables: { periods: [{ id: 1, year: 1405 }], people: [{ id: 1, code: "1" }], personnel: [{ code: "p1", first_name: "قدیمی" }], users: [{ id: 1, username: "admin", is_admin: 1, active: 1 }] },
    cols: { periods: ["id", "year"], people: ["id", "code"], personnel: ["code", "first_name"], users: ["id", "username", "is_admin", "active"] },
    log: [], rolledBack: 0, failInsertOn: null, snap: null,
  };
  const q = async (sql, p) => {
    sql = sql.replace(/\s+/g, " ").trim(); db.log.push(sql);
    if (/information_schema\.TABLES/.test(sql)) return [Object.keys(db.tables).map((name) => ({ name }))];
    if (/information_schema\.COLUMNS/.test(sql)) return [(db.cols[p[0]] || []).map((name) => ({ name }))];
    if (/^SET FOREIGN_KEY_CHECKS/.test(sql)) return [{}];
    let m;
    if ((m = sql.match(/^DELETE FROM `(\w+)`$/))) { db.tables[m[1]] = []; return [{}]; }
    if ((m = sql.match(/^INSERT INTO `(\w+)` \((.*)\) VALUES \?$/))) {
      if (db.failInsertOn === m[1]) throw new Error("ER_DISK_FULL secret-host-10.0.0.9");
      const keys = m[2].split(",").map((x) => x.replace(/`/g, ""));
      for (const row of p[0]) db.tables[m[1]].push(Object.fromEntries(keys.map((k, i) => [k, row[i]])));
      return [{}];
    }
    throw new Error("unhandled sql: " + sql);
  };
  const conn = { query: q, async beginTransaction() { db.snap = JSON.stringify(db.tables); }, async commit() { db.snap = null; }, async rollback() { if (db.snap) { db.tables = JSON.parse(db.snap); db.rolledBack++; db.snap = null; } }, release() {} };
  db.pool = { query: q, async getConnection() { return conn; } };
  return db;
}
const gz = (name, lines, { raw } = {}) => { const f = path.join(TMP, name); fs.writeFileSync(f, raw || zlib.gzipSync(lines.join("\n") + "\n")); return name; };
const goodLines = (over = {}) => {
  const rows = over.rows || [
    { t: "periods", r: { id: 7, year: 1406 } }, { t: "people", r: { id: 9, code: "A1" } }, { t: "people", r: { id: 10, code: "A2" } },
    { t: "personnel", r: { code: "n1", first_name: "جدید" } }, { t: "users", r: { id: 5, username: "boss", is_admin: 1, active: 1 } }];
  const tables = over.tables || ["periods", "people", "personnel", "users"];
  const counts = over.counts || tables.reduce((o, t) => ((o[t] = rows.filter((x) => x.t === t).length), o), {});
  const out = [JSON.stringify({ $meta: { format: over.format || FORMAT, created: "2026-01-01T00:00:00.000Z", tables } })];
  rows.forEach((r) => out.push(JSON.stringify(r)));
  if (!over.noEnd) out.push(JSON.stringify({ $end: { counts } }));
  if (over.extraAfter) out.push(over.extraAfter);
  return out;
};
const setup = () => { const db = makeDb(); H.setPool(db.pool); const backup = H.load("backup.js")(db.pool); return { db, backup }; };
const snapshot = (db) => JSON.stringify(db.tables);
const mustReject = async (label, name, mutate) => {
  const { db, backup } = setup(); const before = snapshot(db);
  await assert.rejects(backup.restoreFromFile(name, { safety: false }), (e) => { assert.ok(e.expose === true, `${label}: باید پیام کاربرپسند باشد: ${e.message}`); return true; }, label);
  assert.strictEqual(snapshot(db), before, `${label}: دیتابیس تغییر کرده`);
  assert.ok(!db.log.some((l) => /^DELETE FROM/.test(l)), `${label}: نباید هیچ DELETE اجرا شود`);
  assert.ok(!db.log.some((l) => /^INSERT/.test(l)), `${label}: نباید INSERT اجرا شود`);
};

exports["بازیابی فایل سالم کار می‌کند و داده را جایگزین می‌کند"] = async () => {
  const { db, backup } = setup(); gz("ok1.ndjson.gz", goodLines());
  const r = await backup.restoreFromFile("ok1.ndjson.gz", { safety: false });
  assert.deepStrictEqual(r.tables, { periods: 1, people: 2, personnel: 1, users: 1 });
  assert.strictEqual(db.tables.people.length, 2);
  assert.strictEqual(db.tables.personnel[0].first_name, "جدید");
};
// ۴) فایل ناقص/خراب/دست‌کاری‌شده باعث حذف اطلاعات نشود
exports["فایل ناقص (بدون خط پایان) رد می‌شود و چیزی حذف نمی‌شود"] = async () => { gz("a.ndjson.gz", goodLines({ noEnd: true })); await mustReject("noEnd", "a.ndjson.gz"); };
exports["فایل gzip بریده‌شده (خراب) رد می‌شود"] = async () => {
  const full = zlib.gzipSync(goodLines().join("\n") + "\n"); gz("b.ndjson.gz", null, { raw: full.subarray(0, Math.floor(full.length * 0.6)) });
  await mustReject("truncated", "b.ndjson.gz");
};
exports["فایل غیر gzip رد می‌شود"] = async () => { gz("c.ndjson.gz", null, { raw: Buffer.from("this is not gzip at all") }); await mustReject("notgzip", "c.ndjson.gz"); };
exports["شمارش ردیف‌ها با خط پایان نمی‌خواند ← رد"] = async () => { gz("d.ndjson.gz", goodLines({ counts: { periods: 1, people: 5, personnel: 1, users: 1 } })); await mustReject("counts", "d.ndjson.gz"); };
exports["خط JSON خراب ← رد"] = async () => {
  const L = goodLines(); L.splice(2, 0, "{not json"); gz("e.ndjson.gz", L); await mustReject("badjson", "e.ndjson.gz");
};
exports["قالب/نسخهٔ ناشناس ← رد"] = async () => { gz("f.ndjson.gz", goodLines({ format: "evil-v9" })); await mustReject("format", "f.ndjson.gz"); };
exports["جدول اصلی غایب (periods/people/personnel) ← رد"] = async () => {
  gz("g.ndjson.gz", goodLines({ tables: ["people", "users"], rows: [{ t: "people", r: { id: 1, code: "x" } }, { t: "users", r: { id: 1, username: "a", is_admin: 1, active: 1 } }] })); await mustReject("required", "g.ndjson.gz");
};
exports["ردیف جدولِ خارج از فهرست / ستون‌های ناهمسان / داده بعد از پایان ← رد"] = async () => {
  gz("h1.ndjson.gz", goodLines({ rows: [{ t: "periods", r: { id: 1, year: 1 } }, { t: "evil", r: { a: 1 } }, { t: "people", r: { id: 1, code: "c" } }, { t: "personnel", r: { code: "n" } }, { t: "users", r: { id: 1, username: "a", is_admin: 1, active: 1 } }] })); await mustReject("unlisted", "h1.ndjson.gz");
  gz("h2.ndjson.gz", goodLines({ rows: [{ t: "periods", r: { id: 1, year: 1 } }, { t: "periods", r: { id: 2 } }, { t: "people", r: { id: 1, code: "c" } }, { t: "personnel", r: { code: "n" } }, { t: "users", r: { id: 1, username: "a", is_admin: 1, active: 1 } }] })); await mustReject("keys", "h2.ndjson.gz");
  gz("h3.ndjson.gz", goodLines({ extraAfter: JSON.stringify({ t: "people", r: { id: 99, code: "z" } }) })); await mustReject("afterEnd", "h3.ndjson.gz");
  gz("h4.ndjson.gz", goodLines({ rows: [{ t: "periods", r: { zzz: 1 } }, { t: "people", r: { id: 1, code: "c" } }, { t: "personnel", r: { code: "n" } }, { t: "users", r: { id: 1, username: "a", is_admin: 1, active: 1 } }] })); await mustReject("nomatchcols", "h4.ndjson.gz");
  gz("h5.ndjson.gz", goodLines({ rows: [{ t: "periods", r: [1, 2] }, { t: "people", r: { id: 1, code: "c" } }, { t: "personnel", r: { code: "n" } }, { t: "users", r: { id: 1, username: "a", is_admin: 1, active: 1 } }] })); await mustReject("rowarray", "h5.ndjson.gz");
};
exports["فایل بدون مدیر فعال (قفل‌شدن کاربران) ← رد"] = async () => {
  gz("i.ndjson.gz", goodLines({ rows: [{ t: "periods", r: { id: 1, year: 1 } }, { t: "people", r: { id: 1, code: "c" } }, { t: "personnel", r: { code: "n" } }, { t: "users", r: { id: 1, username: "a", is_admin: 0, active: 1 } }] })); await mustReject("noadmin", "i.ndjson.gz");
};
exports["نام فایل خطرناک (پیمایش مسیر) ← رد"] = async () => {
  const { backup } = setup();
  for (const n of ["../x.ndjson.gz", "a/b.ndjson.gz", "..\\x.ndjson.gz", "x.txt", ""]) await assert.rejects(backup.restoreFromFile(n, { safety: false }), (e) => e.expose === true);
};
// سازگاری با نسخه‌های قبلی
exports["پشتیبان قدیمی/ناهمسان (جدول و ستون اضافه) پذیرفته می‌شود"] = async () => {
  const { db, backup } = setup();
  gz("old.ndjson.gz", goodLines({ tables: ["periods", "people", "personnel", "users", "legacy_table"], rows: [
    { t: "periods", r: { id: 1, year: 1400, old_col: "x" } }, { t: "people", r: { id: 1, code: "o" } }, { t: "personnel", r: { code: "n", first_name: "ق" } },
    { t: "users", r: { id: 1, username: "a", is_admin: "1", active: true } }, { t: "legacy_table", r: { a: 1 } }] }));
  const r = await backup.restoreFromFile("old.ndjson.gz", { safety: false });
  assert.deepStrictEqual(r.warnings.unknownTables, ["legacy_table"]);
  assert.deepStrictEqual(r.warnings.unknownColumns, { periods: ["old_col"] });
  assert.deepStrictEqual(db.tables.periods, [{ id: 1, year: 1400 }]);
};
// ۵) خطا حین بازیابی ← Rollback کامل
exports["خطا حین درج ← Rollback کامل و پیام عمومی"] = async () => {
  const { db, backup } = setup(); gz("r.ndjson.gz", goodLines()); const before = snapshot(db);
  db.failInsertOn = "people";
  await assert.rejects(backup.restoreFromFile("r.ndjson.gz", { safety: false }), (e) => /secret-host/.test(e.message) && !e.expose);
  assert.strictEqual(snapshot(db), before, "همهٔ تغییرات باید برگردند");
  assert.strictEqual(db.rolledBack, 1);
  assert.ok(db.log.some((l) => /^DELETE FROM `periods`/.test(l)), "DELETE واقعاً انجام شده بود (و برگشت خورده)");
  assert.ok(db.log.some((l) => /FOREIGN_KEY_CHECKS = 1/.test(l)), "FK check باید برگردد");
  // سطح مسیر: کاربر پیام داخلی را نمی‌بیند
  const before2 = H.routers.length; H.load("routes/backup.js");
  const route = H.routers.slice(before2)[0].handlers["POST /restore/:name"];
  const { run } = H; const logged = []; const oe = console.error; console.error = (...a) => logged.push(a.join(" "));
  try {
    const out = await run(route, { params: { name: "r.ndjson.gz" }, body: { confirm: true } });
    assert.strictEqual(out.status, 500);
    assert.ok(!/secret-host|ER_DISK/.test(JSON.stringify(out.body)), JSON.stringify(out.body));
  } finally { console.error = oe; }
};
exports["فایل بین بررسی و بازیابی تغییر کند ← رد و بدون تغییر"] = async () => {
  const { db, backup } = setup(); gz("t.ndjson.gz", goodLines()); const before = snapshot(db);
  const origV = backup.validateFile; // شبیه‌سازی دست‌کاری پس از اعتبارسنجی: mtime را جلو می‌بریم
  const f = path.join(TMP, "t.ndjson.gz"); const st = fs.statSync(f);
  const realStat = fs.statSync; let n = 0;
  fs.statSync = (p, ...a) => { const s = realStat(p, ...a); if (String(p) === f && ++n >= 2) return Object.assign(Object.create(Object.getPrototypeOf(s)), s, { mtimeMs: s.mtimeMs + 5000 }); return s; };
  try { await assert.rejects(backup.restoreFromFile("t.ndjson.gz", { safety: false }), (e) => e.expose === true); } finally { fs.statSync = realStat; }
  assert.strictEqual(snapshot(db), before);
};
exports["آپلود: فایل خراب رد و ذخیره نمی‌شود؛ فایل سالم ذخیره می‌شود"] = async () => {
  const { db } = setup(); const before2 = H.routers.length; H.load("routes/backup.js");
  const route = H.routers.slice(before2)[0].handlers["POST /upload"];
  const doUpload = (buf) => new Promise((resolve) => {
    const req = Readable.from([buf]); req.headers = {}; req.query = {}; req.params = {}; req.body = {};
    const res = { status(c) { this.c = c; return this; }, json(b) { resolve({ c: this.c || 200, b }); return this; } };
    route[route.length - 1](req, res);
  });
  const before = fs.readdirSync(TMP).sort();
  const bad = await doUpload(zlib.gzipSync(goodLines({ noEnd: true }).join("\n")));
  assert.strictEqual(bad.c, 400);
  assert.deepStrictEqual(fs.readdirSync(TMP).sort(), before, "فایل خراب نباید در پوشه بماند");
  const bad2 = await doUpload(Buffer.from("garbage"));
  assert.strictEqual(bad2.c, 400);
  const ok = await doUpload(zlib.gzipSync(goodLines().join("\n") + "\n"));
  assert.ok(ok.b.ok, JSON.stringify(ok));
  assert.ok(fs.readdirSync(TMP).some((f) => /^uploaded-/.test(f)));
  assert.ok(!fs.readdirSync(TMP).some((f) => f.endsWith(".tmp")));
};
