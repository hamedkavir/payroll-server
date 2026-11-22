// خاموش شدن امن (server/shutdown.js)
const assert = require("assert");
const { EventEmitter } = require("events");
const H = require("./helpers");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const quiet = () => { const l = { lines: [], log: (...a) => l.lines.push(["log", a.join(" ")]), warn: (...a) => l.lines.push(["warn", a.join(" ")]), error: (...a) => l.lines.push(["error", a.join(" ")]) }; return l; };
function rig(o = {}) {
  const events = [];
  const server = {
    close(cb) { events.push("server.close"); if (o.serverHangs) return; setTimeout(cb, o.closeDelay || 5); },
    closeIdleConnections() { events.push("closeIdle"); },
    closeAllConnections() { events.push("closeAll"); },
  };
  const pool = { async end() { events.push("pool.end"); if (o.poolFails) throw new Error("pool gone"); } };
  const exits = [];
  let resolveExit; const exited = new Promise((r) => { resolveExit = r; });
  const log = quiet();
  const { createShutdown } = H.load("shutdown.js");
  const sd = createShutdown({
    server, pool, log, timeoutMs: o.timeoutMs, pollMs: 5,
    exit: (c) => { events.push("exit:" + c); exits.push(c); resolveExit(c); },
    isBusy: o.isBusy || (() => false),
    onStop: o.onStop || [() => { events.push("onStop"); }],
  });
  return { sd, events, exits, exited, log };
}

exports["خاموش شدن: ترتیب — توقف کارهای پس‌زمینه ← بستن سرور ← بستن pool ← خروج با کد ۰"] = async () => {
  const r = rig();
  assert.strictEqual(r.sd.started, false);
  const code = await r.sd.shutdown("SIGTERM");
  assert.strictEqual(code, 0);
  assert.deepStrictEqual(r.events, ["onStop", "server.close", "closeIdle", "pool.end", "exit:0"]);
  assert.strictEqual(r.sd.started, true);
};

exports["خاموش شدن: تا پایان پشتیبان‌گیری/بازیابی در جریان صبر می‌کند و بعد pool را می‌بندد"] = async () => {
  let busyChecks = 0, r;
  r = rig({ isBusy: () => { busyChecks++; r.events.push("busy?"); return busyChecks <= 6; } });
  const t0 = Date.now();
  await r.sd.shutdown("SIGINT");
  assert.ok(busyChecks >= 7, `بررسی مشغول بودن: ${busyChecks}`);
  assert.ok(Date.now() - t0 >= 25, "باید منتظر مانده باشد");
  // اول درخواست تازه بسته می‌شود، بعد منتظر پشتیبان می‌مانیم، و فقط در پایان pool بسته می‌شود
  assert.ok(r.events.indexOf("server.close") < r.events.indexOf("busy?"), r.events.join(","));
  assert.ok(r.events.lastIndexOf("busy?") < r.events.indexOf("pool.end"), r.events.join(","));
  assert.deepStrictEqual(r.exits, [0]);
};

exports["خاموش شدن: خطای بستن دیتابیس ← کد ۱؛ خطای کار پس‌زمینه مانع ادامه نمی‌شود"] = async () => {
  const r = rig({ poolFails: true, onStop: [() => { throw new Error("timer"); }, () => { r2.push("second"); }] });
  const r2 = [];
  const code = await r.sd.shutdown("SIGTERM");
  assert.strictEqual(code, 1);
  assert.deepStrictEqual(r2, ["second"], "onStop بعدی هم اجرا شود");
  assert.ok(r.events.includes("server.close") && r.events.includes("pool.end"));
  assert.ok(r.log.lines.some(([k, t]) => k === "warn" && /pool gone/.test(t)));
  assert.deepStrictEqual(r.exits, [1]);
};

exports["خاموش شدن: سیگنال دوم در حین خاموش شدن ← خروج فوری با کد ۱"] = async () => {
  const r = rig({ closeDelay: 60 });
  const first = r.sd.shutdown("SIGTERM");
  await sleep(5);
  r.sd.shutdown("SIGINT");
  assert.deepStrictEqual(r.exits, [1], "خروج فوری");
  await first;
  assert.strictEqual(r.events.filter((e) => e === "server.close").length, 1, "server.close فقط یک بار");
};

exports["خاموش شدن: اگر تا مهلت تمام نشود، اتصال‌ها اجباری بسته و با کد ۱ خارج می‌شود"] = async () => {
  const r = rig({ serverHangs: true, timeoutMs: 1000 });
  assert.strictEqual(r.sd.timeoutMs, 1000);
  r.sd.shutdown("SIGTERM");
  const code = await Promise.race([r.exited, sleep(2500).then(() => "no-exit")]);
  assert.strictEqual(code, 1);
  assert.ok(r.events.includes("closeAll"), "closeAllConnections صدا زده شود");
  assert.ok(!r.events.includes("pool.end"), "pool هنوز بسته نشده چون سرور گیر کرده");
  assert.ok(r.log.lines.some(([k]) => k === "error"));
};

exports["خاموش شدن: مهلت کمتر از ۱ ثانیه پذیرفته نمی‌شود؛ SHUTDOWN_TIMEOUT_MS خوانده می‌شود"] = async () => {
  const { createShutdown } = H.load("shutdown.js");
  assert.strictEqual(createShutdown({ timeoutMs: 10 }).timeoutMs, 1000);
  const sv = process.env.SHUTDOWN_TIMEOUT_MS;
  process.env.SHUTDOWN_TIMEOUT_MS = "4000";
  try { assert.strictEqual(createShutdown({}).timeoutMs, 4000); }
  finally { if (sv === undefined) delete process.env.SHUTDOWN_TIMEOUT_MS; else process.env.SHUTDOWN_TIMEOUT_MS = sv; }
  assert.strictEqual(createShutdown({}).timeoutMs, 15000, "پیش‌فرض ۱۵ ثانیه");
};

exports["خاموش شدن: install روی SIGINT و SIGTERM گوش می‌دهد"] = async () => {
  const r = rig();
  const proc = new EventEmitter();
  r.sd.install(proc);
  assert.strictEqual(proc.listenerCount("SIGINT"), 1);
  assert.strictEqual(proc.listenerCount("SIGTERM"), 1);
  proc.emit("SIGTERM");
  assert.strictEqual(await r.exited, 0);
  assert.ok(r.log.lines.some(([, t]) => /SIGTERM/.test(t)));
};

exports["خاموش شدن: بدون سرور و pool هم بی‌خطا خارج می‌شود؛ app.js آن را با isBusy پشتیبان نصب می‌کند"] = async () => {
  const { createShutdown } = H.load("shutdown.js");
  let code;
  const sd = createShutdown({ log: quiet(), exit: (c) => { code = c; } , onStop: [] });
  await sd.shutdown("SIGTERM");
  assert.strictEqual(code, 0);
  const src = require("fs").readFileSync(require("path").join(H.SRV, "app.js"), "utf8");
  assert.ok(/require\("\.\/shutdown"\)\.createShutdown\(\{[\s\S]*server, pool,[\s\S]*isBusy: \(\) => backupRoutes\.backup\.isBusy\(\)[\s\S]*\}\)\.install\(\)/.test(src));
};
