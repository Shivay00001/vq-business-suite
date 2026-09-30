# VisionQuantech Business Suite — Architecture

**Status:** Phase 0 (foundation) · **Stack:** 100% static — HTML + vanilla JS + CSS, no build step, no npm, no backend.
**Works from:** `file://`, any static host (GitHub Pages, Netlify, Cloudflare Pages, S3).
**Brand:** VisionQuantech Business Suite · **Audience:** Indian SMEs (mobile-first).

---

## 1. U-STACK mapping (lightweight static phase)

The suite is the first public surface of the U-STACK. Each of the 7 groups is realized
in a deliberately thin form now, with a documented upgrade path.

| Group | Full U-STACK meaning | Realized here (static phase) | Upgrade path |
|---|---|---|---|
| **U-ID** | Decentralized identity | **U-ID lite** (`core/uid.js`): local profiles (name + business), stored in `localStorage`, profile switcher, JSON export/import. No passwords, nothing leaves the device. | Server-backed identity, OAuth, KYC later |
| **U-WALLET** | Value / payments layer | **Pricing-tier definitions only** (`pricing.html` + `core/freemium.js`): Free / Pro ₹299/mo / Enterprise API. Usage counters enforce Free limits client-side. No real payments. | Payment gateway (Razorpay/Stripe) integration |
| **U-VAULT** | Encrypted personal storage | **U-VAULT lite** (`core/vault.js`): per-app namespaced `localStorage`, optional passphrase AES-GCM encryption via WebCrypto. | E2E-encrypted cloud sync |
| **U-PERM** | Consent & permissions | **U-PERM lite**: explicit per-app consent — passphrase prompt before encrypting, export/import is user-initiated, freemium upsell never blocks reading saved data. Documented in each app's privacy note. | Granular consent ledger |
| **U-WORK** | Work/app orchestration | **App registry** (`core/apps.json`): every app registered with slug, cluster, path, keywords. `index.html` renders the cluster grid from it. | Dynamic app store, install/uninstall |
| **U-DEV** | Developer platform | **App template + API-ready conventions**: the per-app contract (§3), shared core APIs, and `api.html` (future REST docs written now so client code uses matching shapes). | Real REST API, SDKs, webhooks |
| **U-SECTOR** | Sector clustering | **Cluster folders/names**: apps are grouped into business clusters (`gst-tax`, `hr-payroll`, `loans-credit`, `profit-analytics`, `cash-banking`, `invoicing-billing`, `documents`, …). Today clusters are names in `apps.json`; folders come when a cluster grows. | Per-sector portals, sector packs |

---

## 2. Folder layout

```
vq-business-suite/
├── ARCHITECTURE.md          # this doc (master design)
├── index.html               # suite home: hero, cluster grid, pricing teaser, FAQ
├── pricing.html             # Free vs Pro ₹299/mo vs Enterprise API
├── api.html                 # FUTURE REST API docs (docs only, clearly labeled)
├── core/
│   ├── shell.css            # design system (mobile-first)
│   ├── shell.js             # shared header/footer/nav injection, lang toggle stub
│   ├── uid.js               # U-ID lite: local profiles
│   ├── vault.js             # U-VAULT lite: namespaced storage + AES-GCM
│   ├── freemium.js          # usage counters + upsell banner/modal
│   ├── ads.js               # AdSense slot component (placeholders)
│   ├── seo.js               # JSON-LD helpers (FAQ, SoftwareApplication)
│   └── apps.json            # U-WORK registry: Batch-1 apps + planned clusters
├── apps/
│   ├── README.md            # builder quick-start (points here)
│   └── <app-slug>/
│       ├── index.html       # (per-app contract, §3)
│       └── app.js           # (per-app contract, §3)
└── assets/
    └── logo.svg             # suite mark
```

**Path convention:** root pages reference `core/...`. App pages (two levels deep) reference
`../../core/...`. `shell.js` exposes `VQ.root` (`"."` at root, `"../.."` inside `apps/`)
so shared components (e.g. freemium upsell → pricing page) resolve links correctly.

---

## 3. Per-app contract (mandatory for every app)

Every app is a folder `apps/<app-slug>/` containing exactly:

### 3.1 `index.html` — required blocks, in order

1. **Shared SEO head block** — `<title>`, `meta description`, `meta keywords`
   (English + Hindi), canonical, Open Graph tags. Title pattern:
   `<App Name> – Free <Use-case> Tool for Indian SMEs | VisionQuantech`.
2. **Shared shell CSS:** `<link rel="stylesheet" href="../../core/shell.css">`
3. **Body:** `<body data-app="<app-slug>">` — `shell.js` auto-injects the shared
   header/nav and footer. Content goes in `<main class="vq-main">` with one `<h1>`.
4. **Ad slots (minimum 2):** one after the hero/intro, one before the footer,
   rendered via `Ads.render(el, "<slot-id>", "fluid")` (§4.6). Real AdSense `<ins>`
   code is pasted where the HTML comment marks — placeholders ship now.
5. **Freemium gate hooks:** before any metered action (calculate, generate PDF,
   save), call `Freemium.check("<app-slug>", LIMIT)`. If `allowed === false`,
   call `Freemium.renderUpsell(el, "<app-slug>", LIMIT)` and stop — never silently
   fail, never block *reading* previously saved data.
6. **Core scripts** (include only what the app uses, in this order):
   `shell.js`, `uid.js`, `vault.js`, `freemium.js`, `ads.js`, `seo.js`, then `app.js`.
7. **FAQ section** (3–6 Q&A) + `SEO.faq([...])` call so FAQ JSON-LD is injected.

### 3.2 `app.js` — rules

- **All computation in vanilla JS.** No frameworks, no CDNs, no external scripts.
- **Persistence only via the vault API:** `await Vault.save(app, key, data)`,
  `await Vault.load(app, key)`, `Vault.list(app)`, `Vault.remove(app, key)`.
  Vault methods are async (WebCrypto) — always `await` them.
- **No backend calls, ever.** No `fetch`/`XMLHttpRequest` to any server.
  (Rationale: the suite must work offline from `file://`; server features are
  Phase 2 and will come with the real U-STACK.)
- **No invented statistics.** Never show fake counts, fake testimonials, or
  fabricated market data. If a number is shown, it is computed from user input.
- **Formulas must be cited in-app:** each calculator shows the formula/source
  it uses (e.g. "Interest = Principal × Rate × Time / 100") and its assumptions.
- **Mobile-first:** inputs ≥ 44px touch targets, single-column layout under 640px.

### 3.3 Optional per-app files

- `README.md` — what the app does, formulas, free limit, privacy note.
- `icon.svg` — app icon (falls back to cluster default).

### 3.4 Registration

Add the app to `core/apps.json` (`slug`, `name`, `cluster`, `path`, `keywords`,
`description`). The home-page cluster grid is generated from this registry.

---

## 4. Shared core reference

### 4.1 `shell.css` — design system
CSS custom properties (`--brand`, `--ink`, `--paper`, …), sticky header/nav,
hero, `.tool-grid` card layout, footer, `.ad-slot` placeholders, `.upsell-banner`,
modal, form controls, tables, and **print styles** (ads/nav/upsell hidden on print).

### 4.2 `shell.js` — shared chrome
Auto-injects header (brand + nav: Home, Pricing, API Docs) and footer.
Sets active nav from `data-nav` on `<body>` or the URL path.
`VQ.root` helper for relative links. Language toggle stub (EN/HI): persists
`vqs:lang`, sets `document.documentElement.lang`, fires `vqs:langchange` —
apps with Hindi copy listen for the event and swap their own strings.

### 4.3 `uid.js` — U-ID lite
```js
UID.create(name, business)  // → {id, name, business, createdAt}
UID.list()                  // → profiles[]
UID.active() / UID.setActive(id)
UID.remove(id)
UID.export()                // → JSON string (download/share)
UID.import(json)            // validates, merges by id
UID.renderSwitcher(el)      // drops a <select> profile switcher into el
```
Profiles live under `vqs:uid:*` in `localStorage`. **No passwords are ever
collected or transmitted** — identity here is a local label, not auth.

### 4.4 `vault.js` — U-VAULT lite
Per-app namespaced storage on `localStorage` (`vqs:vault:<app>:<key>`).
```js
await Vault.save(app, key, data)   // → {ok, encrypted}
await Vault.load(app, key)         // → data | null
await Vault.list(app)              // → [{key, updatedAt, encrypted}]
await Vault.remove(app, key)
await Vault.setPassphrase(secret)  // enables AES-GCM; key kept in memory ONLY
Vault.hasPassphrase() / Vault.clearPassphrase()
```
- Without a passphrase, data is stored as plain JSON (documented in-app as
  "stored on this device, unencrypted").
- With a passphrase: PBKDF2-SHA256 (100k iterations) → AES-GCM-256, random IV
  per record, envelope `{v:1, enc:1, iv, ct}`. Passphrase is **never written to
  disk**; closing the tab locks the vault.
- Graceful fallback: if WebCrypto is unavailable, `setPassphrase` rejects with
  a clear message and the app continues unencrypted.

### 4.5 `freemium.js` — usage gates
```js
Freemium.check(app, limit)        // → {allowed, used, limit, remaining}
Freemium.remaining(app, limit)    // → number
Freemium.renderUpsell(el, app, limit)  // banner → pricing page
Freemium.renderModal(app, limit)  // modal variant
```
Counters are per-app per-day (`vqs:use:<app>:<YYYY-MM-DD>`). Sensible defaults:
calculators 20/day, generators (invoice/payslip/PDF) 5/day, document vault
unlimited saves but 50 MB soft cap. **Reading saved data is never metered.**

### 4.6 `ads.js` — AdSense slots
```js
Ads.slot(id, format)        // → HTML string ('leaderboard'|'rectangle'|'banner'|'fluid')
Ads.render(el, id, format)  // injects the slot into el
```
Renders a labeled placeholder `<div class="ad-slot">` with an HTML comment
marking exactly where the AdSense `<ins>` code goes. Free tier shows ads;
Pro (future) removes them — the slot component stays, the ad code is omitted.

### 4.7 `seo.js` — JSON-LD helpers
```js
SEO.faq([{q, a}, …])        // injects FAQPage schema
SEO.jsonld(obj)             // injects any schema object
SEO.softwareApp({...})      // SoftwareApplication schema for an app page
```

### 4.8 `apps.json` — U-WORK registry
`{suite, version, apps:[{slug, name, cluster, path, keywords[], description}],
planned:[cluster names]}`. Home page renders from it; keep it as the single
source of truth for what exists vs. what is planned.

---

## 5. Monetization model

| Tier | Price | What you get | Status |
|---|---|---|---|
| **Free** | ₹0 | All apps, daily usage limits (§4.5), ads shown, data stays on device | **Live (static phase)** |
| **Pro** | ₹299/month | Higher/no daily limits, no ads, priority new apps | **Planned** — checkout not wired; `pricing.html` collects local waitlist reservations |
| **Enterprise API** | Custom | REST API per `api.html`, SLA, onboarding | **Planned** — docs written now, API does not exist yet |

Rules: nothing is sold or billed from the static site today. The pricing page is
honest about this. When payments arrive (Razorpay/Stripe), `freemium.js` gains a
`Freemium.setPlan('pro')` path and `ads.js` gains a global kill-switch —
both are designed for, not implemented.

---

## 6. SEO playbook

**Per-app pattern** (builders: copy this, don't improvise):
- **Title:** `<App Name> – Free <Use-case> for Indian SMEs | VisionQuantech Business Suite`
  (≤ 60 chars, primary keyword first)
- **Meta description:** what it does + "free" + "no signup" + one Hindi keyword
  (≤ 155 chars)
- **H1:** matches the use-case phrasing a shop owner would type
  (e.g. "GST Interest Calculator", "EMI Loan Tracker")
- **FAQ JSON-LD:** 3–6 real questions via `SEO.faq()` — answers must be true of
  the app as built, never marketing fluff
- **Hindi + English keywords:** every app ships `keywords` in `apps.json` mixing
  both, e.g. `["gst interest calculator", "जीएसटी ब्याज कैलकुलेटर", "gst late fee interest"]`.
  Rationale: Indian SME owners search in both languages, often transliterated.
- **Content:** a 150–300 word plain-language explainer on each app page
  (what it computes, inputs needed, formula). No keyword stuffing.
- **Technical:** one H1 per page, semantic HTML, `alt` text on images,
  canonical URL (placeholder domain until hosting is chosen), sitemap when hosted.

---

## 7. Honest limitations — real now vs. future

**Real now (client-side, verifiable):**
- All calculations run in the browser; the suite works offline from `file://`.
- Data is stored only on the user's device (`localStorage`); nothing is uploaded.
- Passphrase encryption is real AES-GCM — but it protects data *on a shared
  device*, not against malware or someone with devtools open.
- `localStorage` is ~5–10 MB per origin and can be cleared by the browser;
  export/import exists for backup.

**Future (documented, not built):**
- Real user accounts, cloud sync, server-side API (`api.html` is docs-only).
- Payments, Pro plans, ad removal.
- Native mobile apps, Hindi UI beyond the toggle stub.

Every public page must keep this distinction. If a feature isn't built, the page
says so — no "coming soon" buttons that imply it's weeks away unless it is.

---

## 8. Builder workflow (adding a Batch-1 app)

1. Create `apps/<slug>/` with `index.html` + `app.js` per the §3 contract.
2. Register it in `core/apps.json`.
3. Open the page from `file://` and click through: compute → save to vault →
   reload → data persists; exceed the free limit → upsell appears.
4. Run `node --check` on `app.js` (and any new core JS).
5. Checklist before marking done: mobile layout OK, print view clean, FAQ
   JSON-LD valid, no console errors, no external requests (check DevTools Network).

## 9. Global conventions

- Slugs: lowercase, hyphenated, no abbreviations (`salary-calculator`, not `sal-calc`).
- Clusters (Batch-1): `gst-tax`, `loans-credit`, `hr-payroll`, `profit-analytics`,
  `cash-banking`, `invoicing-billing`, `documents`. New clusters need a line in
  `apps.json` `planned` first.
- Money: always ₹ (INR), Indian number formatting (lakh/crore) where shown.
- Dates: DD-MM-YYYY display; ISO in storage.
- Never invent statistics, testimonials, or "trusted by N businesses" claims.
- Do not deploy or publish without explicit approval.
