# Batch 4 — Team O: OWNER, LEGAL, RESCUE & AI UTILITIES (10 apps)

Date: 2026-09-26. Week 4 of the 1-month program. Zero spend; nothing deployed/published.
Pattern: `apps/gratuity-calculator/` (index.html contract + app.js pure-first contract).
Slug check: all 10 slugs verified absent from `core/apps.json` before building. `core/apps.json` NOT edited — registry entries live in `reports/registry-cluster-o.json`.

## Apps built (10/10)

| # | Slug | What it does | Key pure API |
|---|------|--------------|--------------|
| 1 | `business-health-score-engine` | 5 dimensions × 0–5 → 0–100 score, A–F grade, top 3 fixes (weakest dims) | `calculate`, `gradeFor`, `validateScores` |
| 2 | `cash-survival-days-indicator` | Cash ÷ daily burn → survival days; critical(<30)/watch(30–90)/safe(90+) runway gauge + urgency actions | `indicate`, `survivalDays`, `runwayBand` |
| 3 | `business-valuation-estimator` | Revenue multiple (0.5–2x by growth), profit multiple (3–6x PAT), DCF-lite (±2% growth band, no terminal value) → range. Output labelled **ESTIMATE**; not financial advice | `estimate`, `revenueMethod`, `profitMethod`, `dcfMethod` |
| 4 | `legal-notice-draft-tool` | Template legal notice for payment default (parties, invoice, overdue days, demand period 3–60d). Prominent "DRAFT ONLY — NOT LEGAL ADVICE / get a lawyer to review" banner top + in output; copy/print | `validateNotice`, `buildNotice` |
| 5 | `demand-letter-generator` | Polite → firm → final escalation drafts, English + Hindi | `validateLetter`, `letterText` |
| 6 | `payment-followup-letter-tool` | 30/60/90-day sequence: days overdue from due date → stage → letter; sequence preview | `daysOverdue`, `stageForDays`, `letterBody` |
| 7 | `daily-founder-dashboard` | Morning numbers: cash, dues in/out, net, task list, derived alerts (payables>cash etc.). Tasks in Vault (max 25, awaited); money numbers never persisted | `computeSummary`, `computeAlerts`, `addTask`/`toggleTask`/`deleteTask` |
| 8 | `exit-succession-planner` | 15-point weighted readiness checklist (Vault), readiness % + band, PAT×multiple valuation snapshot (**ESTIMATE**), 5-area handover task list | `readinessScore`, `valuationSnapshot`, `handoverTasks` |
| 9 | `penalty-reduction-planner` | GSTR-3B late fee (₹50/day non-nil / ₹20/day nil) + 18% p.a. interest: pay now vs wait-N-days comparison | `lateFee`, `interestDue`, `compare` |
| 10 | `plain-language-summary-generator` | Paste jargon → key numbers (amounts, %, days, dates) + ≤6 plain-language bullets with jargon→plain replacements. Comprehension aid; not legal advice | `extractNumbers`, `summarize` |

Contract compliance per app: `index.html` has `body[data-app]`, one `<h1>`, `<main class="vq-main">`, 2 AdSense slots (`Ads.render` top+bottom + `<!-- ADSENSE: -->` comments), EN+Hindi FAQ `<details>` + matching `SEO.faq([...])` in app.js, full SEO head (title/description/keywords/canonical/OG), mobile-friendly via `core/shell.css`, script order shell→uid→vault→freemium→ads→seo→app.js. `app.js`: pure functions first, `module.exports`, `Freemium.check(slug, 20)` + `renderUpsell` on denial, `esc` on all user input, input validation. Each app has a small `README.md`.

## Tests

`tests/team-o-owner-tests.js` — **50 tests, 50 passed, 0 failed** (`node --check` clean on all 10 `app.js`).
Per app: 4–7 tests (≥2 required), every app has ≥1 adversarial case (15 adversarial total): oversized/fractional/negative inputs, malformed dates, empty required fields, bogus enum values, 26th task / unknown checklist ids, script-injection names escaped on render, over-long paste text.

## Statutory / factual notes (verified Sep 2026 via web search)

- **GSTR-3B late fee (penalty-reduction-planner):** ₹50/day non-nil (₹25 CGST + ₹25 SGST); ₹20/day nil (₹10 + ₹10). Caps: nil ₹500; non-nil **₹10,000 flat per return from July 2025** (earlier turnover bands ₹2,000 / ₹5,000 / ₹10,000 per Notification 19/2021-CT). Interest **18% p.a.** on delayed net cash tax liability. Unpaid fees block future return filings. Sources linked on-page: CaptainBiz, CAclubIndia, Pice. App shows rates on-screen with "planning aid only — confirm on GST portal / with CA" note.
- **Legal/valuation tools:** every one carries a prominent "not legal/financial advice — consult a professional" banner; templates are explicitly "DRAFT ONLY", never presented as filed-ready documents.

## Flags / follow-ups

- One test initially failed on a test-side bug (polite letter footer mentions "final" stage, matched by case-insensitive regex); assertion fixed, now 50/50.
- `inWords` in legal-notice-draft-tool is a stub (`Rupees ₹…`) — full Indian-system words converter not implemented; fine for a draft but flagging for honesty.
- Suggested next owner: parent to merge `reports/registry-cluster-o.json` into `core/apps.json` (I was told not to touch it).
