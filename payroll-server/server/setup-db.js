// ساخت پایگاه‌داده از روی schema.sql (بدون نیاز به کلاینت mysql؛ مناسب ویندوز هم هست).
// استفاده:  cd server && npm install && (فایل .env را بسازید) && npm run setup-db
// امن برای اجرای مجدد است؛ داده‌ای پاک نمی‌شود.
require("dotenv").config();
const fs = require("fs");
const path = require("path");
const mysql = require("mysql2/promise");

(async () => {
  const { DB_HOST = "localhost", DB_PORT = "3306", DB_USER, DB_PASSWORD = "", DB_NAME = "payslip_db" } = process.env;
  if (!DB_USER) {
    console.error("DB_USER در فایل server/.env تنظیم نشده است. ابتدا .env.example را به .env کپی و مقادیر اتصال به MySQL را وارد کنید.");
    process.exit(1);
  }
  if (!/^[A-Za-z0-9_]+$/.test(DB_NAME)) {
    console.error("DB_NAME فقط می‌تواند شامل حروف انگلیسی، عدد و _ باشد.");
    process.exit(1);
  }
  const file = path.join(__dirname, "..", "schema.sql");
  if (!fs.existsSync(file)) { console.error("فایل schema.sql کنار پوشهٔ server پیدا نشد: " + file); process.exit(1); }
  const schema = fs.readFileSync(file, "utf8").replace(/payslip_db/g, DB_NAME);
  const base = { host: DB_HOST, port: Number(DB_PORT), user: DB_USER, password: DB_PASSWORD, multipleStatements: true, charset: "utf8mb4" };

  let conn, created = false;
  try {
    try {
      conn = await mysql.createConnection({ ...base, database: DB_NAME });          // پایگاه‌داده از قبل هست
    } catch (e) {
      if (e.code !== "ER_BAD_DB_ERROR") throw e;
      conn = await mysql.createConnection(base);                                      // باید ساخته شود (نیاز به دسترسی CREATE)
      created = true;
    }
    const [[v]] = await conn.query("SELECT VERSION() AS v");
    console.log("نسخهٔ سرور پایگاه‌داده:", v.v);
    if (/mariadb/i.test(v.v)) console.warn("هشدار: MariaDB تشخیص داده شد. برنامه روی MySQL 8 تست شده است؛ ستون‌های JSON در MariaDB به‌صورت متن برمی‌گردند.");
    // اگر پایگاه‌داده از قبل هست و کاربر حق ساخت پایگاه‌داده ندارد، خط CREATE DATABASE را رد می‌کنیم
    await conn.query(created ? schema : schema.replace(/CREATE DATABASE[\s\S]*?;\s*/i, ""));
    await conn.query(`USE \`${DB_NAME}\``);
    const [t] = await conn.query("SELECT COUNT(*) AS c FROM information_schema.TABLES WHERE TABLE_SCHEMA = ?", [DB_NAME]);
    console.log(`✔ پایگاه‌داده «${DB_NAME}» آماده است (${t[0].c} جدول).`);
    console.log("گام بعد: npm start — در اولین اجرا مدیر با رمز موقت تصادفی ساخته می‌شود؛ رمز فقط یک‌بار در خروجی ترمینال نمایش داده خواهد شد.");
  } catch (e) {
    console.error("ساخت پایگاه‌داده ناموفق بود:", e.message);
    if (e.code === "ER_ACCESS_DENIED_ERROR" || e.code === "ER_DBACCESS_DENIED_ERROR") console.error("نام کاربری/رمز یا دسترسی کاربر MySQL را بررسی کنید.");
    process.exitCode = 1;
  } finally {
    if (conn) await conn.end();
  }
})();
