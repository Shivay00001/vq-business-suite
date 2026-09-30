# Revenue Concentration Analyzer

Herfindahl-style concentration risk over customers (or SKUs).

## Math

- share % per entity = revenue ÷ total × 100
- HHI = Σ (share %)², 0–10,000 scale
- Rating: <1,500 Diversified · 1,500–2,500 Moderate · ≥2,500 High risk
- Effective count = 10,000 ÷ HHI
- Top-leaves impact: revenue at risk and remaining revenue

## API

- `addItem(items, {name, revenue})` — max 25, rejects duplicates
- `removeItem(items, name)`
- `analyze(items)` — hhi, top1/top3 shares, effectiveCount, rating, topLoss

## Files

`index.html`, `app.js` (pure API exported for node tests), `README.md`

## Limits

- Free: 20 analyses/day; needs ≥ 2 entries
