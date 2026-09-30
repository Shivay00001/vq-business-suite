# Project Delay Penalty Tool (LD Calculator)

Liquidated damages calculator for Indian contracts: LD % per week of delay on
contract value (part-week counts as full), capped at a max %.

## Defaults (typical GeM/government norm)

- **Rate:** 0.5% per week of delay
- **Cap:** 10% of contract value (usually the delayed/undelivered portion)
- Grace days (approved extension) excluded from chargeable delay

## How to use

1. Enter contract value — or the delayed/undelivered portion's value, since most
   government contracts levy LD on that portion only.
2. Enter delay days directly, or pick due date + actual completion to auto-fill.
3. Adjust rate/cap to match your contract's LD clause.

## Notes

- Estimate only, not legal advice — your contract's LD clause governs.
- Force majeure / extension-of-time must be applied for in writing and on time.

## Files

- `index.html` — page, SEO head, FAQ, AdSense slots
- `app.js` — pure logic (node-testable) + browser UI
- `README.md` — this file
