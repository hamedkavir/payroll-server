// زیرساخت تست بدون وابستگی: express و دیتابیس با نمونهٔ ساختگی جایگزین می‌شوند (npm install لازم نیست).
const Module = require("module");
const path = require("path");
const SRV = path.join(__dirname, "..", "server");
process.env.API_KEY = process.env.API_KEY || "test-api-key-123";

let currentPool = null;
const routers = [];
const fakeExpress = () => ({});
fakeExpress.Router = () => {
  const r = { handlers: {} };
  for (const m of ["get", "post", "put", "patch", "delete"]) r[m] = (p, ...h) => { r.handlers[m.toUpperCase() + " " + p] = h; };
  r.use = () => {};
  routers.push(r);
  return r;
};
fakeExpress.raw = () => (req, res, next) => next();
const poolProxy = new Proxy({}, { get: (_, k) => currentPool[k], set: (_, k, v) => { currentPool[k] = v; return true; } });

const orig = Module._load;
Module._load = function (request, parent, isMain) {
  if (request === "express") return fakeExpress;
  if (/(^|\/)db$/.test(request)) return poolProxy;
  return orig.apply(this, arguments);
};
const setPool = (p) => { currentPool = p; };
// فایل سازگاری routes/extras.js فقط روترهای formSettings/advances/inventory/loanParams را re-export می‌کند؛
// برای اینکه بارگذاری دوبارهٔ آن روترهای تازه (با pool ساختگی جدید) ثبت کند، همین زیرماژول‌ها هم از کش پاک می‌شوند.
const EXTRAS_PARTS = ["extras", "formSettings", "formDefaults", "advances", "inventory", "loanParams", "extrasCommon"].map((n) => path.join(SRV, "routes", n + ".js"));
const load = (rel) => {
  const f = path.join(SRV, rel);
  if (EXTRAS_PARTS.includes(f)) for (const k of EXTRAS_PARTS) delete require.cache[k];
  delete require.cache[require.resolve(f)];
  return require(f);
};

// اجرای زنجیرهٔ هندلرها (middleware ها + هندلر نهایی) و گرفتن پاسخ
async function run(handlers, req) {
  req.headers = req.headers || {};
  req.query = req.query || {}; req.params = req.params || {}; req.body = req.body === undefined ? {} : req.body;
  req.header = (n) => req.headers[String(n).toLowerCase()];
  const out = { status: 200, body: undefined, ended: false };
  const res = { req, headersSent: false,
    status(c) { out.status = c; return this; },
    json(b) { out.body = b; out.ended = true; this.headersSent = true; return this; },
    set() { return this; }, end() { out.ended = true; return this; }, type() { return this; }, send(b) { out.body = b; out.ended = true; return this; } };
  // Express اجازه می‌دهد middleware، next() را بدون await صدا بزند.
  // بنابراین runner باید Promise مربوط به handler بعدی را مستقل از return شدن
  // یا نشدن next() دنبال کند؛ وگرنه زنجیره‌های async زودتر از پاسخ نهایی تمام می‌شوند.
  async function dispatch(index) {
    const handler = handlers[index];
    if (!handler) { out.passed = true; return; }

    let nextPromise = null;
    const next = (err) => {
      if (nextPromise) return nextPromise;
      if (err) {
        out.err = err;
        nextPromise = Promise.resolve();
      } else {
        nextPromise = dispatch(index + 1);
      }
      return nextPromise;
    };

    await handler(req, res, next);
    // مهم: حتی اگر middleware، next() را بدون return/await صدا زده باشد،
    // تا پایان تمام handlerهای بعدی صبر می‌کنیم.
    if (nextPromise) await nextPromise;
  }

  await dispatch(0);
  return out;
}
module.exports = { setPool, load, run, routers, SRV };
