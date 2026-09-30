# Decision Support Engine

Weighted scoring of business options with a sensitivity stress-test.

## Math

- score(option) = Σ weight_c × score_c(option), scores 1–10
- Weights must sum to 1.00 (±0.001); all weights in (0, 1]
- Sensitivity: each weight perturbed ±20%, others renormalised
  proportionally, re-scored. Winner change = fragile; no change = robust.

## API

- `addCriterion(criteria, {name, weight})` / `addOption(options, {name, scores})`
  — max 25 each, unique names
- `normalizeWeights(criteria)` — enforces sum = 1
- `scoreOptions(criteria, options)` — ranked, winner, runnerUp
- `sensitivity(criteria, options)` — flips[], robust flag, verdict

## Files

`index.html`, `app.js` (pure API exported for node tests), `README.md`

## Limits

- Free: 20 decisions/day
- Linear additive model; decision aid only, not financial advice
