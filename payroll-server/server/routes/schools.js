// مدارس و آموزشگاه‌ها + ثبت «تغییر امضاء» حساب آموزشگاه (نامهٔ بانک)
const express = require("express");
const { sendError, isBusinessError } = require("../errors");
const router = express.Router();
const pool = require("../db");
const { toLatinDigits } = require("../textNormalize");
const { isAccount13 } = require("../bankAccount");

const bad = (res, message, status = 400) => res.status(status).json({ error: "invalid_input", message });
const fail = (res, err) => sendError(res, err);
const fa = (s) => String(s == null ? "" : s).replace(/\u064A/g, "\u06CC").replace(/\u0643/g, "\u06A9");   // ي/ك عربی ← ی/ک فارسی
const txt = (v, n) => fa(String(v == null ? "" : v).replace(/\s+/g, " ").trim()).slice(0, n);
const digits = (v) => toLatinDigits(String(v == null ? "" : v)).replace(/\D/g, "");
const intv = (v) => { const n = parseInt(digits(v), 10); return Number.isFinite(n) && n >= 0 ? Math.min(n, 1000000) : 0; };
// موبایل: ۱۰ رقم که با ۹ شروع شود (صفر اول در اکسل افتاده) ← صفر اول اضافه می‌شود
const mobile = (v) => { const d = digits(v); return d.length === 10 && d[0] === "9" ? "0" + d : d.slice(0, 20); };
const DATE_OK = (d) => d === "" || /^\d{4}\/\d{2}\/\d{2}$/.test(d);
const date = (v) => toLatinDigits(String(v == null ? "" : v).trim()).slice(0, 10);

const schoolJSON = (r) => ({
  id: r.id, code: r.code, name: r.name, area: r.area, gender: r.gender, level: r.level, schoolType: r.school_type, address: r.address,
  managerCode: r.manager_code, managerFirst: r.manager_first, managerLast: r.manager_last, managerMobile: r.manager_mobile, managerType: r.manager_type,
  phone: r.phone, postalCode: r.postal_code, shift: r.shift, oppositeShift: r.opposite_shift, classes: r.classes, students: r.students,
  account: r.account, notes: r.notes || "",
});
// ورودی ← ستون‌های جدول؛ خطا = رشتهٔ پیام
function cleanSchool(b) {
  const o = {
    code: digits(b.code).slice(0, 30), name: txt(b.name, 200), area: txt(b.area, 100), gender: txt(b.gender, 20), level: txt(b.level, 100),
    school_type: txt(b.schoolType, 60), address: txt(b.address, 500),
    manager_code: digits(b.managerCode).slice(0, 30), manager_first: txt(b.managerFirst, 100), manager_last: txt(b.managerLast, 100),
    manager_mobile: mobile(b.managerMobile), manager_type: txt(b.managerType, 40),
    phone: digits(b.phone).slice(0, 30), postal_code: digits(b.postalCode).slice(0, 15),
    shift: txt(b.shift, 80), opposite_shift: txt(b.oppositeShift, 120), classes: intv(b.classes), students: intv(b.students),
    account: digits(b.account), notes: txt(b.notes, 500),
  };
  if (!o.code) return "کد آموزشگاه را وارد کنید.";
  if (!o.name) return "نام آموزشگاه را وارد کنید.";
  if (o.account && !isAccount13(o.account)) return "شمارهٔ حساب باید دقیقاً ۱۳ رقم باشد.";
  return o;
}
const COLS = ["code", "name", "area", "gender", "level", "school_type", "address", "manager_code", "manager_first", "manager_last", "manager_mobile", "manager_type", "phone", "postal_code", "shift", "opposite_shift", "classes", "students", "account", "notes"];
const dupErr = (e) => e && (e.code === "ER_DUP_ENTRY" || /duplicate/i.test(e.message || ""));

/* ---------- تغییر امضاء ---------- */
const sigJSON = (r) => ({
  id: r.id, schoolId: r.school_id, schoolCode: r.school_code, schoolName: r.school_name, schoolGender: r.school_gender, schoolLevel: r.school_level,
  regNo: r.reg_no, letterNo: r.letter_no, reqDate: r.req_date, bankCode: r.bank_code, bankName: r.bank_name, branch: r.branch, account: r.account,
  managerCode: r.manager_code, managerName: r.manager_name, teacherCode: r.teacher_code, teacherName: r.teacher_name, parentsName: r.parents_name,
  notes: r.notes || "", createdBy: r.created_by,
});
const SIG_SELECT = `SELECT g.*, s.code AS school_code, s.name AS school_name, s.gender AS school_gender, s.level AS school_level
  FROM school_sig_changes g JOIN schools s ON s.id = g.school_id`;
async function cleanSig(b, ex) {
  const schoolId = Number(b.schoolId);
  if (!Number.isInteger(schoolId) || schoolId <= 0) return "آموزشگاه را انتخاب کنید.";
  const [srows] = await pool.query("SELECT id, account FROM schools WHERE id = ?", [schoolId]);
  const s = srows[0];
  if (!s) return "آموزشگاه پیدا نشد.";
  const o = {
    school_id: schoolId, reg_no: digits(b.regNo).slice(0, 20), letter_no: txt(toLatinDigits(String(b.letterNo || "")), 60), req_date: date(b.reqDate),
    bank_code: digits(b.bankCode).slice(0, 10), bank_name: txt(b.bankName, 80), branch: txt(b.branch, 120),
    account: digits(b.account) || s.account || "",
    manager_code: digits(b.managerCode).slice(0, 30), manager_name: txt(b.managerName, 200),
    teacher_code: digits(b.teacherCode).slice(0, 30), teacher_name: txt(b.teacherName, 200), parents_name: txt(b.parentsName, 200),
    notes: txt(b.notes, 500),
  };
  if (!DATE_OK(o.req_date)) return "تاریخ درخواست باید به شکل ۱۴۰۴/۱۱/۰۶ باشد.";
  if (o.account && !isAccount13(o.account)) return "شمارهٔ حساب باید دقیقاً ۱۳ رقم باشد.";
  if (!o.bank_name) return "نام بانک را وارد کنید.";
  if (!o.manager_name) return "نام مدیر را وارد کنید.";
  if (!o.teacher_name) return "نمایندهٔ معلمان را وارد کنید.";
  if (!o.parents_name) return "نمایندهٔ انجمن اولیاء را وارد کنید.";
  if (!o.reg_no && !(ex && ex.reg_no)) {   // شمارهٔ ثبت خودکار: یکی بیشتر از بزرگ‌ترین شمارهٔ قبلی (اگر شمارهٔ قبلی هست)
    const [[m]] = await pool.query("SELECT MAX(CAST(reg_no AS UNSIGNED)) AS m FROM school_sig_changes WHERE reg_no <> ''");
    o.reg_no = m && Number(m.m) > 0 ? String(Number(m.m) + 1) : "";
  }
  return o;
}
const SIG_COLS = ["school_id", "reg_no", "letter_no", "req_date", "bank_code", "bank_name", "branch", "account", "manager_code", "manager_name", "teacher_code", "teacher_name", "parents_name", "notes"];

router.get("/sig-changes", async (req, res) => {
  try { const [rows] = await pool.query(`${SIG_SELECT} ORDER BY g.req_date DESC, g.id DESC`); res.json({ items: rows.map(sigJSON) }); }
  catch (e) { fail(res, e); }
});
router.post("/sig-changes", async (req, res) => {
  try {
    const o = await cleanSig(req.body || {});
    if (typeof o === "string") return bad(res, o);
    const [r] = await pool.query(`INSERT INTO school_sig_changes (${SIG_COLS.join(",")}, created_by) VALUES (${SIG_COLS.map(() => "?").join(",")}, ?)`,
      [...SIG_COLS.map((c) => o[c]), String((req.user && req.user.username) || "").slice(0, 100)]);
    const [rows] = await pool.query(`${SIG_SELECT} WHERE g.id = ?`, [r.insertId]);
    res.json(sigJSON(rows[0]));
  } catch (e) { fail(res, e); }
});
router.put("/sig-changes/:id", async (req, res) => {
  try {
    const [exr] = await pool.query("SELECT * FROM school_sig_changes WHERE id = ?", [req.params.id]);
    const ex = exr[0];
    if (!ex) return bad(res, "ردیف پیدا نشد.", 404);
    const o = await cleanSig(req.body || {}, ex);
    if (typeof o === "string") return bad(res, o);
    await pool.query(`UPDATE school_sig_changes SET ${SIG_COLS.map((c) => c + " = ?").join(", ")} WHERE id = ?`, [...SIG_COLS.map((c) => (c === "reg_no" && !o.reg_no ? ex.reg_no : o[c])), req.params.id]);
    const [rows] = await pool.query(`${SIG_SELECT} WHERE g.id = ?`, [req.params.id]);
    res.json(sigJSON(rows[0]));
  } catch (e) { fail(res, e); }
});
router.delete("/sig-changes/:id", async (req, res) => {
  try { const [r] = await pool.query("DELETE FROM school_sig_changes WHERE id = ?", [req.params.id]); if (!r.affectedRows) return bad(res, "ردیف پیدا نشد.", 404); res.json({ ok: true }); }
  catch (e) { fail(res, e); }
});

/* ---------- مدارس ---------- */
router.get("/", async (req, res) => {
  try { const [rows] = await pool.query("SELECT * FROM schools"); const col = new Intl.Collator("fa"); res.json({ items: rows.map(schoolJSON).sort((a, b) => col.compare(a.name, b.name)) }); }
  catch (e) { fail(res, e); }
});
router.post("/", async (req, res) => {
  const o = cleanSchool(req.body || {});
  if (typeof o === "string") return bad(res, o);
  try {
    const [r] = await pool.query(`INSERT INTO schools (${COLS.join(",")}) VALUES (${COLS.map(() => "?").join(",")})`, COLS.map((c) => o[c]));
    const [rows] = await pool.query("SELECT * FROM schools WHERE id = ?", [r.insertId]);
    res.json(schoolJSON(rows[0]));
  } catch (e) { if (dupErr(e)) return bad(res, "این کد آموزشگاه قبلاً ثبت شده است.", 409); fail(res, e); }
});
router.put("/:id", async (req, res) => {
  const o = cleanSchool(req.body || {});
  if (typeof o === "string") return bad(res, o);
  try {
    const [r] = await pool.query(`UPDATE schools SET ${COLS.map((c) => c + " = ?").join(", ")} WHERE id = ?`, [...COLS.map((c) => o[c]), req.params.id]);
    if (!r.affectedRows) return bad(res, "آموزشگاه پیدا نشد.", 404);
    const [rows] = await pool.query("SELECT * FROM schools WHERE id = ?", [req.params.id]);
    res.json(schoolJSON(rows[0]));
  } catch (e) { if (dupErr(e)) return bad(res, "این کد آموزشگاه قبلاً ثبت شده است.", 409); fail(res, e); }
});
router.delete("/:id", async (req, res) => {
  try { const [r] = await pool.query("DELETE FROM schools WHERE id = ?", [req.params.id]); if (!r.affectedRows) return bad(res, "آموزشگاه پیدا نشد.", 404); res.json({ ok: true }); }
  catch (e) { fail(res, e); }
});

// POST /api/schools/import { schools:[...] } -> ایجاد یا به‌روزرسانی بر اساس «کد آموزشگاه» (دسته‌ای؛ کلاینت تکه‌تکه می‌فرستد)
router.post("/import", async (req, res) => {
  const list = Array.isArray((req.body || {}).schools) ? req.body.schools : null;
  if (!list) return bad(res, "فهرست آموزشگاه‌ها لازم است.");
  let created = 0, updated = 0; const errors = [];
  try {
    for (let i = 0; i < list.length; i++) {
      const o = cleanSchool(list[i] || {});
      if (typeof o === "string") { errors.push(`ردیف ${i + 1}: ${o}`); continue; }
      const [r] = await pool.query(
        `INSERT INTO schools (${COLS.join(",")}) VALUES (${COLS.map(() => "?").join(",")})
         ON DUPLICATE KEY UPDATE ${COLS.filter((c) => c !== "code").map((c) => `${c} = VALUES(${c})`).join(", ")}`, COLS.map((c) => o[c]));
      if (r.affectedRows === 1) created++; else updated++;   // MySQL: ۱ = ردیف جدید، ۲ = به‌روزرسانی
    }
    res.json({ created, updated, errors: errors.slice(0, 20), errorCount: errors.length });
  } catch (e) { fail(res, e); }
});

module.exports = router;
