// تعریف کد کسر: (کد + وضعیت شغلی) یکتاست؛ نوع قسط/سهم و گروه کد کسر (product_groups)
const express = require("express");
const { sendError, isBusinessError } = require("../errors");
const router = express.Router();
const pool = require("../db");
const { toLatinDigits } = require("../textNormalize");

const fail = (res, err) => sendError(res, err);
const bad = (res, message, code = 400) => res.status(code).json({ error: code === 404 ? "not_found" : "invalid_input", message });
const STATUSES = ["", "شاغل", "بازنشسته", "وظیفه بگیر"];
const SEL = "SELECT d.*, g.name AS group_name FROM deduction_codes d LEFT JOIN product_groups g ON g.id = d.group_id";
const toJSON = (r) => ({ id: r.id, code: r.code, name: r.name, empStatus: r.emp_status || "", kind: r.kind, groupId: r.group_id, groupName: r.group_name || "" });

function readBody(b) {
  const code = toLatinDigits(b.code == null ? "" : String(b.code)).trim();
  if (!/^[A-Za-z0-9]{1,20}$/.test(code)) throw new Error("کد کسر را وارد کنید (فقط عدد/حرف).");
  const name = String(b.name == null ? "" : b.name).trim().slice(0, 150);
  if (!name) throw new Error("عنوان کد کسر را وارد کنید.");
  const empStatus = String(b.empStatus == null ? "" : b.empStatus).trim();
  if (!STATUSES.includes(empStatus)) throw new Error("وضعیت شغلی باید شاغل، بازنشسته یا وظیفه بگیر باشد.");
  const kind = Number(b.kind) === 1 ? 1 : 0;
  const gid = b.groupId == null || b.groupId === "" ? null : parseInt(b.groupId, 10);
  if (gid != null && !(gid > 0)) throw new Error("گروه کد کسر نامعتبر است.");
  return { code, name, emp_status: empStatus, kind, group_id: gid };
}
const dupMsg = "این کد کسر با همین وضعیت شغلی قبلاً تعریف شده است.";

router.get("/", async (req, res) => {
  try {
    const [rows] = await pool.query(SEL);
    rows.sort((a, b) => String(a.code).localeCompare(String(b.code), "en", { numeric: true }) || String(a.emp_status).localeCompare(String(b.emp_status)));
    let groups = [];
    try { [groups] = await pool.query("SELECT id, name FROM product_groups ORDER BY name"); } catch (e) { /* جدول گروه نبود */ }
    res.json({ items: rows.map(toJSON), groups: groups.map((g) => ({ id: g.id, name: g.name })) });
  } catch (e) { fail(res, e); }
});
router.post("/", async (req, res) => {
  try {
    const o = readBody(req.body || {});
    const [r] = await pool.query("INSERT INTO deduction_codes (code, name, emp_status, kind, group_id) VALUES (?, ?, ?, ?, ?)", [o.code, o.name, o.emp_status, o.kind, o.group_id]);
    res.json({ ok: true, id: r.insertId });
  } catch (e) {
    if (e && e.code === "ER_DUP_ENTRY") return bad(res, dupMsg, 409);
    if (isBusinessError(e)) return bad(res, e.message);
    fail(res, e);
  }
});
router.patch("/:id", async (req, res) => {
  try {
    const o = readBody(req.body || {});
    const [r] = await pool.query("UPDATE deduction_codes SET code = ?, name = ?, emp_status = ?, kind = ?, group_id = ? WHERE id = ?", [o.code, o.name, o.emp_status, o.kind, o.group_id, req.params.id]);
    if (!r.affectedRows) return bad(res, "کد کسر پیدا نشد.", 404);
    res.json({ ok: true });
  } catch (e) {
    if (e && e.code === "ER_DUP_ENTRY") return bad(res, dupMsg, 409);
    if (isBusinessError(e)) return bad(res, e.message);
    fail(res, e);
  }
});
router.delete("/:id", async (req, res) => {
  try {
    const [r] = await pool.query("DELETE FROM deduction_codes WHERE id = ?", [req.params.id]);
    if (!r.affectedRows) return bad(res, "کد کسر پیدا نشد.", 404);
    res.json({ ok: true });
  } catch (e) { fail(res, e); }
});
module.exports = router;
