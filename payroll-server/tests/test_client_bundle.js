// بستهٔ یکجای اسکریپت‌های کلاینت (server/clientBundle.js)
// بدون دیتابیس و بدون express: middleware با یک سرور واقعی http (و برای شاخهٔ req.path با req/res شبیه Express) آزموده می‌شود.
const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const http = require("http");
const vm = require("vm");

const SRV = path.join(__dirname, "..", "server");
const REAL_CLIENT = path.join(__dirname, "..", "client");
const CB = require(path.join(SRV, "clientBundle.js"));
const { clientBundle, buildBundle, rewriteHtml, readManifest, vlq } = CB;

// ---------- ابزار: پوشهٔ client ساختگی ----------
const tmpDirs = [];
function mkClient({ files, manifest, html } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "bundle-test-"));
  tmpDirs.push(dir);
  files = files || {
    "core/a.js": '"use strict";\n// سلام\nfunction alpha() { return 1; }\nvar shared = 1;\nglobalThis.order = [];\nglobalThis.order.push("a");\n',
    "core/b.js": '"use strict";\nfunction beta() { return alpha() + 1; }\nglobalThis.order.push("b");\n',
  };
  manifest = manifest || Object.keys(files);
  fs.mkdirSync(path.join(dir, "js"), { recursive: true });
  fs.writeFileSync(path.join(dir, "js", "manifest.json"), typeof manifest === "string" ? manifest : JSON.stringify(manifest));
  for (const [f, src] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(dir, "js", f)), { recursive: true });
    fs.writeFileSync(path.join(dir, "js", f), src);
  }
  const tags = Object.keys(files).map((f) => `<script src="./js/${f}?v=1"></script>`).join("\n");
  fs.writeFileSync(path.join(dir, "payslip-online.html"), html === undefined ? `<!doctype html><html><body><p>صفحه</p>\n${tags}\n</body></html>\n` : html);
  return dir;
}
function cleanup() { for (const d of tmpDirs.splice(0)) fs.rmSync(d, { recursive: true, force: true }); }
const write = (dir, rel, src) => fs.writeFileSync(path.join(dir, rel), src);
// تغییر محتوا با اندازهٔ متفاوت (کلید بازسازی = mtime + size)
const bump = (dir, rel, src) => { const f = path.join(dir, rel); fs.writeFileSync(f, src); const t = new Date(Date.now() + 5000); fs.utimesSync(f, t, t); };

const quietLog = () => { const L = { logs: [], warns: [] }; L.log = (...a) => L.logs.push(a.join(" ")); L.warn = (...a) => L.warns.push(a.join(" ")); return L; };

// ---------- ابزار: سرور واقعی http با middleware ----------
async function withServer(opts, fn) {
  const mw = clientBundle(opts);
  const server = http.createServer((req, res) => mw(req, res, () => { res.statusCode = 404; res.setHeader("X-Fallthrough", "1"); res.end("next"); }));
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const port = server.address().port;
  const req = (method, p) => new Promise((resolve, reject) => {
    const rq = http.request({ host: "127.0.0.1", port, method, path: p }, (res) => {
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => resolve({ status: res.statusCode, headers: res.headers, buf: Buffer.concat(chunks), body: Buffer.concat(chunks).toString("utf8") }));
    });
    rq.on("error", reject); rq.end();
  });
  try { return await fn({ get: (p) => req("GET", p), head: (p) => req("HEAD", p), post: (p) => req("POST", p) }); }
  finally { await new Promise((r) => server.close(r)); }
}
const isFallthrough = (r) => r.status === 404 && r.headers["x-fallthrough"] === "1";
const hashFromHtml = (html) => { const m = html.match(/<script src="\.\/js\/bundle\.js\?v=([0-9a-f]{12})"><\/script>/); assert.ok(m, "تگ بسته در HTML نیست"); return m[1]; };

// ---------- ابزار: رمزگشای source map (مستقل از vlq() خود برنامه) ----------
const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
function decodeVlq(s) {
  const out = []; let shift = 0, val = 0;
  for (const ch of s) {
    const d = B64.indexOf(ch); assert.ok(d >= 0, "نویسهٔ base64 نامعتبر");
    val += (d & 31) << shift;
    if (d & 32) shift += 5; else { out.push(val & 1 ? -(val >> 1) : val >> 1); shift = 0; val = 0; }
  }
  return out;
}
// هر خط تولیدشده یا بدون نگاشت است (سربرگ/جداکننده) یا دقیقاً به همان خط از فایل اصلی اشاره می‌کند
function assertMapFaithful(dir, b) {
  const sm = JSON.parse(b.map);
  const gen = b.code.split("\n");
  const segs = sm.mappings.split(";");
  assert.strictEqual(sm.version, 3);
  assert.deepStrictEqual(sm.sources, b.files);
  assert.ok(gen[gen.length - 1] === "", "کد باید با خط تازه تمام شود");
  const src = b.files.map((f) => fs.readFileSync(path.join(dir, "js", f), "utf8").replace(/^\ufeff/, "").replace(/\r\n?/g, "\n").split("\n"));
  let si = 0, ol = 0, mapped = 0;
  gen.slice(0, -1).forEach((line, i) => {
    const seg = segs[i] === undefined ? "" : segs[i];   // خط sourceMappingURL بعد از ساخت نگاشت اضافه می‌شود
    if (seg === "") {
      assert.ok(/^\/\* ==== js\/.+ ==== \*\/$/.test(line) || line === ";" || /^\/\/# sourceMappingURL=/.test(line), `خط ${i + 1} بدون نگاشت ولی محتوا دارد: ${line.slice(0, 40)}`);
      return;
    }
    const [col, ds, dl, oc] = decodeVlq(seg);
    assert.strictEqual(col, 0); assert.strictEqual(oc, 0);
    si += ds; ol += dl; mapped++;
    assert.strictEqual(line, src[si][ol], `خط ${i + 1} باید خط ${ol + 1} از ${b.files[si]} باشد`);
  });
  return mapped;
}

// =====================================================================  vlq
exports["clientBundle/vlq: کدگذاری Base64-VLQ مطابق مشخصات source map v3"] = async () => {
  const cases = [[0, "A"], [1, "C"], [-1, "D"], [2, "E"], [15, "e"], [16, "gB"], [-16, "hB"], [123, "2H"], [1000, "w+B"]];
  for (const [n, s] of cases) { assert.strictEqual(vlq(n), s, `vlq(${n})`); assert.deepStrictEqual(decodeVlq(s), [n], `decode(${s})`); }
};

// =====================================================================  readManifest
exports["clientBundle/readManifest: فهرست معتبر؛ نامعتبر، خالی و تکراری رد می‌شود"] = async () => {
  const ok = mkClient({ files: { "core/a.js": '"use strict";\n', "ui/b-c.js": '"use strict";\n' } });
  assert.deepStrictEqual(readManifest(ok), ["core/a.js", "ui/b-c.js"]);
  const bad = {
    "غیرآرایه": '{"a":1}', "خالی": "[]", "JSON خراب": "[1,", "عدد": "[1]",
    "مسیر بالا": '["../x.js"]', "بدون پوشه": '["a.js"]', "حرف بزرگ": '["core/A.js"]', "پسوند دیگر": '["core/a.css"]', "عمق دو": '["a/b/c.js"]',
  };
  for (const [name, m] of Object.entries(bad)) {
    const d = mkClient({ files: { "core/a.js": '"use strict";\n' }, manifest: m });
    assert.throws(() => readManifest(d), (e) => e instanceof Error, `باید رد شود: ${name}`);
    assert.throws(() => buildBundle(d), (e) => e instanceof Error, `buildBundle هم باید رد کند: ${name}`);
  }
  const dup = mkClient({ files: { "core/a.js": '"use strict";\n' }, manifest: ["core/a.js", "core/a.js"] });
  assert.throws(() => readManifest(dup), /تکراری/);
  const missing = mkClient({ files: { "core/a.js": '"use strict";\n' }, manifest: ["core/a.js", "core/zzz.js"] });
  assert.throws(() => buildBundle(missing), /ENOENT/);
  cleanup();
};

// =====================================================================  buildBundle
exports["clientBundle/buildBundle: ساختار خروجی، ترتیب فایل‌ها، پایان‌دهندهٔ sourceMappingURL و hash"] = async () => {
  const d = mkClient();
  const b = buildBundle(d);
  assert.deepStrictEqual(b.files, ["core/a.js", "core/b.js"]);
  assert.ok(/^[0-9a-f]{12}$/.test(b.hash));
  const heads = [...b.code.matchAll(/^\/\* ==== js\/(.+) ==== \*\/$/gm)].map((m) => m[1]);
  assert.deepStrictEqual(heads, b.files, "ترتیب فایل‌ها = ترتیب manifest");
  assert.ok(b.code.startsWith("/* ==== js/core/a.js ==== */\n\"use strict\";"), "بسته با \"use strict\" فایل اول شروع می‌شود");
  assert.ok(b.code.includes("\n;\n/* ==== js/core/b.js ==== */"), "بین فایل‌ها جداکنندهٔ ; هست");
  assert.ok(b.code.endsWith(`//# sourceMappingURL=bundle.js.map?v=${b.hash}\n`));
  assert.strictEqual(b.code.split("sourceMappingURL").length - 1, 1);
  assert.ok(b.code.includes("سلام"), "متن فارسی سالم می‌ماند");
  assert.strictEqual(JSON.parse(b.map).file, "bundle.js");
  cleanup();
};

exports["clientBundle/buildBundle: source map هر خط را دقیقاً به خط فایل اصلی می‌برد (بدون خط انتهایی و با CRLF/BOM)"] = async () => {
  const d = mkClient({ files: {
    "core/a.js": '\ufeff"use strict";\r\nvar a = 1;\r\n\r\nvar b = `x\r\ny`;\r\n',
    "core/b.js": '"use strict";\nvar c = 3;',          // بدون خط تازهٔ پایانی
    "ui/c.js": '"use strict";\n\n\nvar d = 4;\n\n',     // خط‌های خالی
  } });
  const b = buildBundle(d);
  const mapped = assertMapFaithful(d, b);
  assert.ok(mapped >= 9, `تعداد خط نگاشت‌شده: ${mapped}`);
  cleanup();
};

exports["clientBundle/buildBundle: نسخهٔ CRLF/BOM با نسخهٔ LF بسته و hash یکسان می‌دهد؛ تغییر محتوا hash را عوض می‌کند"] = async () => {
  const lf = mkClient({ files: { "core/a.js": '"use strict";\nvar a = 1;\nvar b = 2;\n' } });
  const crlf = mkClient({ files: { "core/a.js": '\ufeff"use strict";\r\nvar a = 1;\r\nvar b = 2;\r\n' } });
  const x = buildBundle(lf), y = buildBundle(crlf);
  assert.strictEqual(x.code, y.code);
  assert.strictEqual(x.hash, y.hash);
  assert.strictEqual(buildBundle(lf).hash, x.hash, "ساخت دوباره = همان hash (قطعی)");
  write(lf, "js/core/a.js", '"use strict";\nvar a = 1;\nvar b = 3;\n');
  assert.notStrictEqual(buildBundle(lf).hash, x.hash);
  // ترتیب manifest در hash اثر دارد
  const two = { "core/a.js": '"use strict";\nvar a = 1;\n', "core/b.js": '"use strict";\nvar b = 2;\n' };
  const o1 = mkClient({ files: two, manifest: ["core/a.js", "core/b.js"] });
  const o2 = mkClient({ files: two, manifest: ["core/b.js", "core/a.js"] });
  assert.notStrictEqual(buildBundle(o1).hash, buildBundle(o2).hash);
  cleanup();
};

exports["clientBundle/buildBundle: اجرای بسته = اجرای فایل‌ها به ترتیب، با حالت strict حفظ‌شده"] = async () => {
  const d = mkClient({ files: {
    "core/a.js": '"use strict";\nglobalThis.order = ["a"];\nglobalThis.strictA = (function () { return this === undefined; })();\nvar fromA = 1',   // بدون ; و بدون خط تازه
    "core/b.js": '"use strict";\nglobalThis.order.push("b");\nglobalThis.strictB = (function () { return this === undefined; })();\nglobalThis.sawA = typeof fromA;\n',
  } });
  const b = buildBundle(d);
  const ctx = vm.createContext({});
  vm.runInContext(b.code, ctx);
  assert.deepStrictEqual([...ctx.order], ["a", "b"]);
  assert.strictEqual(ctx.strictA, true); assert.strictEqual(ctx.strictB, true);
  assert.strictEqual(ctx.sawA, "number");
  cleanup();
};

exports["clientBundle/buildBundle: بدون \"use strict\" در ابتدای فایل (حتی با کامنت قبلش) ساخته نمی‌شود"] = async () => {
  for (const src of ["var x = 1;\n", '// توضیح\n"use strict";\nvar x = 1;\n', "'use strict';\nvar x = 1;\n", '\n"use strict";\nvar x = 1;\n']) {
    const d = mkClient({ files: { "core/a.js": '"use strict";\nvar a = 1;\n', "core/b.js": src } });
    assert.throws(() => buildBundle(d), (e) => /use strict/.test(e.message) && /js\/core\/b\.js/.test(e.message), JSON.stringify(src));
  }
  cleanup();
};

exports["clientBundle/buildBundle: نام تابع سطح‌بالا که در دو فایل تعریف شده ساخته نمی‌شود (function/function)"] = async () => {
  const mk = (a, b) => mkClient({ files: { "core/a.js": `"use strict";\n${a}\n`, "core/b.js": `"use strict";\n${b}\n` } });
  assert.throws(() => buildBundle(mk("function dup() { return 1; }", "function dup() { return 2; }")), /«dup».*js\/core\/a\.js.*js\/core\/b\.js/);
  // نام متفاوت → مجاز
  assert.ok(buildBundle(mk("function one() {}", "function two() {}")));
  cleanup();
};

// تداخل function و var هم‌نام بین فایل‌ها: در اسکریپت‌های جدا مقدار نهایی را ترتیب بارگذاری تعیین می‌کند، ولی در یک اسکریپت واحد
// تابع hoist می‌شود و انتساب var بعدش آن را بازنویسی می‌کند؛ پس باید رد شود (و صفحه با اسکریپت‌های جدا ارائه شود).
exports["clientBundle/buildBundle: تداخل function و var هم‌نام بین فایل‌ها رد می‌شود (هر دو ترتیب، همهٔ شکل‌های var)"] = async () => {
  const mk = (a, b) => mkClient({ files: { "core/a.js": `"use strict";\n${a}\n`, "core/b.js": `"use strict";\n${b}\n` } });
  const msg = /«dup».*js\/core\/a\.js.*js\/core\/b\.js/;
  const FN = "function dup() { return 2; }";
  // function پس از var، و var پس از function
  assert.throws(() => buildBundle(mk("var dup = 1;", FN)), msg);
  assert.throws(() => buildBundle(mk(FN, "var dup = 1;")), msg);
  // var بدون مقدار اولیه، چندتایی، destructuring، داخل بلوک/if/for، و var در بدنهٔ حلقه — همه var سطح‌بالا حساب می‌شوند
  for (const v of ["var dup;", "var x1 = 1, dup = 2;", "var { dup } = { dup: 1 };", "var [dup] = [1];", "var { a: { dup } } = { a: { dup: 1 } };",
                   "if (true) { var dup = 1; }", "for (var dup = 0; dup < 1; dup++) {}", "for (var dup of [1]) {}", "try { var dup = 1; } catch (e) {}"]) {
    assert.throws(() => buildBundle(mk(v, FN)), msg, `var اول: ${v}`);
    assert.throws(() => buildBundle(mk(FN, v)), msg, `var دوم: ${v}`);
  }
  // var که مقدارش تابع است هم var است (تعریف تابع نیست) ولی با function هم‌نام در فایل دیگر باز هم تداخل است
  assert.throws(() => buildBundle(mk("var dup = function () {};", FN)), msg);
  // پیام خطا هر دو فایل را نام می‌برد و از «use strict» جداست
  try { buildBundle(mk("var dup = 1;", FN)); assert.fail("باید پرتاب می‌شد"); } catch (e) { assert.ok(/تعریف شده/.test(e.message), e.message); }
  cleanup();
};

exports["clientBundle/middleware: تداخل function/var → fallback (بدون بسته، همهٔ مسیرها به next، یک هشدار با نام تداخل)"] = async () => {
  for (const [a, b] of [["var dup = 1;", "function dup() {}"], ["function dup() {}", "var dup;"]]) {
    const d = mkClient({ files: { "core/a.js": `"use strict";\n${a}\n`, "core/b.js": `"use strict";\n${b}\n` } });
    const L = quietLog();
    await withServer({ clientDir: d, env: {}, log: L }, async (c) => {
      for (const p of ["/", "/js/bundle.js", "/js/bundle.js.map"]) assert.ok(isFallthrough(await c.get(p)), p);
      assert.strictEqual(L.warns.length, 1);
      assert.ok(/«dup»/.test(L.warns[0]) && /اسکریپت‌های جدا/.test(L.warns[0]), L.warns[0]);
      assert.deepStrictEqual(L.logs, []);
    });
    cleanup();
  }
};

exports["clientBundle/buildBundle: موارد مجاز — var/var تکراری، تابع/var تودرتو، تابع بلوکی، متن داخل رشته/template، let/const با نام متفاوت"] = async () => {
  const d = mkClient({ files: {
    "core/a.js": '"use strict";\nvar shared = 1;\nfunction outer() { function inner() { var local = 1; } return inner; }\nvar s = "function inner2() {} var fake = 1";\nconst CONST_A = 1;\n{ function blockFn() {} }\n',
    "core/b.js": '"use strict";\nvar shared = 2;\nfunction other() { function inner() { var local = 2; } return inner; }\nvar t = `function outer() {}\n function inner2() {}\n var s = 1`;\nlet letB = 1;\n{ function blockFn() {} }\n',
  } });
  const b = buildBundle(d);    // نباید پرتاب کند
  assert.strictEqual(b.files.length, 2);
  cleanup();
};

exports["clientBundle/buildBundle: خطای نحوی و let/const/class تکراری بین فایل‌ها (کامپایل نشدن بسته) رد می‌شود"] = async () => {
  const mk = (a, b) => mkClient({ files: { "core/a.js": `"use strict";\n${a}\n`, "core/b.js": `"use strict";\n${b}\n` } });
  assert.throws(() => buildBundle(mk("var a = 1;", "var b = ;")), SyntaxError);
  assert.throws(() => buildBundle(mk("const same = 1;", "const same = 2;")), /already been declared/);
  assert.throws(() => buildBundle(mk("let same = 1;", "class same {}")), /already been declared/);
  assert.throws(() => buildBundle(mk("const same = 1;", "function same() {}")), (e) => /already been declared|تعریف شده/.test(e.message));
  cleanup();
};

exports["clientBundle/buildBundle: درخت واقعی client — با manifest و HTML سازگار، نگاشت وفادار، بدون خطا"] = async () => {
  const b = buildBundle(REAL_CLIENT);
  const manifest = readManifest(REAL_CLIENT);
  assert.deepStrictEqual(b.files, manifest);
  assert.ok(manifest.length >= 40, "تعداد فایل‌های manifest");
  assert.strictEqual([...b.code.matchAll(/^\/\* ==== js\/.+ ==== \*\/$/gm)].length, manifest.length);
  const mapped = assertMapFaithful(REAL_CLIENT, b);
  assert.ok(mapped > 1000, `خط‌های نگاشت‌شده: ${mapped}`);
  const html = fs.readFileSync(path.join(REAL_CLIENT, "payslip-online.html"), "utf8");
  const out = rewriteHtml(html, b.files, `./js/bundle.js?v=${b.hash}`);
  assert.ok(out !== null, "تگ‌های HTML واقعی باید با manifest یکی باشند (rewriteHtml نباید null بدهد)");
  assert.strictEqual([...out.matchAll(/<script src="\.\/js\//g)].length, 1);
  assert.ok(out.includes(`<script src="./js/bundle.js?v=${b.hash}"></script>`));
  assert.ok(out.length < html.length);
};

// =====================================================================  rewriteHtml
const FILES = ["core/a.js", "core/b.js", "ui/c.js"];
const tag = (f, v) => `<script src="./js/${f}${v === undefined ? "" : "?v=" + v}"></script>`;

exports["clientBundle/rewriteHtml: چند تگ پشت‌سرهم با یک تگ بسته جایگزین می‌شود و بقیهٔ HTML بدون تغییر می‌ماند"] = async () => {
  const pre = '<html><head><script src="https://cdn.example/x.js"></script><script src="./vendor/y.js"></script></head><body>\n<p>متن</p>\n', post = "\n</body></html>\n";
  for (const sep of ["\n", "\r\n", "\n  ", "", " \t\n"]) {
    const html = pre + FILES.map((f) => tag(f, 117)).join(sep) + post;
    const out = rewriteHtml(html, FILES, "./js/bundle.js?v=abc");
    assert.strictEqual(out, pre + '<script src="./js/bundle.js?v=abc"></script>' + post, JSON.stringify(sep));
  }
  // تگ بدون ?v= هم پذیرفته می‌شود
  assert.ok(rewriteHtml(FILES.map((f) => tag(f)).join("\n"), FILES, "X") === '<script src="X"></script>');
  // ?v= با مقدار دلخواه
  assert.ok(rewriteHtml(FILES.map((f, i) => tag(f, "a" + i + "-b")).join("\n"), FILES, "X") !== null);
};

exports["clientBundle/rewriteHtml: ناسازگاری با manifest → null (تعداد، ترتیب، نام، تگ اضافه، متن بین تگ‌ها، صفت اضافه)"] = async () => {
  const good = FILES.map((f) => tag(f, 1));
  const n = (arr) => rewriteHtml(arr.join("\n"), FILES, "X");
  assert.ok(n(good) !== null);
  assert.strictEqual(n(good.slice(0, 2)), null, "تگ کم");
  assert.strictEqual(n([...good, tag("ui/d.js", 1)]), null, "تگ اضافه");
  assert.strictEqual(rewriteHtml(`<head>${tag("core/vendor.js", 1)}</head>` + good.join("\n"), FILES, "X"), null, "تگ ./js/ اضافه پیش از گروه");
  assert.strictEqual(n([good[1], good[0], good[2]]), null, "ترتیب متفاوت");
  assert.strictEqual(n([good[0], tag("core/x.js", 1), good[2]]), null, "نام متفاوت");
  assert.strictEqual(n([good[0], "<p>بین</p>", good[1], good[2]]), null, "عنصر بین تگ‌ها");
  assert.strictEqual(n([good[0], "<!-- c -->", good[1], good[2]]), null, "کامنت بین تگ‌ها");
  assert.strictEqual(n([good[0], '<script>var x=1</script>', good[1], good[2]]), null, "اسکریپت درون‌خطی بین تگ‌ها");
  assert.strictEqual(n([good[0], good[1], '<script src="./js/ui/c.js?v=1" defer></script>']), null, "صفت defer");
  assert.strictEqual(n([good[0], good[1], '<script src="./js/ui/c.js?v=1" ></script>']), null, "فاصلهٔ اضافه در تگ");
  assert.strictEqual(n([good[0], good[1], '<script src="/js/ui/c.js"></script>']), null, "مسیر مطلق");
  assert.strictEqual(rewriteHtml("<html></html>", FILES, "X"), null, "هیچ تگی نیست");
  // دو گروه جدا از هم
  assert.strictEqual(rewriteHtml([good[0], good[1], "<hr>", good[2]].join("\n"), FILES, "X"), null);
};

// =====================================================================  middleware (سرور واقعی http)
exports["clientBundle/middleware: HTML — بستهٔ یکتا، no-store، طول بایتی درست (فارسی)، HEAD و مسیرهای هم‌ارز"] = async () => {
  const d = mkClient();
  const L = quietLog();
  await withServer({ clientDir: d, env: {}, log: L }, async (c) => {
    const first = await c.get("/");
    assert.strictEqual(first.status, 200);
    assert.strictEqual(first.headers["content-type"], "text/html; charset=utf-8");
    assert.strictEqual(first.headers["cache-control"], "no-store");
    assert.strictEqual(Number(first.headers["content-length"]), first.buf.length);
    assert.ok(first.buf.length > first.body.length, "طول بر حسب بایت (نه نویسه) محاسبه شود");
    const hash = hashFromHtml(first.body);
    assert.ok(!first.body.includes("./js/core/a.js"), "تگ‌های جدا نباید بمانند");
    assert.strictEqual([...first.body.matchAll(/<script /g)].length, 1);
    assert.ok(first.body.includes("<p>صفحه</p>"));
    for (const p of ["/index.html", "/payslip-online.html", "/?x=1", "/index.html?a=b&c=d"]) {
      const r = await c.get(p);
      assert.strictEqual(r.status, 200, p); assert.strictEqual(r.body, first.body, p);
    }
    const h = await c.head("/");
    assert.strictEqual(h.status, 200); assert.strictEqual(h.buf.length, 0, "HEAD بدنه ندارد");
    assert.strictEqual(Number(h.headers["content-length"]), first.buf.length, "HEAD طول واقعی را اعلام می‌کند");
    assert.strictEqual(h.headers["cache-control"], "no-store");
    assert.strictEqual(L.logs.length, 1, "ده‌ها درخواست = فقط یک بار ساخت");
    assert.ok(/2 فایل/.test(L.logs[0]) && L.logs[0].includes(hash), L.logs[0]);
    assert.deepStrictEqual(L.warns, []);
  });
  cleanup();
};

exports["clientBundle/middleware: bundle.js و map — Content-Type، طول، Cache یک‌ساله فقط با v درست، سازگاری با HTML"] = async () => {
  const d = mkClient();
  await withServer({ clientDir: d, env: {}, log: quietLog() }, async (c) => {
    const hash = hashFromHtml((await c.get("/")).body);
    const js = await c.get(`/js/bundle.js?v=${hash}`);
    assert.strictEqual(js.status, 200);
    assert.strictEqual(js.headers["content-type"], "text/javascript; charset=utf-8");
    assert.strictEqual(js.headers["cache-control"], "public, max-age=31536000, immutable");
    assert.strictEqual(Number(js.headers["content-length"]), js.buf.length);
    assert.ok(js.body.endsWith(`//# sourceMappingURL=bundle.js.map?v=${hash}\n`));
    assert.strictEqual(js.body, buildBundle(d).code, "همان بستهٔ buildBundle");
    const map = await c.get(`/js/bundle.js.map?v=${hash}`);
    assert.strictEqual(map.status, 200);
    assert.strictEqual(map.headers["content-type"], "application/json; charset=utf-8");
    assert.strictEqual(map.headers["cache-control"], "public, max-age=31536000, immutable");
    assert.strictEqual(Number(map.headers["content-length"]), map.buf.length);
    const sm = JSON.parse(map.body);
    assert.deepStrictEqual(sm.sources, ["core/a.js", "core/b.js"]);
    // v نادرست، خالی یا ناموجود → no-cache (هرگز immutable)
    for (const q of ["", "?v=", "?v=000000000000", "?v=old", "?x=1", `?V=${hash}`, `?v=${hash}x`]) {
      for (const p of ["/js/bundle.js", "/js/bundle.js.map"]) {
        const r = await c.get(p + q);
        assert.strictEqual(r.status, 200, p + q);
        assert.strictEqual(r.headers["cache-control"], "no-cache", `${p}${q}`);
      }
    }
    // HEAD
    const hh = await c.head(`/js/bundle.js?v=${hash}`);
    assert.strictEqual(hh.status, 200); assert.strictEqual(hh.buf.length, 0);
    assert.strictEqual(Number(hh.headers["content-length"]), js.buf.length);
    assert.strictEqual(hh.headers["cache-control"], "public, max-age=31536000, immutable");
  });
  cleanup();
};

exports["clientBundle/middleware: فقط GET/HEAD و فقط مسیرهای خودش؛ بقیه به next می‌رود"] = async () => {
  const d = mkClient();
  await withServer({ clientDir: d, env: {}, log: quietLog() }, async (c) => {
    for (const p of ["/", "/js/bundle.js", "/js/bundle.js.map"]) assert.ok(isFallthrough(await c.post(p)), `POST ${p}`);
    for (const p of ["/css/theme.css", "/js/core/a.js", "/api/health", "/js/bundle.jsx", "/js/bundle.js.map.bak", "/js/bundle.js/", "/Index.html", "/payslip-online.html/x", "/js/", "/x/js/bundle.js"]) {
      assert.ok(isFallthrough(await c.get(p)), `GET ${p}`);
    }
  });
  cleanup();
};

exports["clientBundle/middleware: بازسازی خودکار با تغییر فایل (mtime/اندازه)، hash تازه، نسخهٔ قدیمی no-cache"] = async () => {
  const d = mkClient();
  const L = quietLog();
  await withServer({ clientDir: d, env: {}, log: L }, async (c) => {
    const h1 = hashFromHtml((await c.get("/")).body);
    bump(d, "js/core/b.js", '"use strict";\nfunction beta() { return alpha() + 2; }\nglobalThis.order.push("b2");\n');
    const h2 = hashFromHtml((await c.get("/")).body);
    assert.notStrictEqual(h1, h2);
    assert.ok((await c.get(`/js/bundle.js?v=${h2}`)).body.includes("b2"));
    assert.strictEqual((await c.get(`/js/bundle.js?v=${h1}`)).headers["cache-control"], "no-cache", "hash قدیمی دیگر immutable نیست");
    // تغییر manifest (ترتیب) → بازسازی
    bump(d, "js/manifest.json", JSON.stringify(["core/b.js", "core/a.js"]));
    bump(d, "payslip-online.html", fs.readFileSync(path.join(d, "payslip-online.html"), "utf8").split("\n").map((l) => l.replace(/core\/a\.js/, "core/TMP.js").replace(/core\/b\.js/, "core/a.js").replace(/core\/TMP\.js/, "core/b.js")).join("\n"));
    const h3 = hashFromHtml((await c.get("/")).body);
    assert.notStrictEqual(h3, h2);
    assert.strictEqual(L.logs.length, 3, "هر تغییر دقیقاً یک بار ساخت");
    assert.deepStrictEqual(L.warns, []);
  });
  cleanup();
};

exports["clientBundle/middleware: fallback — هر شرط ناسازگار → بسته ساخته نمی‌شود، همهٔ مسیرها به next، فقط یک هشدار"] = async () => {
  const good = { "core/a.js": '"use strict";\nfunction alpha() {}\n', "core/b.js": '"use strict";\nfunction beta() {}\n' };
  const goodTags = Object.keys(good).map((f) => tag(f, 1)).join("\n");
  const cases = {
    "تگ HTML با manifest یکی نیست": { files: good, html: `<body>${tag("core/a.js", 1)}</body>`, warn: /تگ/ },
    "ترتیب تگ‌ها متفاوت": { files: good, html: `<body>${tag("core/b.js", 1)}${tag("core/a.js", 1)}</body>`, warn: /تگ/ },
    "فایل بدون use strict": { files: { ...good, "core/b.js": "function beta() {}\n" }, warn: /use strict/ },
    "تابع تکراری بین فایل‌ها": { files: { ...good, "core/b.js": '"use strict";\nfunction alpha() {}\n' }, warn: /alpha/ },
    "کامپایل نشدن بسته": { files: { ...good, "core/b.js": '"use strict";\nvar = ;\n' }, warn: /./ },
    "let/const تکراری": { files: { "core/a.js": '"use strict";\nconst k = 1;\n', "core/b.js": '"use strict";\nconst k = 2;\n' }, warn: /already been declared/ },
    "manifest خراب": { files: good, manifest: "{", warn: /./ },
    "فایل manifest ناموجود روی دیسک": { files: good, manifest: ["core/a.js", "core/b.js", "core/missing.js"], html: `<body>${goodTags}${tag("core/missing.js", 1)}</body>`, warn: /./ },
  };
  for (const [name, spec] of Object.entries(cases)) {
    const d = mkClient({ files: spec.files, manifest: spec.manifest, html: spec.html });
    const L = quietLog();
    await withServer({ clientDir: d, env: {}, log: L }, async (c) => {
      for (let i = 0; i < 3; i++) for (const p of ["/", "/index.html", "/payslip-online.html", "/js/bundle.js", "/js/bundle.js.map"]) {
        assert.ok(isFallthrough(await c.get(p)), `${name}: ${p}`);
      }
      assert.strictEqual(L.warns.length, 1, `${name}: هشدار باید فقط یک بار باشد (${L.warns.length})`);
      assert.ok(spec.warn.test(L.warns[0]), `${name}: ${L.warns[0]}`);
      assert.ok(/اسکریپت‌های جدا/.test(L.warns[0]), "پیام باید بگوید صفحه با اسکریپت‌های جدا ارائه می‌شود");
      assert.deepStrictEqual(L.logs, [], `${name}: نباید پیام موفقیت چاپ شود`);
    });
    cleanup();
  }
};

exports["clientBundle/middleware: fallback موقت است — پس از رفع مشکل، درخواست بعدی دوباره بسته را می‌دهد"] = async () => {
  const d = mkClient();
  const L = quietLog();
  await withServer({ clientDir: d, env: {}, log: L }, async (c) => {
    assert.strictEqual((await c.get("/")).status, 200);
    bump(d, "js/core/b.js", 'function beta() {}\n');                         // use strict را برمی‌داریم
    assert.ok(isFallthrough(await c.get("/")));
    assert.ok(isFallthrough(await c.get("/js/bundle.js")));
    bump(d, "js/core/b.js", '"use strict";\nfunction beta() { return 42; }\n');   // درست می‌کنیم
    const r = await c.get("/");
    assert.strictEqual(r.status, 200);
    assert.ok((await c.get(`/js/bundle.js?v=${hashFromHtml(r.body)}`)).body.includes("return 42"));
    assert.strictEqual(L.warns.length, 1);
  });
  cleanup();
};

exports["clientBundle/middleware: CLIENT_BUNDLE=0 — خاموش کامل؛ هیچ مسیری سرو و هیچ ساختی انجام نمی‌شود"] = async () => {
  const d = mkClient();
  const L = quietLog();
  let reads = 0;
  const origRead = fs.readFileSync;
  fs.readFileSync = function (f, ...a) { if (String(f).startsWith(d)) reads++; return origRead.call(this, f, ...a); };
  try {
    await withServer({ clientDir: d, env: { CLIENT_BUNDLE: "0" }, log: L }, async (c) => {
      for (const p of ["/", "/index.html", "/payslip-online.html", "/js/bundle.js", "/js/bundle.js?v=abc", "/js/bundle.js.map", "/?x=1"]) assert.ok(isFallthrough(await c.get(p)), p);
      assert.ok(isFallthrough(await c.head("/")));
    });
  } finally { fs.readFileSync = origRead; }
  assert.strictEqual(reads, 0, "با CLIENT_BUNDLE=0 نباید فایلی از client خوانده شود");
  assert.deepStrictEqual(L.logs, []); assert.deepStrictEqual(L.warns, []);
  // فقط مقدار دقیق "0" خاموش می‌کند؛ نبودن متغیر یا مقدارهای دیگر = روشن
  for (const env of [{}, { CLIENT_BUNDLE: "1" }, { CLIENT_BUNDLE: undefined }]) {
    await withServer({ clientDir: d, env, log: quietLog() }, async (c) => { assert.strictEqual((await c.get("/")).status, 200, JSON.stringify(env)); });
  }
  cleanup();
};

exports["clientBundle/middleware: CLIENT_BUNDLE از process.env خوانده می‌شود (پیش‌فرض env)، لحظه‌ای و بدون ریستارت اثر دارد"] = async () => {
  const d = mkClient();
  const saved = process.env.CLIENT_BUNDLE;
  try {
    delete process.env.CLIENT_BUNDLE;
    await withServer({ clientDir: d, log: quietLog() }, async (c) => {
      assert.strictEqual((await c.get("/")).status, 200);
      process.env.CLIENT_BUNDLE = "0";
      assert.ok(isFallthrough(await c.get("/")), "پس از CLIENT_BUNDLE=0 باید به next برود");
      delete process.env.CLIENT_BUNDLE;
      assert.strictEqual((await c.get("/")).status, 200);
    });
  } finally { if (saved === undefined) delete process.env.CLIENT_BUNDLE; else process.env.CLIENT_BUNDLE = saved; }
  cleanup();
};

exports["clientBundle/middleware: log=null بی‌خطر است (بدون پیام، بدون خطا)"] = async () => {
  const ok = mkClient();
  const bad = mkClient({ files: { "core/a.js": "var x;\n" } });
  for (const [dir, expect] of [[ok, 200], [bad, 404]]) {
    await withServer({ clientDir: dir, env: {}, log: null }, async (c) => { assert.strictEqual((await c.get("/")).status, expect); });
  }
  cleanup();
};

// =====================================================================  middleware با req/res شبیه Express
exports["clientBundle/middleware: شاخهٔ Express — req.path/originalUrl، setHeader/statusCode/end و HEAD"] = async () => {
  const d = mkClient();
  const mw = clientBundle({ clientDir: d, env: {}, log: quietLog() });
  const call = (method, p, originalUrl) => {
    const headers = new Map(); let body, nextCalls = 0;
    const res = { statusCode: 0, setHeader: (k, v) => headers.set(k.toLowerCase(), String(v)), end: (b) => { body = b; res.ended = true; } };
    mw({ method, path: p, originalUrl: originalUrl || p, url: originalUrl || p }, res, () => { nextCalls++; });
    return { res, headers, body, nextCalls };
  };
  const html = call("GET", "/", "/?utm=1");
  assert.strictEqual(html.nextCalls, 0); assert.strictEqual(html.res.statusCode, 200);
  assert.strictEqual(html.headers.get("cache-control"), "no-store");
  assert.ok(Buffer.isBuffer(html.body));
  assert.strictEqual(Number(html.headers.get("content-length")), html.body.length);
  const hash = hashFromHtml(html.body.toString("utf8"));
  // Express: req.path بدون query؛ originalUrl با query (سازوکار v=)
  const js = call("GET", "/js/bundle.js", `/js/bundle.js?v=${hash}`);
  assert.strictEqual(js.headers.get("cache-control"), "public, max-age=31536000, immutable");
  assert.strictEqual(call("GET", "/js/bundle.js", "/js/bundle.js?v=zzz").headers.get("cache-control"), "no-cache");
  assert.strictEqual(call("GET", "/js/bundle.js", "/js/bundle.js").headers.get("cache-control"), "no-cache");
  // پشت mount path (/app): originalUrl پیشوند دارد ولی req.path نه؛ مسیر تصمیم از req.path است
  assert.strictEqual(call("GET", "/js/bundle.js.map", `/app/js/bundle.js.map?v=${hash}`).headers.get("content-type"), "application/json; charset=utf-8");
  // HEAD: end بدون بدنه
  const hd = call("HEAD", "/", "/");
  assert.strictEqual(hd.body, undefined); assert.ok(hd.res.ended);
  assert.strictEqual(Number(hd.headers.get("content-length")), html.body.length);
  // روش‌های دیگر، مسیر دیگر، و خاموش بودن
  assert.strictEqual(call("PUT", "/").nextCalls, 1);
  assert.strictEqual(call("OPTIONS", "/js/bundle.js").nextCalls, 1);
  assert.strictEqual(call("GET", "/api/health").nextCalls, 1);
  const off = clientBundle({ clientDir: d, env: { CLIENT_BUNDLE: "0" }, log: quietLog() });
  let n = 0; off({ method: "GET", path: "/", originalUrl: "/" }, { setHeader() { throw new Error("نباید هدر بگذارد"); }, end() { throw new Error("نباید پاسخ بدهد"); } }, () => n++);
  assert.strictEqual(n, 1);
  // req بدون path (سرور ساده): از url می‌خواند
  const bare = []; mw({ method: "GET", url: "/js/bundle.js.map?v=" + hash }, { setHeader: (k, v) => bare.push([k, v]), end() {} }, () => bare.push("next"));
  assert.ok(!bare.includes("next") && bare.some(([k, v]) => k === "Cache-Control" && /immutable/.test(v)));
  cleanup();
};

exports["clientBundle/صادرات: API عمومی ماژول"] = async () => {
  assert.deepStrictEqual(Object.keys(CB).sort(), ["BUNDLE_PATH", "MAP_PATH", "buildBundle", "clientBundle", "readManifest", "rewriteHtml", "vlq"]);
  assert.strictEqual(CB.BUNDLE_PATH, "/js/bundle.js"); assert.strictEqual(CB.MAP_PATH, "/js/bundle.js.map");
  assert.strictEqual(typeof clientBundle({ clientDir: REAL_CLIENT, env: { CLIENT_BUNDLE: "0" } }), "function");
};
