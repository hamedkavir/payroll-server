// خاموش شدن امن (Graceful Shutdown) — نسخهٔ ۱۱۱
// با SIGINT (Ctrl+C) یا SIGTERM (سرویس ویندوز/systemd/pm2):
//   ۱) درخواست تازه پذیرفته نمی‌شود (server.close) و اتصال‌های بیکار keep-alive بسته می‌شوند
//   ۲) کارهای در جریان (پاسخ‌های نیمه‌کاره، پشتیبان‌گیری/بازیابی) تا سقف زمان مهلت تمام می‌شوند
//   ۳) زمان‌سنج‌های پس‌زمینه متوقف و اتصال‌های دیتابیس (pool.end) بسته می‌شوند
//   ۴) اگر تا timeoutMs (پیش‌فرض ۱۵ ثانیه؛ SHUTDOWN_TIMEOUT_MS) تمام نشد، خروج اجباری با کد ۱
// سیگنال دوم در حین خاموش شدن ← خروج فوری.
function createShutdown({ server, pool, timeoutMs, log = console, exit = (c) => process.exit(c), onStop = [], isBusy = () => false, pollMs = 200 } = {}) {
  let started = null;
  const limit = Math.max(1000, Number(timeoutMs || process.env.SHUTDOWN_TIMEOUT_MS || 15000));

  const closeServer = () => new Promise((resolve) => {
    if (!server) return resolve();
    try {
      server.close(() => resolve());
      if (typeof server.closeIdleConnections === "function") server.closeIdleConnections();
    } catch (e) { resolve(); }
  });
  const waitIdle = async () => {
    // عملیات پشتیبان‌گیری/بازیابی نباید وسط کار قطع شود
    while (isBusy()) await new Promise((r) => setTimeout(r, pollMs));
  };

  async function shutdown(signal) {
    if (started) {
      log.warn(`سیگنال ${signal} دوباره دریافت شد؛ خروج فوری.`);
      exit(1);
      return started;
    }
    log.log(`سیگنال ${signal} دریافت شد؛ خاموش شدن امن سرور...`);
    const timer = setTimeout(() => {
      log.error(`خاموش شدن در ${limit} میلی‌ثانیه تمام نشد؛ خروج اجباری.`);
      if (server && typeof server.closeAllConnections === "function") { try { server.closeAllConnections(); } catch (e) { /* */ } }
      exit(1);
    }, limit);
    if (timer.unref) timer.unref();
    started = (async () => {
      let code = 0;
      for (const fn of onStop) { try { await fn(); } catch (e) { log.warn("توقف کار پس‌زمینه:", e.message); } }
      await closeServer();
      await waitIdle();
      if (pool && typeof pool.end === "function") {
        try { await pool.end(); } catch (e) { code = 1; log.warn("بستن اتصال‌های دیتابیس:", e.message); }
      }
      clearTimeout(timer);
      log.log("سرور با موفقیت متوقف شد.");
      exit(code);
      return code;
    })();
    return started;
  }

  function install(proc = process) {
    for (const s of ["SIGINT", "SIGTERM"]) proc.on(s, () => { shutdown(s); });
    return shutdown;
  }
  return { shutdown, install, get started() { return !!started; }, timeoutMs: limit };
}

module.exports = { createShutdown };
