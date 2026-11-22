// نوبت وام: قطع رابطه ← «لغو شده» (نه حذف) و برگشت خودکار؛ فیلتر تاریخ پرداخت و تغییر وضعیت دسته‌جمعی (مساعده/امداد)؛ فقط با دیتابیس ساختگی
const assert = require("assert");
const H = require("./helpers");
const Q = require(require("path").join(H.SRV, "loanQueueSync.js"));

const mkConn = (rows) => ({ rows, log: [],
  async query(sql, p) {
    sql = String(sql).replace(/\s+/g, " "); this.log.push([sql, p]);
    if (/^SELECT id, code FROM loan_queue WHERE status = 'pending'/.test(sql)) return [this.rows.filter((r) => r.status === "pending").map((r) => ({ id: r.id, code: r.code }))];
    if (/^SELECT id, code FROM loan_queue WHERE status = 'cancelled' AND notes LIKE/.test(sql)) return [this.rows.filter((r) => r.status === "cancelled" && String(r.notes || "").startsWith(p[0].replace("%", ""))).map((r) => ({ id: r.id, code: r.code }))];
    if (/^SELECT id FROM loan_queue WHERE code = \? AND status = 'pending'/.test(sql)) return [this.rows.filter((r) => r.code === p[0] && r.status === "pending")];
    let m;
    if ((m = /^UPDATE loan_queue SET status = 'cancelled', notes = \? WHERE status = 'pending' AND id = \?/.exec(sql))) { const r = this.rows.find((x) => x.id === p[1] && x.status === "pending"); if (r) { r.status = "cancelled"; r.notes = p[0]; } return [{ affectedRows: 1 }]; }
    if (/^UPDATE loan_queue SET status = 'pending', notes = NULL WHERE status = 'cancelled' AND id = \?/.test(sql)) { const r = this.rows.find((x) => x.id === p[0] && x.status === "cancelled"); if (r) { r.status = "pending"; r.notes = null; } return [{ affectedRows: 1 }]; }
    if (/^DELETE FROM loan_queue WHERE status = 'pending' AND id IN/.test(sql)) { this.rows = this.rows.filter((r) => !(r.status === "pending" && p[0].includes(r.id))); return [{}]; }
    throw new Error("SQL ناشناخته: " + sql);
  } });

exports["نوبت وام: قطع رابطه/وظیفه‌بگیر ← «لغو شده» با علت؛ «بدون کسر سهم صندوق» ← حذف؛ بقیه دست‌نخورده"] = async () => {
  const c = mkConn([{ id: 1, code: "1", status: "pending" }, { id: 2, code: "2", status: "pending" }, { id: 3, code: "3", status: "pending" }, { id: 4, code: "4", status: "pending" }, { id: 5, code: "1", status: "received" }]);
  const blocked = new Map([["1", "قطع رابطه"], ["2", "وظیفه‌بگیر"], ["3", "سهم صندوق کسر نمی‌شود"]]);
  const out = await Q.pruneBlockedQueue(c, blocked);
  assert.deepStrictEqual(out.map((x) => [x.code, x.action]), [["1", "cancelled"], ["2", "cancelled"], ["3", "deleted"]]);
  assert.strictEqual(c.rows.find((r) => r.id === 1).status, "cancelled"); assert.strictEqual(c.rows.find((r) => r.id === 1).notes, "لغو خودکار — قطع رابطه");
  assert.strictEqual(c.rows.find((r) => r.id === 2).notes, "لغو خودکار — وظیفه‌بگیر");
  assert.ok(!c.rows.find((r) => r.id === 3));                                                    // حذف شد
  assert.strictEqual(c.rows.find((r) => r.id === 4).status, "pending");                          // مسدود نبود
  assert.strictEqual(c.rows.find((r) => r.id === 5).status, "received");                         // دریافت‌شده هرگز دست نمی‌خورد
};
exports["نوبت وام: وضعیت فرد شاغل/بازنشسته شد ← «در انتظار نوبت»؛ لغو دستی یا نوبت باز دیگر برنمی‌گردد"] = async () => {
  const c = mkConn([
    { id: 1, code: "1", status: "cancelled", notes: "لغو خودکار — قطع رابطه" },      // دیگر مسدود نیست ← برمی‌گردد
    { id: 2, code: "2", status: "cancelled", notes: "لغو خودکار — وظیفه‌بگیر" },      // هنوز مسدود ← می‌ماند
    { id: 3, code: "3", status: "cancelled", notes: "توسط کاربر لغو شد" },             // لغو دستی ← می‌ماند
    { id: 4, code: "4", status: "cancelled", notes: "لغو خودکار — قطع رابطه" },
    { id: 5, code: "4", status: "pending" },                                           // فرد ۴ نوبت باز دارد ← برنمی‌گردد
  ]);
  const back = await Q.reviveUnblockedQueue(c, new Map([["2", "وظیفه‌بگیر"]]));
  assert.deepStrictEqual(back, [{ code: "1" }]);
  assert.strictEqual(c.rows.find((r) => r.id === 1).status, "pending"); assert.strictEqual(c.rows.find((r) => r.id === 1).notes, null);
  assert.strictEqual(c.rows.find((r) => r.id === 2).status, "cancelled");
  assert.strictEqual(c.rows.find((r) => r.id === 3).status, "cancelled");
  assert.strictEqual(c.rows.find((r) => r.id === 4).status, "cancelled");
};

// ---- فیلتر تاریخ پرداخت و تغییر وضعیت دسته‌جمعی
const find = (file, key, also) => { const before = H.routers.length; H.load(file); const r = H.routers.slice(before).find((x) => x.handlers[key] && (!also || x.handlers[also])); return r.handlers[key]; };   // also: برای جدا کردن روتر مساعده از روترهای دیگر همان فایل
exports["مساعده/امداد: فیلتر تاریخ پرداخت (بین دو تاریخ) در SQL؛ تاریخ نامعتبر ۴۰۰"] = async () => {
  for (const [file, alias] of [["routes/extras.js", "a"], ["routes/emdad.js", "e"]]) {
    const log = []; H.setPool({ async query(sql, p) { log.push([String(sql).replace(/\s+/g, " "), p]); return [[]]; } });
    const get = find(file, "GET /", "POST /bulk-paid");
    const r = await H.run(get, { query: { status: "all", paidFrom: "1405/07/01", paidTo: "1405/07/30" } });
    assert.strictEqual(r.status, 200, file);
    const q = log.find(([s]) => /paid_date >= \? AND/.test(s) || new RegExp(alias + "\\.paid_date >= \\?").test(s));
    assert.ok(q, file); assert.ok(q[1].includes("1405/07/01") && q[1].includes("1405/07/30"));
    const bad = await H.run(get, { query: { status: "all", paidFrom: "x" } }); assert.strictEqual(bad.status, 400);
  }
};
exports["مساعده/امداد: bulk-status — پرداخت‌شده تاریخ می‌خواهد؛ در انتظار/لغو تاریخ را پاک می‌کند؛ وضعیت نامعتبر ۴۰۰"] = async () => {
  for (const [file, table] of [["routes/extras.js", "advances"], ["routes/emdad.js", "emdad_loans"]]) {
    const log = []; H.setPool({ async query(sql, p) { log.push([String(sql).replace(/\s+/g, " "), p]); return [{ affectedRows: 2 }]; } });
    const post = find(file, "POST /bulk-status");
    let r = await H.run(post, { body: { ids: [1, 2], status: "paid" } }); assert.strictEqual(r.status, 400); assert.ok(/تاریخ پرداخت/.test(r.body.message)); assert.strictEqual(log.length, 0);
    r = await H.run(post, { body: { ids: [1, 2], status: "paid", paidDate: "۱۴۰۵/۰۸/۲۰" } });
    assert.strictEqual(r.status, 200); assert.strictEqual(r.body.changed, 2);
    assert.ok(new RegExp("UPDATE " + table + " SET status = \\?, paid_date = \\? WHERE status <> \\? (AND closed = 0 )?AND id IN").test(log[0][0]));   // مساعدهٔ بسته‌شده تغییر نمی‌کند assert.deepStrictEqual(log[0][1].slice(0, 3), ["paid", "1405/08/20", "paid"]);
    log.length = 0;
    r = await H.run(post, { body: { ids: [1], status: "pending" } }); assert.strictEqual(r.status, 200); assert.deepStrictEqual(log[0][1].slice(0, 3), ["pending", null, "pending"]);
    r = await H.run(post, { body: { ids: [1], status: "cancelled" } }); assert.deepStrictEqual(log[1][1].slice(0, 3), ["cancelled", null, "cancelled"]);
    r = await H.run(post, { body: { ids: [1], status: "weird" } }); assert.strictEqual(r.status, 400);
    r = await H.run(post, { body: { ids: [], status: "paid", paidDate: "1405/01/01" } }); assert.strictEqual(r.status, 400);
  }
};

// ---- ثبت دریافت وام از اکسل
exports["نوبت وام: ثبت دریافت از اکسل — نوبت «در انتظار» دریافت‌شده می‌شود؛ بقیه با دلیل رد می‌شوند؛ بررسی (dryRun) چیزی ثبت نمی‌کند"] = async () => {
  const entries = { "10": [{ id: 100, status: "pending" }], "11": [{ id: 101, status: "received" }], "12": [{ id: 102, status: "cancelled" }], "13": [] };
  const updates = []; let rolled = 0, committed = 0;
  const conn = { async beginTransaction() {}, async commit() { committed++; }, async rollback() { rolled++; }, release() {},
    async query(sql, p) { sql = String(sql).replace(/\s+/g, " ");
      if (/^SELECT id, status FROM loan_queue WHERE code = \?/.test(sql)) return [entries[p[0]] || []];
      if (/^UPDATE loan_queue SET status = 'received'/.test(sql)) { updates.push(p); return [{ affectedRows: 1 }]; }
      throw new Error("SQL ناشناخته: " + sql); } };
  H.setPool({ async query() { return [[]]; }, async getConnection() { return conn; } });
  const post = find("routes/loanQueue.js", "POST /receive-import");
  const items = [
    { code: "۱۰", loanAmount: "300,000,000", installmentAmount: "10,000,000", receivedDate: "۱۴۰۵/۷/۲۱" },
    { code: "10", loanAmount: 1, installmentAmount: 1, receivedDate: "1405/07/21" },          // تکراری
    { code: "11", loanAmount: 5, installmentAmount: 1, receivedDate: "1405/07/21" },          // قبلاً دریافت‌شده
    { code: "12", loanAmount: 5, installmentAmount: 1, receivedDate: "1405/07/21" },          // لغو شده
    { code: "13", loanAmount: 5, installmentAmount: 1, receivedDate: "1405/07/21" },          // بدون نوبت
    { code: "14", loanAmount: 0, installmentAmount: 1, receivedDate: "1405/07/21" },          // مبلغ نامعتبر
    { code: "15", loanAmount: 5, installmentAmount: 1, receivedDate: "1405/13/40" },          // تاریخ نامعتبر
    { code: "", loanAmount: 5, installmentAmount: 1, receivedDate: "1405/07/21" },
  ];
  let r = await H.run(post, { body: { dryRun: true, items } });
  assert.strictEqual(r.status, 200, JSON.stringify(r.body)); assert.strictEqual(r.body.received, 1); assert.strictEqual(updates.length, 0); assert.strictEqual(rolled, 1); assert.strictEqual(committed, 0);
  assert.deepStrictEqual(r.body.skipped.map((x) => x.row), [2, 3, 4, 5, 6, 7, 8]);
  assert.ok(/تکراری/.test(r.body.skipped[0].reason)); assert.ok(/قبلاً/.test(r.body.skipped[1].reason)); assert.ok(/لغو/.test(r.body.skipped[2].reason)); assert.ok(/نوبتی/.test(r.body.skipped[3].reason));
  const it0 = r.body.items[0];                                                                  // ۳۰۰م ÷ ۱۰م = ۳۰ قسط؛ شروع مهر ۱۴۰۵ ← پایان ۲۹ ماه بعد (اسفند ۱۴۰۷)
  assert.deepStrictEqual([it0.installmentMonths, it0.endYear, it0.endMonth, it0.receivedDate], [30, 1407, 12, "1405/07/21"]);
  r = await H.run(post, { body: { dryRun: false, items } });
  assert.strictEqual(r.body.received, 1); assert.strictEqual(committed, 1); assert.strictEqual(updates.length, 1);
  const u = updates[0]; assert.strictEqual(u[0], "2026-10-13 12:00:00");                         // ۲۱ مهر ۱۴۰۵ = ۱۳ اکتبر ۲۰۲۶
  assert.deepStrictEqual(u.slice(1, 4), [300000000, 10000000, 30]); assert.deepStrictEqual(u.slice(6, 10), [1405, 7, 1407, 12]); assert.strictEqual(u[10], 100);
  r = await H.run(post, { body: { items: [] } }); assert.strictEqual(r.status, 400);
};
