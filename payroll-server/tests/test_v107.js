// وام امداد: وام بلاعوض؛ بستن مساعده (قفل مساعده‌های پرداخت‌شده)؛ فقط با دیتابیس ساختگی
const assert = require("assert");
const H = require("./helpers");
const find = (file, key, also) => { const before = H.routers.length; H.load(file); const r = H.routers.slice(before).find((x) => x.handlers[key] && (!also || x.handlers[also])); return r.handlers[key]; };

// ---- وام بلاعوض
const emPool = (log) => ({ async query(sql, p) {
  sql = String(sql).replace(/\s+/g, " "); log.push([sql, p]);
  if (/FROM personnel WHERE code/.test(sql)) return [[{ code: "9", advance_account: "0123", advance_owner: "علی", bank_account: "5" }]];
  if (/^INSERT INTO emdad_loans/.test(sql)) return [{ insertId: 4 }];
  return [[]];
} });
const colsOf = (sql, p) => { const names = /\(([^)]*)\) VALUES/.exec(sql)[1].split(",").map((x) => x.trim()); const o = {}; names.forEach((n, i) => (o[n] = p[i])); return o; };
exports["وام امداد: قسط = (مبلغ وام − بلاعوض) ÷ تعداد اقساط؛ بلاعوض ≥ وام رد می‌شود"] = async () => {
  const log = []; H.setPool(emPool(log));
  const post = find("routes/emdad.js", "POST /");
  let r = await H.run(post, { body: { code: "9", requestDate: "1405/08/20", requestTime: "10:00", amount: "1,000,000,000", grantAmount: "200,000,000", installments: 20, account: "0123" } });
  assert.strictEqual(r.status, 200, JSON.stringify(r.body));
  const ins = log.find(([s]) => /^INSERT INTO emdad_loans/.test(s)); const c = colsOf(ins[0], ins[1]);
  assert.strictEqual(c.grant_amount, 200000000); assert.strictEqual(c.installment_amount, 40000000);          // (۱۰۰۰ − ۲۰۰) میلیون ÷ ۲۰
  log.length = 0;
  r = await H.run(post, { body: { code: "9", requestDate: "1405/08/20", requestTime: "10:00", amount: "1000000000", grantAmount: "1000000000", installments: 20, account: "0123" } });
  assert.strictEqual(r.status, 400); assert.ok(/بلاعوض/.test(r.body.message)); assert.ok(!log.some(([s]) => /^INSERT/.test(s)));
  log.length = 0;
  r = await H.run(post, { body: { code: "9", requestDate: "1405/08/20", requestTime: "10:00", amount: "1000000000", installments: 20, account: "0123" } });   // بدون بلاعوض مثل قبل
  const c2 = colsOf(log.find(([s]) => /^INSERT INTO emdad_loans/.test(s))[0], log.find(([s]) => /^INSERT INTO emdad_loans/.test(s))[1]);
  assert.strictEqual(c2.grant_amount, 0); assert.strictEqual(c2.installment_amount, 50000000);
};

// ---- بستن مساعده و امداد
const mkClosingPool = (tables) => { const closings = []; let nid = 1;
  const conn = { async beginTransaction() {}, async commit() {}, async rollback() {}, release() {},
    async query(sql, p) { sql = String(sql).replace(/\s+/g, " "); let m;
      if (/^SELECT \* FROM advance_closings/.test(sql)) return [closings.map((c) => ({ id: c.id, year: c.year, month: c.month, close_date: c.close_date, apply_year: c.apply_year, apply_month: c.apply_month, note: c.note, created_by: "" }))];
      if (/^INSERT INTO advance_closings/.test(sql)) { const [year, month, close_date, apply_year, apply_month, note] = p; const ex = closings.find((c) => c.year === year && c.month === month); if (ex) Object.assign(ex, { close_date, apply_year, apply_month, note }); else closings.push({ id: nid++, year, month, close_date, apply_year, apply_month, note }); return [{}]; }
      if (/^DELETE FROM advance_closings/.test(sql)) { const n = closings.length; const i = closings.findIndex((c) => c.id === +p[0]); if (i >= 0) closings.splice(i, 1); return [{ affectedRows: n - closings.length }]; }
      if ((m = /^SELECT id FROM (\w+) WHERE closed = 1$/.exec(sql))) return [tables[m[1]].filter((r) => r.closed).map((r) => ({ id: r.id }))];
      if ((m = /^UPDATE (\w+) SET closed = 0, closing_id = NULL WHERE closed = 1$/.exec(sql))) { tables[m[1]].forEach((r) => { if (r.closed) { r.closed = 0; r.closing_id = null; } }); return [{}]; }
      if ((m = /^UPDATE (\w+) SET closed = 1, closing_id = \? WHERE closed = 0 AND status = 'paid'/.exec(sql))) { tables[m[1]].forEach((r) => { if (!r.closed && r.status === "paid" && r.paid_date && r.paid_date <= p[1]) { r.closed = 1; r.closing_id = p[0]; } }); return [{}]; }
      if (/^SELECT \(SELECT COUNT\(\*\) FROM advances WHERE closed = 1 AND closing_id IS NULL\)/.test(sql)) return [[{ c: 0 }]];
      if ((m = /^SELECT closing_id, COUNT\(\*\) AS c, COALESCE\(SUM\(amount\), 0\) AS a FROM (\w+) WHERE closed = 1 GROUP BY closing_id/.exec(sql))) { const g = {}; tables[m[1]].filter((r) => r.closed).forEach((r) => { const x = (g[r.closing_id] = g[r.closing_id] || { closing_id: r.closing_id, c: 0, a: 0 }); x.c++; x.a += r.amount || 0; }); return [Object.values(g)]; }
      if ((m = /^SELECT x\.\*, p\.first_name.* FROM (\w+) x LEFT JOIN personnel/.exec(sql))) return [tables[m[1]].filter((r) => r.closed && (!p.length || r.closing_id === p[0])).map((r) => ({ ...r, first_name: "علی", last_name: "رضایی", national_id: "1", person_status: "شاغل", request_date: r.paid_date, installments: 2, installment_amount: 5, account: "1" }))];
      throw new Error("SQL ناشناخته: " + sql); } };
  return { conn, closings };
};
const clHandler = (key) => { const before = H.routers.length; H.load("routes/closings.js"); return H.routers.slice(before).find((x) => x.handlers[key]).handlers[key]; };
exports["بستن مساعده و امداد: هر دو جدول قفل می‌شوند؛ هر مورد به نخستین بستنِ رسیده نسبت داده می‌شود؛ ماه حقوقیِ اعمال؛ حذف، قفل را از نو حساب می‌کند"] = async () => {
  const tables = {
    advances: [{ id: 1, code: "5", status: "paid", paid_date: "1405/07/10", amount: 100, closed: 0 }, { id: 2, status: "paid", paid_date: "1405/08/05", amount: 200, closed: 0 }, { id: 3, status: "pending", paid_date: null, amount: 300, closed: 0 }],
    emdad_loans: [{ id: 11, code: "5", status: "paid", paid_date: "1405/07/12", amount: 1000, closed: 0 }, { id: 12, status: "paid", paid_date: "1405/08/09", amount: 2000, closed: 0 }, { id: 13, status: "cancelled", paid_date: null, amount: 3000, closed: 0 }],
  };
  const { conn } = mkClosingPool(tables);
  H.setPool({ async query(sql, p) { return conn.query(sql, p); }, async getConnection() { return conn; } });
  const post = clHandler("POST /advances"), del = clHandler("DELETE /advances/:id"), get = clHandler("GET /advances"), items = clHandler("GET /advances/items");
  let r = await H.run(post, { body: { year: 1405, month: 7, closeDate: "1405/07/15", applyYear: 1405, applyMonth: 8 } });
  assert.strictEqual(r.status, 200, JSON.stringify(r.body)); assert.strictEqual(r.body.closedAdvances, 2);          // مساعدهٔ ۱ و امدادِ ۱۱
  assert.deepStrictEqual([tables.advances.map((a) => a.closed), tables.emdad_loans.map((a) => a.closed)], [[1, 0, 0], [1, 0, 0]]);
  r = await H.run(post, { body: { year: 1405, month: 8, closeDate: "1405/08/10" } });                               // «اعمال در ماه» خالی ← همان ماه بستن
  assert.strictEqual(r.body.closedAdvances, 2); assert.deepStrictEqual(tables.advances.map((a) => [a.closed, a.closing_id || null]), [[1, 1], [1, 2], [0, null]]);   // ۱ ← بستن مهر، ۲ ← بستن آبان
  assert.deepStrictEqual(tables.emdad_loans.map((a) => a.closed), [1, 1, 0]);                                       // «لغوشده» و «در انتظار» هرگز بسته نمی‌شوند
  r = await H.run(post, { body: { year: 1405, month: 9, closeDate: "1405/08/01" } }); assert.strictEqual(r.status, 400);
  r = await H.run(post, { body: { year: 1405, month: 7, closeDate: "1405/08/20" } }); assert.strictEqual(r.status, 400);
  r = await H.run(post, { body: { year: 1405, month: 7, closeDate: "1405/07/15", applyYear: 1405, applyMonth: 13 } }); assert.strictEqual(r.status, 400);
  const g = await H.run(get, {}); assert.strictEqual(g.body.items.length, 2); assert.strictEqual(g.body.closedCount, 4);
  const aug = g.body.items[0], jul = g.body.items[1];
  assert.deepStrictEqual([aug.applyYear, aug.applyMonth, jul.applyYear, jul.applyMonth], [1405, 8, 1405, 8]);
  assert.deepStrictEqual([jul.advances.count, jul.emdad.count, jul.advances.amount, jul.emdad.amount], [1, 1, 100, 1000]);
  assert.strictEqual(aug.from, "1405/07/16");
  // فهرست اکسل: یک بستن / همه
  let it = await H.run(items, { query: { closingId: String(jul.id) } });
  assert.deepStrictEqual(it.body.items.map((x) => [x.kind, x.code, x.applyYm, x.closingYm]), [["مساعده", "5", "1405/08", "1405/07"], ["وام امداد", "5", "1405/08", "1405/07"]]);
  it = await H.run(items, { query: {} }); assert.strictEqual(it.body.items.length, 4);
  // حذف آبان ← موارد آبان باز می‌شوند (۲)؛ حذف مهر ← همه باز
  r = await H.run(del, { params: { id: String(aug.id) } });
  assert.strictEqual(r.status, 200); assert.strictEqual(r.body.reopenedAdvances, 2); assert.deepStrictEqual(tables.advances.map((a) => a.closed), [1, 0, 0]);
  r = await H.run(del, { params: { id: String(jul.id) } }); assert.deepStrictEqual([tables.advances.map((a) => a.closed), tables.emdad_loans.map((a) => a.closed)], [[0, 0, 0], [0, 0, 0]]);
  r = await H.run(del, { params: { id: "999" } }); assert.strictEqual(r.status, 404);
};
exports["مساعده: مساعدهٔ بسته‌شده با ویرایش/حذف رد می‌شود (۴۰۹)؛ مساعدهٔ باز عادی"] = async () => {
  let closed = 1; const log = [];
  H.setPool({ async query(sql, p) { sql = String(sql).replace(/\s+/g, " "); log.push(sql);
    if (/^UPDATE advances SET .* AND closed = 0$/.test(sql)) return [{ affectedRows: closed ? 0 : 1 }];
    if (/^DELETE FROM advances WHERE id = \? AND closed = 0/.test(sql)) return [{ affectedRows: closed ? 0 : 1 }];
    if (/^SELECT closed FROM advances WHERE id = \?/.test(sql)) return [[{ closed }]];
    return [[]]; } });
  const patch = find("routes/extras.js", "PATCH /:id", "POST /bulk-paid"), del = find("routes/extras.js", "DELETE /:id", "POST /bulk-paid");
  let r = await H.run(patch, { params: { id: "5" }, body: { status: "pending" } });
  assert.strictEqual(r.status, 409); assert.ok(/بسته/.test(r.body.message));
  r = await H.run(del, { params: { id: "5" } }); assert.strictEqual(r.status, 409);
  closed = 0;
  r = await H.run(patch, { params: { id: "5" }, body: { status: "pending" } }); assert.strictEqual(r.status, 200);
};

// ---- گزارش مالی: «ثبت‌شده در بازه» = مساعده و امدادهای بسته‌شده با ماه حقوقیِ اعمال در بازه
exports["گزارش مالی: خروجی «ثبت‌شده در بازه» مساعده و امدادِ بسته‌شده را بر اساس «اعمال در ماه حقوقی» می‌آورد"] = async () => {
  const P = { first_name: "علی", last_name: "رضایی", national_id: "1", person_status: "شاغل" };
  const adv = [
    { id: 1, code: "5", status: "paid", closed: 1, apply_year: 1405, apply_month: 8, amount: 100, installments: 2, installment_amount: 50, request_date: "1405/07/10", paid_date: "1405/07/12", ...P },
    { id: 2, code: "6", status: "paid", closed: 1, apply_year: 1405, apply_month: 9, amount: 200, installments: 2, installment_amount: 100, request_date: "1405/07/10", paid_date: "1405/07/12", ...P },   // ماه دیگر
    { id: 3, code: "7", status: "paid", closed: 0, apply_year: null, apply_month: null, amount: 300, installments: 2, installment_amount: 150, request_date: "1405/08/01", paid_date: "1405/08/02", ...P },       // بسته نشده
  ];
  const emd = [
    { id: 11, code: "8", status: "paid", closed: 1, apply_year: 1405, apply_month: 8, amount: 1000, grant_amount: 200, installments: 20, installment_amount: 40, request_date: "1405/07/10", paid_date: "1405/07/12", ...P },
  ];
  H.setPool({ async query(sql) {
    sql = String(sql).replace(/\s+/g, " ");
    if (/FROM advances a LEFT JOIN personnel/.test(sql)) return [adv];
    if (/FROM emdad_loans e LEFT JOIN personnel/.test(sql)) return [emd];
    return [[]];
  } });
  const before = H.routers.length; H.load("routes/reports.js");
  const h = H.routers.slice(before).find((x) => x.handlers["GET /summary"]).handlers["GET /summary"];
  const r = await H.run(h, { query: { y: "1405", m: "8", fy: "1405", fm: "8" } });
  assert.strictEqual(r.status, 200, JSON.stringify(r.body));
  const rows = r.body.exportRows;
  assert.deepStrictEqual(rows.map((x) => [x.type, x.code, x.loanRow, x.total, x.remaining]), [["مساعده", "5", 8, 100, 100], ["وام امداد", "8", 8, 1000, 800]]);   // باقی بازنشسته/باز/ماه دیگر نمی‌آید؛ امداد: مانده = وام − بلاعوض
};
