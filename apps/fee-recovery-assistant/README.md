# Fee Recovery Assistant

Overdue dues grouped into 30/60/90+ day aging buckets, 0–100 recovery priority score, and stage-based Hindi/English follow-up scripts.

## Files

- `index.html` — page contract: `body[data-app="fee-recovery-assistant"]`, one `<h1>`, `<main class="vq-main">`, 2 AdSense slots, EN + Hindi FAQ, full SEO head.
- `app.js` — pure functions first (exported via `module.exports` for node tests), browser UI after.

## Usage

Open `index.html` via the suite (or `file://`). 20 free metered uses/day per app via `core/freemium.js`. Data stays in the browser (vault = localStorage); nothing is uploaded.

## Tests

Covered by `tests/team-g-education-tests.js` (run `node tests/team-g-education-tests.js` from the suite root).
