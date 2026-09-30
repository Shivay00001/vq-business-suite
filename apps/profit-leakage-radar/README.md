# Profit Leakage Radar

Checklist-scored leakage → estimated annual leak in ₹.

## What it computes

Five channels (discounts, wastage, returns, shrinkage, idle staff),
each with a monthly ₹ estimate + 0–3 severity:

- annualLeak = Σ monthly × 12
- leakPct = annualLeak ÷ annualRevenue × 100
- Rating: <2% Guarded · 2–5% Watch · 5–10% Leaking · >10% Critical
- pressureScore 0–100 from severity sums (qualitative cross-check)
- Ranked fix-first order by annual rupees

## API

- `estimateLeaks({annualRevenue, items: {id: {monthly, severity}}})`
- `LEAKS` channel definitions, `addRecord` (max 25)

## Files

`index.html`, `app.js` (pure API exported for node tests), `README.md`

## Limits

- Free: 20 assessments/day
- Estimates, not measurements; not a fraud-investigation tool
