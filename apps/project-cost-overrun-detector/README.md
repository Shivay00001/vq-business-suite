# Project Cost Overrun Detector

Early overrun detection using earned-value math: enter budgeted vs actual per
cost head with honest % complete; get variance %, CPI, projected final cost
(EAC = BAC/CPI), and on-track / watch / overrun flags.

## Formulas

- EV (earned value) = Budget × % complete
- CV (cost variance) = EV − Actual
- CPI = EV ÷ Actual (below 1.0 = over budget)
- EAC (estimate at completion) = BAC ÷ CPI
- VAC = BAC − EAC (negative = forecast overrun)

## Flags

CPI ≥ 1 → on-track · 0.9–1.0 → watch · < 0.9 → overrun

## Notes

- % complete must be physical % complete, not % of budget spent.
- Planning aid, not project accounting — confirm with your accountant/CA.

## Files

- `index.html` — page, SEO head, FAQ, AdSense slots
- `app.js` — pure logic (node-testable) + browser UI
- `README.md` — this file
