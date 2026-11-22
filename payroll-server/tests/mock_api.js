/* mock_api.js — mocked API for tests/css_harness.py (`snap --mock`); injected as a Playwright init script.
 *
 * Purpose: make the JS templates render (tables, cards, notices, reports) without a server or database so that
 * the computed-style harness also covers JS-generated markup, not only the static HTML.
 * The values do not need to be realistic — only deterministic — because the harness compares two snapshots of
 * the SAME mock (before/after a CSS/markup refactor). Two layers:
 *   1. FIXTURES: real objects for the few endpoints whose exact shape boot/permissions depend on.
 *   2. U(): a "universal" value for everything else — usable as array (2 items, empty from depth 3),
 *      number (3), string ("نمونه"), object (any property) and function (returns another universal).
 * window.fetch is replaced for URLs containing /api/; nothing leaves the page.
 */
(() => {
  const MAX = 3;
  const kids = d => (d >= MAX ? [] : [U(d + 1), U(d + 1)]);
  function U(d = 0) {
    const t = () => {};                       // arrow function target: no non-configurable "prototype"
    return new Proxy(t, {
      get(_, k) {
        if (k === Symbol.toPrimitive) return h => (h === "string" ? "نمونه" : 3);
        if (k === Symbol.iterator) return function* () { yield* kids(d); };
        if (typeof k === "symbol" || k === "then" || k === "toJSON") return undefined;   // never a thenable
        if (k === "length") return kids(d).length;
        if (/^\d+$/.test(k)) return kids(d)[+k];
        if (typeof Array.prototype[k] === "function") return (...a) => Array.prototype[k].apply(kids(d), a);
        return U(Math.min(d + 1, MAX));
      },
      apply() { return U(Math.min(d + 1, MAX)); },
      has() { return true; },
      ownKeys() { return []; },
      getOwnPropertyDescriptor() { return undefined; },
    });
  }
  // fixture object whose missing properties fall back to a universal value
  const F = o => new Proxy(o, { get(t, k) { return k in t || typeof k === "symbol" || k === "then" || k === "toJSON" ? t[k] : U(1); } });
  const person = () => F({ code: "1001", firstName: "علی", lastName: "رضایی", nationalId: "0012345678", status: "شاغل",
    workplace: "دبیرستان نمونه", mobile: "09120000000", mehrAccount: "", sex: "مرد" });
  const routes = [
    [/^\/api\/health$/, () => ({ ok: true })],
    [/^\/api\/auth\/me$/, () => ({ id: 1, username: "admin", fullName: "مدیر سیستم", isAdmin: true, permissions: [], mustChange: false, navOrder: [], navCfg: null })],
    [/^\/api\/auth\/prefs$/, () => ({ navOrder: [], navCfg: null })],
    [/^\/api\/settings$/, () => F({ unit: "ریال", showEmployer: true })],
    [/^\/api\/form-settings$/, () => ({})],
    [/^\/api\/sync/, () => ({ changed: false, version: "1" })],
    [/^\/api\/periods$/, () => []],
    [/^\/api\/personnel\?/, () => F({ items: [person()], total: 1, page: 1, pages: 1 })],
    [/^\/api\/personnel\/[^/?]+$/, person],
  ];
  const real = window.fetch;
  window.fetch = function (url, opt) {
    const u = new URL(String(url), location.href);
    if (!u.pathname.startsWith("/api/")) return real.apply(this, arguments);
    const p = u.pathname + u.search, hit = routes.find(([rx]) => rx.test(p));
    const body = hit ? hit[1]() : U(0);
    return Promise.resolve({ ok: true, status: 200, headers: new Headers(), json: async () => body,
      text: async () => "", blob: async () => new Blob([]), arrayBuffer: async () => new ArrayBuffer(0) });
  };
  try { localStorage.setItem("psApiBase", location.origin); sessionStorage.setItem("psToken", "mock"); } catch (e) {}
})();
