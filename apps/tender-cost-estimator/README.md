# Tender Cost Estimator

Build up a bid price from direct cost heads + indirect % + contingency % + margin %,
with tender document fee and EMD tracked as separate upfront cash needs.

## How to use

1. List direct cost heads, one per line as `name: amount` (materials, labour,
   transport, equipment, subcontractors…).
2. Set indirect/overhead %, contingency % and your margin %.
3. Enter tender fee and EMD (tracked as upfront cash — EMD is refundable and NOT
   part of the bid price).

## Formula

Total cost = Direct + (Direct × Indirect%) + (Direct × Contingency%)
Bid price = Total cost × (1 + Margin%)

## Notes

- Works on pre-tax cost — apply GST per the NIT (inclusive vs exclusive quoting).
- Estimate only; verify quantities, rates and taxes with your estimator and CA.

## Files

- `index.html` — page, SEO head, FAQ, AdSense slots
- `app.js` — pure logic (node-testable) + browser UI
- `README.md` — this file
