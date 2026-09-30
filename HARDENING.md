# HARDENING.md — VisionQuantech Business Suite
**Date:** 2026-09-26 · **Scope:** all 139 apps (59 from weeks 1–3 + 80 new in week 4)
**Principle (Shivay's anti-vibe-coding directive):** no bad system design, no cost blowups, no hacks. Checked, not assumed.

## 1. Cost — stays ~₹0
- Every app is 100% static/client-side: HTML + vanilla JS, no backend, no database server, no build step.
- No `setInterval` polling anywhere in the suite (verified by grep across `apps/*/app.js` and `core/*.js`).
- No external `<script src="http…">` on any app page — all libraries vendored in `core/` (shell, uid, vault, freemium, ads, seo).
- No `fetch`/`XMLHttpRequest` to external endpoints — every computation and every file parse happens on-device.
- Hosting cost on Cloudflare Pages free tier: **~₹0** (static files only, bandwidth within free quota at SME scale). Documented per-app in each README.

## 2. Security — input handling
- **No `eval()` / `new Function()`** in any app code. (One grep hit: a `node -e "eval(…)"` *comment* in dockerfile-generator's header — not executed code.)
- **XSS:** user data is never injected raw. 132/139 apps use a shared `esc()` helper; the 7 without it were individually audited:
  - `dockerfile-generator` — own `escapeHtml()` on hint strings; main output uses `textContent`.
  - `eway-bill-risk-checker` — innerHTML receives static strings only.
  - `gst-composition-checker`, `place-of-supply-validator` — manual `.replace(/</g,'&lt;')` on interpolated text.
  - `gst-due-date-monitor`, `statutory-calendar` — rendered rows come from static schedule builders, not user input.
  - `gst-interest-calculator` — interpolates only a fixed-map label and formatted numbers.
  - `prompt()`-derived names (cash-flow-forecast, contractor-payment-manager) are rendered through `esc()`.
  - Adversarial XSS cases are part of every team's node test suite (e.g. `<script>` in student names, scenario names).
- **File uploads are size-capped client-side before processing:**
  - `document-vault` — 4 MB per attachment (`MAX_FILE_BYTES`), enforced pre-read.
  - `vendor-rate-analyzer` — **FIXED this pass:** added 2 MB cap before `FileReader` (was uncapped).
  - `excel-chaos-cleaner` — 0.5 MB paste guard (`MAX_CHARS`), enforced.
  - `bank-reconciliation-tool` — 500-row cap.
  - `gst-itc-mismatch-analyzer` — **FIXED this pass:** added 2,000-rows-per-side paste cap with an on-screen "split by month" message (was uncapped).
- **No data exfiltration:** stated as a trust feature on 105+ app pages ("Nothing is stored — all math happens in your browser" / vault-on-this-device-only). Vault = browser localStorage/IndexedDB, ≤25 items per app, reads unmetered.

## 3. Abuse — freemium gates are in code, not just hidden buttons
- Metered compute: `Freemium.check(slug, 20)` (20/day) on every calculation path; denial renders the Pro upsell via `Freemium.renderUpsell`.
- `invoice-generator`: 10 invoices/calendar month. `document-vault`: document-count limit with upsell.
- `statutory-calendar`: read-only reference page — no compute and no writes to meter (nothing to gate; noted, not a gap).

## 4. No fake functionality
- Zero "coming soon" placeholders anywhere in the suite (grep across all `apps/*/index.html`).
- Every `<button>` is wired: id-based listeners or `data-*` delegated listeners (verified, e.g. cron-builder `data-quick`).
- Demo-only items are labeled on-screen (e.g. license-activation-engine is marked DEMO).

## 5. Fixes made in this hardening pass
1. `apps/vendor-rate-analyzer/app.js` — added 2 MB file-size cap before FileReader.
2. `apps/gst-itc-mismatch-analyzer/app.js` — added 2,000-row paste cap per side + UI error message; `collectRows` propagates the `capped` flag.
3. Both files pass `node --check`; existing team test suites still green (376 assertions, 0 failures).

## 6. Residual notes (honest, not blockers)
- `contractor-payment-manager` uses `window.prompt()` for quick payment entry (kept file://-safe); a styled inline form is queued for a UX pass.
- `license-activation-engine` is a demo key format, labeled as such — not a real licensing server (that's Phase 2, needs a backend).
- Legal/valuation tools carry "not legal/financial advice" disclaimers; statutory constants are web-verified with sources on-screen (see per-team reports in `reports/`).
