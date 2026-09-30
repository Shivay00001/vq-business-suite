# Auto Backup Scheduler

Backup plan builder: what/where/how often, 3-2-1 rule checker, next-backup schedule list. Plans saved on-device (max 25).

- **Cluster:** platform-lifecycle (Cluster N)
- **Slug:** `auto-backup-scheduler`
- **Files:** `index.html`, `app.js`
- **Storage:** browser vault (`plans` record), reads unmetered. **Metering:** 20 plan actions/day.

Pure API: `validatePlan`, `addPlan`, `removePlan`, `threeTwoOne`, `nextRuns`, `esc`.
