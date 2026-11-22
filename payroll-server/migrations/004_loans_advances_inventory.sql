-- معادل دستیِ server/ensureTables.js (سرور این کار را در هر بار راه‌اندازی خودکار انجام می‌دهد).
-- فقط اگر می‌خواهید دستی اجرا کنید:
USE payslip_db;
ALTER TABLE loan_queue ADD COLUMN loan_number VARCHAR(20) NULL;
ALTER TABLE loan_queue ADD COLUMN request_date VARCHAR(10) NULL;
ALTER TABLE loan_queue ADD COLUMN notes VARCHAR(500) NULL;
ALTER TABLE loan_queue ADD COLUMN source ENUM('auto','manual') NOT NULL DEFAULT 'auto';
ALTER TABLE loan_queue DROP FOREIGN KEY fk_lq_reg_period;
ALTER TABLE loan_queue MODIFY registration_period_id INT UNSIGNED NULL;
ALTER TABLE loan_queue ADD CONSTRAINT fk_lq_reg_period FOREIGN KEY (registration_period_id) REFERENCES periods(id) ON DELETE CASCADE;
-- جدول‌های advances, products, stock_movements, goods_orders, goods_order_items, form_settings:
-- تعریفشان در server/ensureTables.js است (CREATE TABLE IF NOT EXISTS).
