# Seasonal Pricing Advisor

Seasonality index → peak/off-peak price multipliers.

## Math

- index = month ÷ average month × 100
- index > 110 → peak → ×1.05
- index < 90 → off-peak → ×0.95
- else normal → ×1.00
- Revenue uplift: same volumes re-priced vs flat base price

## API

- `analyze({sales: [12], basePrice})` — rows, peak/offPeak months,
  baseRevenue, adjustedRevenue, uplift
- `multiplierFor(index)`, `MONTHS`, `PEAK_MULT`, `OFF_MULT`

## Files

`index.html`, `app.js` (pure API exported for node tests), `README.md`

## Limits

- Free: 20 analyses/day
- All 12 months required; volume assumed price-inelastic (directional)
