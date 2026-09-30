# Retention Money Calculator

Track retention money per contract: retention % of contract value (typically
5–10% in Indian works/supply contracts), release due date (completion + defect
liability period), released vs locked amounts, and total locked working capital
across up to 25 contracts.

## How to use

1. Add a contract: name, value, retention %, optional cap %, completion date,
   DLP months (default 12).
2. The register shows per-contract retention, release due date, and badges
   (Locked / Release due / Released).
3. **Mark released** when the client pays it back; **Save snapshot** stores the
   register on this device.

## Notes

- Retention earns no interest — it is locked working capital.
- Some contracts release retention in parts — record each part as a separate
  contract entry.
- Planning aid, not financial advice — confirm terms in your agreement and with
  your CA.

## Files

- `index.html` — page, SEO head, FAQ, AdSense slots
- `app.js` — pure logic (node-testable) + browser UI
- `README.md` — this file
