# Optio Marketing Site

The public marketing site for optioeducation.com: a fully static Astro build.
Every page renders complete HTML with no JavaScript required to read it; the
only client-side JS is the mobile nav toggle, form submission, and analytics.

The app (the React SPA in `web/`) is a separate deploy. This site links to
it via `PUBLIC_APP_URL`. See [DEPLOYMENT.md](DEPLOYMENT.md) for the cutover
plan, DNS changes, and the full redirect map.

## Commands

```bash
npm install
npm run dev        # dev server on :4321
npm run build      # static build to dist/
npm run preview    # serve dist/ locally
npm run og         # regenerate Open Graph images (run after adding a page/lander; story OG images render at build)
```

## Environment variables (build-time)

| Var | Default | Purpose |
|---|---|---|
| `PUBLIC_APP_URL` | `https://app.optioeducation.com` | Where Login / Terms / Privacy links point |
| `PUBLIC_API_URL` | `https://api.optioeducation.com` | Forms POST to `{API}/api/contact` |
| `PUBLIC_POSTHOG_KEY` | unset (PostHog off) | Same project key the app uses |
| `PUBLIC_GA_MEASUREMENT_ID` | `G-KPKTXS36W3` | GA4; only fires on the prod hosts |
| `STORIES_SOURCE` | unset (the API) | `fixture` builds from `src/data/stories.fixture.json`; refused on Render |
| `STORIES_MIN_COUNT` | `0` | Fail the build when the API returns fewer published stories |

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
  matching the ad creative. An optional `media` slot takes an optimized
  `<Image>` in place of the `image` prop.
- `src/pages/stories/` — the Stories section. Nothing here is a file in the
  repo; see "Stories" below.
- `src/data/schema.ts` — JSON-LD nodes with stable `@id`s (Organization,
  Person, WebSite, BreadcrumbList, FAQPage). Every page that emits structured
  data builds one `graph(...)` from these instead of redeclaring "Optio".

## Stories

`/stories` is built from the app, not from this repo. Publishing happens in
the app admin (a superadmin clicks Publish on a finalized credit review item,
or on a whole quest); the backend writes the story, copies the safe images to
the public `story-assets` bucket, and fires this site's Render deploy hook.
The rebuild fetches `GET {PUBLIC_API_URL}/api/public/stories` once and
renders a page per story, a hub per subject with two or more stories, an RSS
feed with the full text, and an OG image per story. Unpublishing does the
same in reverse. Every push to `main` also rebuilds.

The loader (`src/loaders/stories.ts`) fails the build on any problem: the API
unreachable after three retries, a malformed response, fewer than
`STORIES_MIN_COUNT` published stories, or an image URL that does not answer
HEAD. A failed build leaves the last good deploy live, which is the outcome
we want. The data contract is `src/data/stories.schema.ts`; the backend's
`public_view` is the other half of it.

Local work:

```bash
STORIES_SOURCE=fixture npm run build   # two labelled fixtures, no API needed
STORIES_SOURCE=fixture npm run dev     # same, on :4321
npm run dev                            # the API, falling back to the fixture with a warning
```

Fixture stories carry `status: 'fixture'` and "(fixture)" in the title. Their
pages render with `noindex`, the sitemap drops them, and `STORIES_SOURCE=fixture`
is refused when `RENDER=true`, so they cannot reach production. Under the
fixture source, and in `astro dev`, the index, subject hub and feed list the
fixtures too (also `noindex`) so the layouts can be checked; the home page
and the landers show published stories only.

The home page swaps its stock receipt strip for the three most recent stories
once three exist. Each lander lists up to three stories whose `activity.slug`
matches it; the backend's activity list mirrors `src/data/landers.ts`, so
adding a lander means adding the slug there too.

## Copy rules (enforced in review)

- No em dashes anywhere in site copy. No "not X, but Y" constructions.
- The customer is the hero; present-focused value; concrete over conceptual.
- Seat time is the enemy. Never anti-school, never anti-teacher.
- Never invent testimonials, statistics, partner names, or accreditation
  claims. Unknown facts get a `TODO(tanner)` comment and a placeholder.

Current `TODO(tanner)` markers: Academy pricing mechanics ($50/month accrual
toward $100/credit), ESA/UFA amounts and language, partner-school case studies,
real activity photos for the landers.
