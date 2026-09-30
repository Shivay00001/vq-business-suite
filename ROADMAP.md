# VisionQuantech Business Suite — ROADMAP

Month-1 program (deadline ~2026-10-26) covers **tool-type apps only**: calculators, trackers,
generators, converters, monitors, checklists — all 100% static/client-side under
`~/workspace/products/vq-business-suite/`.

## Phase 2 — Platform builds (explicitly OUT of month 1)

These are real infrastructure products from the U-STACK vision. They need backends,
auth, payments, and compliance work that cannot be done honestly in the tool sprint.
Each gets its own project only after month 1 ships and revenue starts.

| # | Build | U-STACK group | Why it's Phase 2 |
|---|-------|---------------|------------------|
| 1 | VisionOS / VisionLite OS / VisionSecure OS / VisionRecovery OS / VisionEmbedded OS | U-WORK (platform) | Operating systems — multi-year effort, needs hardware partnerships |
| 2 | VisionCloud Platform, Object Storage, Compute Engine, Database Cloud, Backup Cloud, Edge Cloud | U-VAULT / U-DEV | Real cloud infra — needs data centers or reseller agreements + billing |
| 3 | VisionID (real identity infra), VisionSSO, VisionAuth Server, VisionDevice Identity, VisionAccess Manager | U-ID / U-PERM | Real auth = servers, key management, KYC/legal compliance |
| 4 | VisionPay Gateway, Subscription Engine, VisionWallet, Billing Engine | U-WALLET | Payments need RBI/PCI compliance, banking partnerships |
| 5 | VisionERP, VisionCRM, VisionHRMS, VisionSCM, VisionProcurement (full suites) | U-SECTOR | Multi-user, role-based, backend — the month-1 tools are the on-ramp, not the suite |
| 6 | VisionDocs/Sheets/Slides/Mail/Calendar/Drive (office suite) | U-WORK | Collaborative editing needs realtime backend |
| 7 | VisionChat/Meet/Call/Broadcast | U-WORK | Realtime media servers, telecom compliance |
| 8 | VisionDB / VisionNoSQL / VisionWarehouse / VisionBI / VisionLog Analytics / VisionData Pipeline | U-VAULT / U-DEV | Managed data infra |
| 9 | VisionGit / VisionCI / Container Platform / VisionKube / API Gateway / Secrets Manager | U-DEV | Developer infra — competes with GitHub/AWS, needs scale |
| 10 | VisionZeroTrust / Endpoint Security / Firewall / DLP / Audit Platform / Compliance OS | U-PERM | Security products need certifications and trust |
| 11 | VisionSearch / Knowledge Graph / AI Assistant / Document Intelligence / Decision Engine | U-SECTOR | Needs model hosting + data moats |
| 12 | VisionVideo Platform / Streaming Infra / VisionCMS / VisionCDN / Publishing Platform | U-SECTOR | Media infra, bandwidth costs |
| 13 | VisionGov ERP / Digital Identity Stack / National Data Exchange / Public Records / Policy Analytics | U-SECTOR | Government sales cycles |
| 14 | Futuristic zone: Digital Immortality, Consciousness Archive, ASI Research Platform, Human Knowledge Vault, Civilization Memory | Vision | Research track, not product track |

## Sequencing logic for Phase 2

1. **Revenue first:** month-1 tools earn via AdSense + Pro subscriptions + enterprise API.
   Phase 2 starts only when tool revenue funds it.
2. **U-ID + U-VAULT real backend first** — every other platform build depends on identity
   and encrypted storage. This is the true "U-STACK core" milestone.
3. **U-WALLET (billing) second** — needed to monetize everything else natively.
4. **Sector suites last** — ERP/CRM/HRMS only after identity + billing exist.

## What month 1 must NOT claim

- The lite U-ID (local profiles) is not real authentication.
- The lite U-VAULT (browser storage) is not cloud backup.
- The API page documents a future tier; no live API exists until Phase 2.
- Marketing copy must say "browser-local", "no account needed", "data stays on your device"
  — never imply cloud sync, bank-grade security, or statutory filing.

## Month-1 scope additions (added 2026-09-26)

**DevOps tools cluster** (~10 tool-type apps, client-side, same suite contract):
Dockerfile generator, docker-compose generator, Kubernetes YAML generator + validator,
CI pipeline generator (GitHub Actions + Jenkins), cron expression builder/tester,
Terraform snippet generator, Git command explorer, deployment checklist tool,
Prometheus alert-rule generator, Scrum sprint planner/estimation tool.
Each ships with SEO page + AdSense slots + Pro upsell like other suite apps.
Slotted into Week 3/4 batches. Lives under `apps/` in this suite.

**Consumer apps track** (separate folder: `~/workspace/products/vq-consumer-apps/`):
grocery, food delivery, bus & train tracking, job-apply + hiring.
These are PLATFORM apps, not static tools — honesty rules apply:

| App | Month 1 (real) | Phase 2 (needs backend/live data) |
|---|---|---|
| Grocery | Catalog/cart/checkout UI, demo data | Real inventory, stores, payments, delivery |
| Food delivery | Restaurant/menu/cart/tracking UI, demo data | Real restaurants, orders, payments, riders |
| Bus & train | Timetable search + fare tools (static data); live tracking ONLY if a reliable free public API is found, else Phase 2 | Live vehicle tracking, PNR status, seat availability |
| Jobs | REAL via Supabase free tier: listings, search, apply flow, employer post-a-job; `schema.sql` + `supabase-config.js` ship with the app | Moderation, resume parsing, employer verification, alerts |

- Jobs go-live needs the owner's Supabase project URL + anon key (5-minute setup, documented in the app README). No secrets committed to the repo.
- Every consumer app README has a "What's real vs prototype" section. UI copy must never
  imply live data where demo data is used.

---

## Week 4 completion record (2026-09-26)

All 8 remaining tool-type clusters built, tested, hardened, and merged:

| Cluster | Apps | Test file | Tests |
|---|---|---|---|
| G — education & coaching | 10 | team-g-education-tests.js | 53/53 |
| I — procurement & vendor | 10 | team-i-procurement-tests.js | 30/30 |
| J — banking, payments & cash | 10 | team-j-banking-tests.js | 43/43 |
| K — pricing, profit & decision | 10 | team-k-pricing-tests.js | 42/42 |
| L — tender, project & contract | 10 | team-l-tender-tests.js | 50/50 |
| M — risk, governance & control | 10 | team-m-risk-tests.js | 36/36 |
| N — platform, recovery & lifecycle | 10 | team-n-platform-tests.js | 37/37 |
| O — owner, legal, rescue & AI utilities | 10 | team-o-owner-tests.js | 50/50 |

Suite total: **139 apps**, **376 week-4 assertions + 35 week-3 = all passing, 0 failures**.
Registry merged into `core/apps.json` (zero slug collisions); `sitemap.xml` (142 URLs) +
`robots.txt` generated; `index.html` grid renders all 139 from the registry.
Hardening audit → `HARDENING.md` (2 real input-cap fixes). Suite README written.
**Status: launch-ready pending Shivay's go-ahead. Nothing deployed, zero spend.**
