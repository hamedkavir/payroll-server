// تاریخچهٔ تغییر وضعیت پرسنل بر اساس سال و ماه شمسی
// - تغییرهای ثبت‌شده هنگام وارد کردن فایل‌های حقوق، به «ماه دورهٔ حقوقی» همان فایل نسبت داده می‌شوند.
// - تغییرهای دستی و «ثبت از فایل پرسنل» دورهٔ حقوقی ندارند؛ آن‌ها بر اساس تاریخ ثبت (به شمسی) در ماه می‌افتند.
const express = require("express");
const { sendError, isBusinessError } = require("../errors");
const router = express.Router();
const pool = require("../db");
const J = require("../jalali");
const { normalizeSearch } = require("../textNormalize");

const BASE = `SELECT l.id, l.code, l.old_status, l.new_status, l.changed_at, l.period_id, l.reason, l.note,
                     p.first_name, p.last_name, p.national_id, p.status AS current_status
              FROM personnel_status_log l LEFT JOIN personnel p ON p.code = l.code`;
const dt = (y, m, d) => `${y}-${J.pad2(m)}-${J.pad2(d)} 00:00:00`;

// GET /api/status-history/months -> ماه‌هایی که تغییر وضعیت دارند (برای پیشنهاد در فهرست)
router.get("/months", async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT pr.year, pr.month, COUNT(*) AS c FROM personnel_status_log l
       JOIN periods pr ON pr.id = l.period_id GROUP BY pr.year, pr.month`);
    res.json({ items: rows.map((r) => ({ year: r.year, month: r.month, count: Number(r.c) })) });
  } catch (err) { sendError(res, err); }
});

// GET /api/status-history?year=1405&month=6&kind=all|changed|new&oldStatus=&newStatus=&q=
router.get("/", async (req, res) => {
  const year = parseInt(req.query.year, 10), month = parseInt(req.query.month, 10);
  if (!(year >= 1300 && year <= 1600) || !(month >= 1 && month <= 12)) {
    return res.status(400).json({ error: "invalid_input", message: "سال و ماه معتبر انتخاب کنید." });
  }
  const kind = String(req.query.kind || "all");
  const oldStatus = String(req.query.oldStatus || "").trim();
  const newStatus = String(req.query.newStatus || "").trim();
  const q = normalizeSearch(String(req.query.q || ""));
  try {
    const [pers] = await pool.query("SELECT id FROM periods WHERE year = ? AND month = ?", [year, month]);
    const ids = pers.map((p) => p.id);
    let rows = [];
    if (ids.length) { const [r] = await pool.query(`${BASE} WHERE l.period_id IN (?)`, [ids]); rows = rows.concat(r); }
    const g1 = J.toGregorian(year, month, 1);
    const nx = month === 12 ? { y: year + 1, m: 1 } : { y: year, m: month + 1 };
    const g2 = J.toGregorian(nx.y, nx.m, 1);
    const [r2] = await pool.query(`${BASE} WHERE l.period_id IS NULL AND l.changed_at >= ? AND l.changed_at < ?`,
      [dt(g1.y, g1.m, g1.d), dt(g2.y, g2.m, g2.d)]);
    rows = rows.concat(r2);

    const items = rows.map((r) => ({
      id: r.id, code: r.code,
      name: [r.first_name, r.last_name].filter(Boolean).join(" "),
      nationalId: r.national_id || "",
      oldStatus: r.old_status || "", newStatus: r.new_status || "",
      currentStatus: r.current_status || "",
      reason: r.reason || "", note: r.note || "",
      changedAt: J.dateTimeFa(r.changed_at),
      ts: new Date(r.changed_at).getTime() || 0,
      source: r.period_id ? "دورهٔ حقوقی" : (r.reason === "ثبت از فایل پرسنل" ? "فایل پرسنل" : "دستی"),
    })).filter((x) => {
      if (kind === "changed" && !x.oldStatus) return false;
      if (kind === "new" && x.oldStatus) return false;
      if (oldStatus && x.oldStatus !== oldStatus) return false;
      if (newStatus && x.newStatus !== newStatus) return false;
      if (q && !normalizeSearch([x.code, x.nationalId, x.name].join("|")).includes(q)) return false;
      return true;
    });
    items.sort((a, b) => b.ts - a.ts || b.id - a.id);
    items.forEach((x) => { delete x.ts; });

    const tr = new Map();
    for (const x of items) { const k = `${x.oldStatus}→${x.newStatus}`; tr.set(k, (tr.get(k) || 0) + 1); }
    const transitions = [...tr.entries()].map(([k, count]) => { const [from, to] = k.split("→"); return { from, to, count }; })
      .sort((a, b) => b.count - a.count);
    res.json({ year, month, total: items.length, hasPeriod: ids.length > 0, items, transitions });
  } catch (err) { sendError(res, err); }
});

module.exports = router;
