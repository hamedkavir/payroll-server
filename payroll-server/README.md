# سیستم فیش حقوقی — نسخهٔ تیمی (MySQL + Node.js)

برنامهٔ فیش حقوقی با پایگاه‌دادهٔ **MySQL مرکزی**: داده‌ها روی سرور شما ذخیره می‌شوند و هر کاربرِ واردشده همان داده‌های مشترک را می‌بیند. تاریخچهٔ تغییرات نسخه‌ها در [`CHANGELOG.md`](CHANGELOG.md) است.

## ساختار پوشه‌ها

```
payroll-server/
├── schema.sql          اسکیمای پایه (برای نصب تازه)
├── migrations/         مهاجرت‌های خودکار پایگاه‌داده (راهنما: migrations/README.md)
├── server/             بک‌اند Node.js/Express (app.js، auth.js، routes/، ensureTables.js، تست‌ها در tests/)
├── client/             فرانت‌اند: payslip-online.html + css/ + js/ (بدون مرحلهٔ build)
├── tests/css_harness.py  ابزار مقایسهٔ computed-style برای رفاکتور CSS
└── PLAN.md / AGENTS.md یادداشت‌های توسعه
```

## نصب و راه‌اندازی

1. **پایگاه‌داده:** یک دیتابیس و کاربر MySQL بسازید، سپس از پوشهٔ `server` اجرا کنید: `npm run setup-db` (از `schema.sql` می‌سازد).
2. **بک‌اند:**
   ```bash
   cd server
   npm install
   cp .env.example .env     # در ویندوز: copy .env.example .env
   npm start
   ```
   مقادیر `.env`: `DB_HOST`، `DB_PORT`، `DB_USER`، `DB_PASSWORD`، `DB_NAME`، `PORT` (پیش‌فرض ۴۰۰۰)، `API_KEY` (رشتهٔ تصادفی بلند، مثلاً `openssl rand -hex 32`) و `CORS_ORIGIN` (در تولید دامنهٔ دقیق، نه `*`).
   متغیرهای اختیاری: `LOAN_ROUND_STEP`، `SORT_BUFFER_SIZE`، `BACKUP_AUTO` / `BACKUP_EVERY_HOURS` / `BACKUP_KEEP` / `BACKUP_DIR` / `BACKUP_MAX_MB`، `TRUST_PROXY`، `CSP_CONNECT_SRC`، `SHUTDOWN_TIMEOUT_MS`، `PIC_DIR`، `MIGRATIONS_STRICT`.
   برای ماندگاری سرور از `pm2` یا `systemd` (یا سرویس ویندوز) استفاده کنید.
3. **فرانت‌اند:** صفحهٔ برنامه از خود سرور هم باز می‌شود (`http://127.0.0.1:4000`، هم‌مبدأ با API و بدون مشکل CORS). در حالت عادی، سرور ۵۱ فایل کلاسیک JavaScript را طبق ترتیب `client/js/manifest.json` در یک فایل نسخه‌دار `/js/bundle.js?v=<hash>` ارائه می‌کند و نقشهٔ منبع `.map` نیز در دسترس است. اگر بررسی ایمنی bundle ناموفق باشد (برای نمونه اختلاف تگ‌های HTML با manifest، نبودن `use strict`، خطای نحوی یا تداخل نام‌های سطح بالا)، سرور خودکار به بارگذاری جداگانهٔ همان اسکریپت‌ها برمی‌گردد. برای غیرفعال‌کردن bundle می‌توان `CLIENT_BUNDLE=0` تنظیم کرد. این قابلیت مرحلهٔ build جداگانه‌ای به پروژه اضافه نمی‌کند. اگر فایل را جدا توزیع می‌کنید، در صفحهٔ ورود «آدرس سرور» و `API_KEY` را وارد کنید.

### نصب روی ویندوز (PowerShell)

```powershell
winget install OpenJS.NodeJS.LTS          # یا نصب از nodejs.org؛ سپس PowerShell را ببندید و دوباره باز کنید
cd payroll-server\server
npm install
copy .env.example .env                    # سپس .env را با Notepad ویرایش کنید
npm run setup-db                          # فقط بار اول
npm start
```

برای اجرای دائمی به‌صورت سرویس ویندوز می‌توانید از `pm2` (`npm i -g pm2`؛ `pm2 start app.js --name payslip`) یا NSSM استفاده کنید.

**اولین ورود:** اگر هیچ کاربری وجود نداشته باشد، مدیر اولیه با نام کاربری `admin` و یک رمز موقت تصادفی ساخته می‌شود. رمز فقط یک‌بار در خروجی ترمینالِ اجرای اول نمایش داده می‌شود؛ آن را امن نگه دارید و در اولین ورود تغییر دهید. خروجی ترمینال یا رمز موقت را در مخزن یا پیام‌رسان عمومی منتشر نکنید.

## احراز هویت و دسترسی

- دو لایه: کلید مشترک `API_KEY` برای دسترسی به API، و **ورود با نام کاربری/رمز** برای هر کاربر.
- رمزها با `scrypt` هش می‌شوند؛ نشست‌ها ۱۲ ساعته‌اند و فقط هش توکن در پایگاه‌داده ذخیره می‌شود.
- محدودیت تلاش ورود: ۶ تلاش برای هر نام کاربری و ۳۰ تلاش برای هر IP در هر ۱۰ دقیقه. پشت پراکسی معکوس (IIS/nginx) `TRUST_PROXY=1` بگذارید تا IP واقعی خوانده شود.
- هر کاربر مجوزهای بخش‌به‌بخش دارد (خواندن/نوشتن)؛ جدول زیر مجوز لازم هر مسیر است.
- پاسخ‌های API هرگز کش نمی‌شوند؛ هدرهای امنیتی (CSP، nosniff، X-Frame-Options و …) به‌صورت پیش‌فرض اعمال می‌شوند.

### جدول مسیرهای API

| مسیر | نوع دسترسی | خواندن (GET) | نوشتن |
|---|---|---|---|
| `/api/health` | عمومی (بدون کلید) | - | - |
| `/api/auth` | کلید API (نشست در خود روتر) | - | - |
| `/api/users` | فقط مدیر | مدیر | مدیر |
| `/api/admin` | فقط مدیر | مدیر | مدیر |
| `/api/backup` | فقط مدیر | مدیر | مدیر |
| `/api/settings` | مجوز بخش | هر کاربر واردشده | settings، set_slip |
| `/api/sync` | مجوز بخش | هر کاربر واردشده | هر کاربر واردشده |
| `/api/periods` | مجوز بخش | هر کاربر واردشده | import |
| `/api/periods/:id/people` | مجوز بخش | هر کاربر واردشده | import |
| `/api/personnel` | قاعده‌ای | GET /export…: personnel؛ GET …/profile: personnel، slips؛ GET: personnel، loanform، advance، goods، slips، loans، services، emdad، changes، life، schools، insurance، mehr، cheque؛ بقیه: personnel |  |
| `/api/dashboard` | مجوز بخش | dashboard | dashboard |
| `/api/loan-queue` | قاعده‌ای | غیر GET /recompute-pending | /import: loans، loanform، settings، set_loan؛ بقیه: loans، loanform |  |
| `/api/form-settings` | مجوز بخش | هر کاربر واردشده | settings، set_slip، set_forms، set_round، set_codes |
| `/api/loan-params` | مجوز بخش | هر کاربر واردشده | settings، set_loan |
| `/api/advances` | مجوز بخش | advance | advance |
| `/api/inventory` | قاعده‌ای | /orders…: goods؛ GET: inventory، goods؛ بقیه: inventory |  |
| `/api/photos` | مجوز بخش | personnel | personnel |
| `/api/reports` | مجوز بخش | reports | reports |
| `/api/institutions` | قاعده‌ای | GET: institutions، services؛ بقیه: institutions |  |
| `/api/services` | مجوز بخش | services | services |
| `/api/emdad` | مجوز بخش | emdad | emdad |
| `/api/mehr-loans` | مجوز بخش | mehr | mehr |
| `/api/cheques` | مجوز بخش | cheque | cheque |
| `/api/banks` | مجوز بخش | cheque، schools، banks | banks |
| `/api/assets` | مجوز بخش | هر کاربر واردشده | settings، set_forms |
| `/api/changes/codes` | مجوز بخش | changes | changes |
| `/api/dcodes` | مجوز بخش | dcodes، changes | dcodes |
| `/api/life` | مجوز بخش | life | life |
| `/api/deceased` | مجوز بخش | deceased | deceased |
| `/api/schools` | مجوز بخش | schools | schools |
| `/api/status-history` | مجوز بخش | statushistory | statushistory |
| `/api/insurance` | مجوز بخش | insurance | insurance |
| `/api/vefagh` | مجوز بخش | loanform | loanform |
| `/api/capital-increase` | مجوز بخش | loanform | loanform |
| `/api/changes` | مجوز بخش | changes | changes |
| `/api/closings` | مجوز بخش | closing، reports، dashboard | closing |

## پایگاه‌داده و پشتیبان

- مهاجرت‌ها با هر `npm start` یا دستی با `npm run migrate` اجرا می‌شوند (`npm run migrate:status` برای وضعیت). پیش از مهاجرت معلق روی دیتابیس دارای داده، پشتیبان خودکار گرفته می‌شود.
- پشتیبان‌گیری خودکار با `BACKUP_AUTO` تنظیم می‌شود؛ علاوه بر آن به‌طور منظم `mysqldump` بگیرید.
- در تولید حتماً از **HTTPS** (مثلاً Nginx/Caddy با Let's Encrypt) استفاده کنید.

## توسعه و تست

```bash
cd server
npm test        # اجرای آزمون‌ها؛ بدون نیاز به MySQL (با وابستگی‌ها و دیتابیس ساختگی)
```

- ساختار CSS: `<style id="appCss">` داخل HTML (شامل استایل چاپ و کلاس‌های کمکی `u-*`) و `client/css/theme.css` (فقط صفحهٔ نمایش، حالت روشن/تیره، توکن‌های `--ui-*` و `--fs-*`).
  آخرین لایهٔ `theme.css` بخش `[20] refreshV115` (نوسازی ظاهری نسخهٔ ۱۱۵) است؛ تغییرات ظاهری تازه را آن‌جا بنویسید. بخش‌های `[04]` تا `[12]` در v118 در لایهٔ مشترک `[04] pagesV118` ادغام شده‌اند.
- هنگام تغییر CSS، `tests/css_harness.py` را اجرا کنید (نیاز: Python + Playwright):
  `python3 tests/css_harness.py snap <پوشه>` برای گرفتن عکس از وضعیت ۸ پیکربندی (روشن/تیره × RTL/LTR × دسکتاپ/موبایل) روی همهٔ صفحه‌ها، و `diff <A> <B>` برای مقایسه. هدف رفاکتور: صفر تفاوت.
- پس از تغییر فایل‌های استاتیک، پارامتر `?v=` آن‌ها را در `payslip-online.html` بالا ببرید تا کش مرورگر کاربران تازه شود. برای bundle، هش محتوا در query string به‌صورت خودکار تولید می‌شود؛ ترتیب فایل‌ها باید با `js/manifest.json` هماهنگ بماند.
- برای بررسی bundle: `npm test` (شامل تست‌های `clientBundle.js`)؛ برای بررسی واقعی پاسخ‌های HTTP و فشرده‌سازی، سرور را با `npm start` اجرا و مسیر `/`، فایل `/js/bundle.js?v=<hash>` و فایل `.map` را با درخواست GET و `Accept-Encoding: gzip` بررسی کنید. تست‌های واحد به‌تنهایی جای این بررسی یکپارچه را نمی‌گیرند.
