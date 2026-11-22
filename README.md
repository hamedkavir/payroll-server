# Payroll and personnel system (team edition)

A payslip, personnel, loan fund, advance and goods-request management system with a shared central database. The client remains build-free: its 51 ordered classic JavaScript files can be served as one versioned bundle with a source map; automatic fallback serves the original separate scripts if bundling is unsafe.

- **Server:** Node.js + Express + MySQL (`payroll-server/server`)
- **Client:** HTML + CSS + JavaScript with no build step (`payroll-server/client`), served by the server itself

## Running locally
```bash
cd payroll-server/server
npm install && cp .env.example .env   # fill in your database settings and API_KEY
npm run setup-db && npm start         # http://127.0.0.1:4000
npm test                              # tests, from inside payroll-server/server
```
Full guide (in Persian): `payroll-server/README.md`. Version history: `payroll-server/CHANGELOG.md`. Roadmap and verification record: `PLAN.md`.


## Security and privacy

- Never commit `.env`, credentials, database exports, backups, employee photos, or real personnel/payroll records.
- Copy `payroll-server/server/.env.example` to `.env` and set private values locally.
- The first administrator receives a random temporary password printed once to the server startup terminal; change it immediately and do not publish terminal logs.
- Sample files and form previews use synthetic data only.
