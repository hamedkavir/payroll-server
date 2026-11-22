// GET /api/sync?since=<نسخه> — همگام‌سازی سبک پس‌زمینه (نسخهٔ ۱۱۱)
// کلاینت هر ۱۲ ثانیه (فقط در تب نمایان) این مسیر را صدا می‌زند (client/js/payslip/periods.js ← syncQuiet):
//   - نسخه (version) از چند مقدار کوچک ساخته می‌شود: تعداد/بیشینهٔ id/آخرین تغییر دوره‌ها، تعداد/بیشینهٔ id/آخرین تغییر افراد، و آخرین تغییر تنظیمات
//   - اگر since با نسخهٔ فعلی برابر باشد ← { changed:false, version } (چند بایت؛ هیچ دوره/تنظیمی فرستاده نمی‌شود)
//   - در غیر این صورت ← { changed:true, version, settings, periods } (همان خروجی GET /api/settings و GET /api/periods)
// سرور قدیمی‌تر این مسیر را ندارد (۴۰۴) و کلاینت خودکار به روش قبلی برمی‌گردد.
const crypto = require("crypto");
const express = require("express");
const { sendError } = require("../errors");
const pool = require("../db");
const { listPeriods, isoTime } = require("./periods");
const { readSettings } = require("./settings");

const router = express.Router();
const VERSION_RE = /^[a-f0-9]{16,64}$/;

async function syncState(db = pool) {
  const [[p]] = await db.query("SELECT COUNT(*) AS n, MAX(id) AS mx, MAX(updated_at) AS u FROM periods");
  const [[pe]] = await db.query("SELECT COUNT(*) AS n, MAX(id) AS mx, MAX(updated_at) AS u FROM people");
  const [[s]] = await db.query("SELECT MAX(updated_at) AS u FROM settings");
  const parts = [
    "p", Number((p && p.n) || 0), Number((p && p.mx) || 0), isoTime(p && p.u),
    "pe", Number((pe && pe.n) || 0), Number((pe && pe.mx) || 0), isoTime(pe && pe.u),
    "s", isoTime(s && s.u),
  ];
  return crypto.createHash("sha256").update(parts.join("|")).digest("hex").slice(0, 32);
}

router.get("/", async (req, res) => {
  const since = String((req.query || {}).since || "");
  if (since && !VERSION_RE.test(since)) return res.status(400).json({ error: "invalid_input", message: "نسخهٔ همگام‌سازی نامعتبر است." });
  try {
    const version = await syncState();
    if (since && since === version) return res.json({ changed: false, version });
    const [settings, periods] = await Promise.all([readSettings(), listPeriods()]);
    res.json({ changed: true, version, settings, periods });
  } catch (e) { sendError(res, e); }
});

module.exports = router;
module.exports.syncState = syncState;
