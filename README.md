# Persian Payroll & Personnel Management System

[![CI](https://github.com/hamedkavir/payroll-server/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/hamedkavir/payroll-server/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-22%20%7C%2024-339933?logo=node.js&logoColor=white)](https://nodejs.org/)

A self-hosted, Persian-language payroll and personnel management application for teams. It combines payslip viewing, personnel records, loan-fund workflows, advances, goods requests, institutional services, and related administrative operations in one shared MySQL-backed system.

The application is designed for private organizational deployment: the server and database are hosted by the organization, while authorized users access the same central data through a browser.

> **Language:** The user interface and the detailed installation guide are primarily in Persian. This README provides an English project overview.

## Highlights

- **Payroll and payslips:** manage payroll-period data and view employee payslips.
- **Personnel records:** maintain personnel information and related employment/status history.
- **Loans and advances:** manage loan requests, queue workflows, advances, installments, and related forms.
- **Goods requests and inventory:** handle employee goods requests, installment settings, and reports.
- **Institutional services:** prepare and track service requests and printable correspondence.
- **Access control:** API-key protection, individual user accounts, sessions, and section-level read/write permissions.
- **Backups and migrations:** database setup, versioned migrations, and backup/restore workflows.
- **Persian-first experience:** right-to-left layout, Persian text, spreadsheet import/export, and print-ready forms.
- **Build-free client:** HTML, CSS, and ordered classic JavaScript files; no frontend build step is required.
- **Client delivery optimization:** the server can serve a versioned JavaScript bundle and falls back to separate scripts if bundle validation fails.

## Technology

- **Backend:** Node.js, Express
- **Database:** MySQL 8+
- **Frontend:** HTML, CSS, vanilla JavaScript
- **Automated tests:** Node.js test runner and project-specific test harness
- **CI:** GitHub Actions on Node.js 22 and 24

## Repository layout

```text
.
├── .github/workflows/ci.yml
├── LICENSE
├── README.md
├── PLAN.md
├── AGENTS.md
└── payroll-server/
    ├── client/          # Browser application (HTML, CSS, JavaScript)
    ├── server/          # Express API and database integration
    ├── tests/           # Automated tests and CSS verification tools
    ├── migrations/      # Versioned database migrations
    ├── schema.sql       # Base schema for a new installation
    ├── README.md        # Detailed Persian setup and user guide
    └── CHANGELOG.md     # Project version history
```

## Requirements

- Node.js 22 or 24 (the server package declares Node.js >=18.17).
- npm (included with Node.js).
- MySQL 8 or a compatible MySQL server.
- A modern desktop browser.

## Quick start

1. Create an empty MySQL database and a dedicated database user. Grant that user only the permissions required by the application.
2. Open a terminal in the server directory:

   ```bash
   cd payroll-server/server
   npm ci
   ```

3. Create the local environment file:

   **macOS / Linux**
   ```bash
   cp .env.example .env
   ```

   **Windows PowerShell**
   ```powershell
   Copy-Item .env.example .env
   ```

4. Edit `.env` and set at least the database connection values, a long random `API_KEY`, and the correct `CORS_ORIGIN` for your deployment. Never use the example values in production.
5. Initialize a new database, then start the application:

   ```bash
   npm run setup-db
   npm start
   ```

6. Open [http://127.0.0.1:4000](http://127.0.0.1:4000) (or the host and port configured in your environment).

The first administrator is provisioned with a randomly generated temporary password. It is printed once to the server startup terminal. Store it securely, sign in, and change it immediately. Do not share or commit startup logs.

For the full Persian installation guide, Windows/PowerShell instructions, configuration reference, permissions, API routes, and operational notes, see [payroll-server/README.md](payroll-server/README.md).

## Configuration and security

The server reads configuration from `payroll-server/server/.env`. A template is provided at `payroll-server/server/.env.example`.

Important settings include:

| Variable | Purpose |
| --- | --- |
| `DB_HOST`, `DB_PORT` | MySQL server address and port |
| `DB_USER`, `DB_PASSWORD`, `DB_NAME` | Dedicated database credentials and database name |
| `PORT` | HTTP listening port (default: 4000) |
| `API_KEY` | Long, random API access key |
| `CORS_ORIGIN` | Explicit allowed browser origin(s); use the production domain, not a wildcard |

Before exposing an instance to a network:

- Use HTTPS through a properly configured reverse proxy.
- Set a strong, unique `API_KEY` and database password.
- Restrict `CORS_ORIGIN` to trusted origins.
- Keep MySQL private; do not expose its port to the public internet.
- Use least-privilege database credentials and restrict server filesystem access.
- Keep backups encrypted and access-controlled.
- Never commit `.env` files, credentials, database exports, backups, employee photos, logs, or real personnel/payroll data.
- Use synthetic data in screenshots, examples, bug reports, and tests.

This repository is public source code, **not** a hosted service. Deployment, security review, access control, backups, and legal compliance remain the responsibility of each operator. Payroll and personnel data can be highly sensitive; evaluate the application against your organization's security and privacy requirements before production use.

## Tests and continuous integration

Run the automated test suite locally:

```bash
cd payroll-server/server
npm ci
npm test
```

GitHub Actions runs the test suite and JavaScript syntax checks on Node.js 22 and 24 for pushes and pull requests targeting `main`. The workflow does not connect to a live MySQL database; database-related tests use the project's test harness. Live deployment, migration, backup/restore, printing, and browser-level verification must be tested separately in a controlled environment.

## Project documentation

- [Detailed Persian guide](payroll-server/README.md)
- [Version history](payroll-server/CHANGELOG.md)
- [Development roadmap and verification notes](PLAN.md)
- [Contributor/development notes](AGENTS.md)

## Community and project policies

- [Contributing guide](CONTRIBUTING.md)
- [Security policy](SECURITY.md)
- [Code of Conduct](CODE_OF_CONDUCT.md)

## Contributing

Issues and pull requests are welcome. Please:

1. Describe the problem and the expected behavior.
2. Include reproducible steps and sanitized sample data.
3. Add or update tests for behavior changes.
4. Run `npm test` before submitting a pull request.
5. Never include real employee information, credentials, database dumps, or private operational files.

## License

This project is licensed under the [MIT License](LICENSE). Third-party packages and assets remain subject to their respective licenses; see their upstream notices and package metadata.
