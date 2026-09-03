# Optio Marketing Site

The public marketing site for optioeducation.com: a fully static Astro build.
Every page renders complete HTML with no JavaScript required to read it; the
only client-side JS is the mobile nav toggle, form submission, and analytics.

The app (the React SPA in `frontend/`) is a separate deploy. This site links to
it via `PUBLIC_APP_URL`. See [DEPLOYMENT.md](DEPLOYMENT.md) for the cutover
plan, DNS changes, and the full redirect map.

## Commands

```bash
npm install
npm run dev        # dev server on :4321
npm run build      # static build to dist/
npm run preview    # serve dist/ locally
npm run og         # regenerate Open Graph images (run after adding a page/lander)
```

## Environment variables (build-time)

| Var | Default | Purpose |
|---|---|---|
| `PUBLIC_APP_URL` | `https://app.optioeducation.com` | Where Login / Terms / Privacy links point |
| `PUBLIC_API_URL` | `https://api.optioeducation.com` | Forms POST to `{API}/api/contact` |
| `PUBLIC_POSTHOG_KEY` | unset (PostHog off) | Same project key the app uses |
| `PUBLIC_GA_MEASUREMENT_ID` | `G-KPKTXS36W3` | GA4; only fires on the prod hosts |

For local dev with the local backend: `PUBLIC_API_URL=http://localhost:5001 npm run dev`
(the backend must allow the `http://localhost:4321` origin for the form to
submit from a browser; curl works regardless).

## Where things live

- `src/pages/` — one file per page. `l/[activity].astro` generates every lander.
- `src/data/landers.ts` — **adding a lander = adding one entry here**, then
  `npm run og` (keep the OG list in `scripts/generate-og.mjs` in sync).
- `src/data/site.ts` — URLs, the offer ($149, free class, Transfer Guarantee),
  analytics IDs. Prices are stated once, here.
- `src/data/testimonials.ts` — real quotes, migrated verbatim. Never invent one.
- `src/data/accreditation.ts` — WASC constants + kill-switch
  (`ACCREDITATION_ACTIVE`), ported from the app. A claim must always appear
  with the commission identity block; `WascBadge.astro` enforces that.
- `src/content/blog/*.md` — blog posts. Publishing = add a markdown file with
  frontmatter (`title`, `description`, `pubDate`), push, rebuild. RSS at
  `/rss.xml`, sitemap and Article structured data are automatic.
- `src/components/Receipt.astro` — the signature visual (activity above the
  transcript row it became). Used on Home, Academy, and every lander; keep it
  matching the ad creative.

## Copy rules (enforced in review)

- No em dashes anywhere in site copy. No "not X, but Y" constructions.
- The customer is the hero; present-focused value; concrete over conceptual.
- Seat time is the enemy. Never anti-school, never anti-teacher.
- Never invent testimonials, statistics, partner names, or accreditation
  claims. Unknown facts get a `TODO(tanner)` comment and a placeholder.

Current `TODO(tanner)` markers: Academy pricing mechanics ($50/month accrual
toward $100/credit), ESA/UFA amounts and language, partner-school case studies,
real activity photos for the landers.
