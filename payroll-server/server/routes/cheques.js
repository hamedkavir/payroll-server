// صدور دسته چک: ثبت درخواست برای هر فرد (شماره، تاریخ، بانک و شعبه، شمارهٔ حساب)، سوابق، گزارش همهٔ افراد و داده‌های نامهٔ معرفی
const express = require("express");
const { sendError, isBusinessError } = require("../errors");
const router = express.Router();
const pool = require("../db");
const { toLatinDigits, sqlNormExpr, likePattern, normalizeSearch } = require("../textNormalize");
const { pageParams, limitSql, pageMeta } = require("../paging");

const fail = (res, err) => sendError(res, err);
const bad = (res, message, code = 400) => res.status(code).json({ error: code === 404 ? "not_found" : "invalid_input", message });
const str = (v, max = 150) => toLatinDigits(v == null ? "" : String(v)).replace(/\s+/g, " ").trim().slice(0, max);
const strKeep = (v, max = 150) => String(v == null ? "" : v).replace(/\s+/g, " ").trim().slice(0, max);
const digits = (v, max = 40) => toLatinDigits(v == null ? "" : String(v)).replace(/\D/g, "").slice(0, max);
const DATE_RE = /^\d{4}\/\d{2}\/\d{2}$/;

const SEL = "SELECT c.*, p.first_name, p.last_name, p.national_id, p.gender FROM cheque_requests c LEFT JOIN personnel p ON p.code = c.code";
const toJSON = (r) => ({
  id: r.id, serial: r.serial, code: r.code, firstName: r.first_name || "", lastName: r.last_name || "", name: [r.first_name, r.last_name].filter(Boolean).join(" "),
  nationalId: r.national_id || "", gender: r.gender || "", reqDate: r.req_date, bankCode: r.bank_code || "", bankName: r.bank_name, branchCode: r.branch_code || "", branchName: r.branch_name || "",
  account: r.account, createdBy: r.created_by || "",
});

router.get("/next-serial", async (req, res) => {
  try { const [[m]] = await pool.query("SELECT MAX(serial) AS m FROM cheque_requests"); res.json({ serial: m.m == null ? null : Number(m.m) + 1 }); } catch (e) { fail(res, e); }
});
router.get("/by-person/:code", async (req, res) => {
  try {
    const [rows] = await pool.query(`${SEL} WHERE c.code = ? ORDER BY c.req_date DESC, c.serial DESC`, [str(req.params.code, 50)]);
    res.json({ items: rows.map(toJSON) });
  } catch (e) { fail(res, e); }
});
// GET /api/cheques?q=&from=&to=&bank=&page=&pageSize=&all=1
router.get("/", async (req, res) => {
  const where = [], vals = [];
  const from = String(req.query.from || "").trim(), to = String(req.query.to || "").trim();
  if (from) { if (!DATE_RE.test(from)) return bad(res, "تاریخ شروع نامعتبر است."); where.push("c.req_date >= ?"); vals.push(from); }
  if (to) { if (!DATE_RE.test(to)) return bad(res, "تاریخ پایان نامعتبر است."); where.push("c.req_date <= ?"); vals.push(to); }
  const bank = str(req.query.bank, 20);
  if (bank) { where.push("c.bank_code = ?"); vals.push(bank); }
  const q = String(req.query.q || "").trim();
  if (q && normalizeSearch(q)) {
    where.push(`(${sqlNormExpr("c.code")} LIKE ? OR ${sqlNormExpr("CONCAT(p.first_name, p.last_name)")} LIKE ? OR CAST(c.serial AS CHAR) LIKE ?)`);
    const pat = likePattern(q); vals.push(pat, pat, `%${toLatinDigits(q)}%`);
  }
  try {
    const W = where.length ? "WHERE " + where.join(" AND ") : "";
    const pg = pageParams(req.query), [lim, limVals] = limitSql(pg);
    const [[agg]] = await pool.query(`SELECT COUNT(*) AS n FROM cheque_requests c LEFT JOIN personnel p ON p.code = c.code ${W}`, vals);
    const [rows] = await pool.query(`${SEL} ${W} ORDER BY c.req_date DESC, c.serial DESC ${lim}`, [...vals, ...limVals]);
    res.json({ items: rows.map(toJSON), ...pageMeta(pg, Number(agg.n)) });
  } catch (e) { fail(res, e); }
});

function readBody(b, partial) {
  const o = {};
  if (!partial || b.reqDate !== undefined) { const d = str(b.reqDate, 10); if (!DATE_RE.test(d)) throw new Error("تاریخ درخواست را به‌صورت 1405/07/26 وارد کنید."); o.req_date = d; }
  if (!partial || b.bankName !== undefined) { const n = strKeep(b.bankName, 120); if (!n) throw new Error("بانک را انتخاب کنید."); o.bank_name = n; }
  if (b.bankCode !== undefined) o.bank_code = str(b.bankCode, 20);
  if (b.branchCode !== undefined) o.branch_code = str(b.branchCode, 20);
  if (b.branchName !== undefined) o.branch_name = strKeep(b.branchName, 150);
  if (!partial || b.account !== undefined) { const a = digits(b.account, 40); if (a.length < 6) throw new Error("شمارهٔ حساب را وارد کنید."); o.account = a; }
  if (b.serial !== undefined && String(b.serial).trim() !== "") { const s = parseInt(digits(b.serial, 9), 10); if (!(s > 0)) throw new Error("شمارهٔ درخواست نامعتبر است."); o.serial = s; }
  return o;
}
const dup = (e) => e && e.code === "ER_DUP_ENTRY";

router.post("/", async (req, res) => {
  const b = req.body || {}, code = str(b.code, 50);
  if (!code) return bad(res, "کد پرسنلی لازم است.");
  try {
    const [p] = await pool.query("SELECT code FROM personnel WHERE code = ?", [code]);
    if (!p.length) return bad(res, "این کد پرسنلی در کارگزینی نیست.", 404);
    const o = readBody(b, false);
    if (o.serial === undefined) {
      const [[m]] = await pool.query("SELECT MAX(serial) AS m FROM cheque_requests");
      if (m.m == null) return bad(res, "شمارهٔ اولین درخواست را وارد کنید؛ شمارهٔ بعدی‌ها خودکار یکی یکی زیاد می‌شود.");
      o.serial = Number(m.m) + 1;
    }
    o.code = code; o.created_by = (req.user && (req.user.fullName || req.user.username)) || "";
    const cols = Object.keys(o);
    const [r] = await pool.query(`INSERT INTO cheque_requests (${cols.join(",")}) VALUES (${cols.map(() => "?").join(",")})`, cols.map((c) => o[c]));
    res.json({ ok: true, id: r.insertId, serial: o.serial });
  } catch (e) {
    if (dup(e)) return bad(res, "این شمارهٔ درخواست قبلاً ثبت شده است.");
    if (isBusinessError(e)) return bad(res, e.message);
    fail(res, e);
  }
});
router.patch("/:id", async (req, res) => {
  try {
    const o = readBody(req.body || {}, true), cols = Object.keys(o);
    if (!cols.length) return bad(res, "چیزی برای ذخیره نیست.");
    const [r] = await pool.query(`UPDATE cheque_requests SET ${cols.map((c) => `${c} = ?`).join(", ")} WHERE id = ?`, [...cols.map((c) => o[c]), req.params.id]);
    if (!r.affectedRows) return bad(res, "درخواست پیدا نشد.", 404);
    res.json({ ok: true });
  } catch (e) {
    if (dup(e)) return bad(res, "این شمارهٔ درخواست قبلاً ثبت شده است.");
    if (isBusinessError(e)) return bad(res, e.message);
    fail(res, e);
  }
});
router.delete("/:id", async (req, res) => {
  try { const [r] = await pool.query("DELETE FROM cheque_requests WHERE id = ?", [req.params.id]); if (!r.affectedRows) return bad(res, "درخواست پیدا نشد.", 404); res.json({ ok: true }); }
  catch (e) { fail(res, e); }
});

module.exports = router;
