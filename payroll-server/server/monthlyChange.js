// ساخت ردیف «تغییرات ماهانهٔ کسورات» از کدهای دیگر (افزایش سرمایه، عضویت، لغو عضویت، ...)
// action: 1 ایجاد، 2 اصلاح، 3 حذف
async function insertChange(conn, o) {
  const [nm] = await conn.query("SELECT name FROM deduction_codes WHERE code = ? ORDER BY emp_status LIMIT 1", [o.dcode]);
  const [r] = await conn.query(
    "INSERT INTO monthly_changes (code, change_date, deduction_code, deduction_name, total_amount, installment_amount, remaining, action, closed, notes, created_by) VALUES (?,?,?,?,?,?,?,?,0,?,?)",
    [o.code, o.date, o.dcode, nm.length ? nm[0].name : "", o.total == null ? null : o.total, o.inst == null ? null : o.inst, o.rem == null ? null : o.rem, o.action, String(o.notes || "").slice(0, 500), o.by || ""]);
  return r.insertId;
}
module.exports = { insertChange };
