# Optio Platform - AI Agent Guide

**Last updated**: September 10, 2026

This file holds what a machine cannot check: product context, architectural
intent, judgment calls. Everything checkable is a test or a hook, listed in
[RATCHETS.md](docs/remediation-2026-09/RATCHETS.md). A rule missing from here is
usually a rule something enforces.

It was 656 lines until 2026-09-10; the deleted text now fails builds instead of
asking nicely. Adding prose back is a last resort — it is the weakest
enforcement available, and this repository has the postmortems to prove it.

---

## The four rules a machine cannot check

1. **Verify locally before you commit.** The user confirms the fix works at
   http://localhost:3000. Nothing else counts as verification — not a passing
   test, not a clean build.
2. **Ask before you push to `main`.** `main` deploys to production and publishes
   the production OTA. A hook stops the push so you have to ask; the answer is
   the user's, not yours.
3. **Check the schema before you write a query.** Table and column names in this
   codebase have changed more than once. Use the Supabase MCP.
4. **You are not the only agent in this tree.** Several sessions and the user
   edit one working copy at once, so **commit only your own files** — the ones
   you changed this session, named explicitly. Expect files to change under you:
   a "modified since you read it" notice is usually a real edit by somebody
   else, so re-read and keep their change. If your own work disappears, say so
   plainly and re-apply it.

   The cost of ignoring this, on 2026-08-14: a session reset the tree while
   tidying up and destroyed a half-finished feature and a security fix
   belonging to two other sessions. Untracked files survived; edits to tracked
   files did not. `.claude/hooks/guard_bash.py` now refuses that family.

No emojis anywhere a person reads them — commit messages, PR bodies, UI copy.
The hook catches commit messages; the rest is on you.

---

## What the platform is

**"The Process Is The Goal"** — celebrate present-focused learning, not future
outcomes. See [core_philosophy.md](core_philosophy.md). This is the reason
behind product decisions that otherwise look arbitrary.

Four surfaces, and the names matter because two of them are permanent siblings,
not successive versions:

| Surface | Directory | What it is |
|---|---|---|
| **web platform** | `web/` | React 18.3 + Vite. The production web app. |
| **mobile app** | `mobile/` | Expo SDK 55 + Expo Router + NativeWind. iOS/Android. Its web target is dev-only. |
| **SIS console** | `web/src/pages/sis/` | `sis.optioeducation.com`. Its own surface, its own roles. |
| **marketing** | `marketing/` | Astro. Serves `www.optioeducation.com`. |

Never say "learning app" — it is ambiguous. Never reintroduce "v1"/"v2" for web
and mobile: the directories were `frontend/` and `frontend-v2/` until 2026-09-08
and that naming read as a migration in progress. It is not one. Web users stay
on the web app indefinitely.

Backend is Flask 3.0 + Supabase (PostgreSQL), httpOnly cookies and CSRF, on
Render. All AI goes through Gemini; `Config.GEMINI_MODEL` is the only place a
model name may appear.

### Course architecture

```
Course -> Projects (Quests) -> Lessons -> Tasks
```

A **Project** is a Quest that sits inside a Course — the same database row,
named for its context. **Pillars are on Tasks, not on Quests.** **XP is earned
on Tasks, not on Lessons.**

Lessons are deliberately thin. The teaching philosophy is just-in-time: give a
student the minimum needed to start a competent attempt, because the knowledge
gap they hit while *doing* is what creates the motivation to close it. A lesson
that teaches everything up front is a lesson nobody reads.

### Roles

Two populations, and conflating them is the most common source of access bugs:

| User type | `organization_id` | `role` | `org_role` |
|---|---|---|---|
| Platform student / parent / advisor / observer | `NULL` | the real role | `NULL` |
| Org member | set | `org_managed` | the real role |
| Superadmin | `NULL` | `superadmin` | `NULL` |

Use `get_effective_role(user)`; it handles both. Valid roles are `superadmin`,
`org_admin`, `campus_coordinator`, `advisor`, `parent`, `student`, `observer` —
`admin`, `teacher`, `educator` and `school_admin` are not roles and never were.
`campus_coordinator` is org-only, deliberately absent from `UserRole`.

`users.is_org_admin` is **derived** by a database trigger from the role columns.
Write the roles, read the flag.

SIS access tiers live in [backend/utils/sis_roles.py](backend/utils/sis_roles.py)
— use them, never a hand-written role tuple in a route module. `ADMIN_ROLES` is
the default for staff-facing work; `FINANCE_ROLES` is money only. A campus
coordinator is an org admin minus the finances, which is why pay data on an
otherwise-operational record is redacted per field
(`sis_staff_service.PAY_FIELDS`) rather than hidden by withholding the endpoint.
Add a pay column, add it to `PAY_FIELDS`, or it leaks.

---

## Architectural intent

**One route, one owner.** Flask does not warn when two blueprints register the
same rule — it dispatches to whichever registered first and the other becomes
unreachable dead code, taking its auth decorator with it. Four production bugs
so far. If an endpoint enforces a stricter role than its code says, resolve the
real handler first: `app.url_map.bind('localhost').match('/api/x', method='PUT')`.

**Never count rows in Python.** PostgREST truncates every response at 1,000 rows
and tells you nothing — `APIResponse` drops the `Content-Range` header, so a
truncated read looks exactly like a complete one. This shipped a real bug: SIS
enrollment counts *fell* as more families enrolled. Use `count='exact'` for a
number, or `utils.db_fetch.fetch_all_rows()` when you truly need every row.
Anything bounded by one parent row is fine as it is. Never raise
`POSTGREST_MAX_ROWS`; `utils/db_truncation_canary.py` warns when a response
holds exactly the cap.

**RLS is the access control, and the client you pick decides whether it
applies.** `get_user_client()` enforces it; `get_supabase_admin_client()`
bypasses it, and every call site must justify itself. New tables inherit Data
API grants — no per-table `GRANT` in a migration.

**Tokens live in memory and httpOnly cookies**, never in web storage. Safari and
iOS fall back to Authorization headers when cookies are blocked
(`session_manager.py`, `browserDetection.js`).
See [docs/ADR-001-token-storage.md](docs/ADR-001-token-storage.md).

**Repositories for new code** (`backend/repositories/`). Existing direct
`.table()` calls are fenced by a ratchet rather than migrated: ~9% adherence is
the accepted steady state, decided on cost, not deferred.

---

## Working in this repository

**Local development**: [LOCAL_DEVELOPMENT.md](LOCAL_DEVELOPMENT.md) — the exact
environment and the traps you only find by hitting them. Backend :5001, web
:3000, mobile :8081. Do not restart or kill a dev server unless asked; another
session may be mid-verification on it.

**Testing.** While iterating, run the affected files; the Stop hook does that
for you from what you touched. Run the full suites once before committing:
`cd backend && pytest`, `cd web && npm run test:run`, `cd mobile && npm test`.
Zero failures is the bar. Do not skip, xfail or delete a test to reach it — if a
test is genuinely wrong, say so out loud and explain why. Coverage floors and
ratchet ceilings live in [RATCHETS.md](docs/remediation-2026-09/RATCHETS.md),
which is the file to edit when a number legitimately moves.

**Shipping.** `git push origin develop` deploys dev and publishes the preview
OTA. Production is a direct push to `main` — no PR gate — which triggers
`release.yml`: tests, then the Render deploys, then the production OTA. Prod
auto-deploy is OFF, so bad code can land on `main` but cannot reach users. Ask
first. Reasoning: [docs/OPS_HISTORY.md](docs/OPS_HISTORY.md).

**Migrations.** Do not touch `supabase/migrations/` casually — the history and
the directory disagree, as documented in
[MIGRATION_RECONCILIATION.md](docs/remediation-2026-09/MIGRATION_RECONCILIATION.md).

**Skills.** `.claude/skills/` carries the four workflows this repository repeats:
`ship-feature`, `debug-production`, `review-diff`, `scoped-refactor`. Read the
one that matches before improvising.

---

## Reference

**Supabase projects** (one MCP connection, `project_id` per call):

| Project | ref | What |
|---|---|---|
| **Optio** | `vvfgxcykxjybtvpfzwyx` | This repo. **Production.** The default. |
| optio-staging | `kltoyqefmcgolbplplsa` | What dev Render reads. Synthetic data only. |
| chamberlin / praxis | `cpuvzobtymgjdoqfalfg` / `qsnbrspowgvcehkcxekm` | Other apps. Not this one. |

The Optio project is in the **Shortbird** org, not the org named "Optio".

**Render** (Shortbird, `tea-d9ah63qq4dsc739armqg`). Auto-deploy ON for dev, OFF
for prod. Dev: backend `srv-d9sjl22fngtc73ffenl0`, frontend
`srv-d9sjl3n10e5c73a14b2g`, mobile web `srv-d9sjl42fngtc73fff1d0`. Prod: backend
`srv-d9sjl1f10e5c73a14610`, frontend `srv-d9sjl2qjnfac739k091g`, cron
`crn-d9sjl4tbedkc73dmb010`, redis `red-d9sjl16gekts738r0u2g`.

**Environments**: dev https://optio-dev-frontend-r3v8.onrender.com (`develop`);
prod https://www.optioeducation.com and https://api.optioeducation.com (`main`).
Shareable app links use `app.optioeducation.com`, not `www`.

**Mobile**: `src/config/navigation.ts` is the single source of truth for nav. Do
not set `EXPO_PUBLIC_API_URL` in a local `.env` — `Platform.select` in
`src/services/api.ts` handles web versus native, and setting it breaks native.

---

## Extended documentation

- **Every ratchet, hook and ceiling**: [RATCHETS.md](docs/remediation-2026-09/RATCHETS.md)
- **What is still open, and why**: [REGISTER.md](docs/remediation-2026-09/REGISTER.md)
- **What is closed — read before changing auth, logging or CI guards**: [CLOSED_FINDINGS.md](docs/remediation-2026-09/CLOSED_FINDINGS.md)
- **Local development**: [LOCAL_DEVELOPMENT.md](LOCAL_DEVELOPMENT.md) · **Testing**: [web/TESTING.md](web/TESTING.md) · **MCP**: [docs/MCP_SETUP.md](docs/MCP_SETUP.md)
- **Ops history**: [docs/OPS_HISTORY.md](docs/OPS_HISTORY.md) · **Repository pattern**: [backend/docs/REPOSITORY_PATTERN.md](backend/docs/REPOSITORY_PATTERN.md) · **Env keys**: [backend/docs/ENV_KEYS_REFERENCE.md](backend/docs/ENV_KEYS_REFERENCE.md)
- **Design system** — when a page and this doc disagree, the page is wrong: [docs/design/DESIGN_SYSTEM.md](docs/design/DESIGN_SYSTEM.md) · **Brand**: [docs/OPTIO_BRAND_GUIDELINES.md](docs/OPTIO_BRAND_GUIDELINES.md)
- **Finished, point-in-time docs** — if one disagrees with the code, the code is right: [STALE_DOCS.md](docs/remediation-2026-09/STALE_DOCS.md)
