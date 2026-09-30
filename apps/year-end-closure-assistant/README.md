# Year-End Closure Assistant

Financial-year closing checklist for India (FY ends 31 March): stock count, debtor/creditor confirmations, provisions, depreciation blocks, TDS/GST reconciliation. Progress tracking + blocking mandatory items.

- **Cluster:** platform-lifecycle (Cluster N)
- **Slug:** `year-end-closure-assistant`
- **Files:** `index.html`, `app.js`
- **Storage:** none (stateless). **Metering:** 20 progress checks/day.

Pure API: `fyLabel`, `fyEnd`, `progress`, `blockingItems`, `itemsByPhase`, `esc`.
