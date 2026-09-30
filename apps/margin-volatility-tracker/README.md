# Margin Volatility Tracker

Margin % series analysis: σ, ±2σ outlier flags, trend, rating.

## Math

- margin % = (revenue − cost) ÷ revenue × 100
- σ = sample standard deviation (n−1), in margin points
- Flag month when |margin − mean| > 2σ
- Trend = avg(last 3) − avg(first 3)
- Rating: σ<2 stable · <5 moderate · <10 volatile · ≥10 highly volatile

## API

- `addMonth(months, {month, revenue, cost})` — max 25, YYYY-MM validated
- `removeMonth(months, label)`
- `analyze(months)` — rows, mean, stddev, band2sigma, flagged[], rating, trend
- `sampleStddev(xs)`

## Files

`index.html`, `app.js` (pure API exported for node tests), `README.md`

## Limits

- Free: 20 analyses/day
- Needs ≥ 2 months; flags most meaningful with ≥ 6
