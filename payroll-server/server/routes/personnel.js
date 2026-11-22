const express = require("express");
const { sendError, isBusinessError } = require("../errors");
const router = express.Router();
const pool = require("../db");
const { searchPersonnel } = require("../personnelIndex");
const { pendingCapital } = require("../capitalEffective");
const { personPayroll } = require("../personPayroll");
const { padNid, isNid10, sqlNormExpr, likePattern, normalizeSearch, toLatinDigits } = require("../textNormalize");
const { ACCOUNT_LEN, cleanAccount, isAccount13, cleanShaba, isValidShaba, accountFromShaba, defaultBankName } = require("../bankAccount");

const COLS = [
  "code", "first_name", "last_name", "national_id", "father_name", "id_number",
  "birth_date", "birth_place", "mobile", "insurance_type", "employment_type",
  "education", "gender", "veteran_type", "job_title", "workplace", "workplace_code",
  "govt_service_years", "marital_status", "current_status", "covered_children",
  "bank_account", "advance_account", "status",
];

// فیلدهای قابل ویرایش دستی: همهٔ ستون‌ها به‌جز کد پرسنلی (کلید ارتباط با فیش‌ها) + «توضیحات».
// «notes» عمداً در COLS نیست تا وارد‌کردن فایل کارگزینی هرگز توضیحاتِ دستی را پاک نکند.
// «shaba» هم عمداً در COLS نیست: وارد‌کردن فایل کارگزینی آن را خالی نکند (فقط ویرایش دستی و «به‌روزرسانی اطلاعات پرسنل»)
const EDITABLE = COLS.filter((c) => c !== "code").concat(["notes", "membership_cancel_date", "shaba", "bank_name", "field_of_study", "ledger", "advance_owner", "job_role", "job_rank", "job_group", "insurance_code", "mehr_account"]);
// ستون‌های فایل کارگزینی که در COLS نیستند: فقط مقدار غیرخالی فایل ذخیره می‌شود (خالی، مقدار قبلی را پاک نمی‌کند)
const EXTRA_IMPORT = [["ledger", "ledger"], ["bank_name", "bankName"], ["field_of_study", "fieldOfStudy"], ["advance_owner", "advanceOwner"], ["job_role", "jobRole"], ["job_rank", "jobRank"], ["job_group", "jobGroup"], ["insurance_code", "insuranceCode"]];
const ACCOUNT_COLS = ["bank_account", "advance_account"];

function toJSON(row) {
  const out = {};
  for (const c of COLS) out[camel(c)] = row[c];
  out.notes = row.notes || "";
  out.shaba = row.shaba || "";
  out.bankName = row.bank_name || "";
  out.fieldOfStudy = row.field_of_study || "";
  out.ledger = row.ledger || "";
  out.advanceOwner = row.advance_owner || "";
  out.jobRole = row.job_role || "";
  out.jobRank = row.job_rank || "";
  out.jobGroup = row.job_group || "";
  out.insuranceCode = row.insurance_code || "";
  out.mehrAccount = row.mehr_account || "";
  try { const x = typeof row.extra === "string" ? JSON.parse(row.extra || "{}") : row.extra; out.extra = x && typeof x === "object" ? x : {}; } catch (e) { out.extra = {}; }
  out.membershipCancelDate = row.membership_cancel_date || "";
  out.membershipCancelAmount = row.membership_cancel_amount == null ? null : Number(row.membership_cancel_amount);
  out.id = row.id;
  out.updatedAt = row.updated_at;
  return out;
}
function camel(s) {
  return s.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
}

// شرط SQL جست‌وجو (روش پشتیبان و خروجی اکسل) — مطابق نمایهٔ حافظه‌ای؛ by: "", account, mobile, workplace, all
function searchWhere(q, by, where, vals) {
  if (!(q && normalizeSearch(q))) return;
  const pat = likePattern(q);
  const base = [`${sqlNormExpr("code")} LIKE ?`, `${sqlNormExpr("national_id")} LIKE ?`, `${sqlNormExpr("CONCAT(first_name, last_name)")} LIKE ?`, `${sqlNormExpr("CONCAT(last_name, first_name)")} LIKE ?`];
  const acc = [`${sqlNormExpr("bank_account")} LIKE ?`, `${sqlNormExpr("advance_account")} LIKE ?`, `${sqlNormExpr("shaba")} LIKE ?`];
  const wp = [`${sqlNormExpr("workplace")} LIKE ?`, `${sqlNormExpr("workplace_code")} LIKE ?`];
  const mpat = likePattern(normalizeSearch(q).replace(/^0+/, "") || "\u0000");
  const mob = [`${sqlNormExpr("mobile")} LIKE ?`];
  const pick = by === "account" ? [acc, [pat, pat, pat]] : by === "workplace" ? [wp, [pat, pat]] : by === "mobile" ? [mob, [mpat]]
    : by === "all" ? [[...base, ...acc, ...wp, ...mob], [pat, pat, pat, pat, pat, pat, pat, pat, pat, mpat]] : [base, [pat, pat, pat, pat]];
  where.push(`(${pick[0].join(" OR ")})`); vals.push(...pick[1]);
}

// GET /api/personnel?q=جست‌وجو&status=شاغل&page=1&pageSize=50
router.get("/", async (req, res) => {
  const q = (req.query.q || "").trim();
  const status = (req.query.status || "").trim();
  const by = (req.query.by || "").trim();
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const pageSize = Math.min(200, Math.max(1, parseInt(req.query.pageSize, 10) || 50));
  try {
    // نمایهٔ حافظه‌ای (personnelIndex.js): جست‌وجوی فوری؛ اگر به هر دلیل نشد، همان کوئری SQL قدیمی
    const r = await searchPersonnel(pool, { q, status, by, page, pageSize });
    return res.json({ total: r.total, page, pageSize, items: r.items });
  } catch (e) { console.warn("نمایهٔ جست‌وجوی پرسنل کار نکرد؛ روش SQL:", e.message); }
  const where = [];
  const vals = [];
  searchWhere(q, by, where, vals);
  if (status) {
    where.push("status = ?");
    vals.push(status);
  }
  const whereSql = where.length ? "WHERE " + where.join(" AND ") : "";
  try {
    const [[{ total }]] = await pool.query(`SELECT COUNT(*) AS total FROM personnel ${whereSql}`, vals);
    const [rows] = await pool.query(
      `SELECT id, code, first_name, last_name, national_id, job_title, workplace, mobile, bank_account, shaba, status, gender, updated_at
       FROM personnel ${whereSql} ORDER BY last_name, first_name LIMIT ? OFFSET ?`,
      [...vals, pageSize, (page - 1) * pageSize]
    );
    res.json({
      total,
      page,
      pageSize,
      items: rows.map((r) => ({
        id: r.id, code: r.code, firstName: r.first_name, lastName: r.last_name,
        nationalId: r.national_id, jobTitle: r.job_title, workplace: r.workplace, gender: r.gender, mobile: r.mobile, bankAccount: r.bank_account, shaba: r.shaba,
        status: r.status, updatedAt: r.updated_at,
      })),
    });
  } catch (err) {
    sendError(res, err);
  }
});

// GET /api/personnel/export?q=&status=  -> همهٔ نتایج فیلترشده (بدون صفحه‌بندی) برای خروجی اکسل
router.get("/export", async (req, res) => {
  const q = (req.query.q || "").trim();
  const status = (req.query.status || "").trim();
  const by = (req.query.by || "").trim();
  const where = [], vals = [];
  searchWhere(q, by, where, vals);
  if (status) { where.push("status = ?"); vals.push(status); }
  try {
    const [rows] = await pool.query(`SELECT * FROM personnel ${where.length ? "WHERE " + where.join(" AND ") : ""} LIMIT 50000`, vals);
    rows.sort((a, b) => String(a.last_name).localeCompare(String(b.last_name), "fa") || String(a.first_name).localeCompare(String(b.first_name), "fa"));
    res.json({ items: rows.map(toJSON) });
  } catch (err) {
    sendError(res, err);
  }
});

// GET /api/personnel/:code/profile  -> همهٔ اطلاعات یک نفر برای «فرم پرسنلی»:
// مشخصات کارگزینی + آخرین فیش‌ها (برای نمایش خالص دریافتی، سرمایه و وام‌ها) + نوبت وام + تاریخچهٔ وضعیت
// نکته: مرتب‌سازی عمداً در Node انجام می‌شود (نه ORDER BY در SQL) تا ستون‌های JSON حجیم
// روی سرورهایی که sort buffer کوچک دارند خطای «Out of sort memory» ندهند.
router.get("/:code/profile", async (req, res) => {
  const code = req.params.code;
  try {
    const [rows] = await pool.query("SELECT * FROM personnel WHERE code = ?", [code]);
    if (!rows.length) return res.status(404).json({ error: "not_found" });

    const [periods] = await pool.query("SELECT id, year, month FROM periods");
    const pmap = {};
    periods.forEach((p) => { pmap[p.id] = p; });

    const slipsN = Math.max(1, Math.min(120, parseInt(req.query.slips, 10) || 12));
    const payroll = await personPayroll(pool, code, slipsN);

    const [queue] = await pool.query(
      `SELECT id, registration_year, registration_month, due_year, due_month, capital_amount,
              loan_amount, installment_months, installment_amount, status,
              inst_start_year, inst_start_month, inst_end_year, inst_end_month, inst_current_amount, inst_loan_paid, received_at
       FROM loan_queue WHERE code = ?`, [code]);
    queue.sort((a, b) => b.due_year - a.due_year || b.due_month - a.due_month);

    const [dec] = await pool.query("SELECT id, death_date FROM deceased WHERE code = ? ORDER BY id DESC LIMIT 1", [code]);
    const lastSlip = payroll[0];
    const pend = lastSlip ? await pendingCapital(pool, code, lastSlip.year * 12 + lastSlip.month) : null;   // سرمایهٔ جدید (افزایش سرمایهٔ ثبت‌شده، هنوز بدون فیش)
    const [log] = await pool.query(
      "SELECT id, old_status, new_status, period_id, changed_at, reason, note FROM personnel_status_log WHERE code = ?", [code]);
    log.sort((a, b) => new Date(b.changed_at) - new Date(a.changed_at));

    res.json({
      person: toJSON(rows[0]),
      capitalPending: pend ? pend.newCapital : null,
      deceased: dec.length ? { id: dec[0].id, deathDate: dec[0].death_date || "" } : null,
      payroll,
      loanQueue: queue.map((q) => ({
        id: q.id, registrationYear: q.registration_year, registrationMonth: q.registration_month,
        dueYear: q.due_year, dueMonth: q.due_month, capital: Number(q.capital_amount),
        loanAmount: Number(q.loan_amount), installmentMonths: q.installment_months,
        installmentAmount: Number(q.installment_amount), status: q.status,
        // وام دریافت‌شده: تاریخ دریافت (اولین دورهٔ ثبت کد وام)، پایان اقساط و مبلغ وام دریافتی
        instStartYear: q.inst_start_year || null, instStartMonth: q.inst_start_month || null,
        instEndYear: q.inst_end_year || null, instEndMonth: q.inst_end_month || null,
        instCurrentAmount: q.inst_current_amount == null ? null : Number(q.inst_current_amount),
        instLoanPaid: q.inst_loan_paid == null ? null : Number(q.inst_loan_paid), receivedAt: q.received_at || null,
      })),
      statusLog: log.slice(0, 20).map((l) => ({
        id: l.id, oldStatus: l.old_status, newStatus: l.new_status, changedAt: l.changed_at, reason: l.reason || "", note: l.note || "",
        period: l.period_id && pmap[l.period_id] ? { year: pmap[l.period_id].year, month: pmap[l.period_id].month } : null,
      })),
    });
  } catch (err) {
    sendError(res, err);
  }
});

// GET /api/personnel/:code  -> جزئیات کامل یک نفر
router.get("/:code", async (req, res) => {
  try {
    const [rows] = await pool.query("SELECT * FROM personnel WHERE code = ?", [req.params.code]);
    if (!rows.length) return res.status(404).json({ error: "not_found" });
    res.json(toJSON(rows[0]));
  } catch (err) {
    sendError(res, err);
  }
});

// PATCH /api/personnel/:code/status-log/:id { reason, note } -> درج/ویرایش علت و شرح یک تغییر وضعیت (حتی تغییرهای خودکار فایل‌ها)
router.patch("/:code/status-log/:id", async (req, res) => {
  const b = req.body || {};
  try {
    const [r] = await pool.query("UPDATE personnel_status_log SET reason = ?, note = ? WHERE id = ? AND code = ?",
      [String(b.reason || "").trim().slice(0, 60), String(b.note || "").trim().slice(0, 500), req.params.id, req.params.code]);
    if (!r.affectedRows) return res.status(404).json({ error: "not_found", message: "مورد پیدا نشد." });
    res.json({ ok: true });
  } catch (err) { sendError(res, err); }
});

// PUT /api/personnel/:code  -> ویرایش دستی هر بخش (فقط فیلدهای ارسالی تغییر می‌کنند)
router.put("/:code", async (req, res) => {
  const body = req.body || {};
  const sets = [], vals = [];
  for (const c of EDITABLE) {
    const key = camel(c);
    if (Object.prototype.hasOwnProperty.call(body, key)) {
      let v = body[key] == null ? "" : String(body[key]);
      v = c === "notes" ? v.slice(0, 10000) : v.trim().slice(0, 255);
      if (ACCOUNT_COLS.includes(c)) {
        v = cleanAccount(v);
        if (v && !isAccount13(v)) return res.status(400).json({ error: "invalid_input", message: `${c === "bank_account" ? "شمارهٔ حساب" : "حساب مساعده"} باید دقیقاً ${ACCOUNT_LEN} رقم باشد (الان ${v.length} رقم است).` });
      }
      if (c === "mehr_account") v = toLatinDigits(v).replace(/\D/g, "").slice(0, 30);   // شمارهٔ حساب بانک مهر: فقط رقم (طول ثابت ندارد)
      if (c === "national_id") {
        v = padNid(v);
        if (v && !isNid10(v)) return res.status(400).json({ error: "invalid_input", message: `کد ملی باید دقیقاً ۱۰ رقم باشد (الان ${v.length} نویسه است).` });
      }
      if (c === "shaba") {
        v = cleanShaba(v);
        if (v && !isValidShaba(v)) return res.status(400).json({ error: "invalid_input", message: "شمارهٔ شبا معتبر نیست؛ باید به‌صورت IR و ۲۴ رقم (با رقم کنترلی درست) باشد." });
      }
      if (c === "membership_cancel_date") {
        v = toLatinDigits(v).trim();
        if (v && !/^\d{4}\/\d{2}\/\d{2}$/.test(v)) return res.status(400).json({ error: "invalid_input", message: "تاریخ لغو عضویت را به‌صورت 1405/07/21 وارد کنید (یا خالی بگذارید)." });
        if (!v) { sets.push("membership_cancel_amount = NULL"); }   // پاک شدن تاریخ = فعال‌سازی مجدد عضویت
      }
      sets.push(`${c} = ?`);
      vals.push(v);
    }
  }
  const extraIn = body.extra && typeof body.extra === "object" && !Array.isArray(body.extra) ? body.extra : null;
  if (!sets.length && !extraIn) return res.status(400).json({ error: "invalid_input", message: "هیچ فیلدی ارسال نشده است." });
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [cur] = await conn.query("SELECT status, bank_account, shaba, extra FROM personnel WHERE code = ? FOR UPDATE", [req.params.code]);
    if (!cur.length) { await conn.rollback(); return res.status(404).json({ error: "not_found" }); }
    if (extraIn) {   // فیلدهای دلخواه صفحهٔ پرسنل: ادغام با مقادیر قبلی (کلید c… ، متن حداکثر ۳۰۰ نویسه)
      let old = {}; try { old = typeof cur[0].extra === "string" ? JSON.parse(cur[0].extra || "{}") : (cur[0].extra || {}); } catch (e) { old = {}; }
      for (const [k, v] of Object.entries(extraIn).slice(0, 40)) if (/^cx[A-Za-z0-9_]{1,20}$/.test(k)) { const t = String(v == null ? "" : v).trim().slice(0, 300); if (t) old[k] = t; else delete old[k]; }
      sets.push("extra = ?"); vals.push(JSON.stringify(old));
    }
    // اگر شبا تغییر کرد و شمارهٔ حساب دستی تغییر نکرد، ۱۳ رقم آخر شبا شمارهٔ حساب می‌شود
    const iShaba = sets.indexOf("shaba = ?");
    if (iShaba >= 0 && vals[iShaba] && vals[iShaba] !== (cur[0].shaba || "")) {
      const iAcc = sets.indexOf("bank_account = ?");
      const accTouched = iAcc >= 0 && vals[iAcc] !== String(cur[0].bank_account || "");
      if (!accTouched) {
        if (iAcc >= 0) vals[iAcc] = accountFromShaba(vals[iShaba]);
        else { sets.push("bank_account = ?"); vals.push(accountFromShaba(vals[iShaba])); }
      }
    }
    await conn.query(`UPDATE personnel SET ${sets.join(", ")} WHERE code = ?`, [...vals, req.params.code]);
    // اگر وضعیت دستی عوض شد، در تاریخچهٔ تغییر وضعیت هم ثبت می‌شود (برای داشبورد)
    if (Object.prototype.hasOwnProperty.call(body, "status")) {
      const ns = String(body.status || "").trim();
      if (ns && ns !== cur[0].status) {
        await conn.query(
          "INSERT INTO personnel_status_log (code, old_status, new_status, period_id, reason, note) VALUES (?, ?, ?, NULL, ?, ?)",
          [req.params.code, cur[0].status || "", ns, String(body.statusReason || "").trim().slice(0, 60), String(body.statusNote || "").trim().slice(0, 500)]
        );
      }
    }
    await conn.commit();
    res.json({ ok: true });
  } catch (err) {
    await conn.rollback();
    sendError(res, err);
  } finally {
    conn.release();
  }
});

// POST /api/personnel/import
// body: { mode: 'merge'|'replace', people: [{ code, firstName, lastName, ... }, ...] }
// merge (پیش‌فرض): درج/به‌روزرسانی؛ چیزی حذف نمی‌شود.
// replace: علاوه‌بر درج/به‌روزرسانی، کسانی که در فایل تازه نیستند هم حذف می‌شوند
// (برای زمانی که فایل کارگزینی «کل و آخرین وضعیت» همهٔ افراد سازمان را نشان می‌دهد).
router.post("/import", async (req, res) => {
  const { mode = "merge", people } = req.body || {};
  if (!Array.isArray(people) || !people.length) {
    return res.status(400).json({ error: "invalid_input", message: "فهرست people لازم است." });
  }
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const codes = [];
    let inserted = 0, updated = 0, shabaSet = 0, shabaInvalid = 0;
    const shabaBad = [];
    const colList = COLS.join(", ");
    const placeholders = COLS.map(() => "?").join(", ");
    // حساب‌ها: فقط مقدار ۱۳ رقمی ذخیره می‌شود؛ خالی/نامعتبر در فایل، مقدار قبلی را پاک نمی‌کند
    // فقط ستون‌هایی که در «همان ردیف» فایل وجود دارند روی همان فرد به‌روز می‌شوند (ستون غایب در یک ردیف دست نمی‌خورد، حتی اگر ردیف‌های دیگر آن را داشته باشند)
    const presentOf = (p) => new Set(COLS.filter((c) => c !== "code" && Object.prototype.hasOwnProperty.call(p, camel(c))));
    const updateListOf = (present) => {
      const updCols = COLS.filter((c) => present.has(c));
      return (updCols.length ? updCols : ["code"]).map((c) => (ACCOUNT_COLS.includes(c) ? `${c} = IF(VALUES(${c}) = '', ${c}, VALUES(${c}))` : `${c} = VALUES(${c})`)).join(", ");
    };

    // برای گزارش تغییرات (اکسل): مقدار قبلی افراد موجود
    const exist = new Map(), allCodes = people.map((p) => String((p && p.code) || "").trim()).filter(Boolean);
    for (let i = 0; i < allCodes.length; i += 1000) {
      const [rs] = await conn.query("SELECT * FROM personnel WHERE code IN (?)", [allCodes.slice(i, i + 1000)]);
      rs.forEach((r) => exist.set(String(r.code), r));
    }
    const changes = [], createdList = [];
    for (const p of people) {
      if (!p || typeof p !== "object") continue;
      const code = String(p.code || "").trim();
      if (!code) continue;
      codes.push(code);
      const present = presentOf(p), updateList = updateListOf(present);
      const ex0 = exist.get(code), nm0 = `${p.firstName || ""} ${p.lastName || ""}`.trim();
      const vals = COLS.map((c) => {
        if (c === "code") return code;
        const v = p[camel(c)] ?? "";
        if (ACCOUNT_COLS.includes(c)) { const d = cleanAccount(v); return isAccount13(d) ? d : ""; }
        if (c === "national_id") return padNid(v);
        return v;
      });
      if (!ex0) createdList.push({ code, name: nm0, status: String(p.status || "") });
      else COLS.forEach((c, ix) => {
        if (!present.has(c)) return;
        const nv = vals[ix];
        if (ACCOUNT_COLS.includes(c) && nv === "") return;
        if (!sameText(nv, ex0[c])) changes.push({ code, name: `${ex0.first_name || ""} ${ex0.last_name || ""}`.trim(), field: c, old: ex0[c] == null ? "" : String(ex0[c]), new: String(nv) });
      });
      const [result] = await conn.query(
        `INSERT INTO personnel (${colList}) VALUES (${placeholders})
         ON DUPLICATE KEY UPDATE ${updateList}`,
        vals
      );
      if (result.affectedRows === 1) inserted++; else updated++;
      const exSets = [], exVals = [];
      for (const [c, k] of EXTRA_IMPORT) { const v = p[k] == null ? "" : String(p[k]).trim(); if (v) { exSets.push(`${c} = ?`); exVals.push(v.slice(0, 100)); if (ex0 && !sameText(v, ex0[c])) changes.push({ code, name: nm0, field: c, old: ex0[c] == null ? "" : String(ex0[c]), new: v.slice(0, 100) }); } }
      if (exSets.length) await conn.query(`UPDATE personnel SET ${exSets.join(", ")} WHERE code = ?`, [...exVals, code]);
      // شمارهٔ شبا (اختیاری در فایل کارگزینی): اگر معتبر بود ذخیره می‌شود و ۱۳ رقم آخرش شمارهٔ حساب می‌شود؛ نامعتبر نادیده گرفته می‌شود
      const rawSh = p.shaba == null ? "" : String(p.shaba).trim();
      if (rawSh) {
        const sh = cleanShaba(rawSh);
        if (isValidShaba(sh)) { await conn.query("UPDATE personnel SET shaba = ?, bank_account = ? WHERE code = ?", [sh, accountFromShaba(sh), code]); shabaSet++; if (ex0 && ex0.shaba !== sh) changes.push({ code, name: nm0, field: "shaba", old: ex0.shaba || "", new: sh }); }
        else { shabaInvalid++; if (shabaBad.length < 30) shabaBad.push({ code, value: rawSh.slice(0, 40) }); }
      }
    }

    let deleted = 0;
    if (mode === "replace" && codes.length) {
      const ph = codes.map(() => "?").join(",");
      const [delResult] = await conn.query(`DELETE FROM personnel WHERE code NOT IN (${ph})`, codes);
      deleted = delResult.affectedRows;
    }

    await conn.commit();
    res.json({ ok: true, inserted, updated, deleted, total: codes.length, shabaSet, shabaInvalid, shabaBad, changes, createdList });
  } catch (err) {
    await conn.rollback();
    sendError(res, err);
  } finally {
    conn.release();
  }
});

// POST /api/personnel/bulk-update   { people: [{ code, firstName, ..., shaba }, ...] }
// «به‌روزرسانی اطلاعات پرسنل» از فایل‌های اکسل: فقط افرادی که از قبل هستند، فقط فیلدهای غیرخالی،
// فقط اگر مقدار فرق کند. شبا اعتبارسنجی می‌شود و ۱۳ رقم آخرش با شمارهٔ حساب ذخیره‌شده مقایسه و در صورت تفاوت اصلاح می‌شود.
const BULK_FIELDS = ["first_name", "last_name", "father_name", "national_id", "id_number", "birth_date", "birth_place",
  "gender", "marital_status", "employment_type", "education", "field_of_study", "job_title", "workplace", "insurance_type", "bank_name"];
// «وضعیت پرسنل» فایل (فعال/غیرفعال یا True/False) → وضعیت سیستم برای افراد تازه؛ مقدار نامشخص = null
const statusForNew = (a) => {
  const t = String(a == null ? "" : a).trim().toLowerCase().replace(/[\s\u200c]/g, "").replace(/ي/g, "ی");
  if (["غیرفعال", "false", "0", "no"].includes(t)) return "قطع رابطه";
  if (["فعال", "true", "1", "yes"].includes(t)) return "شاغل";
  return null;
};
// مقایسهٔ متن بدون حساسیت به ی/ي، ک/ك، نیم‌فاصله، فاصله و ارقام (تا فقط تفاوت املایی تغییر به‌حساب نیاید)
const sameText = (a, b) => {
  const n = (x) => toLatinDigits(String(x == null ? "" : x)).replace(/[يى]/g, "ی").replace(/ك/g, "ک").replace(/[آأإٱ]/g, "ا").replace(/[\u200c\s]/g, "");
  return n(a) === n(b);
};
const RETIRED_STATUSES = new Set(["بازنشسته", "وظیفه بگیر"]);
router.post("/bulk-update", async (req, res) => {
  const people = (req.body || {}).people;
  const createMissing = !!(req.body || {}).createMissing;
  if (!Array.isArray(people) || !people.length) return res.status(400).json({ error: "invalid_input", message: "فهرست people لازم است." });
  if (people.length > 2000) return res.status(400).json({ error: "invalid_input", message: "در هر درخواست حداکثر ۲۰۰۰ نفر." });
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const codes = [...new Set(people.map((p) => String((p && p.code) || "").trim()).filter(Boolean))];
    const cur = new Map();
    if (codes.length) {
      const selCols = [...new Set(["code", "status", "first_name", "last_name", ...BULK_FIELDS, "bank_account", "shaba", "advance_account"])];
      const [rows] = await conn.query(`SELECT ${selCols.join(", ")} FROM personnel WHERE code IN (?) FOR UPDATE`, [codes]);
      rows.forEach((r) => cur.set(String(r.code), r));
    }
    const out = { ok: true, received: people.length, matched: 0, notFoundCount: 0, notFound: [], changedPeople: 0, unchanged: 0,
      fields: {}, accountUpdated: 0, shabaUpdated: 0, shabaInvalidCount: 0, shabaInvalid: [],
      created: 0, createdActive: 0, createdTerminated: 0, changes: [], createdList: [], notFoundAll: [], shabaInvalidAll: [], retiredSkipped: 0, advanceAccountSet: 0 };
    const newLogs = [];
    for (const p of people) {
      const code = String((p && p.code) || "").trim();
      if (!code) continue;
      const row = cur.get(code);
      if (!row) {
        const st = createMissing ? statusForNew(p.active) : null;
        if (!st) { out.notFoundCount++; out.notFoundAll.push(code); if (out.notFound.length < 30) out.notFound.push(code); continue; }
        // ساخت فرد تازه با وضعیت «شاغل» (فعال) یا «قطع رابطه» (غیرفعال)
        const rec = { code, status: st };
        for (const c of BULK_FIELDS) { const raw = p[camel(c)]; rec[c] = raw == null ? "" : (c === "national_id" ? padNid(raw) : String(raw).replace(/\s+/g, " ").trim().slice(0, 150)); }
        rec.bank_account = ""; rec.shaba = "";
        const rs = p.shaba == null ? "" : String(p.shaba).trim();
        const sh = cleanShaba(rs), plain = cleanAccount(rs);
        if (rs && isValidShaba(sh)) { rec.shaba = sh; rec.bank_account = accountFromShaba(sh); }
        else if (rs && !/^IR/i.test(sh) && isAccount13(plain)) rec.bank_account = plain;
        else if (rs) { out.shabaInvalidCount++; out.shabaInvalidAll.push({ code, value: rs.slice(0, 40) }); if (out.shabaInvalid.length < 30) out.shabaInvalid.push({ code, value: rs.slice(0, 40) }); }
        if (!rec.bank_name) rec.bank_name = defaultBankName(st);
        const cols = Object.keys(rec);
        await conn.query(`INSERT INTO personnel (${cols.join(", ")}) VALUES (${cols.map(() => "?").join(", ")})`, cols.map((c) => rec[c]));
        cur.set(code, rec);
        out.created++;
        out.createdList.push({ code, name: `${rec.first_name || ""} ${rec.last_name || ""}`.trim(), status: st });
        if (st === "شاغل") { out.createdActive++; newLogs.push([code, "", st]); } else out.createdTerminated++;
        continue;
      }
      out.matched++;
      const sets = [], vals = [];
      const setCol = (c, v, label) => {
        out.changes.push({ code, name: `${row.first_name || ""} ${row.last_name || ""}`.trim(), field: c, old: row[c] == null ? "" : String(row[c]), new: v });   // برای خروجی اکسل «تغییرات»
        sets.push(`${c} = ?`); vals.push(v); row[c] = v; out.fields[label || c] = (out.fields[label || c] || 0) + 1;
      };
      for (const c of BULK_FIELDS) {
        if (c === "birth_place") continue;   // محل تولد فقط برای پرسنل تازه ثبت می‌شود، هرگز به‌روزرسانی نمی‌شود
        // بازنشسته/وظیفه‌بگیر: نام، نام خانوادگی، کد ملی و نام بانک فقط از فایل فیش حقوقی بازنشستگان به‌روز می‌شود
        if (RETIRED_STATUSES.has(row.status) && ["first_name", "last_name", "national_id", "bank_name"].includes(c)) continue;   // نام بانک بازنشسته/وظیفه‌بگیر فقط از فایل فیش بازنشستگان (صادرات)
        const raw = p[camel(c)];
        if (raw == null) continue;
        const v = c === "national_id" ? padNid(raw) : String(raw).replace(/\s+/g, " ").trim().slice(0, 150);
        if (!v || sameText(v, row[c])) continue;
        setCol(c, v);
      }
      const rawSh = p.shaba == null ? "" : String(p.shaba).trim();
      const shClean = cleanShaba(rawSh), plainAcc = cleanAccount(rawSh);
      const onlyAcc = rawSh && !/^IR/i.test(shClean) && /^\d+$/.test(plainAcc) && plainAcc.length === shClean.length;   // ستون فقط شمارهٔ حساب داشت (نه شبا)
      let fileAcc = "", fileShaba = "", bad = false;
      if (rawSh) {
        if (onlyAcc) { if (isAccount13(plainAcc)) fileAcc = plainAcc; else bad = true; }
        else if (isValidShaba(shClean)) { fileShaba = shClean; fileAcc = accountFromShaba(shClean); }
        else bad = true;
      }
      if (bad) { out.shabaInvalidCount++; out.shabaInvalidAll.push({ code, value: rawSh.slice(0, 40) }); if (out.shabaInvalid.length < 30) out.shabaInvalid.push({ code, value: rawSh.slice(0, 40) }); }
      if (RETIRED_STATUSES.has(row.status)) {
        // فرد در سیستم بازنشسته/وظیفه‌بگیر است: حساب و شبای او از فایل شاغلین عوض نمی‌شود؛
        // حساب بانک ملیِ فایل فقط اگر «حساب مساعده» خالی بود به‌عنوان حساب مساعده ثبت می‌شود.
        if (fileAcc) {
          out.retiredSkipped++;
          if (!String(row.advance_account || "").trim()) { setCol("advance_account", fileAcc); out.advanceAccountSet++; }
        }
      } else {
        if (fileShaba && fileShaba !== (row.shaba || "")) { setCol("shaba", fileShaba); out.shabaUpdated++; }
        if (fileAcc && fileAcc !== String(row.bank_account || "").trim()) { setCol("bank_account", fileAcc); out.accountUpdated++; }
      }
      if (!String(row.bank_name || "").trim()) { const b = defaultBankName(row.status); if (b) setCol("bank_name", b); }
      if (!sets.length) { out.unchanged++; continue; }
      await conn.query(`UPDATE personnel SET ${sets.join(", ")} WHERE code = ?`, [...vals, code]);
      out.changedPeople++;
    }
    if (newLogs.length) await conn.query("INSERT INTO personnel_status_log (code, old_status, new_status, period_id, reason) VALUES ?", [newLogs.map((l) => [l[0], l[1], l[2], null, "ثبت از فایل پرسنل"])]);
    await conn.commit();
    res.json(out);
  } catch (err) {
    await conn.rollback();
    sendError(res, err);
  } finally {
    conn.release();
  }
});

module.exports = router;
