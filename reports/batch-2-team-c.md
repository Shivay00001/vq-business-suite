# Batch 2, Team C — GST/Tax Tools — Completion Report

**Date:** 2026-09-26
**Scope:** 7 apps under `~/workspace/products/vq-business-suite/apps/<slug>/`
**Contract:** vanilla HTML/JS, file://-safe, no CDN/build; each app `index.html` + `app.js` (+ README);
shell.css; script order shell→uid→vault→freemium→ads→seo→app; `body[data-app]`;
one `<h1>`; `<main class="vq-main">`; 2 ad slots; EN/HI FAQ + `SEO.faq`;
metered compute `Freemium.check(slug, 20)` with `Freemium.renderUpsell` on denial;
vault saves ≤25, awaited; reading saved data never metered.

## Verification summary (all green)
- `node --check` on all 7 `app.js` — PASS.
- 46 + 11 = **57 deterministic assertions** — all pass (2+ per app).
- DOM-id cross-check: every `el('…')`/`getElementById` id exists in its HTML —
  PASS (incl. new `lawPt`, `ptState`, `ptDay`).
- Contract: one `<h1>`, `data-app` slug, script order, `vq-main`, 2 ad slots
  (`Ads.render` ×2), `SEO.faq`, `Freemium.renderUpsell` on denial — PASS all 7.
- Prohibited files untouched: `core/`, top-level pages, `ARCHITECTURE.md`,
  `apps.json`, sibling app folders — untouched (verified by scope of edits).

## Per-app details

### 1. hsn-sac-finder — HSN/SAC Code Finder
- 111 curated entries, keyword/code/type/rate filters, GST-rate notes, EN/HI FAQ.
- Metered: 20 searches/day. No vault writes.
- **Statutory audit completed 2026-09-26** against GST 2.0 rate lists
  (testbook, bajajfinserv, thehindubusinessline, wionews, newindianexpress,
  financialexpress, economictimes): corrected hotel SAC 9963 (≤₹7,500 → 5% no
  ITC / >₹7,500 → 18% with ITC, eff. 22 Sep 2025), marble blocks → 5%, uncoated
  paper → 18% (notebook paper nil), mobiles → 18%, tractors → 5%, bikes >350cc
  → 40%, lottery/betting/casinos → 40%, gyms/salons/yoga → 5%, life & health
  insurance → nil; added 8701 (tractors) and 9996 (betting/lottery) entries;
  renamed 2711 to domestic LPG (natural gas outside GST); qualified 2106
  (pan masala 40%).
- Tests: shampoo→3305/5%; SAC 9961→5%; 40% filter→2 hits; no-match→empty;
  marble→5%; hotel→5%/18%; 8701→5%; 9996→40%.
- Honest limit kept: dataset labelled curated, points to cbic-gst.gov.in.

### 2. gst-itc-mismatch-analyzer — ITC Mismatch Analyzer
- Parses 4-col CSV (purchase register + 2B-style rows); matches GSTIN+invoice;
  flags missing-in-2B, value gaps (Rs 1 tolerance), wrong-GSTIN (same invoice
  under another GSTIN), lists unclaimed ITC; at-risk ITC total; CSV export.
- Metered: 20 analyses/day. Vault: 25 saved reports, awaited saves; reads unmetered.
- Wording audited: missing-in-2B note already conditional ("supplier may not
  have filed GSTR-1 yet" — timing caveat, not an accusation). Legal basis:
  Sec 16(2)(c) + Rule 36(4).
- Tests: ok/diff/gstin-mismatch counts; at-risk 1500+3600=5100; empty→0;
  Rs 0.5 gap within tolerance→ok.

### 3. gst-composition-checker — Composition Scheme Checker
- Eligibility verdict + reasons (₹1.5 cr / ₹75L special states / ₹50L services;
  blocks: inter-state outward, e-commerce TCS, excluded manufacture, casual/NR).
- Tax estimate 1%/5%/6% + quarterly CMP-08 amount. Metered: 20 checks/day.
- **Fixed:** GSTR-4 references corrected 30 Apr → **30 June** (5 spots:
  app.js ×3, index.html ×2) per Notification 12/2024.
- Tests: 80L trader eligible @1% = ₹80,000; 80L special-state → blocked;
  40L service @6% = ₹2,40,000; interstate → blocked; 90L restaurant @5%.

### 4. place-of-supply-validator — Place of Supply Checker
- Goods/services scenarios → POS state + CGST+SGST/IGST/zero-rated + IGST Act
  section (10(1)(a)(b)(c)(e), 11, 12(2)(3)(4)(8)(9)(10), 13(2), 7/8).
- Metered: 20 checks/day.
- Tests: MH→GJ goods → IGST Sec 10(1)(a); MH→MH → intra; DL→KA B2B → 12(2);
  immovable TN → 12(3); bill-to/ship-to third DL → 10(1)(b); export → zero-rated.

### 5. eway-bill-risk-checker — E-Way Bill Risk Checker
- ₹50,000 threshold; validity ceil(km/200), ODC ceil(km/20); 180-day doc rule;
  Part A/B checklist; Sec 129 penalty note; intra-state variance warning.
- Metered: 20 checks/day. Does not generate bills (portal only) — stated.
- Tests: 200km→1d; 450km→3d; 50km ODC→3d; ₹1.2L→required/3d; ₹30k→not-required;
  2024 doc→180-day warning; PartB missing→1 risk.

### 6. statutory-calendar — Statutory Compliance Calendar
- Month grid, law filters persisted in Vault, 7-day upcoming widget, day detail.
- Unmetered (reading only). **Fixed 2026-09-26:**
  - GSTR-4: 30 Apr → **30 June** (FY 2024-25 onwards, Notification 12/2024;
    verified via tax2win/indiafilings/nyca quoting the Rule 62 proviso).
  - GSTR-9/9C moved from the income-tax filter to the GST filter (was wrongly
    grouped with income tax in label + generator).
  - PT: state-specific dates are not invented — added a **user-configurable PT
    reminder** (checkbox + state text + day 1–28), saved in Vault, rendered as a
    monthly reminder event; page still tells users to verify on the state portal.
- Tests: Jun-26 has GSTR-4 30th; Apr-26 none; Dec-26 GSTR-9/9C under GST filter
  only; PT reminder renders at configured day; absent without config; Sep-26
  GSTR-1/GSTR-3B/advance-tax present; Oct-26 CMP-08 + 24Q present.

### 7. vendor-compliance-checker — Vendor Compliance Checker
- Batch GSTIN validation: 15-char structure, state codes 01–38 (+96–99 special),
  PAN structure + entity type, entity ≠ 0, literal 'Z', **mod-36 Luhn checksum**;
  duplicate detection; heuristic risk flags (low/medium/high/invalid).
- Metered: 20 batches/day. Vault: 25 vendors, awaited saves; list/load/delete
  unmetered.
- Honest limitation stated on-page: **no live GSTN status** — format-level only,
  directs users to gst.gov.in → Search Taxpayer.
- Tests: 27AAPFU0939F1ZV valid/low/Maharashtra; 29AAACH7409R1ZX valid/Karnataka;
  wrong check digit → high risk; 14-char → invalid; entity 0 → invalid;
  duplicate → medium; computed check digit for 27AAPFU0939F1Z = 'V'.

## Statutory sources used (2026-09-26)
- GST 2.0 rates: testbook.com Q&A (56th council, 5%/18%/40%, eff. 22-09-2025);
  bajajfinserv.in/gst-reforms-2-0; thehindubusinessline.com article70080036;
  wionews.com (india-news, GST reforms approved); newindianexpress.com
  (business/2025/Sep/22); financialexpress.com (policy/economy, 22 Sep 2025);
  m.economictimes.com (new-gst-rates-list-2025).
- Hotel rates: cleartax.in/s/impact-of-gst-hospitality-industry;
  bookingmaster.in/gst-on-hotel-room; hnallp.com GST 2.0 hospitality FAQ.
- GSTR-4: CBIC Notification 12/2024 (via nyca.in); tax2win.in/guide/gstr-4-filing-due-date;
  indiafilings.com/learn/gstr-4-filing; caclubindia.com forum (June 2026).
- Composition: Notification 14/2019-CT; Notification 2/2019-CT(Rate);
  taxcharcha.com (notification 14/2019 text).
- E-way bill: cleartax.in/s/eway-bill-gst-rules-compliance; Notification 94/2020-CT
  (via caclubindia articles).
- POS: gstzen.in place-of-supply; busy.in GST concept page; taxscan.in article 1447690.
- GSTIN checksum: github.com/lu1tr0n/nationid docs/countries/in.md; test vectors
  27AAPFU0939F1ZV (valid), 27AAPFU0939F1ZO (bad checksum) verified in-node.

## Open caveats (flagged, not hidden)
- HSN dataset is curated (111 entries), not the official CBIC tariff; entries
  with conditional rates show conditions; page + README say to verify on
  cbic-gst.gov.in.
- Composition verdict is indicative, not tax advice (page states it).
- ITC tool works on pasted data; it does not fetch GSTR-2B from the portal.
- Vendor checker does no live GSTN lookup (stated on-page).
- Calendar dates are standard recurring dates; extensions happen by notification
  (stated on-page).
