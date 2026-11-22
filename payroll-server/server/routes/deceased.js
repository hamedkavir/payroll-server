// درگذشتگان: پرسنل فوت‌شده در جدول جدا (عکس ثابت از اطلاعات هنگام ثبت)، ردیف‌های بیمه عمر/سرمایه صندوق و وراث
// عکس ثابت هرگز تغییر نمی‌کند: اگر بعداً وارث وظیفه‌بگیر با همان کد پرسنلی در فایل بازنشستگان بیاید و نام در «پرسنل» عوض شود،
// اطلاعات متوفی در اینجا سالم می‌ماند.
const express = require("express");
const { sendError, isBusinessError } = require("../errors");
const router = express.Router();
const pool = require("../db");
const { toLatinDigits } = require("../textNormalize");
const { cleanAccount, cleanShaba, isValidShaba, accountFromShaba } = require("../bankAccount");

const KINDS = ["approved", "supplementary", "fund", "debtor"];
const DIVISIBLE = ["approved", "supplementary", "fund"];   // مبلغ قابل تقسیم بین وراث؛ «مانده بدهکار» تقسیم نمی‌شود
const RELATIONS = ["همسر", "پسر", "دختر", "مادر", "پدر", "خواهر", "برادر", "سایر"];
const bad = (res, message, status = 400) => res.status(status).json({ error: "invalid_input", message });
const fail = (res, err) => sendError(res, err);
const clip = (v, n) => String(v == null ? "" : v).trim().slice(0, n);
const num = (v) => { const n = Number(toLatinDigits(String(v == null ? "" : v)).replace(/[,٬\s]/g, "")); return Number.isFinite(n) ? n : NaN; };
const DATE_OK = (d) => d === "" || /^\d{4}\/\d{2}\/\d{2}$/.test(d);
const date = (v) => toLatinDigits(clip(v, 10));

const head = (r) => ({
  id: r.id, code: r.code, firstName: r.first_name, lastName: r.last_name, fatherName: r.father_name, nationalId: r.national_id,
  idNumber: r.id_number, birthDate: r.birth_date, birthPlace: r.birth_place, gender: r.gender, maritalStatus: r.marital_status,
  employmentType: r.employment_type, jobTitle: r.job_title, workplace: r.workplace, education: r.education, fieldOfStudy: r.field_of_study,
  bankAccount: r.bank_account, shaba: r.shaba, bankName: r.bank_name, lastStatus: r.last_status,
  deathDate: r.death_date, letterDate: r.letter_date, docsDate: r.docs_date, notes: r.notes || "", createdBy: r.created_by, createdAt: r.created_at,
});
const itemJSON = (r) => ({ id: r.id, kind: r.kind, amount: Number(r.amount), officeDate: r.office_date, heirsDate: r.heirs_date, refNo: r.ref_no, notes: r.notes });
const heirJSON = (r) => ({ id: r.id, paid: !!r.paid, firstName: r.first_name, lastName: r.last_name, nationalId: r.national_id, relation: r.relation, sharePercent: Number(r.share_percent), amount: Number(r.amount), account: r.account, shaba: r.shaba, bankName: r.bank_name, payDate: r.pay_date, notes: r.notes });
const baseOf = (items) => items.filter((x) => DIVISIBLE.includes(x.kind)).reduce((s, x) => s + (Number(x.amount) || 0), 0);

async function loadAll(where, vals) {
  const [rows] = await pool.query(`SELECT * FROM deceased ${where} ORDER BY death_date DESC, id DESC`, vals);
  if (!rows.length) return [];
  const ids = rows.map((r) => r.id);
  const [items] = await pool.query("SELECT * FROM deceased_items WHERE deceased_id IN (?) ORDER BY sort_order, id", [ids]);
  const [heirs] = await pool.query("SELECT * FROM deceased_heirs WHERE deceased_id IN (?) ORDER BY sort_order, id", [ids]);
  return rows.map((r) => {
    const it = items.filter((x) => x.deceased_id === r.id).map(itemJSON);
    const hs = heirs.filter((x) => x.deceased_id === r.id).map(heirJSON);
    return { ...head(r), items: it, heirs: hs };
  });
}

// GET /api/deceased -> فهرست با جمع‌ها
router.get("/", async (req, res) => {
  try {
    const list = await loadAll("", []);
    res.json({ items: list.map(({ items, heirs, ...h }) => ({ ...h, divisible: baseOf(items), debtor: items.filter((x) => x.kind === "debtor").reduce((s, x) => s + x.amount, 0),
      heirCount: heirs.length, paidCount: heirs.filter((x) => x.paid).length,
      paidAmount: heirs.filter((x) => x.paid).reduce((s, x) => s + x.amount, 0), unpaidAmount: heirs.filter((x) => !x.paid).reduce((s, x) => s + x.amount, 0),
      sharePercent: Math.round(heirs.reduce((s, x) => s + x.sharePercent, 0) * 1000) / 1000,
    })) });
  } catch (e) { fail(res, e); }
});

// GET /api/deceased/report -> همهٔ پرونده‌ها با ردیف‌ها و وراث (برای خروجی اکسل)
router.get("/report", async (req, res) => {
  try { res.json({ items: await loadAll("", []) }); } catch (e) { fail(res, e); }
});

router.get("/:id", async (req, res) => {
  try {
    const [d] = await loadAll("WHERE id = ?", [req.params.id]);
    if (!d) return res.status(404).json({ error: "not_found", message: "پرونده پیدا نشد." });
    res.json({ ...d, divisible: baseOf(d.items) });
  } catch (e) { fail(res, e); }
});

// POST /api/deceased { code, deathDate } -> علامت‌گذاری فرد به‌عنوان درگذشته و ذخیرهٔ عکس ثابت از اطلاعات پرسنل
router.post("/", async (req, res) => {
  const code = toLatinDigits(clip((req.body || {}).code, 30));
  const deathDate = date((req.body || {}).deathDate);
  if (!code) return bad(res, "کد پرسنلی لازم است.");
  if (!DATE_OK(deathDate)) return bad(res, "تاریخ فوت را به‌صورت ۱۴۰۵/۰۷/۲۰ وارد کنید.");
  try {
    const [[p]] = await pool.query("SELECT * FROM personnel WHERE code = ?", [code]);
    if (!p) return bad(res, "این کد پرسنلی در سیستم نیست.", 404);
    const [[ex]] = await pool.query("SELECT id FROM deceased WHERE code = ?", [code]);
    if (ex) return res.status(409).json({ error: "exists", message: "این فرد قبلاً به‌عنوان درگذشته ثبت شده است.", id: ex.id });
    const snap = { ...p }; delete snap.photo;
    const conn = await pool.getConnection();
    try {
    await conn.beginTransaction();
    const [r] = await conn.query(
      `INSERT INTO deceased (code, first_name, last_name, father_name, national_id, id_number, birth_date, birth_place, gender, marital_status,
         employment_type, job_title, workplace, education, field_of_study, bank_account, shaba, bank_name, last_status, snapshot, death_date, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [code, p.first_name, p.last_name, p.father_name, p.national_id, p.id_number, p.birth_date, p.birth_place, p.gender, p.marital_status,
       p.employment_type, p.job_title, p.workplace, p.education, p.field_of_study, p.bank_account, p.shaba, p.bank_name, p.status,
       JSON.stringify(snap), deathDate, clip(req.user && (req.user.fullName || req.user.username), 100)]);
    // وضعیت پرسنل ← «قطع رابطه» و ثبت در تاریخچهٔ تغییر وضعیت: «فوت در تاریخ ...»
    const old = p.status || "";
    if (old !== "قطع رابطه") {
      await conn.query("UPDATE personnel SET status = 'قطع رابطه' WHERE code = ?", [code]);
      await conn.query("INSERT INTO personnel_status_log (code, old_status, new_status, period_id, reason, note) VALUES (?, ?, 'قطع رابطه', NULL, 'فوت', ?)",
        [code, old, deathDate ? `فوت در تاریخ ${deathDate}` : "فوت"]);
    }
    await conn.commit();
    res.json({ ok: true, id: r.insertId, statusChanged: old !== "قطع رابطه" });
    } catch (e) { await conn.rollback(); throw e; } finally { conn.release(); }
  } catch (e) { fail(res, e); }
});

// PUT /api/deceased/:id { deathDate, letterDate, docsDate, notes, items:[...], heirs:[...] } -> ذخیره (جایگزینی کامل ردیف‌ها و وراث)
// نام و مشخصات متوفی (عکس ثابت) عمداً قابل ویرایش نیست.
router.put("/:id", async (req, res) => {
  const b = req.body || {};
  const deathDate = date(b.deathDate), letterDate = date(b.letterDate), docsDate = date(b.docsDate);
  for (const d of [deathDate, letterDate, docsDate]) if (!DATE_OK(d)) return bad(res, "تاریخ‌ها را به‌صورت ۱۴۰۵/۰۷/۲۰ وارد کنید.");
  const items = [];
  for (const [i, x] of (Array.isArray(b.items) ? b.items : []).entries()) {
    if (!KINDS.includes(x.kind)) return bad(res, `نوع ردیف ${i + 1} نامعتبر است.`);
    const amount = num(x.amount);
    if (!(amount >= 0)) return bad(res, `مبلغ ردیف ${i + 1} نامعتبر است.`);
    const o = date(x.officeDate), h = date(x.heirsDate);
    if (!DATE_OK(o) || !DATE_OK(h)) return bad(res, `تاریخ ردیف ${i + 1} نامعتبر است.`);
    items.push({ kind: x.kind, amount: Math.round(amount), officeDate: o, heirsDate: h, refNo: clip(toLatinDigits(x.refNo), 60), notes: clip(x.notes, 500) });
  }
  const base = baseOf(items);
  const heirs = [];
  let totalShare = 0;
  for (const [i, x] of (Array.isArray(b.heirs) ? b.heirs : []).entries()) {
    const n = i + 1, fn = clip(x.firstName, 100), ln = clip(x.lastName, 100);
    if (!fn && !ln) return bad(res, `نام وارث ${n} را وارد کنید.`);
    const share = num(x.sharePercent === "" || x.sharePercent == null ? 0 : x.sharePercent);
    if (!(share >= 0 && share <= 100)) return bad(res, `درصد سهم وارث ${n} باید بین ۰ و ۱۰۰ باشد.`);
    totalShare += share;
    const rel = clip(x.relation, 30) || "سایر";
    if (!RELATIONS.includes(rel)) return bad(res, `نسبت وارث ${n} نامعتبر است.`);
    const nid = require("../textNormalize").padNid(toLatinDigits(clip(x.nationalId, 20)).replace(/\D/g, ""));
    if (nid && nid.length !== 10) return bad(res, `کد ملی وارث ${n} باید ۱۰ رقم باشد.`);
    let shaba = cleanShaba(x.shaba), account = cleanAccount(x.account);
    if (shaba && !isValidShaba(shaba)) return bad(res, `شمارهٔ شبای وارث ${n} معتبر نیست (IR و ۲۴ رقم با رقم کنترلی درست).`);
    if (shaba && !account) account = accountFromShaba(shaba);
    const pd = date(x.payDate);
    if (!DATE_OK(pd)) return bad(res, `تاریخ واریز وارث ${n} نامعتبر است.`);
    heirs.push({ paid: x.paid ? 1 : 0, firstName: fn, lastName: ln, nationalId: nid, relation: rel, share, amount: Math.round(base * share / 100), account: clip(account, 40), shaba, bankName: clip(x.bankName, 60), payDate: pd, notes: clip(x.notes, 500) });
  }
  if (totalShare > 100.0001) return bad(res, `جمع درصد سهم وراث ${Math.round(totalShare * 1000) / 1000}٪ شده و از ۱۰۰ بیشتر است.`);
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [[cur]] = await conn.query("SELECT id FROM deceased WHERE id = ? FOR UPDATE", [req.params.id]);
    if (!cur) { await conn.rollback(); return res.status(404).json({ error: "not_found", message: "پرونده پیدا نشد." }); }
    await conn.query("UPDATE deceased SET death_date = ?, letter_date = ?, docs_date = ?, notes = ? WHERE id = ?", [deathDate, letterDate, docsDate, clip(b.notes, 10000), cur.id]);
    await conn.query("DELETE FROM deceased_items WHERE deceased_id = ?", [cur.id]);
    await conn.query("DELETE FROM deceased_heirs WHERE deceased_id = ?", [cur.id]);
    if (items.length) await conn.query("INSERT INTO deceased_items (deceased_id, sort_order, kind, amount, office_date, heirs_date, ref_no, notes) VALUES ?",
      [items.map((x, i) => [cur.id, i, x.kind, x.amount, x.officeDate, x.heirsDate, x.refNo, x.notes])]);
    if (heirs.length) await conn.query("INSERT INTO deceased_heirs (deceased_id, sort_order, first_name, last_name, national_id, relation, share_percent, amount, account, shaba, bank_name, pay_date, paid, notes) VALUES ?",
      [heirs.map((x, i) => [cur.id, i, x.firstName, x.lastName, x.nationalId, x.relation, x.share, x.amount, x.account, x.shaba, x.bankName, x.payDate, x.paid, x.notes])]);
    await conn.commit();
    res.json({ ok: true, divisible: base });
  } catch (e) { await conn.rollback(); fail(res, e); } finally { conn.release(); }
});

router.delete("/:id", async (req, res) => {
  try {
    const [r] = await pool.query("DELETE FROM deceased WHERE id = ?", [req.params.id]);
    if (!r.affectedRows) return res.status(404).json({ error: "not_found", message: "پرونده پیدا نشد." });
    res.json({ ok: true });
  } catch (e) { fail(res, e); }
});

module.exports = router;
