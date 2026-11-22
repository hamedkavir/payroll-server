// احراز هویت کاربران: ورود با نام کاربری/رمز، نشست (session) در دیتابیس، و کنترل دسترسی هر بخش.
// کلید API مشترک (X-API-Key) همچنان لایهٔ اول است؛ بعد از آن هر کاربر با توکن خودش (X-Auth-Token) شناخته می‌شود.
const crypto = require("crypto");
const pool = require("./db");
const { sendError } = require("./errors");

// فهرست بخش‌هایی که مدیر می‌تواند برای هر کاربر باز یا بسته کند
const PERMS = ["dashboard", "import", "personnel", "slips", "loans", "loanform", "advance", "goods", "inventory", "reports", "closing", "settings", "services", "institutions", "emdad", "changes", "dcodes", "life", "statushistory", "deceased", "schools", "set_conn", "set_slip", "set_forms", "set_loan", "set_round", "set_codes", "insurance", "mehr", "cheque", "banks"];
const SESSION_HOURS = 12;

const sha = (s) => crypto.createHash("sha256").update(s).digest("hex");

function hashPassword(pw) {
  const salt = crypto.randomBytes(16).toString("hex");
  return salt + ":" + crypto.scryptSync(pw, salt, 64).toString("hex");
}
function verifyPassword(pw, stored) {
  const [salt, hash] = String(stored || "").split(":");
  if (!salt || !hash) return false;
  const a = Buffer.from(hash, "hex"), b = crypto.scryptSync(pw, salt, 64);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
// نسخه‌های غیرهمزمان (برای مسیرهای API): scryptSync حلقهٔ رویداد Node را چند ده میلی‌ثانیه قفل می‌کند و در این مدت
// هیچ درخواست دیگری (حتی از کاربران دیگر) پاسخ نمی‌گیرد؛ crypto.scrypt همین کار را در thread pool انجام می‌دهد.
const scryptAsync = (pw, salt) => new Promise((ok, no) => crypto.scrypt(pw, salt, 64, (e, k) => (e ? no(e) : ok(k))));
async function hashPasswordAsync(pw) {
  const salt = crypto.randomBytes(16).toString("hex");
  return salt + ":" + (await scryptAsync(pw, salt)).toString("hex");
}
// کاربرِ ناموجود هم یک scrypt ساختگی می‌گیرد تا زمان پاسخ، وجود یا نبود نام کاربری را لو ندهد
const DUMMY_SALT = crypto.randomBytes(16).toString("hex");
async function verifyPasswordAsync(pw, stored) {
  const [salt, hash] = String(stored || "").split(":");
  if (!salt || !hash) { await scryptAsync(String(pw), DUMMY_SALT); return false; }
  const a = Buffer.from(hash, "hex"), b = await scryptAsync(pw, salt);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
const userJSON = (u) => ({
  id: u.id, username: u.username, fullName: u.full_name || "", isAdmin: !!u.is_admin, active: !!u.active,
  permissions: (typeof u.permissions === "string" ? JSON.parse(u.permissions || "[]") : u.permissions) || [],
  mustChange: !!u.must_change, createdAt: u.created_at,
  navOrder: (() => { try { const v = typeof u.nav_order === "string" ? JSON.parse(u.nav_order || "[]") : u.nav_order; return Array.isArray(v) ? v : []; } catch (e) { return []; } })(),
  // پیکربندی منو (گروه‌ها، عنوان‌ها، مخفی‌ها، جمع‌شده‌ها) — در همان ستون nav_order به‌صورت شیء {v:2,...}
  navCfg: (() => { try { const v = typeof u.nav_order === "string" ? JSON.parse(u.nav_order || "null") : u.nav_order; return v && !Array.isArray(v) && v.v === 2 ? v : null; } catch (e) { return null; } })(),
});

async function createSession(userId) {
  const token = crypto.randomBytes(32).toString("hex");
  await pool.query("DELETE FROM user_sessions WHERE expires_at < NOW()");
  await pool.query("INSERT INTO user_sessions (token_hash, user_id, expires_at) VALUES (?, ?, DATE_ADD(NOW(), INTERVAL ? HOUR))", [sha(token), userId, SESSION_HOURS]);
  return token;
}

// کاربری که باید رمزش را عوض کند (رمز اولیه یا بازنشانی‌شده، must_change=1) فقط به این سه مسیر دسترسی دارد؛
// بقیهٔ API تا تغییر رمز با ۴۰۳ و کد password_change_required بسته است (اجبار در سرور، نه فقط در صفحهٔ برنامه).
const MUST_CHANGE_ALLOWED = new Set(["GET /api/auth/me", "PUT /api/auth/password", "POST /api/auth/logout"]);
const mustChangeAllowed = (req) => MUST_CHANGE_ALLOWED.has(`${req.method} ${String(req.originalUrl || req.url || "").split("?")[0].replace(/\/+$/, "")}`);

// توکن را از هدر می‌خواند و req.user را می‌سازد
async function authenticate(req, res, next) {
  const token = req.header("X-Auth-Token");
  if (!token || typeof token !== "string" || token.length > 200) return res.status(401).json({ error: "login_required", message: "ابتدا وارد شوید." });
  try {
    const tokenHash = sha(token);
    const [rows] = await pool.query(
      `SELECT u.* FROM user_sessions s JOIN users u ON u.id = s.user_id
       WHERE s.token_hash = ? AND s.expires_at > NOW() AND u.active = 1`, [tokenHash]);
    if (!rows.length) return res.status(401).json({ error: "login_required", message: "نشست شما منقضی شده است؛ دوباره وارد شوید." });
    req.user = userJSON(rows[0]);
    req.tokenHash = tokenHash;
    if (req.user.mustChange && !mustChangeAllowed(req)) return res.status(403).json({ error: "password_change_required", message: "ابتدا باید رمز عبور خود را تغییر دهید." });
    next();
  } catch (e) { sendError(res, e); }
}

const allowed = (user, perms) => user.isAdmin || perms === null || perms.some((p) => user.permissions.includes(p));
const denied = (res) => res.status(403).json({ error: "forbidden", message: "شما به این بخش دسترسی ندارید." });

// دسترسی ثابت (یا null = هر کاربر واردشده)
const requireAny = (perms) => (req, res, next) => (allowed(req.user, perms) ? next() : denied(res));
const requireAdmin = (req, res, next) => (req.user.isAdmin ? next() : denied(res));
// دسترسی بر اساس نوع درخواست: gate(readPerms, writePerms) یا gate(fn(req) => perms)
const gate = (read, write) => (req, res, next) => {
  const perms = typeof read === "function" ? read(req) : (req.method === "GET" || req.method === "HEAD" ? read : write);
  return allowed(req.user, perms) ? next() : denied(res);
};

module.exports = { MUST_CHANGE_ALLOWED, mustChangeAllowed, PERMS, hashPassword, verifyPassword, hashPasswordAsync, verifyPasswordAsync, userJSON, createSession, authenticate, requireAny, requireAdmin, gate, sha };
