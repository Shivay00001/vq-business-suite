# Batch 4 — Team K: Cluster K (PRICING, PROFIT & DECISION SUPPORT)

Date: 2026-09-26 · 10 apps built · tests: `tests/team-k-pricing-tests.js` → **42/42 pass**

Existing slugs checked in `core/apps.json` first: `pricing-calculator`, `profit-loss-generator`,
`break-even-calculator`, `working-capital-analyzer` already exist and were **not** rebuilt.
No existing slugs collided with the 10 new ones. `core/`, top-level pages, `ARCHITECTURE.md`
and sibling app folders were not touched; registry entries were written to
`reports/registry-cluster-k.json` (not into `core/apps.json` directly).

## Apps

### 1. cost-buildup-calculator
Landed cost per unit. Formula: `landed = material+labour+overhead+freight (+ input GST if ITC not claimable)`,
`perUnit = landed ÷ units`, `suggestedPrice = perUnit ÷ (1 − targetMargin)`. GST treatment:
ITC claimable → GST excluded from cost; otherwise added. Vault-saved buildups (max 25).

### 2. discount-impact-analyzer
Breakeven uplift: **`uplift = d / (m − d)`** (d = discount %, m = margin % on price).
If d ≥ m → flagged unrecoverable (feasible:false), never infinite math. Rupee comparison:
old profit vs discounted profit at same volume, required volume (computed from the
**unrounded** ratio, then ceil), profit at that volume. Correction during testing: required
volume initially used the display-rounded ratio (1.33 → 665 units); fixed to use the exact
ratio (→ 667 units), so profit at required volume ≥ old profit.

### 3. what-if-scenario-simulator
Three scenarios over price/volume/unit-cost/fixed-cost. `P = (p−c)·v − F`. Exact waterfall:
`ΔP = Δp·vB + (pA−cB)·Δv − Δc·vA − ΔF` — verified to sum exactly to the profit delta
(1200 = 10000 − 5000 − 1800 − 2000 in tests).

### 4. product-profit-analyzer
Per-SKU gross, margin %, contribution share; ranked best→worst **by profit rupees**
(not margin %). Weighted avg margin. Vault-persisted SKU list (max 25, deduped names).

### 5. margin-volatility-tracker
Monthly margin % → mean, **sample** σ (n−1), flag months with |margin−mean| > 2σ,
trend (last-3 avg vs first-3 avg), rating Stable/Moderate/Volatile/Highly volatile.

### 6. profit-leakage-radar
Five leak channels (discounts, wastage, returns, shrinkage, idle staff), each with
monthly ₹ estimate + 0–3 severity. `annualLeak = Σ monthly×12`, `leakPct = leak/revenue`,
rating <2% Guarded · 2–5% Watch · 5–10% Leaking · >10% Critical; severity-pressure score 0–100.

### 7. revenue-concentration-analyzer
Herfindahl on 0–10,000 scale: `HHI = Σ share%²`; <1,500 Diversified · 1,500–2,500 Moderate ·
≥2,500 High risk. Plus top-1/top-3 shares, effective count (10,000/HHI), and
what-if-top-leaves rupee impact. Works in customer or SKU mode.

### 8. seasonal-pricing-advisor
`index = month ÷ avg × 100`; index > 110 → peak ×1.05; < 90 → off-peak ×0.95.
Revenue uplift re-prices the same volumes (assumes price-inelastic volume — stated on screen).
Note: uplift can be negative when more volume sits in off-peak months (tested: −750).

### 9. competitor-price-comparator
`gap% = (your − marketAvg) ÷ marketAvg × 100`; within ±5% = At par; >+5% Premium;
<−5% Budget; alert when |gap| > 15%. Portfolio counts + avg |gap|.

### 10. decision-support-engine
`score = Σ weight × score(1–10)`, weights must sum to exactly 1.00. Sensitivity:
each weight ±20% (others renormalised), re-score; winner flip → "fragile", no flip → "robust".

## Contract compliance (all 10 apps)
- `index.html`: `body[data-app="<slug>"]`, one `<h1>`, `<main class="vq-main">`, 2 AdSense
  placeholder slots (`Ads.render` top + bottom with `<!-- ADSENSE: -->` comments),
  EN + Hindi `<details>` FAQs mirrored in `SEO.faq([...])` (FAQ JSON-LD via core/seo.js),
  full SEO head (title, description, keywords, canonical, OG), mobile-friendly via core/shell.css.
- Script order: shell.js, uid.js, vault.js, freemium.js, ads.js, seo.js, then app.js.
- `app.js`: pure functions first, `module.exports` for node; browser UI after.
  `Freemium.check(slug, 20)` per calculation, `Freemium.renderUpsell` on denial.
  Vault saves awaited, capped at 25; reads unmetered. All user input escaped via `esc`.
  All numeric inputs validated (finite, non-negative, range caps).

## Tests — 42 total, 42 pass
Per app ≥2 tests + adversarial (zero margin, 100% discount, negative costs, zero units,
zero revenue, single-month/single-customer degenerate series, bad month format, severity
out of range, weights ≠ 1, scores outside 1–10, 26th item over the 25 cap).

Run: `node tests/team-k-pricing-tests.js` · Syntax: `node --check apps/<slug>/app.js` (all pass).

## Flags / follow-ups for parent
- One app-code correction made (discount-impact required-volume precision); two test
  expectations corrected (they encoded wrong arithmetic, the app math was right).
- Registry entries are in `reports/registry-cluster-k.json` for the parent to merge
  into `core/apps.json` — not edited directly per instructions.
- Seasonal advisor's uplift assumes volume is price-inelastic; this is stated on-screen
  and in assumptions, but worth knowing for any "guaranteed upside" claims.
- All 10 READMEs written in their app folders.
