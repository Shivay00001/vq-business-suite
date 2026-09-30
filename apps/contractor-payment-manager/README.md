# Contractor Payment Manager

RA (running account) bill register for contractors: bill no., date, certified
value, amount paid, holdback %, unpaid balance, and aging buckets
(current / 31–60 / 61–90 / 90+ days), with a collection summary.

## Rules

- Paid can never exceed certified (overpayments rejected).
- Holdback is a % of the certified bill held back, released with retention.
- Aging counts from the bill date; 90+ day dues need aggressive follow-up.

## How to use

1. Add each RA bill with certified value, paid amount and holdback %.
2. Use **+ Payment** on a bill row to record receipts (blocked if it would
   exceed certified).
3. **Save snapshot** stores the register on this device.

## Notes

- Receivables planning aid, not accounting advice — confirm TDS/GST treatment
  and contract terms with your CA.

## Files

- `index.html` — page, SEO head, FAQ, AdSense slots
- `app.js` — pure logic (node-testable) + browser UI
- `README.md` — this file
