const express = require("express");
const { sendError, isBusinessError } = require("../errors");
const router = express.Router();
const pool = require("../db");

// شکل خروجی تنظیمات (مشترک بین GET /api/settings و GET /api/sync)
const settingsJSON = (s = {}) => ({
  companyName: s.company_name || "",
  companySub: s.company_sub || "",
  unit: s.unit || "ریال",
  showEmployer: !!s.show_employer,
  showZero: !!s.show_zero,
});
async function readSettings(db = pool) {
  const [rows] = await db.query("SELECT * FROM settings WHERE id = 1");
  return settingsJSON(rows[0] || {});
}

// GET /api/settings
router.get("/", async (req, res) => {
  try {
    res.json(await readSettings());
  } catch (err) {
    sendError(res, err);
  }
});

// PUT /api/settings  { companyName, companySub, unit, showEmployer, showZero }
router.put("/", async (req, res) => {
  const { companyName = "", companySub = "", unit = "ریال", showEmployer = true, showZero = false } = req.body || {};
  try {
    await pool.query(
      `INSERT INTO settings (id, company_name, company_sub, unit, show_employer, show_zero)
       VALUES (1, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         company_name = VALUES(company_name),
         company_sub  = VALUES(company_sub),
         unit         = VALUES(unit),
         show_employer= VALUES(show_employer),
         show_zero    = VALUES(show_zero)`,
      [companyName, companySub, unit, showEmployer ? 1 : 0, showZero ? 1 : 0]
    );
    res.json({ ok: true });
  } catch (err) {
    sendError(res, err);
  }
});

module.exports = router;
module.exports.readSettings = readSettings;
module.exports.settingsJSON = settingsJSON;
