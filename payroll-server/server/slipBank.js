// حساب و شبا و نام بانک فیش:
//  • هنگام بارگذاری فایل فیش (شاغلین/بازنشستگان) مقدار آن لحظه در خود ردیف فیش (people.bank_*) ذخیره می‌شود (freezeBank)
//    تا با بازنشسته‌شدن یا به‌روزرسانی اطلاعات پرسنل، فیش‌های قبلی تغییر نکنند.
//  • فایل حقوق شاغلین ستون حساب/شبا ندارد؛ برای شاغلین مقدار «همان لحظه» از «پرسنل» گرفته می‌شود.
//    «حساب مساعده» هیچ‌وقت وارد فیش (حساب اصلی/شبا/بانک) نمی‌شود، چون ممکن است به نام فرد دیگری باشد.
//  • ردیف‌های بدون عکس‌فوری (یا با حساب خالی) مثل قبل از «پرسنل» می‌خوانند.
// فقط روی داده‌ای که به کلاینت داده می‌شود اعمال می‌شود؛ دادهٔ ذخیره‌شدهٔ فایل دست نمی‌خورد.
const toObj = (d) => { if (typeof d === "string") { try { return JSON.parse(d); } catch (e) { return null; } } return d || null; };

function apply(item, pn) {
  const d = toObj(item.data); if (!d) return item.data;
  const frozen = item.bank_frozen && String(item.bank_account || "").trim();
  const src = frozen
    ? { a: item.bank_account, s: item.shaba || "", b: item.bank_name || "" }
    : (pn ? { a: pn.bank_account, s: pn.shaba, b: pn.bank_name } : null);
  if (!src) return item.data;
  const put = (cur, v) => (frozen ? v : (v || cur));   // عکس‌فوری: همان مقدار (حتی شبای خالی)؛ بدون آن: فقط مقدار غیرخالی
  if (item.kind === "retiree") {
    if (src.a) d.account = src.a;
    d.shaba = put(d.shaba, src.s);
    if (src.b || frozen) d.bankName = put(d.bankName, src.b);
  } else {
    d.info = d.info || {};
    if (src.a) d.info.bank = src.a;
    d.info.shaba = put(d.info.shaba, src.s);
    if (src.b || frozen) d.info.bankName = put(d.info.bankName, src.b);
  }
  return d;
}

// items: [{ kind, code, data, bank_frozen, bank_account, shaba, bank_name }] ← data جایگزین می‌شود
async function applyBankList(q, items) {
  const need = items.filter((x) => !(x.bank_frozen && String(x.bank_account || "").trim()));
  const codes = [...new Set(need.map((x) => String(x.code == null ? "" : x.code)).filter(Boolean))];
  const map = new Map();
  for (let i = 0; i < codes.length; i += 1000) {
    const [rows] = await q.query("SELECT code, bank_account, shaba, bank_name FROM personnel WHERE code IN (?)", [codes.slice(i, i + 1000)]);
    rows.forEach((r) => map.set(String(r.code), r));
  }
  for (const it of items) it.data = apply(it, map.get(String(it.code)));
  return items;
}

// عکس‌فوری حساب/شبا/بانک در ردیف‌های فیش. kind: "active" | "retiree" | undefined (هر دو)؛ periodId: undefined = همهٔ دوره‌ها
const J = (k) => `NULLIF(NULLIF(JSON_UNQUOTE(JSON_EXTRACT(p.data, '$.${k}')), ''), 'null')`;
async function freezeBank(q, { periodId, kind } = {}) {
  const where = [], vals = [];
  if (periodId != null) { where.push("p.period_id = ?"); vals.push(periodId); }
  const run = async (k) => {
    const set = k === "retiree"
      ? `p.bank_account = COALESCE(${J("account")}, NULLIF(n.bank_account, ''), ''),
         p.shaba = COALESCE(${J("shaba")}, NULLIF(n.shaba, ''), ''),
         p.bank_name = 'صادرات'`
      // شاغلین: حساب/شبا/بانک جاریِ پرسنل (بدون جایگزینی با حساب مساعده)
      : `p.bank_account = COALESCE(NULLIF(n.bank_account, ''), ''),
         p.shaba = COALESCE(NULLIF(n.shaba, ''), ''),
         p.bank_name = COALESCE(NULLIF(n.bank_name, ''), '')`;
    await q.query(`UPDATE people p LEFT JOIN personnel n ON n.code = p.code SET ${set}, p.bank_frozen = 1 WHERE ${[...where, "p.kind = ?"].join(" AND ")}`, [...vals, k]);
  };
  if (!kind || kind === "active") await run("active");
  if (!kind || kind === "retiree") await run("retiree");
}

module.exports = { applyBankList, applyBankToData: apply, freezeBank };
