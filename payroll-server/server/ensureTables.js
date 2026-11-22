// ساخت خودکار جدول‌های جدید (مساعده، انبار، تنظیمات فرم‌ها) و سازگارکردن loan_queue با «ثبت دستی وام».
// هر بار سرور بالا بیاید اجرا می‌شود و تکراری‌بودن مشکلی ایجاد نمی‌کند.
// معادل دستی: migrations/004_loans_advances_inventory.sql
const crypto = require("crypto");
const { hashPassword } = require("./auth");

const DDL = [
  `CREATE TABLE IF NOT EXISTS users (
     id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
     username VARCHAR(60) NOT NULL UNIQUE,
     password_hash VARCHAR(200) NOT NULL,
     full_name VARCHAR(100) NOT NULL DEFAULT '',
     is_admin TINYINT(1) NOT NULL DEFAULT 0,
     active TINYINT(1) NOT NULL DEFAULT 1,
     permissions JSON NULL,
     must_change TINYINT(1) NOT NULL DEFAULT 0,
     created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
   ) ENGINE=InnoDB`,
  `CREATE TABLE IF NOT EXISTS user_sessions (
     token_hash CHAR(64) PRIMARY KEY,
     user_id INT UNSIGNED NOT NULL,
     expires_at DATETIME NOT NULL,
     INDEX idx_sess_user (user_id),
     INDEX idx_sess_expires (expires_at)
   ) ENGINE=InnoDB`,
  `CREATE TABLE IF NOT EXISTS deduction_summary (
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
   ) ENGINE=InnoDB`,
  `CREATE TABLE IF NOT EXISTS period_totals (
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
   ) ENGINE=InnoDB`,
  `CREATE TABLE IF NOT EXISTS deceased (
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
   ) ENGINE=InnoDB`,
  `CREATE TABLE IF NOT EXISTS deceased_items (
     id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
     deceased_id INT UNSIGNED NOT NULL,
     sort_order INT NOT NULL DEFAULT 0,
     kind ENUM('approved','supplementary','fund','debtor') NOT NULL,
     amount DECIMAL(20,0) NOT NULL DEFAULT 0,
     office_date VARCHAR(10) NOT NULL DEFAULT '', heirs_date VARCHAR(10) NOT NULL DEFAULT '',
     ref_no VARCHAR(60) NOT NULL DEFAULT '', notes VARCHAR(500) NOT NULL DEFAULT '',
     CONSTRAINT fk_dcitem FOREIGN KEY (deceased_id) REFERENCES deceased(id) ON DELETE CASCADE
   ) ENGINE=InnoDB`,
  `CREATE TABLE IF NOT EXISTS deceased_heirs (
     id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
     deceased_id INT UNSIGNED NOT NULL,
     sort_order INT NOT NULL DEFAULT 0,
     first_name VARCHAR(100) NOT NULL DEFAULT '', last_name VARCHAR(100) NOT NULL DEFAULT '', national_id VARCHAR(20) NOT NULL DEFAULT '',
     relation VARCHAR(30) NOT NULL DEFAULT '',
     share_percent DECIMAL(7,3) NOT NULL DEFAULT 0, amount DECIMAL(20,0) NOT NULL DEFAULT 0,
     account VARCHAR(40) NOT NULL DEFAULT '', shaba VARCHAR(30) NOT NULL DEFAULT '', bank_name VARCHAR(60) NOT NULL DEFAULT '',
     pay_date VARCHAR(10) NOT NULL DEFAULT '', paid TINYINT(1) NOT NULL DEFAULT 0, notes VARCHAR(500) NOT NULL DEFAULT '',
     CONSTRAINT fk_dcheir FOREIGN KEY (deceased_id) REFERENCES deceased(id) ON DELETE CASCADE
   ) ENGINE=InnoDB`,
  `CREATE TABLE IF NOT EXISTS schools (
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
   ) ENGINE=InnoDB`,
  `CREATE TABLE IF NOT EXISTS school_sig_changes (
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
   ) ENGINE=InnoDB`,
  `CREATE TABLE IF NOT EXISTS form_settings (
     id TINYINT UNSIGNED PRIMARY KEY, data JSON NOT NULL
   ) ENGINE=InnoDB`,
  `CREATE TABLE IF NOT EXISTS institutions (
     id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
     name VARCHAR(255) NOT NULL,
     letter_title VARCHAR(255) NOT NULL DEFAULT '',
     web_user VARCHAR(100) NOT NULL DEFAULT '',
     web_pass VARCHAR(100) NOT NULL DEFAULT '',
     group_id INT UNSIGNED NULL,
     emp_filter ENUM('all','active','retired') NOT NULL DEFAULT 'all',
     repeat_mode ENUM('repeat','no_repeat') NOT NULL DEFAULT 'repeat',
     letter_text TEXT NULL,
     footer_text TEXT NULL,
     active TINYINT(1) NOT NULL DEFAULT 1,
     created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
     updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
     INDEX idx_inst_name (name)
   ) ENGINE=InnoDB`,
  `CREATE TABLE IF NOT EXISTS service_requests (
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
   ) ENGINE=InnoDB`,
  `CREATE TABLE IF NOT EXISTS advances (
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
     created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
     updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
     INDEX idx_adv_code (code), INDEX idx_adv_status (status)
   ) ENGINE=InnoDB`,
  `CREATE TABLE IF NOT EXISTS products (
     id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
     code VARCHAR(30) NOT NULL DEFAULT '',
     name VARCHAR(150) NOT NULL,
     unit VARCHAR(30) NOT NULL DEFAULT 'عدد',
     quantity DECIMAL(14,2) NOT NULL DEFAULT 0,
     unit_price DECIMAL(18,0) NOT NULL DEFAULT 0,
     active TINYINT(1) NOT NULL DEFAULT 1,
     notes VARCHAR(255) NOT NULL DEFAULT '',
     created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
     updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
     INDEX idx_prod_name (name)
   ) ENGINE=InnoDB`,
  `CREATE TABLE IF NOT EXISTS stock_movements (
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
   ) ENGINE=InnoDB`,
  `CREATE TABLE IF NOT EXISTS product_groups (
     id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
     name VARCHAR(100) NOT NULL,
     deduction_code VARCHAR(30) NOT NULL DEFAULT '',
     created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
   ) ENGINE=InnoDB`,
  `CREATE TABLE IF NOT EXISTS payroll_closings (
     id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
     year SMALLINT UNSIGNED NOT NULL,
     month TINYINT UNSIGNED NOT NULL,
     close_date VARCHAR(10) NOT NULL,
     note VARCHAR(255) NOT NULL DEFAULT '',
     created_by VARCHAR(100) NOT NULL DEFAULT '',
     created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
     updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
     UNIQUE KEY uq_closing_ym (year, month)
   ) ENGINE=InnoDB`,
  `CREATE TABLE IF NOT EXISTS goods_orders (
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
   ) ENGINE=InnoDB`,
  `CREATE TABLE IF NOT EXISTS goods_order_items (
     id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
     order_id INT UNSIGNED NOT NULL,
     product_id INT UNSIGNED NOT NULL,
     product_name VARCHAR(150) NOT NULL,
     unit VARCHAR(30) NOT NULL DEFAULT 'عدد',
     qty DECIMAL(14,2) NOT NULL,
     unit_price DECIMAL(18,0) NOT NULL,
     installments SMALLINT UNSIGNED NULL,
     installment_amount DECIMAL(18,0) NULL,
     last_installment_amount DECIMAL(18,0) NULL,
     down_share DECIMAL(18,0) NULL,
     INDEX idx_goi_order (order_id)
   ) ENGINE=InnoDB`,
  `CREATE TABLE IF NOT EXISTS mehr_loans (
     id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
     code VARCHAR(50) NOT NULL,
     request_date VARCHAR(10) NOT NULL,
     loan_amount DECIMAL(18,0) NOT NULL DEFAULT 0,
     installments SMALLINT UNSIGNED NOT NULL DEFAULT 1,
     installment_amount DECIMAL(18,0) NOT NULL DEFAULT 0,
     last_installment_amount DECIMAL(18,0) NOT NULL DEFAULT 0,
     fee_percent DECIMAL(5,2) NOT NULL DEFAULT 4,
     turn_date VARCHAR(10) NOT NULL DEFAULT '',
     received_date VARCHAR(10) NOT NULL DEFAULT '',
     fail_reason VARCHAR(255) NOT NULL DEFAULT '',
     mehr_account VARCHAR(50) NOT NULL DEFAULT '',
     phone VARCHAR(30) NOT NULL DEFAULT '',
     g_name VARCHAR(120) NOT NULL DEFAULT '',
     g_national_id VARCHAR(20) NOT NULL DEFAULT '',
     g_code VARCHAR(50) NOT NULL DEFAULT '',
     g_birth_date VARCHAR(10) NOT NULL DEFAULT '',
     g_mobile VARCHAR(30) NOT NULL DEFAULT '',
     g_workplace VARCHAR(150) NOT NULL DEFAULT '',
     acc_status ENUM('pending','approved','rejected') NOT NULL DEFAULT 'pending',
     acc_date VARCHAR(10) NOT NULL DEFAULT '',
     acc_by VARCHAR(100) NOT NULL DEFAULT '',
     acc_note VARCHAR(255) NOT NULL DEFAULT '',
     description VARCHAR(255) NOT NULL DEFAULT '',
     status ENUM('pending','paid','failed','cancelled') NOT NULL DEFAULT 'pending',
     paid_date VARCHAR(10) NULL,
     created_by VARCHAR(100) NOT NULL DEFAULT '',
     created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
     updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
     INDEX idx_mh_code (code), INDEX idx_mh_status_date (status, request_date)
   ) ENGINE=InnoDB`,
  `CREATE TABLE IF NOT EXISTS app_assets (
     name VARCHAR(40) NOT NULL PRIMARY KEY,
     mime VARCHAR(60) NOT NULL,
     data MEDIUMBLOB NOT NULL,
     updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
   ) ENGINE=InnoDB`,
  `CREATE TABLE IF NOT EXISTS banks (
     id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
     code VARCHAR(20) NOT NULL,
     name VARCHAR(120) NOT NULL,
     UNIQUE KEY uq_bank_code (code)
   ) ENGINE=InnoDB`,
  `CREATE TABLE IF NOT EXISTS bank_branches (
     id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
     bank_id INT UNSIGNED NOT NULL,
     code VARCHAR(20) NOT NULL,
     name VARCHAR(150) NOT NULL,
     UNIQUE KEY uq_branch (bank_id, code),
     INDEX idx_branch_name (bank_id, name),
     CONSTRAINT fk_branch_bank FOREIGN KEY (bank_id) REFERENCES banks(id) ON DELETE CASCADE
   ) ENGINE=InnoDB`,
  `CREATE TABLE IF NOT EXISTS cheque_requests (
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
   ) ENGINE=InnoDB`,
  `CREATE TABLE IF NOT EXISTS vefagh_ops (
     id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
     code VARCHAR(50) NOT NULL,
     kind TINYINT UNSIGNED NOT NULL DEFAULT 1,          -- 1 افزایش سرمایه، 2 تسویه وام، 3 عضویت، 4 لغو عضویت
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
   ) ENGINE=InnoDB`,
  `CREATE TABLE IF NOT EXISTS advance_closings (
     id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
     year SMALLINT UNSIGNED NOT NULL,
     month TINYINT UNSIGNED NOT NULL,
     close_date VARCHAR(10) NOT NULL,
     apply_year SMALLINT UNSIGNED NOT NULL DEFAULT 0,   -- «اعمال در ماه حقوقی»: ماهی که مساعده/امدادهای بسته‌شدهٔ این بستن در آن اعمال می‌شوند
     apply_month TINYINT UNSIGNED NOT NULL DEFAULT 0,
     note VARCHAR(255) NOT NULL DEFAULT '',
     created_by VARCHAR(100) NOT NULL DEFAULT '',
     created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
     updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
     UNIQUE KEY uq_advclosing_ym (year, month)
   ) ENGINE=InnoDB`,
  `CREATE TABLE IF NOT EXISTS mehr_charges (
     ym CHAR(7) NOT NULL PRIMARY KEY,
     amount DECIMAL(18,0) NOT NULL DEFAULT 0,
     updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
   ) ENGINE=InnoDB`,
  `CREATE TABLE IF NOT EXISTS emdad_loans (
     id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
     code VARCHAR(50) NOT NULL,
     request_date VARCHAR(10) NOT NULL,
     request_time VARCHAR(5) NOT NULL DEFAULT '',
     amount DECIMAL(18,0) NOT NULL DEFAULT 0,
     fee_enabled TINYINT(1) NOT NULL DEFAULT 1,
     fee_percent DECIMAL(5,2) NOT NULL DEFAULT 1,
     installments SMALLINT UNSIGNED NOT NULL DEFAULT 1,
     installment_amount DECIMAL(18,0) NOT NULL DEFAULT 0,
     account VARCHAR(50) NOT NULL DEFAULT '',
     phone VARCHAR(30) NOT NULL DEFAULT '',
     description VARCHAR(255) NOT NULL DEFAULT '',
     status ENUM('pending','paid','cancelled') NOT NULL DEFAULT 'pending',
     paid_date VARCHAR(10) NULL,
     created_by VARCHAR(100) NOT NULL DEFAULT '',
     created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
     updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
     INDEX idx_em_code (code), INDEX idx_em_status (status)
   ) ENGINE=InnoDB`,
  `CREATE TABLE IF NOT EXISTS deduction_codes (
     id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
     code VARCHAR(20) NOT NULL,
     name VARCHAR(150) NOT NULL DEFAULT '',
     emp_status VARCHAR(20) NOT NULL DEFAULT '',
     kind TINYINT UNSIGNED NOT NULL DEFAULT 0,
     group_id INT UNSIGNED NULL,
     created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
     UNIQUE KEY uq_dc (code, emp_status)
   ) ENGINE=InnoDB`,
  `CREATE TABLE IF NOT EXISTS life_insurance (
     id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
     number INT UNSIGNED NOT NULL,
     code VARCHAR(50) NOT NULL,
     ins_type ENUM('mosavab','mokammel') NOT NULL DEFAULT 'mosavab',
     cheque_serial VARCHAR(50) NOT NULL DEFAULT '',
     cheque_date VARCHAR(10) NOT NULL DEFAULT '',
     description VARCHAR(255) NOT NULL DEFAULT '',
     reg_date VARCHAR(10) NOT NULL,
     created_by VARCHAR(100) NOT NULL DEFAULT '',
     created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
     UNIQUE KEY uq_li_number (number), INDEX idx_li_code (code)
   ) ENGINE=InnoDB`,
  `CREATE TABLE IF NOT EXISTS life_beneficiaries (
     id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
     policy_id INT UNSIGNED NOT NULL,
     first_name VARCHAR(100) NOT NULL DEFAULT '',
     last_name VARCHAR(100) NOT NULL DEFAULT '',
     national_id VARCHAR(20) NOT NULL DEFAULT '',
     id_number VARCHAR(20) NOT NULL DEFAULT '',
     issue_place VARCHAR(100) NOT NULL DEFAULT '',
     relation VARCHAR(50) NOT NULL DEFAULT '',
     share_percent DECIMAL(5,2) NOT NULL DEFAULT 100,
     description VARCHAR(255) NOT NULL DEFAULT '',
     active TINYINT(1) NOT NULL DEFAULT 1,
     amount DECIMAL(18,0) NULL,
     account VARCHAR(50) NOT NULL DEFAULT '',
     bank VARCHAR(100) NOT NULL DEFAULT '',
     reg_date VARCHAR(10) NOT NULL DEFAULT '',
     created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
     INDEX idx_lb_policy (policy_id)
   ) ENGINE=InnoDB`,
  `CREATE TABLE IF NOT EXISTS insurance_members (
     id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
     batch VARCHAR(24) NOT NULL,
     main_id VARCHAR(30) NOT NULL DEFAULT '',
     pcode VARCHAR(30) NOT NULL DEFAULT '',
     nid VARCHAR(20) NOT NULL DEFAULT '',
     first_name VARCHAR(80) NOT NULL DEFAULT '',
     last_name VARCHAR(80) NOT NULL DEFAULT '',
     father_name VARCHAR(80) NOT NULL DEFAULT '',
     rel VARCHAR(20) NOT NULL DEFAULT '',
     sex VARCHAR(10) NOT NULL DEFAULT '',
     birth_year VARCHAR(10) NOT NULL DEFAULT '',
     start_cover VARCHAR(12) NOT NULL DEFAULT '',
     end_cover VARCHAR(12) NOT NULL DEFAULT '',
     end_reason VARCHAR(120) NOT NULL DEFAULT '',
     unit VARCHAR(80) NOT NULL DEFAULT '',
     plan VARCHAR(60) NOT NULL DEFAULT '',
     ins_type VARCHAR(30) NOT NULL DEFAULT '',
     policy_no VARCHAR(40) NOT NULL DEFAULT '',
     premium DECIMAL(18,0) NULL,
     cancelled TINYINT(1) NOT NULL DEFAULT 0,
     INDEX idx_im_batch_main (batch, main_id),
     INDEX idx_im_batch_pcode (batch, pcode),
     INDEX idx_im_batch_nid (batch, nid)
   ) ENGINE=InnoDB`,
  `CREATE TABLE IF NOT EXISTS insurance_notes (
     pcode VARCHAR(30) NOT NULL PRIMARY KEY,
     note TEXT NOT NULL,
     updated_by VARCHAR(100) NOT NULL DEFAULT '',
     updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
   ) ENGINE=InnoDB`,
  `CREATE TABLE IF NOT EXISTS insurance_files (
     id TINYINT UNSIGNED NOT NULL PRIMARY KEY,
     batch VARCHAR(24) NOT NULL,
     file_name VARCHAR(255) NOT NULL DEFAULT '',
     uploaded_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
     uploaded_by VARCHAR(100) NOT NULL DEFAULT '',
     row_count INT NOT NULL DEFAULT 0,
     head_count INT NOT NULL DEFAULT 0,
     cancelled_count INT NOT NULL DEFAULT 0
   ) ENGINE=InnoDB`,
  `CREATE TABLE IF NOT EXISTS capital_increases (
     id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
     code VARCHAR(50) NOT NULL,
     kind TINYINT UNSIGNED NOT NULL DEFAULT 1,
     pay_date VARCHAR(10) NOT NULL,
     amount DECIMAL(18,0) NOT NULL DEFAULT 0,
     slip_no VARCHAR(30) NOT NULL DEFAULT '',
     prev_capital DECIMAL(18,0) NULL,
     loan1_remaining DECIMAL(18,0) NULL,
     loan2_remaining DECIMAL(18,0) NULL,
     new_capital DECIMAL(18,0) NULL,
     apply_ym INT NULL,
     change_id INT UNSIGNED NULL,
     created_by VARCHAR(100) NOT NULL DEFAULT '',
     created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
     INDEX idx_ci_code (code), INDEX idx_ci_date (pay_date)
   ) ENGINE=InnoDB`,
  `CREATE TABLE IF NOT EXISTS monthly_changes (
     id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
     code VARCHAR(50) NOT NULL,
     change_date VARCHAR(10) NOT NULL,
     deduction_code VARCHAR(20) NOT NULL,
     deduction_name VARCHAR(150) NOT NULL DEFAULT '',
     loan_row VARCHAR(20) NOT NULL DEFAULT '',
     loan_number VARCHAR(30) NOT NULL DEFAULT '',
     total_amount DECIMAL(18,0) NULL,
     installment_amount DECIMAL(18,0) NULL,
     remaining DECIMAL(18,0) NULL,
     action TINYINT UNSIGNED NOT NULL DEFAULT 1,
     closed TINYINT(1) NOT NULL DEFAULT 0,
     notes VARCHAR(500) NOT NULL DEFAULT '',
     created_by VARCHAR(100) NOT NULL DEFAULT '',
     created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
     updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
     INDEX idx_mc_code (code), INDEX idx_mc_date (change_date), INDEX idx_mc_closed (closed)
   ) ENGINE=InnoDB`,
];

async function hasIndex(pool, table, name) {
  const [r] = await pool.query("SELECT COUNT(*) AS c FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND INDEX_NAME = ?", [table, name]);
  return r[0].c > 0;
}
// ایندکس‌های کارایی (فیلتر/مرتب‌سازی فهرست‌ها و جست‌وجو با کد پرسنلی)؛ خطا در هر کدام بقیه را متوقف نمی‌کند
async function ensureIndexes(pool) {
  const want = [
    ["loan_queue", "idx_lq_code_status", "(code, status)"],
    ["loan_queue", "idx_lq_status_due", "(status, due_year, due_month)"],
    ["monthly_changes", "idx_mc_code_date", "(code, change_date)"],
    ["monthly_changes", "idx_mc_date", "(change_date, closed)"],
    ["advances", "idx_adv_code", "(code)"],
    ["advances", "idx_adv_status_date", "(status, request_date)"],
    ["emdad_loans", "idx_em_code", "(code)"],
    ["emdad_loans", "idx_em_status_date", "(status, request_date)"],
    ["mehr_loans", "idx_mh_code", "(code)"],
    ["mehr_loans", "idx_mh_status_date", "(status, request_date)"],
    ["goods_orders", "idx_go_code_date", "(code, order_date)"],
    ["goods_orders", "idx_go_date", "(order_date, status)"],
  ];
  for (const [t, n, cols] of want) {
    try { if (!(await hasIndex(pool, t, n))) { await pool.query(`CREATE INDEX ${n} ON ${t} ${cols}`); console.log(`ایندکس ${n} ساخته شد.`); } }
    catch (e) { console.warn(`ساخت ایندکس ${n} ممکن نشد:`, e.message); }
  }
}
async function hasColumn(pool, table, col) {
  const [r] = await pool.query(
    "SELECT COUNT(*) AS c FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?",
    [table, col]);
  return r[0].c > 0;
}


// ترمیم نصب‌هایی که schema.sql با کلاینت mysql ویندوز (کدپیج غیر UTF-8) اجرا شده و پیش‌فرض‌های فارسی
// («ریال»، «عدد») به «?» تبدیل شده‌اند: هم پیش‌فرض ستون و هم ردیف‌های خراب اصلاح می‌شود.
async function repairBrokenDefaults(pool) {
  const fixes = [["settings", "unit", "ریال"], ["products", "unit", "عدد"], ["goods_order_items", "unit", "عدد"]];
  for (const [table, col, good] of fixes) {
    try {
      const [cols] = await pool.query("SELECT COLUMN_DEFAULT AS d FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?", [table, col]);
      if (!cols.length) continue;
      if (/^[?؟]+$/.test(String(cols[0].d || ""))) await pool.query("ALTER TABLE ?? ALTER COLUMN ?? SET DEFAULT ''", [table, col]);
      const [r] = await pool.query("UPDATE ?? SET ?? = ? WHERE ?? REGEXP ?", [table, col, good, col, "^[?؟]+$"]);
      if (r.affectedRows) console.log(`ترمیم متن خراب‌شده: ${table}.${col} ← «${good}» (${r.affectedRows} ردیف)`);
    } catch (e) { console.warn(`ترمیم ${table}.${col} انجام نشد:`, e.message); }
  }
}

async function ensureTables(pool) {
  for (const sql of DDL) await pool.query(sql);

  // مساعده: ثبت‌کننده (نام کاربر)
  if (!(await hasColumn(pool, "advances", "created_by"))) await pool.query("ALTER TABLE advances ADD COLUMN created_by VARCHAR(100) NOT NULL DEFAULT ''");

  // کالا: گروه و تعداد اقساط پیش‌فرض
  if (!(await hasColumn(pool, "products", "group_id"))) await pool.query("ALTER TABLE products ADD COLUMN group_id INT UNSIGNED NULL");
  if (!(await hasColumn(pool, "goods_order_items", "installments"))) await pool.query("ALTER TABLE goods_order_items ADD COLUMN installments SMALLINT UNSIGNED NULL");
  if (!(await hasColumn(pool, "goods_order_items", "installment_amount"))) await pool.query("ALTER TABLE goods_order_items ADD COLUMN installment_amount DECIMAL(18,0) NULL");
  if (!(await hasColumn(pool, "goods_order_items", "last_installment_amount"))) await pool.query("ALTER TABLE goods_order_items ADD COLUMN last_installment_amount DECIMAL(18,0) NULL");
  if (!(await hasColumn(pool, "goods_order_items", "down_share"))) await pool.query("ALTER TABLE goods_order_items ADD COLUMN down_share DECIMAL(18,0) NULL");
  if (!(await hasColumn(pool, "products", "default_installments"))) await pool.query("ALTER TABLE products ADD COLUMN default_installments SMALLINT UNSIGNED NOT NULL DEFAULT 1");
  // پرسنل: تاریخ و مبلغ لغو عضویت صندوق وام ضروری
  if (!(await hasColumn(pool, "capital_increases", "new_capital"))) await pool.query("ALTER TABLE capital_increases ADD COLUMN new_capital DECIMAL(18,0) NULL AFTER loan2_remaining");
  if (!(await hasColumn(pool, "capital_increases", "apply_ym"))) await pool.query("ALTER TABLE capital_increases ADD COLUMN apply_ym INT NULL AFTER new_capital");
  if (!(await hasColumn(pool, "personnel", "membership_cancel_date"))) await pool.query("ALTER TABLE personnel ADD COLUMN membership_cancel_date VARCHAR(10) NOT NULL DEFAULT ''");
  if (!(await hasColumn(pool, "personnel", "membership_cancel_amount"))) await pool.query("ALTER TABLE personnel ADD COLUMN membership_cancel_amount DECIMAL(18,0) NULL");
  // پرسنل: شمارهٔ شبا (۱۳ رقم آخر آن = شمارهٔ حساب)
  if (!(await hasColumn(pool, "personnel", "shaba"))) await pool.query("ALTER TABLE personnel ADD COLUMN shaba VARCHAR(30) NOT NULL DEFAULT '' AFTER advance_account");
  // درگذشتگان: تیک «واریز شده» برای هر وارث (جدول‌های قدیمی)
  if (!(await hasColumn(pool, "deceased_heirs", "paid"))) await pool.query("ALTER TABLE deceased_heirs ADD COLUMN paid TINYINT(1) NOT NULL DEFAULT 0 AFTER pay_date");
  // پرسنل: نام بانک (پیش‌فرض: بازنشسته/وظیفه‌بگیر ← صادرات، شاغل ← ملی) و رشتهٔ تحصیلی
  if (!(await hasColumn(pool, "personnel", "bank_name"))) {
    await pool.query("ALTER TABLE personnel ADD COLUMN bank_name VARCHAR(60) NOT NULL DEFAULT '' AFTER shaba");
    await pool.query("UPDATE personnel SET bank_name = CASE WHEN status IN ('بازنشسته', 'وظیفه بگیر') THEN 'صادرات' WHEN status = 'شاغل' THEN 'ملی' ELSE '' END WHERE bank_name = ''");
  }
  if (!(await hasColumn(pool, "personnel", "field_of_study"))) await pool.query("ALTER TABLE personnel ADD COLUMN field_of_study VARCHAR(150) NOT NULL DEFAULT '' AFTER education");
  // فیش‌ها: عکس‌فوری حساب/شبا/بانک در لحظهٔ بارگذاری فایل، تا تغییر اطلاعات پرسنل فیش‌های قبلی را عوض نکند
  const hadFrozen = await hasColumn(pool, "people", "bank_frozen");
  if (!(await hasColumn(pool, "people", "bank_account"))) await pool.query("ALTER TABLE people ADD COLUMN bank_account VARCHAR(50) NOT NULL DEFAULT ''");
  if (!(await hasColumn(pool, "people", "shaba"))) await pool.query("ALTER TABLE people ADD COLUMN shaba VARCHAR(30) NOT NULL DEFAULT ''");
  if (!(await hasColumn(pool, "people", "bank_name"))) await pool.query("ALTER TABLE people ADD COLUMN bank_name VARCHAR(80) NOT NULL DEFAULT ''");
  if (!hadFrozen) {
    await pool.query("ALTER TABLE people ADD COLUMN bank_frozen TINYINT(1) NOT NULL DEFAULT 0");
    // یک‌بار: فیش‌های موجود با مقدار فعلی پرسنل ثابت می‌شوند تا از این پس تغییر نکنند
    try { await require("./slipBank").freezeBank(pool, {}); } catch (e) { console.error("ثابت‌سازی حساب فیش‌های موجود ناموفق:", e.message); }
  }
  // پرسنل (فایل کارگزینی جدید): نام صاحب حساب مساعده، شغل، رتبه شغلی، گروه کاری، کد بیمه
  for (const [c, def] of [["advance_owner", "VARCHAR(100)"], ["job_role", "VARCHAR(100)"], ["job_rank", "VARCHAR(30)"], ["job_group", "VARCHAR(30)"], ["insurance_code", "VARCHAR(20)"]]) {
    if (!(await hasColumn(pool, "personnel", c))) await pool.query(`ALTER TABLE personnel ADD COLUMN ${c} ${def} NOT NULL DEFAULT ''`);
  }
  if (!(await hasColumn(pool, "mehr_loans", "fee_percent"))) await pool.query("ALTER TABLE mehr_loans ADD COLUMN fee_percent DECIMAL(5,2) NOT NULL DEFAULT 4 AFTER last_installment_amount");
  if (!(await hasColumn(pool, "deduction_summary", "remaining_amount"))) await pool.query("ALTER TABLE deduction_summary ADD COLUMN remaining_amount DECIMAL(20,2) NULL");
  if (!(await hasColumn(pool, "advances", "account_owner"))) await pool.query("ALTER TABLE advances ADD COLUMN account_owner VARCHAR(100) NOT NULL DEFAULT ''");
  if (!(await hasColumn(pool, "emdad_loans", "account_owner"))) await pool.query("ALTER TABLE emdad_loans ADD COLUMN account_owner VARCHAR(100) NOT NULL DEFAULT ''");   // نام صاحب حسابِ واریز
  if (!(await hasColumn(pool, "advance_closings", "apply_year"))) {
    await pool.query("ALTER TABLE advance_closings ADD COLUMN apply_year SMALLINT UNSIGNED NOT NULL DEFAULT 0, ADD COLUMN apply_month TINYINT UNSIGNED NOT NULL DEFAULT 0");
    await pool.query("UPDATE advance_closings SET apply_year = year, apply_month = month WHERE apply_year = 0");   // بستن‌های قبلی: اعمال در همان ماه
  }
  if (!(await hasColumn(pool, "advances", "closing_id"))) await pool.query("ALTER TABLE advances ADD COLUMN closing_id INT UNSIGNED NULL");
  if (!(await hasColumn(pool, "emdad_loans", "closed"))) await pool.query("ALTER TABLE emdad_loans ADD COLUMN closed TINYINT(1) NOT NULL DEFAULT 0");
  if (!(await hasColumn(pool, "emdad_loans", "closing_id"))) await pool.query("ALTER TABLE emdad_loans ADD COLUMN closing_id INT UNSIGNED NULL");
  if (!(await hasColumn(pool, "advances", "closed"))) await pool.query("ALTER TABLE advances ADD COLUMN closed TINYINT(1) NOT NULL DEFAULT 0");   // «بستن مساعده»: مساعدهٔ پرداخت‌شده با تاریخ پرداخت ≤ تاریخ بستن، قفل می‌شود
  if (!(await hasColumn(pool, "emdad_loans", "grant_amount"))) await pool.query("ALTER TABLE emdad_loans ADD COLUMN grant_amount DECIMAL(18,0) NOT NULL DEFAULT 0");   // وام بلاعوض (بخشی از مبلغ وام که بازپرداخت ندارد)
  if (!(await hasColumn(pool, "institutions", "letter_code"))) await pool.query("ALTER TABLE institutions ADD COLUMN letter_code VARCHAR(30) NOT NULL DEFAULT ''");
  if (!(await hasColumn(pool, "mehr_loans", "turn_date"))) await pool.query("ALTER TABLE mehr_loans ADD COLUMN turn_date VARCHAR(10) NOT NULL DEFAULT '' AFTER fee_percent");
  if (!(await hasColumn(pool, "mehr_loans", "received_date"))) await pool.query("ALTER TABLE mehr_loans ADD COLUMN received_date VARCHAR(10) NOT NULL DEFAULT '' AFTER turn_date");
  if (!(await hasColumn(pool, "mehr_loans", "fail_reason"))) await pool.query("ALTER TABLE mehr_loans ADD COLUMN fail_reason VARCHAR(255) NOT NULL DEFAULT '' AFTER received_date");
  {   // وضعیت «دریافت‌نشده» (failed) به enum اضافه شود
    const [[ct]] = await pool.query("SELECT COLUMN_TYPE AS t FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'mehr_loans' AND COLUMN_NAME = 'status'");
    if (ct && !String(ct.t).includes("failed")) await pool.query("ALTER TABLE mehr_loans MODIFY COLUMN status ENUM('pending','paid','failed','cancelled') NOT NULL DEFAULT 'pending'");
  }
  // پرسنل: شماره حساب بانک مهر (برای وام بانک مهر)
  if (!(await hasColumn(pool, "personnel", "mehr_account"))) await pool.query("ALTER TABLE personnel ADD COLUMN mehr_account VARCHAR(50) NOT NULL DEFAULT ''");
  // پرسنل: «دفتر کل» (از فایل حقوق بازنشستگان) و فیلدهای دلخواه صفحهٔ پرسنل (JSON)
  if (!(await hasColumn(pool, "personnel", "ledger"))) await pool.query("ALTER TABLE personnel ADD COLUMN ledger VARCHAR(60) NOT NULL DEFAULT ''");
  if (!(await hasColumn(pool, "personnel", "extra"))) await pool.query("ALTER TABLE personnel ADD COLUMN extra JSON NULL");
  // کاربران: ترتیب دلخواه منو روی سرور
  if (!(await hasColumn(pool, "users", "nav_order"))) await pool.query("ALTER TABLE users ADD COLUMN nav_order JSON NULL");
  // سرعت: جست‌وجوی فیش‌های یک فرد (people.code) ایندکس نداشت و هر انتخاب فرد کل جدول را اسکن می‌کرد
  try {
    const [ix] = await pool.query("SELECT 1 FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = 'people' AND index_name = 'idx_people_code' LIMIT 1");
    if (!ix.length) await pool.query("ALTER TABLE people ADD INDEX idx_people_code (code)");
  } catch (e) { console.warn("ایندکس people.code ساخته نشد:", e.message); }
  // کد کسر: نسخهٔ قدیمی کلیدش خود کد بود؛ حالا (کد + وضعیت شغلی) یکتاست و نوع قسط/سهم و گروه دارد
  if (!(await hasColumn(pool, "deduction_codes", "id"))) {
    await pool.query("ALTER TABLE deduction_codes DROP PRIMARY KEY, ADD COLUMN id INT UNSIGNED NOT NULL AUTO_INCREMENT FIRST, ADD PRIMARY KEY (id), ADD COLUMN emp_status VARCHAR(20) NOT NULL DEFAULT '' AFTER name, ADD COLUMN kind TINYINT UNSIGNED NOT NULL DEFAULT 0 AFTER emp_status, ADD COLUMN group_id INT UNSIGNED NULL AFTER kind, ADD UNIQUE KEY uq_dc (code, emp_status)");
  }
  // کدهای کسر پیش‌فرض (فقط اگر جدول خالی است)
  try {
    const [[{ dc }]] = await pool.query("SELECT COUNT(*) AS dc FROM deduction_codes");
    if (!dc) for (const [c, n] of [["710", "وام رفاه"], ["730", "بیمه عمر مکمل"], ["796", "سرمایه صندوق وام ضروری"], ["798", "سهم امداد"]]) await pool.query("INSERT IGNORE INTO deduction_codes (code, name) VALUES (?, ?)", [c, n]);
  } catch (e) { console.warn("کدهای کسر پیش‌فرض ساخته نشد:", e.message); }
  // سابقهٔ تغییر وضعیت پرسنل: علت و شرح
  try {
    if (!(await hasColumn(pool, "personnel_status_log", "reason"))) await pool.query("ALTER TABLE personnel_status_log ADD COLUMN reason VARCHAR(60) NOT NULL DEFAULT ''");
    if (!(await hasColumn(pool, "personnel_status_log", "note"))) await pool.query("ALTER TABLE personnel_status_log ADD COLUMN note VARCHAR(500) NOT NULL DEFAULT ''");
  } catch (e) { console.warn("personnel_status_log:", e.message); }

  // اولین راه‌اندازی: رمز موقت مدیر تصادفی است و فقط یک‌بار در خروجی همین اجرا نمایش داده می‌شود.
  const [[{ n }]] = await pool.query("SELECT COUNT(*) AS n FROM users");
  if (!n) {
    const temporaryPassword = crypto.randomBytes(24).toString("hex");
    await pool.query("INSERT INTO users (username, password_hash, full_name, is_admin, active, permissions, must_change) VALUES ('admin', ?, 'مدیر سیستم', 1, 1, '[]', 1)", [hashPassword(temporaryPassword)]);
    console.log(`مدیر اولیه ساخته شد — نام کاربری: admin  رمز موقت: ${temporaryPassword} (در اولین ورود باید تغییر کند؛ این رمز را امن نگه دارید)`);
  }

  // loan_queue: ستون‌های ثبت دستی
  const add = [
    ["loan_number", "VARCHAR(20) NULL"],
    ["request_date", "VARCHAR(10) NULL"],
    ["notes", "VARCHAR(500) NULL"],
    ["source", "ENUM('auto','manual') NOT NULL DEFAULT 'auto'"],
    ["inst_start_year", "SMALLINT UNSIGNED NULL"],
    ["inst_start_month", "TINYINT UNSIGNED NULL"],
    ["inst_end_year", "SMALLINT UNSIGNED NULL"],
    ["inst_end_month", "TINYINT UNSIGNED NULL"],
    ["inst_current_amount", "DECIMAL(18,0) NULL"],
    ["inst_seen_ym", "INT NULL"],
    ["inst_loan_paid", "DECIMAL(18,0) NULL"],
    ["g_code", "VARCHAR(50) NULL"],
    ["g_name", "VARCHAR(120) NULL"],
    ["g_national_id", "VARCHAR(20) NULL"],
    ["g_birth_date", "VARCHAR(10) NULL"],
    ["g_mobile", "VARCHAR(30) NULL"],
    ["g_workplace", "VARCHAR(150) NULL"],
  ];
  for (const [c, def] of add) {
    if (!(await hasColumn(pool, "loan_queue", c))) await pool.query(`ALTER TABLE loan_queue ADD COLUMN ${c} ${def}`);
  }
  // وام دستی دورهٔ حقوقی ندارد -> registration_period_id باید NULL بپذیرد
  const [nul] = await pool.query(
    "SELECT IS_NULLABLE AS n FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'loan_queue' AND COLUMN_NAME = 'registration_period_id'");
  if (nul.length && nul[0].n === "NO") {
    try { await pool.query("ALTER TABLE loan_queue DROP FOREIGN KEY fk_lq_reg_period"); } catch (e) { /* ممکن است نام دیگری داشته باشد */ }
    await pool.query("ALTER TABLE loan_queue MODIFY registration_period_id INT UNSIGNED NULL");
    try {
      await pool.query("ALTER TABLE loan_queue ADD CONSTRAINT fk_lq_reg_period FOREIGN KEY (registration_period_id) REFERENCES periods(id) ON DELETE CASCADE");
    } catch (e) { console.warn("افزودن مجدد کلید خارجی loan_queue ممکن نشد:", e.message); }
  }

  await fixArabicOnce(pool);
  await padNidOnce(pool);
  await ensureIndexes(pool);
  try { await require("./loanQueueSync").backfillReceived(pool); } catch (e) { console.warn("تکمیل تاریخ دریافت وام ممکن نشد:", e.message); }
  await repairBrokenDefaults(pool);
}

// یک‌بار: «ي/ك» عربیِ داده‌های موجود (پرسنل و فیش‌ها) به «ی/ک» فارسی تبدیل می‌شود
// یک‌بار: کد ملی ۸ و ۹ رقمیِ موجود با صفر اول ۱۰ رقمی می‌شود
async function padNidOnce(pool) {
  try {
    await pool.query("CREATE TABLE IF NOT EXISTS app_flags (k VARCHAR(60) PRIMARY KEY, v VARCHAR(40) NOT NULL DEFAULT '') ENGINE=InnoDB");
    const [f] = await pool.query("SELECT v FROM app_flags WHERE k = 'nid_pad_v1'");
    if (f.length) return;
    for (const t of ["personnel", "people", "deceased"]) {
      await pool.query(`UPDATE ${t} SET national_id = LPAD(national_id, 10, '0') WHERE national_id REGEXP '^[0-9]{8,9}$'`);
    }
    await pool.query("INSERT INTO app_flags (k, v) VALUES ('nid_pad_v1', 'done')");
    console.log("کدملی‌های ۸/۹ رقمی موجود ۱۰ رقمی شد.");
  } catch (e) { console.warn("۱۰ رقمی کردن کدملی‌های قبلی ممکن نشد:", e.message); }
}

async function fixArabicOnce(pool) {
  try {
    await pool.query("CREATE TABLE IF NOT EXISTS app_flags (k VARCHAR(60) PRIMARY KEY, v VARCHAR(40) NOT NULL DEFAULT '') ENGINE=InnoDB");
    const [f] = await pool.query("SELECT v FROM app_flags WHERE k = 'arabic_fix_v1'");
    if (f.length) return;
    const fx = (c) => `REPLACE(REPLACE(CAST(${c} AS CHAR CHARACTER SET utf8mb4) COLLATE utf8mb4_bin, '\u064A', '\u06CC'), '\u0643', '\u06A9')`;
    const [cols] = await pool.query("SELECT COLUMN_NAME c FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'personnel' AND DATA_TYPE IN ('varchar','text') AND COLUMN_NAME NOT IN ('code')");
    if (cols.length) await pool.query(`UPDATE personnel SET ${cols.map((x) => `${x.c} = ${fx(x.c)}`).join(", ")}`);
    await pool.query(`UPDATE people SET name = ${fx("name")}, data = CAST(${fx("data")} AS JSON)`);
    await pool.query("INSERT INTO app_flags (k, v) VALUES ('arabic_fix_v1', 'done')");
    console.log("ي/ك عربی داده‌های موجود به فارسی تبدیل شد.");
  } catch (e) { console.warn("تبدیل ي/ك عربی داده‌های قبلی ممکن نشد:", e.message); }
}

module.exports = ensureTables;
