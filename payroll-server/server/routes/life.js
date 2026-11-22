// بیمه عمر (مصوب / مکمل) برای هر فرد + استفاده‌کنندگان از سرمایه (ذینفعان)
// شمارهٔ بیمه عمر خودکار است (ادامهٔ بزرگ‌ترین شماره؛ شمارهٔ شروع از تنظیمات: lifeNumberStart)
const express = require("express");
const { sendError, isBusinessError, userMsg } = require("../errors");
const router = express.Router();
const pool = require("../db");
const { toLatinDigits } = require("../textNormalize");

const fail = (res, err) => sendError(res, err);
const bad = (res, message, code = 400) => res.status(code).json({ error: code === 404 ? "not_found" : "invalid_input", message });
const str = (v, max = 255) => toLatinDigits(v == null ? "" : String(v)).trim().slice(0, max);
const strKeep = (v, max = 255) => (v == null ? "" : String(v)).trim().slice(0, max);
const num = (v) => { const n = Number(toLatinDigits(v == null ? "" : String(v)).replace(/[,٬\s]/g, "")); return Number.isFinite(n) ? n : 0; };
const DATE_RE = /^\d{4}\/\d{2}\/\d{2}$/;
const TYPES = ["mosavab", "mokammel"];

const polJSON = (r, bens) => ({ id: r.id, number: r.number, code: r.code, insType: r.ins_type, chequeSerial: r.cheque_serial || "", chequeDate: r.cheque_date || "", description: r.description || "", regDate: r.reg_date, createdBy: r.created_by || "", beneficiaries: bens || [] });
const benJSON = (r) => ({ id: r.id, policyId: r.policy_id, firstName: r.first_name, lastName: r.last_name, nationalId: r.national_id, idNumber: r.id_number, issuePlace: r.issue_place, relation: r.relation, sharePercent: Number(r.share_percent), description: r.description || "", active: !!r.active, amount: r.amount == null ? null : Number(r.amount), account: r.account || "", bank: r.bank || "", regDate: r.reg_date || "" });

router.get("/by-person/:code", async (req, res) => {
  try {
    const [pols] = await pool.query("SELECT * FROM life_insurance WHERE code = ?", [str(req.params.code, 50)]);
    pols.sort((a, b) => a.number - b.number);
    let bens = [];
    if (pols.length) [bens] = await pool.query(`SELECT * FROM life_beneficiaries WHERE policy_id IN (${pols.map(() => "?").join(",")})`, pols.map((p) => p.id));
    bens.sort((a, b) => a.id - b.id);
    res.json({ items: pols.map((p) => polJSON(p, bens.filter((b) => b.policy_id === p.id).map(benJSON))) });
  } catch (e) { fail(res, e); }
});

const nextNumber = async (conn) => {
  let start = 1;
  try {
    const [f] = await conn.query("SELECT data FROM form_settings WHERE id = 1");
    let d = f[0] && f[0].data; if (typeof d === "string") d = JSON.parse(d);
    start = Math.max(1, Math.round(Number(d && d.lifeNumberStart) || 1));
  } catch (e) { /* پیش‌فرض ۱ */ }
  const [[m]] = await conn.query("SELECT COALESCE(MAX(number), 0) AS m FROM life_insurance");
  return Math.max(Number(m.m) + 1, start);
};

function readPolicy(b, partial) {
  const o = {};
  if (!partial || b.insType !== undefined) { if (!TYPES.includes(b.insType)) throw new Error("نوع بیمه را انتخاب کنید (مصوب یا مکمل)."); o.ins_type = b.insType; }
  if (b.chequeSerial !== undefined) o.cheque_serial = str(b.chequeSerial, 50);
  if (b.chequeDate !== undefined) { const d = str(b.chequeDate, 10); if (d && !DATE_RE.test(d)) throw new Error("تاریخ چک را به‌صورت 1402/03/11 وارد کنید (یا خالی بگذارید)."); o.cheque_date = d; }
  if (b.description !== undefined) o.description = strKeep(b.description);
  return o;
}

router.post("/", async (req, res) => {
  const b = req.body || {};
  const code = str(b.code, 50);
  if (!code) return bad(res, "کد پرسنلی لازم است.");
  let o;
  try { o = readPolicy(b, false); } catch (e) { return bad(res, userMsg(e)); }
  const regDate = str(b.regDate, 10);
  if (!DATE_RE.test(regDate)) return bad(res, "تاریخ ثبت نامعتبر است.");
  const conn = await pool.getConnection();
  try {
    const [p] = await conn.query("SELECT code FROM personnel WHERE code = ?", [code]);
    if (!p.length) return bad(res, "این کد پرسنلی در کارگزینی نیست.", 404);
    for (let attempt = 0; attempt < 3; attempt++) {
      const number = await nextNumber(conn);
      try {
        const [r] = await conn.query("INSERT INTO life_insurance (number, code, ins_type, cheque_serial, cheque_date, description, reg_date, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
          [number, code, o.ins_type, o.cheque_serial || "", o.cheque_date || "", o.description || "", regDate, (req.user && (req.user.fullName || req.user.username)) || ""]);
        return res.json({ ok: true, id: r.insertId, number });
      } catch (e) { if (!(e && e.code === "ER_DUP_ENTRY")) throw e; }   // هم‌زمانی: شمارهٔ بعدی
    }
    bad(res, "شمارهٔ بیمه عمر تولید نشد؛ دوباره تلاش کنید.", 409);
  } catch (e) { fail(res, e); } finally { conn.release(); }
});

// استفاده‌کنندگان (قبل از «/:id» تا با آن قاطی نشود)
function readBen(b, partial) {
  const o = {};
  const S = (k, c, max) => { if (!partial || b[k] !== undefined) o[c] = (c === "description" || c === "bank" || c === "issue_place" || c === "first_name" || c === "last_name" || c === "relation") ? strKeep(b[k], max) : str(b[k], max); };
  S("firstName", "first_name", 100); S("lastName", "last_name", 100); S("nationalId", "national_id", 20); S("idNumber", "id_number", 20);
  S("issuePlace", "issue_place", 100); S("relation", "relation", 50); S("description", "description", 255); S("account", "account", 50); S("bank", "bank", 100);
  if (!partial || b.firstName !== undefined || b.lastName !== undefined) { if (!(o.first_name || o.last_name)) throw new Error("نام یا نام خانوادگی استفاده‌کننده را وارد کنید."); }
  if (!partial || b.sharePercent !== undefined) { const sp = num(b.sharePercent); if (!(sp > 0 && sp <= 100)) throw new Error("درصد سهم باید بین ۱ تا ۱۰۰ باشد."); o.share_percent = sp; }
  if (b.active !== undefined) o.active = b.active ? 1 : 0;
  if (b.amount !== undefined) { const s = String(b.amount == null ? "" : b.amount).trim(); o.amount = s === "" ? null : Math.max(0, Math.round(num(s))); }
  return o;
}
// جمع درصد سهم استفاده‌کنندگانِ فعال یک بیمه‌نامه نباید از ۱۰۰ بیشتر شود
async function checkShares(conn, policyId, exceptId, share, active) {
  // همهٔ استفاده‌کنندگان فعال حساب می‌شوند (فیلد «فعال» از فرم حذف شد)
  const [[r]] = await conn.query("SELECT COALESCE(SUM(share_percent), 0) AS s FROM life_beneficiaries WHERE policy_id = ? AND id <> ?", [policyId, exceptId || 0]);
  if (Number(r.s) + Number(share) > 100.0001) throw Object.assign(new Error(`جمع درصد سهم استفاده‌کنندگان از ۱۰۰ بیشتر می‌شود (الان ${Number(r.s)}٪ ثبت شده است).`), { soft: true });
}

router.post("/:id/beneficiaries", async (req, res) => {
  try {
    const [[pol]] = await pool.query("SELECT id FROM life_insurance WHERE id = ?", [req.params.id]);
    if (!pol) return bad(res, "بیمه‌نامه پیدا نشد.", 404);
    const o = readBen(req.body || {}, false);
    if (o.active === undefined) o.active = 1;
    await checkShares(pool, pol.id, 0, o.share_percent, o.active);
    o.policy_id = pol.id; o.reg_date = str((req.body || {}).regDate, 10);
    const cols = Object.keys(o);
    const [r] = await pool.query(`INSERT INTO life_beneficiaries (${cols.join(",")}) VALUES (${cols.map(() => "?").join(",")})`, cols.map((c) => o[c]));
    res.json({ ok: true, id: r.insertId });
  } catch (e) { if (e && e.soft || isBusinessError(e)) return bad(res, e.message); fail(res, e); }
});
router.patch("/beneficiaries/:bid", async (req, res) => {
  try {
    const [[cur]] = await pool.query("SELECT * FROM life_beneficiaries WHERE id = ?", [req.params.bid]);
    if (!cur) return bad(res, "استفاده‌کننده پیدا نشد.", 404);
    const o = readBen(req.body || {}, true);
    const share = o.share_percent != null ? o.share_percent : cur.share_percent;
    const active = o.active != null ? o.active : cur.active;
    await checkShares(pool, cur.policy_id, cur.id, share, active);
    const cols = Object.keys(o);
    if (!cols.length) return bad(res, "چیزی برای ذخیره نیست.");
    await pool.query(`UPDATE life_beneficiaries SET ${cols.map((c) => `${c} = ?`).join(", ")} WHERE id = ?`, [...cols.map((c) => o[c]), cur.id]);
    res.json({ ok: true });
  } catch (e) { if (e && e.soft || isBusinessError(e)) return bad(res, e.message); fail(res, e); }
});
router.delete("/beneficiaries/:bid", async (req, res) => {
  try {
    const [r] = await pool.query("DELETE FROM life_beneficiaries WHERE id = ?", [req.params.bid]);
    if (!r.affectedRows) return bad(res, "استفاده‌کننده پیدا نشد.", 404);
    res.json({ ok: true });
  } catch (e) { fail(res, e); }
});

router.patch("/:id", async (req, res) => {
  try {
    const o = readPolicy(req.body || {}, true);
    const cols = Object.keys(o);
    if (!cols.length) return bad(res, "چیزی برای ذخیره نیست.");
    const [r] = await pool.query(`UPDATE life_insurance SET ${cols.map((c) => `${c} = ?`).join(", ")} WHERE id = ?`, [...cols.map((c) => o[c]), req.params.id]);
    if (!r.affectedRows) return bad(res, "بیمه‌نامه پیدا نشد.", 404);
    res.json({ ok: true });
  } catch (e) { if (isBusinessError(e)) return bad(res, e.message); fail(res, e); }
});
router.delete("/:id", async (req, res) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await conn.query("DELETE FROM life_beneficiaries WHERE policy_id = ?", [req.params.id]);
    const [r] = await conn.query("DELETE FROM life_insurance WHERE id = ?", [req.params.id]);
    if (!r.affectedRows) { await conn.rollback(); return bad(res, "بیمه‌نامه پیدا نشد.", 404); }
    await conn.commit();
    res.json({ ok: true });
  } catch (e) { await conn.rollback(); fail(res, e); } finally { conn.release(); }
});

module.exports = router;
