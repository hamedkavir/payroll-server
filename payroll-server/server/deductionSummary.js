// گزارش تجمیعی کسورات هر دوره (شاغلین + بازنشستگان) و جمع‌های مالی دوره
// هنگام وارد کردن فایل حقوق شاغلین/بازنشستگان یا فایل اقساط ساخته (بازسازی) می‌شود و برای گزارش مالی و داشبورد ذخیره می‌ماند.
// منطق اقلام کسر شاغلین دقیقاً مثل نمایش فیش (finalizeActive در کلاینت) است:
//   اقلام ستونی فایل + اقساط فایل وام (در صورت اختلاف جمع کسور) + «سایر کسور» برای باقی‌ماندهٔ توضیح‌داده‌نشده.
const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const nz = (v) => Math.round(num(v)) !== 0;
const parse = (v) => { if (typeof v === "string") { try { return JSON.parse(v); } catch (e) { return null; } } return v || null; };

function dedKey(it) { return it.code ? String(it.code) : "label:" + String(it.label || "").trim(); }

// اقلام کسر یک نفر
function dedItemsOf(kind, d, loansForCode) {
  const out = [];
  if (kind === "retiree") {
    // دادهٔ ذخیره‌شدهٔ بازنشستگان «ردیف خام» است: items[] با مبلغ منفی = کسر، مثبت = پرداخت (مثل computeRetireeRecord در کلاینت)
    if (Array.isArray(d.items)) {
      for (const x of d.items) if (num(x.v) < 0 && nz(x.v)) out.push({ code: x.code || "", label: x.label || "", v: -num(x.v), ref: x.series || "" });
    } else for (const x of d.ded || []) if (nz(x.v)) out.push({ code: x.code || "", label: x.label || "", v: num(x.v), ref: x.ref || "" });
    return out;
  }
  for (const x of d.dedBase || []) if (nz(x.v)) out.push({ code: x.code || "", label: x.label || "", v: num(x.v) });
  if (nz(d.dedDiff)) {
    let loanSum = 0;
    for (const l of loansForCode || []) { loanSum += num(l.v); if (nz(l.v)) out.push({ code: l.code || "", label: l.label || "", v: num(l.v), ref: l.seq || "" }); }
    const leftover = num(d.dedDiff) - loanSum;
    if (nz(leftover)) out.push({ code: "", label: "سایر کسور", v: leftover });
  }
  return out;
}
function totalsOf(kind, d) {
  if (kind === "retiree") {
    if (Array.isArray(d.items)) {
      let gross = 0, ded = 0;
      for (const x of d.items) { if (!nz(x.v)) continue; if (num(x.v) >= 0) gross += num(x.v); else ded += -num(x.v); }
      return { gross, ded, net: gross - ded, employer: 0 };
    }
    return { gross: num(d.gross), ded: num(d.ded_), net: num(d.net), employer: 0 };
  }
  const ded = num(d.dedBaseSum) + (nz(d.dedDiff) ? num(d.dedDiff) : 0);
  const net = d.fN != null ? num(d.fN) : num(d.gross) - ded;
  return { gross: num(d.gross), ded, net, employer: num(d.emp_) };
}

async function rebuildPeriod(conn, periodId) {
  const [[per]] = await conn.query("SELECT loans_data FROM periods WHERE id = ?", [periodId]);
  const loansAll = (per && parse(per.loans_data)) || {};
  const [rows] = await conn.query("SELECT kind, code, data FROM people WHERE period_id = ?", [periodId]);
  const agg = { active: new Map(), retiree: new Map() };
  const rem = { active: new Map(), retiree: new Map() };   // مجموع «مانده» هر کد (وام/سرمایه/مساعده ...) از فایل اقساط و ردیف‌های بازنشستگان
  const addRem = (kind, it) => { if (it && it.remaining != null && it.remaining !== "" && Number.isFinite(Number(it.remaining))) { const k = dedKey(it); rem[kind].set(k, (rem[kind].get(k) || 0) + Number(it.remaining)); } };
  const tot = { active: { n: 0, gross: 0, ded: 0, net: 0, employer: 0 }, retiree: { n: 0, gross: 0, ded: 0, net: 0, employer: 0 } };
  for (const r of rows) {
    const kind = r.kind === "retiree" ? "retiree" : "active";
    const d = parse(r.data); if (!d) continue;
    const t = totalsOf(kind, d), T = tot[kind];
    T.n++; T.gross += t.gross; T.ded += t.ded; T.net += t.net; T.employer += t.employer;
    if (kind === "active") { for (const l of loansAll[r.code] || []) addRem("active", l); for (const x of d.dedBase || []) addRem("active", x); }
    else for (const x of d.items || []) if (num(x.v) < 0) addRem("retiree", x);
    const seen = new Set();
    for (const it of dedItemsOf(kind, d, kind === "active" ? loansAll[r.code] : null)) {
      const k = dedKey(it);
      let a = agg[kind].get(k);
      if (!a) { a = { code: it.code, label: it.label, count: 0, total: 0 }; agg[kind].set(k, a); }
      a.total += it.v;
      if (!seen.has(k)) { seen.add(k); a.count++; }
    }
  }
  await conn.query("DELETE FROM deduction_summary WHERE period_id = ?", [periodId]);
  await conn.query("DELETE FROM period_totals WHERE period_id = ?", [periodId]);
  const vals = [];
  for (const kind of ["active", "retiree"]) for (const [k, a] of agg[kind]) vals.push([periodId, kind, k.slice(0, 220), String(a.code).slice(0, 30), String(a.label).slice(0, 200), a.count, Math.round(a.total * 100) / 100, rem[kind].has(k) ? Math.round(rem[kind].get(k) * 100) / 100 : null]);
  if (vals.length) await conn.query("INSERT INTO deduction_summary (period_id, kind, ded_key, code, label, people_count, total_amount, remaining_amount) VALUES ?", [vals]);
  const tv = ["active", "retiree"].filter((k) => tot[k].n > 0).map((k) => [periodId, k, tot[k].n, tot[k].gross, tot[k].ded, tot[k].net, tot[k].employer]);
  if (tv.length) await conn.query("INSERT INTO period_totals (period_id, kind, people_count, gross, deductions, net, employer) VALUES ?", [tv]);
  return { items: vals.length, people: rows.length };
}

// اگر برای دوره‌ای که فیش دارد هنوز خلاصه‌ای ساخته نشده (واردشده با نسخهٔ قدیمی)، یک‌بار می‌سازد
async function ensurePeriod(pool, periodId) {
  const [[c]] = await pool.query(
    `SELECT (SELECT COUNT(*) FROM period_totals WHERE period_id = ?) AS t,
            (SELECT COUNT(*) FROM people WHERE period_id = ?) AS p,
            (SELECT COUNT(*) FROM period_totals WHERE period_id = ? AND kind = 'retiree' AND people_count > 0 AND gross = 0 AND deductions = 0) AS stale`,
    [periodId, periodId, periodId]);
  // stale: خلاصهٔ بازنشستگانِ ساخته‌شده با نسخهٔ قبلی (جمع‌ها صفر) ← بازسازی
  if ((Number(c.t) === 0 && Number(c.p) > 0) || Number(c.stale) > 0) { await rebuildPeriod(pool, periodId); return true; }
  return false;
}

// پس‌زمینه، بعد از بالا آمدن سرور: دوره‌های قدیمی را یکی‌یکی می‌سازد (بدون مسدود کردن سرور)
function backfillAll(pool) {
  setTimeout(async () => {
    try {
      const [ps] = await pool.query("SELECT id, year, month FROM periods ORDER BY year DESC, month DESC");
      for (const p of ps) { if (await ensurePeriod(pool, p.id)) console.log(`گزارش تجمیعی کسورات ${p.year}/${p.month} ساخته شد.`); }
      // یک‌بار: ستون «مانده» (remaining_amount) برای دوره‌های قبلی هم بازسازی شود
      await pool.query("CREATE TABLE IF NOT EXISTS app_flags (k VARCHAR(60) PRIMARY KEY, v VARCHAR(40) NOT NULL DEFAULT '') ENGINE=InnoDB");
      const [[fl]] = await pool.query("SELECT COUNT(*) AS c FROM app_flags WHERE k = 'dedsum_remaining_v1'");
      if (!Number(fl.c)) {
        for (const p of ps) { try { await rebuildPeriod(pool, p.id); } catch (e) { console.error("بازسازی مانده کسورات", p.year + "/" + p.month, e.message); } }
        await pool.query("INSERT IGNORE INTO app_flags (k, v) VALUES ('dedsum_remaining_v1', '1')");
        console.log("ستون مانده در گزارش تجمیعی کسورات همهٔ دوره‌ها بازسازی شد.");
      }
    } catch (e) { console.error("ساخت گزارش تجمیعی کسورات دوره‌های قبل ممکن نشد:", e.message); }
  }, 3000);
}

module.exports = { rebuildPeriod, ensurePeriod, backfillAll, dedItemsOf, totalsOf };
