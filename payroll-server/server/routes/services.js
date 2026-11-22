// موسسات طرف قرارداد (تعریف متن نامه‌ها) و درخواست خدمات هر پرسنل (نامهٔ معرفی به موسسه)
const express = require("express");
const { sendError, isBusinessError, userMsg } = require("../errors");
const { isHeirStatus, HEIR_MSG } = require("../eligibility");
const { personPayroll } = require("../personPayroll");
const pool = require("../db");
const { toLatinDigits } = require("../textNormalize");
const { parse: parseJalali } = require("../jalali");

const fail = (res, err, code = 500) => (code === 500 ? sendError(res, err) : res.status(code).json({ error: "invalid_input", message: userMsg(err) }));   // ۵۰۰ = پیام عمومی؛ کدهای دیگر پیام تجاری خودمان
const bad = (res, message, code = 400) => res.status(code).json({ error: code === 404 ? "not_found" : (code === 409 ? "conflict" : "invalid_input"), message });
const num = (v) => { const n = Number(toLatinDigits(v).replace(/[,٬\s]/g, "")); return Number.isFinite(n) ? n : 0; };
const str = (v, max = 255) => toLatinDigits(v == null ? "" : String(v)).trim().slice(0, max);
const keep = (v, max = 255) => (v == null ? "" : String(v)).replace(/\r/g, "").trim().slice(0, max); // متن آزاد (ارقام تبدیل نمی‌شود)
const isAdminOrInst = (u) => u && (u.isAdmin || (u.permissions || []).includes("institutions"));

/* ======================= موسسات ======================= */
const institutions = express.Router();
const instJSON = (r, withSecrets) => ({
  id: r.id, letterCode: r.letter_code || "", name: r.name, letterTitle: r.letter_title, groupId: r.group_id || null, groupName: r.group_name || "",
  deductionCode: r.deduction_code || "", empFilter: r.emp_filter, repeatMode: r.repeat_mode,
  letterText: r.letter_text || "", footerText: r.footer_text || "", active: !!r.active, requestCount: Number(r.req_count || 0),
  webUser: withSecrets ? r.web_user : "", webPass: withSecrets ? r.web_pass : "",
});
function readInst(b) {
  const name = keep(b.name);
  if (!name) throw new Error("نام شرکت / موسسه را وارد کنید.");
  const empFilter = ["all", "active", "retired"].includes(b.empFilter) ? b.empFilter : "all";
  const repeatMode = ["repeat", "no_repeat"].includes(b.repeatMode) ? b.repeatMode : "repeat";
  const d = {
    letter_code: keep(b.letterCode, 30), name, letter_title: keep(b.letterTitle), emp_filter: empFilter, repeat_mode: repeatMode,
    letter_text: keep(b.letterText, 20000), footer_text: keep(b.footerText, 5000), active: b.active === false || b.active === 0 ? 0 : 1,
  };
  // نام کاربری/رمز وب‌سایت و گروه کد کسر دیگر در فرم نیستند؛ فقط اگر در درخواست آمده باشند به‌روز می‌شوند (مقدار قبلی پاک نمی‌شود)
  if (b.webUser !== undefined) d.web_user = keep(b.webUser, 100);
  if (b.webPass !== undefined) d.web_pass = keep(b.webPass, 100);
  if (b.groupId !== undefined) d.group_id = parseInt(b.groupId, 10) > 0 ? parseInt(b.groupId, 10) : null;
  return d;
}
// GET /api/institutions → { items, groups } (نام کاربری/رمز وب‌سایت فقط برای کسی که دسترسی «تعریف موسسات» دارد)
institutions.get("/", async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT i.*, g.name AS group_name, g.deduction_code,
              (SELECT COUNT(*) FROM service_requests s WHERE s.institution_id = i.id) AS req_count
         FROM institutions i LEFT JOIN product_groups g ON g.id = i.group_id ORDER BY i.name`);
    const [groups] = await pool.query("SELECT id, name, deduction_code FROM product_groups ORDER BY name");
    const secrets = isAdminOrInst(req.user);
    res.json({ items: rows.map((r) => instJSON(r, secrets)), groups: groups.map((g) => ({ id: g.id, name: g.name, deductionCode: g.deduction_code })) });
  } catch (e) { fail(res, e); }
});
institutions.post("/", async (req, res) => {
  let d; try { d = readInst(req.body || {}); } catch (e) { return bad(res, userMsg(e)); }
  try {
    const [r] = await pool.query("INSERT INTO institutions SET ?", [d]);
    res.json({ ok: true, id: r.insertId });
  } catch (e) { fail(res, e); }
});
institutions.put("/:id", async (req, res) => {
  let d; try { d = readInst(req.body || {}); } catch (e) { return bad(res, userMsg(e)); }
  try {
    const [r] = await pool.query("UPDATE institutions SET ? WHERE id = ?", [d, req.params.id]);
    if (!r.affectedRows) return bad(res, "موسسه پیدا نشد.", 404);
    res.json({ ok: true });
  } catch (e) { fail(res, e); }
});
institutions.delete("/:id", async (req, res) => {
  try {
    const [[c]] = await pool.query("SELECT COUNT(*) AS c FROM service_requests WHERE institution_id = ?", [req.params.id]);
    if (c.c > 0) return bad(res, `برای این موسسه ${c.c} درخواست ثبت شده است؛ به‌جای حذف، آن را «غیرفعال» کنید.`, 409);
    const [r] = await pool.query("DELETE FROM institutions WHERE id = ?", [req.params.id]);
    if (!r.affectedRows) return bad(res, "موسسه پیدا نشد.", 404);
    res.json({ ok: true });
  } catch (e) { fail(res, e); }
});

/* ======================= درخواست خدمات ======================= */
const requests = express.Router();
const SEL = `SELECT s.*, i.name AS inst_name, i.letter_title, i.repeat_mode, i.emp_filter,
                    p.first_name, p.last_name, p.national_id, p.mobile, p.status AS person_status
               FROM service_requests s JOIN institutions i ON i.id = s.institution_id LEFT JOIN personnel p ON p.code = s.code`;
const reqJSON = (r) => ({
  id: r.id, letterNumber: r.letter_number, requestDate: r.request_date, requestTime: r.request_time,
  institutionId: r.institution_id, institutionName: r.inst_name, letterTitle: r.letter_title || "",
  code: r.code, firstName: r.first_name || "", lastName: r.last_name || "", nationalId: r.national_id || "", mobile: r.mobile || "", personStatus: r.person_status || "",
  showNet: !!r.show_net, netAmount: r.net_amount == null ? null : Number(r.net_amount),
  showAmount: !!r.show_amount, amount: Number(r.amount || 0), showVisit: !!r.show_visit, visitDate: r.visit_date || "",
  letterText: r.letter_text || "", footerText: r.footer_text || "", notes: r.notes || "", createdBy: r.created_by || "",
});
const nextNumber = async (conn) => {
  let start = 1;
  try {
    const [f] = await conn.query("SELECT data FROM form_settings WHERE id = 1");
    let d = f[0] && f[0].data; if (typeof d === "string") d = JSON.parse(d);
    start = Math.max(1, Math.round(Number(d && d.serviceLetterStart) || 1));
  } catch (e) { /* پیش‌فرض ۱ */ }
  const [[m]] = await conn.query("SELECT COALESCE(MAX(letter_number), 0) AS m FROM service_requests");
  return Math.max(Number(m.m) + 1, start);
};
function readReq(b) {
  const date = str(b.requestDate), time = str(b.requestTime, 5), visit = str(b.visitDate);
  if (!parseJalali(date)) throw new Error("تاریخ درخواست را به‌صورت 1405/07/07 وارد کنید.");
  if (time && !/^\d{1,2}:\d{2}$/.test(time)) throw new Error("ساعت را به‌صورت 09:30 وارد کنید.");
  const showVisit = b.showVisit ? 1 : 0;
  if (showVisit && !parseJalali(visit)) throw new Error("تاریخ مراجعه را به‌صورت 1405/07/07 وارد کنید (یا تیک نمایش آن را بردارید).");
  const showAmount = b.showAmount ? 1 : 0, amount = Math.round(num(b.amount));
  if (showAmount && amount <= 0) throw new Error("مبلغ را وارد کنید (یا تیک نمایش مبلغ را بردارید).");
  const net = b.netAmount === null || b.netAmount === undefined || b.netAmount === "" ? null : Math.round(num(b.netAmount));
  return {
    request_date: date, request_time: time, show_net: b.showNet ? 1 : 0, net_amount: net, show_amount: showAmount, amount,
    show_visit: showVisit, visit_date: showVisit ? visit : "", letter_text: keep(b.letterText, 20000), footer_text: keep(b.footerText, 5000), notes: keep(b.notes, 500),
  };
}
// فیلتر شاغل/بازنشسته و «عدم تکرار» موسسه (در سرور کنترل می‌شود)
async function checkRules(conn, inst, person, code, ignoreId) {
  const st = String(person.status || "");
  if (inst.emp_filter === "active" && /بازنشسته|قطع/.test(st)) throw Object.assign(new Error("این موسسه فقط برای پرسنل شاغل است."), { http: 409 });
  if (inst.emp_filter === "retired" && st && !/بازنشسته/.test(st)) throw Object.assign(new Error("این موسسه فقط برای بازنشستگان است."), { http: 409 });
  if (inst.repeat_mode === "no_repeat") {
    const [r] = await conn.query("SELECT letter_number FROM service_requests WHERE institution_id = ? AND code = ?" + (ignoreId ? " AND id <> ?" : "") + " LIMIT 1", ignoreId ? [inst.id, code, ignoreId] : [inst.id, code]);
    if (r.length) throw Object.assign(new Error(`برای این فرد قبلاً به این موسسه درخواست ثبت شده (نامهٔ ${r[0].letter_number}) و موسسه «عدم تکرار» است.`), { http: 409 });
  }
}

// GET /api/services/by-person/:code
requests.get("/by-person/:code", async (req, res) => {
  try {
    const [rows] = await pool.query(SEL + " WHERE s.code = ? ORDER BY s.letter_number DESC", [str(req.params.code)]);
    res.json({ items: rows.map(reqJSON) });
  } catch (e) { fail(res, e); }
});
// GET /api/services/net/:code → آخرین فیش حقوقی فرد (همان ساختار «وضعیت مالی» فرم پرسنلی)؛ خالص دریافتی را کلاینت با همان
// تابع محاسبهٔ فیش (recOf) حساب می‌کند تا عدد دقیقاً با فرم پرسنلی یکی باشد. مرتب‌سازی در Node انجام می‌شود (نه SQL).
requests.get("/net/:code", async (req, res) => {
  try {
    const code = str(req.params.code);
    const [r] = await personPayroll(pool, code, 1);
    if (!r) return res.json({ payroll: null });
    res.json({ payroll: { kind: r.kind, data: r.data, loans: r.loans, year: r.year, month: r.month } });
  } catch (e) { fail(res, e); }
});
// GET /api/services/next-number
requests.get("/next-number", async (req, res) => { try { res.json({ next: await nextNumber(pool) }); } catch (e) { fail(res, e); } });

// POST /api/services { code, institutionId, requestDate, requestTime, showNet, netAmount, showAmount, amount, showVisit, visitDate, letterText, footerText, notes }
requests.post("/", async (req, res) => {
  const b = req.body || {}, code = str(b.code), instId = parseInt(b.institutionId, 10);
  let d; try { d = readReq(b); } catch (e) { return bad(res, userMsg(e)); }
  if (!code || !instId) return bad(res, "فرد و موسسه را انتخاب کنید.");
  const conn = await pool.getConnection();
  try {
    const person = (await conn.query("SELECT code, status FROM personnel WHERE code = ?", [code]))[0][0];
    if (!person) return bad(res, "پرسنل پیدا نشد.", 404);
    if (isHeirStatus(person.status)) return bad(res, HEIR_MSG, 409);
    const inst = (await conn.query("SELECT * FROM institutions WHERE id = ?", [instId]))[0][0];
    if (!inst) return bad(res, "موسسه پیدا نشد.", 404);
    if (!inst.active) return bad(res, "این موسسه غیرفعال است.", 409);
    await checkRules(conn, inst, person, code);
    // شمارهٔ نامه: بعدی خودکار؛ اگر هم‌زمان کسی ثبت کرد (کلید یکتا)، چند بار دوباره تلاش می‌شود
    for (let attempt = 0; attempt < 6; attempt++) {
      const number = await nextNumber(conn);
      try {
        const [r] = await conn.query("INSERT INTO service_requests SET ?", [{ ...d, letter_number: number, institution_id: instId, code, created_by: (req.user && (req.user.fullName || req.user.username)) || "" }]);
        return res.json({ ok: true, id: r.insertId, letterNumber: number });
      } catch (e) { if (e.code !== "ER_DUP_ENTRY") throw e; }
    }
    bad(res, "ثبت شمارهٔ نامه ممکن نشد؛ دوباره تلاش کنید.", 409);
  } catch (e) { e.http ? bad(res, e.message, e.http) : fail(res, e); } finally { conn.release(); }
});
// PUT /api/services/:id (ویرایش؛ فرد و شمارهٔ نامه ثابت می‌ماند، موسسه قابل تغییر است)
requests.put("/:id", async (req, res) => {
  const b = req.body || {};
  let d; try { d = readReq(b); } catch (e) { return bad(res, userMsg(e)); }
  try {
    const cur = (await pool.query("SELECT * FROM service_requests WHERE id = ?", [req.params.id]))[0][0];
    if (!cur) return bad(res, "درخواست پیدا نشد.", 404);
    const instId = parseInt(b.institutionId, 10) || cur.institution_id;
    if (instId !== cur.institution_id) {
      const inst = (await pool.query("SELECT * FROM institutions WHERE id = ?", [instId]))[0][0];
      if (!inst) return bad(res, "موسسه پیدا نشد.", 404);
      const person = (await pool.query("SELECT code, status FROM personnel WHERE code = ?", [cur.code]))[0][0];
      await checkRules(pool, inst, person || {}, cur.code, cur.id);
      d.institution_id = instId;
    }
    await pool.query("UPDATE service_requests SET ? WHERE id = ?", [d, req.params.id]);
    res.json({ ok: true });
  } catch (e) { e.http ? bad(res, e.message, e.http) : fail(res, e); }
});
requests.delete("/:id", async (req, res) => {
  try {
    const [r] = await pool.query("DELETE FROM service_requests WHERE id = ?", [req.params.id]);
    if (!r.affectedRows) return bad(res, "درخواست پیدا نشد.", 404);
    res.json({ ok: true });
  } catch (e) { fail(res, e); }
});

module.exports = { institutions, requests };
