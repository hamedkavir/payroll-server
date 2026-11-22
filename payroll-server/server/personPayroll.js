// فیش‌های یک فرد (آخرین دوره‌ها) — سریع و کم‌حجم
// قبلاً: همهٔ ردیف‌های people همراه با ستون‌های JSON حجیم (data و loans_data کل دوره) خوانده و در Node مرتب می‌شد.
// حالا: ۱) فقط شناسهٔ دوره‌ها (سبک، با ایندکس idx_people_code) ۲) data فقط برای N دورهٔ آخر ۳) وام‌های فرد با JSON_EXTRACT
// (نه کل loans_data یک دوره). مرتب‌سازی در Node می‌ماند (ORDER BY روی ستون حجیم خطای sort memory می‌داد).
const { applyBankToData } = require("./slipBank");
async function personPayroll(q, code, limit) {
  code = String(code == null ? "" : code);
  const [idx] = await q.query(
    "SELECT pe.id, pe.period_id, pe.kind, pr.year, pr.month, pr.issue_date FROM people pe JOIN periods pr ON pr.id = pe.period_id WHERE pe.code = ?", [code]);
  idx.sort((a, b) => b.year - a.year || b.month - a.month);
  const top = idx.slice(0, Math.max(1, limit || 1));
  if (!top.length) return [];
  const [rows] = await q.query(`SELECT id, data, bank_account, shaba, bank_name, bank_frozen FROM people WHERE id IN (${top.map(() => "?").join(",")})`, top.map((r) => r.id));
  let pn = null;
  try { const [pr] = await q.query("SELECT bank_account, shaba, bank_name FROM personnel WHERE code = ?", [code]); pn = pr[0] || null; } catch (e) { /* ignore */ }
  const kindOf = new Map(top.map((r) => [r.id, r.kind]));
  const dmap = new Map(rows.map((r) => [r.id, applyBankToData({ kind: kindOf.get(r.id), data: r.data, bank_account: r.bank_account, shaba: r.shaba, bank_name: r.bank_name, bank_frozen: r.bank_frozen }, pn)]));
  const act = top.filter((r) => r.kind === "active");
  const lmap = new Map();
  if (act.length) {
    const ids = [...new Set(act.map((r) => r.period_id))];
    try {
      const path = '$."' + code.replace(/(["\\])/g, "\\$1") + '"';
      const [ls] = await q.query(`SELECT id, JSON_EXTRACT(loans_data, ?) AS l FROM periods WHERE id IN (${ids.map(() => "?").join(",")})`, [path, ...ids]);
      for (const r of ls) {
        let v = r.l;
        if (typeof v === "string") { try { v = JSON.parse(v); } catch (e) { v = null; } }
        lmap.set(r.id, Array.isArray(v) ? v : []);
      }
    } catch (e) {   // سرور بدون JSON_EXTRACT: روش قدیمی (فقط برای دوره‌های همین فرد)
      const [ls] = await q.query(`SELECT id, loans_data FROM periods WHERE id IN (${ids.map(() => "?").join(",")})`, ids);
      for (const r of ls) {
        let v = r.loans_data; if (typeof v === "string") { try { v = JSON.parse(v); } catch (e2) { v = null; } }
        lmap.set(r.id, (v && v[code]) || []);
      }
    }
  }
  return top.map((r) => ({ periodId: r.period_id, kind: r.kind, year: r.year, month: r.month, issueDate: r.issue_date || "", data: dmap.get(r.id), loans: r.kind === "active" ? (lmap.get(r.period_id) || []) : [] }));
}
module.exports = { personPayroll };
