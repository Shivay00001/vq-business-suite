# Legal Notice Draft Tool

Template-based legal notice draft for payment default. DRAFT ONLY — lawyer review required; not legal advice.

`apps/legal-notice-draft-tool/`

## Contract
- `index.html` — SEO head, `body[data-app="legal-notice-draft-tool"]`, `<main class="vq-main">`, AdSense slots top/bottom, EN+Hindi FAQ `<details>` blocks, script order: shell.js, uid.js, vault.js, freemium.js, ads.js, seo.js, app.js.
- `app.js` — pure functions first (no DOM), exported via `module.exports` for node tests; browser UI after.
- Metering: `Freemium.check(slug, 20)` per calculation; `Freemium.renderUpsell` on denial.
- All user input escaped (`esc`) before HTML render; inputs validated.

## Test
`node tests/team-o-owner-tests.js` (slug section).
