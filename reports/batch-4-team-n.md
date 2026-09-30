# Batch 4 — Team N: Platform, Recovery & Lifecycle (10 apps)

**Date:** 2026-09-26 · **Cluster:** `platform-lifecycle` · **Status:** built, tested, NOT deployed/published (zero spend, per program rules)

All apps follow the suite contract: vanilla HTML/JS, file://-safe, no CDN; `body[data-app]`, one `<h1>`, `<main class="vq-main">`, 2 AdSense placeholder slots via `Ads.render` (top + bottom) with `<!-- ADSENSE: -->` comments, EN + Hindi FAQ `<details>` matched by `SEO.faq([...])`, full SEO head (canonical `https://visionquantech.com/products/vq-business-suite/apps/<slug>/`, OG tags), FAQ JSON-LD via `core/seo.js`, mobile styling via `core/shell.css`. Script order: `shell.js, uid.js, vault.js, freemium.js, ads.js, seo.js, app.js`. Pure functions first with `module.exports`; `Freemium.check(slug, 20)` per metered action; vault saves capped at 25 and awaited; reads unmetered; `esc()` on all user HTML output; inputs validated.

## Apps

| # | Slug | What it does | Storage | Metering |
|---|------|--------------|---------|----------|
| 1 | `subscription-expiry-manager` | Subscriptions with renewal alerts at 30/15/7 days; yearly SaaS spend (weekly×52, monthly×12, quarterly×4, half-yearly×2, yearly×1; one-time excluded) | vault `subscriptions`, ≤25 | 20/day (add/remove) |
| 2 | `license-activation-engine` | **DEMO** key generator `VQ1-<PROD4>-<BODY8>-<CHECK4>` + checksum validator; clearly labelled demo, not a real licensing system | stateless | 20/day |
| 3 | `usage-metering-tool` | Per-client API/tool usage logs, quota bands (ok/near≥80%/at/over), overage billing estimate, portfolio rollup | vault `clients`, ≤25 | 20/day |
| 4 | `excel-chaos-cleaner` | Paste messy CSV → trim, drop empty rows, dedupe, snake_case headers, DD/MM/YYYY→ISO dates, ₹/comma number repair, clean CSV download | stateless | 20/day |
| 5 | `system-health-monitor` | 10 weighted IT checks → 0–100 score, A–F grade, severity-sorted action list | stateless | 20/day |
| 6 | `year-end-closure-assistant` | FY closing checklist (India, ends 31 Mar): 14 items in Books/Reconcile/Provisions/Sign-off phases; blocks on 11 mandatory items | stateless | 20/day |
| 7 | `auto-backup-scheduler` | Backup plan builder + 3-2-1 rule checker + next-run dates (daily/weekly/monthly, end-of-month clamped) | vault `plans`, ≤25 | 20/day |
| 8 | `software-upgrade-safety-checker` | 8-check pre-upgrade risk score (0–100, low/med/high/critical) + copyable rollback-plan template | stateless | 20/day |
| 9 | `business-restart-toolkit` | Phased reopening checklist (Day 1 / Week 1 / Month 1); two tracks — temporarily paused (14 steps) vs fully shut down (+3 re-registration steps) | stateless | 20/day |
| 10 | `long-term-data-preservation-tool` | Statutory retention schedule with destruction-eligibility dates and expiry alerts; sources shown on-screen | vault `batches`, ≤25 | 20/day |

## Tests

`tests/team-n-platform-tests.js` — **37/37 passed** (node). Every app has ≥2 tests and ≥1 adversarial case. `node --check` passed on all 10 `app.js` files.

Adversarial coverage highlights: 26th-record caps rejected; HTML injection stored raw and escaped only at render; tampered license checksums fail; impossible dates (31/02) and garbage dates rejected; oversized CSV paste (>0.5 MB) rejected; unknown check-ids don't inflate checklist progress; lowercase license keys normalize; end-of-month monthly scheduling clamps correctly.

Two bugs caught and fixed during testing:
1. `long-term-data-preservation-tool`: `addItem` called `makeId()` twice, so the returned item id differed from the stored copy's id. Fixed to a single id.
2. `excel-chaos-cleaner`: dedupe ran after value-fixing (stats counted fixes on rows later dropped) and `headersRenamed` compared against a transformed header. Dedupe now runs on trimmed raw rows; rename compares against the raw header. Test data corrected to quote `₹1,25,000` (commas must be quoted in real CSV).

## Statutory notes (verified via web search, Sep 2026)

Retention periods hardcoded only in app #10, each with its statute and source link on-screen:
- **Companies Act, 2013, Sec 128(5):** books of account + vouchers, min **8 financial years** immediately preceding the current FY (TaxGuru; TaxRobo).
- **Income-tax Act, 1961:** specified books **6 years from end of relevant AY** (~8 previous years) (BCAS referencer; TaxTMI); **Rule 10D** transfer-pricing docs 8 years; foreign-asset escaped assessment **16 years** (same BCAS source).
- **CGST Act, 2017, Sec 36:** GST records **72 months from annual-return due date** (CAclubindia).
- **ESI (General) Regulations, 1950:** Rule 32 (Form 7 register) and Rule 66 (accident book) — **5 years from last entry**; ESIC circular 28-01-2020: officers may not demand records beyond 5 years (LawyersClubIndia; SCC Times).
- **Payment of Wages Act, 1936, Sec 13A(2):** wage registers **3 years** after last entry (Indian Kanoon).
- **PF wage records:** commonly advised ~6 years — forum guidance only (CAclubindia forum); the app flags this row as *unconfirmed — verify with your PF consultant*.

## Files

- Registry entries (do NOT edit `core/apps.json`): `reports/registry-cluster-n.json` — 10 entries, `cluster: "platform-lifecycle"`.
- Test harness: `tests/team-n-platform-tests.js` (37 tests, all passing).
- Untouched: `core/*.js`, top-level `index.html`/`pricing.html`/`api.html`, `ARCHITECTURE.md`, all sibling app folders, `tests/team-f-hr-payroll-tests.js`.
