// تست «گزارش کسور اقساط» (GET /api/reports/deduction-people) فقط با دیتابیس ساختگی
const assert = require("assert");
const H = require("./helpers");

const handler = () => {
  const before = H.routers.length; H.load("routes/reports.js");
  const r = H.routers.slice(before).find((x) => x.handlers["GET /deduction-people"]);
  return r.handlers["GET /deduction-people"];
};
const A = { dedBase: [{ code: "733", label: "قسط وام", v: 300 }], dedBaseSum: 300, dedDiff: 0 };
const mockPool = (log) => ({
  async query(sql, p) {
    sql = String(sql).replace(/\s+/g, " ").trim(); log && log.push([sql, p]);
    if (/FROM periods/.test(sql)) {
      const [a, b] = p; const all = [{ id: 7, year: 1405, month: 7, loans_data: { "101": [{ code: "733", label: "قسط وام", v: 500, seq: "12" }] } }, { id: 8, year: 1405, month: 8, loans_data: null }];
      return [all.filter((x) => { const i = x.year * 12 + x.month - 1; return i >= a && i <= b; })];
    }
    if (/FROM people/.test(sql)) {
      if (p[0] === 7) return [[
        { kind: "active", code: "101", name: "علی رضایی", national_id: "", data: { dedBase: [{ code: "700", label: "بیمه", v: 100 }], dedBaseSum: 100, dedDiff: 600 } },
        { kind: "active", code: "102", name: "رضا احمدی", national_id: "2", data: A },
        { kind: "retiree", code: "900", name: "مریم کریمی", national_id: "3", data: { items: [{ code: "733", label: "قسط وام", v: -250, series: "5" }, { code: "10", label: "حقوق", v: 5000 }] } }]];
      return [[{ kind: "active", code: "102", name: "رضا احمدی", national_id: "2", data: A }]];
    }
    if (/FROM personnel/.test(sql)) return [[{ code: "102", first_name: "رضا", last_name: "احمدی", national_id: "2" }]];
    return [[]];
  },
});
const q = (o) => Object.assign({ fy: "1405", fm: "7", ty: "1405", tm: "8", code: "733" }, o);

exports["کسور اقساط: شاغل و بازنشسته جدا؛ جمع هر نفر در چند ماه؛ اقساط فایل وام و سری/ردیف"] = async () => {
  H.setPool(mockPool());
  const r = await H.run(handler(), { query: q() });
  assert.strictEqual(r.status, 200, JSON.stringify(r.body));
  const b = r.body;
  assert.deepStrictEqual(b.periods, ["1405/07", "1405/08"]);
  assert.strictEqual(b.active.count, 2);
  const p101 = b.active.people.find((x) => x.code === "101"), p102 = b.active.people.find((x) => x.code === "102");
  assert.strictEqual(p101.total, 500); assert.strictEqual(p101.months[0].ref, "12");   // سری قسط وام
  assert.strictEqual(p102.total, 600); assert.strictEqual(p102.months.length, 2);
  assert.strictEqual(b.active.total, 1100);
  assert.strictEqual(b.retiree.count, 1); assert.strictEqual(b.retiree.people[0].total, 250); assert.strictEqual(b.retiree.people[0].months[0].ref, "5");
  assert.ok(!b.active.people.some((x) => x.code === "900"), "بازنشسته در شاغلین نیاید");
};

exports["کسور اقساط: نام، نام خانوادگی و کد ملی (از پرسنل؛ در غیاب آن از نام کامل فیش)"] = async () => {
  H.setPool(mockPool());
  const b = (await H.run(handler(), { query: q() })).body;
  const p102 = b.active.people.find((x) => x.code === "102"), p101 = b.active.people.find((x) => x.code === "101");
  assert.strictEqual(p102.firstName, "رضا"); assert.strictEqual(p102.lastName, "احمدی"); assert.strictEqual(p102.nationalId, "2");
  assert.strictEqual(p101.firstName, "علی"); assert.strictEqual(p101.lastName, "رضایی");
};

exports["کسور اقساط: بازهٔ یک دوره، ارقام فارسی، کد دیگر خالی"] = async () => {
  H.setPool(mockPool());
  const r = await H.run(handler(), { query: q({ fy: "۱۴۰۵", fm: "۷", ty: "۱۴۰۵", tm: "۷", code: "۷۳۳" }) });
  assert.deepStrictEqual(r.body.periods, ["1405/07"]); assert.strictEqual(r.body.active.count, 2);
  const r2 = await H.run(handler(), { query: q({ code: "999" }) });
  assert.strictEqual(r2.body.active.count, 0); assert.strictEqual(r2.body.retiree.count, 0);
};

exports["کسور اقساط: ورودی نامعتبر ۴۰۰ می‌دهد و به دیتابیس نمی‌رود"] = async () => {
  const log = []; H.setPool(mockPool(log));
  for (const o of [{ fm: "13" }, { fy: "" }, { fy: "1405", fm: "9", ty: "1405", tm: "8" }, { code: "" }, { fy: "1400", fm: "1", ty: "1405", tm: "12" }]) {
    const r = await H.run(handler(), { query: q(o) });
    assert.strictEqual(r.status, 400, JSON.stringify(o));
  }
  assert.ok(!log.length);
};

exports["کسور اقساط: ردیف/سریِ تکراریِ یک کد در یک ماه، رکورد جدا (records) و جمع ماه حفظ می‌شود"] = async () => {
  H.setPool({ async query(sql, p) {
    sql = String(sql).replace(/\s+/g, " ");
    if (/FROM periods WHERE/.test(sql)) return [[{ id: 7, year: 1405, month: 7, loans_data: { "101": [{ code: "733", label: "قسط وام", v: 500, seq: "12" }, { code: "733", label: "قسط وام", v: 300, seq: "13" }] } }]];
    if (/FROM people WHERE/.test(sql)) return [[{ kind: "active", code: "101", name: "علی رضایی", national_id: "", data: { dedBase: [], dedBaseSum: 0, dedDiff: 800 } }]];
    if (/FROM personnel/.test(sql)) return [[]];
    return [[]]; } });
  const r = await H.run(handler(), { query: q({ tm: "7" }) });
  assert.strictEqual(r.status, 200, JSON.stringify(r.body));
  const p = r.body.active.people[0];
  assert.strictEqual(p.total, 800); assert.strictEqual(p.months.length, 1); assert.strictEqual(p.months[0].amount, 800); assert.strictEqual(p.months[0].ref, "12، 13");
  assert.deepStrictEqual(p.records.map((x) => [x.ref, x.amount]), [["12", 500], ["13", 300]]);
};
