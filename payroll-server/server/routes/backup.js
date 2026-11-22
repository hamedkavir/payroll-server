// پشتیبان‌گیری و بازیابی (فقط مدیر): ساخت/فهرست/دانلود/آپلود/بازیابی/حذف فایل‌های پشتیبان
const express = require("express");
const fs = require("fs");
const pool = require("../db");
const backup = require("../backup")(pool);
const { sendError, UserError } = require("../errors");

const router = express.Router();
// UserError پیام خودش را می‌دهد؛ هر خطای دیگر (MySQL، فایل‌سیستم، …) فقط در لاگ سرور و پیام عمومی به کاربر
const fail = (res, e, code = 500) => sendError(res, e, { status: code, error: "backup_error", message: code === 500 ? undefined : e.message });
const MAX_BYTES = Math.max(1, Number(process.env.BACKUP_MAX_MB || 4096)) * 1024 * 1024;

router.get("/", (req, res) => {
  try { res.json({ ...backup.settings(), busy: backup.isBusy(), files: backup.listBackups() }); } catch (e) { fail(res, e); }
});
router.post("/create", async (req, res) => {
  try { res.json({ ok: true, file: await backup.createBackup("manual") }); } catch (e) { fail(res, e); }
});
router.get("/download/:name", (req, res) => {
  if (!backup.validName(req.params.name) || !fs.existsSync(backup.filePath(req.params.name))) return fail(res, new UserError("فایل پیدا نشد.", 404, "not_found"));
  res.download(backup.filePath(req.params.name), req.params.name);
});
// آپلود فایل پشتیبان به‌صورت بدنهٔ خام (octet-stream)؛ سپس اعتبارسنجی و ذخیره در پوشهٔ پشتیبان‌ها
router.post("/upload", async (req, res) => {
  fs.mkdirSync(backup.DIR, { recursive: true });
  const now = new Date(), p2 = (n) => String(n).padStart(2, "0");
  const name = `uploaded-${now.getFullYear()}${p2(now.getMonth() + 1)}${p2(now.getDate())}-${p2(now.getHours())}${p2(now.getMinutes())}${p2(now.getSeconds())}.ndjson.gz`;
  const tmp = backup.filePath(name) + ".tmp";
  const out = fs.createWriteStream(tmp);
  let bytes = 0, aborted = false;
  const drop = (code, msg) => {
    if (aborted) return; aborted = true;
    const cleanup = () => { try { fs.unlinkSync(tmp); } catch (e) {} };
    if (out.closed === true) cleanup(); else { out.once("close", cleanup); out.destroy(); }   // حذف بعد از بسته‌شدن استریم (جلوگیری از .tmp بی‌صاحب)
    res.status(code).json({ error: "backup_error", message: msg });
  };
  req.on("data", (c) => { bytes += c.length; if (bytes > MAX_BYTES) { req.unpipe(out); drop(413, "حجم فایل از حد مجاز بیشتر است."); } });
  req.on("error", () => drop(400, "آپلود قطع شد."));
  req.pipe(out);
  out.on("error", (e) => { console.error("[خطا] آپلود پشتیبان", e); drop(500, "ذخیرهٔ فایل پشتیبان ناموفق بود."); });
  out.on("finish", async () => {
    if (aborted) return;
    try {
      await backup.validateFile(tmp);   // اعتبارسنجی کامل پیش از قبول فایل (قالب، شمارش ردیف‌ها، ساختار جدول‌ها)
      fs.renameSync(tmp, backup.filePath(name));
      res.json({ ok: true, file: backup.fileInfo(name) });
    } catch (e) { if (!(e instanceof UserError)) console.error("[خطا] اعتبارسنجی پشتیبان", e); drop(400, e instanceof UserError ? e.message : "فایل پشتیبان معتبر نیست."); }
  });
});
router.post("/restore/:name", async (req, res) => {
  if (!req.body || req.body.confirm !== true) return fail(res, new UserError("تأیید بازیابی ارسال نشده است."));
  try { res.json({ ok: true, ...(await backup.restoreFromFile(req.params.name)) }); } catch (e) { fail(res, e); }
});
router.delete("/:name", (req, res) => {
  try { backup.deleteBackup(req.params.name); res.json({ ok: true }); } catch (e) { e instanceof UserError ? fail(res, e) : fail(res, e); }
});

module.exports = { router, backup };
