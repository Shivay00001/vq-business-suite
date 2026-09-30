# System Health Monitor

Checklist-based IT health score (0–100, A–F grade) for small business: backups, updates, antivirus, disk, passwords, 2FA, Wi-Fi, exit revocation + prioritized action list.

- **Cluster:** platform-lifecycle (Cluster N)
- **Slug:** `system-health-monitor`
- **Files:** `index.html`, `app.js`
- **Storage:** none (stateless). **Metering:** 20 checks/day.

Pure API: `scoreChecklist`, `actionList`, `checkById`, `esc`.
