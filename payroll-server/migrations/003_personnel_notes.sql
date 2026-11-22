-- افزودن ستون «توضیحات» به جدول پرسنل (اگر سرور راه بیفتد این کار را خودکار هم انجام می‌دهد)
USE payslip_db;
ALTER TABLE personnel ADD COLUMN notes TEXT NULL;
