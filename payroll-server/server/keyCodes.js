// تعریف کدهای مهم (تنظیمات ← تعریف کدهای مهم). ذخیره در form_settings.data.keyCodes
// هر جای سرور که به کد کسر مشخصی (وام، سرمایه، مساعده، ...) نیاز دارد باید از loadKeyCodes بخواند، نه عدد ثابت.
const { toLatinDigits } = require("./textNormalize");

const KEY_CODE_DEFS = [
  { key: "loan1", label: "کد وام ضروری ۱", def: "710", optional: false },
  { key: "loan2", label: "کد وام ضروری ۲", def: "", optional: true },   // خالی = تعریف نشده
  { key: "capital", label: "کد سرمایه صندوق وام ضروری", def: "796", optional: false },
  { key: "advance", label: "کد مساعده", def: "733", optional: false },
  { key: "vcapital", label: "کد سرمایه وام وفاق", def: "", optional: true },   // خالی = وام وفاق تعریف نشده
  { key: "vloan", label: "کد وام وفاق", def: "", optional: true },
  { key: "emdad", label: "کد وام امداد", def: "", optional: true },   // برای ستون «کد کسر» خروجی اکسل گزارش مالی (خالی = بدون کد)
  // کدهای بازنشستگان: سیستم حقوق بازنشستگان کدهای کسر جدا دارد. کلیدهای بالا = شاغلین؛ هر کدام که برای بازنشسته خالی بماند، همان کد شاغلین استفاده می‌شود (کدهای مشترک).
  { key: "rloan1", label: "کد وام ضروری ۱ — بازنشسته", def: "", optional: true, of: "loan1" },
  { key: "rloan2", label: "کد وام ضروری ۲ — بازنشسته", def: "", optional: true, of: "loan2" },
  { key: "rcapital", label: "کد سرمایه صندوق وام ضروری — بازنشسته", def: "", optional: true, of: "capital" },
  { key: "radvance", label: "کد مساعده — بازنشسته", def: "", optional: true, of: "advance" },
  { key: "rvcapital", label: "کد سرمایه وام وفاق — بازنشسته", def: "", optional: true, of: "vcapital" },
  { key: "rvloan", label: "کد وام وفاق — بازنشسته", def: "", optional: true, of: "vloan" },
  { key: "remdad", label: "کد وام امداد — بازنشسته", def: "", optional: true, of: "emdad" },
];
const RETIREE_KEYS = KEY_CODE_DEFS.filter((d) => d.of);   // [{ key: "rloan1", of: "loan1" }, ...]
const KEY_CODE_DEFAULTS = Object.fromEntries(KEY_CODE_DEFS.map((d) => [d.key, d.def]));   // (extra جدا در mergeKeyCodes)
const CODE_RE = /^[A-Za-z0-9]{1,20}$/;
const EXTRA_MAX = 12;   // کدهای مهم اضافی (عنوان + کد) که کاربر در تنظیمات اضافه می‌کند؛ فقط برای خلاصهٔ داشبورد/گزارش
function looseExtra(v) {
  const out = [];
  for (const e of Array.isArray(v) ? v : []) {
    const label = String((e && e.label) || "").trim().slice(0, 40), code = toLatinDigits(String((e && e.code) || "")).trim();
    if (label && CODE_RE.test(code) && !out.some((x) => x.code === code)) out.push({ label, code });
    if (out.length >= EXTRA_MAX) break;
  }
  return out;
}

// مقدار ذخیره‌شده + پیش‌فرض‌ها (کدِ خالی/نامعتبرِ اجباری ← پیش‌فرض)
function mergeKeyCodes(stored) {
  const s = stored && typeof stored === "object" ? stored : {};
  const out = {};
  for (const d of KEY_CODE_DEFS) {
    const v = toLatinDigits(s[d.key] == null ? "" : String(s[d.key])).trim();
    out[d.key] = CODE_RE.test(v) ? v : (d.optional && !v ? "" : d.def);
  }
  out.extra = looseExtra(s.extra);      // کدهای اضافیِ شاغلین (و اگر rextra خالی باشد: بازنشستگان هم)
  out.rextra = looseExtra(s.rextra);    // کدهای اضافیِ بازنشستگان
  return out;
}
// اعتبارسنجی ورودی کاربر؛ در خطا Error با پیام فارسی می‌اندازد
function cleanKeyCodes(v) {
  if (!v || typeof v !== "object") throw new Error("کدهای مهم نامعتبر است.");
  const out = {};
  for (const d of KEY_CODE_DEFS) {
    const x = toLatinDigits(v[d.key] == null ? "" : String(v[d.key])).trim();
    if (!x && d.optional) { out[d.key] = ""; continue; }
    if (!CODE_RE.test(x)) throw new Error(`«${d.label}» را وارد کنید (فقط عدد/حرف انگلیسی، حداکثر ۲۰ نویسه).`);
    out[d.key] = x;
  }
  const parseExtra = (list) => {
    const res = [];
    for (const e of Array.isArray(list) ? list : []) {
      const label = String((e && e.label) || "").trim().slice(0, 40), code = toLatinDigits(String((e && e.code) || "")).trim();
      if (!label && !code) continue;   // ردیف خالی
      if (!label) throw new Error("برای هر کد اضافه‌شده یک عنوان بنویسید.");
      if (!CODE_RE.test(code)) throw new Error(`کد «${label}» را وارد کنید (فقط عدد/حرف انگلیسی، حداکثر ۲۰ نویسه).`);
      res.push({ label, code });
    }
    if (res.length > EXTRA_MAX) throw new Error(`حداکثر ${EXTRA_MAX} کد اضافی برای هر گروه مجاز است.`);
    return res;
  };
  const extra = parseExtra(v.extra), rextra = parseExtra(v.rextra);
  // یکتایی جدا برای هر گروه (یک کد می‌تواند هم در شاغلین و هم در بازنشستگان باشد: مثلاً سرمایه ۷۹۶ برای هر دو)
  const checkUnique = (title, list) => { for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) if (list[i] === list[j]) throw new Error(`دو کدِ مهم ${title} نمی‌توانند یکسان باشند.`); };
  const activeCodes = KEY_CODE_DEFS.filter((d) => !d.of).map((d) => out[d.key]).filter(Boolean);
  checkUnique("شاغلین", [...activeCodes, ...extra.map((e) => e.code)]);
  checkUnique("بازنشستگان", [...KEY_CODE_DEFS.filter((d) => !d.of).map((d) => { const r = RETIREE_KEYS.find((x) => x.of === d.key); return (r && out[r.key]) || out[d.key]; }).filter(Boolean), ...(rextra.length ? rextra : extra).map((e) => e.code)]);
  out.extra = extra; out.rextra = rextra;
  return out;
}
// کدهای مهم مربوط به یک گروه: kind === "retiree" ← کد بازنشستگان (در صورت خالی بودن: کد شاغلین)؛ در غیر این صورت کد شاغلین. extra هم همراه می‌ماند.
function kcFor(kc, kind) {
  if (kind !== "retiree") return kc;
  const out = { ...kc };
  for (const d of RETIREE_KEYS) if (kc[d.key]) out[d.of] = kc[d.key];
  return out;
}
// q می‌تواند pool یا connection باشد
async function loadKeyCodes(q) {
  try {
    const [rows] = await q.query("SELECT data FROM form_settings WHERE id = 1");
    let d = rows[0] && rows[0].data; if (typeof d === "string") d = JSON.parse(d);
    return mergeKeyCodes(d && d.keyCodes);
  } catch (e) { return { ...KEY_CODE_DEFAULTS }; }
}

module.exports = { KEY_CODE_DEFS, KEY_CODE_DEFAULTS, RETIREE_KEYS, mergeKeyCodes, cleanKeyCodes, loadKeyCodes, kcFor };
