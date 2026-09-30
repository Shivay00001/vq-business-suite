# Batch 4 — Team L: Cluster L (TENDER, PROJECT & CONTRACT)

**Date:** 2026-09-26 · **Apps built:** 10/10 (target was 8–10) · **Tests:** 50/50 pass
**Test harness:** `tests/team-l-tender-tests.js` (run: `node tests/team-l-tender-tests.js`)
**Registry entries:** `reports/registry-cluster-l.json` (10 entries, cluster `tender-project`; `core/apps.json` untouched)
**Contract compliance:** vanilla HTML/JS, file://-safe, no CDN; script order shell→uid→vault→freemium→ads→seo→app.js; `body[data-app]`, one `<h1>`, `<main class="vq-main">`, 2 AdSense slots with `<!-- ADSENSE: -->` comments, EN+Hindi FAQ `<details>` + matching `SEO.faq([...])`, full SEO head (title/description/keywords/canonical/OG), JSON-LD via `core/seo.js`, mobile-friendly via `core/shell.css`; pure functions first with `module.exports` for node testing; `Freemium.check(slug, 20)` per calculation + `Freemium.renderUpsell` on denial; Vault saves capped at 25 and awaited, reads unmetered; `esc()` on all rendered user input; all inputs validated. Nothing in `core/`, top-level pages, ARCHITECTURE.md, sibling apps, or other teams' tests was touched. All 10 `node --check` clean.

## Per-app details

### 1. tender-deadline-tracker
Tender list with submission deadlines, days-left math (whole calendar days), urgency bands (overdue / critical ≤3d / soon ≤7d / normal) with color-coded cards, EMD & tender-fee notes, per-tender document checklist with completion %, sorted by deadline, summary strip, Vault snapshot save/load (max 25).
Tests: 6 (daysLeft math, band boundaries, docPct+add/toggle flow, adversarial invalid date 2026-02-30, adversarial 26th tender cap, adversarial XSS escaping).

### 2. tender-eligibility-checker
Tender criteria (min turnover, experience years, past contracts, EMD capacity, category, registration) vs your profile → **eligible / marginal / no-go**. Numeric criterion: pass / marginal (within 10% shortfall) / fail; any fail → no-go, any marginal → marginal. Per-criterion table + gap list + 0–100 score.
Tests: 5 (all-pass → eligible/100, 5%-short turnover → marginal, experience+category fail → no-go, adversarial negative turnover, adversarial non-numeric EMD).

### 3. tender-cost-estimator
Bid cost buildup from `name: amount` direct-cost lines + indirect % + contingency % → total cost → margin % → bid price; tender fee & EMD tracked as upfront cash (EMD explicitly NOT part of bid price — refundable). Per-head share %.
Tests: 4 (full buildup arithmetic: 100+8%+5%+10% → ₹124.30 bid, shares sum 100%, adversarial negative amount, adversarial margin>100% + malformed line).

### 4. bid-price-optimizer
Given estimated cost + win probability at lowest/highest bid price (linear interpolation, must not rise with price), scans the band for the price maximizing EV = (price−cost)×P(win); also scores explicit bid points via `evaluateBids`. Sample check: cost=100, band 100–200, p 0.9→0.1 → best ≈₹156.25, EV≈₹25.31.
Tests: 5 (optimal-price sample, evaluateBids ranking, interpolation/clamping, adversarial prob>1, adversarial floor<cost + rising-prob curve).

### 5. retention-money-calculator
Per-contract retention (value × retention %, optional cap %), release due date = completion + DLP months (month-end clamped), released/locked totals, release-due flag, total locked working capital across contracts; mark-released flow.
Tests: 5 (₹25L×10%=₹2.5L, due 2027-03-15; month-end clamp 2026-01-31+1mo→2026-02-28; locked/released/dueNow totals; adversarial retention 30%>25% cap; adversarial negative value).

### 6. project-cost-overrun-detector
Earned-value per cost head: EV=budget×%complete, CV=EV−AC, CPI=EV/AC, EAC=BAC/CPI, VAC=BAC−EAC; flags on-track (CPI≥1) / watch (0.9–1) / overrun (<0.9); portfolio roll-up with forecast variance.
Tests: 5 (BAC=100k, AC=60k, 50% → EAC=120k, overrun; mixed portfolio → CPI 1.071, on-track; watch band; adversarial %>100; adversarial negative actual + zero budget).

### 7. contract-milestone-tracker
Milestones with contractual due date, weight %, % complete, linked payment; statuses complete / delayed (past due, <100%, overdue days) / due-soon (≤7d) / on-track; weighted progress %; payment summary (released/pending/delayed-linked).
Tests: 5 (delayed 6d + due-soon band, weighted 85% progress + payment split, equal weights fallback, adversarial invalid date, adversarial pct>100 + 26th milestone cap).

### 8. project-delay-penalty-tool (LD calculator)
LD = value × rate%/100 × ceil(delayDays/7), capped at cap% of value; optional grace days; date pickers auto-fill delay days. Defaults 0.5%/week, 10% cap (the GeM/government norm). Sample: ₹1cr, 14 days → 2 weeks → ₹1,00,000; 200 days → capped at ₹10,00,000.
Tests: 5 (14-day sample, part-week round-up + cap enforcement, grace days + daysBetween helper, adversarial negative delay, adversarial rate>5%).

### 9. tender-submission-checklist
Two-bid system checklist: 16 default technical-bid docs + 6 financial-bid docs (EMD/BSD, GST/PAN, 3-yr financials & ITRs, experience certs, non-blacklisting affidavit, DSC, BOQ in figures+words…); per-section + overall completion %, ready-to-submit flag, pending list; add NIT-specific custom docs (dedupe-checked, removable); save/reset.
Tests: 5 (defaults → tick-all → 100% ready; 1/22 → 4.5% + 21 pending; adversarial invalid section; adversarial duplicate doc; adversarial XSS escaping).

### 10. contractor-payment-manager
RA bill register: bill no. (unique), date, certified value, paid, holdback %; unpaid & collectible (excl. holdback); aging buckets from bill date (current / 31–60 / 61–90 / 90+); record-payment flow that blocks overpayment (paid can never exceed certified); summary with recovery %.
Tests: 5 (₹5L/₹3L/10% → unpaid ₹2L, holdback ₹50k, 31–60d bucket; payment + 90+ aging + 42.86% recovery; adversarial paid>certified; adversarial overpayment; adversarial duplicate bill no.).

## Test counts

| App | Tests | Pass |
|---|---|---|
| tender-deadline-tracker | 6 | 6 |
| tender-eligibility-checker | 5 | 5 |
| tender-cost-estimator | 4 | 4 |
| bid-price-optimizer | 5 | 5 |
| retention-money-calculator | 5 | 5 |
| project-cost-overrun-detector | 5 | 5 |
| contract-milestone-tracker | 5 | 5 |
| project-delay-penalty-tool | 5 | 5 |
| tender-submission-checklist | 5 | 5 |
| contractor-payment-manager | 5 | 5 |
| **Total** | **50** | **50** |

Every app has ≥1 adversarial test (injection, limits, invalid dates, overpayment, duplicates). During the first run 3 test *expectations* (not app logic) had wrong regexes for rejection messages; corrected in the harness — all 50 pass now.

## Factual notes (verified 2026-09-26)

- **LD norm confirmed:** GeM bid documents consistently state **0.5% of value per week of delay (or part thereof), capped at 10%** — usually on the delayed/undelivered portion (sources: IIM Mumbai, BSF, IIM Sambalpur, HAL, Goa Shipyard bid docs on bidplus.gem.gov.in / fulfilment.gem.gov.in / mkp.gem.gov.in). Used as the app default.
- **EMD:** typically **1–2% of estimated contract value** (verify per NIT); MSE/Startup (NSIC/Udyam) bidders commonly exempt via Bid Securing Declaration; refunded to unsuccessful bidders **without interest, typically within 30 days** of award. Stated as "typical — check the NIT" on-screen.
- **Performance security:** 5% of PO value (GoI OM 01.01.2024) — mentioned in assumptions where relevant.
- **Retention:** typically 5–10% in Indian works/supply contracts, released after DLP (often 12 months), no interest — stated as typical norm.
- **Two-bid system:** technical bid (Envelope 1) opened first; only technically qualified bidders' financial bids opened — basis of the checklist structure.
- **RA bills:** running-account periodic claims certified by the client's engineer; payment follows minus holdback/retention and statutory deductions (TDS, GST).
- Every app carries on-screen **"estimate/planning aid — confirm with your CA/consultant before bidding/paying/filing"** caveats; the LD/EMD/retention norms are labeled "typical" with a check-your-contract instruction.

## Flags / follow-ups for parent

1. **Slug collisions:** none — all 10 slugs were absent from `core/apps.json` (59 existing apps checked). Registry entries written to `reports/registry-cluster-l.json` for the parent to merge into `core/apps.json`.
2. **contractor-payment-manager** uses `window.prompt()` for the "+ Payment" flow (keeps it file://-safe without extra modal code); consider a styled inline form later if UX review flags it.
3. **project-delay-penalty-tool** applies LD to the entered value; the UI explicitly advises entering the *delayed/undelivered portion's* value since most government contracts levy LD on that portion, not the full contract value.
4. No spends, nothing deployed — all static, as required.
