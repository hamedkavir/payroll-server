// پیکربندی منو: { groups:[{id,title,items:[page]}], hidden:[page], labels:{page:متن}, collapsed:[groupId] }
function cleanNavCfg(c) {
  const id = (x, n) => String(x == null ? "" : x).replace(/[^A-Za-z0-9_]/g, "").slice(0, n);
  const txt = (x, n) => String(x == null ? "" : x).replace(/[\r\n\t]+/g, " ").trim().slice(0, n);
  const seen = new Set(), groups = [];
  for (const g of (Array.isArray(c.groups) ? c.groups : []).slice(0, 20)) {
    if (!g || typeof g !== "object") continue;
    const gid = id(g.id, 30); if (!gid || groups.some((x) => x.id === gid)) continue;
    const items = []; for (const p of (Array.isArray(g.items) ? g.items : []).slice(0, 40)) { const k = id(p, 30); if (k && !seen.has(k)) { seen.add(k); items.push(k); } }
    groups.push({ id: gid, title: txt(g.title, 40), items });
  }
  const list = (a, n) => [...new Set((Array.isArray(a) ? a : []).map((x) => id(x, 30)).filter(Boolean))].slice(0, n);
  const labels = {}; for (const [k, v] of Object.entries(c.labels && typeof c.labels === "object" ? c.labels : {}).slice(0, 60)) { const kk = id(k, 30), t = txt(v, 60); if (kk && t) labels[kk] = t; }
  return { v: 2, groups, hidden: list(c.hidden, 60), labels, collapsed: list(c.collapsed, 30) };
}

module.exports = { cleanNavCfg };
