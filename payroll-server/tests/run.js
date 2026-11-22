// اجرا: node tests/run.js   (از پوشهٔ payroll-server)
const fs = require("fs");
const path = require("path");
const files = fs.readdirSync(__dirname).filter((f) => /^test_.*\.js$/.test(f)).sort();
const results = [];
(async () => {
  for (const f of files) {
    const mod = require(path.join(__dirname, f));
    for (const [name, fn] of Object.entries(mod)) {
      try { await fn(); results.push([f, name, true]); console.log("PASS", f, "-", name); }
      catch (e) { results.push([f, name, false, e]); console.log("FAIL", f, "-", name, "\n   ", e && e.stack ? e.stack.split("\n").slice(0, 3).join("\n    ") : e); }
    }
  }
  const bad = results.filter((r) => !r[2]).length;
  console.log(`\n${results.length - bad}/${results.length} تست موفق`);
  process.exit(bad ? 1 : 0);
})();
