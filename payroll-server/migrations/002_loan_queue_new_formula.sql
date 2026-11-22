-- (قدیمی) فقط برای ارتقای دیتابیس‌های نسخه‌های قبل؛ در نصب جدید از schema.sql استفاده کنید. هرگز روی دیتابیسِ دارای اطلاعات اجرا نکنید (جدول loan_queue را پاک می‌کند).
-- مهاجرت نوبت وام به فرمول جدید (سرمایه همان فایل + ۱۲×۶٬۰۰۰٬۰۰۰)
-- هشدار: این فایل جدول loan_queue قبلی را پاک می‌کند. بعد از اجرا، فایل‌های اقساط/بازنشستگان
-- دوره‌هایی که لازم است را دوباره وارد کنید تا نوبت‌ها با فرمول جدید ساخته شوند.
USE payslip_db;
DROP TABLE IF EXISTS loan_queue;
-- نوبت‌دهی وام صندوق ضروری. هر ردیف یک «چرخه» است: وقتی مانده قسط قبلی یک نفر
-- (کد ۷۱۰) در یک فایل به صفر برسد، همان لحظه یک ردیف با status='pending' ساخته می‌شود.
-- فرمول (همان لحظه و از همان فایل محاسبه و ثبت می‌شود):
--   capital_amount     = «مانده» کد ۷۹۶ در همان فایلی که کد ۷۱۰ در آن صفر شده
--   loan_amount        = capital_amount + ۱۲ × ۶٬۰۰۰٬۰۰۰
--   installment_amount = loan_amount ÷ installment_months (پیش‌فرض ۳۶)
--   تاریخ نوبت (due)   = یک سال بعد از دوره‌ای که کد ۷۱۰ صفر شد
CREATE TABLE IF NOT EXISTS loan_queue (
  id                     INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  code                   VARCHAR(50) NOT NULL,                -- کد پرسنلی
  registration_period_id INT UNSIGNED NOT NULL,                -- دوره‌ای که صفر شدن کد ۷۱۰ در آن دیده شد
  registration_year      SMALLINT UNSIGNED NOT NULL,
  registration_month     TINYINT UNSIGNED NOT NULL,
  due_year               SMALLINT UNSIGNED NOT NULL,           -- سال نوبت = سال ثبت‌نام + ۱
  due_month              TINYINT UNSIGNED NOT NULL,
  capital_amount         DECIMAL(18,0) NOT NULL DEFAULT 0,     -- مانده کد ۷۹۶ همان فایل
  loan_amount            DECIMAL(18,0) NOT NULL DEFAULT 0,
  installment_months     SMALLINT UNSIGNED NOT NULL DEFAULT 36,
  installment_amount     DECIMAL(18,0) NOT NULL DEFAULT 0,
  status                 ENUM('pending','received','cancelled') NOT NULL DEFAULT 'pending',
  received_at            TIMESTAMP NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_lq_reg_period FOREIGN KEY (registration_period_id) REFERENCES periods(id) ON DELETE CASCADE,
  UNIQUE KEY uq_lq_code_reg (code, registration_period_id),
  INDEX idx_lq_code (code),
  INDEX idx_lq_due (due_year, due_month),
  INDEX idx_lq_status (status)
) ENGINE=InnoDB;
