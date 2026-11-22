-- ============================================================================
--  اسکیمای یکپارچهٔ پایگاه‌دادهٔ سیستم فیش حقوقی، پرسنل، وام، مساعده و انبار (نسخهٔ ۸)
--
--  نصب روی سیستم جدید (فقط همین یک فایل لازم است):
--      mysql -u root -p < schema.sql
--  یا بدون نیاز به کلاینت mysql (مناسب ویندوز):  cd server && npm run setup-db
--
--  • عمداً هیچ متن فارسی داخل دستورهای SQL (مثل DEFAULT) نیست تا با هر کلاینت/کدپیج ویندوز به «؟» تبدیل نشود؛
--    مقدارهای پیش‌فرض (ریال، عدد) را برنامه می‌گذارد.
--  • امن برای اجرای مجدد است (همه‌چیز CREATE ... IF NOT EXISTS است و داده‌ای پاک نمی‌شود).
--  • مدیر اولیه با رمز موقت تصادفی و تنظیمات فرم‌ها هنگام اولین اجرای سرور ساخته می‌شود.
--  • نیازمند MySQL 8 (یا 5.7.8 به بالا) است. ستون‌های JSON در MariaDB به‌صورت متن برمی‌گردند
--    و برنامه روی آن تست نشده است؛ MySQL 8 را توصیه می‌کنیم.
--  • اگر نام پایگاه‌داده را عوض می‌کنید، دو خط CREATE DATABASE و USE را ویرایش کنید
--    (با دستور npm run setup-db نام از DB_NAME در فایل .env گرفته می‌شود).
-- ============================================================================

CREATE DATABASE IF NOT EXISTS payslip_db
  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE payslip_db;

SET NAMES utf8mb4;

-- ---------------------------------------------------------------------------
-- ۱) فیش حقوقی
-- ---------------------------------------------------------------------------

-- تنظیمات سراسری برنامه (همیشه دقیقاً یک ردیف با id=1)
CREATE TABLE IF NOT EXISTS settings (
  id             TINYINT UNSIGNED NOT NULL PRIMARY KEY DEFAULT 1,
  company_name   VARCHAR(255) NOT NULL DEFAULT '',
  company_sub    VARCHAR(255) NOT NULL DEFAULT '',
  unit           VARCHAR(20)  NOT NULL DEFAULT '',
  show_employer  TINYINT(1)   NOT NULL DEFAULT 1,
  show_zero      TINYINT(1)   NOT NULL DEFAULT 0,
  updated_at     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT chk_settings_singleton CHECK (id = 1)
) ENGINE=InnoDB;

INSERT IGNORE INTO settings (id) VALUES (1);

-- دوره‌های حقوقی (هر ماه یک ردیف)
CREATE TABLE IF NOT EXISTS periods (
  id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  year          SMALLINT UNSIGNED NOT NULL,   -- سال شمسی، مثل 1405
  month         TINYINT UNSIGNED NOT NULL,    -- 1 تا 12 (فروردین=1)
  issue_date    VARCHAR(20)  NOT NULL DEFAULT '',
  active_file   VARCHAR(255) NOT NULL DEFAULT '',
  retiree_file  VARCHAR(255) NOT NULL DEFAULT '',
  loan_file     VARCHAR(255) NOT NULL DEFAULT '',
  loans_data    JSON NULL,                    -- نگاشت کد پرسنلی -> فهرست اقلام وام، از فایل اقساط
  created_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_period_ym (year, month),
  INDEX idx_periods_updated (updated_at),   -- نسخهٔ ۱۱۱: GET /api/sync (هم‌راستا با migrations/006)
  CHECK (month BETWEEN 1 AND 12)
) ENGINE=InnoDB;

-- اطلاعات هر نفر در هر دوره (خروجی محاسبه‌شده از فایل‌های اکسل حقوق شاغلین/بازنشستگان)
CREATE TABLE IF NOT EXISTS people (
  id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  period_id     INT UNSIGNED NOT NULL,
  kind          ENUM('active','retiree') NOT NULL,
  code          VARCHAR(50)  NOT NULL DEFAULT '',
  name          VARCHAR(255) NOT NULL DEFAULT '',
  national_id   VARCHAR(20)  NOT NULL DEFAULT '',
  data          JSON NOT NULL,
  created_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_people_period FOREIGN KEY (period_id) REFERENCES periods(id) ON DELETE CASCADE,
  UNIQUE KEY uq_people_period_kind_code (period_id, kind, code),
  INDEX idx_people_period (period_id),
  INDEX idx_people_name (name),
  INDEX idx_people_code (code),
  INDEX idx_people_updated (updated_at)      -- نسخهٔ ۱۱۱: GET /api/sync (هم‌راستا با migrations/006)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------------
-- ۲) پرسنل
-- ---------------------------------------------------------------------------

-- بانک اطلاعات پرسنل (یک ردیف ثابت برای هر نفر؛ با اکسل کارگزینی به‌روز می‌شود)
CREATE TABLE IF NOT EXISTS personnel (
  id                   INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  code                 VARCHAR(50)  NOT NULL,              -- شماره پرسنلی
  first_name           VARCHAR(100) NOT NULL DEFAULT '',
  last_name            VARCHAR(100) NOT NULL DEFAULT '',
  national_id          VARCHAR(20)  NOT NULL DEFAULT '',
  father_name          VARCHAR(100) NOT NULL DEFAULT '',
  id_number            VARCHAR(30)  NOT NULL DEFAULT '',   -- شماره شناسنامه
  birth_date           VARCHAR(20)  NOT NULL DEFAULT '',
  birth_place          VARCHAR(100) NOT NULL DEFAULT '',
  mobile               VARCHAR(20)  NOT NULL DEFAULT '',
  insurance_type       VARCHAR(100) NOT NULL DEFAULT '',
  employment_type      VARCHAR(100) NOT NULL DEFAULT '',
  education            VARCHAR(100) NOT NULL DEFAULT '',
  gender               VARCHAR(10)  NOT NULL DEFAULT '',
  veteran_type         VARCHAR(100) NOT NULL DEFAULT '',
  job_title            VARCHAR(150) NOT NULL DEFAULT '',   -- پست اصلی
  workplace            VARCHAR(150) NOT NULL DEFAULT '',   -- محل خدمت
  workplace_code       VARCHAR(30)  NOT NULL DEFAULT '',
  govt_service_years   VARCHAR(10)  NOT NULL DEFAULT '',
  marital_status       VARCHAR(20)  NOT NULL DEFAULT '',
  current_status       VARCHAR(100) NOT NULL DEFAULT '',
  covered_children     VARCHAR(10)  NOT NULL DEFAULT '',
  bank_account         VARCHAR(50)  NOT NULL DEFAULT '',
  advance_account      VARCHAR(50)  NOT NULL DEFAULT '',
  shaba                VARCHAR(30)  NOT NULL DEFAULT '',   -- IR + 24 digits; last 13 digits = bank_account
  bank_name            VARCHAR(60)  NOT NULL DEFAULT '',   -- bank name (retirees: Saderat, employees: Melli by default)
  field_of_study       VARCHAR(150) NOT NULL DEFAULT '',   -- field of study
  status               VARCHAR(50)  NOT NULL DEFAULT '',   -- شاغل / بازنشسته / قطع رابطه
  notes                TEXT NULL,                          -- توضیحات دستی (با وارد‌کردن اکسل پاک نمی‌شود)
  membership_cancel_date   VARCHAR(10) NOT NULL DEFAULT '',  -- تاریخ لغو عضویت صندوق وام ضروری (1405/07/21)
  membership_cancel_amount DECIMAL(18,0) NULL,                -- مبلغ تسویه هنگام لغو عضویت (سرمایه منهای مانده وام)
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_personnel_code (code),
  INDEX idx_personnel_name (last_name, first_name),
  INDEX idx_personnel_status (status)
) ENGINE=InnoDB;

-- تاریخچهٔ تغییر وضعیت هر نفر (به‌همراه علت و شرح تغییر)
CREATE TABLE IF NOT EXISTS personnel_status_log (
  id           INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  code         VARCHAR(50) NOT NULL,
  old_status   VARCHAR(50) NOT NULL DEFAULT '',
  new_status   VARCHAR(50) NOT NULL,
  period_id    INT UNSIGNED NULL,
  changed_at   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  reason       VARCHAR(60)  NOT NULL DEFAULT '',   -- علت تغییر (انتقالی، مرخصی زایمان، ...)
  note         VARCHAR(500) NOT NULL DEFAULT '',   -- شرح
  CONSTRAINT fk_log_period FOREIGN KEY (period_id) REFERENCES periods(id) ON DELETE SET NULL,
  INDEX idx_log_code (code),
  INDEX idx_log_changed (changed_at),
  INDEX idx_log_new_status (new_status)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------------
-- ۳) وام و نوبت‌دهی
-- ---------------------------------------------------------------------------
-- هر ردیف یک وام/نوبت است. نوبت خودکار: وقتی مانده کد ۷۱۰ به صفر برسد.
-- فرمول: (سرمایه کد ۷۹۶ + مدت انتظار × سهم صندوق) × ۳ ← رند به بالا ۷ رقم ← حداکثر وام
-- (پارامترها از form_settings: loanWaitMonths, loanFundShare, loanMax)
-- وام دستی دورهٔ حقوقی ندارد؛ پس registration_period_id می‌تواند NULL باشد.
CREATE TABLE IF NOT EXISTS loan_queue (
  id                     INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  code                   VARCHAR(50) NOT NULL,
  registration_period_id INT UNSIGNED NULL,
  registration_year      SMALLINT UNSIGNED NOT NULL,
  registration_month     TINYINT UNSIGNED NOT NULL,
  due_year               SMALLINT UNSIGNED NOT NULL,
  due_month              TINYINT UNSIGNED NOT NULL,
  capital_amount         DECIMAL(18,0) NOT NULL DEFAULT 0,
  loan_amount            DECIMAL(18,0) NOT NULL DEFAULT 0,
  installment_months     SMALLINT UNSIGNED NOT NULL DEFAULT 36,
  installment_amount     DECIMAL(18,0) NOT NULL DEFAULT 0,
  status                 ENUM('pending','received','cancelled') NOT NULL DEFAULT 'pending',
  received_at            TIMESTAMP NULL,
  loan_number            VARCHAR(20)  NULL,
  request_date           VARCHAR(10)  NULL,
  notes                  VARCHAR(500) NULL,
  source                 ENUM('auto','manual') NOT NULL DEFAULT 'auto',
  inst_start_year        SMALLINT UNSIGNED NULL,
  inst_start_month       TINYINT UNSIGNED NULL,
  inst_end_year          SMALLINT UNSIGNED NULL,
  inst_end_month         TINYINT UNSIGNED NULL,
  inst_current_amount    DECIMAL(18,0) NULL,
  inst_seen_ym           INT NULL,
  inst_loan_paid         DECIMAL(18,0) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_lq_reg_period FOREIGN KEY (registration_period_id) REFERENCES periods(id) ON DELETE CASCADE,
  UNIQUE KEY uq_lq_code_reg (code, registration_period_id),
  INDEX idx_lq_code (code),
  INDEX idx_lq_due (due_year, due_month),
  INDEX idx_lq_status (status)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------------
-- ۴) کاربران و دسترسی‌ها
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  username VARCHAR(60) NOT NULL UNIQUE,
  password_hash VARCHAR(200) NOT NULL,
  full_name VARCHAR(100) NOT NULL DEFAULT '',
  is_admin TINYINT(1) NOT NULL DEFAULT 0,
  active TINYINT(1) NOT NULL DEFAULT 1,
  permissions JSON NULL,
  must_change TINYINT(1) NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS user_sessions (
  token_hash CHAR(64) PRIMARY KEY,
  user_id INT UNSIGNED NOT NULL,
  expires_at DATETIME NOT NULL,
  INDEX idx_sess_user (user_id),
  INDEX idx_sess_expires (expires_at)       -- نسخهٔ ۱۱۱ (هم‌راستا با migrations/006)
) ENGINE=InnoDB;

-- تنظیمات فرم‌ها و پارامترهای فرمول وام (یک ردیف با id=1؛ مقادیر پیش‌فرض را سرور می‌گذارد)
CREATE TABLE IF NOT EXISTS form_settings (
  id TINYINT UNSIGNED PRIMARY KEY,
  data JSON NOT NULL
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------------
-- ۵) مساعده
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS advances (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  code VARCHAR(50) NOT NULL,
  request_date VARCHAR(10) NOT NULL,
  amount DECIMAL(18,0) NOT NULL DEFAULT 0,
  installments SMALLINT UNSIGNED NOT NULL DEFAULT 2,
  installment_amount DECIMAL(18,0) NOT NULL DEFAULT 0,
  fee_percent DECIMAL(5,2) NOT NULL DEFAULT 1,
  phone VARCHAR(30) NOT NULL DEFAULT '',
  account VARCHAR(50) NOT NULL DEFAULT '',
  description VARCHAR(255) NOT NULL DEFAULT '',
  status ENUM('pending','paid','cancelled') NOT NULL DEFAULT 'pending',
  paid_date VARCHAR(10) NULL,
  created_by VARCHAR(100) NOT NULL DEFAULT '',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_adv_code (code), INDEX idx_adv_status (status)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------------
-- ۶) انبار و فروش اقساطی کالا
-- ---------------------------------------------------------------------------
-- گروه‌های کالا (مثلاً کالاهای اساسی، تنقلات) با «کد کسر کالا»
CREATE TABLE IF NOT EXISTS product_groups (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  deduction_code VARCHAR(30) NOT NULL DEFAULT '',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS products (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  code VARCHAR(30) NOT NULL DEFAULT '',
  name VARCHAR(150) NOT NULL,
  unit VARCHAR(30) NOT NULL DEFAULT '',
  quantity DECIMAL(14,2) NOT NULL DEFAULT 0,
  unit_price DECIMAL(18,0) NOT NULL DEFAULT 0,
  active TINYINT(1) NOT NULL DEFAULT 1,
  notes VARCHAR(255) NOT NULL DEFAULT '',
  group_id INT UNSIGNED NULL,
  default_installments SMALLINT UNSIGNED NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_prod_name (name)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS stock_movements (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  product_id INT UNSIGNED NOT NULL,
  kind ENUM('in','out','adjust') NOT NULL,
  qty DECIMAL(14,2) NOT NULL,
  unit_price DECIMAL(18,0) NOT NULL DEFAULT 0,
  ref_order_id INT UNSIGNED NULL,
  move_date VARCHAR(10) NOT NULL DEFAULT '',
  note VARCHAR(255) NOT NULL DEFAULT '',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_mv_product (product_id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS goods_orders (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  order_number VARCHAR(20) NOT NULL,
  code VARCHAR(50) NOT NULL,
  order_date VARCHAR(10) NOT NULL,
  total DECIMAL(18,0) NOT NULL DEFAULT 0,
  down_payment DECIMAL(18,0) NOT NULL DEFAULT 0,
  installments SMALLINT UNSIGNED NOT NULL DEFAULT 1,
  installment_amount DECIMAL(18,0) NOT NULL DEFAULT 0,
  status ENUM('active','cancelled') NOT NULL DEFAULT 'active',
  notes VARCHAR(255) NOT NULL DEFAULT '',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_go_code (code), INDEX idx_go_num (order_number)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS goods_order_items (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  order_id INT UNSIGNED NOT NULL,
  product_id INT UNSIGNED NOT NULL,
  product_name VARCHAR(150) NOT NULL,
  unit VARCHAR(30) NOT NULL DEFAULT '',
  qty DECIMAL(14,2) NOT NULL,
  unit_price DECIMAL(18,0) NOT NULL,
  installments SMALLINT UNSIGNED NULL,
  installment_amount DECIMAL(18,0) NULL,
  last_installment_amount DECIMAL(18,0) NULL,
  down_share DECIMAL(18,0) NULL,
  INDEX idx_goi_order (order_id)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------------
-- ۷) بستن فایل حقوق (تاریخ بستن حقوق هر ماه؛ مبنای گزارش‌های مالی)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS payroll_closings (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  year SMALLINT UNSIGNED NOT NULL,
  month TINYINT UNSIGNED NOT NULL,
  close_date VARCHAR(10) NOT NULL,
  note VARCHAR(255) NOT NULL DEFAULT '',
  created_by VARCHAR(100) NOT NULL DEFAULT '',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_closing_ym (year, month)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------------
-- (اختیاری) ساخت کاربر اختصاصی MySQL برای برنامه — رمز را عوض کنید و خط‌ها را از حالت کامنت دربیاورید:
--   CREATE USER IF NOT EXISTS 'payslip_user'@'%' IDENTIFIED BY 'یک-رمز-قوی';
--   GRANT ALL PRIVILEGES ON payslip_db.* TO 'payslip_user'@'%';
--   FLUSH PRIVILEGES;
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- ۷) موسسات (خدمات): تعریف نامه‌ها و درخواست خدمات هر پرسنل
-- ---------------------------------------------------------------------------
-- شرکت‌ها و موسسات طرف قرارداد + متن نامهٔ معرفی هر کدام
CREATE TABLE IF NOT EXISTS institutions (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  letter_title VARCHAR(255) NOT NULL DEFAULT '',
  web_user VARCHAR(100) NOT NULL DEFAULT '',
  web_pass VARCHAR(100) NOT NULL DEFAULT '',
  group_id INT UNSIGNED NULL,                                  -- گروه کد کسر (product_groups)
  emp_filter ENUM('all','active','retired') NOT NULL DEFAULT 'all',   -- همه / شاغل / بازنشسته
  repeat_mode ENUM('repeat','no_repeat') NOT NULL DEFAULT 'repeat',   -- تکرار / عدم تکرار برای هر فرد
  letter_text TEXT NULL,                                       -- متن نامه
  footer_text TEXT NULL,                                       -- متن زیر نامه (محل امضای همکار)
  active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_inst_name (name)
) ENGINE=InnoDB;

-- درخواست خدمات (نامهٔ صادرشده برای هر پرسنل)
CREATE TABLE IF NOT EXISTS service_requests (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  letter_number INT UNSIGNED NOT NULL,
  request_date VARCHAR(10) NOT NULL,
  request_time VARCHAR(5) NOT NULL DEFAULT '',
  institution_id INT UNSIGNED NOT NULL,
  code VARCHAR(50) NOT NULL,
  show_net TINYINT(1) NOT NULL DEFAULT 0,
  net_amount DECIMAL(18,0) NULL,
  show_amount TINYINT(1) NOT NULL DEFAULT 0,
  amount DECIMAL(18,0) NOT NULL DEFAULT 0,
  show_visit TINYINT(1) NOT NULL DEFAULT 0,
  visit_date VARCHAR(10) NOT NULL DEFAULT '',
  letter_text TEXT NULL,
  footer_text TEXT NULL,
  notes VARCHAR(500) NOT NULL DEFAULT '',
  created_by VARCHAR(100) NOT NULL DEFAULT '',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_sr_number (letter_number),
  INDEX idx_sr_code (code),
  INDEX idx_sr_inst (institution_id),
  CONSTRAINT fk_sr_inst FOREIGN KEY (institution_id) REFERENCES institutions(id)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------------
-- v17: وام امداد، تغییرات ماهانه کسورات، کدهای کسر
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS emdad_loans (
  id                 INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  code               VARCHAR(50)  NOT NULL,
  request_date       VARCHAR(10)  NOT NULL,
  request_time       VARCHAR(5)   NOT NULL DEFAULT '',
  amount             DECIMAL(18,0) NOT NULL DEFAULT 0,       -- مبلغ وام (ناخالص)
  grant_amount DECIMAL(18,0) NOT NULL DEFAULT 0,   -- وام بلاعوض: اقساط = (مبلغ وام − بلاعوض) ÷ تعداد اقساط
  fee_enabled        TINYINT(1)   NOT NULL DEFAULT 1,        -- کسر کارمزد
  fee_percent        DECIMAL(5,2) NOT NULL DEFAULT 1,
  installments       SMALLINT UNSIGNED NOT NULL DEFAULT 1,
  installment_amount DECIMAL(18,0) NOT NULL DEFAULT 0,
  account            VARCHAR(50)  NOT NULL DEFAULT '',
  account_owner VARCHAR(100) NOT NULL DEFAULT '',
  phone              VARCHAR(30)  NOT NULL DEFAULT '',
  description        VARCHAR(255) NOT NULL DEFAULT '',
  status             ENUM('pending','paid','cancelled') NOT NULL DEFAULT 'pending',
  paid_date          VARCHAR(10)  NULL,
  created_by         VARCHAR(100) NOT NULL DEFAULT '',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_em_code (code), INDEX idx_em_status (status)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS deduction_codes (
  id         INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  code       VARCHAR(20)  NOT NULL,
  name       VARCHAR(150) NOT NULL DEFAULT '',
  emp_status VARCHAR(20)  NOT NULL DEFAULT '',               -- '' = هر دو، یا شاغل / بازنشسته
  kind       TINYINT UNSIGNED NOT NULL DEFAULT 0,            -- 0 قسط، 1 سهم
  group_id   INT UNSIGNED NULL,                              -- گروه کد کسر (product_groups)
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_dc (code, emp_status)
) ENGINE=InnoDB;

-- supplementary health insurance (whole insured list uploaded from xlsx; current batch in insurance_files)
CREATE TABLE IF NOT EXISTS insurance_members (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY, batch VARCHAR(24) NOT NULL, main_id VARCHAR(30) NOT NULL DEFAULT '',
  pcode VARCHAR(30) NOT NULL DEFAULT '', nid VARCHAR(20) NOT NULL DEFAULT '',
  first_name VARCHAR(80) NOT NULL DEFAULT '', last_name VARCHAR(80) NOT NULL DEFAULT '', father_name VARCHAR(80) NOT NULL DEFAULT '',
  rel VARCHAR(20) NOT NULL DEFAULT '', sex VARCHAR(10) NOT NULL DEFAULT '', birth_year VARCHAR(10) NOT NULL DEFAULT '',
  start_cover VARCHAR(12) NOT NULL DEFAULT '', end_cover VARCHAR(12) NOT NULL DEFAULT '', end_reason VARCHAR(120) NOT NULL DEFAULT '',
  unit VARCHAR(80) NOT NULL DEFAULT '', plan VARCHAR(60) NOT NULL DEFAULT '', ins_type VARCHAR(30) NOT NULL DEFAULT '',
  policy_no VARCHAR(40) NOT NULL DEFAULT '', premium DECIMAL(18,0) NULL, cancelled TINYINT(1) NOT NULL DEFAULT 0,
  INDEX idx_im_batch_main (batch, main_id), INDEX idx_im_batch_pcode (batch, pcode), INDEX idx_im_batch_nid (batch, nid)
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS insurance_notes (
  pcode VARCHAR(30) NOT NULL PRIMARY KEY, note TEXT NOT NULL, updated_by VARCHAR(100) NOT NULL DEFAULT '',
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS insurance_files (
  id TINYINT UNSIGNED NOT NULL PRIMARY KEY, batch VARCHAR(24) NOT NULL, file_name VARCHAR(255) NOT NULL DEFAULT '',
  uploaded_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, uploaded_by VARCHAR(100) NOT NULL DEFAULT '',
  row_count INT NOT NULL DEFAULT 0, head_count INT NOT NULL DEFAULT 0, cancelled_count INT NOT NULL DEFAULT 0
) ENGINE=InnoDB;

-- capital increase / loan settlement records (linked to monthly_changes)
CREATE TABLE IF NOT EXISTS capital_increases (
  id               INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  code             VARCHAR(50)  NOT NULL,
  kind             TINYINT UNSIGNED NOT NULL DEFAULT 1,      -- 1 capital increase, 2 loan settlement
  pay_date         VARCHAR(10)  NOT NULL,
  amount           DECIMAL(18,0) NOT NULL DEFAULT 0,
  slip_no          VARCHAR(30)  NOT NULL DEFAULT '',
  prev_capital     DECIMAL(18,0) NULL,
  loan1_remaining  DECIMAL(18,0) NULL,
  loan2_remaining  DECIMAL(18,0) NULL,
  new_capital      DECIMAL(18,0) NULL,                       -- capital after increase
  apply_ym         INT NULL,                                 -- year*12+month of the slip that first reflects it
  change_id        INT UNSIGNED NULL,
  created_by       VARCHAR(100) NOT NULL DEFAULT '',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_ci_code (code), INDEX idx_ci_date (pay_date)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS monthly_changes (
  id               INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  code             VARCHAR(50)  NOT NULL,                    -- کد پرسنلی
  change_date      VARCHAR(10)  NOT NULL,
  deduction_code   VARCHAR(20)  NOT NULL,
  deduction_name   VARCHAR(150) NOT NULL DEFAULT '',
  loan_row         VARCHAR(20)  NOT NULL DEFAULT '',         -- ردیف وام
  loan_number      VARCHAR(30)  NOT NULL DEFAULT '',         -- شماره وام
  total_amount     DECIMAL(18,0) NULL,
  installment_amount DECIMAL(18,0) NULL,
  remaining        DECIMAL(18,0) NULL,
  action           TINYINT UNSIGNED NOT NULL DEFAULT 1,      -- 1 ایجاد، 2 اصلاح، 3 حذف
  closed           TINYINT(1)   NOT NULL DEFAULT 0,
  notes            VARCHAR(500) NOT NULL DEFAULT '',
  created_by       VARCHAR(100) NOT NULL DEFAULT '',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_mc_code (code), INDEX idx_mc_date (change_date), INDEX idx_mc_closed (closed)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------------
-- بیمه عمر (مصوب / مکمل) و استفاده‌کنندگان از سرمایه
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS life_insurance (
  id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  number        INT UNSIGNED NOT NULL,                       -- شماره بیمه عمر (خودکار)
  code          VARCHAR(50)  NOT NULL,
  ins_type      ENUM('mosavab','mokammel') NOT NULL DEFAULT 'mosavab',
  cheque_serial VARCHAR(50)  NOT NULL DEFAULT '',
  cheque_date   VARCHAR(10)  NOT NULL DEFAULT '',
  description   VARCHAR(255) NOT NULL DEFAULT '',
  reg_date      VARCHAR(10)  NOT NULL,
  created_by    VARCHAR(100) NOT NULL DEFAULT '',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_li_number (number), INDEX idx_li_code (code)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS life_beneficiaries (
  id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  policy_id     INT UNSIGNED NOT NULL,
  first_name    VARCHAR(100) NOT NULL DEFAULT '',
  last_name     VARCHAR(100) NOT NULL DEFAULT '',
  national_id   VARCHAR(20)  NOT NULL DEFAULT '',
  id_number     VARCHAR(20)  NOT NULL DEFAULT '',
  issue_place   VARCHAR(100) NOT NULL DEFAULT '',
  relation      VARCHAR(50)  NOT NULL DEFAULT '',
  share_percent DECIMAL(5,2) NOT NULL DEFAULT 100,
  description   VARCHAR(255) NOT NULL DEFAULT '',
  active        TINYINT(1)   NOT NULL DEFAULT 1,
  amount        DECIMAL(18,0) NULL,
  account       VARCHAR(50)  NOT NULL DEFAULT '',
  bank          VARCHAR(100) NOT NULL DEFAULT '',
  reg_date      VARCHAR(10)  NOT NULL DEFAULT '',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_lb_policy (policy_id)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------------
-- Deduction summary per period (built when payroll files are imported)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS deduction_summary (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  period_id INT UNSIGNED NOT NULL,
  kind ENUM('active','retiree') NOT NULL,
  ded_key VARCHAR(220) NOT NULL,
  code VARCHAR(30) NOT NULL DEFAULT '',
  label VARCHAR(200) NOT NULL DEFAULT '',
  people_count INT UNSIGNED NOT NULL DEFAULT 0,
  total_amount DECIMAL(20,2) NOT NULL DEFAULT 0,
  UNIQUE KEY uq_dedsum (period_id, kind, ded_key),
  CONSTRAINT fk_dedsum_period FOREIGN KEY (period_id) REFERENCES periods(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS period_totals (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  period_id INT UNSIGNED NOT NULL,
  kind ENUM('active','retiree') NOT NULL,
  people_count INT UNSIGNED NOT NULL DEFAULT 0,
  gross DECIMAL(22,2) NOT NULL DEFAULT 0,
  deductions DECIMAL(22,2) NOT NULL DEFAULT 0,
  net DECIMAL(22,2) NOT NULL DEFAULT 0,
  employer DECIMAL(22,2) NOT NULL DEFAULT 0,
  UNIQUE KEY uq_ptotals (period_id, kind),
  CONSTRAINT fk_ptotals_period FOREIGN KEY (period_id) REFERENCES periods(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------------
-- Deceased personnel: frozen snapshot, insurance rows and heirs
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS deceased (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  code VARCHAR(30) NOT NULL,
  first_name VARCHAR(100) NOT NULL DEFAULT '', last_name VARCHAR(100) NOT NULL DEFAULT '', father_name VARCHAR(100) NOT NULL DEFAULT '',
  national_id VARCHAR(20) NOT NULL DEFAULT '', id_number VARCHAR(30) NOT NULL DEFAULT '',
  birth_date VARCHAR(20) NOT NULL DEFAULT '', birth_place VARCHAR(100) NOT NULL DEFAULT '', gender VARCHAR(20) NOT NULL DEFAULT '', marital_status VARCHAR(30) NOT NULL DEFAULT '',
  employment_type VARCHAR(100) NOT NULL DEFAULT '', job_title VARCHAR(150) NOT NULL DEFAULT '', workplace VARCHAR(150) NOT NULL DEFAULT '',
  education VARCHAR(100) NOT NULL DEFAULT '', field_of_study VARCHAR(150) NOT NULL DEFAULT '',
  bank_account VARCHAR(50) NOT NULL DEFAULT '', shaba VARCHAR(30) NOT NULL DEFAULT '', bank_name VARCHAR(60) NOT NULL DEFAULT '',
  last_status VARCHAR(30) NOT NULL DEFAULT '',
  snapshot JSON NULL,
  death_date VARCHAR(10) NOT NULL DEFAULT '', letter_date VARCHAR(10) NOT NULL DEFAULT '', docs_date VARCHAR(10) NOT NULL DEFAULT '',
  notes TEXT NULL,
  created_by VARCHAR(100) NOT NULL DEFAULT '',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_deceased_code (code)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS deceased_items (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  deceased_id INT UNSIGNED NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  kind ENUM('approved','supplementary','fund','debtor') NOT NULL,
  amount DECIMAL(20,0) NOT NULL DEFAULT 0,
  office_date VARCHAR(10) NOT NULL DEFAULT '', heirs_date VARCHAR(10) NOT NULL DEFAULT '',
  ref_no VARCHAR(60) NOT NULL DEFAULT '', notes VARCHAR(500) NOT NULL DEFAULT '',
  CONSTRAINT fk_dcitem FOREIGN KEY (deceased_id) REFERENCES deceased(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS deceased_heirs (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  deceased_id INT UNSIGNED NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  first_name VARCHAR(100) NOT NULL DEFAULT '', last_name VARCHAR(100) NOT NULL DEFAULT '', national_id VARCHAR(20) NOT NULL DEFAULT '',
  relation VARCHAR(30) NOT NULL DEFAULT '',
  share_percent DECIMAL(7,3) NOT NULL DEFAULT 0, amount DECIMAL(20,0) NOT NULL DEFAULT 0,
  account VARCHAR(40) NOT NULL DEFAULT '', shaba VARCHAR(30) NOT NULL DEFAULT '', bank_name VARCHAR(60) NOT NULL DEFAULT '',
  pay_date VARCHAR(10) NOT NULL DEFAULT '', paid TINYINT(1) NOT NULL DEFAULT 0, notes VARCHAR(500) NOT NULL DEFAULT '',
  CONSTRAINT fk_dcheir FOREIGN KEY (deceased_id) REFERENCES deceased(id) ON DELETE CASCADE
) ENGINE=InnoDB;


-- v35: schools and signature changes, per-user menu order (ensureTables.js creates these automatically)
CREATE TABLE IF NOT EXISTS schools (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  code VARCHAR(30) NOT NULL,
  name VARCHAR(200) NOT NULL DEFAULT '',
  area VARCHAR(100) NOT NULL DEFAULT '', gender VARCHAR(20) NOT NULL DEFAULT '',
  level VARCHAR(100) NOT NULL DEFAULT '', school_type VARCHAR(60) NOT NULL DEFAULT '',
  address VARCHAR(500) NOT NULL DEFAULT '',
  manager_code VARCHAR(30) NOT NULL DEFAULT '', manager_first VARCHAR(100) NOT NULL DEFAULT '', manager_last VARCHAR(100) NOT NULL DEFAULT '',
  manager_mobile VARCHAR(20) NOT NULL DEFAULT '', manager_type VARCHAR(40) NOT NULL DEFAULT '',
  phone VARCHAR(30) NOT NULL DEFAULT '', postal_code VARCHAR(15) NOT NULL DEFAULT '',
  shift VARCHAR(80) NOT NULL DEFAULT '', opposite_shift VARCHAR(120) NOT NULL DEFAULT '',
  classes INT NOT NULL DEFAULT 0, students INT NOT NULL DEFAULT 0,
  account VARCHAR(20) NOT NULL DEFAULT '',
  notes VARCHAR(500) NOT NULL DEFAULT '',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_school_code (code)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS school_sig_changes (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  school_id INT UNSIGNED NOT NULL,
  reg_no VARCHAR(20) NOT NULL DEFAULT '', letter_no VARCHAR(60) NOT NULL DEFAULT '',
  req_date VARCHAR(10) NOT NULL DEFAULT '',
  bank_code VARCHAR(10) NOT NULL DEFAULT '', bank_name VARCHAR(80) NOT NULL DEFAULT '', branch VARCHAR(120) NOT NULL DEFAULT '',
  account VARCHAR(20) NOT NULL DEFAULT '',
  manager_code VARCHAR(30) NOT NULL DEFAULT '', manager_name VARCHAR(200) NOT NULL DEFAULT '',
  teacher_code VARCHAR(30) NOT NULL DEFAULT '', teacher_name VARCHAR(200) NOT NULL DEFAULT '',
  parents_name VARCHAR(200) NOT NULL DEFAULT '',
  notes VARCHAR(500) NOT NULL DEFAULT '',
  created_by VARCHAR(100) NOT NULL DEFAULT '',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_sig_school (school_id),
  CONSTRAINT fk_sig_school FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE CASCADE
) ENGINE=InnoDB;

ALTER TABLE users ADD COLUMN nav_order JSON NULL;

ALTER TABLE personnel ADD COLUMN ledger VARCHAR(60) NOT NULL DEFAULT '';
ALTER TABLE personnel ADD COLUMN extra JSON NULL;

-- v42: snapshot of bank info on each payslip row
ALTER TABLE people ADD COLUMN bank_account VARCHAR(50) NOT NULL DEFAULT '';
ALTER TABLE people ADD COLUMN shaba VARCHAR(30) NOT NULL DEFAULT '';
ALTER TABLE people ADD COLUMN bank_name VARCHAR(80) NOT NULL DEFAULT '';
ALTER TABLE people ADD COLUMN bank_frozen TINYINT(1) NOT NULL DEFAULT 0;

ALTER TABLE personnel ADD COLUMN advance_owner VARCHAR(100) NOT NULL DEFAULT '';
ALTER TABLE personnel ADD COLUMN job_role VARCHAR(100) NOT NULL DEFAULT '';
ALTER TABLE personnel ADD COLUMN job_rank VARCHAR(30) NOT NULL DEFAULT '';
ALTER TABLE personnel ADD COLUMN job_group VARCHAR(30) NOT NULL DEFAULT '';
ALTER TABLE personnel ADD COLUMN mehr_account VARCHAR(50) NOT NULL DEFAULT '';
ALTER TABLE personnel ADD COLUMN insurance_code VARCHAR(20) NOT NULL DEFAULT '';

-- ---------------------------------------------------------------------------
-- v72: Bank Mehr loans (no fund loan formula) + personnel.mehr_account
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS mehr_loans (
  id                      INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  code                    VARCHAR(50)  NOT NULL,
  request_date            VARCHAR(10)  NOT NULL,
  loan_amount             DECIMAL(18,0) NOT NULL DEFAULT 0,
  installments            SMALLINT UNSIGNED NOT NULL DEFAULT 1,
  installment_amount      DECIMAL(18,0) NOT NULL DEFAULT 0,
  last_installment_amount DECIMAL(18,0) NOT NULL DEFAULT 0,
  fee_percent             DECIMAL(5,2) NOT NULL DEFAULT 4,
  turn_date               VARCHAR(10)  NOT NULL DEFAULT '',
  received_date           VARCHAR(10)  NOT NULL DEFAULT '',
  fail_reason             VARCHAR(255) NOT NULL DEFAULT '',
  mehr_account            VARCHAR(50)  NOT NULL DEFAULT '',
  phone                   VARCHAR(30)  NOT NULL DEFAULT '',
  g_name                  VARCHAR(120) NOT NULL DEFAULT '',
  g_national_id           VARCHAR(20)  NOT NULL DEFAULT '',
  g_code                  VARCHAR(50)  NOT NULL DEFAULT '',
  g_birth_date            VARCHAR(10)  NOT NULL DEFAULT '',
  g_mobile                VARCHAR(30)  NOT NULL DEFAULT '',
  g_workplace             VARCHAR(150) NOT NULL DEFAULT '',
  acc_status              ENUM('pending','approved','rejected') NOT NULL DEFAULT 'pending',
  acc_date                VARCHAR(10)  NOT NULL DEFAULT '',
  acc_by                  VARCHAR(100) NOT NULL DEFAULT '',
  acc_note                VARCHAR(255) NOT NULL DEFAULT '',
  description             VARCHAR(255) NOT NULL DEFAULT '',
  status                  ENUM('pending','paid','failed','cancelled') NOT NULL DEFAULT 'pending',
  paid_date               VARCHAR(10)  NULL,
  created_by              VARCHAR(100) NOT NULL DEFAULT '',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_mh_code (code), INDEX idx_mh_status_date (status, request_date)
) ENGINE=InnoDB;

-- v74: guarantor info on fund loans (printed on the loan receipt form)
ALTER TABLE loan_queue ADD COLUMN g_code VARCHAR(50) NULL;
ALTER TABLE loan_queue ADD COLUMN g_name VARCHAR(120) NULL;
ALTER TABLE loan_queue ADD COLUMN g_national_id VARCHAR(20) NULL;
ALTER TABLE loan_queue ADD COLUMN g_birth_date VARCHAR(10) NULL;
ALTER TABLE loan_queue ADD COLUMN g_mobile VARCHAR(30) NULL;
ALTER TABLE loan_queue ADD COLUMN g_workplace VARCHAR(150) NULL;

-- v75: fee percent for existing mehr_loans tables (ignore error if column exists)
ALTER TABLE mehr_loans ADD COLUMN fee_percent DECIMAL(5,2) NOT NULL DEFAULT 4;

-- v76: Bank Mehr turn/received dates, failed status with reason, monthly charge (run only on databases created before v76)
CREATE TABLE IF NOT EXISTS mehr_charges (
  ym CHAR(7) NOT NULL PRIMARY KEY,
  amount DECIMAL(18,0) NOT NULL DEFAULT 0,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;
ALTER TABLE mehr_loans ADD COLUMN turn_date VARCHAR(10) NOT NULL DEFAULT '';
ALTER TABLE mehr_loans ADD COLUMN received_date VARCHAR(10) NOT NULL DEFAULT '';
ALTER TABLE mehr_loans ADD COLUMN fail_reason VARCHAR(255) NOT NULL DEFAULT '';
ALTER TABLE mehr_loans MODIFY COLUMN status ENUM('pending','paid','failed','cancelled') NOT NULL DEFAULT 'pending';

-- v77: sum of remaining balance per deduction code (dashboard key codes)
ALTER TABLE deduction_summary ADD COLUMN remaining_amount DECIMAL(20,2) NULL;

-- v80: signature image, banks/branches definition, cheque book requests
CREATE TABLE IF NOT EXISTS app_assets (
  name VARCHAR(40) NOT NULL PRIMARY KEY,
  mime VARCHAR(60) NOT NULL,
  data MEDIUMBLOB NOT NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS banks (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  code VARCHAR(20) NOT NULL,
  name VARCHAR(120) NOT NULL,
  UNIQUE KEY uq_bank_code (code)
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS bank_branches (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  bank_id INT UNSIGNED NOT NULL,
  code VARCHAR(20) NOT NULL,
  name VARCHAR(150) NOT NULL,
  UNIQUE KEY uq_branch (bank_id, code),
  INDEX idx_branch_name (bank_id, name),
  CONSTRAINT fk_branch_bank FOREIGN KEY (bank_id) REFERENCES banks(id) ON DELETE CASCADE
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS cheque_requests (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  serial INT UNSIGNED NOT NULL,
  code VARCHAR(50) NOT NULL,
  req_date VARCHAR(10) NOT NULL,
  bank_code VARCHAR(20) NOT NULL DEFAULT '',
  bank_name VARCHAR(120) NOT NULL,
  branch_code VARCHAR(20) NOT NULL DEFAULT '',
  branch_name VARCHAR(150) NOT NULL DEFAULT '',
  account VARCHAR(40) NOT NULL,
  created_by VARCHAR(100) NOT NULL DEFAULT '',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_cheque_serial (serial),
  INDEX idx_cq_code (code),
  INDEX idx_cq_date (req_date)
) ENGINE=InnoDB;

-- v84: advance account owner on requests, institution letter code
ALTER TABLE advances ADD COLUMN account_owner VARCHAR(100) NOT NULL DEFAULT '';
ALTER TABLE institutions ADD COLUMN letter_code VARCHAR(30) NOT NULL DEFAULT '';

-- وام وفاق: عضویت، افزایش سرمایه، تسویه وام، لغو عضویت (کدهای کسر: تنظیمات ← تعریف کدهای مهم)
CREATE TABLE IF NOT EXISTS vefagh_ops (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  code VARCHAR(50) NOT NULL,
  kind TINYINT UNSIGNED NOT NULL DEFAULT 1,          -- 1 capital increase, 2 loan settlement, 3 membership, 4 cancel membership
  pay_date VARCHAR(10) NOT NULL,
  amount DECIMAL(18,0) NOT NULL DEFAULT 0,
  slip_no VARCHAR(30) NOT NULL DEFAULT '',
  prev_capital DECIMAL(18,0) NULL,
  loan_remaining DECIMAL(18,0) NULL,
  new_capital DECIMAL(18,0) NULL,
  installment DECIMAL(18,0) NULL,
  apply_ym INT NULL,
  change_id INT UNSIGNED NULL,
  change_id2 INT UNSIGNED NULL,
  created_by VARCHAR(100) NOT NULL DEFAULT '',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_vf_code (code), INDEX idx_vf_date (pay_date)
) ENGINE=InnoDB;

-- بستن مساعده و امداد: برای هر ماه تاریخ بستن + «اعمال در ماه حقوقی»؛ مساعده/وام امدادِ پرداخت‌شده با تاریخ پرداخت ≤ آن تاریخ «بسته» (قفل) می‌شود
CREATE TABLE IF NOT EXISTS advance_closings (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  year SMALLINT UNSIGNED NOT NULL,
  month TINYINT UNSIGNED NOT NULL,
  close_date VARCHAR(10) NOT NULL,
  apply_year SMALLINT UNSIGNED NOT NULL DEFAULT 0,   -- اعمال در ماه حقوقی
  apply_month TINYINT UNSIGNED NOT NULL DEFAULT 0,
  note VARCHAR(255) NOT NULL DEFAULT '',
  created_by VARCHAR(100) NOT NULL DEFAULT '',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_advclosing_ym (year, month)
) ENGINE=InnoDB;
ALTER TABLE advances ADD COLUMN closed TINYINT(1) NOT NULL DEFAULT 0;
ALTER TABLE advances ADD COLUMN closing_id INT UNSIGNED NULL;
ALTER TABLE emdad_loans ADD COLUMN closed TINYINT(1) NOT NULL DEFAULT 0;
ALTER TABLE emdad_loans ADD COLUMN closing_id INT UNSIGNED NULL;

-- ---------------------------------------------------------------------------
-- نسخهٔ ۱۱۱: ثبت Migration‌های اجراشده (server/migrate.js). سرور در هر راه‌اندازی Migration‌های معلق
-- migrations/NNN_*.js را اجرا و این‌جا ثبت می‌کند؛ فایل‌های .sql قدیمی ۰۰۲ تا ۰۰۵ دستی/تاریخی‌اند.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS schema_migrations (
  version     VARCHAR(20)  NOT NULL PRIMARY KEY,
  name        VARCHAR(200) NOT NULL,
  checksum    CHAR(64)     NOT NULL,
  applied_at  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  duration_ms INT UNSIGNED NOT NULL DEFAULT 0
) ENGINE=InnoDB;
