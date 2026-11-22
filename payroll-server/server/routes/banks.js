// تعریف بانک و شعبه (برای نامهٔ دریافت دسته چک و ...): CRUD، جست‌وجوی شعبه و ورود از اکسل (شیت‌های «بانک» و «شعب»)
const express = require("express");
const { sendError, isBusinessError } = require("../errors");
const router = express.Router();
const pool = require("../db");
const { toLatinDigits } = require("../textNormalize");

const fail = (res, err) => sendError(res, err);
const bad = (res, message, code = 400) => res.status(code).json({ error: code === 404 ? "not_found" : "invalid_input", message });
const fa = (s) => String(s == null ? "" : s).replace(/\u064A/g, "\u06CC").replace(/\u0643/g, "\u06A9");
const txt = (v, n) => fa(String(v == null ? "" : v).replace(/\s+/g, " ").trim()).slice(0, n);
const code = (v) => toLatinDigits(String(v == null ? "" : v)).replace(/\s+/g, "").slice(0, 20);

router.get("/", async (req, res) => {
  try {
    const [rows] = await pool.query("SELECT b.id, b.code, b.name, (SELECT COUNT(*) FROM bank_branches x WHERE x.bank_id = b.id) AS branches FROM banks b ORDER BY CAST(b.code AS UNSIGNED), b.code");
    res.json({ items: rows.map((r) => ({ id: r.id, code: r.code, name: r.name, branches: Number(r.branches) })) });
  } catch (e) { fail(res, e); }
});
// شعب یک بانک (با جست‌وجو در نام/کد؛ سقف ۶۰ نتیجه برای فهرست انتخاب، all=1 برای مدیریت)
router.get("/:id/branches", async (req, res) => {
  try {
    const q = txt(req.query.q, 60), vals = [req.params.id];
    let w = "bank_id = ?";
    if (q) { w += " AND (name LIKE ? OR code LIKE ?)"; vals.push(`%${q}%`, `%${toLatinDigits(q)}%`); }
    const lim = req.query.all === "1" ? 3000 : 60;
    const [rows] = await pool.query(`SELECT id, code, name FROM bank_branches WHERE ${w} ORDER BY CAST(code AS UNSIGNED), code LIMIT ${lim}`, vals);
    res.json({ items: rows });
  } catch (e) { fail(res, e); }
});

router.post("/", async (req, res) => {
  const c = code((req.body || {}).code), n = txt((req.body || {}).name, 120);
  if (!c || !n) return bad(res, "کد و نام بانک را وارد کنید.");
  try { const [r] = await pool.query("INSERT INTO banks (code, name) VALUES (?, ?)", [c, n]); res.json({ ok: true, id: r.insertId }); }
  catch (e) { if (e.code === "ER_DUP_ENTRY") return bad(res, "بانکی با این کد قبلاً تعریف شده است."); fail(res, e); }
});
router.patch("/:id", async (req, res) => {
  const c = code((req.body || {}).code), n = txt((req.body || {}).name, 120);
  if (!c || !n) return bad(res, "کد و نام بانک را وارد کنید.");
  try {
    const [r] = await pool.query("UPDATE banks SET code = ?, name = ? WHERE id = ?", [c, n, req.params.id]);
    if (!r.affectedRows) return bad(res, "بانک پیدا نشد.", 404);
    await pool.query("UPDATE cheque_requests SET bank_name = ? WHERE bank_code = ? AND bank_code <> ''", [n, c]);
    res.json({ ok: true });
  } catch (e) { if (e.code === "ER_DUP_ENTRY") return bad(res, "بانکی با این کد قبلاً تعریف شده است."); fail(res, e); }
});
router.delete("/:id", async (req, res) => {
  try { const [r] = await pool.query("DELETE FROM banks WHERE id = ?", [req.params.id]); if (!r.affectedRows) return bad(res, "بانک پیدا نشد.", 404); res.json({ ok: true }); }
  catch (e) { fail(res, e); }
});

router.post("/:id/branches", async (req, res) => {
  const c = code((req.body || {}).code), n = txt((req.body || {}).name, 150);
  if (!c || !n) return bad(res, "کد و نام شعبه را وارد کنید.");
  try { const [r] = await pool.query("INSERT INTO bank_branches (bank_id, code, name) VALUES (?, ?, ?)", [req.params.id, c, n]); res.json({ ok: true, id: r.insertId }); }
  catch (e) { if (e.code === "ER_DUP_ENTRY") return bad(res, "شعبه‌ای با این کد در این بانک قبلاً تعریف شده است."); if (e.code === "ER_NO_REFERENCED_ROW_2") return bad(res, "بانک پیدا نشد.", 404); fail(res, e); }
});
router.patch("/branches/:bid", async (req, res) => {
  const c = code((req.body || {}).code), n = txt((req.body || {}).name, 150);
  if (!c || !n) return bad(res, "کد و نام شعبه را وارد کنید.");
  try {
    const [r] = await pool.query("UPDATE bank_branches SET code = ?, name = ? WHERE id = ?", [c, n, req.params.bid]);
    if (!r.affectedRows) return bad(res, "شعبه پیدا نشد.", 404);
    res.json({ ok: true });
  } catch (e) { if (e.code === "ER_DUP_ENTRY") return bad(res, "شعبه‌ای با این کد در این بانک قبلاً تعریف شده است."); fail(res, e); }
});
router.delete("/branches/:bid", async (req, res) => {
  try { const [r] = await pool.query("DELETE FROM bank_branches WHERE id = ?", [req.params.bid]); if (!r.affectedRows) return bad(res, "شعبه پیدا نشد.", 404); res.json({ ok: true }); }
  catch (e) { fail(res, e); }
});

// ورود از اکسل: {banks:[{code,name}], branches:[{bankCode,code,name}]} (هر بار حداکثر ۱۰۰۰ ردیف؛ ردیف موجود به‌روز می‌شود)
router.post("/import", async (req, res) => {
  const banks = Array.isArray((req.body || {}).banks) ? req.body.banks.slice(0, 1000) : [];
  const branches = Array.isArray((req.body || {}).branches) ? req.body.branches.slice(0, 1000) : [];
  try {
    let nb = 0, nr = 0, skipped = 0;
    for (const b of banks) {
      const c = code(b.code), n = txt(b.name, 120);
      if (!c || !n) { skipped++; continue; }
      await pool.query("INSERT INTO banks (code, name) VALUES (?, ?) ON DUPLICATE KEY UPDATE name = VALUES(name)", [c, n]); nb++;
    }
    if (branches.length) {
      const [bl] = await pool.query("SELECT id, code FROM banks");
      const idOf = Object.fromEntries(bl.map((b) => [b.code, b.id]));
      const rows = [];
      for (const r of branches) {
        const bid = idOf[code(r.bankCode)], c = code(r.code), n = txt(r.name, 150);
        if (!bid || !c || !n) { skipped++; continue; }
        rows.push([bid, c, n]);
      }
      if (rows.length) { await pool.query("INSERT INTO bank_branches (bank_id, code, name) VALUES ? ON DUPLICATE KEY UPDATE name = VALUES(name)", [rows]); nr = rows.length; }
    }
    res.json({ ok: true, banks: nb, branches: nr, skipped });
  } catch (e) { fail(res, e); }
});

module.exports = router;
