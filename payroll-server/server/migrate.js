// سیستم Migration امن (نسخهٔ ۱۱۱)
// ---------------------------------------------------------------------------
// - فایل‌ها: payroll-server/migrations/NNN_name.js (فقط .js؛ فایل‌های .sql قدیمی ۰۰۲ تا ۰۰۵ «دستی/تاریخی» هستند و هرگز خودکار اجرا نمی‌شوند،
//   چون مثلاً ۰۰۲ جدول loan_queue را پاک می‌کند)
// - هر فایل: module.exports = { description, async up(conn, h) { ... } }   ← h: کمک‌کارهای idempotent (hasColumn، addColumn، addIndex، ...)
// - جدول schema_migrations: نسخه، نام، checksum (SHA-256 محتوای فایل)، زمان اجرا، مدت
// - ایمنی:
//   ۱) قفل سراسری MySQL (GET_LOCK) ← دو نمونهٔ سرور هم‌زمان Migration اجرا نمی‌کنند
//   ۲) اجرای ترتیبی؛ با اولین خطا متوقف می‌شود و آن نسخه ثبت نمی‌شود (دفعهٔ بعد دوباره امتحان می‌شود؛ گام‌ها idempotent نوشته می‌شوند)
//   ۳) اگر فایلِ Migrationِ اجراشده بعداً تغییر کند (checksum متفاوت) اجرای بقیه متوقف و هشدار داده می‌شود
//   ۴) پیش از اجرای Migration‌های معلق روی دیتابیسِ دارای داده، یک پشتیبان کامل «pre-migrate» ساخته می‌شود (MIGRATE_BACKUP=0 غیرفعال)
//   ۵) فایل‌های نسخهٔ تکراری یا نام نامعتبر رد می‌شوند
// - خط فرمان (از پوشهٔ server):  npm run migrate         ← اجرای Migration‌های معلق
//                                npm run migrate:status  ← فقط گزارش (هیچ تغییری نمی‌دهد)
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const DEFAULT_DIR = path.join(__dirname, "..", "migrations");
const FILE_RE = /^(\d{3,})_([A-Za-z0-9_-]+)\.js$/;
const LOCK_NAME = "payslip_schema_migrations";
const TABLE_SQL = `CREATE TABLE IF NOT EXISTS schema_migrations (
  version     VARCHAR(20)  NOT NULL PRIMARY KEY,
  name        VARCHAR(200) NOT NULL,
  checksum    CHAR(64)     NOT NULL,
  applied_at  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  duration_ms INT UNSIGNED NOT NULL DEFAULT 0
) ENGINE=InnoDB`;

const sha256 = (buf) => crypto.createHash("sha256").update(buf).digest("hex");
const IDENT = /^[A-Za-z0-9_]{1,64}$/;
const ident = (s) => { if (!IDENT.test(String(s))) throw new Error(`نام نامعتبر در Migration: ${s}`); return "`" + s + "`"; };

// فهرست Migration‌ها به ترتیب نسخه
function listMigrations(dir = DEFAULT_DIR) {
  if (!fs.existsSync(dir)) return [];
  const out = [], seen = new Map();
  for (const f of fs.readdirSync(dir).sort()) {
    if (!f.endsWith(".js")) continue;          // .sql های قدیمی: دستی (به README مراجعه کنید)
    const m = FILE_RE.exec(f);
    if (!m) throw new Error(`نام فایل Migration نامعتبر است: ${f} (الگو: 006_name.js)`);
    const version = m[1];
    if (seen.has(version)) throw new Error(`نسخهٔ Migration تکراری است: ${version} (${seen.get(version)} و ${f})`);
    seen.set(version, f);
    const file = path.join(dir, f);
    out.push({ version, name: m[2], file, checksum: sha256(fs.readFileSync(file)) });
  }
  return out.sort((a, b) => Number(a.version) - Number(b.version) || a.version.localeCompare(b.version));
}

// کمک‌کارهای idempotent برای نوشتن Migration (روی همان اتصال قفل‌دار)
function helpers(conn) {
  const h = {
    async hasTable(t) {
      const [r] = await conn.query("SELECT COUNT(*) AS c FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?", [t]);
      return Number(r[0].c) > 0;
    },
    async hasColumn(t, c) {
      const [r] = await conn.query("SELECT COUNT(*) AS c FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?", [t, c]);
      return Number(r[0].c) > 0;
    },
    async hasIndex(t, i) {
      const [r] = await conn.query("SELECT COUNT(*) AS c FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND INDEX_NAME = ?", [t, i]);
      return Number(r[0].c) > 0;
    },
    // def فقط از کد Migration می‌آید (نه ورودی کاربر)؛ نام جدول/ستون اعتبارسنجی می‌شود
    async addColumn(t, c, def) {
      if (!(await h.hasTable(t)) || (await h.hasColumn(t, c))) return false;
      await conn.query(`ALTER TABLE ${ident(t)} ADD COLUMN ${ident(c)} ${def}`);
      return true;
    },
    async addIndex(t, i, cols) {
      if (!(await h.hasTable(t)) || (await h.hasIndex(t, i))) return false;
      await conn.query(`CREATE INDEX ${ident(i)} ON ${ident(t)} (${cols.map(ident).join(", ")})`);
      return true;
    },
    query: (sql, params) => conn.query(sql, params),
  };
  return h;
}

async function appliedRows(conn) {
  await conn.query(TABLE_SQL);
  const [rows] = await conn.query("SELECT version, name, checksum, applied_at FROM schema_migrations ORDER BY version");
  return rows;
}

// وضعیت: applied / pending / changed (فایلِ اجراشده تغییر کرده) / missing (در دیتابیس ثبت است ولی فایلش نیست)
function compare(files, rows) {
  const byV = new Map(rows.map((r) => [String(r.version), r]));
  const fileV = new Set(files.map((f) => f.version));
  const list = files.map((f) => {
    const r = byV.get(f.version);
    return { ...f, state: !r ? "pending" : r.checksum === f.checksum ? "applied" : "changed", appliedAt: r ? r.applied_at : null };
  });
  const missing = rows.filter((r) => !fileV.has(String(r.version))).map((r) => ({ version: String(r.version), name: r.name, state: "missing", appliedAt: r.applied_at }));
  return { list, missing, pending: list.filter((x) => x.state === "pending"), changed: list.filter((x) => x.state === "changed") };
}

async function withLock(conn, timeoutSec, fn) {
  const [[l]] = await conn.query("SELECT GET_LOCK(?, ?) AS l", [LOCK_NAME, timeoutSec]);
  if (!l || Number(l.l) !== 1) throw new Error("قفل Migration گرفته نشد (نمونهٔ دیگری از سرور در حال اجرای Migration است).");
  try { return await fn(); }
  finally { try { await conn.query("SELECT RELEASE_LOCK(?)", [LOCK_NAME]); } catch (e) { /* اتصال بسته شده؛ قفل خودکار آزاد می‌شود */ } }
}

async function getConn(pool) {
  if (typeof pool.getConnection === "function") return pool.getConnection();
  return { query: (...a) => pool.query(...a), release() {} };
}

// گزارش بدون تغییر (فقط جدول schema_migrations در صورت نبود ساخته می‌شود)
async function status(pool, opts = {}) {
  const files = listMigrations(opts.dir);
  const conn = await getConn(pool);
  try { return compare(files, await appliedRows(conn)); }
  finally { if (conn.release) conn.release(); }
}

async function hasUserData(conn) {
  try {
    const [[r]] = await conn.query("SELECT (SELECT COUNT(*) FROM periods) + (SELECT COUNT(*) FROM personnel) AS n");
    return Number(r && r.n) > 0;
  } catch (e) { return false; }   // جدول‌ها هنوز ساخته نشده‌اند ← دیتابیس تازه
}

// اجرای Migration‌های معلق
async function runMigrations(pool, opts = {}) {
  const log = opts.log || console;
  const files = listMigrations(opts.dir);
  const load = opts.load || ((f) => { delete require.cache[require.resolve(f.file)]; return require(f.file); });
  const conn = await getConn(pool);
  const applied = [];
  try {
    return await withLock(conn, opts.lockTimeoutSec || 30, async () => {
      const st = compare(files, await appliedRows(conn));
      if (st.changed.length) {
        throw new Error("فایل Migration اجراشده تغییر کرده است (به‌جای ویرایش، یک Migration تازه بسازید): " + st.changed.map((x) => `${x.version}_${x.name}`).join("، "));
      }
      for (const m of st.missing) log.warn(`هشدار: Migration ${m.version}_${m.name} در دیتابیس ثبت است ولی فایلش پیدا نشد.`);
      if (!st.pending.length) return { applied, pending: 0, backup: null };

      // پشتیبان کامل پیش از تغییر ساختار (فقط اگر داده‌ای هست)
      let backupFile = null;
      if (opts.backup && (await hasUserData(conn))) {
        try { backupFile = await opts.backup(); log.log("پشتیبان پیش از Migration ساخته شد:", backupFile && backupFile.name ? backupFile.name : backupFile); }
        catch (e) {
          if (!opts.allowNoBackup) throw new Error("ساخت پشتیبان پیش از Migration ناموفق بود؛ Migration اجرا نشد: " + e.message);
          log.warn("ساخت پشتیبان پیش از Migration ناموفق بود (ادامه با MIGRATE_BACKUP_OPTIONAL=1):", e.message);
        }
      }
      const h = helpers(conn);
      for (const m of st.pending) {
        const mod = load(m);
        if (!mod || typeof mod.up !== "function") throw new Error(`Migration ${m.version}_${m.name} تابع up ندارد.`);
        const t0 = Date.now();
        try { await mod.up(conn, h); }
        catch (e) { e.message = `Migration ${m.version}_${m.name} ناموفق بود: ${e.message}`; throw e; }
        const ms = Date.now() - t0;
        await conn.query("INSERT INTO schema_migrations (version, name, checksum, duration_ms) VALUES (?, ?, ?, ?)", [m.version, m.name, m.checksum, ms]);
        applied.push(m.version);
        log.log(`Migration ${m.version}_${m.name} اجرا شد (${ms} ms).`);
      }
      return { applied, pending: 0, backup: backupFile };
    });
  } finally { if (conn.release) conn.release(); }
}

module.exports = { listMigrations, runMigrations, status, helpers, compare, TABLE_SQL, LOCK_NAME, DEFAULT_DIR };

// ---------------- خط فرمان ----------------
if (require.main === module) {
  require("dotenv").config({ path: path.join(__dirname, ".env") });
  const pool = require("./db");
  const cmd = process.argv[2] || "up";
  (async () => {
    try {
      if (cmd === "status") {
        const st = await status(pool);
        for (const m of st.list) console.log(`${m.state.padEnd(8)} ${m.version}_${m.name}${m.appliedAt ? "  (" + new Date(m.appliedAt).toISOString() + ")" : ""}`);
        for (const m of st.missing) console.log(`missing  ${m.version}_${m.name}`);
        console.log(`\nمعلق: ${st.pending.length} — تغییرکرده: ${st.changed.length}`);
        process.exitCode = st.changed.length ? 1 : 0;
      } else if (cmd === "up") {
        const backup = process.env.MIGRATE_BACKUP === "0" ? null : () => require("./backup")(pool).createBackup("pre-migrate");
        const r = await runMigrations(pool, { backup, allowNoBackup: process.env.MIGRATE_BACKUP_OPTIONAL === "1" });
        console.log(r.applied.length ? `✔ ${r.applied.length} Migration اجرا شد.` : "✔ Migration معلقی وجود ندارد.");
      } else {
        console.error("دستور نامعتبر. استفاده: node migrate.js [up|status]");
        process.exitCode = 2;
      }
    } catch (e) {
      console.error("✖", e.message);
      process.exitCode = 1;
    } finally {
      try { await pool.end(); } catch (e) { /* */ }
    }
  })();
}
