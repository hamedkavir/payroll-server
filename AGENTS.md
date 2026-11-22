# Guide for future development sessions

## Project structure
- The application root is `payroll-server/`.
- Backend: `server/app.js` (Express), `server/routeTable.js` (central route registration and permission map), `server/auth.js`, and `server/routes/`.
- Frontend: `client/payslip-online.html`, `client/css/theme.css`, and the ordered classic scripts listed in `client/js/manifest.json`.
- `server/clientBundle.js` serves the ordered scripts as one versioned bundle with a source map; if validation fails, it falls back to the separate scripts.
- Keep script files as classic scripts (not ES modules), preserve manifest order, and avoid duplicate top-level `function`/`var` names.

## Important implementation rules
- Print styles belong in `<style id="appCss">` in `client/payslip-online.html`; `client/css/theme.css` is for screen styling.
- CSS cascade layers matter. Use existing tokens and utility classes; avoid introducing new inline styles without a reason.
- Route permissions are declared in `server/routeTable.js`; preserve the existing route order and permission semantics.
- Applied migrations must not be edited. Add a new versioned migration instead.
- The first administrator is created with a random temporary password printed once to the server startup terminal; the first login requires changing it. Never commit startup logs or real credentials.
- Keep real employee, payroll, bank, photo, database and backup data out of Git.

## Verification
- From `payroll-server/server`, run `npm test` (151 tests; fake database, no live MySQL required).
- Run `node --check` on changed JavaScript files.
- For CSS changes, use `tests/css_harness.py` snap/diff with Playwright Chromium installed; also compare mock-data views where relevant.
- For real HTTP, MySQL migration, backup/restore, printing and keyboard-only checks, record separately whether they were actually performed.
- Current roadmap and verification record: root `PLAN.md`; version history: `payroll-server/CHANGELOG.md`.
