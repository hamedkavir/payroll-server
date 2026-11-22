// Migration 006 (نسخهٔ ۱۱۱) — ایندکس‌های همگام‌سازی سبک و پاک‌سازی نشست‌ها
// - people(updated_at) و periods(updated_at): GET /api/sync بیشینهٔ updated_at را بدون پیمایش کل جدول می‌خواند
// - user_sessions(expires_at): «DELETE FROM user_sessions WHERE expires_at < NOW()» در هر ورود بدون پیمایش کامل
// idempotent است: اگر ایندکس از قبل باشد (مثلاً نصب تازه از schema.sql) کاری انجام نمی‌شود.
module.exports = {
  description: "indexes for /api/sync and session cleanup",
  async up(conn, h) {
    await h.addIndex("people", "idx_people_updated", ["updated_at"]);
    await h.addIndex("periods", "idx_periods_updated", ["updated_at"]);
    await h.addIndex("user_sessions", "idx_sess_expires", ["expires_at"]);
  },
};
