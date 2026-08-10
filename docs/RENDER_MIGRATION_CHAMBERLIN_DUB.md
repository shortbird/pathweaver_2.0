# Render migration plan: Chamberlin + dub → Shortbird workspace

**Written 2026-08-09**, after completing the same migration for the Optio platform
(commit `89f94753`). Render cannot transfer services between workspaces (their FAQ:
"No, it is not currently possible") — the only path is **recreate in the target
workspace, then cut custom domains over**. This plan applies the playbook and the
gotchas we hit so the next run is clean.

**Scope:** the Chamberlin Music and dub services currently in the old **Optio**
workspace (`tea-d2po2eur433s73dhbrd0`), moving to **Shortbird**
(`tea-d9ah63qq4dsc739armqg`). The 1077 and praxis services are NOT in scope (not
requested).

**Auth:** one user-scoped Render API key reaches both workspaces. Key lives in
`~/.render-mcp/config.json` (and the session scratchpad during execution).

---

## Services in scope (from the 2026-08-09 inventory)

| Service | ID | Type | Branch | Notes |
|---|---|---|---|---|
| Chamberlin-music | `srv-d6av4c24d50c73cbmnkg` | web_service | `main` | `chamberlin-music.onrender.com`; uses Supabase project `cpuvzobtymgjdoqfalfg` |
| dub-app | `srv-d7frfiosfn5c73d8um8g` | static | `main` | `dub-app.onrender.com` — the real dub app |
| dub-dev | `srv-d9ah1sdaeets73dvntg0` | static | `ticket/bc4cf76c` | dev/preview site |
| dub-dev-t-ef1e9001 | `srv-d9feekmrnols73bpmbug` | static | `ticket/ef1e9001` | ephemeral per-ticket preview |
| dub-dev-t-d7e76f6f | `srv-d9feamlaeets73bs0fo0` | static | `ticket/d7e76f6f` | ephemeral per-ticket preview |
| dub-dev-t-448dc9cc | `srv-d9fe3u3h523c73f1o9l0` | static | `ticket/448dc9cc` | ephemeral per-ticket preview |

## Step 0 — leftover from the Optio migration (do first)

- Remove `ignite.optioeducation.com` from the new prod frontend (user confirmed
  it's dead):
  `DELETE /v1/services/srv-d9sjl2qjnfac739k091g/custom-domains/ignite.optioeducation.com`
- Delete the `ignite` CNAME record in GoDaddy (it still points at the old
  `optio-prod-frontend.onrender.com` hostname anyway).

## Decisions needed before executing

1. **The `dub-dev-t-*` ticket sites are almost certainly created by automation**
   (name + branch pattern `ticket/<hash>`). Find whatever creates them — it holds
   a Render API key and an `ownerId`. If that `ownerId` is the old Optio
   workspace, migrating the sites is pointless: the automation will just create
   the next one in the old workspace. **Fix the automation's `ownerId` to
   Shortbird first**, then let the existing ephemerals die with the old
   workspace rather than recreating them. Recreate only `dub-app` and (maybe)
   `dub-dev`.
2. **Custom domains**: the inventory below will reveal whether Chamberlin-music
   or dub-app have custom domains and where their DNS lives. If either serves
   both an apex and a `www` explicitly, use the cutover to fix it the same way
   as Optio: attach **only `www`**, let Render auto-301 the apex.
3. **Projects**: create Render Projects `Chamberlin` and `Dub` in Shortbird
   (`POST /v1/projects`) and place the new services in their Production
   environments, matching the Optio project structure. Network isolation stays
   OFF unless/until each app's dependencies live in the same environment.

## Phase 1 — inventory (read-only, run any time)

For each service in scope, via the API:

- `GET /v1/services/{id}` — build/start commands, publish path, runtime, plan,
  region, autoDeploy, buildFilter, **disks** (a persistent disk = STOP and plan
  a data copy; disks can't move between workspaces).
- `GET /v1/services/{id}/env-vars?limit=100` — **paginate until exhausted.**
  We shipped a broken dev backend in the Optio migration because a `limit=50`
  read silently truncated a 52-var service. Follow cursors; treat
  `len(rows) == limit` as "there is more".
- `GET /v1/services/{id}/custom-domains?limit=20`
- `GET /v1/services/{id}/secret-files?limit=20`
- `GET /v1/env-groups?ownerId=<optio>` — Optio workspace had none on 2026-08-09,
  re-check anyway; group-sourced vars don't appear in service env vars.
- Datastores: `GET /v1/key-value?ownerId=…`, `GET /v1/postgres?ownerId=…` —
  as of 2026-08-09 the only datastore in the Optio workspace was the platform
  redis (already migrated). If Chamberlin turns out to use one via an internal
  URL, it must be recreated in Shortbird — **internal datastore URLs do not
  resolve across workspaces.**
- Check each repo (Chamberlin, dub) for references to the `.onrender.com`
  hostnames — new services get suffixed subdomains, the old names die with the
  old workspace. Sweep like pw_v2's migration commit `89f94753` did.

## Phase 2 — recreate in Shortbird

Via `POST /v1/services` with `ownerId: tea-d9ah63qq4dsc739armqg`, copying the
inventoried config. Lessons that WILL bite otherwise:

- **Pin `PYTHON_VERSION`** (env var) on every Python service **and any static
  site whose repo has a root `requirements.txt`** — Render's build image
  pip-installs it even for static sites. New services default to Python 3.14,
  which breaks `pydantic_core`/PyO3 builds. The platform uses `3.11.9`; match
  whatever each app's CI/runtime.txt pins.
- Node versions come from each repo's `.nvmrc` — verify one exists; set
  `NODE_VERSION` env var if not.
- Creation triggers an immediate first deploy. Safe: no traffic routes to the
  new service until domains move.
- The Render GitHub App must have access to the Chamberlin/dub repos for the
  service create to succeed. Same GitHub account → likely already fine; the API
  error will say so immediately if not.
- Copy env vars verbatim except: values embedding old `.onrender.com` hostnames
  or old internal datastore URLs must be remapped to the new ones. Cross-service
  URL refs (a dev site pointing at a dev API) need patch-then-redeploy after all
  URLs are known — static sites bake env at build time.
- If any service is a **cron**, keep exactly one of old/new unsuspended at all
  times (we briefly double-dispatched the platform cron before catching it).

## Phase 3 — verify before cutover

Hit each new `.onrender.com` URL: health endpoints for web services, page loads
for statics. Both stacks talk to the same backing stores, so full verification
is safe while the old services still serve traffic.

## Phase 4 — cutover (only step with user-visible impact)

Per domain: `DELETE` from old service → `POST` to new service. Apexes: attach
**www only**, Render auto-creates the apex 301. TLS reissues in ~1–5 min per
domain; DNS needs **no change during the window** (Render routes by domain
attachment; any `*.onrender.com` CNAME target lands on Render's edge).

After cutover, repoint DNS CNAMEs to the new hostnames **before the old
services are deleted** — old `.onrender.com` names stop resolving on deletion.
(This is exactly the `ignite` trap: a CNAME left on the old hostname works
until the old service is gone, then dies.)

## Phase 5 — soak + decommission

Suspend old services for a few days (instant rollback = re-attach domains,
resume), then delete. Fold into the same pass as the pending Optio-workspace
decommission (old five platform services + `optio-dev` scratch site + old
redis `red-d57cu7m3jp1c73ath0p0`).

## Execution notes

- Drive it with the same scratchpad scripts used for the platform migration
  (create → patch cross-refs → poll deploys → cutover → verify); they're
  parameterized by service ID and survived a real run.
- When sweeping either repo for hostname references, preserve line endings
  (the pw_v2 sweep converted CRLF files to LF and made every diff a whole-file
  rewrite until fixed).
