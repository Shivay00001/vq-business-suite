# Bank Charge Leak Detector

Enter bank charges by type/month, benchmark against typical SME ranges, flag anomalies, annual leak total.

## Run
Open `index.html` directly in a browser (file://-safe) or serve the suite root statically.
Pure logic lives in `app.js` and is node-tested via `tests/team-j-banking-tests.js`.

## Metering
20 free calculations/day per app (Freemium). Vault reads unmetered; saves (where used) capped at 25, awaited.

## Notes
- See the on-screen "Assumptions stated on-screen" section for statutory and rate assumptions (verified Sep 2026).
- Estimates only — confirm with your CA before acting.
