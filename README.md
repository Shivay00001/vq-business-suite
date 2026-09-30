# VisionQuantech Business Suite

**139 free tools for Indian SMEs** — GST, accounting, invoicing, inventory, CRM, HR & payroll,
education/coaching, procurement, banking & cash, pricing & profit, tender & projects,
risk & governance, platform utilities, and owner/legal dashboards.

**Live demo:** open `index.html` in any browser (works from `file://` — no server needed).
**Planned home:** `https://visionquantech.com/products/vq-business-suite/`

## What it is

Every tool runs **100% in the browser**. No signup, no server, no data uploaded —
saved work lives only on the user's device (browser vault, ≤25 items per app, optionally
passphrase-encrypted). Statutory formulas (GST, PF, ESI, gratuity, MSMED interest) are
web-verified with sources linked on-screen; every page states its assumptions and
"confirm with your CA" where advice-like.

## Structure

```
index.html          Suite landing (tool grid renders from core/apps.json)
pricing.html        Free vs Pro (₹299/mo) vs Enterprise API tiers
api.html            Enterprise API docs (waitlist — backend is Phase 2)
sitemap.xml / robots.txt
core/               Shared shell: shell.css/js, uid.js, vault.js, freemium.js, ads.js, seo.js
apps/<slug>/       One folder per tool: index.html + app.js + README.md
tests/              Node test suites per build team (376 assertions, all passing)
reports/            Per-team build reports + registry fragments
ARCHITECTURE.md     U-STACK-lite platform design
HARDENING.md        Security/cost/abuse audit (2026-09-26)
ROADMAP.md          Month-1 scope vs Phase 2 (platform builds)
```

## App contract (every tool)

- `body[data-app]`, one `<h1>`, `<main class="vq-main">`, mobile-first via `core/shell.css`
- Full SEO head: title, meta description, EN+Hindi keywords, canonical, OG tags, FAQ JSON-LD
- EN + Hindi FAQ `<details>` blocks mirrored in `SEO.faq()`
- 2 AdSense placeholder slots (`<!-- ADSENSE: -->` comments mark exact positions)
- Pure functions first in `app.js`, exported via `module.exports` for node testing
- Metered compute: `Freemium.check(slug, 20)`/day; Pro upsell on denial
- All user input validated; all user data rendered through `esc()` (XSS-safe)
- File/paste inputs size-capped client-side (see HARDENING.md)

## Monetization

| Tier | Price | What |
|---|---|---|
| Free | ₹0 | All 139 tools, 20 uses/day each, ads |
| Pro | ₹299/mo | No ads, higher limits (checkout stubbed — needs payment link) |
| Enterprise API | Custom | Waitlist only — docs at `api.html`, backend is Phase 2 |

## Launch checklist (for Shivay's go-ahead)

- [ ] Point `visionquantech.com/products/vq-business-suite/` at this folder (any static host; Cloudflare Pages free tier ≈ ₹0)
- [ ] Paste AdSense code into the `<!-- ADSENSE: -->` slots (needs AdSense approval first)
- [ ] Add Pro checkout link on `pricing.html` (Razorpay/Stripe)
- [ ] Submit `sitemap.xml` in Search Console

## Build log

- **Weeks 1–3:** 59 apps (GST/tax, accounting, HR/payroll, inventory, CRM, DevOps tools, documents, loans)
- **Week 4 (2026-09-26):** 80 apps across 8 clusters — education (G), procurement (I),
  banking/cash (J), pricing/profit (K), tender/projects (L), risk/governance (M),
  platform/lifecycle (N), owner/legal (O). 376 test assertions, 0 failures.
- **Hardening pass (2026-09-26):** full security/cost/abuse audit → `HARDENING.md`;
  2 real fixes (uncapped file/paste inputs now capped).

Nothing is deployed. Zero spend to date.
