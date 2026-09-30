# Discount Impact Analyzer

Breakeven sales uplift needed after a discount, from margin math.

## The formula

```
required uplift = d / (m - d)
```

where `d` = discount % and `m` = margin % on selling price.

Example: 10% discount at 40% margin → 0.10/(0.40−0.10) = 33.33% more
units needed to keep total profit flat. If d ≥ m, the discount is
unrecoverable (flagged as loss-making).

## What it computes

- `requiredUplift(marginPct, discountPct)` → uplift %, volume ratio, feasibility
- `profitComparison({price, unitCost, volume, discountPct})` → rupee profit
  today vs after discount at same volume, required volume, profit at that volume
- `upliftTable(marginPct)` → uplift needed for discount steps 5–50%

## Files

- `index.html`, `app.js` (pure API exported for node tests), `README.md`

## Limits

- Free: 20 calculations/day
- Margin is on selling price; fixed costs assumed unchanged
- Estimate only — confirm with your CA before deep-discount campaigns
