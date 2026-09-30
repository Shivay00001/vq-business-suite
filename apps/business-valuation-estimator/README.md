# Business Valuation Estimator

Revenue multiple, profit multiple, DCF-lite → value range. Labelled ESTIMATE; not financial advice.

`apps/business-valuation-estimator/`

## Contract
- `index.html` — SEO head, `body[data-app="business-valuation-estimator"]`, `<main class="vq-main">`, AdSense slots top/bottom, EN+Hindi FAQ `<details>` blocks, script order: shell.js, uid.js, vault.js, freemium.js, ads.js, seo.js, app.js.
- `app.js` — pure functions first (no DOM), exported via `module.exports` for node tests; browser UI after.
- Metering: `Freemium.check(slug, 20)` per calculation; `Freemium.renderUpsell` on denial.
- All user input escaped (`esc`) before HTML render; inputs validated.

## Test
`node tests/team-o-owner-tests.js` (slug section).
