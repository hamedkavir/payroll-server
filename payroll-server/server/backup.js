// پشتیبان‌گیری و بازیابی کل دیتابیس بدون نیاز به ابزار بیرونی (mysqldump).
// قالب فایل: NDJSON فشرده با gzip (*.ndjson.gz)، هر خط یک ردیف؛ خط اول $meta و خط آخر $end (برای تشخیص فایل ناقص).
// پشتیبان با «اسنپ‌شات یکدست» (START TRANSACTION WITH CONSISTENT SNAPSHOT) و به‌صورت استریم گرفته می‌شود،
// پس با ده‌ها میلیون ردیف هم حافظهٔ زیادی نمی‌گیرد. بازیابی در یک تراکنش انجام می‌شود (خطا = بدون تغییر).
// جدول user_sessions (نشست‌های ورود) در پشتیبان نیست تا بازیابی کاربر فعلی را بیرون نیندازد.
const fs = require("fs");
const path = require("path");
const zlib = require("zlib");
const { pipeline } = require("stream");
const { once } = require("events");
const { UserError, logError } = require("./errors");

const FORMAT = "payslip-backup-v1";
const SKIP = new Set(["user_sessions"]);
const NAME_RE = /^[A-Za-z0-9._-]+\.ndjson\.gz$/;
const KINDS = ["manual", "auto", "pre-restore", "pre-migrate", "uploaded"];   // pre-migrate: پشتیبان خودکار پیش از اجرای Migration (migrate.js)
const q = (id) => "`" + String(id).replace(/`/g, "``") + "`";
const pad = (n) => String(n).padStart(2, "0");
const stamp = (d = new Date()) => `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;

// تاریخ/زمان و JSON را به‌صورت رشته (همان‌طور که MySQL نگه می‌دارد) می‌خوانیم تا بازیابی دقیق باشد
const typeCast = (field, next) => {
  const t = field.type;
  if (t === "DATE" || t === "NEWDATE" || t === "DATETIME" || t === "TIMESTAMP" || t === "TIME" || t === "JSON") return field.string("utf8"); // رمزگذاری صریح: بدون آن mysql2 ستون JSON را باینری می‌بیند و هشدار می‌دهد
  return next();
};

module.exports = function makeBackup(pool) {
  const DIR = process.env.BACKUP_DIR ? path.resolve(process.env.BACKUP_DIR) : path.join(__dirname, "..", "backups");
  let busy = false;

  const validName = (n) => typeof n === "string" && NAME_RE.test(n) && path.basename(n) === n;
  const filePath = (n) => path.join(DIR, n);
  const kindOf = (n) => KINDS.find((k) => n.startsWith(k + "-")) || "manual";
  function fileInfo(name) {
    const st = fs.statSync(filePath(name));
    return { name, size: st.size, mtime: st.mtimeMs, kind: kindOf(name) };
  }
  function listBackups() {
    if (!fs.existsSync(DIR)) return [];
    return fs.readdirSync(DIR).filter(validName).map(fileInfo).sort((a, b) => b.mtime - a.mtime);
  }
  function prune(kind, keep) {
    listBackups().filter((f) => f.kind === kind).slice(keep).forEach((f) => { try { fs.unlinkSync(filePath(f.name)); } catch (e) {} });
  }
  function deleteBackup(name) {
    if (!validName(name) || !fs.existsSync(filePath(name))) throw new UserError("فایل پشتیبان پیدا نشد.", 404, "not_found");
    fs.unlinkSync(filePath(name));
  }

  async function listTables(conn) {
    const [rows] = await conn.query("SELECT TABLE_NAME AS name FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_TYPE = 'BASE TABLE' ORDER BY TABLE_NAME");
    return rows.map((r) => r.name);
  }
  async function columnsOf(conn, table, cache) {
    if (!cache[table]) {
      const [rows] = await conn.query("SELECT COLUMN_NAME AS name FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?", [table]);
      cache[table] = new Set(rows.map((r) => r.name));
    }
    return cache[table];
  }

  // خواندن خط‌به‌خط فایل gzip (خطای فایل خراب به‌صورت exception می‌رسد)
  async function* readLines(file) {
    const gun = pipeline(fs.createReadStream(file), zlib.createGunzip(), () => {});
    gun.setEncoding("utf8");
    let buf = "";
    for await (const chunk of gun) {
      buf += chunk;
      let i;
      while ((i = buf.indexOf("\n")) >= 0) { const line = buf.slice(0, i); buf = buf.slice(i + 1); if (line) yield line; }
    }
    if (buf.trim()) yield buf;
  }
  // اعتبارسنجی فایل: خط اول باید $meta با قالب درست باشد
  async function peekMeta(file) {
    try {
      for await (const line of readLines(file)) {
        const o = JSON.parse(line);
        if (!o.$meta || o.$meta.format !== FORMAT) throw new Error("bad");
        return o.$meta;
      }
    } catch (e) { /* پایین */ }
    throw new UserError("فایل پشتیبان معتبر نیست (قالب یا فشرده‌سازی درست نیست).");
  }

  // ---- اعتبارسنجی کامل فایل پشتیبان (یک گذر استریم، بدون هیچ تغییری در دیتابیس) ----
  // فایل ناقص/خراب/دست‌کاری‌شده یا ناسازگار با دیتابیس فعلی رد می‌شود؛ قالب‌های قدیمیِ معتبر (جدول/ستون اضافه یا کم) پذیرفته می‌شوند.
  const REQUIRED_TABLES = ["periods", "people", "personnel"];   // از همان نسخهٔ اول سامانه بوده‌اند
  const isPlainObj = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
  async function validateFile(file) {
    const reject = (msg) => { throw new UserError(`فایل پشتیبان معتبر نیست: ${msg} (چیزی در دیتابیس تغییر نکرد).`); };
    let known, colMap = {};
    {
      const [tabs] = await pool.query("SELECT TABLE_NAME AS name FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_TYPE = 'BASE TABLE' ORDER BY TABLE_NAME");
      known = new Set(tabs.map((r) => r.name));
    }
    const colsOf = async (t) => {
      if (!colMap[t]) { const [rows] = await pool.query("SELECT COLUMN_NAME AS name FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?", [t]); colMap[t] = new Set(rows.map((r) => r.name)); }
      return colMap[t];
    };
    let meta = null, ended = null, n = 0;
    const counts = {}, sig = {}, matched = {}, extraCols = {}, adminRows = { n: 0 };
    try {
      for await (const line of readLines(file)) {
        n++;
        if (ended) reject("بعد از خط پایان فایل، داده وجود دارد");
        let o;
        try { o = JSON.parse(line); } catch (e) { reject(`خط ${n} JSON نیست`); }
        if (!isPlainObj(o)) reject(`خط ${n} ساختار درست ندارد`);
        if (n === 1) {
          if (!isPlainObj(o.$meta) || o.$meta.format !== FORMAT) reject("قالب یا نسخهٔ فایل پشتیبانی نمی‌شود");
          meta = o.$meta;
          if (!Array.isArray(meta.tables) || !meta.tables.length || meta.tables.some((t) => typeof t !== "string" || !t || t.length > 64)) reject("فهرست جدول‌های فایل نامعتبر است");
          if (new Set(meta.tables).size !== meta.tables.length) reject("فهرست جدول‌ها تکراری است");
          for (const t of REQUIRED_TABLES) if (!meta.tables.includes(t)) reject(`جدول اصلی «${t}» در فایل نیست`);
          continue;
        }
        if (o.$meta) reject("خط $meta تکراری است");
        if (o.$end !== undefined) {
          if (!isPlainObj(o.$end) || !isPlainObj(o.$end.counts)) reject("خط پایان فایل نامعتبر است");
          ended = o.$end; continue;
        }
        if (typeof o.t !== "string" || !isPlainObj(o.r)) reject(`خط ${n} ردیف معتبر نیست`);
        if (!meta.tables.includes(o.t)) reject(`ردیف مربوط به جدولی خارج از فهرست (${String(o.t).slice(0, 40)})`);
        counts[o.t] = (counts[o.t] || 0) + 1;
        const keys = Object.keys(o.r), sg = keys.join("\u0001");
        if (sig[o.t] === undefined) {
          sig[o.t] = sg;
          if (known.has(o.t)) {
            const cols = await colsOf(o.t);
            matched[o.t] = keys.filter((k) => cols.has(k)).length;
            extraCols[o.t] = keys.filter((k) => !cols.has(k));
            if (!matched[o.t]) reject(`ستون‌های جدول «${o.t}» با دیتابیس فعلی هیچ‌کدام نمی‌خواند`);
          }
        } else if (sig[o.t] !== sg) reject(`ردیف‌های جدول «${o.t}» ستون‌های یکسان ندارند`);
        if (o.t === "users" && Number(o.r.is_admin) === 1 && Number(o.r.active) === 1) adminRows.n++;
      }
    } catch (e) {
      if (e instanceof UserError) throw e;
      logError(e);
      throw new UserError("فایل پشتیبان ناقص یا خراب است (خواندن فایل ناموفق بود). چیزی در دیتابیس تغییر نکرد.");
    }
    if (!meta) reject("خط اول (مشخصات) پیدا نشد");
    if (!ended) reject("پایان فایل پیدا نشد؛ فایل ناقص است");
    for (const t of Object.keys(ended.counts)) if (!meta.tables.includes(t)) reject(`خط پایان جدول ناشناس (${String(t).slice(0, 40)}) دارد`);
    for (const t of meta.tables) if ((counts[t] || 0) !== Number(ended.counts[t] || 0)) reject(`تعداد ردیف‌های جدول «${t}» با خط پایان نمی‌خواند`);
    // بعد از بازیابی باید بشود وارد شد: اگر جدول users در فایل هست، دست‌کم یک مدیر فعال لازم است
    if (meta.tables.includes("users") && known.has("users") && !adminRows.n) reject("هیچ کاربر مدیرِ فعالی در فایل نیست (بعد از بازیابی امکان ورود نمی‌ماند)");
    const unknownTables = meta.tables.filter((t) => !known.has(t) && !SKIP.has(t));
    return { meta, counts, warnings: { unknownTables, unknownColumns: Object.fromEntries(Object.entries(extraCols).filter(([, v]) => v.length)) } };
  }

  const guard = () => { if (busy) throw new UserError("یک عملیات پشتیبان‌گیری/بازیابی در حال اجراست؛ کمی بعد دوباره تلاش کنید.", 409, "busy"); busy = true; };

  // بستن استریم نوشتن و حذف فایل .tmp؛ اگر استریم هنوز در حال باز کردن فایل باشد، حذف تا بسته‌شدنش صبر می‌کند
  // (وگرنه فایل بعد از unlink دوباره ساخته می‌شد و یک .tmp خالیِ بی‌صاحب می‌ماند)
  async function discardTmp(out, tmp) {
    try {
      if (out.closed !== true) {
        const closed = new Promise((r) => out.once("close", r));
        out.destroy();
        await Promise.race([closed, new Promise((r) => setTimeout(r, 2000))]);
      }
    } catch (x) {}
    try { fs.unlinkSync(tmp); } catch (x) {}
  }
  async function createBackup(kind = "manual") {
    guard();
    fs.mkdirSync(DIR, { recursive: true });
    const name = `${kind}-${stamp()}.ndjson.gz`, final = filePath(name), tmp = final + ".tmp";
    const out = fs.createWriteStream(tmp), gz = zlib.createGzip();
    gz.pipe(out);
    const done = new Promise((res, rej) => { out.on("finish", res); out.on("error", rej); gz.on("error", rej); });
    done.catch(() => {});
    const put = async (o) => { if (!gz.write(JSON.stringify(o) + "\n")) await once(gz, "drain"); };
    let conn;
    try {
      conn = await pool.getConnection();
      await conn.query("START TRANSACTION WITH CONSISTENT SNAPSHOT");
      const tables = (await listTables(conn)).filter((t) => !SKIP.has(t));
      await put({ $meta: { format: FORMAT, created: new Date().toISOString(), tables } });
      const counts = {};
      for (const t of tables) {
        counts[t] = 0;
        const stream = conn.connection.query({ sql: `SELECT * FROM ${q(t)}`, typeCast }).stream({ highWaterMark: 500 });
        for await (const row of stream) { counts[t]++; await put({ t, r: row }); }
      }
      await put({ $end: { counts } });
      await conn.query("COMMIT");
      gz.end();
      await done;
      fs.renameSync(tmp, final);
      return fileInfo(name);
    } catch (e) {
      try { gz.destroy(); } catch (x) {}
      await discardTmp(out, tmp);
      throw e;
    } finally {
      if (conn) { try { await conn.query("ROLLBACK"); } catch (x) {} conn.release(); }
      busy = false;
    }
  }

  // بازیابی: ۱) اعتبارسنجی کامل فایل (بدون هیچ تغییری) ۲) پشتیبان ایمنی (pre-restore) ۳) حذف و درج در یک تراکنش؛ هر خطا = Rollback کامل
  async function restoreFromFile(name, { safety = true } = {}) {
    if (!validName(name) || !fs.existsSync(filePath(name))) throw new UserError("فایل پشتیبان پیدا نشد.", 404, "not_found");
    const file = filePath(name);
    const st0 = fs.statSync(file);
    const v = await validateFile(file);
    let safetyName = null;
    if (safety) { safetyName = (await createBackup("pre-restore")).name; prune("pre-restore", 5); }
    guard();
    let conn;
    try {
      const st1 = fs.statSync(file);
      if (st1.size !== st0.size || st1.mtimeMs !== st0.mtimeMs) throw new UserError("فایل پشتیبان بین بررسی و بازیابی تغییر کرد؛ چیزی تغییر نکرد.");
      conn = await pool.getConnection();
      const known = new Set(await listTables(conn));
      const colCache = {};
      await conn.query("SET FOREIGN_KEY_CHECKS = 0");
      await conn.beginTransaction();
      let meta = null, ended = null, cur = null, cols = null, batch = [];
      const counts = {};
      const flush = async () => {
        if (!batch.length) return;
        const keys = Object.keys(batch[0]).filter((k) => cols.has(k));
        if (keys.length) {
          const vals = batch.map((r) => keys.map((k) => { const x = r[k]; return x === undefined ? null : (x !== null && typeof x === "object" ? JSON.stringify(x) : x); }));
          await conn.query(`INSERT INTO ${q(cur)} (${keys.map(q).join(",")}) VALUES ?`, [vals]);
        }
        batch = [];
      };
      for await (const line of readLines(file)) {
        const o = JSON.parse(line);
        if (o.$meta) {
          if (o.$meta.format !== FORMAT) throw new UserError("قالب فایل پشتیبان پشتیبانی نمی‌شود.");
          meta = o.$meta;
          for (const t of meta.tables || []) if (known.has(t) && !SKIP.has(t)) await conn.query(`DELETE FROM ${q(t)}`);
          continue;
        }
        if (o.$end) { ended = o.$end; continue; }
        if (!meta) throw new UserError("فایل پشتیبان معتبر نیست.");
        if (!known.has(o.t) || SKIP.has(o.t)) continue;
        if (cur !== o.t) { await flush(); cur = o.t; cols = await columnsOf(conn, o.t, colCache); }
        batch.push(o.r);
        counts[o.t] = (counts[o.t] || 0) + 1;
        if (batch.length >= 500) await flush();
      }
      await flush();
      if (!ended) throw new UserError("فایل پشتیبان ناقص است (پایان فایل پیدا نشد)؛ چیزی تغییر نکرد.");
      for (const t of Object.keys(ended.counts || {})) {
        if (known.has(t) && !SKIP.has(t) && (counts[t] || 0) !== ended.counts[t]) throw new UserError(`تعداد ردیف‌های جدول ${t} با فایل نمی‌خواند؛ چیزی تغییر نکرد.`);
      }
      const st2 = fs.statSync(file);
      if (st2.size !== st0.size || st2.mtimeMs !== st0.mtimeMs) throw new UserError("فایل پشتیبان هنگام بازیابی تغییر کرد؛ چیزی تغییر نکرد.");
      await conn.commit();
      return { tables: counts, created: meta.created, safetyBackup: safetyName, warnings: v.warnings };
    } catch (e) {
      if (conn) { try { await conn.rollback(); } catch (x) {} }
      throw e;
    } finally {
      if (conn) { try { await conn.query("SET FOREIGN_KEY_CHECKS = 1"); } catch (x) {} conn.release(); }
      busy = false;
    }
  }

  // پشتیبان خودکار: هر BACKUP_EVERY_HOURS ساعت (پیش‌فرض ۲۴) و نگهداری BACKUP_KEEP نسخه (پیش‌فرض ۱۴)؛ BACKUP_AUTO=0 غیرفعال می‌کند
  function startAuto(log = console) {
    if (process.env.BACKUP_AUTO === "0") return null;
    const keep = Math.max(1, Number(process.env.BACKUP_KEEP || 14)), everyH = Math.max(1, Number(process.env.BACKUP_EVERY_HOURS || 24));
    const tick = async () => {
      try {
        const last = listBackups().find((f) => f.kind === "auto");
        if (!last || Date.now() - last.mtime > everyH * 3600e3) {
          const f = await createBackup("auto");
          prune("auto", keep);
          log.log("پشتیبان خودکار ساخته شد:", f.name);
        }
      } catch (e) { log.warn("پشتیبان خودکار ناموفق بود:", e.message); }
    };
    const first = setTimeout(tick, 30e3), h = setInterval(tick, 3600e3);
    if (first.unref) first.unref();
    if (h.unref) h.unref();
    // stop: برای خاموش شدن امن (shutdown.js) زمان‌سنج‌ها متوقف می‌شوند؛ پشتیبانِ در حال ساخت با isBusy منتظر می‌ماند
    return { keep, everyHours: everyH, stop() { clearTimeout(first); clearInterval(h); } };
  }
  const settings = () => ({ dir: DIR, auto: process.env.BACKUP_AUTO !== "0", keep: Math.max(1, Number(process.env.BACKUP_KEEP || 14)), everyHours: Math.max(1, Number(process.env.BACKUP_EVERY_HOURS || 24)) });

  return { DIR, validName, filePath, fileInfo, listBackups, deleteBackup, createBackup, restoreFromFile, peekMeta, validateFile, startAuto, settings, isBusy: () => busy };
};
