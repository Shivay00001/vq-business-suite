# Fee Receipt Generator

Generate and print itemised fee receipts with optional discount, optional GST (CGST/SGST split), auto receipt numbering and amount-in-words (Indian system).

## Files

- `index.html` — page contract: `body[data-app="fee-receipt-generator"]`, one `<h1>`, `<main class="vq-main">`, 2 AdSense slots, EN + Hindi FAQ, full SEO head.
- `app.js` — pure functions first (exported via `module.exports` for node tests), browser UI after.

## Usage

Open `index.html` via the suite (or `file://`). 20 free metered uses/day per app via `core/freemium.js`. Data stays in the browser (vault = localStorage); nothing is uploaded.

## Tests

Covered by `tests/team-g-education-tests.js` (run `node tests/team-g-education-tests.js` from the suite root).
