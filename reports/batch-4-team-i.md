# Batch 4 — Team I: Cluster I (Procurement & Vendor Management)

**Date:** 2026-09-26 · **Apps built:** 10/10 · **Tests:** 30/30 pass · **Syntax:** 10/10 `node --check` clean
**Template:** `apps/gratuity-calculator/` (index.html contract, SEO head, AdSense slots, FAQ + SEO.faq, script order, Freemium/Vault patterns)
**Nothing deployed/published. Zero spend.** Registry entries written to `reports/registry-cluster-i.json` (core/apps.json untouched).

## Per-app details

| # | Slug | What it does | Vault usage | Notes |
|---|------|--------------|-------------|-------|
| 1 | purchase-order-generator | GST POs: line items, intra-state CGST+SGST / inter-state IGST breakup, terms, printable (print CSS), FY numbering `VQ/26-27/0001` | Up to 25 POs saved, reloadable | GST slab user-entered; stated on-screen to verify with CA |
| 2 | vendor-comparison-tool | Quotes on price/lead/warranty/rating; weights must total 100; criteria normalised 0–1 across the set; ranked 0–100 | Up to 25 comparisons | Scores are relative to the comparison set — stated on-screen |
| 3 | vendor-performance-scorecard | Quality/delivery/price/responsiveness 0–100, weighted overall, grade A+..D, period-over-period trend | 25 ratings/vendor keyed `score:<vendor>` | Trend vs same vendor's previous rating |
| 4 | purchase-approval-workflow | Slab matrix (≤25k HOD; ≤1L +Finance; ≤5L +Director; above +MD), editable; chain order enforced; timestamped audit trail | Up to 25 requests + matrix | Out-of-turn actions refused; matrix edits don't rewrite old requests |
| 5 | vendor-rate-analyzer | CSV paste/upload (item,vendor,rate,date); hike flags vs previous same-vendor quote and vs lowest-ever; best vendor per item | Up to 25 snapshots | Max 2000 quotes/analysis; "best" is cheapest-latest only (stated) |
| 6 | bulk-purchase-optimizer | EOQ = √(2DS/H); total annual cost compared at EOQ vs each discount break qty; cheapest option recommended | Up to 25 analyses | Discount tier wins only if total cost < EOQ total |
| 7 | vendor-payment-tracker | Payables ledger, due dates, MSME credit capped at 45d (Sec 15), breach flags, Sec 16 interest estimate | Up to 25 invoices (`inv:` keys) | **Statutory app — see notes below** |
| 8 | repeat-purchase-predictor | avg daily usage = total ÷ days first→last purchase; reorder date = today + (cover − lead − safety) | 25 items, 60 purchases each | Steady-demand assumption + seasonal caveat stated on-screen |
| 9 | vendor-contract-tracker | Expiry dates, auto-renewal flags, notice periods; 90/60/90-day alerts (narrowest window wins) | Up to 25 contracts | Auto-renew does NOT cancel alerts — stated |
| 10 | purchase-budget-control-tool | Monthly budgets per category + spend log; budget vs actual, variance, ok/watch(≥80%)/overrun(>100%) | 25 budgets + 25 spends | Unbudgeted category spend flagged "No budget" |

Contract compliance per app: `body[data-app]`, one `<h1>`, `<main class="vq-main">`, 2 AdSense slots (Ads.render top+bottom with `<!-- ADSENSE -->` comments), EN+Hindi `<details>` FAQ mirrored in `SEO.faq([...])`, full SEO head (title, description, keywords EN+Hindi, canonical, OG), JSON-LD via `core/seo.js`, script order shell→uid→vault→freemium→ads→seo→app, Freemium.check(slug,20) per compute with `renderUpsell` on denial, awaited Vault saves capped at 25, unmetered reads, `esc()` on all user input into HTML, input validation everywhere, small README.md each.

## Tests

`tests/team-i-procurement-tests.js` — 30 tests (3 per app: ≥2 functional + ≥1 adversarial), **30/30 pass**.
Adversarial coverage: XSS via `esc()` (PO desc, scorecard), negative qty/amount/stock, weights ≠ 100, out-of-turn approval + action-after-close, zero-rate CSV rows, zero demand, 100% discount, paid-date-before-invoice, 45-day cap arithmetic, empty purchase history, end-before-start contracts, bad month `2026-13`.
One real fix during testing: `alertFor` now returns the narrowest matching alert window (was widest) so a 24-day-to-expiry contract reports the 30-day window, not 90.

## Statutory notes (verified via web search, Sep 2026)

- **MSMED Act 2006, Sec 15:** buyer must pay an MSME supplier within the agreed credit period, capped at **45 days** from acceptance — a longer agreed period is unenforceable.
- **Sec 16:** delay attracts **compound interest with monthly rests at 3× the RBI bank rate**.
- **RBI bank rate verified Sep 2026: 5.50%** (repo 5.25%, MSF 5.50% — bank rate tracks MSF; sources: codeforbanks.com key-rates page, Moneylife MPC report, testbook MPC 60th-meeting Q). ⇒ **MSMED delayed-payment interest = 16.50% p.a.**
- Interest model on-screen assumption: monthly compounding for each completed 30-day block past due date; simple interest on (principal + accrued) for leftover days — labelled an estimate, with "confirm with your CA before filing" and MSEFC/MSME Samadhaan portal guidance.
- The bank rate can change with MPC decisions; it is baked in as `RBI_BANK_RATE` and displayed on-screen so staleness is visible.

## Corrections / flags

- One logic correction made (contract alert window precision — see Tests).
- GST slabs in the PO generator are user-entered, not pulled from a live rate chart — flagged on-screen.
- `vendor-payment-tracker` interest is an estimate, not a legal computation — stated on-screen + FAQ.
- No `core/` files, top-level pages, ARCHITECTURE.md, sibling apps, or other teams' tests were touched.
