# Competitor Price Comparator

Your price vs competitors per SKU — positioning map + gap alerts.

## Math

- avgComp = mean of competitor prices (up to 10 per SKU)
- gap % = (yourPrice − avgComp) ÷ avgComp × 100
- Positioning: gap > +5% Premium · gap < −5% Budget · else At par
- Alert when |gap| > 15%

## API

- `compareSKU({name, yourPrice, compPrices})` — compPrices array or
  comma-separated string; returns entry with positioning + alert
- `addSKU(skus, entry)` / `removeSKU(skus, name)` — max 25
- `portfolioSummary(skus)` — counts per position, avg |gap|, alerts

## Files

`index.html`, `app.js` (pure API exported for node tests), `README.md`

## Limits

- Free: 20 comparisons/day (metered on add)
- Price only — quality/pack-size differences not modelled
