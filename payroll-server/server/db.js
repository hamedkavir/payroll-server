const mysql = require("mysql2/promise");

const pool = mysql.createPool({
  host: process.env.DB_HOST || "localhost",
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  // ستون‌های JSON را به‌صورت خودکار Parse/Stringify می‌کند
  decimalNumbers: true,
});

// بعضی سرورهای MySQL sort_buffer_size بسیار کوچک دارند و هر ORDER BY/GROUP BY کمی بزرگ
// روی‌شان خطای «Out of sort memory» می‌دهد. برای هر اتصال، مقدار Session را بالاتر می‌بریم
// (تنظیم Session به دسترسی ویژه نیاز ندارد). مقدار با SORT_BUFFER_SIZE در .env قابل تغییر است.
const sortBuf = Number(process.env.SORT_BUFFER_SIZE || 8 * 1024 * 1024);
pool.pool.on("connection", (conn) => {
  conn.query(`SET SESSION sort_buffer_size = ${Math.max(262144, Math.floor(sortBuf))}`, (err) => {
    if (err) console.warn("تنظیم sort_buffer_size ممکن نشد:", err.message);
  });
});

// همهٔ پارامترهای query (روی pool و روی اتصال‌های getConnection) پیش از اجرا بررسی می‌شوند (sqlGuard.js)
const { guardParams } = require("./sqlGuard");
const wrapQuery = (target) => {
  const orig = target.query.bind(target);
  target.query = (sql, params, ...rest) => {
    try { guardParams(sql, params); } catch (e) { return Promise.reject(e); }
    return orig(sql, params, ...rest);
  };
  return target;
};
wrapQuery(pool);
const origGetConnection = pool.getConnection.bind(pool);
pool.getConnection = async (...a) => wrapQuery(await origGetConnection(...a));

module.exports = pool;
