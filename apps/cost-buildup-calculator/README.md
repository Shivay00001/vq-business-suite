# Cost Buildup Calculator

Landed (true) cost per unit for Indian manufacturers and traders.

## What it computes

- Total pre-GST cost = material + labour + overhead + freight
- GST on inputs: excluded when ITC is claimable, added when not
  (composition dealer / exempt supply / blocked credit)
- Landed cost per unit = landed total ÷ units
- Suggested selling price at your target margin-on-price:
  `price = per-unit cost ÷ (1 − margin)`

## Usage

1. Enter the four cost heads for the batch/lot.
2. Enter units, GST rate on inputs, and tick ITC if claimable.
3. Optionally set a target margin % to get a suggested price.
4. "Save buildup" stores up to 25 records on this device.

## Files

- `index.html` — page + SEO/FAQ
- `app.js` — pure API (`landedCost`, `addRecord`, `fmtINR`, `esc`) exported
  for node tests; browser UI below the export guard.

## Limits

- Free: 20 calculations/day (`Freemium.check`)
- Saved records: max 25 (device vault)
- Estimate only — confirm tax treatment with your CA.
