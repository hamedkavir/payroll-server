// تست «وام وفاق» (/api/vefagh) و «فیش‌های یک فرد بین دو دوره» (GET /api/periods/person-slips) فقط با دیتابیس و ماژول‌های ساختگی
const assert = require("assert");
const path = require("path");
const H = require("./helpers");

const saved = new Map();
const stub = (rel, exports) => { const f = require.resolve(path.join(H.SRV, rel)); if (!saved.has(f)) saved.set(f, require.cache[f]); require.cache[f] = { id: f, filename: f, loaded: true, exports }; };
const unstub = () => { for (const [f, old] of saved) { if (old) require.cache[f] = old; else delete require.cache[f]; } saved.clear(); };
const mkCtx = (created) => ({ closings: [{ year: 1405, month: 7, closeDate: "1405/08/05" }], periods: [{ year: 1405, month: 7, created }], lastPeriod: { year: 1405, month: 7 }, fundShare: 6000000 });
const state = { rows: [], changes: [], nextId: 1, cid: 100, keyCodes: { vcapital: "801", vloan: "802" }, payroll: null, heir: null, ctx: mkCtx("1405/08/06") };
const resetState = () => { Object.assign(state, { rows: [], changes: [], nextId: 1, cid: 100, keyCodes: { vcapital: "801", vloan: "802" }, heir: null, ctx: mkCtx("1405/08/06") }); state.payroll = { kind: "active", year: 1405, month: 7, loans: [{ code: "802", v: 1000, remaining: 5000 }], data: { dedBase: [{ code: "801", v: 600 }] } };
  state.payroll.loans.push({ code: "801", v: 600, remaining: 100000 }); };
const installStubs = () => {
  stub("personPayroll.js", { personPayroll: async () => (state.payroll ? [state.payroll] : []) });
  stub("keyCodes.js", { ...require(path.join(H.SRV, "keyCodes.js")), loadKeyCodes: async () => state.keyCodes });
  stub("monthlyChange.js", { insertChange: async (_c, o) => { const id = ++state.cid; state.changes.push({ id, closed: 0, ...o }); return id; } });
  const real = require(path.join(H.SRV, "routes/capitalIncrease.js"));   // phaseOf واقعی (فرمول الف/ب)
  stub("routes/capitalIncrease.js", { loadCtx: async () => state.ctx, phaseOf: real.phaseOf });
  stub("eligibility.js", { heirBlock: async () => state.heir, HEIR: {}, HEIR_MSG: "", CUT_MSG: "", isCutStatus: () => false, isHeirStatus: () => false, isHeirRecord: () => false });
};

const conn = {
  async beginTransaction() {}, async commit() {}, async rollback() {}, release() {},
  async query(sql, p) {
    sql = String(sql).replace(/\s+/g, " ").trim();
    if (/FROM personnel WHERE code/.test(sql)) return [[{ code: p[0] }]];
    if (/^SELECT v\.\*, m\.closed .* WHERE v\.id = \?/.test(sql)) { const r = state.rows.find((x) => x.id === +p[0]); return [[r ? { ...r, change_closed: 0 } : undefined].filter(Boolean)]; }
    if (/^SELECT v\.\*, m\.closed .* WHERE v\.code = \?/.test(sql)) return [state.rows.filter((x) => x.code === p[0]).map((x) => ({ ...x, change_closed: 0 }))];
    if (/FROM monthly_changes WHERE id IN/.test(sql)) return [[]];
    if (/FROM monthly_changes WHERE code = \? AND deduction_code/.test(sql)) return [state.changes.filter((c) => c.code === p[0] && c.dcode === p[1] && c.date === p[2] && c.action === 3 && !c.closed)];
    if (/^DELETE FROM monthly_changes/.test(sql)) { state.changes = state.changes.filter((c) => c.id !== +p[0]); return [{}]; }
    if (/FROM vefagh_ops WHERE code = \? AND kind IN/.test(sql)) return [state.rows.filter((x) => x.code === p[0] && [1, 3].includes(x.kind) && x.apply_ym > p[1] && x.id !== p[2])];
    if (/^INSERT INTO vefagh_ops/.test(sql)) {
      const four = /VALUES \(4,/.test(sql); let r;
      if (four) r = { kind: 4, pay_date: p[0], amount: p[1], slip_no: "", prev_capital: p[2], loan_remaining: p[3], new_capital: null, installment: null, apply_ym: p[4], change_id: p[5], change_id2: p[6], code: p[7], created_by: p[8] };
      else r = { kind: p[0], pay_date: p[1], amount: p[2], slip_no: p[3], prev_capital: p[4], loan_remaining: p[5], new_capital: p[6], installment: p[7], apply_ym: p[8], change_id: p[9], code: p[10], created_by: p[11] };
      r.id = state.nextId++; state.rows.push(r); return [{ insertId: r.id }];
    }
    if (/^UPDATE vefagh_ops SET/.test(sql)) { const r = state.rows.find((x) => x.id === +p[p.length - 1]); Object.assign(r, { kind: p[0], pay_date: p[1], amount: p[2], slip_no: p[3], prev_capital: p[4], loan_remaining: p[5], new_capital: p[6], installment: p[7], apply_ym: p[8], change_id: p[9], change_id2: null }); return [{}]; }
    if (/^DELETE FROM vefagh_ops/.test(sql)) { state.rows = state.rows.filter((x) => x.id !== +p[0]); return [{}]; }
    throw new Error("SQL ناشناخته در تست: " + sql);
  },
};
const handler = (key) => { const before = H.routers.length; installStubs(); try { H.load("routes/vefagh.js"); } finally { unstub(); } return H.routers.slice(before).find((r) => r.handlers["POST /cancel/:code"]).handlers[key]; };   // روتر وفاق (نه روتر افزایش سرمایه که وابستگی آن است)
const call = (key, req) => { H.setPool({ query: conn.query, async getConnection() { return conn; } }); return H.run(handler(key), req); };
const body = (o) => Object.assign({ code: "55", kind: 1, date: "1405/08/10", amount: "1,000,000", slipNo: "7001" }, o);

exports["وام وفاق: افزایش سرمایه = سرمایهٔ فعلی + مبلغ، ردیف «اصلاح» با کد سرمایهٔ وفاق"] = async () => {
  resetState();
  const r = await call("POST /", { body: body({}) });
  assert.strictEqual(r.status, 200, JSON.stringify(r.body));
  assert.strictEqual(r.body.prevCapital, 100000); assert.strictEqual(r.body.newCapital, 1100000);
  const c = state.changes[0]; assert.strictEqual(c.dcode, "801"); assert.strictEqual(c.action, 2); assert.strictEqual(c.total, 1100000); assert.strictEqual(c.inst, 600);
};
exports["وام وفاق: افزایش سرمایهٔ دوم پیش از آمدن فیش از سرمایهٔ جدیدِ اولی ادامه می‌دهد"] = async () => {
  resetState();
  await call("POST /", { body: body({ amount: "1000000" }) });
  const r = await call("POST /", { body: body({ amount: "500000", slipNo: "7002", date: "1405/08/12" }) });
  assert.strictEqual(r.body.prevCapital, 1100000); assert.strictEqual(r.body.newCapital, 1600000);
};
exports["وام وفاق: عضویت (ایجاد با قسط) و تسویه وام (حذف کد وام وفاق)"] = async () => {
  resetState();
  let r = await call("POST /", { body: body({ kind: 3, amount: "2000000", installment: "300000" }) });
  assert.strictEqual(r.status, 200); const c = state.changes[0];
  assert.strictEqual(c.action, 1); assert.strictEqual(c.dcode, "801"); assert.strictEqual(c.total, 2000000); assert.strictEqual(c.inst, 300000);
  r = await call("POST /", { body: body({ kind: 2, amount: "5000", slipNo: "7003" }) });
  assert.strictEqual(r.status, 200); const d = state.changes[1]; assert.strictEqual(d.action, 3); assert.strictEqual(d.dcode, "802");
};
exports["وام وفاق: بدون تعریف کد، ثبت رد می‌شود (۴۰۹) و ردیفی ساخته نمی‌شود"] = async () => {
  resetState(); state.keyCodes = {};
  const r = await call("POST /", { body: body({}) });
  assert.strictEqual(r.status, 409); assert.ok(/تعریف نشده/.test(r.body.message)); assert.strictEqual(state.rows.length, 0); assert.strictEqual(state.changes.length, 0);
};
exports["وام وفاق: افزایش سرمایه برای کسی که کد سرمایه ندارد رد می‌شود؛ ورودی نامعتبر ۴۰۰"] = async () => {
  resetState(); state.payroll = { kind: "active", year: 1405, month: 7, loans: [], data: { dedBase: [] } };
  let r = await call("POST /", { body: body({}) }); assert.strictEqual(r.status, 409);
  for (const o of [{ amount: "0" }, { date: "x" }, { slipNo: "" }, { kind: 9 }]) { r = await call("POST /", { body: body(o) }); assert.strictEqual(r.status, 400, JSON.stringify(o)); }
};
exports["وام وفاق: لغو عضویت دو ردیف «حذف» می‌سازد و مبلغ قابل پرداخت = سرمایه − مانده وام؛ تکراری نمی‌شود"] = async () => {
  resetState();
  let r = await call("POST /cancel/:code", { params: { code: "55" }, body: { date: "1405/08/20", capital: "5000000", loanRemaining: "1200000" } });
  assert.strictEqual(r.status, 200, JSON.stringify(r.body)); assert.strictEqual(r.body.payable, 3800000); assert.strictEqual(r.body.changeRows, 2);
  assert.deepStrictEqual(state.changes.map((c) => [c.dcode, c.action]), [["802", 3], ["801", 3]]);
  r = await call("POST /cancel/:code", { params: { code: "55" }, body: { date: "1405/08/20", capital: "5000000", loanRemaining: "9000000" } });
  assert.strictEqual(r.body.payable, 0); assert.strictEqual(r.body.changeRows, 0);   // بیشتر از سرمایه: صفر؛ ردیف تکراری ساخته نشد
  const g = await call("GET /by-person/:code", { params: { code: "55" } });
  assert.strictEqual(g.body.cancelDate, "1405/08/20"); assert.strictEqual(g.body.items[0].kindText, "لغو عضویت");
};
exports["وام وفاق: حذف ردیف، ردیف تغییرات ماهانه را هم برمی‌دارد؛ ردیف لغو عضویت ویرایش‌پذیر نیست"] = async () => {
  resetState();
  const r = await call("POST /", { body: body({}) });
  assert.strictEqual(state.changes.length, 1);
  const d = await call("DELETE /:id", { params: { id: String(r.body.id) } });
  assert.strictEqual(d.status, 200); assert.strictEqual(state.rows.length, 0); assert.strictEqual(state.changes.length, 0);
  await call("POST /cancel/:code", { params: { code: "55" }, body: { date: "1405/08/20", capital: "10", loanRemaining: "0" } });
  const p = await call("PATCH /:id", { params: { id: String(state.rows[0].id) }, body: body({}) });
  assert.strictEqual(p.status, 409);
};
exports["وام وفاق: وراث (heirBlock) ثبت را رد می‌کند"] = async () => {
  resetState(); state.heir = "وظیفه‌بگیر است.";
  const r = await call("POST /", { body: body({}) }); assert.strictEqual(r.status, 409); assert.strictEqual(state.rows.length, 0);
};

// ---- فیش‌های یک فرد بین دو دوره
const periodsHandler = () => { const before = H.routers.length; H.load("routes/periods.js"); const r = H.routers.slice(before).find((x) => x.handlers["GET /person-slips"]); return r.handlers["GET /person-slips"]; };
const psPool = () => ({ async query(sql, p) {
  sql = String(sql).replace(/\s+/g, " ");
  if (/FROM periods WHERE/.test(sql)) { const [a, b] = p; return [[{ id: 1, year: 1405, month: 5, issue_date: "1405/05/30", loans_data: null }, { id: 2, year: 1405, month: 6, issue_date: "", loans_data: { "55": [{ code: "710", v: 9 }] } }, { id: 3, year: 1405, month: 7, issue_date: "1405/07/30", loans_data: {} }].filter((x) => { const i = x.year * 12 + x.month - 1; return i >= a && i <= b; })]; }
  if (/FROM people WHERE period_id/.test(sql)) { if (p[0] === 3) return [[]]; return [[{ id: p[0] * 10, kind: p[0] === 1 ? "retiree" : "active", code: p[1], name: "علی", data: { info: { code: p[1] } } }]]; }
  throw new Error("SQL ناشناخته: " + sql); } });
exports["فیش‌های بین دو دوره: فقط دوره‌هایی که فرد فیش دارد، به‌ترتیب؛ قسط همان دوره و نوع فرد"] = async () => {
  H.setPool(psPool());
  const r = await H.run(periodsHandler(), { query: { code: "۵۵", fy: "1405", fm: "5", ty: "1405", tm: "7" } });
  assert.strictEqual(r.status, 200, JSON.stringify(r.body));
  assert.deepStrictEqual(r.body.items.map((x) => x.period.month), [5, 6]);        // دورهٔ ۷ فیش ندارد
  assert.strictEqual(r.body.items[0].person.kind, "retiree"); assert.deepStrictEqual(r.body.items[0].loans, []);
  assert.strictEqual(r.body.items[1].loans[0].code, "710"); assert.strictEqual(r.body.items[1].period.issueDate, "");
};
exports["فیش‌های بین دو دوره: ورودی نامعتبر ۴۰۰ و سقف ۳۶ ماه"] = async () => {
  H.setPool(psPool());
  for (const q of [{ code: "", fy: "1405", fm: "5", ty: "1405", tm: "6" }, { code: "5", fy: "1405", fm: "9", ty: "1405", tm: "6" }, { code: "5", fy: "1405", fm: "13", ty: "1405", tm: "6" }, { code: "5", fy: "1400", fm: "1", ty: "1405", tm: "12" }]) {
    const r = await H.run(periodsHandler(), { query: q }); assert.strictEqual(r.status, 400, JSON.stringify(q));
  }
};

exports["وام وفاق: فرد بازنشسته با کدهای وفاقِ بازنشستگان (جدا از شاغلین) کار می‌کند؛ کد خالی ← کد شاغلین"] = async () => {
  resetState(); state.keyCodes = { vcapital: "801", vloan: "802", rvcapital: "705", rvloan: "706" };
  state.payroll = { kind: "retiree", year: 1405, month: 7, loans: [], data: { items: [{ code: "705", v: -400, remaining: 90000 }, { code: "801", v: -111, remaining: 5 }] } };
  let r = await call("POST /", { body: body({}) });
  assert.strictEqual(r.status, 200, JSON.stringify(r.body)); assert.strictEqual(r.body.prevCapital, 90000);        // مانده کد ۷۰۵ (نه ۸۰۱)
  assert.strictEqual(state.changes[0].dcode, "705"); assert.strictEqual(state.changes[0].inst, 400);
  r = await call("POST /", { body: body({ kind: 2, slipNo: "7009" }) }); assert.strictEqual(state.changes[1].dcode, "706");
  r = await call("POST /cancel/:code", { params: { code: "55" }, body: { date: "1405/08/20", capital: "100", loanRemaining: "40" } });
  assert.deepStrictEqual(state.changes.slice(-2).map((c) => c.dcode), ["706", "705"]);
  // کد وفاقِ بازنشستگان خالی ← کد شاغلین
  resetState(); state.keyCodes = { vcapital: "801", vloan: "802" };
  state.payroll = { kind: "retiree", year: 1405, month: 7, loans: [], data: { items: [{ code: "801", v: -400, remaining: 70000 }] } };
  r = await call("POST /", { body: body({}) }); assert.strictEqual(r.body.prevCapital, 70000); assert.strictEqual(state.changes[0].dcode, "801");
};

exports["وام وفاق: فرمول بازهٔ «الف» (بعد از بستن حقوق، قبل از ساخت دوره) سهم صندوق را اضافه می‌کند؛ «ب» اضافه نمی‌کند"] = async () => {
  resetState(); state.ctx = mkCtx("1405/08/09");                                    // دورهٔ مهر ۱۴۰۵ در ۱۴۰۵/۰۸/۰۹ ساخته شده
  let r = await call("POST /", { body: body({ date: "1405/08/06", amount: "1000000" }) });             // بعد از بستن (۰۸/۰۵) و قبل از ساخت دوره ← الف
  assert.strictEqual(r.status, 200, JSON.stringify(r.body)); assert.strictEqual(r.body.phase, "A"); assert.strictEqual(r.body.fundShare, 600);                      // سهم صندوق = قسط کد ۸۰۱ در آخرین فیش (نه تنظیمات)
  assert.strictEqual(r.body.newCapital, 100000 + 1000000 + 600); assert.strictEqual(state.changes[0].total, 1100600);
  assert.strictEqual(state.rows[0].apply_ym, 1405 * 12 + 7 + 1);
  resetState(); state.ctx = mkCtx("1405/08/09");
  r = await call("POST /", { body: body({ date: "1405/08/10", amount: "1000000" }) });                 // بعد از ساخت دوره ← ب
  assert.strictEqual(r.body.phase, "B"); assert.strictEqual(r.body.fundShare, 0); assert.strictEqual(r.body.newCapital, 1100000);
};
exports["وام وفاق: افزایش دوم قبل از آمدن فیش، سهم صندوق را دوباره اضافه نمی‌کند و از سرمایهٔ جدیدِ اولی ادامه می‌دهد"] = async () => {
  resetState(); state.ctx = mkCtx("1405/08/09");
  await call("POST /", { body: body({ date: "1405/08/06", amount: "1000000" }) });                    // ۱٬۱۰۰٬۶۰۰
  const r = await call("POST /", { body: body({ date: "1405/08/07", amount: "500000", slipNo: "7002" }) });
  assert.strictEqual(r.body.prevCapital, 1100600); assert.strictEqual(r.body.fundShare, 0); assert.strictEqual(r.body.newCapital, 1600600);
  const g = await call("GET /by-person/:code", { params: { code: "55" } });
  assert.strictEqual(g.body.pending.newCapital, 1600600); assert.strictEqual(g.body.ctx.fundShare, 600); assert.strictEqual(g.body.ctx.shareSource, "slip");
};
exports["وام وفاق: قسط عضویت = سهم صندوق؛ اگر قسط دیگری وارد شود همان"] = async () => {
  resetState();
  state.payroll = null;                                                              // بدون فیش: سهم صندوق از تنظیمات
  await call("POST /", { body: body({ kind: 3, amount: "2000000" }) });
  assert.strictEqual(state.changes[0].inst, 6000000);
  await call("POST /", { body: body({ kind: 3, amount: "2000000", installment: "250000", slipNo: "7005" }) });
  assert.strictEqual(state.changes[1].inst, 250000);
};

exports["وام وفاق: سهم صندوق از قسط کد وفاقِ همان گروه در آخرین فیش (بازنشسته: کد بازنشستگان) خوانده می‌شود"] = async () => {
  resetState(); state.ctx = mkCtx("1405/08/09"); state.keyCodes = { vcapital: "773", rvcapital: "705" };
  state.payroll = { kind: "retiree", year: 1405, month: 7, loans: [], data: { items: [{ code: "705", v: -2500000, remaining: 90000 }, { code: "773", v: -999, remaining: 1 }] } };
  const r = await call("POST /", { body: body({ date: "1405/08/06", amount: "1000000" }) });
  assert.strictEqual(r.body.fundShare, 2500000); assert.strictEqual(r.body.newCapital, 90000 + 1000000 + 2500000);   // قسط کد ۷۰۵ نه ۷۷۳
  const g = await call("GET /by-person/:code", { params: { code: "55" } });
  assert.strictEqual(g.body.ctx.fundShare, 2500000); assert.strictEqual(g.body.ctx.shareSource, "slip");
  state.payroll = { kind: "retiree", year: 1405, month: 7, loans: [], data: { items: [{ code: "710", v: -1, remaining: 1 }] } };   // فرد کد وفاق در فیش ندارد
  const g2 = await call("GET /by-person/:code", { params: { code: "55" } });
  assert.strictEqual(g2.body.ctx.fundShare, 6000000); assert.strictEqual(g2.body.ctx.shareSource, "settings");
};
