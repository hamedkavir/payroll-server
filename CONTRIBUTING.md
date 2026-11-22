# Contributing

Thank you for considering a contribution to Persian Payroll & Personnel Management System.

## Before opening an issue
- Search existing issues to avoid duplicates.
- Include the affected version, environment (OS, Node.js, MySQL), reproduction steps, expected behavior, and actual behavior.
- Replace all real employee, payroll, bank, and organization data with synthetic examples.
- Never attach credentials, environment files, database dumps, backups, logs containing personal data, or employee photos.

## Development setup
Requirements: Node.js 22 or 24, npm, and (for full integration testing) MySQL 8+.

```bash
cd payroll-server/server
npm ci
npm test
```

The automated suite uses the project's test harness and does not require live MySQL. Never point tests or experiments at a production database.

## Pull request process
1. Create a focused branch from `main`.
2. Keep changes narrowly scoped and explain the problem and solution.
3. Add or update automated tests for behavior changes.
4. Run `npm test` and `node --check` on changed JavaScript files.
5. For CSS changes, run the CSS harness when Playwright Chromium is available and describe intentional visual differences.
6. Update `payroll-server/CHANGELOG.md` for user-visible changes and `PLAN.md` when roadmap status or verification changes.
7. Open a pull request with a clear summary, testing evidence, and remaining limitations.

## Compatibility and data safety
- Preserve API contracts and permission behavior unless addressing a documented defect.
- Do not edit migrations that have already been applied; add a new migration.
- Do not change production data or destructive database behavior as part of a pull request.
- Do not add secrets, private operational configuration, or real personal data.
- Do not claim browser, MySQL, backup/restore, printing, or production verification unless it was actually performed.

## Code style
Follow surrounding conventions and the repository's `AGENTS.md`. The browser client uses ordered classic scripts listed in `payroll-server/client/js/manifest.json`; preserve their order and global naming assumptions.

## License
By submitting a contribution, you agree that your contribution is provided under the repository's MIT License. Ensure you have the right to submit the code and any included assets.
