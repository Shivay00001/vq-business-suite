# Subscription Expiry Manager

Track software & SaaS subscriptions on-device: renewal alerts at 30/15/7 days and total yearly SaaS spend.

- **Cluster:** platform-lifecycle (Cluster N)
- **Slug:** `subscription-expiry-manager`
- **Files:** `index.html`, `app.js`
- **Storage:** browser vault (`subscriptions` record), max 25 subscriptions, reads unmetered.
- **Metering:** 20 tracker actions/day via `Freemium.check` (add/remove).

Pure API (node-testable via `module.exports`): `validateSub`, `addSub`, `removeSub`, `daysUntil`, `alertFor`, `annualCost`, `totalYearlySpend`, `oneTimeSpend`, `renewalsInDays`, `fmtINR`, `esc`.
