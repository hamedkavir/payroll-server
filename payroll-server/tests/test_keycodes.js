// کدهای مهم شاغلین / بازنشستگان جدا + شرح کسر جدا در گزارش تجمیعی؛ فقط با دیتابیس ساختگی
const assert = require("assert");
const H = require("./helpers");
const K = require(require("path").join(H.SRV, "keyCodes.js"));

const full = (o) => Object.assign({ loan1: "710", loan2: "", capital: "796", advance: "733", vcapital: "", vloan: "", extra: [] }, o);

exports["کدهای مهم: بازنشسته کد جدا دارد، خالی ← کد شاغل (kcFor)"] = () => {
  const kc = K.mergeKeyCodes(full({ rloan1: "705", rcapital: "" }));
  assert.strictEqual(K.kcFor(kc, "active").loan1, "710");
  const r = K.kcFor(kc, "retiree");
  assert.strictEqual(r.loan1, "705"); assert.strictEqual(r.capital, "796"); assert.strictEqual(r.advance, "733");   // کدهای مشترک
  assert.strictEqual(kc.rloan1, "705"); assert.strictEqual(kc.rcapital, "");
};
exports["کدهای مهم: ذخیره — یک کد می‌تواند در دو گروه مشترک باشد؛ تکرار داخل یک گروه رد می‌شود"] = () => {
  const ok = K.cleanKeyCodes(full({ rloan1: "710", rcapital: "796", radvance: "733", rvcapital: "705" }));   // همان کدها برای بازنشسته هم
  assert.strictEqual(ok.rcapital, "796");
  assert.throws(() => K.cleanKeyCodes(full({ rloan1: "796" })), /بازنشستگان/);      // وام و سرمایهٔ بازنشستگان هر دو ۷۹۶
  assert.throws(() => K.cleanKeyCodes(full({ loan1: "796" })), /شاغلین/);
  assert.throws(() => K.cleanKeyCodes(full({ rloan1: "7 0 5!" })), /را وارد کنید/);
};
exports["کدهای مهم: ارقام فارسی در کد بازنشستگان پذیرفته می‌شود"] = () => {
  assert.strictEqual(K.cleanKeyCodes(full({ rvcapital: "۷۰۵" })).rvcapital, "705");
};

// ---- گزارش تجمیعی: شرح هر گروه
const handler = () => { const before = H.routers.length; H.load("routes/reports.js"); const r = H.routers.slice(before).find((x) => x.handlers["GET /deductions"]); return r.handlers["GET /deductions"]; };
const pool = (rowsCur, rowsPrev) => ({ async query(sql, p) {
  sql = String(sql).replace(/\s+/g, " ");
  if (/FROM periods WHERE year = \? AND month = \?/.test(sql)) return [[{ id: 7, year: 1405, month: 7, issue_date: "", active_file: "", retiree_file: "", loan_file: "" }]];
  if (/FROM periods WHERE \(year < \?/.test(sql)) return [[{ id: 6, year: 1405, month: 6 }]];
  if (/SELECT \(SELECT COUNT\(\*\) FROM period_totals/.test(sql)) return [[{ t: 2, p: 2, stale: 0 }]];
  if (/FROM deduction_summary WHERE period_id/.test(sql)) return [p[0] === 7 ? rowsCur : rowsPrev];
  if (/FROM period_totals WHERE period_id/.test(sql)) return [[{ kind: "active", people_count: 1, gross: 10, deductions: 3, net: 7, employer: 0 }, { kind: "retiree", people_count: 1, gross: 5, deductions: 2, net: 3, employer: 0 }]];
  throw new Error("SQL ناشناخته: " + sql); } });
const R = (kind, key, code, label, n, t) => ({ kind, ded_key: key, code, label, people_count: n, total_amount: t });

exports["گزارش تجمیعی: کد مشترک با شرح متفاوت ← ردیف جدا برای هر گروه با شرح خودش"] = async () => {
  H.setPool(pool([R("active", "710", "710", "وام ضروری", 3, 300), R("retiree", "710", "710", "بیمه تکمیلی", 2, 80), R("active", "733", "733", "مساعده", 1, 50), R("retiree", "733", "733", "مساعده", 1, 20)], [R("retiree", "710", "710", "بیمه تکمیلی", 2, 70)]));
  const r = await H.run(handler(), { query: { year: "1405", month: "7" } });
  assert.strictEqual(r.status, 200, JSON.stringify(r.body));
  const rows710 = r.body.items.filter((x) => x.code === "710");
  assert.strictEqual(rows710.length, 2);                                          // دو ردیف جدا
  const a = rows710.find((x) => x.activeTotal), b = rows710.find((x) => x.retireeTotal);
  assert.strictEqual(a.activeLabel, "وام ضروری"); assert.strictEqual(a.retireeTotal, 0);
  assert.strictEqual(b.retireeLabel, "بیمه تکمیلی"); assert.strictEqual(b.activeTotal, 0); assert.strictEqual(b.prevRetiree, 70);   // مقایسه با ماه قبل هم در همان ردیف
  const m = r.body.items.filter((x) => x.code === "733");
  assert.strictEqual(m.length, 1); assert.strictEqual(m[0].activeTotal, 50); assert.strictEqual(m[0].retireeTotal, 20);   // شرح یکسان ← یک ردیف مشترک
  assert.strictEqual(m[0].activeLabel, "مساعده"); assert.strictEqual(m[0].retireeLabel, "مساعده");
};

exports["کدهای مهم اضافی: جدا برای شاغلین (extra) و بازنشستگان (rextra)؛ تکرار فقط داخل یک گروه رد می‌شود"] = () => {
  const ok = K.cleanKeyCodes(full({ extra: [{ label: "وام اضطراری", code: "720" }], rextra: [{ label: "وام اضطراری بازنشسته", code: "720" }, { label: "کمک", code: "722" }] }));
  assert.strictEqual(ok.extra.length, 1); assert.strictEqual(ok.rextra.length, 2);         // ۷۲۰ می‌تواند در هر دو گروه باشد
  assert.throws(() => K.cleanKeyCodes(full({ rextra: [{ label: "الف", code: "722" }, { label: "ب", code: "722" }] })), /بازنشستگان/);
  assert.throws(() => K.cleanKeyCodes(full({ extra: [{ label: "الف", code: "796" }] })), /شاغلین/);                 // با کد سرمایهٔ شاغلین یکی است
  assert.throws(() => K.cleanKeyCodes(full({ rextra: [{ label: "", code: "722" }] })), /عنوان/);
  const m = K.mergeKeyCodes({ ...full({}), rextra: [{ label: "کمک", code: "722" }] });
  assert.strictEqual(m.rextra[0].code, "722"); assert.deepStrictEqual(K.mergeKeyCodes(full({})).rextra, []);
};
