// صفحه‌بندی سمت سرور برای فهرست‌های «همهٔ افراد» (مساعده، امداد، تغییرات ماهانه)
// query: page (از ۱)، pageSize (۲۵/۵۰/۱۰۰/۲۰۰/۵۰۰؛ پیش‌فرض ۵۰)، all=1 (برای خروجی اکسل و عملیات دسته‌جمعی؛ حداکثر ۲۰٬۰۰۰ ردیف)
const SIZES = [25, 50, 100, 200, 500];
const ALL_CAP = 20000;
function pageParams(q) {
  const all = String(q.all || "") === "1";
  const size = SIZES.includes(parseInt(q.pageSize, 10)) ? parseInt(q.pageSize, 10) : 50;
  const page = Math.max(1, parseInt(q.page, 10) || 1);
  return { all, size, page, offset: (page - 1) * size };
}
// آرگومان‌های LIMIT/OFFSET: [sql, params]
const limitSql = (pg) => (pg.all ? [`LIMIT ${ALL_CAP}`, []] : ["LIMIT ? OFFSET ?", [pg.size, pg.offset]]);
const pageMeta = (pg, total) => ({ total, page: pg.all ? 1 : pg.page, pageSize: pg.all ? total : pg.size, pages: pg.all ? 1 : Math.max(1, Math.ceil(total / pg.size)) });
module.exports = { pageParams, limitSql, pageMeta, SIZES };
