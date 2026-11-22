// تصاویر برنامه (فعلاً «امضای مدیر» برای نامه‌ها): ذخیره در جدول app_assets، دریافت برای همهٔ کاربران واردشده، تغییر فقط با دسترسی تنظیمات
const express = require("express");
const { sendError, isBusinessError } = require("../errors");
const router = express.Router();
const pool = require("../db");

const fail = (res, err) => sendError(res, err);
const bad = (res, message) => res.status(400).json({ error: "invalid_input", message });
const MAX_BYTES = 1.5 * 1024 * 1024;

router.get("/signature", async (req, res) => {
  try {
    const [r] = await pool.query("SELECT mime, data, updated_at FROM app_assets WHERE name = 'signature'");
    if (!r.length) return res.json({ dataUrl: "" });
    res.json({ dataUrl: `data:${r[0].mime};base64,${Buffer.from(r[0].data).toString("base64")}`, updatedAt: r[0].updated_at });
  } catch (e) { fail(res, e); }
});
router.put("/signature", async (req, res) => {
  const m = /^data:(image\/(?:png|jpeg));base64,([A-Za-z0-9+/=]+)$/.exec(String((req.body || {}).dataUrl || ""));
  if (!m) return bad(res, "فقط تصویر PNG یا JPEG پذیرفته می‌شود.");
  const buf = Buffer.from(m[2], "base64");
  if (!buf.length || buf.length > MAX_BYTES) return bad(res, "حجم تصویر امضا باید کمتر از ۱٫۵ مگابایت باشد.");
  try {
    await pool.query("INSERT INTO app_assets (name, mime, data) VALUES ('signature', ?, ?) ON DUPLICATE KEY UPDATE mime = VALUES(mime), data = VALUES(data)", [m[1], buf]);
    res.json({ ok: true });
  } catch (e) { fail(res, e); }
});
router.delete("/signature", async (req, res) => {
  try { await pool.query("DELETE FROM app_assets WHERE name = 'signature'"); res.json({ ok: true }); } catch (e) { fail(res, e); }
});

module.exports = router;
