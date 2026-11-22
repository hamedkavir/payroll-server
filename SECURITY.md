# Security Policy

## Supported versions
Security fixes are currently developed against the latest code on the `main` branch. There is no promise of security backports for older snapshots or privately deployed forks.

## Reporting a vulnerability
**Please do not report exploitable vulnerabilities in public GitHub issues.**

Use GitHub's **Report a vulnerability** option in the repository's Security tab (private vulnerability reporting / security advisories), if enabled. If unavailable, contact the repository maintainer through the contact method listed on the maintainer's GitHub profile and ask for a private security-reporting channel.

Include a concise description and potential impact, affected commit/version/component, reproduction steps or a minimal proof of concept, and any suggested mitigation.

Do not include real employee records, payroll data, credentials, production database exports, or personal information in a report.

Please allow the maintainer reasonable time to investigate and prepare a fix before public disclosure. This is a best-effort policy; no response-time or remediation-time SLA is guaranteed.

## Deployment warning
This software handles highly sensitive payroll and personnel information. Operators are responsible for HTTPS, secret management, database isolation, access control, encrypted backups, updates, monitoring, and compliance with applicable laws and organizational policies. The public repository is source code, not a managed or security-certified service.
