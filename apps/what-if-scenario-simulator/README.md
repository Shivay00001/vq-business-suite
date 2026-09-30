# What-If Scenario Simulator

Three-scenario profit comparison (base / optimistic / pessimistic) with an
exact profit waterfall.

## Math

Profit per scenario: `P = (price − unitCost) × volume − fixedCost`

Waterfall decomposition of (Alt − Base):

```
ΔP = Δp × vBase            (price effect)
   + (pAlt − cBase) × Δv   (volume effect)
   − Δc × vAlt             (cost effect)
   − ΔF                    (fixed-cost effect)
```

The four effects sum exactly to the profit difference (tested).

## API

- `scenarioProfit(s)` → contribution, profit, margin %
- `compareScenarios(base, [{name, scenario}])` → deltas vs base
- `waterfall(base, alt)` → exact four-effect decomposition
- `validateScenario(s, label)`, `addRecord(records, rec)` (max 25)

## Files

`index.html`, `app.js` (pure API exported for node tests), `README.md`

## Limits

- Free: 20 simulations/day
- Deterministic — no probability, elasticity, or seasonality modelled
