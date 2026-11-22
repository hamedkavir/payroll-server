# Migrations

- **خودکار (`NNN_name.js`)**: با هر راه‌اندازی سرور (`npm start`) یا دستی با `npm run migrate` (از پوشهٔ `server`) اجرا می‌شوند و در جدول `schema_migrations` ثبت می‌شوند. وضعیت: `npm run migrate:status`.
- **تاریخی/دستی (`002`…`005` با پسوند `.sql`)**: فقط برای ارتقای دستی نسخه‌های بسیار قدیمی نگه داشته شده‌اند و **هرگز خودکار اجرا نمی‌شوند** (۰۰۲ جدول `loan_queue` را پاک می‌کند). معادل امن همهٔ آن‌ها در `server/ensureTables.js` است.

## نوشتن Migration تازه
1. فایل `migrations/007_short_name.js` بسازید (شمارهٔ بعدی، فقط حروف انگلیسی/عدد/`_`/`-`).
2. ساختار:
   ```js
   module.exports = {
     description: "what it does",
     async up(conn, h) {
       await h.addColumn("advances", "note2", "VARCHAR(255) NOT NULL DEFAULT ''");
       await h.addIndex("advances", "idx_adv_note2", ["note2"]);
     },
   };
   ```
3. گام‌ها را **idempotent** بنویسید (`h.hasTable/hasColumn/hasIndex/addColumn/addIndex`)؛ MySQL دستورهای DDL را داخل تراکنش برنمی‌گرداند، پس اگر Migration وسط کار خطا بدهد ثبت نمی‌شود و دفعهٔ بعد از نو اجرا می‌شود.
4. فایلِ اجراشده را **ویرایش نکنید** — checksum آن در `schema_migrations` ثبت است و تغییرش اجرای بقیه را متوقف می‌کند. برای اصلاح، Migration تازه بسازید.

## ایمنی
- قفل `GET_LOCK` ← دو نمونهٔ سرور هم‌زمان Migration اجرا نمی‌کنند.
- پیش از اجرای Migration معلق روی دیتابیسِ دارای داده، پشتیبان کامل `pre-migrate-….ndjson.gz` در پوشهٔ پشتیبان ساخته می‌شود (`MIGRATE_BACKUP=0` غیرفعال). اگر ساخت پشتیبان ناموفق باشد Migration اجرا نمی‌شود (مگر `MIGRATE_BACKUP_OPTIONAL=1`).
- `MIGRATIONS_STRICT=1`: اگر Migration در راه‌اندازی سرور ناموفق شود، سرور بالا نمی‌آید (پیش‌فرض: خطا در لاگ و ادامهٔ کار با ساختار فعلی).
