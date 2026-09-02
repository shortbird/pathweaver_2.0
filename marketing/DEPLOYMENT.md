# Deployment and cutover checklist

The end state: the marketing site serves the root domain, the app moves to
`app.optioeducation.com`. **Nothing here changes DNS, Render, or auth settings
by itself; every step below is manual and deliberate.** Do them in order; each
phase is independently reversible.

## Phase A: stand up the marketing site (no user-visible change)

1. Render dashboard: **New > Static Site**, repo `shortbird/pathweaver_2.0`, branch `main`.
   - Root directory: `marketing`
   - Build command: `npm ci && npm run build`
   - Publish directory: `dist`
   - Auto-deploy: OFF (match the prod convention; deploy manually or wire into release.yml later)
2. Environment variables on the static site:
   - `PUBLIC_APP_URL=https://app.optioeducation.com`
   - `PUBLIC_API_URL=https://api.optioeducation.com`
   - `PUBLIC_POSTHOG_KEY=<the same PostHog project key the app uses>` (from the app service's `VITE_POSTHOG_KEY`)
3. Verify on the `.onrender.com` URL: pages render, forms submit (needs CORS, step A4).
4. Backend CORS: the marketing origin must be allowed for `POST /api/contact`.
   `https://www.optioeducation.com` is already the allowed frontend origin, so
   production needs nothing once the domain moves. For testing from the
   `.onrender.com` preview URL, either test forms with curl or temporarily add
   that origin to the backend's allowed origins (env, not code).

## Phase B: move the app to app.optioeducation.com

Do this BEFORE pointing the root domain at the marketing site, so no app URL is
ever dead.

1. DNS: add `app` CNAME -> the prod frontend Render service
   (`srv-d9sjl2qjnfac739k091g`).
2. Render prod frontend service: add custom domain `app.optioeducation.com`
   (keep `www.optioeducation.com` attached for now; both serve the SPA).
3. Backend env (Render prod backend `srv-d9sjl1f10e5c73a14610`):
   - Add `https://app.optioeducation.com` to the CORS allowed origins /
     `FRONTEND_URL` handling. Check how `FRONTEND_URL` is consumed before
     changing it; both origins must be allowed during the transition.
   - Auth cookies: verify the cookie `Domain` used by session_manager. If
     cookies are scoped to `.optioeducation.com`, sessions survive the move.
     If scoped to the exact host, users re-log-in once on the new domain.
4. Supabase auth (project `vvfgxcykxjybtvpfzwyx`): add
   `https://app.optioeducation.com/*` to the redirect URL allowlist
   (OAuth/AuthCallback flows).
5. Stripe, LTI (Canvas), and any OAuth apps that carry a `www.optioeducation.com`
   redirect/return URL: add the `app.` equivalents.
6. App frontend env (Render prod frontend): set
   `VITE_MARKETING_URL=https://www.optioeducation.com` so the app's links to
   marketing pages (Support page, Academy agreement) point at the static site.
7. Verify the app fully works at app.optioeducation.com while www still serves
   the SPA. Nothing has moved for users yet.

## Phase C: cut the root domain over to the marketing site

1. Render prod frontend service: remove custom domains `www.optioeducation.com`
   and `optioeducation.com`.
2. Render marketing static site: add custom domains `www.optioeducation.com`
   and `optioeducation.com` (apex redirects to www).
3. DNS: repoint `www` CNAME to the marketing static site. Apex stays on
   Render's redirect/ALIAS per their instructions.
4. The redirect rules are ALREADY LOADED on the marketing static site (120
   rules, added via the Render API on 2026-09-01). Verify with the spot-check
   in "Redirect rules" below rather than re-entering them.
5. Mobile app (`frontend-v2`) needs no change: its hardcoded
   `www.optioeducation.com` links (`/terms`, `/privacy`, `/verify-phone`,
   `/portfolio/:slug`) are covered by the redirect table.
6. Update the PWA/start_url expectations: users with the installed PWA pinned
   to www will be redirected to app.optioeducation.com by rule; they may need
   to reinstall for a clean experience. Watch support inbox.

## Redirect rules (Render static site, in this order)

> Live service: `optio-marketing` (`srv-dab249vavr4c73einci0`, Shortbird
> workspace), 120 rules loaded. The table below lists the marketing-owned moves
> and a representative sample of the app moves; the service is the source of
> truth. Every top-level route in `frontend/src/App.jsx` has both an exact and a
> `/*` rule pointing at `https://app.optioeducation.com`.

Marketing-owned moves (301):

| Source | Destination |
|---|---|
| `/how-it-works` | `/academy#how-it-works` |
| `/classes` | `/academy#free-class` |
| `/for-students` | `/academy#free-class` |
| `/for-families` | `/academy` |
| `/for-schools` | `/schools` |

App-owned paths forwarded to the app subdomain (301, `/*` splat preserves the
rest of the path; Render passes query strings through):

| Source | Destination |
|---|---|
| `/login` | `https://app.optioeducation.com/login` |
| `/login/*` | `https://app.optioeducation.com/login/*` |
| `/register` | `https://app.optioeducation.com/register` |
| `/register/*` | `https://app.optioeducation.com/register/*` |
| `/terms` | `https://app.optioeducation.com/terms` |
| `/privacy` | `https://app.optioeducation.com/privacy` |
| `/support` | `https://app.optioeducation.com/support` |
| `/demo` | `https://app.optioeducation.com/demo` |
| `/academy-agreement` | `https://app.optioeducation.com/academy-agreement` |
| `/academy-handbook` | `https://app.optioeducation.com/academy-handbook` |
| `/portfolio/*` | `https://app.optioeducation.com/portfolio/*` |
| `/public/*` | `https://app.optioeducation.com/public/*` |
| `/docs` | `https://app.optioeducation.com/docs` |
| `/docs/*` | `https://app.optioeducation.com/docs/*` |
| `/catalog` | `https://app.optioeducation.com/catalog` |
| `/course/*` | `https://app.optioeducation.com/course/*` |
| `/enroll/*` | `https://app.optioeducation.com/enroll/*` |
| `/join/*` | `https://app.optioeducation.com/join/*` |
| `/invitation/*` | `https://app.optioeducation.com/invitation/*` |
| `/observer/*` | `https://app.optioeducation.com/observer/*` |
| `/report/*` | `https://app.optioeducation.com/report/*` |
| `/shared/*` | `https://app.optioeducation.com/shared/*` |
| `/family/*` | `https://app.optioeducation.com/family/*` |
| `/verify-phone` | `https://app.optioeducation.com/verify-phone` |
| `/forgot-password` | `https://app.optioeducation.com/forgot-password` |
| `/reset-password` | `https://app.optioeducation.com/reset-password` |
| `/email-verification` | `https://app.optioeducation.com/email-verification` |
| `/auth/*` | `https://app.optioeducation.com/auth/*` |
| `/parental-consent` | `https://app.optioeducation.com/parental-consent` |
| `/staff/*` | `https://app.optioeducation.com/staff/*` |
| `/student/*` | `https://app.optioeducation.com/student/*` |
| `/dashboard` | `https://app.optioeducation.com/dashboard` |
| `/parent/*` | `https://app.optioeducation.com/parent/*` |
| `/quests/*` | `https://app.optioeducation.com/quests/*` |
| `/embed/*` | `https://app.optioeducation.com/embed/*` |
| `/schedule-embed/*` | `https://app.optioeducation.com/schedule-embed/*` |
| `/schedule-builder/*` | `https://app.optioeducation.com/schedule-builder/*` |
| `/kiosk` | `https://app.optioeducation.com/kiosk` |
| `/lti-launch` | `https://app.optioeducation.com/lti-launch` |
| `/lti-deep-link` | `https://app.optioeducation.com/lti-deep-link` |
| `/lti-quest/*` | `https://app.optioeducation.com/lti-quest/*` |
| `/lti-evidence` | `https://app.optioeducation.com/lti-evidence` |
| `/lti-error` | `https://app.optioeducation.com/lti-error` |
| `/sis-launch` | `https://app.optioeducation.com/sis-launch` |
| `/mobile` | `https://app.optioeducation.com/mobile` |

Notes:
- `/embed/*` and `/schedule-embed/*` are iframed on partner-school websites; a
  redirect works for iframes, but tell partners to update their snippets to the
  app domain at the next touchpoint.
- LTI: Canvas posts to backend `/lti/*` endpoints on the API domain, which does
  not move. The `lti-*` SPA routes above are browser navigations, safe to 301.
  Still, re-verify a Canvas launch end to end after cutover.
- Do NOT add a catch-all `/* -> app` rule: unknown paths should 404 on the
  marketing site (its 404 page links both surfaces).
- **MAINTENANCE: the rules are an explicit allowlist, so every NEW top-level app
  route needs a rule added, or bookmarks to it will 404 after cutover.** This
  already bit once: the original table covered 46 of the app's 128 routes, and
  35 top-level segments (`/profile`, `/messages`, `/transcript`, `/admin`,
  `/bounties`, `/learning-journal`, ...) had no rule. Re-run the audit after
  adding routes:

  ```bash
  # every top-level segment the SPA serves
  grep -oE '<Route path="[^"]+"' frontend/src/App.jsx | sed 's/.*path="//;s/"//' \
    | cut -d/ -f1 | sort -u
  # compare against the rules on the service
  curl -s -H "Authorization: Bearer $RENDER_API_KEY" \
    "https://api.render.com/v1/services/srv-dab249vavr4c73einci0/routes?limit=100" \
    | python3 -c "import json,sys; print(sorted({r['route']['source'] for r in json.load(sys.stdin)}))"
  ```

## Rollback

Phase C is the only user-visible phase. To roll back: re-add
`www.optioeducation.com` to the prod frontend Render service, repoint the `www`
CNAME back, and remove the domain from the static site. The app never stopped
serving on app.optioeducation.com, and the SPA still contains all the old
marketing pages, so www serves exactly what it did before.

## Post-cutover cleanup (separate, later)

- Remove the now-dead marketing pages/routes from `frontend/` (they were left
  untouched on purpose during this refactor).
- Point the app's `robots.txt` at disallow-all except `/portfolio/*` and
  `/public/*`, or keep indexing there; decide SEO ownership of portfolios
  (they currently rank on www URLs, and the 301s transfer that equity to app).
- Wire the marketing deploy into `.github/workflows/release.yml` if manual
  deploys get old.
