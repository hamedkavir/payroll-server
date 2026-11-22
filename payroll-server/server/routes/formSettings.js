// /api/form-settings — تنظیمات فرم‌ها، قالب‌ها، چیدمان‌ها، کدهای مهم و گرد کردن
// (از routes/extras.js نسخهٔ ۱۱۰ جدا شد؛ کد مسیرها بدون تغییر رفتار)
const express = require("express");
const { userMsg } = require("../errors");
const pool = require("../db");
const { toLatinDigits } = require("../textNormalize");
const { ROUND_KEYS } = require("../rounding");
const { FS_DEFAULTS } = require("./formDefaults");
const { mergeKeyCodes, cleanKeyCodes } = require("../keyCodes");
const { cleanNavCfg } = require("../navCfg");
const { fail, bad, num, strKeep } = require("./extrasCommon");

const formSettings = express.Router();
const TEXT_FORMS = ["notice", "receipt", "advance", "goods", "service", "emdad", "cancel", "lifeA", "lifeB", "lifeClaim", "deceased", "sigchange", "capital", "mehr", "insDeps", "cheque", "vcapital", "vcancel"];
// طراح فرم‌های چاپی: فهرست امضاکنندگان، چیدمان امضاها، فیلدهای مخفی و سطرهای اضافهٔ هر فرم
const SG_ID = /^[A-Za-z0-9_]{1,20}$/;
const cs = (v, n) => String(v == null ? "" : v).replace(/\r/g, "").trim().slice(0, n);
function cleanSignatories(v) {
  if (!Array.isArray(v)) return [];
  const seen = new Set(), out = [];
  for (const g of v.slice(0, 30)) {
    if (!g || typeof g.id !== "string" || !SG_ID.test(g.id) || seen.has(g.id)) continue;
    seen.add(g.id); out.push({ id: g.id, title: cs(g.title, 60), name: cs(g.name, 60) });
  }
  return out;
}
function cleanFormSigs(v) {
  const out = {}; if (!v || typeof v !== "object") return out;
  for (const f of TEXT_FORMS) if (Array.isArray(v[f])) out[f] = [...new Set(v[f].filter((k) => typeof k === "string" && /^(def:\d{1,2}|sig:[A-Za-z0-9_]{1,20})$/.test(k)))].slice(0, 12);
  return out;
}
function cleanFormHidden(v) {
  const out = {}; if (!v || typeof v !== "object") return out;
  for (const f of TEXT_FORMS) if (Array.isArray(v[f])) { const a = [...new Set(v[f].map((x) => cs(x, 60)).filter(Boolean))].slice(0, 40); if (a.length) out[f] = a; }
  return out;
}
function cleanFormExtras(v) {
  const out = {}; if (!v || typeof v !== "object") return out;
  for (const f of TEXT_FORMS) if (Array.isArray(v[f])) { const a = v[f].slice(0, 10).map((x) => ({ label: cs(x && x.label, 60), text: cs(x && x.text, 300) })).filter((x) => x.label || x.text); if (a.length) out[f] = a; }
  return out;
}
// فیلدهای اضافهٔ هر فرم: { فرم: [{label, src, text}] } — src = نام فیلد دادهٔ فرد/آموزشگاه یا خالی (متن ثابت)
function cleanFormFields(v) {
  const out = {}; if (!v || typeof v !== "object") return out;
  for (const f of TEXT_FORMS) if (Array.isArray(v[f])) {
    const a = v[f].slice(0, 12).map((x) => ({ label: cs(x && x.label, 60), src: /^[A-Za-z0-9_]{0,30}$/.test(String((x && x.src) || "")) ? String((x && x.src) || "") : "", text: cs(x && x.text, 200) })).filter((x) => x.label);
    if (a.length) out[f] = a;
  }
  return out;
}
// چیدمان آزاد: root {order, hide, zoom}، grids {شناسهٔ شبکه: [شناسهٔ فیلدها]}، fspan، fhide
const LID = (x) => (typeof x === "string" ? x.replace(/[\u0000-\u001f]/g, "").slice(0, 100) : "");
const lidList = (a, n) => (Array.isArray(a) ? [...new Set(a.map(LID).filter(Boolean))].slice(0, n) : []);
// ظاهر هر بخش/فیلد در چیدمان آزاد: کادر (نوع، ضخامت، رنگ، گردی)، پس‌زمینه، فاصله‌ها، ارتفاع، قلم، تراز، خط زیر عنوان کادر
function cleanLyStyle(st) {
  const o = {}; if (!st || typeof st !== "object") return o;
  const n = (k, mn, mx) => { const v = Number(st[k]); if (st[k] !== undefined && st[k] !== "" && st[k] !== null && Number.isFinite(v) && v >= mn && v <= mx) o[k] = Math.round(v * 10) / 10; };
  n("pb", 1, 1); n("abs", 1, 1); n("fi", 1, 1); n("fu", 1, 1); n("fx", 1, 1); n("fy", 1, 1); n("lock", 1, 1); n("ls", -2, 20); n("bri", 20, 200); n("gs", 0, 100); n("ox", 0, 100); n("oy", 0, 100); n("x", -100, 500); n("y", -100, 700); n("w", 1, 500); n("h", 1, 700); n("z", 0, 99); n("op", 5, 100); n("rot", -180, 180); n("ih", 5, 300); n("lh", 0.8, 4); n("iw", 10, 200); n("bw", 0, 8); n("br", 0, 40); n("pad", 0, 40); n("mt", 0, 80); n("mb", 0, 80); n("minh", 0, 400); n("fs", 7, 26);
  const e = (k, list) => { if (list.includes(st[k])) o[k] = st[k]; };
  e("ar", ["k", "f"]); e("ff", ["vazir", "tahoma", "arial", "times", "mono"]); e("of", ["contain", "cover", "fill"]); e("bs", ["none", "solid", "dashed", "dotted"]); e("ta", ["right", "center", "left"]); e("fw", ["b", "n"]); e("tl", ["none", "solid", "dashed", "dotted"]);
  const c = (k) => { if (/^#[0-9a-fA-F]{6}$/.test(String(st[k] || ""))) o[k] = st[k]; };
  c("bc"); c("bg"); c("tc"); c("fc");
  return o;
}
function cleanFormLayout(v) {
  const out = {}; if (!v || typeof v !== "object") return out;
  for (const f of TEXT_FORMS) {
    const x = v[f]; if (!x || typeof x !== "object") continue;
    const L = { root: { order: [], hide: [], zoom: {} }, grids: {}, fspan: {}, fhide: [], style: {}, groups: [], custom: [], cols: {}, labels: {} };
    const r = x.root || {};
    L.root.order = lidList(r.order, 80); L.root.hide = lidList(r.hide, 80);
    for (const [k, z] of Object.entries(r.zoom || {}).slice(0, 80)) { const n = Math.round(Number(z)); if (LID(k) && n >= 40 && n <= 200 && n !== 100) L.root.zoom[LID(k)] = n; }
    for (const [g, ids] of Object.entries(x.grids || {}).slice(0, 40)) if (/^g\d{1,3}$/.test(g)) L.grids[g] = lidList(ids, 40);
    for (const [k, n] of Object.entries(x.fspan || {}).slice(0, 80)) { const m = Math.round(Number(n)); if (LID(k) && m >= 1 && m <= 6) L.fspan[LID(k)] = m; }
    L.cols = {}; L.labels = {};
    for (const [k, n] of Object.entries(x.cols || {}).slice(0, 60)) { const m = Math.round(Number(n)); if (/^g\d{1,3}$/.test(k) && m >= 1 && m <= 6) L.cols[k] = m; }
    for (const [k, t] of Object.entries(x.labels || {}).slice(0, 120)) { const v = cs(t, 60); if (LID(k) && v) L.labels[LID(k)] = v; }
    L.fhide = lidList(x.fhide, 80);
    L.custom = [];
    for (const c of (Array.isArray(x.custom) ? x.custom : []).slice(0, 12)) {
      const id = String((c && c.id) || ""), text = typeof (c && c.text) === "string" ? c.text.replace(/\r/g, "").slice(0, 1500) : "";
      const kind = ["text", "line", "space", "box", "img"].includes(c && c.kind) ? c.kind : "text";
      const src = kind === "img" && typeof c.src === "string" && c.src.length <= 400000 && /^data:image\/(png|jpeg);base64,[A-Za-z0-9+/=]+$/.test(c.src) ? c.src : "";
      if (kind === "img" && (!src || L.custom.filter((q) => q.kind === "img").length >= 5)) continue;
      if (/^cx\d{1,3}$/.test(id) && !L.custom.some((q) => q.id === id)) L.custom.push({ id, text: kind === "text" ? text : "", kind, ...(src ? { src } : {}) });
    }
    for (const [k, st] of Object.entries(x.style || {}).slice(0, 150)) { const o = cleanLyStyle(st); if (LID(k) && Object.keys(o).length) L.style[LID(k)] = o; }
    for (const g of (Array.isArray(x.groups) ? x.groups : []).slice(0, 12)) {
      const id = String((g && g.id) || ""), ids = lidList(g && g.ids, 40);
      if (/^grp\d{1,3}$/.test(id) && ids.length && !L.groups.some((q) => q.id === id)) L.groups.push({ id, title: cs(g.title, 80), ids });
    }
    out[f] = L;
  }
  return out;
}
// ظاهر صفحه‌ها (مثلاً فرم پرسنلی): ترتیب/پنهان‌بودن بخش‌ها و فیلدها + فیلدهای دلخواه
// pageLayout = { personnel: { sections:{order:[],hide:[]}, fields:{ بخش: {order:[], hide:[], wide:[]} }, custom:[{id,label,sec}] } }
const PAGE_KEYS = ["personnel"];
// صفحه‌های ثبت (مساعده، کالا، وام، ...): { cards:{order:[],hide:[]}, tables:{ کلید_جدول:{order:[],hide:[]} } } — کلیدها هش عنوان‌ها هستند
const WK_PAGE_KEYS = ["advance", "goods", "loanform", "emdad", "changes", "services", "life", "insurance", "mehr", "cheque"];
function cleanPageLayout(v) {
  const out = {}; if (!v || typeof v !== "object") return out;
  const ids = (a, n) => (Array.isArray(a) ? [...new Set(a.map((x) => String(x == null ? "" : x).replace(/[^A-Za-z0-9_]/g, "").slice(0, 40)).filter(Boolean))].slice(0, n) : []);
  for (const pg of PAGE_KEYS) {
    const x = v[pg]; if (!x || typeof x !== "object") continue;
    const L = { sections: { order: ids(x.sections && x.sections.order, 30), hide: ids(x.sections && x.sections.hide, 30) }, fields: {}, custom: [] };
    for (const [sec, f] of Object.entries(x.fields || {}).slice(0, 30)) if (/^[A-Za-z0-9_]{1,30}$/.test(sec) && f && typeof f === "object") L.fields[sec] = { order: ids(f.order, 60), hide: ids(f.hide, 60), wide: ids(f.wide, 60) };
    const seen = new Set();
    for (const c of (Array.isArray(x.custom) ? x.custom : []).slice(0, 30)) {
      const id = String((c && c.id) || ""), label = cs(c && c.label, 60), sec = String((c && c.sec) || "");
      if (/^cx[A-Za-z0-9_]{1,20}$/.test(id) && label && /^[A-Za-z0-9_]{1,30}$/.test(sec) && !seen.has(id)) { seen.add(id); L.custom.push({ id, label, sec }); }
    }
    out[pg] = L;
  }
  for (const pg of WK_PAGE_KEYS) {
    const x = v[pg]; if (!x || typeof x !== "object") continue;
    const L = { cards: { order: ids(x.cards && x.cards.order, 30), hide: ids(x.cards && x.cards.hide, 30) }, tables: {}, titles: {}, fields: {} };
    const KEY = /^[A-Za-z0-9_]{1,60}$/;
    const labels = (m) => { const o = {}; for (const [k, t] of Object.entries(m && typeof m === "object" ? m : {}).slice(0, 80)) { const v = cs(t, 80); if (KEY.test(k) && v) o[k] = v; } return o; };
    for (const [tk, t] of Object.entries(x.tables || {}).slice(0, 40)) if (/^[A-Za-z0-9_]{1,50}$/.test(tk) && t && typeof t === "object") L.tables[tk] = { order: ids(t.order, 60), hide: ids(t.hide, 60), label: labels(t.label) };
    L.titles = labels(x.titles);
    for (const [gk, f] of Object.entries(x.fields || {}).slice(0, 60)) {
      if (!KEY.test(gk) || !f || typeof f !== "object") continue;
      const span = {}; for (const [k, n] of Object.entries(f.span && typeof f.span === "object" ? f.span : {}).slice(0, 80)) { const m = Math.round(Number(n)); if (KEY.test(k) && m >= 1 && m <= 6) span[k] = m; }
      L.fields[gk] = { order: ids(f.order, 80), hide: ids(f.hide, 80), span, label: labels(f.label) };
    }
    out[pg] = L;
  }
  return out;
}
// فقط فرم‌ها و شناسه‌های معتبر، متن‌های کوتاه (جای‌نگهدار {name} داخل متن می‌ماند)
function cleanFormTexts(v) {
  const out = {};
  if (!v || typeof v !== "object") return out;
  for (const f of TEXT_FORMS) {
    const src = v[f]; if (!src || typeof src !== "object") continue;
    for (const [id, txt] of Object.entries(src)) {
      if (!/^[A-Za-z0-9_]{1,40}$/.test(id) || typeof txt !== "string") continue;
      (out[f] = out[f] || {})[id] = txt.replace(/\r/g, "").slice(0, 2000);
    }
  }
  return out;
}
formSettings.get("/", async (req, res) => {
  try {
    const [rows] = await pool.query("SELECT data FROM form_settings WHERE id = 1");
    const d = (rows[0] && rows[0].data) || {};
    res.json({ ...FS_DEFAULTS, ...d, keyCodes: mergeKeyCodes(d.keyCodes) });
  } catch (e) { fail(res, e); }
});
// دسترسی بخش‌های «اتصال و تنظیمات»: settings = همهٔ بخش‌ها؛ set_slip فیش، set_round گرد کردن، set_forms فرم‌ها و قالب متن‌ها
const SLIP_KEYS = ["slipMetaLine", "slipShowCodes", "recentSlips"];
formSettings.put("/", async (req, res) => {
  const b = req.body || {};
  const u = req.user;
  if (u && !u.isAdmin && !(u.permissions || []).includes("settings")) {
    const need = new Set(Object.keys(b).map((k) => (SLIP_KEYS.includes(k) ? "set_slip" : ROUND_KEYS.includes(k) ? "set_round" : k === "keyCodes" ? "set_codes" : "set_forms")));
    for (const n of need) if (!(u.permissions || []).includes(n)) return res.status(403).json({ error: "forbidden", message: "شما به این بخش از تنظیمات دسترسی ندارید." });
  }
  if ((b.pageLayout !== undefined || b.pageLayoutSaved !== undefined) && !(req.user && req.user.isAdmin)) return res.status(403).json({ error: "forbidden", message: "تغییر ظاهر صفحه‌ها فقط برای مدیر سیستم مجاز است." });
  const data = {};
  for (const k of Object.keys(FS_DEFAULTS)) {
    if (b[k] === undefined) continue;
    if (k === "formTexts") { data.formTexts = cleanFormTexts(b.formTexts); continue; }
    if (k === "signatureForms") { const o = {}; for (const f of TEXT_FORMS) if (b.signatureForms && typeof b.signatureForms[f] === "boolean") o[f] = b.signatureForms[f]; data.signatureForms = o; continue; }
    if (k === "signatories") { data.signatories = cleanSignatories(b.signatories); continue; }
    if (k === "formSigs") { data.formSigs = cleanFormSigs(b.formSigs); continue; }
    if (k === "formHidden") { data.formHidden = cleanFormHidden(b.formHidden); continue; }
    if (k === "formFields") { data.formFields = cleanFormFields(b.formFields); continue; }
    if (k === "insShares") { const x = b.insShares || {}, n = (v) => { const z = Math.round(Number(toLatinDigits(String(v == null ? "" : v)).replace(/[,٬\s]/g, ""))); return Number.isFinite(z) && z >= 0 && z <= 1e10 ? z : null; }; const g = n(x.govt), e2 = n(x.emp); if (g == null || e2 == null) return bad(res, "مبلغ سهم دولت/کارمند نامعتبر است."); data.insShares = { govt: g, emp: e2 }; continue; }
    if (k === "navDefault") { data.navDefault = b.navDefault ? cleanNavCfg(b.navDefault) : null; continue; }
    if (k === "keyCodes") { try { data.keyCodes = cleanKeyCodes(b.keyCodes); } catch (e) { return bad(res, userMsg(e)); } continue; }
    if (k === "pageLayout") { data.pageLayout = cleanPageLayout(b.pageLayout); continue; }
    if (k === "pageLayoutSaved") { data.pageLayoutSaved = cleanPageLayout(b.pageLayoutSaved); continue; }
    if (k === "formLayout") { data.formLayout = cleanFormLayout(b.formLayout); continue; }
    if (k === "formExtras") { data.formExtras = cleanFormExtras(b.formExtras); continue; }
    if (ROUND_KEYS.includes(k)) {
      const v = num(b[k]);
      if (!(v >= 0)) return bad(res, "مقدار گرد کردن باید صفر یا بیشتر باشد (۱ یعنی بدون رند).");
      data[k] = Math.max(1, Math.round(v));
      continue;
    }
    data[k] = typeof FS_DEFAULTS[k] === "number" ? num(b[k]) : strKeep(b[k], 200);
  }
  try {
    const [rows] = await pool.query("SELECT data FROM form_settings WHERE id = 1");
    const merged = { ...((rows[0] && rows[0].data) || {}), ...data };
    await pool.query("INSERT INTO form_settings (id, data) VALUES (1, ?) ON DUPLICATE KEY UPDATE data = VALUES(data)", [JSON.stringify(merged)]);
    res.json({ ok: true, ...FS_DEFAULTS, ...merged, keyCodes: mergeKeyCodes(merged.keyCodes) });
  } catch (e) { fail(res, e); }
});

/* ------------------------------- مساعده -------------------------------- */

module.exports = formSettings;
module.exports.FS_DEFAULTS = FS_DEFAULTS;   // سازگاری: دسترسی به پیش‌فرض‌ها از روی روتر
