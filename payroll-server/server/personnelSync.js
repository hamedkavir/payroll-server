// این ماژول وضعیت جدول personnel را بر اساس افراد وارد‌شده در یک دوره به‌روز می‌کند:
// - کسانی که در فایل حقوق شاغلین آن دوره هستند -> status = 'شاغل'
// - کسانی که در فایل حقوق بازنشستگان آن دوره هستند -> status = 'بازنشسته'
// - کسانی که در پرسنل هستند ولی در هیچ‌کدام از این دو فایل نیستند -> status = 'قطع رابطه'
//
// نکتهٔ مهم: مرحلهٔ «قطع رابطه» فقط زمانی اجرا می‌شود که هر دو فایل (شاغلین و
// بازنشستگان) برای این دوره ثبت شده باشند. وگرنه اگر مثلاً فقط فایل شاغلین
// وارد شده باشد و فایل بازنشستگان هنوز نیامده، همهٔ بازنشستگان قبلی به‌اشتباه
// «قطع رابطه» علامت می‌خورند. هر تغییر واقعی وضعیت در personnel_status_log
// ثبت می‌شود تا داشبورد بتواند «تازه‌واردها» را نشان دهد.

const { HEIR, isHeirRecord } = require("./eligibility");
const { fixArabic, padNid } = require("./textNormalize");
const { defaultBankName, cleanShaba, isValidShaba, accountFromShaba, cleanAccount, isAccount13 } = require("./bankAccount");

function splitName(full) {
  const s = String(full || "").trim();
  if (!s) return { first: "", last: "" };
  const idx = s.indexOf(" ");
  if (idx === -1) return { first: s, last: "" };
  return { first: s.slice(0, idx), last: s.slice(idx + 1) };
}

async function syncPersonnelFromPeriod(conn, periodId) {
  const [[period]] = await conn.query("SELECT active_file, retiree_file FROM periods WHERE id = ?", [periodId]);
  const [activeRows] = await conn.query(
    "SELECT code, name, national_id FROM people WHERE period_id = ? AND kind = 'active'",
    [periodId]
  );
  const [retireeRows] = await conn.query(
    "SELECT code, name, national_id, data FROM people WHERE period_id = ? AND kind = 'retiree'",
    [periodId]
  );

  const allCodes = [...activeRows.map((r) => r.code), ...retireeRows.map((r) => r.code)];
  const uniqueCodes = [...new Set(allCodes.filter(Boolean))];

  let currentMap = {};
  if (uniqueCodes.length) {
    const ph = uniqueCodes.map(() => "?").join(",");
    const [rows] = await conn.query(`SELECT code, status FROM personnel WHERE code IN (${ph})`, uniqueCodes);
    rows.forEach((r) => (currentMap[r.code] = r.status));
  }

  const logs = [];
  const counts = { ledger: 0, shaba: 0, account: 0, name: 0, nid: 0, bank: 0 };
  // مقادیر فعلی پرسنل برای مقایسه (فقط در صورت تغییر به‌روز شود)
  const curRows = new Map();
  for (let i = 0; i < uniqueCodes.length; i += 1000) {
    const [rs] = await conn.query("SELECT code, first_name, last_name, national_id, ledger, shaba, bank_account, bank_name FROM personnel WHERE code IN (?)", [uniqueCodes.slice(i, i + 1000)]);
    rs.forEach((r) => curRows.set(String(r.code), r));
  }
  const RET_BANK = "صادرات";
  const changeLog = [], createdLog = [];
  const ch = (code, name, field, o, n) => changeLog.push({ code, name, field, old: o == null ? "" : String(o), new: n == null ? "" : String(n) });

  async function upsertGroup(rows, status, isRet) {
    for (const r of rows) {
      const code = String(r.code || "").trim();
      if (!code) continue;
      const rd = (() => { try { return typeof r.data === "string" ? JSON.parse(r.data) : (r.data || {}); } catch (e) { return {}; } })();
      let { first, last } = splitName(r.name);
      if (rd.firstName || rd.lastName) { first = String(rd.firstName || "").trim(); last = String(rd.lastName || "").trim(); }
      first = fixArabic(first); last = fixArabic(last);
      const oldStatus = Object.prototype.hasOwnProperty.call(currentMap, code) ? currentMap[code] : "";
      await conn.query(
        `INSERT INTO personnel (code, first_name, last_name, national_id, status, bank_name)
         VALUES (?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE status = VALUES(status), bank_name = IF(bank_name = '', VALUES(bank_name), bank_name)`,
        [code, first, last, padNid(r.national_id), status, defaultBankName(status)]
      );
      // فایل بازنشستگان: دفتر کل، شبا و حساب در جدول پرسنل ذخیره/به‌روز می‌شود
      let ledger = "", shaba = "", acct = "";
      try {
        const d = typeof r.data === "string" ? JSON.parse(r.data) : r.data;
        ledger = d && d.ledger ? String(d.ledger).trim().slice(0, 60) : "";
        const rawSh = d && d.shaba ? String(d.shaba).trim() : "";
        const sh = cleanShaba(rawSh);
        if (sh && isValidShaba(sh)) shaba = sh;
        else { const pa = cleanAccount(rawSh); if (pa && /^\d+$/.test(pa) && isAccount13(pa)) acct = pa; }
        if (!shaba && !acct) { const a = cleanAccount(d && d.account ? String(d.account) : ""); if (a && isAccount13(a)) acct = a; }
      } catch (e) { /* بدون دفتر کل/شبا */ }
      const sets = [], vals = [];
      if (isRet) {
        // بازنشسته/وظیفه‌بگیر: نام، نام خانوادگی، کد ملی، دفتر کل، شبا و حساب فقط در صورت تغییر به‌روز می‌شود؛ نام بانک همیشه «صادرات»
        const cur = curRows.get(code);
        const fullName = `${first} ${last}`.trim();
        if (!cur) createdLog.push({ code, name: fullName, status });
        if (cur) {
          if (first && first !== (cur.first_name || "")) { sets.push("first_name = ?"); vals.push(first); counts.name++; ch(code, fullName, "first_name", cur.first_name, first); }
          if (last && last !== (cur.last_name || "")) { sets.push("last_name = ?"); vals.push(last); ch(code, fullName, "last_name", cur.last_name, last); }
          const nid = padNid(r.national_id);
          if (nid && nid !== String(cur.national_id || "").trim()) { sets.push("national_id = ?"); vals.push(nid); counts.nid++; ch(code, fullName, "national_id", cur.national_id, nid); }
          if (ledger && ledger === String(cur.ledger || "")) ledger = "";   // بدون تغییر
          if (shaba && shaba === String(cur.shaba || "")) shaba = "";
          if (acct && acct === String(cur.bank_account || "")) acct = "";
          if ((cur.bank_name || "") !== RET_BANK) { sets.push("bank_name = ?"); vals.push(RET_BANK); counts.bank++; ch(code, fullName, "bank_name", cur.bank_name, RET_BANK); }
        }
      }
      if (isRet && curRows.get(code)) {
        const cur = curRows.get(code), fullName = `${first} ${last}`.trim();
        if (ledger) ch(code, fullName, "ledger", cur.ledger, ledger);
        if (shaba) { ch(code, fullName, "shaba", cur.shaba, shaba); ch(code, fullName, "bank_account", cur.bank_account, accountFromShaba(shaba)); }
        else if (acct) ch(code, fullName, "bank_account", cur.bank_account, acct);
      }
      if (ledger) { sets.push("ledger = ?"); vals.push(ledger); counts.ledger++; }
      if (shaba) { sets.push("shaba = ?", "bank_account = ?"); vals.push(shaba, accountFromShaba(shaba)); counts.shaba++; }   // ۱۳ رقم آخر شبا = شمارهٔ حساب
      else if (acct) { sets.push("bank_account = ?"); vals.push(acct); counts.account++; }
      if (sets.length) await conn.query(`UPDATE personnel SET ${sets.join(", ")} WHERE code = ?`, [...vals, code]);
      if (oldStatus !== status) logs.push([code, oldStatus, status, periodId]);
      currentMap[code] = status; // برای جلوگیری از ثبت لاگ تکراری اگر یک کد در هر دو فهرست باشد
    }
  }

  await upsertGroup(activeRows, "شاغل", false);
  // ردیف ورثه > ۰ → «وظیفه بگیر»؛ بقیه «بازنشسته»
  const heirRows = retireeRows.filter((r) => isHeirRecord(r.data));
  const pensionerRows = retireeRows.filter((r) => !isHeirRecord(r.data));
  await upsertGroup(pensionerRows, "بازنشسته", true);
  await upsertGroup(heirRows, HEIR, true);

  let terminatedCount = 0;
  const bothFilesPresent = !!(period && period.active_file && period.retiree_file);
  if (bothFilesPresent && uniqueCodes.length) {
    const ph = uniqueCodes.map(() => "?").join(",");
    const [rows] = await conn.query(
      `SELECT code, status FROM personnel WHERE code NOT IN (${ph}) AND status <> 'قطع رابطه'`,
      uniqueCodes
    );
    for (const r of rows) {
      await conn.query("UPDATE personnel SET status = 'قطع رابطه' WHERE code = ?", [r.code]);
      logs.push([r.code, r.status || "", "قطع رابطه", periodId]);
    }
    terminatedCount = rows.length;
  }

  if (logs.length) {
    await conn.query("INSERT INTO personnel_status_log (code, old_status, new_status, period_id) VALUES ?", [logs]);
  }

  return {
    activeSynced: activeRows.length,
    retiredSynced: retireeRows.length,
    heirsSynced: heirRows.length,
    ledgerSynced: counts.ledger,
    shabaSynced: counts.shaba,
    accountSynced: counts.account,
    nameSynced: counts.name,
    nidSynced: counts.nid,
    bankSet: counts.bank,
    changes: changeLog,
    createdList: createdLog,
    terminatedNow: terminatedCount,
    terminationChecked: bothFilesPresent,
    changed: logs.length,
  };
}

module.exports = { syncPersonnelFromPeriod, splitName };
