# Contract Milestone Tracker

Track contract milestones with contractual due dates, % complete, weightage %,
and linked payments — with automatic delay flags, overall weighted progress,
and a payment summary (released / pending / delayed-linked).

## Status rules

- **Complete** — 100% complete.
- **Delayed** — due date passed and not 100% complete (overdue days shown).
- **Due soon** — due within 7 days.
- **On track** — otherwise.

## Progress

Weighted average of % complete (weights normalized); simple average when all
weights are 0.

## Notes

- A linked payment counts as released only at 100% milestone completion.
- Planning aid, not a legal record — confirm with your consultant/CA.

## Files

- `index.html` — page, SEO head, FAQ, AdSense slots
- `app.js` — pure logic (node-testable) + browser UI
- `README.md` — this file
