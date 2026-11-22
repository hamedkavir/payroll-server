// /api/auth (ورود، خروج، من، تغییر رمز) و /api/users (مدیریت کاربران، فقط مدیر)
const express = require("express");
const { sendError, isBusinessError } = require("../errors");
const pool = require("../db");
const { PERMS, hashPasswordAsync: hashPassword, verifyPasswordAsync: verifyPassword, userJSON, createSession, authenticate, requireAdmin } = require("../auth");

const auth = express.Router();
const users = express.Router();
const bad = (res, message, code = 400) => res.status(code).json({ error: code === 404 ? "not_found" : "invalid_input", message });

// محدودیت تلاش ناموفق ورود (loginLimiter.js): ۶ بار در ۱۰ دقیقه برای هر (نام کاربری + IP)، ۳۰ بار برای هر IP،
// با سقف سخت تعداد ردیف‌های حافظه (LOGIN_LIMIT_MAX_ENTRIES، پیش‌فرض ۱۰٬۰۰۰) تا حمله با نام‌های کاربری تصادفی حافظه را پر نکند.
const { createLoginLimiter } = require("../loginLimiter");
const limiter = createLoginLimiter({ maxEntries: Number(process.env.LOGIN_LIMIT_MAX_ENTRIES) || 10000 });
// پاک‌سازی دوره‌ای ردیف‌های منقضی
setInterval(() => limiter.sweep(), 5 * 60 * 1000).unref();

auth.post("/login", async (req, res) => {
  const username = String((req.body || {}).username || "").trim();
  const password = String((req.body || {}).password || "");
  if (!username || !password) return bad(res, "نام کاربری و رمز عبور را وارد کنید.");
  if (username.length > 100 || password.length > 1024) return bad(res, "نام کاربری یا رمز عبور بیش از حد طولانی است.");
  if (limiter.blocked(req.ip, username)) return res.status(429).json({ error: "too_many", message: "تعداد تلاش ناموفق زیاد است؛ چند دقیقه بعد دوباره امتحان کنید." });
  try {
    const [rows] = await pool.query("SELECT * FROM users WHERE username = ?", [username]);
    const u = rows[0];
    if (!(await verifyPassword(password, u && u.active ? u.password_hash : "")) || !u || !u.active) {
      limiter.fail(req.ip, username);
      return res.status(401).json({ error: "bad_credentials", message: "نام کاربری یا رمز عبور اشتباه است." });
    }
    limiter.success(req.ip, username);
    const token = await createSession(u.id);
    res.json({ token, user: userJSON(u), mustChange: !!u.must_change });
  } catch (e) { sendError(res, e); }
});
auth.get("/me", authenticate, (req, res) => res.json(req.user));
// ترتیب منوی هر کاربر روی سرور (هر کاربر فقط مال خودش را می‌خواند/می‌نویسد)
const { cleanNavCfg } = require("../navCfg");
auth.get("/prefs", authenticate, (req, res) => res.json({ navOrder: req.user.navOrder || [], navCfg: req.user.navCfg || null }));
auth.put("/prefs", authenticate, async (req, res) => {
  if (Object.prototype.hasOwnProperty.call(req.body || {}, "navCfg")) {
    const c = req.body.navCfg;
    if (c !== null && (typeof c !== "object" || Array.isArray(c))) return bad(res, "navCfg نامعتبر است.");
    const cfg = c === null ? null : cleanNavCfg(c);
    try { await pool.query("UPDATE users SET nav_order = ? WHERE id = ?", [cfg ? JSON.stringify(cfg) : null, req.user.id]); res.json({ navCfg: cfg }); }
    catch (e) { sendError(res, e); }
    return;
  }
  const v = (req.body || {}).navOrder;
  if (v !== null && !Array.isArray(v)) return bad(res, "navOrder باید آرایه باشد.");
  const list = v === null ? [] : [...new Set(v.map((x) => String(x)).filter((x) => /^[A-Za-z0-9_]{1,40}$/.test(x)))].slice(0, 60);
  try {
    await pool.query("UPDATE users SET nav_order = ? WHERE id = ?", [list.length ? JSON.stringify(list) : null, req.user.id]);
    res.json({ navOrder: list });
  } catch (e) { sendError(res, e); }
});
auth.post("/logout", authenticate, async (req, res) => {
  try { await pool.query("DELETE FROM user_sessions WHERE token_hash = ?", [req.tokenHash]); res.json({ ok: true }); }
  catch (e) { sendError(res, e); }
});
auth.put("/password", authenticate, async (req, res) => {
  const { oldPassword, newPassword } = req.body || {};
  if (String(newPassword || "").length < 6) return bad(res, "رمز جدید باید حداقل ۶ نویسه باشد.");
  try {
    const [rows] = await pool.query("SELECT * FROM users WHERE id = ?", [req.user.id]);
    if (!(await verifyPassword(String(oldPassword || ""), rows[0].password_hash))) return bad(res, "رمز فعلی اشتباه است.");
    if (rows[0].must_change && String(newPassword) === String(oldPassword || "")) return bad(res, "رمز جدید باید با رمز فعلی (اولیه/بازنشانی‌شده) متفاوت باشد.");   // تغییر اجباری با همان رمز بی‌اثر است
    await pool.query("UPDATE users SET password_hash = ?, must_change = 0 WHERE id = ?", [await hashPassword(String(newPassword)), req.user.id]);
    await pool.query("DELETE FROM user_sessions WHERE user_id = ? AND token_hash <> ?", [req.user.id, req.tokenHash]);
    res.json({ ok: true });
  } catch (e) { sendError(res, e); }
});

/* ---------------- مدیریت کاربران (فقط مدیر) ---------------- */
const cleanPerms = (p) => (Array.isArray(p) ? p.filter((x) => PERMS.includes(x)) : []);
async function otherActiveAdmins(exceptId) {
  const [[{ c }]] = await pool.query("SELECT COUNT(*) AS c FROM users WHERE is_admin = 1 AND active = 1 AND id <> ?", [exceptId]);
  return c;
}
users.get("/", async (req, res) => {
  try {
    const [rows] = await pool.query("SELECT * FROM users");
    rows.sort((a, b) => a.id - b.id);
    res.json({ items: rows.map(userJSON), permissionList: PERMS });
  } catch (e) { sendError(res, e); }
});
users.post("/", async (req, res) => {
  const b = req.body || {};
  const username = String(b.username || "").trim();
  if (username.length < 3 || username.length > 40 || /\s/.test(username)) return bad(res, "نام کاربری باید ۳ تا ۴۰ نویسه و بدون فاصله باشد.");
  if (String(b.password || "").length < 6) return bad(res, "رمز عبور باید حداقل ۶ نویسه باشد.");
  try {
    const [r] = await pool.query(
      "INSERT INTO users (username, password_hash, full_name, is_admin, active, permissions, must_change) VALUES (?,?,?,?,?,?,1)",
      [username, await hashPassword(String(b.password)), String(b.fullName || "").trim().slice(0, 100), b.isAdmin ? 1 : 0, b.active === false ? 0 : 1, JSON.stringify(cleanPerms(b.permissions))]);
    res.json({ ok: true, id: r.insertId });
  } catch (e) {
    if (e.code === "ER_DUP_ENTRY") return bad(res, "این نام کاربری قبلاً ثبت شده است.");
    sendError(res, e);
  }
});
users.put("/:id", async (req, res) => {
  const id = Number(req.params.id), b = req.body || {};
  try {
    const [rows] = await pool.query("SELECT * FROM users WHERE id = ?", [id]);
    if (!rows.length) return bad(res, "کاربر پیدا نشد.", 404);
    const u = rows[0];
    const isAdmin = b.isAdmin === undefined ? !!u.is_admin : !!b.isAdmin;
    const active = b.active === undefined ? !!u.active : !!b.active;
    if (u.is_admin && u.active && (!isAdmin || !active) && !(await otherActiveAdmins(id))) return bad(res, "حداقل یک مدیر فعال باید در سیستم باقی بماند.");
    if (id === req.user.id && !active) return bad(res, "نمی‌توانید حساب خودتان را غیرفعال کنید.");
    const sets = ["is_admin = ?", "active = ?"], vals = [isAdmin ? 1 : 0, active ? 1 : 0];
    if (b.fullName !== undefined) { sets.push("full_name = ?"); vals.push(String(b.fullName).trim().slice(0, 100)); }
    if (b.permissions !== undefined) { sets.push("permissions = ?"); vals.push(JSON.stringify(cleanPerms(b.permissions))); }
    if (b.password) {
      if (String(b.password).length < 6) return bad(res, "رمز عبور باید حداقل ۶ نویسه باشد.");
      sets.push("password_hash = ?", "must_change = 1"); vals.push(await hashPassword(String(b.password)));
    }
    await pool.query(`UPDATE users SET ${sets.join(", ")} WHERE id = ?`, [...vals, id]);
    if (b.password || !active) await pool.query("DELETE FROM user_sessions WHERE user_id = ?", [id]);
    res.json({ ok: true });
  } catch (e) { sendError(res, e); }
});
users.delete("/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (id === req.user.id) return bad(res, "نمی‌توانید حساب خودتان را حذف کنید.");
  try {
    const [rows] = await pool.query("SELECT * FROM users WHERE id = ?", [id]);
    if (!rows.length) return bad(res, "کاربر پیدا نشد.", 404);
    if (rows[0].is_admin && rows[0].active && !(await otherActiveAdmins(id))) return bad(res, "حداقل یک مدیر فعال باید در سیستم باقی بماند.");
    await pool.query("DELETE FROM user_sessions WHERE user_id = ?", [id]);
    await pool.query("DELETE FROM users WHERE id = ?", [id]);
    res.json({ ok: true });
  } catch (e) { sendError(res, e); }
});

module.exports = { auth, users };
