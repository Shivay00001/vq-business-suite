# Tender Eligibility Checker

Compare tender minimum criteria (average annual turnover, years of experience,
similar past contracts, EMD capacity, bidder category, registration) against your
company profile and get an **eligible / marginal / no-go** verdict with a
per-criterion gap list.

## Verdict logic

- Each numeric criterion → **pass** (meets requirement), **marginal** (within 10%
  shortfall — risky), **fail** (short by more).
- Any fail → **no-go**; any marginal (no fail) → **marginal**; all pass → **eligible**.
- Category/registration matching is text-based — spell it as the NIT does.

## Notes

- EMD is typically 1–2% of estimated contract value (verify the NIT); NSIC/MSE/Udyam/
  Startup India bidders are often exempt via Bid Securing Declaration.
- Heuristic only — the tender evaluation committee decides on your submitted
  documents. Confirm with your CA/consultant before bidding.

## Files

- `index.html` — page, SEO head, FAQ, AdSense slots
- `app.js` — pure logic (node-testable) + browser UI
- `README.md` — this file
