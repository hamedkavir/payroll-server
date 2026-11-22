require("dotenv").config();
const express = require("express");
const cors = require("cors");

const backupRoutes = require("./routes/backup");
const { sendError } = require("./errors");
const ensureTables = require("./ensureTables");
const { backfillAll } = require("./deductionSummary");

const app = express();
// نسخهٔ ۱۱۱: بدون X-Powered-By؛ پشت پراکسی معکوس (IIS/nginx) با TRUST_PROXY=1 آدرس واقعی کاربر برای محدودیت ورود خوانده می‌شود
app.disable("x-powered-by");
if (process.env.TRUST_PROXY) app.set("trust proxy", /^\d+$/.test(process.env.TRUST_PROXY) ? Number(process.env.TRUST_PROXY) : process.env.TRUST_PROXY);
// سربرگ‌های امنیتی (nosniff، X-Frame-Options، Referrer-Policy، CSP) و سیاست Cache (HTML/API: no-store) — httpHeaders.js
const { securityHeaders, staticCache } = require("./httpHeaders");
app.use(securityHeaders());

// فشرده‌سازی پاسخ‌ها (اختیاری: اگر بستهٔ compression نصب نباشد بی‌صدا رد می‌شود؛ npm install)
try { app.use(require("compression")({ threshold: 1024 })); } catch (e) { console.warn("بستهٔ compression نصب نیست؛ بدون فشرده‌سازی (npm install)"); }
// هر درخواست نوشتن، نمایهٔ حافظه‌ای جست‌وجوی پرسنل را باطل می‌کند
const { invalidate: invalidatePersonnelIndex } = require("./personnelIndex");
app.use((req, res, next) => { if (req.method !== "GET" && req.method !== "OPTIONS") res.on("finish", invalidatePersonnelIndex); next(); });
app.use(...require("./jsonBody").jsonBody(express, "25mb")); // فایل‌های اکسل با کارکنان زیاد ممکن است payload بزرگ داشته باشند
// هرجا «ي/ك» عربی در داده‌های ورودی بود پیش از ذخیره به «ی/ک» فارسی تبدیل می‌شود (به‌جز ورود/کاربران/پشتیبان/راه‌اندازی)
app.use("/api", (req, res, next) => {
  if ((req.method === "POST" || req.method === "PUT" || req.method === "PATCH") && req.body && typeof req.body === "object" && !/^\/(auth|users|backup|admin)(\/|$)/.test(req.path)) require("./textNormalize").fixDeep(req.body);
  next();
});
app.use(
  cors({
    origin: process.env.CORS_ORIGIN === "*" ? true : (process.env.CORS_ORIGIN || "").split(",").map((s) => s.trim()),
  })
);

// همهٔ مسیرهای API و سطح دسترسی‌هایشان در جدول Declarative ‏routeTable.js تعریف شده‌اند (نسخهٔ ۱۱۲):
// بررسی سلامت (بدون کلید)، ورود (فقط کلید)، مسیرهای مدیر، و مسیرهای بخش‌ها با gate(مجوز خواندن، مجوز نوشتن) یا قاعده‌های مسیر.
// ترتیب ثبت همان ترتیب قبلی است؛ tests/test_routes.js رفتار هر مسیر را با نسخهٔ قبل مقایسه می‌کند.
require("./routeTable").mountRoutes(app);

// صفحهٔ برنامه (client/payslip-online.html) از خود سرور هم باز می‌شود: http://127.0.0.1:4000 ← هم‌مبدأ با API، بدون مشکل CORS و محدودیت‌های file:// مرورگرها
const CLIENT_FILE = require("path").join(__dirname, "..", "client", "payslip-online.html");
// نسخهٔ ۱۱۸: صفحه با یک اسکریپت یکجا (/js/bundle.js?v=hash، به ترتیب js/manifest.json) به‌جای ۵۱ تگ <script> ارائه می‌شود؛
// خاموش: CLIENT_BUNDLE=0. اگر ساختن بسته ممکن نباشد، خودکار همان صفحهٔ اسکریپت‌جدا ارائه می‌شود (clientBundle.js)
app.use(require("./clientBundle").clientBundle({ clientDir: require("path").join(__dirname, "..", "client") }));
app.use(require("express").static(require("path").join(__dirname, "..", "client"), { setHeaders: staticCache }));   // ?v=… ← Cache یک‌ساله؛ HTML ← no-store
app.get(["/", "/index.html", "/payslip-online.html"], (req, res) => res.sendFile(CLIENT_FILE, (err) => { if (err && !res.headersSent) res.status(404).type("text").send("فایل client/payslip-online.html کنار پوشهٔ server پیدا نشد."); }));
app.use((req, res) => res.status(404).json({ error: "not_found" }));
app.use((err, req, res, next) => {
  // خطای بدنهٔ درخواست (حجم زیاد / JSON خراب) ← کد ۴xx با پیام عمومی؛ بقیه ← ۵۰۰ با پیام عمومی (جزئیات فقط در لاگ سرور)
  const st = Number(err && (err.status || err.statusCode));
  if (st === 413) return res.status(413).json({ error: "payload_too_large", message: "حجم درخواست از حد مجاز بیشتر است." });
  if (st >= 400 && st < 500) return res.status(st).json({ error: "bad_request", message: "درخواست نامعتبر است." });
  sendError(res, err, { error: "server_error" });
});

const pool = require("./db");
// اگر دیتابیس قبل از افزودن «توضیحات» ساخته شده، ستون notes را خودکار اضافه می‌کند
async function ensureSchema() {
  try {
    const [r] = await pool.query(
      "SELECT COUNT(*) AS c FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'personnel' AND COLUMN_NAME = 'notes'"
    );
    if (!r[0].c) {
      await pool.query("ALTER TABLE personnel ADD COLUMN notes TEXT NULL");
      console.log("ستون notes (توضیحات) به جدول personnel اضافه شد.");
    }
  } catch (e) {
    console.warn("بررسی/افزودن ستون notes ممکن نشد (دستی اجرا کنید: migrations/003_personnel_notes.sql):", e.message);
  }
}

const port = Number(process.env.PORT || 4000);
const ensureAll = async () => {
  await ensureSchema();
  try { await ensureTables(pool); console.log("جدول‌های وام/مساعده/انبار آماده است."); }
  catch (e) { console.error("ساخت جدول‌های جدید ممکن نشد (migrations/004 را دستی اجرا کنید):", e.message); }
  // نسخهٔ ۱۱۱: Migration‌های نسخه‌دار (migrate.js ← جدول schema_migrations، قفل، checksum، پشتیبان pre-migrate)
  try {
    const backup = process.env.MIGRATE_BACKUP === "0" ? null : () => backupRoutes.backup.createBackup("pre-migrate");
    const r = await require("./migrate").runMigrations(pool, { backup, allowNoBackup: process.env.MIGRATE_BACKUP_OPTIONAL === "1" });
    if (r.applied.length) console.log(`Migration‌های اجراشده: ${r.applied.join("، ")}`);
  } catch (e) {
    console.error("Migration ناموفق بود (جزئیات: npm run migrate:status):", e.message);
    if (process.env.MIGRATIONS_STRICT === "1") throw e;
  }
};
let autoBackup = null;
ensureAll().then(() => {
  const server = app.listen(port, () => {
    console.log(`سرور فیش حقوقی روی پورت ${port} در حال اجراست.`);
    backfillAll(pool);   // ساخت گزارش تجمیعی کسورات برای دوره‌های قبلی (پس‌زمینه)
    autoBackup = backupRoutes.backup.startAuto();
    if (autoBackup) console.log(`پشتیبان خودکار فعال است (هر ${autoBackup.everyHours} ساعت، نگهداری ${autoBackup.keep} نسخه) در: ${backupRoutes.backup.DIR}`);
  });
  // خاموش شدن امن با Ctrl+C / SIGTERM: پایان درخواست‌های جاری و پشتیبان‌گیری در حال اجرا، سپس بستن اتصال‌های دیتابیس (shutdown.js)
  require("./shutdown").createShutdown({
    server, pool,
    isBusy: () => backupRoutes.backup.isBusy(),
    onStop: [() => autoBackup && autoBackup.stop && autoBackup.stop()],
  }).install();
}, (e) => {
  console.error("راه‌اندازی سرور متوقف شد:", e.message);
  pool.end().catch(() => {}).finally(() => process.exit(1));
});
