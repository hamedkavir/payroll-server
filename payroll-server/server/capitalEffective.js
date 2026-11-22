// «سرمایهٔ جدید» بعد از ثبت افزایش سرمایه، تا وقتی که فیش حقوقیِ ماهِ اعمال‌شده ساخته نشده، به‌جای سرمایهٔ آخرین فیش
// در صفحهٔ پرسنلی، ثبت وام و نوبت‌دهی استفاده می‌شود.
// slipYm = سال*12+ماه آخرین فیش فرد؛ رکورد تا وقتی apply_ym > slipYm است «در انتظار فیش» حساب می‌شود.
async function pendingCapital(q, code, slipYm, excludeId = 0) {
  try {
    const [r] = await q.query(
      "SELECT id, new_capital, apply_ym FROM capital_increases WHERE code = ? AND kind = 1 AND new_capital IS NOT NULL AND apply_ym > ? AND id <> ? ORDER BY pay_date DESC, id DESC LIMIT 1",
      [String(code), Number(slipYm) || 0, Number(excludeId) || 0]);
    return r.length ? { id: r[0].id, newCapital: Math.round(Number(r[0].new_capital)), applyYm: Number(r[0].apply_ym) } : null;
  } catch (e) { return null; }
}
module.exports = { pendingCapital };
