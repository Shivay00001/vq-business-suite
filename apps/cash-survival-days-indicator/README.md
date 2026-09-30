# Cash Survival Days Indicator

Cash in hand ÷ daily burn → survival days, runway gauge, urgency actions.

`apps/cash-survival-days-indicator/`

## Contract
- `index.html` — SEO head, `body[data-app="cash-survival-days-indicator"]`, `<main class="vq-main">`, AdSense slots top/bottom, EN+Hindi FAQ `<details>` blocks, script order: shell.js, uid.js, vault.js, freemium.js, ads.js, seo.js, app.js.
- `app.js` — pure functions first (no DOM), exported via `module.exports` for node tests; browser UI after.
- Metering: `Freemium.check(slug, 20)` per calculation; `Freemium.renderUpsell` on denial.
- All user input escaped (`esc`) before HTML render; inputs validated.

## Test
`node tests/team-o-owner-tests.js` (slug section).
