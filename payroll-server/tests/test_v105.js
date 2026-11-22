// وام امداد (تاریخ پرداخت، نام صاحب حساب)، مساعده (تاریخ پرداخت الزامی، برگشت به در انتظار)، تجمیعی کالا (گروه و کد کسر)؛ فقط با دیتابیس ساختگی
const assert = require("assert");
const H = require("./helpers");

const find = (file, key) => { const before = H.routers.length; H.load(file); const r = H.routers.slice(before).find((x) => x.handlers[key]); return r.handlers[key]; };

// ---- وام امداد
const emPool = (log) => ({ async query(sql, p) {
  sql = String(sql).replace(/\s+/g, " "); log.push([sql, p]);
  if (/^UPDATE emdad_loans SET/.test(sql)) return [{ affectedRows: 1 }];
  if (/FROM personnel WHERE code/.test(sql)) return [[{ code: "9", advance_account: "0123456789012", advance_owner: "علی رضایی", bank_account: "555" }]];
  if (/FROM emdad_loans WHERE code = \? AND status = 'pending'/.test(sql)) return [[]];
  if (/FROM settings|FROM form_settings|rounding/i.test(sql)) return [[]];
  if (/^INSERT INTO emdad_loans/.test(sql)) return [{ insertId: 4 }];
  return [[]];
} });
exports["وام امداد: «پرداخت شد» بدون تاریخ رد می‌شود؛ با تاریخ (حتی ارقام فارسی) ثبت می‌شود؛ برگشت به «در انتظار» تاریخ را پاک می‌کند"] = async () => {
  const log = []; H.setPool(emPool(log));
  const patch = find("routes/emdad.js", "PATCH /:id");
  let r = await H.run(patch, { params: { id: "3" }, body: { status: "paid" } });
  assert.strictEqual(r.status, 400); assert.ok(/تاریخ پرداخت/.test(r.body.message)); assert.strictEqual(log.length, 0);
  r = await H.run(patch, { params: { id: "3" }, body: { status: "paid", paidDate: "۱۴۰۵/۰۸/۲۰" } });
  assert.strictEqual(r.status, 200); assert.deepStrictEqual(log[0][1].slice(0, 2), ["paid", "1405/08/20"]);
  log.length = 0;
  r = await H.run(patch, { params: { id: "3" }, body: { status: "pending" } });
  assert.strictEqual(r.status, 200); assert.strictEqual(log[0][1][1], null);                              // paid_date = NULL
};
exports["وام امداد: نام صاحب حساب ذخیره می‌شود"] = async () => {
  const log = []; H.setPool(emPool(log));
  const patch = find("routes/emdad.js", "PATCH /:id");
  const r = await H.run(patch, { params: { id: "3" }, body: { account: "0123456789012", owner: "  زهرا احمدی " } });
  assert.strictEqual(r.status, 200); assert.ok(/account_owner = \?/.test(log[0][0])); assert.ok(log[0][1].includes("زهرا احمدی"));
};

// ---- مساعده
exports["مساعده: «پرداخت شد» بدون تاریخ رد می‌شود؛ برگشت از پرداخت‌شده به «در انتظار» تاریخ را پاک می‌کند"] = async () => {
  const log = []; H.setPool({ async query(sql, p) { sql = String(sql).replace(/\s+/g, " "); log.push([sql, p]); return /^UPDATE advances SET/.test(sql) ? [{ affectedRows: 1 }] : [[]]; } });
  const patch = find("routes/extras.js", "PATCH /:id");
  let r = await H.run(patch, { params: { id: "5" }, body: { status: "paid" } });
  assert.strictEqual(r.status, 400); assert.ok(/تاریخ پرداخت/.test(r.body.message)); assert.strictEqual(log.length, 0);
  r = await H.run(patch, { params: { id: "5" }, body: { status: "paid", paidDate: "1405/08/21" } });
  assert.strictEqual(r.status, 200); assert.ok(log[0][1].includes("1405/08/21"));
  log.length = 0;
  r = await H.run(patch, { params: { id: "5" }, body: { status: "pending" } });
  assert.strictEqual(r.status, 200); assert.ok(/status = \?, paid_date = \?/.test(log[0][0])); assert.deepStrictEqual(log[0][1].slice(0, 2), ["pending", null]);
};

// ---- تجمیعی کالا: هر (فرد، گروه کالا) یک ردیف با کد کسر گروه
exports["تجمیعی کالا: به تفکیک گروه کالا + کد کسر؛ قسط کالا یا (برای قدیمی‌ها) سهم از قسط درخواست؛ جمع‌ها درست"] = async () => {
  const rows = [
    // سفارش ۱: دو قلم، قسط هر کالا ذخیره شده — دو گروه مختلف
    { oid: 1, code: "10", o_inst: 700, first_name: "علی", last_name: "رضایی", national_id: "111", qty: "2", unit_price: "1000", i_inst: 200, gid: 5, gname: "لوازم خانگی", deduction_code: "801" },
    { oid: 1, code: "10", o_inst: 700, first_name: "علی", last_name: "رضایی", national_id: "111", qty: "1", unit_price: "3000", i_inst: 500, gid: 6, gname: "موبایل", deduction_code: "802" },
    // سفارش ۲ (قدیمی: قسط کالا ندارد؛ قسط ۱۰۰۰ به نسبت مبلغ بین دو قلم): ۱۰۰۰ و ۳۰۰۰ ← ۲۵۰ و ۷۵۰ — هر دو گروه ۵
    { oid: 2, code: "10", o_inst: 1000, first_name: "علی", last_name: "رضایی", national_id: "111", qty: "1", unit_price: "1000", i_inst: null, gid: 5, gname: "لوازم خانگی", deduction_code: "801" },
    { oid: 2, code: "10", o_inst: 1000, first_name: "علی", last_name: "رضایی", national_id: "111", qty: "1", unit_price: "3000", i_inst: null, gid: 5, gname: "لوازم خانگی", deduction_code: "801" },
    // فرد دیگر، کالای بدون گروه
    { oid: 3, code: "2", o_inst: 100, first_name: "مریم", last_name: "کریمی", national_id: "222", qty: "1", unit_price: "400", i_inst: 100, gid: null, gname: null, deduction_code: null },
  ];
  H.setPool({ async query(sql) { assert.ok(/FROM goods_orders o JOIN goods_order_items i/.test(String(sql).replace(/\s+/g, " "))); return [rows]; } });
  const h = find("routes/extras.js", "GET /orders");
  const r = await H.run(h, { query: { mode: "agg", status: "all", all: "1" } });
  assert.strictEqual(r.status, 200, JSON.stringify(r.body));
  const b = r.body;
  assert.deepStrictEqual(b.rows.map((x) => [x.code, x.groupName, x.deductionCode, x.count, x.total, x.inst]), [
    ["2", "", "", 1, 400, 100],                         // مرتب بر اساس کد پرسنلی عددی
    ["10", "لوازم خانگی", "801", 2, 2000 + 1000 + 3000, 200 + 250 + 750],
    ["10", "موبایل", "802", 1, 3000, 500],
  ]);
  assert.strictEqual(b.total, 3); assert.deepStrictEqual(b.sums, { total: 400 + 6000 + 3000, inst: 100 + 1200 + 500, count: 3, persons: 2 });
  // صفحه‌بندی: pageSize=25 پیش‌فرض و همهٔ ردیف‌ها در یک صفحه؛ page=2 خالی
  const r2 = await H.run(h, { query: { mode: "agg", status: "all", page: "2" } });
  assert.strictEqual(r2.body.rows.length, 0); assert.strictEqual(r2.body.total, 3);
};
