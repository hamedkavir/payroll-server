const express = require("express");
const { sendError, isBusinessError } = require("../errors");
const router = express.Router();
const pool = require("../db");
const J = require("../jalali");
const { ensurePeriod } = require("../deductionSummary");
const { loadKeyCodes, KEY_CODE_DEFS } = require("../keyCodes");

// GET /api/dashboard
// آمار کلی وضعیت پرسنل، به‌همراه تازه‌ترین تغییرات وضعیت (برای «تازه‌شاغل‌شده‌ها»،
// «تازه‌بازنشسته‌ها» و «تازه‌قطع‌رابطه‌ها»)
router.get("/", async (req, res) => {
  try {
    const [statusCounts] = await pool.query(
      "SELECT status, COUNT(*) AS c FROM personnel GROUP BY status"
    );
    const counts = { شاغل: 0, بازنشسته: 0, "وظیفه بگیر": 0, "قطع رابطه": 0 };
    let total = 0;
    statusCounts.forEach((r) => {
      if (Object.prototype.hasOwnProperty.call(counts, r.status)) counts[r.status] = Number(r.c);
      total += Number(r.c);
    });

    const limit = Math.min(200, Math.max(1, parseInt(req.query.limit, 10) || 50));
    const [changes] = await pool.query(
      `SELECT l.code, l.old_status, l.new_status, l.changed_at, l.period_id,
              p.first_name, p.last_name,
              pr.year, pr.month
       FROM personnel_status_log l
       LEFT JOIN personnel p ON p.code = l.code
       LEFT JOIN periods pr ON pr.id = l.period_id
       ORDER BY l.changed_at DESC, l.id DESC
       LIMIT ?`,
      [limit]
    );

    const mapRow = (r) => ({
      code: r.code,
      name: [r.first_name, r.last_name].filter(Boolean).join(" "),
      oldStatus: r.old_status,
      newStatus: r.new_status,
      changedAt: r.changed_at,
      period: r.period_id ? { id: r.period_id, year: r.year, month: r.month } : null,
    });

    // --- بخش نوبت وام برای داشبورد: ?year=1405&month=4 (ماه مبنا؛ پیش‌فرض همین‌که کلاینت می‌فرستد)
    const year = parseInt(req.query.year, 10);
    const month = parseInt(req.query.month, 10);
    let loanDueThisMonth = 0;
    const forecast = [];
    if (year && month >= 1 && month <= 12) {
      const [dueRows] = await pool.query(
        "SELECT due_year, due_month, COUNT(*) AS c FROM loan_queue WHERE status='pending' GROUP BY due_year, due_month"
      );
      const map = {};
      dueRows.forEach((r) => { map[r.due_year * 100 + r.due_month] = Number(r.c); });
      loanDueThisMonth = map[year * 100 + month] || 0;
      let y = year, m = month;
      for (let i = 0; i < 6; i++) {
        forecast.push({ year: y, month: m, count: map[y * 100 + m] || 0 });
        m++; if (m > 12) { m = 1; y++; }
      }
    }
    const [eligRows] = await pool.query(
      `SELECT lq.id, lq.code, lq.registration_year, lq.registration_month, lq.due_year, lq.due_month,
              lq.installment_months, lq.capital_amount, lq.loan_amount, lq.installment_amount,
              p.first_name, p.last_name, p.status
       FROM loan_queue lq LEFT JOIN personnel p ON p.code = lq.code
       WHERE lq.status = 'pending'
       ORDER BY lq.id DESC LIMIT 8`
    );
    const eligible = eligRows.map((r) => ({
      id: r.id, code: r.code, name: [r.first_name, r.last_name].filter(Boolean).join(" "),
      status: r.status || "", capital: Number(r.capital_amount), loanAmount: Number(r.loan_amount),
      installmentAmount: Number(r.installment_amount), installmentMonths: r.installment_months,
      registrationYear: r.registration_year, registrationMonth: r.registration_month,
      dueYear: r.due_year, dueMonth: r.due_month,
    }));

    // --- بخش مالی و هشدارها (هر بخش مستقل است؛ اگر جدولی هنوز ساخته نشده باشد فقط همان بخش خالی می‌ماند)
    const finance = { pendingAdvances: { count: 0, amount: 0 }, lowStock: [], outOfStock: 0, lastClosing: null, since: null, sinceStats: null };
    try {
      const [[a]] = await pool.query("SELECT COUNT(*) AS c, COALESCE(SUM(amount),0) AS s FROM advances WHERE status = 'pending'");
      finance.pendingAdvances = { count: Number(a.c), amount: Number(a.s) };
    } catch (e) { /* ignore */ }
    try {
      const [[o]] = await pool.query("SELECT COUNT(*) AS c FROM products WHERE active = 1 AND quantity <= 0");
      finance.outOfStock = Number(o.c);
      const [low] = await pool.query("SELECT name, unit, quantity FROM products WHERE active = 1 ORDER BY quantity ASC, name ASC LIMIT 5");
      finance.lowStock = low.map((r) => ({ name: r.name, unit: r.unit, quantity: Number(r.quantity) }));
    } catch (e) { /* ignore */ }
    try {
      const [[c]] = await pool.query("SELECT year, month, close_date FROM payroll_closings ORDER BY year DESC, month DESC LIMIT 1");
      if (c) {
        finance.lastClosing = { year: c.year, month: c.month, date: c.close_date };
        const since = J.nextDay(c.close_date);
        finance.since = since;
        const [[ad]] = await pool.query("SELECT COUNT(*) AS c, COALESCE(SUM(amount),0) AS s FROM advances WHERE status <> 'cancelled' AND request_date >= ?", [since]);
        const [[go]] = await pool.query("SELECT COUNT(*) AS c, COALESCE(SUM(total),0) AS s FROM goods_orders WHERE status = 'active' AND order_date >= ?", [since]);
        const [[lo]] = await pool.query("SELECT COUNT(*) AS c, COALESCE(SUM(loan_amount),0) AS s FROM loan_queue WHERE status IN ('pending','received') AND request_date >= ?", [since]);
        finance.sinceStats = {
          advances: { count: Number(ad.c), amount: Number(ad.s) }, goods: { count: Number(go.c), amount: Number(go.s) }, loans: { count: Number(lo.c), amount: Number(lo.s) },
        };
      }
    } catch (e) { /* ignore */ }

    // --- جمع‌های مالی دورهٔ فعال، روند ماه‌های اخیر، کسورات برتر، وضعیت فایل‌ها، تغییر وضعیت‌های ماه و کیفیت اطلاعات بانکی
    const payroll = { current: null, trend: [], topDeductions: [], statusChanges: [], quality: null };
    try {
      if (year && month >= 1 && month <= 12) {
        const [[per]] = await pool.query("SELECT id, issue_date, active_file, retiree_file, loan_file FROM periods WHERE year = ? AND month = ?", [year, month]);
        if (per) {
          try { await ensurePeriod(pool, per.id); } catch (e) { /* بعداً */ }
          const [tot] = await pool.query("SELECT kind, people_count, gross, deductions, net, employer FROM period_totals WHERE period_id = ?", [per.id]);
          const t = (k) => { const x = tot.find((y) => y.kind === k); return x ? { people: Number(x.people_count), gross: Number(x.gross), deductions: Number(x.deductions), net: Number(x.net) } : null; };
          let closed = false;
          try { const [[c]] = await pool.query("SELECT COUNT(*) AS c FROM payroll_closings WHERE year = ? AND month = ?", [year, month]); closed = Number(c.c) > 0; } catch (e) { /* ignore */ }
          payroll.current = { year, month, issueDate: per.issue_date || "", files: { active: per.active_file || "", retiree: per.retiree_file || "", loan: per.loan_file || "" }, active: t("active"), retiree: t("retiree"), closed };
          const [top] = await pool.query(
            `SELECT MIN(code) AS code, MIN(label) AS label, SUM(total_amount) AS t, SUM(people_count) AS c FROM deduction_summary
             WHERE period_id = ? GROUP BY ded_key ORDER BY t DESC LIMIT 6`, [per.id]);
          payroll.topDeductions = top.map((r) => ({ code: r.code, label: r.label, total: Number(r.t), count: Number(r.c) }));
          const [sc] = await pool.query("SELECT old_status, new_status, COUNT(*) AS c FROM personnel_status_log WHERE period_id = ? GROUP BY old_status, new_status ORDER BY c DESC", [per.id]);
          payroll.statusChanges = sc.map((r) => ({ from: r.old_status || "", to: r.new_status, count: Number(r.c) }));
        }
      }
      const [tr] = await pool.query(
        `SELECT pr.year, pr.month, SUM(t.gross) AS gross, SUM(t.deductions) AS ded, SUM(t.net) AS net, SUM(t.people_count) AS n
         FROM period_totals t JOIN periods pr ON pr.id = t.period_id GROUP BY pr.id, pr.year, pr.month ORDER BY pr.year DESC, pr.month DESC LIMIT 12`);
      payroll.trend = tr.reverse().map((r) => ({ year: r.year, month: r.month, gross: Number(r.gross), deductions: Number(r.ded), net: Number(r.net), people: Number(r.n) }));
    } catch (e) { /* جدول‌های گزارش هنوز ساخته نشده؛ بخش مالی داشبورد خالی می‌ماند */ }
    try {
      const [[q]] = await pool.query(
        `SELECT COUNT(*) AS n,
                COALESCE(SUM(bank_account <> '' AND bank_account NOT REGEXP '^[0-9]{13}$'), 0) AS bad,
                COALESCE(SUM(bank_account = ''), 0) AS noAcc,
                COALESCE(SUM(shaba = ''), 0) AS noShaba
         FROM personnel WHERE status IN ('شاغل', 'بازنشسته', 'وظیفه بگیر')`);
      payroll.quality = { total: Number(q.n), badAccount: Number(q.bad), noAccount: Number(q.noAcc), noShaba: Number(q.noShaba) };
    } catch (e) { /* ignore */ }

    // --- خلاصهٔ کدهای مهم (تنظیمات ← تعریف کدهای مهم: وام ۱ و ۲، سرمایه، مساعده): جمع و تعداد نفرات ۶ دورهٔ اخیر از خلاصهٔ کسورات
    const keyCodeStats = [];
    try {
      const kc = await loadKeyCodes(pool);
      const statFor = async (key, label, code, kinds) => {
        if (!code) { keyCodeStats.push({ key, label, code: "", series: [] }); return; }
        const [sr] = await pool.query(
          `SELECT pr.year, pr.month, SUM(ds.total_amount) AS t, SUM(ds.people_count) AS c, SUM(ds.remaining_amount) AS rem, MIN(ds.label) AS label
           FROM deduction_summary ds JOIN periods pr ON pr.id = ds.period_id WHERE ds.code = ? AND ds.kind IN (?)
           GROUP BY pr.id, pr.year, pr.month ORDER BY pr.year DESC, pr.month DESC LIMIT 6`, [code, kinds || ["active", "retiree"]]);
        const series = sr.reverse().map((r) => ({ year: r.year, month: r.month, total: Number(r.t), count: Number(r.c), remaining: r.rem == null ? null : Number(r.rem) }));
        keyCodeStats.push({ key, label, code, name: (sr[sr.length - 1] && sr[sr.length - 1].label) || "", series });
      };
      // کدهای مهم شاغلین و بازنشستگان جدا هستند: کدِ شاغلین فقط از فیش شاغلین، کدِ بازنشستگان فقط از فیش بازنشستگان شمرده می‌شود.
      // اگر برای بازنشستگان کد جدا تعریف نشده باشد، همان کد شاغلین برای هر دو گروه است (مثل قبل).
      for (const d of KEY_CODE_DEFS) {
        if (d.of) { if (kc[d.key]) await statFor(d.key, d.label, kc[d.key], ["retiree"]); continue; }   // کد بازنشستگانِ تعریف‌نشده نمایش داده نمی‌شود
        const rk = KEY_CODE_DEFS.find((x) => x.of === d.key);
        await statFor(d.key, d.label, kc[d.key], rk && kc[rk.key] ? ["active"] : ["active", "retiree"]);
      }
      // کدهای مهم اضافی هم جدا: «extra» شاغلین، «rextra» بازنشستگان؛ اگر برای بازنشستگان چیزی تعریف نشده باشد «extra» برای هر دو گروه است (مثل قبل)
      const splitExtra = (kc.rextra || []).length > 0;
      for (const e of kc.extra || []) await statFor("extra:" + e.code, splitExtra ? `${e.label} (شاغلین)` : e.label, e.code, splitExtra ? ["active"] : ["active", "retiree"]);
      for (const e of kc.rextra || []) await statFor("rextra:" + e.code, `${e.label} (بازنشستگان)`, e.code, ["retiree"]);
    } catch (e) { /* ignore */ }

    // --- وام بانک مهر: وضعیت‌ها و شارژ ماه جاری (ماه مبنا ← year/month تقویم شمسی همان دورهٔ فعال)
    let mehr = null;
    try {
      const [st] = await pool.query("SELECT status, COUNT(*) AS n, COALESCE(SUM(loan_amount),0) AS s FROM mehr_loans GROUP BY status");
      mehr = { pending: { count: 0, amount: 0 }, paid: { count: 0, amount: 0 }, failed: { count: 0, amount: 0 }, cancelled: { count: 0, amount: 0 }, charge: null };
      st.forEach((r) => { if (mehr[r.status]) mehr[r.status] = { count: Number(r.n), amount: Number(r.s) }; });
      if (year && month >= 1 && month <= 12) {
        const ym = `${year}/${String(month).padStart(2, "0")}`;
        const [[c]] = await pool.query("SELECT amount FROM mehr_charges WHERE ym = ?", [ym]);
        const [[u]] = await pool.query("SELECT COALESCE(SUM(loan_amount),0) AS s FROM mehr_loans WHERE status IN ('pending','paid') AND SUBSTRING(COALESCE(NULLIF(turn_date,''), request_date),1,7) = ?", [ym]);
        if (c) mehr.charge = { ym, amount: Number(c.amount), used: Number(u.s), remaining: Number(c.amount) - Number(u.s) };
        else mehr.charge = { ym, amount: 0, used: Number(u.s), remaining: 0, notSet: true };
      }
    } catch (e) { /* جدول هنوز ساخته نشده */ }

    res.json({
      payroll,
      finance,
      keyCodeStats, mehr,
      loanDueThisMonth, forecast, eligible,
      counts: {
        active: counts["شاغل"],
        retired: counts["بازنشسته"],
        heirs: counts["وظیفه بگیر"],
        terminated: counts["قطع رابطه"],
        total,
      },
      recentActive: changes.filter((r) => r.new_status === "شاغل").map(mapRow),
      recentRetired: changes.filter((r) => r.new_status === "بازنشسته").map(mapRow),
      recentTerminated: changes.filter((r) => r.new_status === "قطع رابطه").map(mapRow),
    });
  } catch (err) {
    sendError(res, err);
  }
});

module.exports = router;
