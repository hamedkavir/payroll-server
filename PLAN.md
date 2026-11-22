# Optimization plan — payroll-server (v121)

## Public-release hardening (v121)
- ✅ Removed live-looking personal details from personnel workbook and form samples.
- ✅ Replaced the fixed first-run administrator password with a random one-time temporary password.
- ✅ Expanded `.gitignore` for environment secrets, private agent files, database files, backups and logs.
- ✅ Removed local-only `CLAUDE.local.md` from the public release.
- Verification: `npm test` — 151/151 passed; `node --check` passed for all JavaScript files. CSS browser harness and live MySQL/HTTP checks were not run for this release-preparation change.

## Done (v110 and earlier)
1. ✅ Split the 1 MB client file into HTML, `css/theme.css` and JS
2. ✅ Lighter background sync, async password hashing (72/72 tests)

## Done in v111
3. ✅ Client split into 48 ordered classic-script modules (`client/js/<area>/`, list in `js/manifest.json`)
4. ✅ `esc()` escapes single quotes; new `core/dialogs.js`; lazy XLSX loader
5. ✅ Server `routes/extras.js` split; fixed `ROUND_DEFAULTS` / `KEY_CODE_DEFAULTS` / `FS_DEFAULTS` (new `routes/formDefaults.js`) and missing `pageMeta` imports
6. ✅ Tests 72/72; `npm test` script in `server/package.json`
7. ✅ `server/httpHeaders.js`: nosniff, X-Frame-Options, Referrer-Policy, Permissions-Policy, CSP, no X-Powered-By, no-store for HTML/API, 1-year cache for `?v=` assets
8. ✅ Graceful shutdown (`server/shutdown.js`): SIGINT/SIGTERM → server.close → wait for backup → pool.end, with timeout
9. ✅ Login limiter (`server/loginLimiter.js`): per user+IP and per IP, hard cap on memory entries
10. ✅ `GET /api/sync` (`routes/sync.js`) + client reset/400 handling
11. ✅ Migration runner (`server/migrate.js`, `schema_migrations`, GET_LOCK, checksums, pre-migrate backup); `npm run migrate`, `migrate:status`; migration 006; `schema.sql` reconciled
12. ✅ Main header no longer sticky (table headers still sticky); real dark mode with CSS variables (`theme.css` [19]) + "follow system" option
13. ✅ API key kept in sessionStorage by default; localStorage only with explicit "remember" checkbox; old stored keys mig## Done in v113
14. ✅ `.gitignore` (node_modules, .env, backups/, pic/*, logs)
15. ✅ Automated tests: `test_headers.js`, `test_limiter.js`, `test_sync.js`, `test_migrate.js` (fake DB only), `test_shutdown.js` — mutation-checked
16. ✅ Declarative route/permission table `server/routeTable.js` (`mountRoutes(app)`, `validateRoutes`, `npm run routes`); `test_routes.js` proves identical access decisions vs v112 (>50k cases). Total: 120/120 tests

## Completed follow-up items

17. ✅ (partial, see note) CSS refactor: one design-token layer (CSS variables for spacing/font-size/radius/shadow), remove the few truly-dead overrides (~9 found), move repeated inline styles (`margin-bottom:16px`, `flex-direction:row;align-items:center;gap:8px`, widths) into utility classes. Verify with the computed-style diff harness (8 configs × 29 pages, light/dark/RTL/responsive) — must be 0 diffs
18. ✅ Persian README rewrite (auth section, route table, tests, PowerShell install guide), final zip
19. ✅ Visual pass of dark mode (offline render, 4 pages x desktop/mobile) on every page in a real browser

Note on 17 (v114): verified by tests/css_harness.py (8 configs x 27 pages, 0 diffs). Done: tokens for exact-literal radius/shadow/font-size, 1 shadowed declaration removed, 57 static-HTML inline styles -> `u-*` classes. NOT done: the ~466 inline styles inside JS templates and the other "dead overrides" - the harness renders pages offline (no data), so JS-generated markup is unverified; static detection of dead rules was unreliable (dynamic class names such as `t-${tone}`). Needs a harness with a mocked API before touching those.
Note on 19: pages were checked with empty data (no API); dark mode with real data still worth a manual look. Harness covers 27 pages (the plan said 29).

## Done in v115
20. ✅ Visual refresh: final CSS layer `[20] refreshV115` in `theme.css` (screen only, token-based, does not override the 1366×768 compact sizing). Login top-clipping fix, dark-mode chart palette, mobile dashboard shortcuts in one scrollable row.
21. ✅ Removed unused variable font file; preload Regular/Bold; print-font prefetch deferred to browser idle time.

## Done in v117
22. ✅ 385 static inline styles in JS templates moved to `u-*` utility classes (`:where(.u-x){…!important}` in `<style id="appCss">`), 33 scripts cache-bumped to `?v=117`. Verified: per-line textual proof (every removed declaration maps 1:1 to a class), offline harness 0 diffs / 43,356 records, `css_harness.py imp` shows no low-specificity `!important` rule that could change the cascade.
    Kept inline on purpose: print documents (`doc*` builders, `print/forms.js`, `payslip/sheet.js` — the form designer rewrites `el.style`), 23 dynamic `${…}` styles, chart legend swatches (matched by `[style*=…]` in theme.css), 2 `grid-column` fields (nav.js rewrites them).

## Completed verification

23. ✅ Run the new mock-data harness (`css_harness.py snap <dir> --mock`, `tests/mock_api.js`) on the v116 tree vs v117 and confirm 0 diffs.
    Done (2026-11-21): the v117 harness (`css_harness.py` + `mock_api.js`) was run on the v116 and v117 `client/` trees, one config per process (8 runs per tree, Chromium 159 headless). Each config has 46 views (pages + person-workspace tabs + personnel profile), with 15,308 records on desktop and 15,354 on mobile. `css_harness.py diff`: **122,648 element records across 8 configs, 0 diffs** (exit 0). Sensitivity check: changing one JS-template-only utility (`u-mt14` 14px→15px) gave 2,141 diffs in one config, so the mock does render the JS-generated markup. No code changes were needed.

## Done in v118
24. ✅ `theme.css` per-page layers [04]–[12] merged into one section `[04] pagesV118`: shared components written once with `:is(#page-…)` lists (same specificity), page-specific rules grouped below. New tokens `--ui-teal-line`, `--ui-emerald-line`, `--ui-red-line`, `--ui-amber-line`, `--ui-search-icon`; one dead selector-less rule removed from [13]. File: 1717 → ~1120 lines. Verified: `css_harness.py` offline (43,356 records) and `--mock` (122,648 records), 0 diffs; plus a forced :hover/:focus variant of the harness, 0 diffs (a hover-only mutation gave 680 diffs, so it is sensitive).
25. ✅ Bug fix (intentional visual change): warning/error messages using `u-bg-amber-soft` / `u-bg-red-soft` on vefagh, cheque, monthly changes, services, goods etc. showed the green "success" border; they now get the amber/red border like the loan pages. `theme.css?v=118`.
26. ✅ One client bundle: `server/clientBundle.js` serves the HTML with a single `/js/bundle.js?v=<hash>` (manifest order, source map, rebuilt when files change, `CLIENT_BUNDLE=0` turns it off). It refuses to bundle and falls back to the 51 separate scripts if tags ≠ manifest, a file lacks `"use strict"`, the bundle does not compile, or a top-level function name is declared in two files. The file on disk is unchanged. Verified in Chromium: same 50 modules in the same order, 1,776 globals identical, 0 errors, harness 0 diffs vs separate scripts.

## Done in v118_3

27. ✅ `tests/test_client_bundle.js` (26 tests; suite now 146/146): `vlq`, `readManifest` (invalid/empty/duplicate/bad names), `buildBundle` (order, separators, CRLF/BOM, deterministic hash, source map decoded line-by-line against the sources, strict mode and execution order proven by running the bundle in `vm`, every refusal: missing `"use strict"`, duplicate top-level function, syntax error, duplicate `let/const/class`, real `client/` tree), `rewriteHtml` (all mismatch cases → null), the middleware over a real Node `http` server and over Express-style req/res (HTML `no-store`, byte-exact `Content-Length`, HEAD, immutable only for the right `?v=`, GET/HEAD only, own paths only, rebuild on change, one warning per failure then recovery, `CLIENT_BUNDLE=0` reads no file and serves nothing). Mutation-checked: 33/33 mutations of `clientBundle.js` fail the tests.
    **Gap found and fixed (v118+):** `topLevelNames()` used to read names from the outer sandbox object, which only mirrors top-level *functions* (V8 does not copy `var` there), so `function X` in one file plus `var X` in another was NOT refused although the header comment said it was; the behaviour differs from separate scripts (function hoisting). It now reads the names from inside the context (`Object.getOwnPropertyNames(globalThis)`), which sees every top-level `var` (plain, multiple, destructuring, in `if`/`for`/`try` blocks) and still ignores strings/templates, nested functions, block-scoped functions and `let/const/class` (the compile check covers those). A function/var clash in either order now makes the bundle refuse and the page fall back to the separate scripts (one warning naming the identifier); `var`/`var` stays allowed. The real tree is unaffected: it bundles to the same hash as before (`cc857fc3c621`). Tests: refusal for both orders and 9 `var` shapes, middleware fallback, allowed cases; mutation-checked (7 more mutations of the new logic fail the tests).
28. ✅ Start the real server (`npm start`) and confirm `/`, `/js/bundle.js?v=…` and the `.map` through Express + compression.
    **Verified on Windows (2026-11-21), Node.js `v24.21.0`, Express `4.22.3`, compression `1.8.2`, port `4500`.** All three GET requests returned `200 OK`: `/` returned HTML with `Cache-Control: no-store`; the versioned bundle returned JavaScript with `Content-Encoding: gzip`, `Vary: Origin, Accept-Encoding` and `Cache-Control: public, max-age=31536000, immutable`; the source map returned JSON with `Content-Encoding: gzip`, the same `Vary` header and `Cache-Control: no-cache`. Bundle and map used chunked transfer and did not send a stale `Content-Length`. Security headers (CSP, nosniff, frame options, referrer policy, permissions policy, CORP and permitted-cross-domain policy) were present on all three responses. Verified with `curl.exe` and `Accept-Encoding: gzip` for bundle/map. This confirms HTTP integration through real Express + compression; it does not constitute a database workflow or print-output test.
## Completed in v119 (items 29–35)

All items 29–35 are complete. Item 31 was closed as **verified, no change needed**; no code change was appropriate. Detailed findings, counts, intentional visual differences, and verification notes are recorded below.

29. ✅ **Compact/dark/refresh CSS layer consolidation — DONE**
    - Merged the overlapping 1366×768 compact layers [14] and [15]; `theme.css` decreased from 1,116 to about 964 lines; the harness now covers 10 configurations, including `light-rtl-compact` and `dark-rtl-compact`.
    - The initial v118_3 → v119 comparison exposed a real regression: 5,454 differences in the two compact configurations, caused by removing `.brand b{font-size:14px}` even though it wins the cascade at 1366×768. The rule was restored and the misleading comment corrected.
    - Final verification: offline **54,100 records / 10 configs / 0 diffs**; `--mock` **153,144 records / 10 configs / 0 diffs**. Only after this confirmation, `theme.css?v=118` was changed to `?v=119`.

30. ✅ **Navigation icon audit and cleanup — DONE**
    - Added 21 sprite symbols (18 → 39); all 27 menu buttons now have distinct icons. Replaced the specified text glyph controls with SVG and added accessible labels/titles where appropriate.
    - Directional icons preserve RTL/LTR behavior. Geometry was adjusted after the first pass; final verification found no content-element height changes. Desktop/mobile, navigation states, and key interactions were checked across 46 views with **0 JavaScript errors**.
    - Tiny mixed-symbol `wkl-*` layout chips and ▲▼ report-data markers were intentionally left unchanged to avoid inconsistent partial conversion.

31. ✅ **Financial table alignment — VERIFIED; NO CHANGE NEEDED**
    - Audited 101 numeric columns across 31 views. All use `text-align:start`, `tabular-nums`, RTL direction, and headers aligned with their cells; negative signs render correctly.
    - `.money` emphasis differences are colour/weight choices, not alignment defects. No code change was made.

32. ✅ **Complete and rationalize design tokens — DONE**
    - Added `--ui-control-h` and `--ui-gap-xs/sm/md/lg` (8 form controls and 36 `gap` declarations). Existing radius, font-size, and shadow values were already appropriately tokenized.
    - Left `padding:10px 14px` un-tokenized because its six uses belong to unrelated contexts.
    - Verified: offline **71,110 records / 10 configs / 0 diffs**; mock **95,602 records / 10 configs / 0 diffs**.

33. ✅ **Unify light/dark palette definitions — DONE**
    - Confirmed there are no duplicate declarations within a scope and that light/dark semantic values are not accidentally identical. Kept the `appCss` values needed by print windows.
    - Removed unused `--ui-sb-primary-fg` and the redundant dark `--panel:var(--card)` definition.
    - Verified: offline **71,110 records / 10 configs / 0 diffs**; mock **38,214 records / 2 configs / 0 diffs**.

34. ✅ **Current-page title and header consistency — DONE**
    - Set HTML `<title>` to the brand name, removed repeated `#pageSub`, and made the sidebar brand the single source for the application name used by `document.title`.
    - Verified 27 pages × 2 widths. Intentional difference: the non-compact desktop header is 6.5px shorter and following content moves up uniformly by 6.5px; compact and mobile layouts are unchanged.

35. ✅ **Dark-mode and responsive visual audit — DONE**
    - Fixed the six person-search inputs, import `.banner.green`, and Mehr `.hb-bar` under `html.ui-dark`.
    - Light mode has **0 diffs**. In dark mode, only the intended target elements changed; desktop/mobile/compact layouts and before/after screenshots were reviewed.

### v119_1 archive verification

- The uploaded `v119_1` archive contains the completed v119 work above; `client/payslip-online.html` references `theme.css?v=119`.
- Rebuilt the client bundle from the archive: 51 files, hash **`1b387ef5ac0f`**, matching the v119 changelog entry.
- Ran `npm test` from `payroll-server/server`: **146/146 tests passed**.
- The changelog entry for v119 is consistent with the checked archive on the verified points: stylesheet cache version, bundle hash, test count, and the recorded item 29–35 outcomes.
- No server/API/database/payroll-calculation/print-form changes are claimed for this v119 CSS/client pass. The 146 automated tests do not replace live MySQL, printer, or production-data verification.

### Remaining review queue (items 36–47)

The following items have not yet been audited against the uploaded v119_1 source. Inspect the current repository before changing anything; if an item is already implemented, record the evidence and mark it complete without rewriting it.

### A. Accessibility and interaction

36. ✅ **Dialog accessibility audit — DONE (v120, browser keyboard test pending)** — `dlgOpen` gained `box`/`label`; admin password (`#pwDlg`), login (`#loginWrap`, Escape intentionally disabled) and Ctrl+K palette (combobox/listbox + `aria-activedescendant`) now use it; mobile-menu Escape returns focus to `#mMenu`. Native `<dialog>` not adopted (custom stack already handles focus/Escape).
    - Inspect `core/dialogs.js` and every dialog implementation before deciding whether native `<dialog>` is appropriate.
    - Verify keyboard focus entry, focus containment where required, focus restoration, Escape handling, and accessible labels.
    - Avoid replacing working custom dialogs unless the change is demonstrably compatible.
    - Test keyboard-only interaction and the main dialog flows.

37. ✅ **Loading, empty, and notification states — DONE (v120)** — 18 load-error placeholders now red + `role=alert` (2 table cells red only), 17 loading placeholders `role=status`, print-window `#pvMsg` `role=status`. The only native `alert/confirm` calls are inside print windows (no in-app dialog there), kept on purpose.
    - Audit loading indicators, empty states, and user-facing notifications for consistency.
    - Review remaining native `alert()` usage and replace it only where an existing in-app notification pattern is suitable.
    - Preserve error visibility and avoid hiding important server or validation messages.

38. ✅ **Reduced-motion and keyboard focus — DONE (v120, CSS harness run pending)** — solid `--focus` ring for `.btn`/nav/personnel rows (theme.css end); personnel rows keyboard-operable (Enter/Space); static `#netBar` under reduced motion; insurance smooth scroll honours the preference.
    - Audit `:focus-visible` coverage for interactive controls and navigation.
    - Audit `prefers-reduced-motion` handling for animations and transitions.
    - Add missing styles without changing normal interaction behavior.

### B. Client and server maintenance

39. ✅ **Lightweight synchronization audit — DONE (v120)** — `syncQuiet` forced full reload every 10 ticks (2 min) even when idle; now only the tick after a version change, else every 50 ticks; legacy servers unchanged; 400/404 handling unchanged.
    - Review the existing `GET /api/sync` flow and determine whether any remaining client views still fetch more data than necessary.
    - Propose a minimal change only where measurable network or rendering cost remains.
    - Preserve reset/HTTP 400 handling and verify with the mock API harness.

40. ✅ **Split remaining `extras.js` responsibilities — DONE (v120)** — `extras.js` was already a shim. Installment math moved to pure `server/installments.js` (re-exported by `extrasCommon.js`); duplicate `lastOf` removed from `routes/emdad.js`; new `tests/test_installments.js` (5 tests). Client manifest untouched.
    - Inspect the current file and identify cohesive feature groups that are still coupled.
    - Split only where it improves ownership or maintainability.
    - Preserve script load order, global names, API behavior, and the existing bundle manifest.
    - Add or update focused tests for each extracted module.

41. [ ] **Async error-handling consistency**
    - Audit API routes for repeated `try/catch` patterns and existing `asyncHandler` usage.
    - Standardize only cases with equivalent error semantics.
    - Preserve status codes, response bodies, logging, and transaction cleanup.

42. [ ] **Personnel search cache invalidation**
    - Audit which API operations invalidate the personnel search/index cache.
    - Ensure read-only or unrelated updates do not trigger unnecessary invalidation.
    - Do not weaken invalidation for operations that actually change indexed personnel data.

43. [ ] **HTML escaping and injection-safety audit**
    - Audit `esc()` and all HTML-template insertion paths, including attributes and JavaScript-generated markup.
    - Verify escaping for quotes and relevant HTML-sensitive characters in each output context.
    - Add regression tests for any uncovered context; do not treat HTML escaping as interchangeable with JavaScript or URL encoding.

44. [ ] **Database query projection audit**
    - Identify avoidable `SELECT *` queries in frequently used routes.
    - Replace them with explicit column lists only after checking all consumers and response contracts.
    - Preserve query semantics and add/update tests where practical.

45. [ ] **Logo and configuration storage audit**
    - Review whether the application logo is embedded as Base64 in settings or responses and whether a separate asset path would be beneficial.
    - Review whether database pool settings such as `connectionLimit` should be environment-configurable.
    - Make changes only if they improve deployment or runtime behavior without breaking existing installations.

46. [ ] **Version and dependency consistency**
    - Audit application version strings, cache-busting versions, bundle hash behavior, `package.json`, and `package-lock.json`.
    - Ensure dependency metadata and lockfile are synchronized.
    - Do not change dependency versions as part of a consistency-only pass.

47. [ ] **Multi-process shared state (conditional)**
    - Only investigate this if the deployment is expected to run multiple Node.js processes or instances.
    - Identify in-memory counters, locks, caches, or session-related state that must be shared.
    - Do not introduce Redis or another shared store unless the deployment requirement justifies it.

## Execution and verification rules

- Items 36–40 implemented in v120 (changed client files bumped to `?v=120`). Verification: `npm test` passed **151/151**; `node --check` passed for all JavaScript files. `css_harness.py` could not run in this review environment because the Playwright Chromium executable is unavailable; the 10-config offline/`--mock` comparison and manual keyboard pass remain pending. Items **41–47 remain**.
- Work on one numbered item at a time. Before editing, inspect the current checked-out repository/version and report what is already implemented; do not assume an older archive is the baseline.
- Prefer audit and evidence before edits. If no defect or measurable benefit exists, record the finding and close the item without changing code (as done for item 31).
- Keep changes narrowly scoped and backward-compatible. Do not alter production data or database schemas without explicit approval.
- Run focused tests first, then the full test suite. For CSS/visual work, use offline and mock harnesses and target zero unintended computed-style differences.
- For navigation changes, verify desktop, mobile, active states, customized groups, and SVG rendering.
- For each completed item, record files changed, findings, tests, intentional differences, and remaining limitations here and in the changelog when it represents a user-visible/versioned change.
