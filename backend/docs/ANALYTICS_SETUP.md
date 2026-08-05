# Analytics Setup (Optio)

**Last rewritten: 2026-08-05.** The previous version of this file described a
`react-ga4`-based setup with event helpers for friends / collaboration /
subscriptions. That library was removed in the March 2026 audit and those
features no longer exist — the doc was stale. This reflects what is actually in
the codebase.

---

## The stack

Optio runs four measurement systems, each with a distinct job:

| System | What it's for | Where | Gating |
|---|---|---|---|
| **PostHog** | Product analytics + session replay (the source of truth for logged-in behaviour, web **and** mobile) | `frontend/src/services/posthog.js`, `posthog-react-native` in v2 | `VITE_POSTHOG_KEY` — off in local dev |
| **Google Analytics 4** | Acquisition funnel + Google Ads attribution (marketing site, logged-out) | `frontend/src/services/googleAnalytics.js` + `components/GaTracker.jsx` | **prod host only**, logged-out only |
| **Meta Pixel** | Ad audiences / conversions (marketing site, logged-out) | `frontend/src/utils/metaPixel.js` + `components/MetaPixelTracker.jsx` | **prod host only**, logged-out only |
| **Google Tag Manager** | Container for any other marketing tags | `frontend/index.html` | **prod host only** |

**Rule of thumb:** in-app product events go to **PostHog**. GA/Meta get only the
handful of **acquisition conversions** (sign-up, lead) and pre-login pageviews.
We never send user PII or identifiers to GA/Meta, and never track authenticated
(potentially minor) sessions in ad tools.

---

## Google Analytics 4 — how it works here

GA4 is **initialized in-app**, not by a hardcoded snippet, so it can be gated and
kept out of dev data:

- `services/googleAnalytics.js`
  - `initGa()` — called once at startup (`App.jsx`, next to `initPostHog()`).
    No-ops unless the host is `www.optioeducation.com` / `optioeducation.com`.
    Loads `gtag.js`, sets **Consent Mode v2** defaults (ad usage **denied**,
    `analytics_storage` granted), and configures the property with
    `send_page_view: false`.
  - `gaTrackPageView(path)` — sends a `page_view`. Used by `GaTracker`.
  - `gaTrackEvent(name, params)` — for acquisition conversions only. Never pass
    PII (email/name).
- `components/GaTracker.jsx` — mounted in `App.jsx`. Sends a `page_view` on every
  React Router route change, **only while logged out** (mirrors
  `MetaPixelTracker`). This is what makes SPA navigation measurable — a plain
  `gtag('config')` only fires once, on hard load.

### Events currently sent to GA4

| GA4 event | Fired from | Notes |
|---|---|---|
| `page_view` | `GaTracker` on route change | logged-out only |
| `sign_up` | `contexts/AuthContext.jsx` (registration) | mark as Key Event → import to Ads |
| `generate_lead` | `InlineContactForm.jsx`, `FreeClassModal.jsx` | marketing lead forms |

### Configuration

- **Measurement ID**: `VITE_GA_MEASUREMENT_ID` (falls back to the live prod
  property `G-KPKTXS36W3` if unset, since GA only runs on the prod host anyway).
  Point a different property per environment by setting the env var.
- **GTM container**: `GTM-P9TZN8P3`, gated to the prod host in `index.html`.
  > ⚠️ GA4 is initialized in-app. If the GTM container **also** has a GA4
  > Configuration / Google tag for `G-KPKTXS36W3`, disable it in the GTM UI or
  > every pageview is double-counted.

---

## GA4 property setup (one-time, in the GA UI)

1. **Enhanced Measurement**: leave on, but note SPA pageviews come from
   `GaTracker`; you can turn off "Page changes based on browser history events"
   to avoid any overlap.
2. **Key Events**: mark `sign_up` and `generate_lead` as Key Events
   (Admin → Events → mark as key event).
3. **Google Ads**: link the Ads account and import the two Key Events as
   conversions for campaign optimization.
4. **Consent / Google Signals**: Consent Mode denies `ad_storage` /
   `ad_user_data` / `ad_personalization` by default (see `initGa`). Keep Google
   Signals **off** unless a real cookie-consent flow is added — Optio serves
   K-12 minors and must not feed them to ad/remarketing features.

---

## Privacy

- GA/Meta run **prod + logged-out only**; authenticated (potentially minor)
  sessions are never tracked in ad tools.
- No user id / email / name is sent to GA or Meta.
- PostHog session replay masks all inputs (`session_recording.maskAllInputs`).
- There is **no cookie-consent banner** today; GA Consent Mode grants only
  `analytics_storage` and denies all ad usage. If you later serve EU traffic at
  scale or want stricter defaults, add a banner and flip `analytics_storage` to
  `denied` until consent.

---

## Environment variables

```
# frontend (.env / Render static site env)
VITE_GA_MEASUREMENT_ID=G-XXXXXXXXXX   # optional; defaults to the prod property
VITE_POSTHOG_KEY=phc_...              # required for PostHog (unset = off, e.g. dev)
VITE_POSTHOG_HOST=https://us.i.posthog.com
```

GA only fires on the prod host, so you do **not** need `VITE_GA_MEASUREMENT_ID`
in dev — leave it unset there.
