// /api/inventory — انبار، گروه کالا و درخواست کالا (فروش اقساطی)
// (از routes/extras.js نسخهٔ ۱۱۰ جدا شد؛ کد مسیرها بدون تغییر رفتار)
const express = require("express");
const { sendError, isBusinessError, userMsg } = require("../errors");
const { heirBlock } = require("../eligibility");
const pool = require("../db");
const { sqlNormExpr, likePattern, normalizeSearch } = require("../textNormalize");
const { ceilStep, loadRounding } = require("../rounding");
const { pageParams, limitSql, pageMeta } = require("../paging");
const { fail, bad, num, str, strKeep, planInst, lastOf, DATE_RE, nextNumber } = require("./extrasCommon");

const inventory = express.Router();
const prodJSON = (r) => ({
  id: r.id, code: r.code, name: r.name, unit: r.unit, quantity: Number(r.quantity),
  unitPrice: Number(r.unit_price), active: !!r.active, notes: r.notes,
  groupId: r.group_id || null, groupName: r.group_name || "", deductionCode: r.deduction_code || "",
  defaultInstallments: r.default_installments || 1,
});
const PROD_SELECT = "SELECT p.*, g.name AS group_name, g.deduction_code FROM products p LEFT JOIN product_groups g ON g.id = p.group_id";
const grpId = (v) => { const n = parseInt(v, 10); return n > 0 ? n : null; };
// کد کالا اجباری و یکتاست (بدون توجه به فاصله و بزرگی/کوچکی حروف). کالاهای قدیمیِ بدون کد یا تکراری دست نمی‌خورند تا وقتی ویرایش شوند.
const prodCodeCheck = async (conn, code, exceptId) => {
  if (!code) return "کد کالا لازم است.";
  const [dup] = await conn.query("SELECT id, name FROM products WHERE LOWER(TRIM(code)) = ? AND id <> ? LIMIT 1", [code.toLowerCase(), exceptId || 0]);
  return dup.length ? `کد کالا تکراری است؛ این کد برای «${dup[0].name}» ثبت شده است.` : null;
};
const defInst = (v) => Math.min(60, Math.max(1, parseInt(v, 10) || 1));

/* گروه‌های کالا: هر گروه یک «کد کسر کالا» دارد */
inventory.get("/groups", async (req, res) => {
  try {
    const [rows] = await pool.query("SELECT g.*, (SELECT COUNT(*) FROM products p WHERE p.group_id = g.id) AS cnt FROM product_groups g");
    rows.sort((a, b) => String(a.name).localeCompare(String(b.name), "fa"));
    res.json({ items: rows.map((g) => ({ id: g.id, name: g.name, deductionCode: g.deduction_code, count: Number(g.cnt) })) });
  } catch (e) { fail(res, e); }
});
inventory.post("/groups", async (req, res) => {
  const name = strKeep((req.body || {}).name, 100);
  if (!name) return bad(res, "نام گروه لازم است.");
  try {
    const [r] = await pool.query("INSERT INTO product_groups (name, deduction_code) VALUES (?,?)", [name, str((req.body || {}).deductionCode, 30)]);
    res.json({ ok: true, id: r.insertId });
  } catch (e) { fail(res, e); }
});
inventory.put("/groups/:id", async (req, res) => {
  const b = req.body || {}, sets = [], vals = [];
  if (b.name !== undefined) { const n = strKeep(b.name, 100); if (!n) return bad(res, "نام گروه لازم است."); sets.push("name = ?"); vals.push(n); }
  if (b.deductionCode !== undefined) { sets.push("deduction_code = ?"); vals.push(str(b.deductionCode, 30)); }
  if (!sets.length) return bad(res, "چیزی برای ذخیره نیست.");
  try {
    const [r] = await pool.query(`UPDATE product_groups SET ${sets.join(", ")} WHERE id = ?`, [...vals, req.params.id]);
    if (!r.affectedRows) return bad(res, "گروه پیدا نشد.", 404);
    res.json({ ok: true });
  } catch (e) { fail(res, e); }
});
inventory.delete("/groups/:id", async (req, res) => {
  try {
    await pool.query("UPDATE products SET group_id = NULL WHERE group_id = ?", [req.params.id]);
    const [r] = await pool.query("DELETE FROM product_groups WHERE id = ?", [req.params.id]);
    if (!r.affectedRows) return bad(res, "گروه پیدا نشد.", 404);
    res.json({ ok: true });
  } catch (e) { fail(res, e); }
});

inventory.get("/products", async (req, res) => {
  const where = [], vals = [];
  if (!req.query.all) where.push("p.active = 1");
  const q = String(req.query.q || "").trim();
  if (q && normalizeSearch(q)) {
    where.push(`(${sqlNormExpr("p.name")} LIKE ? OR ${sqlNormExpr("p.code")} LIKE ?)`);
    const pat = likePattern(q); vals.push(pat, pat);
  }
  try {
    const [rows] = await pool.query(`${PROD_SELECT} ${where.length ? "WHERE " + where.join(" AND ") : ""}`, vals);
    rows.sort((a, b) => String(a.name).localeCompare(String(b.name), "fa"));
    res.json({ items: rows.map(prodJSON) });
  } catch (e) { fail(res, e); }
});
// ایجاد کالا (با موجودی اولیهٔ اختیاری که به‌صورت «ورود به انبار» ثبت می‌شود)
inventory.post("/products", async (req, res) => {
  const b = req.body || {};
  const name = strKeep(b.name, 150);
  if (!name) return bad(res, "نام کالا لازم است.");
  const pcode = str(b.code, 30);
  const codeErr = await prodCodeCheck(pool, pcode, 0);
  if (codeErr) return bad(res, codeErr);
  const qty = num(b.quantity), price = Math.round(num(b.unitPrice));
  if (qty < 0 || price < 0) return bad(res, "مقدار و قیمت نمی‌توانند منفی باشند.");
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [r] = await conn.query("INSERT INTO products (code, name, unit, quantity, unit_price, notes, group_id, default_installments) VALUES (?,?,?,?,?,?,?,?)",
      [pcode, name, strKeep(b.unit, 30) || "عدد", qty, price, strKeep(b.notes), grpId(b.groupId), defInst(b.defaultInstallments)]);
    if (qty > 0) {
      await conn.query("INSERT INTO stock_movements (product_id, kind, qty, unit_price, move_date, note) VALUES (?, 'in', ?, ?, ?, 'موجودی اولیه')",
        [r.insertId, qty, price, str(b.date, 10)]);
    }
    await conn.commit();
    res.json({ ok: true, id: r.insertId });
  } catch (e) { await conn.rollback(); fail(res, e); } finally { conn.release(); }
});
// ویرایش مشخصات (موجودی فقط با «ورود/اصلاح موجودی» تغییر می‌کند)
inventory.put("/products/:id", async (req, res) => {
  const b = req.body || {}, sets = [], vals = [];
  const put = (c, v) => { sets.push(`${c} = ?`); vals.push(v); };
  if (b.name !== undefined) { const n = strKeep(b.name, 150); if (!n) return bad(res, "نام کالا لازم است."); put("name", n); }
  if (b.code !== undefined) {
    const pcode = str(b.code, 30);
    try { const codeErr = await prodCodeCheck(pool, pcode, parseInt(req.params.id, 10) || 0); if (codeErr) return bad(res, codeErr); } catch (e) { return fail(res, e); }
    put("code", pcode);
  }
  if (b.unit !== undefined) put("unit", strKeep(b.unit, 30) || "عدد");
  if (b.unitPrice !== undefined) { const p = Math.round(num(b.unitPrice)); if (p < 0) return bad(res, "قیمت نامعتبر است."); put("unit_price", p); }
  if (b.notes !== undefined) put("notes", strKeep(b.notes));
  if (b.active !== undefined) put("active", b.active ? 1 : 0);
  if (b.groupId !== undefined) put("group_id", grpId(b.groupId));
  if (b.defaultInstallments !== undefined) put("default_installments", defInst(b.defaultInstallments));
  if (!sets.length) return bad(res, "چیزی برای ذخیره نیست.");
  try {
    const [r] = await pool.query(`UPDATE products SET ${sets.join(", ")} WHERE id = ?`, [...vals, req.params.id]);
    if (!r.affectedRows) return bad(res, "کالا پیدا نشد.", 404);
    res.json({ ok: true });
  } catch (e) { fail(res, e); }
});
// POST /api/inventory/products/:id/stock { qty, unitPrice?, date, note, mode: 'in' | 'set' }
inventory.post("/products/:id/stock", async (req, res) => {
  const b = req.body || {};
  const mode = b.mode === "set" ? "set" : "in";
  const qty = num(b.qty);
  if (mode === "in" && qty <= 0) return bad(res, "مقدار ورودی باید بیشتر از صفر باشد.");
  if (mode === "set" && qty < 0) return bad(res, "موجودی نمی‌تواند منفی باشد.");
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [[p]] = await conn.query("SELECT quantity FROM products WHERE id = ? FOR UPDATE", [req.params.id]);
    if (!p) { await conn.rollback(); return bad(res, "کالا پیدا نشد.", 404); }
    const cur = Number(p.quantity);
    const delta = mode === "in" ? qty : qty - cur;
    if (delta !== 0) {
      await conn.query("UPDATE products SET quantity = quantity + ? WHERE id = ?", [delta, req.params.id]);
      if (b.unitPrice) await conn.query("UPDATE products SET unit_price = ? WHERE id = ?", [Math.round(num(b.unitPrice)), req.params.id]);
      await conn.query("INSERT INTO stock_movements (product_id, kind, qty, unit_price, move_date, note) VALUES (?,?,?,?,?,?)",
        [req.params.id, mode === "in" ? "in" : "adjust", delta, Math.round(num(b.unitPrice)), str(b.date, 10), strKeep(b.note) || (mode === "set" ? "اصلاح موجودی" : "")]);
    }
    await conn.commit();
    res.json({ ok: true, quantity: cur + delta });
  } catch (e) { await conn.rollback(); fail(res, e); } finally { conn.release(); }
});
inventory.get("/products/:id/movements", async (req, res) => {
  try {
    const [rows] = await pool.query("SELECT * FROM stock_movements WHERE product_id = ?", [req.params.id]);
    rows.sort((a, b) => b.id - a.id);
    res.json({ items: rows.slice(0, 100).map((m) => ({ id: m.id, kind: m.kind, qty: Number(m.qty), unitPrice: Number(m.unit_price), date: m.move_date, note: m.note, refOrderId: m.ref_order_id })) });
  } catch (e) { fail(res, e); }
});

/* ---- درخواست کالا (فروش اقساطی به پرسنل) ---- */
// قسط ثبت‌شدهٔ درخواست مبنا است (تا با تغییر پارامتر گرد کردن، درخواست‌های قبلی تغییر نکنند)؛
// «قسط آخر» و تعداد اقساط مؤثر از روی جمع، پیش‌پرداخت و همان قسط حساب می‌شود.
const orderJSON = (o, items, person, status) => {
  const rem = Number(o.total) - Number(o.down_payment), stored = Number(o.installment_amount);
  const perItem = (items || []).length && (items || []).every((i) => i.installments != null && i.installment_amount != null);
  let pl;
  if (perItem) {
    // قسط هر کالا جداگانه محاسبه و ذخیره شده است؛ جمع ماهانه = مجموع قسط کالاها، و قسط آخر = پرداخت ماه آخر
    const nMax = Math.max(...items.map((i) => Number(i.installments)));
    const lastSum = items.filter((i) => Number(i.installments) === nMax).reduce((sm, i) => sm + Number(i.last_installment_amount == null ? i.installment_amount : i.last_installment_amount), 0);
    pl = { inst: items.reduce((sm, i) => sm + Number(i.installment_amount), 0), n: nMax, last: lastSum };
  } else {
    pl = stored > 0
      ? { inst: stored, n: Math.max(1, Math.min(o.installments, Math.ceil(Math.max(0, rem) / stored))), last: lastOf(Math.max(0, rem), stored, o.installments) }
      : planInst(rem, o.installments);
  }
  const name = [person.first_name, person.last_name].filter(Boolean).join(" ");
  return {
    id: o.id, number: o.order_number, code: o.code, name: name || "", firstName: person.first_name || "", lastName: person.last_name || "",
    nationalId: person.national_id || "", personStatus: status || "", date: o.order_date,
    total: Number(o.total), downPayment: Number(o.down_payment), installments: pl.n,
    installmentAmount: pl.inst, lastInstallmentAmount: pl.last, perItemInstallments: !!perItem, status: o.status, notes: o.notes,
    items: (items || []).map((i) => ({
      productId: i.product_id, code: i.product_code || "", groupName: i.group_name || "", deductionCode: i.deduction_code || "", name: i.product_name, unit: i.unit,
      qty: Number(i.qty), unitPrice: Number(i.unit_price),
      installments: i.installments == null ? null : Number(i.installments),
      installmentAmount: i.installment_amount == null ? null : Number(i.installment_amount),
      lastInstallmentAmount: i.last_installment_amount == null ? null : Number(i.last_installment_amount),
      downShare: i.down_share == null ? null : Number(i.down_share),
    })),
  };
};
async function loadOrders(where, vals, limit = 100, offset = 0) {
  const [top] = await pool.query(
    `SELECT o.*, p.first_name, p.last_name, p.national_id, p.status AS person_status FROM goods_orders o LEFT JOIN personnel p ON p.code = o.code ${where} ORDER BY o.id DESC LIMIT ? OFFSET ?`, [...vals, limit, offset]);
  let items = [];
  if (top.length) {
    const [it] = await pool.query(`SELECT i.*, pr.code AS product_code, g.deduction_code, g.name AS group_name FROM goods_order_items i LEFT JOIN products pr ON pr.id = i.product_id LEFT JOIN product_groups g ON g.id = pr.group_id WHERE i.order_id IN (${top.map(() => "?").join(",")}) ORDER BY i.id`, top.map((o) => o.id));
    items = it;
  }
  return top.map((o) => orderJSON(o, items.filter((i) => i.order_id === o.id), o, o.person_status));
}
inventory.get("/orders/by-person/:code", async (req, res) => {
  try { res.json({ items: await loadOrders("WHERE o.code = ?", [req.params.code]) }); } catch (e) { fail(res, e); }
});
// GET /api/inventory/orders?from=&to=&status=active|cancelled|all  (فیلتر بین دو تاریخ)
inventory.get("/orders", async (req, res) => {
  const where = [], vals = [];
  const from = String(req.query.from || "").trim(), to = String(req.query.to || "").trim();
  if (from) { if (!DATE_RE.test(from)) return bad(res, "تاریخ شروع نامعتبر است."); where.push("o.order_date >= ?"); vals.push(from); }
  if (to) { if (!DATE_RE.test(to)) return bad(res, "تاریخ پایان نامعتبر است."); where.push("o.order_date <= ?"); vals.push(to); }
  const st = String(req.query.status || "active");
  if (st !== "all") { where.push("o.status = ?"); vals.push(st); }
  // صفحه‌بندی سمت سرور. mode=agg (تجمیعی): جمع‌بندی هر فرد با GROUP BY در خود SQL انجام می‌شود تا ردیف‌های یک فرد
  // بین دو صفحه تقسیم نشود و جمع‌ها همیشه درست باشد؛ mode=detail: هر درخواست یک ردیف. جمع‌های کل روی کل نتیجهٔ فیلترشده‌اند.
  try {
    const W = where.length ? "WHERE " + where.join(" AND ") : "";
    const pg = pageParams(req.query), [lim, limVals] = limitSql(pg);
    if (String(req.query.mode) === "agg") {
      // تجمیعی: جمع هر فرد به تفکیک «گروه کالا» (و کد کسر همان گروه)؛ هر (فرد، گروه) یک ردیف.
      // مبلغ هر ردیف = تعداد × قیمت؛ قسط ماهانهٔ هر ردیف همان قسط ذخیره‌شدهٔ کالاست (درخواست‌های قدیمی که قسط کالا ندارند: قسط درخواست به نسبت مبلغ بین اقلام پخش می‌شود).
      // گروه‌بندی و صفحه‌بندی در Node انجام می‌شود تا ردیف‌های یک فرد/گروه بین دو صفحه تقسیم نشود.
      const [its] = await pool.query(
        `SELECT o.id AS oid, o.code, o.installment_amount AS o_inst, p.first_name, p.last_name, p.national_id, i.qty, i.unit_price, i.installment_amount AS i_inst,
                g.id AS gid, g.name AS gname, g.deduction_code
           FROM goods_orders o JOIN goods_order_items i ON i.order_id = o.id
           LEFT JOIN products pr ON pr.id = i.product_id LEFT JOIN product_groups g ON g.id = pr.group_id
           LEFT JOIN personnel p ON p.code = o.code ${W} ORDER BY o.id, i.id`, vals);
      const raw = new Map();
      for (const r of its) raw.set(r.oid, (raw.get(r.oid) || 0) + Number(r.qty) * Number(r.unit_price));
      const groups = new Map(), orders = new Set(), persons = new Set();
      const sums = { total: 0, inst: 0, count: 0, persons: 0 };
      for (const r of its) {
        const amount = Math.round(Number(r.qty) * Number(r.unit_price)), rw = raw.get(r.oid) || 0;
        const inst = r.i_inst != null ? Number(r.i_inst) : (rw > 0 ? Math.round(Number(r.o_inst) * (Number(r.qty) * Number(r.unit_price)) / rw) : 0);
        const key = r.code + "\u0001" + (r.gid || 0);
        let g = groups.get(key);
        if (!g) { g = { code: r.code, nationalId: r.national_id || "", firstName: r.first_name || "", lastName: r.last_name || "", name: [r.first_name, r.last_name].filter(Boolean).join(" "), groupId: r.gid || null, groupName: r.gname || "", deductionCode: r.deduction_code || "", orders: new Set(), total: 0, inst: 0 }; groups.set(key, g); }
        g.orders.add(r.oid); g.total += amount; g.inst += inst;
        orders.add(r.oid); persons.add(r.code); sums.total += amount; sums.inst += inst;
      }
      sums.count = orders.size; sums.persons = persons.size;
      const all = [...groups.values()].sort((a, b) => (Number(a.code) || 0) - (Number(b.code) || 0) || String(a.code).localeCompare(String(b.code)) || String(a.groupName).localeCompare(String(b.groupName), "fa"));
      const slice = pg.all ? all : all.slice(pg.offset, pg.offset + pg.size);
      return res.json({ mode: "agg", rows: slice.map((g) => ({ code: g.code, nationalId: g.nationalId, firstName: g.firstName, lastName: g.lastName, name: g.name, groupId: g.groupId, groupName: g.groupName, deductionCode: g.deductionCode, count: g.orders.size, total: g.total, inst: g.inst })), ...pageMeta(pg, all.length), sums });
    }
    const [[t]] = await pool.query(`SELECT COUNT(*) AS c, COALESCE(SUM(o.total),0) AS total FROM goods_orders o ${W}`, vals);
    const items = await loadOrders(W, vals, pg.all ? 20000 : pg.size, pg.all ? 0 : pg.offset);
    res.json({ mode: "detail", items, ...pageMeta(pg, Number(t.c)), sums: { total: Number(t.total) } });
  } catch (e) { fail(res, e); }
});
// خواندن و اعتبارسنجی ردیف‌های کالا (با قفل موجودی) — مشترک بین ثبت و ویرایش
async function buildLines(conn, items, fallbackN = 1) {
  const lines = [];
  let total = 0;
  for (const it of items) {
    const qty = num(it.qty), price = Math.round(num(it.unitPrice));
    if (qty <= 0 || price < 0) throw new Error("تعداد و قیمت هر ردیف باید معتبر باشد.");
    const [[prod]] = await conn.query("SELECT * FROM products WHERE id = ? AND active = 1 FOR UPDATE", [it.productId]);
    if (!prod) throw new Error("یکی از کالاها پیدا نشد یا غیرفعال است.");
    if (Number(prod.quantity) < qty) throw new Error(`موجودی «${prod.name}» کافی نیست (موجود: ${Number(prod.quantity)} ${prod.unit}).`);
    // اگر یک کالا چند بار در فهرست آمده، جمع تعدادها هم باید در موجودی بگنجد
    const already = lines.filter((l) => l.prod.id === prod.id).reduce((s, l) => s + l.qty, 0);
    if (Number(prod.quantity) < already + qty) throw new Error(`موجودی «${prod.name}» کافی نیست (موجود: ${Number(prod.quantity)} ${prod.unit}).`);
    // تعداد اقساط هر کالا: مقدار ارسالی ردیف، وگرنه پیش‌فرض تعریف کالا، وگرنه مقدار کلی درخواست
    const n = Math.max(1, Math.min(60, parseInt(num(it.installments), 10) || Number(prod.default_installments) || fallbackN || 1));
    lines.push({ prod, qty, price, n });
    total += qty * price;
  }
  return { lines, total: Math.round(total) };
}
// قسط هر کالا جداگانه: جمع کل (رند‌شده) و پیش‌پرداخت به نسبت مبلغ هر ردیف بین ردیف‌ها تقسیم می‌شود
// (آخرین ردیف باقی‌ماندهٔ تقسیم را می‌گیرد تا جمع‌ها دقیق بماند)، سپس هر ردیف با تعداد اقساط خودش تقسیط می‌شود.
function planLines(lines, total, down, step) {
  const raws = lines.map((l) => l.qty * l.price), sumRaw = raws.reduce((a, b) => a + b, 0) || 1;
  let usedT = 0, usedD = 0;
  lines.forEach((l, i) => {
    const last = i === lines.length - 1;
    l.share = last ? total - usedT : Math.round((total * raws[i]) / sumRaw);
    l.downShare = last ? down - usedD : Math.round((down * raws[i]) / sumRaw);
    usedT += l.share; usedD += l.downShare;
    const pl = planInst(Math.max(0, l.share - l.downShare), l.n, step);
    l.plan = pl;
  });
  const nMax = Math.max(1, ...lines.map((l) => l.plan.n));
  const inst = lines.reduce((sm, l) => sm + l.plan.inst, 0);
  const last = lines.filter((l) => l.plan.n === nMax).reduce((sm, l) => sm + l.plan.last, 0);
  return { n: nMax, inst, last };
}
async function writeLines(conn, orderId, number, date, lines) {
  for (const l of lines) {
    await conn.query("INSERT INTO goods_order_items (order_id, product_id, product_name, unit, qty, unit_price, installments, installment_amount, last_installment_amount, down_share) VALUES (?,?,?,?,?,?,?,?,?,?)",
      [orderId, l.prod.id, l.prod.name, l.prod.unit, l.qty, l.price, l.plan ? l.plan.n : null, l.plan ? l.plan.inst : null, l.plan ? l.plan.last : null, l.plan ? l.downShare : null]);
    await conn.query("UPDATE products SET quantity = quantity - ? WHERE id = ?", [l.qty, l.prod.id]);
    await conn.query("INSERT INTO stock_movements (product_id, kind, qty, unit_price, ref_order_id, move_date, note) VALUES (?, 'out', ?, ?, ?, ?, ?)",
      [l.prod.id, l.qty, l.price, orderId, date, "فروش اقساطی — درخواست " + number]);
  }
}
function orderInput(b) {
  const date = str(b.date, 10);
  const items = Array.isArray(b.items) ? b.items : [];
  if (!DATE_RE.test(date)) throw new Error("تاریخ را به‌صورت ۱۴۰۵/۰۷/۰۷ وارد کنید.");
  if (!items.length) throw new Error("حداقل یک کالا لازم است.");
  return { date, items, installments: Math.max(1, Math.min(60, parseInt(num(b.installments), 10) || 1)), down: Math.max(0, Math.round(num(b.downPayment))), notes: strKeep(b.notes) };
}
// POST /api/inventory/orders { code, date, items:[{productId, qty, unitPrice}], downPayment, installments, notes }
inventory.post("/orders", async (req, res) => {
  const b = req.body || {};
  const code = str(b.code);
  if (!code) return bad(res, "کد پرسنلی لازم است.");
  let inp;
  try { inp = orderInput(b); } catch (e) { return bad(res, userMsg(e)); }
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [p] = await conn.query("SELECT code FROM personnel WHERE code = ?", [code]);
    if (!p.length) { await conn.rollback(); return bad(res, "این کد پرسنلی در کارگزینی نیست.", 404); }
    { const hb = await heirBlock(conn, code); if (hb) { await conn.rollback(); return bad(res, hb, 409); } }
    const rd = await loadRounding(conn);
    const built = await buildLines(conn, inp.items, inp.installments);
    const lines = built.lines, total = ceilStep(built.total, rd.roundGoods);   // رند جمع کل طبق تنظیمات
    if (inp.down > total) { await conn.rollback(); return bad(res, "پیش‌پرداخت نمی‌تواند از جمع کل بیشتر باشد."); }
    const pl = planLines(lines, total, inp.down, rd.roundGoodsInst), instAmt = pl.inst;
    const number = await nextNumber(conn, "goods_orders", "order_number", inp.date);
    const [o] = await conn.query(
      "INSERT INTO goods_orders (order_number, code, order_date, total, down_payment, installments, installment_amount, notes) VALUES (?,?,?,?,?,?,?,?)",
      [number, code, inp.date, total, inp.down, pl.n, instAmt, inp.notes]);
    await writeLines(conn, o.insertId, number, inp.date, lines);
    await conn.commit();
    res.json({ ok: true, id: o.insertId, number, total, installments: pl.n, installmentAmount: instAmt, lastInstallmentAmount: pl.last });
  } catch (e) { await conn.rollback(); if (isBusinessError(e)) bad(res, e.message); else sendError(res, e); } finally { conn.release(); }
});
// PUT /api/inventory/orders/:id  -> ویرایش درخواست (کالاها، تاریخ، پیش‌پرداخت، اقساط، توضیحات)
// موجودی کالاهای قبلی به انبار برمی‌گردد و ردیف‌های جدید دوباره کسر می‌شوند؛ همه در یک تراکنش.
inventory.put("/orders/:id", async (req, res) => {
  let inp;
  try { inp = orderInput(req.body || {}); } catch (e) { return bad(res, userMsg(e)); }
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [[o]] = await conn.query("SELECT * FROM goods_orders WHERE id = ? FOR UPDATE", [req.params.id]);
    if (!o) { await conn.rollback(); return bad(res, "درخواست پیدا نشد.", 404); }
    if (o.status !== "active") { await conn.rollback(); return bad(res, "درخواست لغوشده قابل ویرایش نیست."); }
    const [old] = await conn.query("SELECT * FROM goods_order_items WHERE order_id = ?", [o.id]);
    for (const i of old) {
      await conn.query("UPDATE products SET quantity = quantity + ? WHERE id = ?", [i.qty, i.product_id]);
      await conn.query("INSERT INTO stock_movements (product_id, kind, qty, unit_price, ref_order_id, move_date, note) VALUES (?, 'in', ?, ?, ?, ?, ?)",
        [i.product_id, i.qty, i.unit_price, o.id, inp.date, "برگشت به انبار — ویرایش درخواست " + o.order_number]);
    }
    await conn.query("DELETE FROM goods_order_items WHERE order_id = ?", [o.id]);
    const rd = await loadRounding(conn);
    const built = await buildLines(conn, inp.items, inp.installments);
    const lines = built.lines, total = ceilStep(built.total, rd.roundGoods);
    if (inp.down > total) throw new Error("پیش‌پرداخت نمی‌تواند از جمع کل بیشتر باشد.");
    const pl = planLines(lines, total, inp.down, rd.roundGoodsInst), instAmt = pl.inst;
    await conn.query("UPDATE goods_orders SET order_date = ?, total = ?, down_payment = ?, installments = ?, installment_amount = ?, notes = ? WHERE id = ?",
      [inp.date, total, inp.down, pl.n, instAmt, inp.notes, o.id]);
    await writeLines(conn, o.id, o.order_number, inp.date, lines);
    await conn.commit();
    res.json({ ok: true, id: o.id, number: o.order_number, total, installments: pl.n, installmentAmount: instAmt, lastInstallmentAmount: pl.last });
  } catch (e) { await conn.rollback(); if (isBusinessError(e)) bad(res, e.message); else sendError(res, e); } finally { conn.release(); }
});
// لغو درخواست: موجودی کالاها به انبار برمی‌گردد
// DELETE /api/inventory/orders/:id -> حذف کامل درخواست (اگر فعال باشد کالاها به انبار برمی‌گردد)
inventory.delete("/orders/:id", async (req, res) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [[o]] = await conn.query("SELECT * FROM goods_orders WHERE id = ? FOR UPDATE", [req.params.id]);
    if (!o) { await conn.rollback(); return bad(res, "درخواست پیدا نشد.", 404); }
    const [items] = await conn.query("SELECT * FROM goods_order_items WHERE order_id = ?", [o.id]);
    if (o.status === "active") {
      for (const i of items) {
        await conn.query("UPDATE products SET quantity = quantity + ? WHERE id = ?", [i.qty, i.product_id]);
        await conn.query("INSERT INTO stock_movements (product_id, kind, qty, unit_price, ref_order_id, move_date, note) VALUES (?, 'in', ?, ?, NULL, ?, ?)",
          [i.product_id, i.qty, i.unit_price, o.order_date, "برگشت به انبار — حذف درخواست " + o.order_number]);
      }
    }
    await conn.query("UPDATE stock_movements SET ref_order_id = NULL WHERE ref_order_id = ?", [o.id]);
    await conn.query("DELETE FROM goods_order_items WHERE order_id = ?", [o.id]);
    await conn.query("DELETE FROM goods_orders WHERE id = ?", [o.id]);
    await conn.commit();
    res.json({ ok: true });
  } catch (e) { await conn.rollback(); fail(res, e); } finally { conn.release(); }
});
inventory.put("/orders/:id/cancel", async (req, res) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [[o]] = await conn.query("SELECT * FROM goods_orders WHERE id = ? FOR UPDATE", [req.params.id]);
    if (!o) { await conn.rollback(); return bad(res, "درخواست پیدا نشد.", 404); }
    if (o.status !== "active") { await conn.rollback(); return bad(res, "این درخواست قبلاً لغو شده است."); }
    const [items] = await conn.query("SELECT * FROM goods_order_items WHERE order_id = ?", [o.id]);
    for (const i of items) {
      await conn.query("UPDATE products SET quantity = quantity + ? WHERE id = ?", [i.qty, i.product_id]);
      await conn.query("INSERT INTO stock_movements (product_id, kind, qty, unit_price, ref_order_id, move_date, note) VALUES (?, 'in', ?, ?, ?, ?, ?)",
        [i.product_id, i.qty, i.unit_price, o.id, o.order_date, "برگشت به انبار — لغو درخواست " + o.order_number]);
    }
    await conn.query("UPDATE goods_orders SET status = 'cancelled' WHERE id = ?", [o.id]);
    await conn.commit();
    res.json({ ok: true });
  } catch (e) { await conn.rollback(); fail(res, e); } finally { conn.release(); }
});

/* ---------------------- پارامترهای فرمول وام ---------------------- */
// وام = (سرمایهٔ اولیه + مدت انتظار × سهم صندوق) × ۳ ، رند به بالا تا ۷ رقم، و حداکثر «حداکثر وام»

module.exports = inventory;
