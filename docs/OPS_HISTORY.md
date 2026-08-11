# Ops History & Infrastructure Verification Notes

Background on how the deploy/hosting setup got to its current shape. The operative
rules live in CLAUDE.md; this file preserves the "why" and the verification work so
it doesn't have to be re-derived.

## Prod deploy flow history (direct-to-main, as of 2026-06-07)

The direct-push-to-`main` flow replaced the old develop→PR→main flow, which
double-ran every test: once on the develop push, once on the PR. The 3 separate
test workflows were consolidated into `release.yml`; `eas-update.yml` is now
develop-only (preview OTA).

Render **auto-deploy is OFF for both prod services** (as of 2026-07-20) — the old
"Deploy after CI checks pass" setting waited for every check on the commit
(including the OTA publish) and sometimes never fired at all. CI is now the only
prod deploy trigger (`RENDER_API_KEY` repo secret). GitHub can't block a direct
push before it lands (checks run on the pushed commit), so "only deploy if tests
pass" is enforced at the **CI-deploy / OTA-gate layer**, not by GitHub. Bad code
can land on `main` but won't *deploy* or *OTA*.

The `main-protection` ruleset is disabled — there is no PR gate on `main`.

## Prod web hosting (verified 2026-08-09)

Both the apex `optioeducation.com` and `www.optioeducation.com` are served by
**Render** — 100% Render, no Vercel anywhere. DNS is at GoDaddy
(`domaincontrol.com` nameservers); the apex A record is Render's shared anycast IP
`216.24.57.1` (never changes), and `www`/`api`/`sis` are CNAMEs to the services'
`.onrender.com` targets. Render routes custom domains by domain *attachment*, not
CNAME target. The `Server: cloudflare` response header is Render's own CDN, not a
Cloudflare zone we control. A Render deploy is what users see.

## Render workspace migration (2026-08-09)

All services live in the **Shortbird** workspace (`tea-d9ah63qq4dsc739armqg`),
migrated from the old Optio workspace — Render cannot transfer services between
workspaces, so the old `srv-d2t...` services were rebuilt and decommissioned.
Current service IDs are in CLAUDE.md.

All backends pin `PYTHON_VERSION=3.11.9` via env var (new Render services default
to Python 3.14, which breaks `pydantic_core`; the static sites need the pin too
because Render auto-installs the root `requirements.txt` even for static builds).

## Frontend coverage baseline

The 60.61% coverage figure quoted pre-2026-04-14 came from a local run; CI coverage
on a `pull_request` event was never verified until the first gated PR. See the
coverage baseline note in `.github/workflows/frontend-tests.yml`. The CI gate floor
is 40% line coverage — ratchet it up over time, never down.

## Removed in March 2026 audit

- **Frontend**: Calendar, Payments/Stripe, curiosity-threads, hub, quest-library
  components deleted
- **Backend**: v1 API routes, calendar route, admin services route, 7 unused
  AI/recommendation services deleted
- **Dependencies**: @fullcalendar/*, @stripe/*, react-ga4 removed from frontend

## Gemini model history

Upgraded 2026-07-28 from `gemini-2.5-flash-lite`, which had aged into frequent 503
"high demand" errors, to `gemini-3.5-flash-lite` (GA 2026-07-21). Fallback chain
and current models are configured in `app_config.py` (`GEMINI_MODEL` /
`GEMINI_FALLBACK_MODELS`).
