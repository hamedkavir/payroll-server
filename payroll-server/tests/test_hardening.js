// تست‌های تکمیلی ممیزی امنیتی: خطای عمومی، تغییر رمز اجباری، پشتیبان (.tmp)، ورود پرسنل (ردیف‌های ناقص)، آپلود بیمه
const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const H = require("./helpers");

const handlerOf = (rel, key) => { const before = H.routers.length; H.load(rel); const r = H.routers.slice(before)[0]; return r.handlers[key]; };
const connOf = (log, fail) => ({
  async beginTransaction() { log.push("BEGIN"); }, async commit() { log.push("COMMIT"); }, async rollback() { log.push("ROLLBACK"); }, release() {},
  async query(sql, p) { sql = String(sql).replace(/\s+/g, " ").trim(); log.push(sql); if (fail && fail(sql, p)) throw new Error("ER_SECRET host=10.0.0.9"); return /^SELECT/.test(sql) ? [[]] : [{ affectedRows: 1, insertId: 1 }]; },
});

exports["userMsg: خطای تجاری عیناً، خطای برنامه/دیتابیس فقط پیام عمومی"] = async () => {
  const { userMsg } = H.load("errors.js");
  assert.strictEqual(userMsg(new Error("مبلغ نامعتبر است")), "مبلغ نامعتبر است");
  const te = new TypeError("Cannot read properties of undefined (reading 'x')");
  const out = userMsg(te); assert.ok(!/Cannot read|undefined/.test(out), out);
  const db = Object.assign(new Error("ER_BAD_FIELD_ERROR: Unknown column 'x' in 'field list'"), { code: "ER_BAD_FIELD_ERROR" });
  assert.ok(!/ER_|Unknown column/.test(userMsg(db)));
};

exports["تغییر رمز اجباری: همان رمز قبلی پذیرفته نمی‌شود"] = async () => {
  const { hashPassword } = H.load("auth.js");
  let updated = 0;
  H.setPool({ async query(sql) {
    if (/^SELECT \* FROM users WHERE id/.test(sql)) return [[{ id: 1, password_hash: hashPassword("Temp#123"), must_change: 1 }]];
    if (/^UPDATE users/.test(sql)) updated++;
    return [{}];
  } });
  const put = handlerOf("routes/auth.js", "PUT /password").slice(-1);   // فقط هندلر نهایی (authenticate جداگانه تست شده)
  const r = await H.run(put, { user: { id: 1 }, tokenHash: "h", body: { oldPassword: "Temp#123", newPassword: "Temp#123" } });
  assert.strictEqual(r.status, 400); assert.strictEqual(updated, 0);
  const r2 = await H.run(put, { user: { id: 1 }, tokenHash: "h", body: { oldPassword: "Temp#123", newPassword: "Another#456" } });
  assert.ok(r2.body && r2.body.ok, JSON.stringify(r2.body)); assert.strictEqual(updated, 1);
};

exports["پشتیبان: خطای شروع (اتصال دیتابیس) هیچ فایل .tmp بی‌صاحبی نمی‌گذارد"] = async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "bk2-")); process.env.BACKUP_DIR = dir;
  const makeBackup = H.load("backup.js");
  const bk = makeBackup({ async getConnection() { throw new Error("ER_CON_COUNT_ERROR host=10.0.0.9"); } });
  await assert.rejects(bk.createBackup("manual"));
  await new Promise((r) => setTimeout(r, 150));   // اگر open() دیرتر تمام شود فایل بعداً ساخته می‌شد (باگ قبلی)
  assert.deepStrictEqual(fs.readdirSync(dir), [], "نباید .tmp باقی بماند");
};

exports["ورود پرسنل: ستونِ غایب در یک ردیف، مقدار آن فرد را نمی‌پاشد؛ حساب خالی مقدار قبلی را پاک نمی‌کند"] = async () => {
  const log = []; const conn = connOf(log);
  H.setPool({ async getConnection() { return conn; }, query: conn.query });
  const imp = handlerOf("routes/personnel.js", "POST /import");
  const r = await H.run(imp, { body: { mode: "merge", people: [
    { code: "A1", firstName: "الف", mobile: "09120000000", bankAccount: "" },
    { code: "B2", firstName: "ب" },                       // mobile در این ردیف اصلاً نیست
  ] } });
  assert.ok(r.body && r.body.ok, JSON.stringify(r.body));
  const ins = log.filter((s) => /^INSERT INTO personnel/.test(s));
  assert.strictEqual(ins.length, 2);
  assert.ok(/mobile = VALUES\(mobile\)/.test(ins[0]), "ردیف دارای mobile باید آن را به‌روز کند");
  assert.ok(!/mobile = VALUES\(mobile\)/.test(ins[1]), "ردیف بدون mobile نباید mobile را به‌روز کند");
  assert.ok(/bank_account = IF\(VALUES\(bank_account\) = '', bank_account, VALUES\(bank_account\)\)/.test(ins[0]), "حساب خالی نباید مقدار قبلی را پاک کند");
};
exports["ورود پرسنل: replace با فهرست خالی/بدون کد هیچ‌کس را حذف نمی‌کند"] = async () => {
  const log = []; const conn = connOf(log);
  H.setPool({ async getConnection() { return conn; }, query: conn.query });
  const imp = handlerOf("routes/personnel.js", "POST /import");
  assert.strictEqual((await H.run(imp, { body: { mode: "replace", people: [] } })).status, 400);
  await H.run(imp, { body: { mode: "replace", people: [{ firstName: "بدون کد" }] } });
  assert.ok(!log.some((s) => /^DELETE FROM personnel/.test(s)), "نباید حذفی انجام شود");
};

exports["آپلود بیمه: توکن تصادفی، وابسته به کاربر/نشست؛ حدس‌زدنی و قابل‌جابه‌جایی نیست"] = async () => {
  const log = []; const conn = connOf(log);
  H.setPool({ async getConnection() { return conn; }, query: conn.query });
  const before = H.routers.length; H.load("routes/insurance.js"); const R = H.routers.slice(before)[0];
  const begin = R.handlers["POST /upload/begin"], up = R.handlers["POST /upload"];
  const a = await H.run(begin, { user: { id: 1 }, tokenHash: "s1" });
  const b = await H.run(begin, { user: { id: 2 }, tokenHash: "s2" });
  for (const t of [a.body.token, b.body.token]) assert.ok(/^[a-f0-9]{24}$/.test(t));
  assert.notStrictEqual(a.body.token, b.body.token);
  const row = { mainid: "1", pcode: "1", nid: "1234567890", fname: "x", lname: "y", rel: "سرپرست" };
  // کاربر دیگر / نشست دیگر / قالب ناصحیح / توکن حدسی
  assert.strictEqual((await H.run(up, { user: { id: 2 }, tokenHash: "s2", body: { token: a.body.token, rows: [row] } })).status, 403);
  assert.strictEqual((await H.run(up, { user: { id: 1 }, tokenHash: "OTHER", body: { token: a.body.token, rows: [row] } })).status, 403);
  assert.strictEqual((await H.run(up, { user: { id: 1 }, tokenHash: "s1", body: { token: "1", rows: [row] } })).status, 400);
  assert.strictEqual((await H.run(up, { user: { id: 1 }, tokenHash: "s1", body: { token: { $gt: "" }, rows: [row] } })).status, 400);
  assert.strictEqual((await H.run(up, { user: { id: 1 }, tokenHash: "s1", body: { token: "0".repeat(24), rows: [row] } })).status, 403);
  // صاحب واقعی با نشست خودش می‌تواند
  const ok = await H.run(up, { user: { id: 1 }, tokenHash: "s1", body: { token: a.body.token, rows: [row] } });
  assert.ok(ok.body && ok.body.ok, JSON.stringify(ok.body));
};
exports["آپلود بیمه: خطا ← Rollback، پاک‌شدن ردیف‌های ناتمام، ابطال توکن و پیام عمومی"] = async () => {
  const log = []; const conn = connOf(log, (sql) => /^INSERT INTO insurance_members/.test(sql));
  H.setPool({ async getConnection() { return conn; }, query: conn.query });
  const before = H.routers.length; H.load("routes/insurance.js"); const R = H.routers.slice(before)[0];
  const t = (await H.run(R.handlers["POST /upload/begin"], { user: { id: 1 }, tokenHash: "s1" })).body.token;
  log.length = 0;
  const r = await H.run(R.handlers["POST /upload"], { user: { id: 1 }, tokenHash: "s1", body: { token: t, last: true, rows: [{ mainid: "1", pcode: "1", nid: "1", rel: "سرپرست" }] } });
  assert.strictEqual(r.status, 500);
  assert.ok(!/ER_SECRET|10\.0\.0\.9/.test(JSON.stringify(r.body)), "جزئیات داخلی نباید برگردد");
  assert.ok(log.includes("ROLLBACK"), "باید Rollback شود");
  assert.ok(log.some((s) => /^DELETE FROM insurance_members WHERE batch = \?/.test(s)), "ردیف‌های ناتمام باید پاک شوند");
  assert.ok(!log.some((s) => /^REPLACE INTO insurance_files/.test(s)), "فایل فعلی نباید عوض شود");
  const again = await H.run(R.handlers["POST /upload"], { user: { id: 1 }, tokenHash: "s1", body: { token: t, rows: [] } });
  assert.strictEqual(again.status, 403, "توکن باید باطل شده باشد");
};
