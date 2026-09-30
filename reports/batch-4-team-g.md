# Batch 4 — Team G (Cluster G: EDUCATION & COACHING)

**Date:** 2026-09-26 · **Apps built:** 10/10 (all planned slugs were free — none existed in `core/apps.json`) · **Tests:** 53/53 pass (`node tests/team-g-education-tests.js`, exit 0) · **`node --check`:** all 10 `app.js` clean.

Every app follows the suite contract: `body[data-app]`, one `<h1>`, `<main class="vq-main">`, 2 AdSense placeholder slots with `<!-- ADSENSE: -->` comments, EN + Hindi `<details>` FAQ + matching `SEO.faq([...])` in `app.js`, full SEO head (title, description, keywords incl. Hindi, canonical `https://visionquantech.com/products/vq-business-suite/apps/<slug>/`, OG tags), script order `shell.js, uid.js, vault.js, freemium.js, ads.js, seo.js, app.js`. Pure functions first + `module.exports` for node testing; `Freemium.check(slug, 20)` per calculation; Vault saves capped at 25; `esc()` on all user input; all inputs validated.

## Per-app details

| # | Slug | What it does | Key pure-API behaviour |
|---|------|--------------|------------------------|
| 1 | `fee-receipt-generator` | Printable fee receipts: institute header, itemised fees, optional discount, optional GST (CGST/SGST split), auto receipt numbering (`PREFIX-YYYY-NNN`), amount-in-words (Indian system), Hindi+English, browser print | Rejects negative amounts, discount > subtotal, GST rate > 40%; `nextReceiptNo` increments from last saved; `capSaved` keeps max 25 |
| 2 | `fee-collection-tracker` | Per-student fee ledger: total/paid/due, date-based overdue flagging, class-wise summary, collection rate; vault-persisted | Overpayment beyond due blocked; 26th student rejected; negative payment rejected |
| 3 | `due-fee-reminder-tool` | Overdue student list → copy-paste WhatsApp/SMS reminder templates (Hindi + English), SMS truncated to 160 chars, mark-as-reminded tracking | Drafts only, never sends; zero-due rejected; XSS escaped |
| 4 | `student-attendance-register` | Daily Present/Absent/Leave per batch, monthly % report, threshold-based defaulter list (worst-first) | Invalid statuses/unknown students silently dropped; invalid date rejected; 26th student rejected |
| 5 | `marks-entry-tool` | Marks per subject/exam, auto % + grade (A+–F: 90/80/70/60/50/40), class rank | Marks > max rejected; negative rejected; duplicate student+exam+subject replaced; **true dense ranking** (ties 1,1,2 — fixed after test caught the competition-style variant) |
| 6 | `student-performance-analyzer` | Trend across exams (improving/declining/stable, ±2 pt threshold), subject strength/weakness, topper list, subject leaderboard | Reads the Marks Entry Tool's shared vault — no double entry; <2 exams → honest error, never a fake trend |
| 7 | `batch-management-tool` | Batches with capacity (≤25), schedule days, timing, fee plan; enrollment with over-capacity blocking, "nearly full" at 80%, FULL warning, expected revenue | Duplicate enrollment (case-insensitive) blocked; capacity 0 rejected |
| 8 | `class-scheduling-tool` | Weekly timetable grid (Mon–Sun), HH:MM slots, teacher/room/batch conflict detection on true overlaps | Back-to-back (10:00/10:00) does not conflict; end ≤ start, invalid day, double-booking all blocked; `auditSlots` for bulk checks |
| 9 | `exam-management-tool` | Datesheet builder (same-class overlap blocked), hall seating allocation by capacity with unseated count, admit-card data list (roll + name + full schedule) | Zero-capacity room rejected; case-insensitive class match; datesheet sorted date→time |
| 10 | `fee-recovery-assistant` | Aging buckets 1–30/31–60/61–90/90+ days, 0–100 priority score (60% days-overdue capped at 120d + 40% log-scaled amount), stage-based Hindi/English follow-up scripts | Not-overdue → no script; negative due rejected; future due dates land in "current" |

## Test counts (53 total)

- fee-receipt-generator: 7 (3 adversarial) · fee-collection-tracker: 5 (3 adv) · due-fee-reminder-tool: 6 (2 adv) · student-attendance-register: 4 (2 adv) · marks-entry-tool: 5 (2 adv) · student-performance-analyzer: 5 (2 adv) · batch-management-tool: 4 (2 adv) · class-scheduling-tool: 5 (2 adv) · exam-management-tool: 5 (2 adv) · fee-recovery-assistant: 7 (3 adv).

**Two fixes during verification (both caught by tests, both fixed in code, not tests):**
1. `marks-entry-tool/classRank` used competition-style ranking (1,1,3) while the code comment and page FAQ describe dense ranking — corrected to true dense ranking (1,1,2).
2. `class-scheduling-tool` teacher-conflict message didn't name the conflict type — now starts with "Teacher conflict: …" (also matched by the test).

## Factual / statutory notes

- **GST on coaching/training fees:** receipts offer optional GST with CGST/SGST split; the FAQ notes coaching/training services are typically 18% but some educational services are exempt — every app defers to "confirm with your CA". No statutory claim beyond the standard 18% slab reference.
- **Reminder tools (3 & 10) generate text only** — they never auto-send WhatsApp/SMS; FAQs explicitly warn about opt-outs and app rules.
- **Marks data is planning data** — analyzer FAQ warns the topper list is an average of entered marks, not a board result; performance analyzer warns to verify before publishing merit lists.
- **Marks Entry ↔ Performance Analyzer share one vault** (`marks-entry-tool` / `marks` key) — the analyzer reads it directly. Deleting marks in the entry tool clears analyzer data too.
- All student/payer data is localStorage-only; apps 3 and 10 keep their working lists in memory only.
