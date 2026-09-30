# Usage Metering Tool

Log API/tool usage per client, track quota vs used (80% near-quota band), and estimate overage billing. On-device.

- **Cluster:** platform-lifecycle (Cluster N)
- **Slug:** `usage-metering-tool`
- **Files:** `index.html`, `app.js`
- **Storage:** browser vault (`clients` record), max 25 clients, reads unmetered.
- **Metering:** 20 metered actions/day (add/log/reset/remove).

Pure API: `addClient`, `logUsage`, `resetUsage`, `removeClient`, `quotaStatus`, `overageBill`, `portfolioBill`, `fmtINR`, `esc`.
