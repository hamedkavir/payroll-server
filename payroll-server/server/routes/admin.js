// راه‌اندازی اولیه: پاک‌سازی کامل اطلاعات برای نصب جدید (فقط مدیر؛ با رمز عبور مدیر)
const express = require("express");
const { sendError, isBusinessError } = require("../errors");
const router = express.Router();
const pool = require("../db");
const { verifyPasswordAsync: verifyPassword } = require("../auth");
const { backup } = require("./backup");

// جدول‌هایی که هرگز پاک نمی‌شوند (کاربران و نشست‌ها تا مدیر بتواند وارد بماند)
const KEEP = new Set(["users", "user_sessions", "sessions", "schema_migrations"]);
// جدول‌های تنظیمات (فقط اگر مدیر خواسته باشد پاک می‌شوند)
const SETTINGS = new Set(["settings", "form_settings"]);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let busy = false;

router.post("/factory-reset", async (req, res) => {
  const b = req.body || {};
  if (b.confirm !== true) return res.status(400).json({ error: "invalid_input", message: "تأیید لازم است." });
  if (busy) return res.status(409).json({ error: "busy", message: "عملیات دیگری در حال انجام است." });
  busy = true;
  try {
    const [rows] = await pool.query("SELECT password_hash FROM users WHERE id = ?", [req.user.id]);
    if (!rows.length || !(await verifyPassword(String(b.password || ""), rows[0].password_hash))) {
      await sleep(1200);   // کند کردن حدس رمز
      return res.status(403).json({ error: "bad_password", message: "رمز عبور مدیر اشتباه است. هیچ داده‌ای پاک نشد." });
    }
    const keepSettings = b.keepSettings !== false;
    let bk;
    try { bk = await backup.createBackup("pre-reset"); }
    catch (e) { console.error("[خطا] پشتیبان پیش از پاک‌سازی", e); return res.status(500).json({ error: "backup_failed", message: "ساخت پشتیبان پیش از پاک‌سازی ناموفق بود؛ هیچ داده‌ای پاک نشد." }); }

    const [tabs] = await pool.query("SELECT table_name AS t FROM information_schema.tables WHERE table_schema = DATABASE() AND table_type = 'BASE TABLE'");
    const names = tabs.map((x) => x.t || x.TABLE_NAME).filter(Boolean);
    const clear = names.filter((n) => !KEEP.has(n) && (!SETTINGS.has(n) || !keepSettings));
    const conn = await pool.getConnection();
    try {
      await conn.query("SET FOREIGN_KEY_CHECKS = 0");
      for (const n of clear) await conn.query(`TRUNCATE TABLE \`${n.replace(/`/g, "")}\``);
      await conn.query("SET FOREIGN_KEY_CHECKS = 1");
      if (clear.includes("settings")) { try { await conn.query("INSERT IGNORE INTO settings (id) VALUES (1)"); } catch (e) { /* ساختار متفاوت */ } }
    } finally { try { await conn.query("SET FOREIGN_KEY_CHECKS = 1"); } catch (e) { /* ignore */ } conn.release(); }
    console.log(`راه‌اندازی اولیه توسط «${req.user.username}»: ${clear.length} جدول پاک شد. پشتیبان: ${bk && bk.name}`);
    res.json({ ok: true, cleared: clear, keptSettings: keepSettings, backup: bk && bk.name });
  } catch (e) {
    sendError(res, e);
  } finally { busy = false; }
});

module.exports = router;
