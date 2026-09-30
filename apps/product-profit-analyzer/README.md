# Product Profit Analyzer

Per-SKU profitability ranking by profit rupees.

## What it computes

Per SKU (from revenue + COGS):

- Gross profit = revenue − COGS
- Margin % = gross ÷ revenue
- Contribution share = SKU gross ÷ total gross

Portfolio totals, weighted average margin, and best/worst ranking.
SKUs persist on-device (max 25), reading is unmetered.

## API

- `addSKU(skus, {name, revenue, cogs})` — max 25, rejects duplicates
- `removeSKU(skus, name)`
- `analyzeSKUs(skus)` — totals, ranked list, best, worst

## Files

`index.html`, `app.js` (pure API exported for node tests), `README.md`

## Limits

- Free: 20 analyses/day
- Fixed costs are not allocated per SKU (contribution view)
