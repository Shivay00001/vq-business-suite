# Tender Deadline Tracker

Track government/private tenders with submission deadlines, days-left countdown,
urgency color coding (overdue / critical ≤3d / soon ≤7d / normal), EMD & tender-fee
notes, and a per-tender document checklist with completion %.

## How to use

1. Add a tender: name, NIT reference, issuing authority, submission deadline date,
   EMD amount, tender fee, and required documents (one per line).
2. The list auto-sorts by deadline; the summary strip shows counts per urgency band.
3. Tick documents as they get ready — each tender shows its checklist completion %.
4. **Save snapshot** stores the list on this device (via the U-Vault, max 25 tenders).
   Reading the saved list is never metered.

## Notes

- Days are whole calendar days from today's date on your device.
- Late bids are summarily rejected on GeM / e-procure portals — track the exact
  deadline *time* from the bid document too.
- EMD is typically 1–2% of estimated contract value (verify the NIT); MSE/Startup
  bidders are often exempt via Bid Securing Declaration; refunded to unsuccessful
  bidders without interest, typically within 30 days of award.
- This is a planning aid, not legal advice — always verify against the NIT and
  corrigenda. Confirm with your CA/consultant before bidding.

## Files

- `index.html` — page, SEO head, FAQ, AdSense slots
- `app.js` — pure logic (node-testable) + browser UI
- `README.md` — this file
