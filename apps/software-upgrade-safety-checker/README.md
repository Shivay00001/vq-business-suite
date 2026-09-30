# Software Upgrade Safety Checker

Pre-upgrade readiness checklist → risk score (0–100, low/medium/high/critical) + fill-in rollback plan template (copyable text).

- **Cluster:** platform-lifecycle (Cluster N)
- **Slug:** `software-upgrade-safety-checker`
- **Files:** `index.html`, `app.js`
- **Storage:** none (stateless). **Metering:** 20 checks/day.

Pure API: `riskScore`, `checkById`, `riskLines`, `rollbackPlan`, `esc`.
