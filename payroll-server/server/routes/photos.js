// عکس پرسنل: فایل‌ها در پوشهٔ pic با نام «شمارهٔ پرسنلی» مثل 96077189.jpg
// پوشه به‌ترتیب در این مسیرها جست‌وجو می‌شود (اولین مسیر موجود):
//   PIC_DIR در .env ← ../pic (کنار پوشهٔ server) ← server/pic ← pic در پوشهٔ اجرای برنامه
// جست‌وجوی نام فایل بدون حساسیت به حروف بزرگ/کوچک (JPG/jpg) و بدون توجه به صفرهای ابتدای شماره است.
const express = require("express");
const path = require("path");
const fs = require("fs");
const { toLatinDigits } = require("../textNormalize");

const router = express.Router();
const IMG_RE = /\.(jpe?g|png|webp|gif|bmp)$/i;
const MIME = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", gif: "image/gif", bmp: "image/bmp" };

function candidateDirs() {
  const list = [];
  if (process.env.PIC_DIR) list.push(path.resolve(process.env.PIC_DIR));
  list.push(path.join(__dirname, "..", "..", "pic"), path.join(__dirname, "..", "pic"), path.join(process.cwd(), "pic"), path.join(process.cwd(), "..", "pic"));
  return [...new Set(list)];
}

// فهرست فایل‌ها ۳۰ ثانیه نگه داشته می‌شود تا با هر عکس، پوشه دوباره خوانده نشود (و عکس تازه‌اضافه‌شده زود دیده شود)
let cache = { at: 0, dir: null, map: new Map(), count: 0 };
function scan(force) {
  if (!force && Date.now() - cache.at < 30000) return cache;
  const map = new Map();
  let used = null, count = 0;
  for (const d of candidateDirs()) {
    let names;
    try { names = fs.readdirSync(d); } catch (e) { continue; }
    if (!used) used = d;                       // اولین پوشهٔ موجود
    const imgs = names.filter((n) => IMG_RE.test(n));
    if (!imgs.length) continue;
    used = d; count = imgs.length;
    for (const n of imgs) {
      const base = toLatinDigits(n.replace(/\.[^.]+$/, "")).trim().toLowerCase();
      map.set(base, path.join(d, n));
      const noZero = base.replace(/^0+(?=\d)/, "");
      if (!map.has(noZero)) map.set(noZero, path.join(d, n));
    }
    break;                                     // اولین پوشه‌ای که عکس دارد
  }
  cache = { at: Date.now(), dir: used, map, count };
  return cache;
}
scan(true);
console.log(cache.dir ? `پوشهٔ عکس پرسنل: ${cache.dir} (${cache.count} عکس)` : `پوشهٔ عکس پرسنل پیدا نشد؛ پوشهٔ pic را کنار پوشهٔ server بسازید یا PIC_DIR را در .env بگذارید. مسیرهای بررسی‌شده: ${candidateDirs().join(" | ")}`);

// GET /api/photos  ->  وضعیت پوشهٔ عکس‌ها (برای عیب‌یابی)
router.get("/", (req, res) => {
  const c = scan(true);
  res.json({ dir: c.dir, found: !!c.dir, count: c.count, sample: [...c.map.keys()].slice(0, 5), searched: candidateDirs() });
});

router.get("/:code", (req, res) => {
  const code = toLatinDigits(req.params.code).trim().toLowerCase();
  if (!/^[a-z0-9_-]{1,40}$/.test(code)) return res.status(404).json({ error: "not_found" });
  let c = scan(false);
  let f = c.map.get(code) || c.map.get(code.replace(/^0+(?=\d)/, ""));
  if (!f && Date.now() - c.at > 5000) { c = scan(true); f = c.map.get(code) || c.map.get(code.replace(/^0+(?=\d)/, "")); }   // شاید عکس همین الان اضافه شده
if (!f) {
  const placeholder = `
    <svg xmlns="http://www.w3.org/2000/svg" width="120" height="120" viewBox="0 0 120 120">
      <rect width="120" height="120" rx="60" fill="#e5e7eb"/>
      <circle cx="60" cy="43" r="21" fill="#9ca3af"/>
      <path d="M20 108c2-25 18-38 40-38s38 13 40 38" fill="#9ca3af"/>
    </svg>
  `;

  return res
    .status(200)
    .set({
      "Content-Type": "image/svg+xml; charset=utf-8",
      "Cache-Control": "private, max-age=300"
    })
    .send(placeholder);
}
  const ext = path.extname(f).slice(1).toLowerCase();
  res.set({ "Cache-Control": "private, max-age=300", "Content-Type": MIME[ext] || "application/octet-stream" });
  fs.createReadStream(f).on("error", () => res.status(404).end()).pipe(res);
});
module.exports = router;
