// نمایهٔ حافظه‌ای پرسنل برای جست‌وجوی فوری (بدون اسکن SQL با ده‌ها REPLACE تو در تو)
// کلید جست‌وجو هر فرد با همان نقشهٔ normalizeSearch ساخته می‌شود (ی/ي، ک/ك، ارقام، نیم‌فاصله، اعراب).
// اعتبار: هر درخواست نوشتن (POST/PUT/PATCH/DELETE) نمایه را باطل می‌کند؛ علاوه بر آن هر ۲ ثانیه با COUNT/MAX(updated_at) و حداکثر هر ۶۰ ثانیه بازسازی می‌شود.
const { normalizeSearch } = require("./textNormalize");
const collator = new Intl.Collator("fa");
let cache = null, checkedAt = 0, dirty = true;

function invalidate() { dirty = true; checkedAt = 0; }

async function build(pool) {
  const [rows] = await pool.query("SELECT id, code, first_name, last_name, national_id, job_title, workplace, workplace_code, mobile, bank_account, advance_account, shaba, status, gender, updated_at FROM personnel");
  let decSet = new Set();
  try { const [dr] = await pool.query("SELECT DISTINCT code FROM deceased"); decSet = new Set(dr.map((d) => String(d.code))); } catch (e) { /* جدول درگذشتگان هنوز نیست */ }
  const items = rows.map((r) => {
    const f = r.first_name || "", l = r.last_name || "";
    return {
      key: normalizeSearch([r.code, r.national_id, f + l, l + f].map((x) => (x == null ? "" : x)).join("|")),
      acc: normalizeSearch([r.bank_account, r.advance_account, r.shaba].map((x) => (x == null ? "" : x)).join("|")),
      mob: normalizeSearch(r.mobile == null ? "" : r.mobile).replace(/^0+/, ""),
      wp: normalizeSearch([r.workplace, r.workplace_code].map((x) => (x == null ? "" : x)).join("|")),
      out: { id: r.id, code: r.code, firstName: r.first_name, lastName: r.last_name, nationalId: r.national_id, jobTitle: r.job_title, workplace: r.workplace, gender: r.gender, mobile: r.mobile, bankAccount: r.bank_account, shaba: r.shaba, deceased: decSet.has(String(r.code)), status: r.status, updatedAt: r.updated_at },
    };
  });
  items.sort((a, b) => collator.compare(a.out.lastName || "", b.out.lastName || "") || collator.compare(a.out.firstName || "", b.out.firstName || ""));
  return items;
}

async function getIndex(pool) {
  const now = Date.now();
  if (cache && !dirty && now - checkedAt < 2000) return cache.items;
  const [[v]] = await pool.query("SELECT COUNT(*) AS c, MAX(updated_at) AS m FROM personnel");
  const ver = `${v.c}|${v.m ? new Date(v.m).getTime() : 0}`;
  checkedAt = now;
  if (cache && !dirty && cache.ver === ver && now - cache.at < 60000) return cache.items;
  const items = await build(pool);
  cache = { items, ver, at: now };
  dirty = false;
  return items;
}

// { q, status, page, pageSize } → { total, items }
// by: "" = کد/نام/کد ملی (پیش‌فرض)، "account" = حساب/شبا، "mobile" = تلفن همراه، "workplace" = محل خدمت، "all" = همه
async function searchPersonnel(pool, { q, status, by, page, pageSize }) {
  const all = await getIndex(pool);
  const nq = q ? normalizeSearch(q) : "";
  let list = all;
  if (nq) {
    if (by === "account") list = list.filter((x) => x.acc.includes(nq));
    else if (by === "mobile") { const m = nq.replace(/^0+/, ""); list = m ? list.filter((x) => x.mob.includes(m)) : list; }   // صفر اول موبایل در دیتا و جست‌وجو نادیده گرفته می‌شود
    else if (by === "workplace") list = list.filter((x) => x.wp.includes(nq));
    else if (by === "all") list = list.filter((x) => x.key.includes(nq) || x.acc.includes(nq) || x.wp.includes(nq) || x.mob.includes(nq.replace(/^0+/, "") || "\u0000"));
    else list = list.filter((x) => x.key.includes(nq));
  }
  if (status) list = list.filter((x) => x.out.status === status);
  const total = list.length;
  return { total, items: list.slice((page - 1) * pageSize, page * pageSize).map((x) => x.out) };
}
module.exports = { searchPersonnel, invalidate };
