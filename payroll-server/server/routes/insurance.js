// بیمهٔ تکمیلی درمان: فایل کلی بیمه (همهٔ سرپرستان و افراد تحت تکفل: همسر، فرزند، پدر، مادر) در پایگاه داده نگه‌داری می‌شود؛
// ۱) با جست‌وجوی پرسنل، افراد تحت تکفلش نشان داده می‌شوند، ۲) گزارش تجمیعی/جزئیات (همان کار «bimeh_tool.py») با سهم دولت/کارمند.
const express = require("express");
const crypto = require("crypto");
const { sendError, isBusinessError } = require("../errors");
const pool = require("../db");
const { toLatinDigits, fixArabic, padNid } = require("../textNormalize");
const { pageParams, pageMeta } = require("../paging");

const router = express.Router();
const fail = (res, e) => sendError(res, e);
const bad = (res, message, code = 400) => res.status(code).json({ error: code === 404 ? "not_found" : "invalid_input", message });

// ---------------------------------------------------------------- نرمال‌سازی (مثل bimeh_tool.py)
const txt = (v, n = 200) => fixArabic(String(v == null ? "" : v)).replace(/_x000D_|[\r\n\t]+/g, " ").replace(/ۀ/g, "ه").replace(/\u200c/g, " ").replace(/\s+/g, " ").trim().slice(0, n);
function code(v) {
  let s = toLatinDigits(String(v == null ? "" : v)).trim();
  if (/^\d+\.0+$/.test(s)) s = s.split(".")[0];
  else if (/^\d(\.\d+)?[Ee]\+?\d+$/.test(s)) s = String(Math.round(Number(s)));
  return s.slice(0, 30);
}
const nidOf = (v) => { const c = code(v); return /^\d{1,9}$/.test(c) ? padNid(c) : c.slice(0, 20); };
const num = (v) => { const n = Number(toLatinDigits(String(v == null ? "" : v)).replace(/[,٬\s]/g, "")); return Number.isFinite(n) ? Math.round(n) : null; };
const dateTxt = (v) => toLatinDigits(txt(v, 12));
const CHILD = new Set(["فرزند", "پسر", "دختر"]), PARENT = new Set(["پدر", "مادر"]);

// ---------------------------------------------------------------- نگهداری داده در حافظه (۲۹ هزار ردیف؛ پس از هر بارگذاری تازه می‌شود)
let cache = { batch: null, rows: null, byMain: null };
async function current() {
  const [m] = await pool.query("SELECT * FROM insurance_files WHERE id = 1");
  if (!m.length) return null;
  if (cache.batch !== m[0].batch) {
    const [rows] = await pool.query("SELECT * FROM insurance_members WHERE batch = ? ORDER BY id", [m[0].batch]);
    const byMain = new Map();
    for (const r of rows) { const k = r.main_id; if (!byMain.has(k)) byMain.set(k, []); byMain.get(k).push(r); }
    cache = { batch: m[0].batch, rows, byMain };
  }
  return { meta: m[0], rows: cache.rows, byMain: cache.byMain };
}
const fmtMember = (r) => ({
  id: r.id, mainId: r.main_id, pcode: r.pcode, nid: r.nid, firstName: r.first_name, lastName: r.last_name, fatherName: r.father_name, rel: r.rel, sex: r.sex,
  birthYear: r.birth_year, start: r.start_cover, end: r.end_cover, reason: r.end_reason, cancelled: !!r.cancelled, unit: r.unit, plan: r.plan,
  insType: r.ins_type, policyNo: r.policy_no, premium: r.premium == null ? null : Number(r.premium),
});
const REL_ORDER = { "سرپرست": 0, "همسر": 1, "پسر": 2, "دختر": 2, "فرزند": 2, "پدر": 3, "مادر": 4 };
const sortFamily = (a, b) => (REL_ORDER[a.rel] ?? 9) - (REL_ORDER[b.rel] ?? 9) || String(a.birthYear).localeCompare(String(b.birthYear));

// ---------------------------------------------------------------- وضعیت فایل فعلی
router.get("/status", async (req, res) => {
  try {
    const cur = await current();
    res.json({ file: cur ? { name: cur.meta.file_name, uploadedAt: cur.meta.uploaded_at, uploadedBy: cur.meta.uploaded_by, rows: cur.meta.row_count, heads: cur.meta.head_count, cancelled: cur.meta.cancelled_count } : null });
  } catch (e) { fail(res, e); }
});

// ---------------------------------------------------------------- بارگذاری (تکه‌تکه؛ کلاینت xlsx را می‌خواند و ردیف‌ها را در چند درخواست می‌فرستد)
// ۱) POST /upload/begin ← سرور توکن تصادفی رمزنگاری‌شده می‌دهد و آن را به همین کاربر و همین نشست وصل می‌کند.
// ۲) POST /upload { token, last, fileName, rows:[{mainid,pcode,nid,fname,lname,father,rel,sex,birth,start,end,reason,unit,plan,insType,policyNo,premium}] } چند بار؛ آخرین تکه last:true.
// هر تکه در یک تراکنش درج می‌شود؛ هر خطا ← Rollback همان تکه + پاک‌شدن کل ردیف‌های ناتمام این بارگذاری و ابطال توکن.
// فایل فعلی (insurance_files) فقط در تراکنش پایانی عوض می‌شود، پس بارگذاری ناقص هرگز دادهٔ فعلی را خراب نمی‌کند.
const UPLOAD_IDLE_MS = 30 * 60 * 1000, UPLOAD_MAX_ROWS = 500000;
const UPLOADS = new Map();   // token -> { userId, session, last, rows }
const activeTokens = (except) => [...UPLOADS.keys()].filter((t) => t !== except);
async function dropBatch(token) {
  UPLOADS.delete(token);
  try { await pool.query("DELETE FROM insurance_members WHERE batch = ?", [token]); } catch (e) { console.error("[خطا] پاک‌سازی بارگذاری ناتمام بیمه", e); }
}
async function sweepUploads() {
  const now = Date.now();
  for (const [t, u] of [...UPLOADS]) if (now - u.last > UPLOAD_IDLE_MS) await dropBatch(t);
}
router.post("/upload/begin", async (req, res) => {
  try {
    await sweepUploads();
    for (const [t, u] of [...UPLOADS]) if (u.userId === req.user.id) await dropBatch(t);   // هر کاربر یک بارگذاری فعال
    const token = crypto.randomBytes(12).toString("hex");   // ۲۴ نویسهٔ هگز = ۹۶ بیت تصادفی (ستون batch حداکثر ۲۴ نویسه است)
    UPLOADS.set(token, { userId: req.user.id, session: req.tokenHash, last: Date.now(), rows: 0 });
    // ردیف‌های یتیم بارگذاری‌های قدیمی (قطع سرور/برق وسط کار) که به فایل فعلی و بارگذاری فعال ربطی ندارند
    const [curRows] = await pool.query("SELECT batch FROM insurance_files WHERE id = 1");
    const cur = curRows[0] || {};
    await pool.query("DELETE FROM insurance_members WHERE batch NOT IN (?)", [[cur.batch || "", ...activeTokens("")]]);
    res.json({ token });
  } catch (e) { fail(res, e); }
});
router.post("/upload", async (req, res) => {
  const b = req.body || {};
  const token = typeof b.token === "string" ? b.token : "";
  if (!/^[a-f0-9]{24}$/.test(token)) return bad(res, "شناسهٔ بارگذاری نامعتبر است؛ صفحهٔ برنامه را تازه کنید (Ctrl+F5) و دوباره تلاش کنید.");
  const st = UPLOADS.get(token);
  if (!st || st.userId !== req.user.id || st.session !== req.tokenHash) return bad(res, "شناسهٔ بارگذاری معتبر نیست یا منقضی شده است؛ بارگذاری را از اول شروع کنید.", 403);
  const rows = Array.isArray(b.rows) ? b.rows : [];
  if (rows.length > 5000) return bad(res, "هر درخواست حداکثر ۵۰۰۰ ردیف.");
  if (st.rows + rows.length > UPLOAD_MAX_ROWS) { await dropBatch(token); return bad(res, "تعداد ردیف‌های فایل از حد مجاز بیشتر است."); }
  st.last = Date.now();
  const vals = [];
  for (const r of rows) {
    if (!r || typeof r !== "object") continue;
    const o = { mainid: code(r.mainid), pcode: code(r.pcode), nid: nidOf(r.nid) };
    if (!(o.mainid || o.pcode || o.nid)) continue;
    const start = dateTxt(r.start), end = dateTxt(r.end), reason = txt(r.reason, 120);
    const cancelled = !!reason || !!(end && start && end <= start);   // لغوشده: «علت پایان پوشش» پر باشد یا پایان ≤ شروع
    vals.push([token, o.mainid || o.pcode, o.pcode, o.nid, txt(r.fname, 80), txt(r.lname, 80), txt(r.father, 80), txt(r.rel, 20), txt(r.sex, 10), code(r.birth).slice(0, 10),
      start, end, reason, txt(r.unit, 80), txt(r.plan, 60), txt(r.insType, 30), txt(r.policyNo, 40), num(r.premium), cancelled ? 1 : 0]);
  }
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    for (let i = 0; i < vals.length; i += 1000)
      await conn.query("INSERT INTO insurance_members (batch, main_id, pcode, nid, first_name, last_name, father_name, rel, sex, birth_year, start_cover, end_cover, end_reason, unit, plan, ins_type, policy_no, premium, cancelled) VALUES ?", [vals.slice(i, i + 1000)]);
    if (b.last) {
      const [[t]] = await conn.query("SELECT COUNT(*) AS n, SUM(rel = 'سرپرست') AS heads, SUM(cancelled) AS canc FROM insurance_members WHERE batch = ?", [token]);
      if (!Number(t.n)) { await conn.rollback(); await dropBatch(token); return bad(res, "هیچ ردیف معتبری در فایل پیدا نشد."); }
      const by = (req.user && (req.user.fullName || req.user.username)) || "";
      await conn.query("REPLACE INTO insurance_files (id, batch, file_name, uploaded_by, row_count, head_count, cancelled_count) VALUES (1, ?, ?, ?, ?, ?, ?)", [token, txt(b.fileName, 255), by, Number(t.n), Number(t.heads) || 0, Number(t.canc) || 0]);
      await conn.query("DELETE FROM insurance_members WHERE batch <> ? AND batch NOT IN (?)", [token, ["", ...activeTokens(token)]]);
      await conn.commit();
      UPLOADS.delete(token);
      cache = { batch: null, rows: null, byMain: null };
      return res.json({ ok: true, rows: Number(t.n), heads: Number(t.heads) || 0, cancelled: Number(t.canc) || 0 });
    }
    await conn.commit();
    st.rows += vals.length;
    res.json({ ok: true, received: vals.length });
  } catch (e) {
    try { await conn.rollback(); } catch (x) {}
    await dropBatch(token);   // بارگذاری ناتمام باقی نمی‌ماند؛ کاربر باید از اول شروع کند
    fail(res, e);
  } finally { conn.release(); }
});

// ---------------------------------------------------------------- خانوادهٔ یک سرپرست
function familyOf(cur, mainId) {
  const fam = (cur.byMain.get(String(mainId)) || []).map(fmtMember).sort(sortFamily);
  const head = fam.find((x) => x.rel === "سرپرست") || fam[0] || null;
  const live = fam.filter((x) => !x.cancelled);
  return {
    head, members: fam,
    counts: { total: fam.length, active: live.length, cancelled: fam.length - live.length, spouse: live.filter((x) => x.rel === "همسر").length, children: live.filter((x) => CHILD.has(x.rel)).length, parents: live.filter((x) => PARENT.has(x.rel)).length },
  };
}
async function noteOf(pcode) {
  if (!pcode) return "";
  try { const [r] = await pool.query("SELECT note FROM insurance_notes WHERE pcode = ?", [String(pcode)]); return r.length ? r[0].note : ""; } catch (e) { return ""; }
}
router.get("/family/:mainId", async (req, res) => {
  try {
    const cur = await current(); if (!cur) return res.json({ file: false });
    const fam = familyOf(cur, req.params.mainId);
    res.json({ file: true, found: cur.byMain.has(String(req.params.mainId)), ...fam, note: await noteOf(fam.head && fam.head.pcode) });
  } catch (e) { fail(res, e); }
});
// فرد انتخاب‌شده در برنامه (کد پرسنلی؛ برای وارث هم‌کد «کد-کدملی») ← سرپرست در فایل بیمه با کد پرسنلی یا کد ملی
router.get("/by-person/:code", async (req, res) => {
  try {
    const cur = await current(); if (!cur) return res.json({ file: false });
    const pc = code(req.params.code), base = pc.split("-")[0];
    const [p] = await pool.query("SELECT code, national_id FROM personnel WHERE code = ?", [pc]);
    const nid = p.length ? nidOf(p[0].national_id) : "";
    const heads = cur.rows.filter((r) => r.rel === "سرپرست");
    let cand = heads.filter((r) => r.pcode === base);
    if (cand.length > 1 && nid) { const m = cand.filter((r) => r.nid === nid); if (m.length) cand = m; }
    if (!cand.length && nid) cand = heads.filter((r) => r.nid === nid);
    if (!cand.length) return res.json({ file: true, found: false, personnel: { code: pc, nationalId: nid } });
    const fam = familyOf(cur, cand[0].main_id);
    res.json({ file: true, found: true, matchedBy: cand[0].pcode === base ? "کد پرسنلی" : "کد ملی", ...fam, note: await noteOf(fam.head && fam.head.pcode) });
  } catch (e) { fail(res, e); }
});
// یادداشت دلخواه برای هر سرپرست (با کد پرسنلی؛ با عوض‌شدن فایل بیمه از بین نمی‌رود)
router.put("/note/:pcode", async (req, res) => {
  try {
    const pc = code(req.params.pcode); if (!pc) return bad(res, "کد پرسنلی نامعتبر است.");
    const note = String((req.body || {}).note == null ? "" : req.body.note).replace(/\r\n/g, "\n").trim().slice(0, 5000);
    if (!note) { await pool.query("DELETE FROM insurance_notes WHERE pcode = ?", [pc]); return res.json({ ok: true, note: "" }); }
    const by = (req.user && (req.user.fullName || req.user.username)) || "";
    await pool.query("INSERT INTO insurance_notes (pcode, note, updated_by) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE note = VALUES(note), updated_by = VALUES(updated_by)", [pc, note, by]);
    res.json({ ok: true, note });
  } catch (e) { fail(res, e); }
});
// متن «توضیحات» زیر جدول افراد تحت تکفل (مشترک برای همهٔ افراد، صفحه و چاپ): در form_settings.formTexts.insDeps.notes نگه‌داری می‌شود.
// خالی‌کردن = بازگشت به متن پیش‌فرض. (کاربر با دسترسی «بیمه تکمیلی» بدون دسترسی تنظیمات هم می‌تواند ویرایش کند؛ فقط همین یک کلید.)
router.put("/notes-text", async (req, res) => {
  try {
    const text = String((req.body || {}).text == null ? "" : req.body.text).replace(/\r\n?/g, "\n").trim().slice(0, 2000);
    const [rows] = await pool.query("SELECT data FROM form_settings WHERE id = 1");
    let d = (rows[0] && rows[0].data) || {};
    if (typeof d === "string") { try { d = JSON.parse(d); } catch (e) { d = {}; } }
    const ft = { ...(d.formTexts || {}) }, one = { ...(ft.insDeps || {}) };
    if (text) one.notes = text; else delete one.notes;
    if (Object.keys(one).length) ft.insDeps = one; else delete ft.insDeps;
    d = { ...d, formTexts: ft };
    await pool.query("INSERT INTO form_settings (id, data) VALUES (1, ?) ON DUPLICATE KEY UPDATE data = VALUES(data)", [JSON.stringify(d)]);
    res.json({ ok: true, formTexts: ft });
  } catch (e) { fail(res, e); }
});
// جست‌وجوی آزاد در کل فایل بیمه (کد پرسنلی، کد ملی، نام)
router.get("/search", async (req, res) => {
  try {
    const cur = await current(); if (!cur) return res.json({ file: false, items: [] });
    const q = toLatinDigits(txt(req.query.q, 60)).toLowerCase(); if (q.length < 2) return res.json({ file: true, items: [] });
    const digits = /^\d+$/.test(q), out = [], seen = new Set();
    for (const r of cur.rows) {
      const hit = digits ? (r.pcode === q || r.nid === q || r.nid === padNid(q) || (q.length >= 4 && (r.pcode.startsWith(q) || r.nid.startsWith(q)))) : `${r.first_name} ${r.last_name}`.toLowerCase().includes(q);
      if (!hit) continue;
      const key = r.main_id + ":" + r.id; if (seen.has(key)) continue; seen.add(key);
      const head = (cur.byMain.get(r.main_id) || []).find((x) => x.rel === "سرپرست") || r;
      out.push({ mainId: r.main_id, member: `${r.first_name} ${r.last_name}`.trim(), rel: r.rel, nid: r.nid, head: `${head.first_name} ${head.last_name}`.trim(), headPcode: head.pcode });
      if (out.length >= 40) break;
    }
    res.json({ file: true, items: out });
  } catch (e) { fail(res, e); }
});

// ---------------------------------------------------------------- گزارش تجمیعی (پورت bimeh_tool.py: build + محاسبهٔ سهم‌ها)
// scope: district (سرپرستانی که در پرسنل همین برنامه هستند) | all (همهٔ سرپرستان فایل) | list (فقط کدهای داده‌شده در codes)
router.get("/report", async (req, res) => {
  try {
    const cur = await current(); if (!cur) return res.json({ file: false });
    const q = req.query, scope = ["district", "all", "list"].includes(q.scope) ? q.scope : "district";
    const incCanc = String(q.cancelled) === "1";
    const govt = Math.max(0, num(q.govt) || 0), emp = Math.max(0, num(q.emp) || 0);
    const heads = cur.rows.filter((r) => r.rel === "سرپرست");
    const byP = new Map(), byN = new Map();
    for (const h of heads) { if (h.pcode && !byP.has(h.pcode)) byP.set(h.pcode, h); if (h.nid && !byN.has(h.nid)) byN.set(h.nid, h); }
    let selected = [], notFound = [], districtCount = 0;
    if (scope === "all") selected = heads;
    else if (scope === "list") {
      const codes = [...new Set(String(q.codes || "").split(/[\s,;،]+/).map(code).filter((c) => /^\d+$/.test(c)))].slice(0, 5000);
      for (const c of codes) { const h = byP.get(c) || byN.get(c) || byN.get(padNid(c)); if (h) selected.push(h); else notFound.push(c); }
    } else {
      const [ps] = await pool.query("SELECT code, national_id FROM personnel");
      const pc = new Set(), pn = new Set();
      for (const p of ps) { pc.add(String(p.code).split("-")[0]); if (p.national_id) pn.add(nidOf(p.national_id)); }
      districtCount = ps.length;
      selected = heads.filter((h) => pc.has(h.pcode) || pn.has(h.nid));
    }
    const done = new Set(), summary = [], detail = [], skipped = [];
    for (const h of selected) {
      if (done.has(h.main_id)) continue; done.add(h.main_id);
      const fam = cur.byMain.get(h.main_id) || [h];
      const cnt = incCanc ? fam : fam.filter((d) => !d.cancelled);
      if (!cnt.length) { skipped.push(`${h.pcode} (${h.first_name} ${h.last_name})`); continue; }
      const female = h.sex === "زن";
      const main = cnt.filter((d) => d.rel === "سرپرست").length, child = cnt.filter((d) => CHILD.has(d.rel)).length, par = cnt.filter((d) => PARENT.has(d.rel)).length, sp = cnt.filter((d) => d.rel === "همسر").length;
      const spM = female ? 0 : sp, spF = female ? sp : 0;
      const nGov = main + child + spM, nNon = par + spF;
      const vGov = nGov * govt, vEmp = nGov * emp + nNon * (govt + emp);
      summary.push({ pcode: h.pcode, nid: h.nid, firstName: h.first_name, lastName: h.last_name, main, child, parents: par, spouse: spM, spouseF: spF, total: main + child + par + spM + spF, govt: vGov, emp: vEmp, premium: vGov + vEmp, start: h.start_cover, end: h.end_cover, sex: h.sex });
      for (const d of cnt) detail.push([h.pcode, h.nid, h.first_name, h.last_name, d.first_name, d.last_name, d.rel, d.sex, d.nid, d.start_cover, d.end_cover, d.cancelled ? "لغو شده" : "فعال", d.end_reason]);
    }
    const sum = (k) => summary.reduce((s, r) => s + r[k], 0);
    const totals = { heads: summary.length, main: sum("main"), child: sum("child"), parents: sum("parents"), spouse: sum("spouse"), spouseF: sum("spouseF"), total: sum("total"), govt: sum("govt"), emp: sum("emp"), premium: sum("premium") };
    const pg = pageParams(q);
    const items = pg.all ? summary : summary.slice(pg.offset, pg.offset + pg.size);
    const out = { file: true, scope, includeCancelled: incCanc, govt, emp, items, totals, notFound, skipped, districtPersonnel: districtCount, ...pageMeta(pg, summary.length) };
    if (String(q.detail) === "1") out.detail = detail;
    res.json(out);
  } catch (e) { fail(res, e); }
});

// ---------------------------------------------------------------- مغایرت‌گیری با «خروجی حسابداری» (ماهانه) — فقط نفرات (مبلغ‌ها مقایسه نمی‌شوند)
// ستون‌های فایل حسابداری: تعداد تبعی اصلی / اول / دوم / سوم / دیگر. تطبیق دسته‌ها با فایل بیمه (با نمونهٔ واقعی سنجیده شد):
// اصلی = خود سرپرست؛ اول = فرزندان + همسرِ سرپرست مرد؛ دوم = پدر و مادر؛ سوم = همسرِ سرپرست زن (اناث)؛ دیگر = سایر نسبت‌ها. فقط افراد فعال.
router.post("/reconcile", async (req, res) => {
  try {
    const cur = await current(); if (!cur) return bad(res, "ابتدا فایل بیمه را بارگذاری کنید.");
    const rows = Array.isArray((req.body || {}).rows) ? req.body.rows.slice(0, 20000) : [];
    if (!rows.length) return bad(res, "ردیفی در فایل حسابداری پیدا نشد.");
    const scope = (req.body || {}).scope === "all" ? "all" : "district";
    const heads = cur.rows.filter((r) => r.rel === "سرپرست"), byP = new Map(), byN = new Map();
    for (const h of heads) { if (h.pcode && !byP.has(h.pcode)) byP.set(h.pcode, h); if (h.nid && !byN.has(h.nid)) byN.set(h.nid, h); }
    const n0 = (v) => num(v) || 0;
    const calc = (head) => {
      const live = (cur.byMain.get(head.main_id) || [head]).filter((d) => !d.cancelled), female = head.sex === "زن";
      const main = live.filter((d) => d.rel === "سرپرست").length, par = live.filter((d) => PARENT.has(d.rel)).length;
      const child = live.filter((d) => CHILD.has(d.rel)).length, sp = live.filter((d) => d.rel === "همسر").length;
      const first = child + (female ? 0 : sp), third = female ? sp : 0;
      return { n: live.length, main, first, second: par, third, other: live.length - main - first - par - third };
    };
    const sumN = (a) => a.main + a.first + a.second + a.third + a.other;
    const out = [], seen = new Set(), seenHead = new Set();
    const stat = { accRows: rows.length, ok: 0, diff: 0, onlyAcc: 0, dup: 0, nidDiff: 0, catDiff: { main: 0, first: 0, second: 0, third: 0, other: 0 } };
    for (const r of rows) {
      const pcode = code(r.pcode), nid = nidOf(r.nid);
      const o = { pcode, nid, firstName: txt(r.fname, 80), lastName: txt(r.lname, 80), region: txt(r.region, 60), month: txt(r.month, 20), year: txt(r.year, 6),
        acc: { main: n0(r.main), first: n0(r.first), second: n0(r.second), third: n0(r.third), other: n0(r.other) } };
      const key = pcode || nid;
      if (seen.has(key)) { o.status = "dup"; o.reasons = ["کد پرسنلی در فایل حسابداری تکراری است"]; o.found = false; stat.dup++; out.push(o); continue; }
      seen.add(key);
      const head = byP.get(pcode) || (nid && byN.get(nid)) || null;
      o.found = !!head;
      if (head) { o.insName = `${head.first_name} ${head.last_name}`.trim(); o.insNid = head.nid; seenHead.add(head.main_id); }
      const reasons = [];
      if (!head) { o.status = "onlyAcc"; reasons.push("سرپرست در فایل بیمه پیدا نشد"); stat.onlyAcc++; }
      else {
        const e = calc(head); o.exp = e;
        if (!e.n) { o.status = "onlyAcc"; reasons.push("همهٔ افراد این سرپرست در فایل بیمه لغو شده‌اند"); stat.onlyAcc++; }
        else {
          for (const [k, t] of [["main", "اصلی"], ["first", "اول"], ["second", "دوم"], ["third", "سوم"], ["other", "دیگر"]]) if (o.acc[k] !== e[k]) { reasons.push(`تبعی ${t}: حسابداری ${o.acc[k]} / بیمه ${e[k]}`); stat.catDiff[k]++; }
          if (sumN(o.acc) !== sumN(e)) reasons.push(`جمع نفرات: حسابداری ${sumN(o.acc)} / بیمه ${sumN(e)}`);
          if (nid && head.nid && nid !== head.nid && byP.get(pcode)) { reasons.push(`کد ملی متفاوت: حسابداری ${nid} / بیمه ${head.nid}`); stat.nidDiff++; }
          o.status = reasons.length ? "diff" : "ok";
          if (o.status === "ok") stat.ok++; else stat.diff++;
        }
      }
      o.reasons = reasons; out.push(o);
    }
    // سرپرستانی که در فایل بیمه فعال‌اند ولی در فایل حسابداری نیامده‌اند (پرسنل ناحیه یا همهٔ سرپرستان)
    let cand = heads;
    if (scope === "district") {
      const [ps] = await pool.query("SELECT code, national_id FROM personnel");
      const pc = new Set(), pn = new Set();
      for (const p of ps) { pc.add(String(p.code).split("-")[0]); if (p.national_id) pn.add(nidOf(p.national_id)); }
      cand = heads.filter((h) => pc.has(h.pcode) || pn.has(h.nid));
    }
    const onlyIns = [], done = new Set();
    for (const h of cand) {
      if (done.has(h.main_id) || seenHead.has(h.main_id)) continue; done.add(h.main_id);
      const e = calc(h); if (!e.n) continue;
      onlyIns.push({ pcode: h.pcode, nid: h.nid, firstName: h.first_name, lastName: h.last_name, exp: e });
    }
    stat.onlyIns = onlyIns.length;
    stat.persons = { acc: out.reduce((s, r) => s + sumN(r.acc), 0), ins: out.reduce((s, r) => s + (r.exp ? sumN(r.exp) : 0), 0), onlyIns: onlyIns.reduce((s, r) => s + sumN(r.exp), 0) };
    res.json({ ok: true, scope, stat, rows: out, onlyIns, period: { month: out[0].month, year: out[0].year, region: out[0].region } });
  } catch (e) { fail(res, e); }
});

module.exports = { router };
