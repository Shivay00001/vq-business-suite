# Batch 4, Team M — Risk, Governance & Control — Completion Report

**Date:** 2026-09-26
**Scope:** 10 apps under `~/workspace/products/vq-business-suite/apps/<slug>/`
**Contract:** vanilla HTML/JS, file://-safe, no CDN/build; each app `index.html` + `app.js` (+ README);
shell.css; script order shell→uid→vault→freemium→ads→seo→app; `body[data-app]`;
one `<h1>`; `<main class="vq-main">`; 2 ad slots (`Ads.render` ×2 + `<!-- ADSENSE: -->` comments);
EN/HI FAQ `<details>` + matching `SEO.faq([...])`; full SEO head (title, description,
keywords, canonical, OG); FAQ JSON-LD via core/seo.js; metered compute
`Freemium.check(slug, 20)` with `Freemium.renderUpsell` on denial; vault saves ≤25,
awaited; reads unmetered; `esc()` on all user input into HTML; all inputs validated.

**Tone:** self-assessment, never accusatory (fraud/collusion/misuse tools say a flag is
a control gap / pattern to investigate, never proof). Every app carries an on-screen
caveat: "Estimate — confirm with your CA/auditor (or insurer/IT support)".

## Verification summary (all green)
- `node --check` on all 10 `app.js` — PASS (one syntax error caught and fixed in
  compliance-gap-identifier before tests ran: missing `)` in `Math.round(...)`).
- **36 deterministic assertions — all pass** (3–4 per app; ≥1 adversarial each, 12 adversarial total).
- DOM-id cross-check: every static `getElementById`/`$(...)` id exists in its HTML —
  PASS (dynamic `*-{id}` checkbox ids are rendered by JS from the same data lists —
  verified by inspection).
- Contract: one `<h1>`, `data-app` slug, script order, `vq-main`, 2 ad slots,
  `SEO.faq`, `Freemium.renderUpsell` on denial — PASS all 10.
- Slug collision check against `core/apps.json` (59 apps) — all 10 slugs new, none skipped.
- Prohibited files untouched: `core/`, top-level pages, `ARCHITECTURE.md`,
  `apps.json`, sibling app folders, other teams' tests — untouched (verified by scope of edits).

## Per-app details

### 1. operational-risk-heatmap — Operational Risk Heatmap
- 5×5 likelihood × impact matrix grid (colour-coded), risk register up to 25 entries
  (title, likelihood 1–5, impact 1–5, owner), score = L×I, bands 1–4 Low / 5–9 Medium /
  10–15 High / 16–25 Critical, top-5 list, band counts, vault snapshots (max 25).
- Metered: 20 entries/day.
- Tests (6): 4×4→16 Critical; topRisks sort + matrixCells keys + stats; band boundaries;
  ADVERSARIAL likelihood 6/impact 0/non-integer rejected; ADVERSARIAL 26th entry + empty title rejected;
  removeRisk by id / unknown id rejected.

### 2. fraud-risk-indicator — Fraud Risk Indicator
- 12 weighted red flags (fake invoices, split purchases, ghost employees, no segregation…)
  → weighted score %, Low/Moderate/High band + per-flag preventive control. Vault saves (max 25).
- Metered: 20 assessments/day.
- Tests (4): all→100% High, none→0% Low; weight 3 > weight 1, controls returned;
  ADVERSARIAL unknown flag id (incl. `<script>` injection string) rejected;
  ADVERSARIAL duplicate ids counted once.

### 3. internal-control-checklist — Internal Control Checklist
- 17 controls across Purchase(4)/Sales(3)/Cash & Bank(4)/Inventory(3)/HR & Payroll(3);
  overall compliance %, per-process bars, gap list. Vault saves (max 25).
- Metered: 20 evaluations/day.
- Tests (4): all→100% Strong no gaps; per-process 50% + gaps grouped; empty→0% Critical gaps;
  ADVERSARIAL unknown id + non-array rejected.

### 4. governance-score-engine — Governance Score Engine
- 12 Yes/Partial/No questions, weighted, across 4 dimensions → 0–100 score,
  Strong/Adequate/Needs improvement/Weak rating, actions for dimensions <60. Vault saves (max 25).
- Metered: 20 scorings/day.
- Tests (3): all-yes→100 Strong / all-no→0 Weak + 4 actions; partial=half, weakest dim drives actions;
  ADVERSARIAL missing answer + invalid value + null rejected.

### 5. business-continuity-readiness-tool — Business Continuity Readiness
- 12 weighted BCP items (backup, tested restore, offsite, key-person cover, insurance…)
  → readiness %, Resilient/Developing/Exposed tier, gaps heaviest-first. Vault saves (max 25).
- Metered: 20 assessments/day.
- Tests (3): all→100% Resilient / none→0% Exposed; gaps weight-sorted;
  ADVERSARIAL unknown id rejected; weight-2 item scores double weight-1.

### 6. single-point-of-failure-detector — SPOF Detector
- Up to 25 roles/vendors/systems; score = dependency(1–5) × coverage gap (none=3/partial=2/full=1);
  Critical/Watch/Covered; ranked worst-first; remove buttons; vault snapshots (max 25).
- Metered: 20 entries/day.
- Tests (3): 5×none=15 Critical, 3×full=3 Covered; ranking order + dep-4/none auto-Critical;
  ADVERSARIAL bad kind / dependency 0 / bad backup / 26th entry rejected.

### 7. employee-misuse-risk-tool — Employee Misuse Risk (SoD)
- Up to 25 staff × 6 access types; 6 segregation-of-duties conflict pairs;
  High/Medium/Review/Low risk; ranked; vault snapshots (max 25).
- Metered: 20 entries/day.
- Tests (4): cash+bookkeeping→1 conflict Medium; cash+bank+bookkeeping→3 conflicts High;
  payroll+bank conflict; riskLevel Review/Low paths;
  ADVERSARIAL unknown access + empty access + blank name rejected;
  ADVERSARIAL 26th person rejected.

### 8. vendor-collusion-risk-tool — Vendor Collusion Risk
- 10 weighted indicators (same-address vendors, sequential invoices, single-bidder,
  cover bidding…) → score %, Low/Moderate/High + investigative check per pattern.
  Vault saves (max 25).
- Metered: 20 assessments/day.
- Tests (3): all→100% High + 10 checks; 5 mid-weight→43% Moderate;
  ADVERSARIAL unknown id rejected; duplicates counted once.

### 9. data-loss-probability-analyzer — Data Loss Probability
- 5 questions (frequency, locations, encryption, tested restore, device age) →
  0–100 score (max 95 by model weights), RPO estimate, prioritised recommendations
  (3-2-1 rule). Vault saves (max 25).
- Metered: 20 analyses/day.
- Tests (3): worst→95 High + total-loss RPO; best→6 Low + 24h RPO; local-only rpoNote +
  priority-sorted recs; ADVERSARIAL invalid enums + null rejected.

### 10. compliance-gap-identifier — Compliance Gap Identifier
- Entity type + headcount + turnover + premises → simplified applicability engine over
  9 statutes (GST, Shops Act, EPF, ESI, Professional Tax, TAN/TDS, Udyam, trade licence,
  ROC filings) with indicative due dates; tick compliant → coverage % + gap list.
  Vault saves (max 25).
- Metered: 20 checks/day.
- Tests (3): pvt-ltd/25emp/₹80L → PF+ESI+GST+ROC apply; proprietor/2emp/₹10L → fewer;
  evaluate excludes ticked, coverage math; ADVERSARIAL bad entity / negative staff /
  non-numeric turnover / unknown statute rejected.

## Corrections / flags
- **Fixed pre-test:** syntax error in `compliance-gap-identifier/app.js` (missing `)`
  in `Math.round`) — caught by `node --check`, fixed, re-verified.
- **Fixed test expectations (code was correct):** misuse test assumed 2 conflicts for
  cash+bank+bookkeeping (actually 3: cash–bookkeeping, bank–bookkeeping, cash–bank);
  data-loss test assumed worst-case score 100 (true model max is 95 = 40+25+10+12+8).
- **Registry:** entries written to `reports/registry-cluster-m.json` (10 entries,
  `cluster: "risk-governance"`); `core/apps.json` NOT edited, per instructions.
- All apps carry `<!-- ADSENSE: -->` placeholder comments inside both ad slots
  (sibling apps from earlier batches did not include these comments).
- Nothing deployed, published, or purchased. Zero spend.
