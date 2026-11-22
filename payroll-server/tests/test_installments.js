// حساب اقساط (server/installments.js) — نسخهٔ ۱۲۰، بند ۴۰ PLAN.md
// planInst / lastOf از routes/extrasCommon.js به یک ماژول خالص منتقل شدند و routes/emdad.js نسخهٔ تکراری lastOf را کنار گذاشت.
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const H = require("./helpers");

const SRV = H.SRV;
const inst = () => require(path.join(SRV, "installments.js"));

exports["اقساط/planInst: نمونه‌های مستند (رند به بالا تا مضرب گام، قسط آخر = مابه‌التفاوت، تعداد مؤثر کمتر)"] = async () => {
  const { planInst } = inst();
  assert.deepStrictEqual(planInst(10e6, 6), { inst: 2e6, last: 2e6, n: 5 });         // ۱۰ میلیون در ۶ قسط ← ۵ قسط ۲ میلیونی
  assert.deepStrictEqual(planInst(12.5e6, 4), { inst: 4e6, last: 500000, n: 4 });
  assert.deepStrictEqual(planInst(3e6, 3), { inst: 1e6, last: 1e6, n: 3 });
  assert.deepStrictEqual(planInst(500000, 6), { inst: 1e6, last: 500000, n: 1 });    // کمتر از یک گام ← یک قسط
  assert.deepStrictEqual(planInst(1000, 3, 1), { inst: 333, last: 334, n: 3 });       // گام ۱ = بدون رند
  assert.deepStrictEqual(planInst(9e6, 2, 5e6), { inst: 5e6, last: 4e6, n: 2 });      // گام دلخواه (تنظیمات گرد کردن)
};

exports["اقساط/planInst: ورودی‌های مرزی (صفر، منفی، یک قسط، تعداد نامعتبر یا رشته‌ای، مبلغ اعشاری)"] = async () => {
  const { planInst } = inst();
  assert.deepStrictEqual(planInst(0, 6), { inst: 0, last: 0, n: 1 });
  assert.deepStrictEqual(planInst(-5, 3), { inst: 0, last: 0, n: 1 });
  assert.deepStrictEqual(planInst(5e6, 1), { inst: 5e6, last: 5e6, n: 1 });
  assert.deepStrictEqual(planInst(3e6, "3"), { inst: 1e6, last: 1e6, n: 3 });
  assert.deepStrictEqual(planInst(3e6, "x"), { inst: 3e6, last: 3e6, n: 1 });
  assert.deepStrictEqual(planInst(3e6, 0), { inst: 3e6, last: 3e6, n: 1 });
  assert.deepStrictEqual(planInst(1000000.4, 1), { inst: 1e6, last: 1e6, n: 1 });
};

exports["اقساط/planInst: برای هر مبلغ/تعداد/گام جمع اقساط دقیقاً برابر مبلغ است و قسط آخر منفی نمی‌شود"] = async () => {
  const { planInst } = inst();
  const amounts = [1, 999, 1000, 250000, 1e6, 1e6 + 1, 3000001, 7.3e6, 10e6, 12345678, 99999999];
  for (const rem of amounts) for (const n of [1, 2, 3, 4, 6, 7, 12, 36]) for (const step of [1, 1000, 1e6, 5e6]) {
    const p = planInst(rem, n, step), tag = JSON.stringify({ rem, n, step, p });
    assert.strictEqual(p.inst * (p.n - 1) + p.last, rem, tag);
    assert.ok(p.n >= 1 && p.n <= n, tag);
    assert.ok(p.last >= 0, tag);
    if (step > 1 && p.n > 1) assert.strictEqual(p.inst % step, 0, tag);
  }
};

exports["اقساط/lastOf: قسط آخر بدهی با قسط ثابت (کم‌شدن تعداد مؤثر، باقی‌مانده در قسط آخر، قسط نامعتبر)"] = async () => {
  const { lastOf } = inst();
  assert.strictEqual(lastOf(10e6, 2e6, 6), 2e6);     // ۵ قسط کافی است
  assert.strictEqual(lastOf(10e6, 3e6, 4), 1e6);
  assert.strictEqual(lastOf(10e6, 1e6, 5), 6e6);     // قسط‌ها کافی نیست ← باقی‌مانده در قسط آخر
  assert.strictEqual(lastOf(5e6, 2e6, 0), 5e6);      // تعداد کمتر از ۱ ← یک قسط
  assert.strictEqual(lastOf(1000.6, 400, 3), 201);   // مبلغ به ریال صحیح گرد می‌شود
  assert.strictEqual(lastOf(10e6, 0, 5), 10e6);      // قسط تعیین‌نشده ← کل مبلغ
  assert.strictEqual(lastOf(10e6, NaN, 5), 10e6);
  assert.strictEqual(lastOf(-3, 0, 5), 0);
};

exports["اقساط: extrasCommon همان توابع را صادر می‌کند و emdad دیگر نسخهٔ تکراری lastOf ندارد"] = async () => {
  const I = inst();
  const common = require(path.join(SRV, "routes", "extrasCommon.js"));
  assert.strictEqual(common.planInst, I.planInst);
  assert.strictEqual(common.lastOf, I.lastOf);
  const read = (rel) => fs.readFileSync(path.join(SRV, rel), "utf8");
  for (const rel of ["routes/emdad.js", "routes/extrasCommon.js"]) {
    const src = read(rel);
    assert.ok(!/(const|let|var)\s+lastOf\s*=|function\s+lastOf\b|function\s+planInst\b/.test(src), `${rel}: تعریف محلی تکراری`);
    assert.ok(/require\("\.\.\/installments"\)/.test(src), `${rel}: باید از server/installments.js بخواند`);
  }
  // ماژول خالص است: به Express، دیتابیس یا مسیرها وابسته نیست
  const own = read("installments.js");
  assert.deepStrictEqual([...own.matchAll(/require\("([^"]+)"\)/g)].map((m) => m[1]), ["./rounding"]);
};
