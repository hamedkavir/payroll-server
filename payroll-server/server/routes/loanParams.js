// /api/loan-params — پارامترهای فرمول وام صندوق
// (از routes/extras.js نسخهٔ ۱۱۰ جدا شد؛ کد مسیرها بدون تغییر رفتار)
const express = require("express");
const pool = require("../db");
const { fail, num } = require("./extrasCommon");
const { FS_DEFAULTS } = require("./formDefaults");

const loanParams = express.Router();
const LP_KEYS = ["loanWaitMonths", "loanFundShare", "loanMax"];
loanParams.get("/", async (req, res) => {
  try {
    const [rows] = await pool.query("SELECT data FROM form_settings WHERE id = 1");
    const all = { ...FS_DEFAULTS, ...((rows[0] && rows[0].data) || {}) };
    res.json(Object.fromEntries(LP_KEYS.map((k) => [k, all[k]])));
  } catch (e) { fail(res, e); }
});
loanParams.put("/", async (req, res) => {
  const b = req.body || {}, data = {};
  for (const k of LP_KEYS) {
    if (b[k] === undefined) continue;
    const v = num(b[k]);
    if (!(v >= 0)) return res.status(400).json({ error: "invalid_input", message: "مقدارها باید صفر یا بیشتر باشند." });
    data[k] = Math.round(v);
  }
  try {
    const [rows] = await pool.query("SELECT data FROM form_settings WHERE id = 1");
    const merged = { ...((rows[0] && rows[0].data) || {}), ...data };
    await pool.query("INSERT INTO form_settings (id, data) VALUES (1, ?) ON DUPLICATE KEY UPDATE data = VALUES(data)", [JSON.stringify(merged)]);
    const all = { ...FS_DEFAULTS, ...merged };
    res.json({ ok: true, ...Object.fromEntries(LP_KEYS.map((k) => [k, all[k]])) });
  } catch (e) { fail(res, e); }
});


module.exports = loanParams;
