# Batch 4 — Team J: Cluster J (BANKING, PAYMENTS & CASH)

**Date:** 2026-09-26 · **Team:** J · **Apps built:** 10/10 · **Tests:** 43/43 PASS

All apps live at `~/workspace/products/vq-business-suite/apps/<slug>/` with
`index.html` + `app.js` + `README.md`. Vanilla HTML/JS, file://-safe, no CDN.
Contract followed throughout: `body[data-app]`, one `<h1>`, `<main class="vq-main">`,
2 AdSense placeholder slots with `<!-- ADSENSE: -->`, EN + Hindi `<details>` FAQs
with matching `SEO.faq([...])`, full SEO head (canonical
`https://visionquantech.com/products/vq-business-suite/apps/<slug>/`, OG tags),
script order shell → uid → vault → freemium → ads → seo → app.js, pure functions
first with `module.exports`, `Freemium.check(slug, 20)` per calculation, Vault saves
max 25 and awaited / reads unmetered, all user input escaped via `esc()`,
all inputs validated.

Skipped per instructions: `cash-flow-forecast` and `emi-loan-tracker` (already exist in apps.json).

## Per-app details

| # | App (slug) | What it does | Pure API (tested) | Vault use |
|---|---|---|---|---|
| 1 | `bank-reconciliation-tool` | Paste bank statement + book entries (CSV-ish), auto-match by amount/date tolerance, unmatched lists both sides | `parseStatement`, `parseDate`, `reconcile` (greedy, sign-aware) | — |
| 2 | `delayed-payment-interest-calculator` | MSMED Act §16: 3× RBI bank rate, compound interest monthly rests, day-wise table; acceptance→due +45d helper | `msmedInterest`, `dueFromAcceptance`, `strictDate` | — |
| 3 | `cheque-management-tool` | Issued/received cheque & DD register; stale (>90d) / expiring-soon (≤7d) / pending-encashment alerts | `validateCheque`, `validity`, `registerAdd`, `alerts` | register (25) |
| 4 | `bank-charge-leak-detector` | Charges by type/month vs typical SME ranges; anomaly flags; annualised leak total | `analyze` (per-type verdicts ok/watch/flag) | — |
| 5 | `daily-cash-closing-tool` | Denomination count (₹2000–₹1), tally vs expected, shortage/excess, dated log | `denomTotal`, `closingTally`, `logAdd`, `logSummary` | log (25) |
| 6 | `cash-burn-rate-analyzer` | Month-end balances → avg net burn, runway months, zero-cash month; cash-positive verdict | `validateSeries`, `analyze` | — |
| 7 | `emergency-cash-estimator` | Fixed essentials → 3-mo / 6-mo reserve targets, coverage months, funding gap | `validateCosts`, `estimate` | — |
| 8 | `payment-mode-profitability-tool` | UPI / credit / debit / netbanking / cash vs sales mix: per-mode cost, effective %, annual cost, mix-shift saving | `validateMix`, `validateRates`, `compare` | — |
| 9 | `credit-line-utilization-monitor` | CC/OD/term-loan/bill-discounting: limit vs drawn, utilization %, est. monthly interest, 75%/90% alerts, weighted rate | `facilityStats`, `registerAdd`, `portfolio` | facilities (25) |
| 10 | `cash-vs-upi-vs-card-split-analyzer` | Sales mix: fee drag per mode, settlement-lag notes, 6-point reconciliation checklist | `validateSplits`, `analyze` | — |

## Tests

`tests/team-j-banking-tests.js` — **43/43 passed** (`node tests/team-j-banking-tests.js`, exit 0).
`node --check` on all 10 `app.js` — 10/10 pass.
Per app: ≥2 functional tests + ≥1 adversarial (sign-mismatch never matches,
impossible dates, reversed dates, >3yr delay, 26th entry/25 cap, duplicates,
fractional counts, over-limit drawings, mix ≠100%, rate >25%, all-zero costs).

## Statutory / rate notes (verified via web search, Sep 2026)

- **RBI Bank Rate 5.50% p.a.** (repo 5.25%, MSF 5.50%) — MSMED §16 rate = 3 × 5.50% = **16.50% p.a.**, editable on screen. (Business Today, 24 Sep 2026)
- **MSMED Act §15:** payment ≤45 days from acceptance; **§16:** compound interest with **monthly rests** at 3× bank rate, from the appointed day, regardless of contrary agreement; interest claimable even if principal paid late (Samadhaan/Council). Implemented as daily accrual capitalised at month-end.
- **Cheque validity:** 3 months from date of issue (RBI circular, eff. 1 Apr 2012) — stale thereafter; tool uses 90 days as approximation, stated on screen.
- **UPI MDR (NPCI, eff. 15-Oct-2026):** 0% P2M ≤₹2,000; 0.40% above, capped ₹300; P2PM small merchants (≤₹1L/mo) & P2P zero. Debit ≤0.90% (RuPay debit zero-MDR); credit 1.5–2.5%. Tools use editable blended defaults (UPI 0.25%, cards 2.0%) with the full rule stated on screen.

## Assumptions stated on-screen (per app)

Each app's index.html carries an "Assumptions stated on-screen" card and a
"Statutory sources" card where applicable — e.g. greedy sign-aware matching,
monthly-rests day count, 90-day validity approximation, SME benchmark ranges
(SMS ₹15–30/mo, NEFT/RTGS/IMPS ₹0–200/mo, etc.), net-burn projection limits,
netbanking flat-charge model, interest estimate excluding fees/penalties.

## Registry

Registry entries (not merged into `core/apps.json`) at
`reports/registry-cluster-j.json` — 10 entries, `cluster: "banking-cash"`.

## Flags / follow-ups

- **None blocking.** All 10 built, tested, contract-verified (HTML↔JS id check,
  single h1, data-app, AdSense comments, FAQ html/js parity, script order,
  canonicals, module.exports).
- Bank Rate and MDR rules change — on-screen defaults are labelled "verified Sep 2026, editable"; a future refresh pass should re-verify them.
- `core/apps.json` untouched (registry left for the orchestrator to merge).
