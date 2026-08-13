# Optio Platform - AI Agent Guide

**Last Updated**: August 11, 2026 | **Local Dev**: Enabled

---

## Critical Rules (Read First)

1. **LOCAL VERIFICATION REQUIRED** - Never commit until user confirms fix works at http://localhost:3000
2. **Commit only after user verification** - `develop` (dev deploy + preview OTA) or `main` (prod). Prod is direct-push-to-`main` (no PR) — see Git Configuration. Confirm with the user before pushing to `main`.
3. **No emojis** - Professional tone
4. **Verify DB schema first** - Use Supabase MCP before ANY query (table names change)
5. **Use Optio brand colors** - `optio-purple`/`optio-pink` (NOT `purple-600`/`pink-600`)
6. **Run tests before production** - `ci.yml` gates pull requests; `release.yml` runs the same suites on push to `main`, and Render deploys + the production OTA publish only if they pass. Don't push known-failing code to `main`.
7. **Scope test runs** - While iterating, run only the affected test files (`npx vitest run <files>`). Run the full suite (`npm run test:run`) once, before commit/push — not after every change.
8. **Include superadmin in role checks** - When creating new routes with role-based authorization, ALWAYS include `superadmin` in the allowed roles list.
9. **API keys via Config class only** - All API keys and secrets must be accessed via `Config` from `app_config.py`, never `os.getenv()` directly. See `backend/docs/ENV_KEYS_REFERENCE.md`.
10. **Never count rows in Python** - PostgREST silently truncates every response at 1000 rows (`Config.POSTGREST_MAX_ROWS`), so fetching rows to tally them returns a number that is quietly wrong once an org gets big enough. Use `count='exact'` for one number, or `utils.db_fetch.fetch_all_rows()` when you genuinely need every row. See [Row Limits](#row-limits-postgrests-silent-truncation).

### Role System (Platform vs Organization Users)

**Platform Users** (`organization_id = NULL`)
- Not in any organization, use the Optio platform directly
- Have a direct role in the `role` column: `student`, `parent`, `advisor`, `observer`
- `org_role` is NULL
- Superadmin is always a platform user with `role = 'superadmin'`

**Organization Users** (`organization_id` is set)
- Belong to an external organization (school, program, etc.)
- Have `role = 'org_managed'` (platform role)
- Actual role is in `org_role` column: `student`, `parent`, `advisor`, `org_admin`, `observer`
- Org admin controls their role via `org_role`

| User Type | organization_id | role | org_role |
|-----------|-----------------|------|----------|
| Platform student | `NULL` | `student` | `NULL` |
| Platform parent | `NULL` | `parent` | `NULL` |
| Org student | `<uuid>` | `org_managed` | `student` |
| Org admin | `<uuid>` | `org_managed` | `org_admin` |
| Superadmin | `NULL` | `superadmin` | `NULL` |

**Use `get_effective_role(user)` to get the actual role** - this handles org_managed users automatically.

**Never write `users.is_org_admin`.** It is derived from `role`/`org_role`/`org_roles`
by the `sync_is_org_admin` trigger
([20260807](supabase/migrations/20260807_campus_coordinator_org_role_constraints.sql)).
Write the role columns and read the flag back. The flag alone grants org admin access
in `require_school_admin`, `require_org_admin`, `require_advisor` and
`PrivateRoute.jsx` — before the trigger, the ~11 paths that set roles without it left
demoted admins holding admin access.

**Adding a role to `OrgRole` needs a migration.** Two CHECK constraints on `users`
(`valid_org_role`, `valid_org_roles`) list the valid values, and nothing in the app
notices when they disagree — the role validates all the way down and dies at the
write as an unreadable 500. `backend/tests/test_org_role_constraints.py` fails CI on
that gap.

### Valid Roles (7 total)
| Role | Access Level |
|------|-------------|
| `superadmin` | Full access to everything (only tannerbowman@gmail.com) |
| `org_admin` | Organization admin tools only |
| `campus_coordinator` | **Org-only.** Everything `org_admin` has, minus the money — see below |
| `advisor` | Advisor access (org-specific or platform) |
| `parent` | Parent access (org-specific or platform) |
| `student` | Student access (org-specific or platform) |
| `observer` | View-only access to linked students, can comment on student work |

**INVALID roles** (do NOT use): `admin`, `teacher`, `educator`, `school_admin`

#### Campus coordinator

`campus_coordinator` is an **org role only** — in `OrgRole`, deliberately NOT in
`UserRole`, so it can never appear in `users.role`. Front-office staff who run the
campus without seeing the school's finances.

SIS access tiers live in [backend/utils/sis_roles.py](backend/utils/sis_roles.py)
— **use these, don't re-declare a role tuple in a route module**:

| Tier | Who | Use for |
|------|-----|---------|
| `STAFF_ROLES` | admin + coordinator + advisor + superadmin | Anything staff touch (class-scoped downstream for teachers) |
| `ADMIN_ROLES` | admin + coordinator + superadmin | The front office: people, classes, registration, attendance, paperwork |
| `FINANCE_ROLES` | admin + superadmin | **The money**: billing, tuition, Stripe, timesheets, payroll |

Rules when adding SIS routes or fields:
- Reach for `ADMIN_ROLES` by default. Use `FINANCE_ROLES` **only** for money.
- `caller_is_admin()` is True for a coordinator — the restriction is financial,
  not scope-based. Use `sis_service.caller_sees_pay(user_id)` for the money check.
- Pay data on an otherwise-operational record is **redacted per-field**, not
  hidden by withholding the endpoint (see `sis_staff_service.PAY_FIELDS` /
  `redact_pay`). Adding a new pay column? Add it to `PAY_FIELDS` or it leaks.
- Frontend mirrors this in [sisRole.js](frontend/src/pages/sis/sisRole.js):
  `isSisAdmin` (chrome), `canSeeFinance` (money). Chrome only — the backend is the gate.

---

## Quick Reference

### Environments
| Env | URL | Branch |
|-----|-----|--------|
| Local (v1 web) | http://localhost:3000 | any |
| Local (v2 mobile, web preview) | http://localhost:8081 | any |
| Local (v2 mobile, native) | exp://192.168.86.20:8081 | any |
| Dev | https://optio-dev-frontend-r3v8.onrender.com | `develop` |
| Prod | https://www.optioeducation.com | `main` |
| API | https://api.optioeducation.com | `main` |

### Tech Stack
- **Backend**: Flask 3.0 + Supabase (PostgreSQL) + httpOnly cookies + CSRF
- **Web (v1)**: React 18.3 + Vite + TailwindCSS (in `frontend/`) — the production web app
- **Mobile (v2)**: Expo SDK 55 + Expo Router + NativeWind in `frontend-v2/`, dev builds via EAS — iOS/Android app
- **AI**: Gemini `gemini-3.5-flash-lite` (primary), fallbacks `gemini-3.6-flash` → `gemini-2.5-flash`. Configured in `app_config.py` (`GEMINI_MODEL` / `GEMINI_FALLBACK_MODELS`).
- **Host**: Render

> **Surface names:** say **web platform** and **mobile app** ("learning app" is
> ambiguous — never use it). The SIS console (`sis.optioeducation.com`) is its own
> surface. v1 = web app (`frontend/`); v2 = mobile app (`frontend-v2/`, a universal
> Expo project whose web target is dev-only). Web users stay on v1 indefinitely.

### Frontend V2 (Mobile App)
Key files:
- `src/config/navigation.ts` - Single source of truth for all nav items (sidebar + tabs)
- `src/services/api.ts` - API client with Bearer auth (Platform.select for web vs mobile URLs)
- `src/stores/authStore.ts` - Zustand auth store
- `src/components/ui/` - Shared UI component library
- `tailwind.config.js` - Brand tokens (must be .js not .ts, must include NativeWind preset)

**Mobile tabs:** Bounties, Journal, Home (center), Buddy, Profile
**Desktop sidebar:** Home, Quests, Bounty Board, Buddy, Journal, Profile
**Web-only:** Quests, Admin, Course Builder

**API URL config:** Do NOT set `EXPO_PUBLIC_API_URL` in `.env` — it breaks mobile.
Platform.select in api.ts handles web (localhost) vs mobile (LAN IP) automatically.

### Core Philosophy
"The Process Is The Goal" - Celebrate present-focused learning, not future outcomes.
See [core_philosophy.md](core_philosophy.md).

---

## Course Architecture

### Hierarchy
```
Course → Projects (Quests) → Lessons → Tasks
```

- **Course**: Container that combines multiple Projects into structured curriculum
- **Project**: A Quest when it's part of a Course (same DB record, different context)
- **Lesson**: Brief instructional content with "Lesson Steps" (text, video, links, images, files)
- **Task**: Actions students complete to earn XP (can be suggested or student-created)

### Database Tables
```
courses              - id, title, description, status, visibility, created_by, organization_id
course_quests        - course_id, quest_id, sequence_order (links Projects to Courses)
quests               - id, title, quest_type, is_active (becomes "Project" when in a Course)
curriculum_lessons   - id, quest_id, title, content, sequence_order
curriculum_lesson_tasks - lesson_id, task_id (links Tasks to Lessons)
user_quest_tasks     - id, user_id, quest_id, title, pillar, xp_value
```

### Just-in-Time Teaching Philosophy
Lessons provide **minimal info** to start a competent attempt; learning happens during
**task execution**, not content consumption. Knowledge gaps hit during doing create
intrinsic motivation. Personalized tasks = natural engagement.

### Course Builder Notes
- Adding a "Project" = creating/connecting a Quest
- Each Lesson should have suggested Task ideas (students can also create their own)
- Pillars are on Tasks, NOT on Quests/Projects
- Tasks are where XP is earned, not Lessons

---

## Local Development

Development happens on macOS. Repo at `~/pathweaver_2.0`, backend venv at
`~/pathweaver_2.0/venv` (Python 3.13 via Homebrew), Node 22 from Homebrew.

**Check if servers running:**
```bash
curl -s -o /dev/null -w "%{http_code}" http://localhost:5001/api/health   # 200 = backend up
lsof -nP -iTCP:3000 -sTCP:LISTEN                                          # vite dev server
```

**Start servers:**
```bash
# Backend (Flask on :5001)
cd ~/pathweaver_2.0 && source venv/bin/activate && python backend/app.py

# Frontend (Vite on :3000)
cd ~/pathweaver_2.0/frontend && npm run dev
```
From Claude Code, run each with `run_in_background` instead of backgrounding with `&`.

**Stop servers:**
```bash
lsof -tnP -iTCP:3000 -sTCP:LISTEN | xargs kill   # frontend
lsof -tnP -iTCP:5001 -sTCP:LISTEN | xargs kill   # backend
```

**WARNING:** Never use `killall node` / `pkill node` - this kills Claude Code itself.

**Before committing:** Stop the servers using the commands above.

**Full setup guide:** [LOCAL_DEVELOPMENT.md](LOCAL_DEVELOPMENT.md)

### Git Configuration

Remote: `https://github.com/shortbird/pathweaver_2.0.git` (HTTPS + Git Credential Manager).

**Dev workflow:**
```bash
git push origin develop    # Auto-deploys to Render dev + publishes the preview OTA
```

**Prod workflow (direct-to-main):** no PR gate — push directly:
```bash
git push origin main
```

`.github/workflows/release.yml` runs on push to `main`:
- jobs `backend`, `web` (v1 + coverage gate), `mobile` (v2) run in parallel
- job `deploy` (`needs: [backend, web]`) triggers the prod Render deploys via the
  Render API, pinned to the pushed SHA
- job `ota` (`needs: [backend, web, mobile]`) publishes the production OTA

Render auto-deploy is OFF for both prod services — CI is the only prod deploy
trigger. Bad code can land on `main` but won't deploy or OTA. So the prod ship is:
`git push origin main` → watch `Release (main)`. History/why: [docs/OPS_HISTORY.md](docs/OPS_HISTORY.md).

**IMPORTANT: When the user says "push", always stage and commit ALL outstanding
changes (staged, unstaged, and untracked relevant files) before pushing. Never
selectively unstage files — push everything.**

---

## Database Schema

### ⚠️ Common Mistakes
- ❌ `quest_tasks` → Use `user_quest_tasks`
- ❌ `.select('*, quest_tasks(*)')` → Relationship removed
- ✅ Always verify with Supabase MCP first

### Core Tables
```
users                    - id, email, role, display_name, total_xp, organization_id, is_dependent, managed_by_parent_id
quests                   - id, title, quest_type, lms_course_id, is_active, organization_id
user_quest_tasks         - id, user_id, quest_id, title, pillar, xp_value, approval_status
quest_task_completions   - id, user_id, quest_id, task_id, xp_awarded, completed_at
user_skill_xp            - user_id, pillar, xp_amount
badges                   - id, name, pillar_primary, min_quests, min_xp, image_url
organizations            - id, name, slug, quest_visibility_policy, is_active
```

### Deleted Tables (Don't Query)
`task_collaborations`, `subscription_tiers`, `friendships`, `calendar_view_preferences`,
`user_quest_deadlines`, `promo_signups`, `promo_codes`, `services`, `service_inquiries`,
`email_campaigns`, `email_campaign_sends`, `user_segments`, `quest_collaborations`,
`quest_collaboration_members`, `shared_evidence`, `shared_evidence_approvals`,
`ai_content_metrics`, `ai_generation_metrics`, `ai_improvement_logs`, `ai_prompt_templates`,
`ai_prompt_versions`, `ai_quest_review_history`, `quality_action_logs`, `quest_task_flags`,
`quest_template_task_flags`, `task_merges`, `task_merge_sources`, `parent_connection_requests`,
`parent_evidence_uploads`, `observer_requests`, `quest_conversions`, `tutor_analytics`,
`tutor_parent_access`, `accreditor_reviews`

### Schema Check Pattern
```sql
SELECT column_name, data_type FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'your_table';
```

### Row Limits: PostgREST's silent truncation

**Every Data API response is capped at 1000 rows, and nothing tells you.**
`APIResponse` exposes only `data` and `count` — the `Content-Range` header is
dropped, so a truncated read is indistinguishable from a complete one. This shipped
a real bug (SIS enrollment counts *fell* as more families enrolled — postmortem:
[docs/icreate/FAB_TRIAGE_2026-07-29_enrollment_counts.md](docs/icreate/FAB_TRIAGE_2026-07-29_enrollment_counts.md)).

**Pick by what you need:**

```python
# A count -> let Postgres count. Cannot truncate.
n = client.table('class_enrollments').select('id', count='exact') \
      .eq('class_id', cid).eq('status', 'active').execute().count or 0

# Every row of an org-wide read -> page it.
from utils.db_fetch import fetch_all_rows
rows = fetch_all_rows(lambda: (
    client.table('class_enrollments').select('id, class_id')
    .in_('class_id', class_ids).eq('status', 'active')
))

# WRONG: silently truncates once the org outgrows the cap.
rows = client.table('class_enrollments').select('class_id') \
         .in_('class_id', class_ids).execute().data
counts = Counter(r['class_id'] for r in rows)
```

**Rules of thumb**
- Bounded by one parent row (one student's classes, one class's roster)? Fine as-is.
- Row count grows with the size of an org? Page it, or aggregate in Postgres.
- Never raise `POSTGREST_MAX_ROWS` to make a symptom go away.

**Safety net:** `utils/db_truncation_canary.py` logs a warning + Sentry event (tag
`source:db_truncation`) whenever a response holds exactly the cap. A hit means some
read is truncated — fix the call site.

### Data API Grants

New tables in `public` inherit Data API grants automatically via
[20260527_restore_default_data_api_grants.sql](supabase/migrations/20260527_restore_default_data_api_grants.sql)
(`ALTER DEFAULT PRIVILEGES`). **No per-table GRANT statements needed in new
migrations.** RLS remains the access-control mechanism. If you create a table
outside the normal migration flow, verify it's reachable and add grants if not.

---

## Authentication

### httpOnly Cookies Only
```javascript
// ✅ CORRECT
api.post('/api/auth/login', { email, password })  // Backend sets cookies

// ❌ WRONG
localStorage.setItem('token', ...)  // Never store tokens!
```

### RLS Client Selection
```python
supabase = get_user_client()           # User operations (RLS enforced)
admin = get_supabase_admin_client()    # Admin operations (bypasses RLS)
```

### Safari/iOS
Automatic fallback to Authorization headers when cookies blocked. See
`session_manager.py` and `browserDetection.js`.

---

## Common Patterns

### Brand Colors
```jsx
// ✅ CORRECT
className="bg-gradient-to-r from-optio-purple to-optio-pink"

// ❌ WRONG
className="bg-gradient-to-r from-purple-600 to-pink-600"
```

### CSRF POST Requests
```javascript
// ✅ CORRECT - Always include body
api.post('/api/badges/123/select', {})

// ❌ WRONG - Causes CSRF error
api.post('/api/badges/123/select')
```

### Repository Pattern (New Code)
```python
# ✅ NEW code uses repositories
from backend.repositories.task_repository import TaskRepository
task_repo = TaskRepository(client=supabase)
task = task_repo.get_task_with_relations(task_id, user_id)

# Existing code may use direct DB (acceptable for complex queries)
```

### One route, one owner

**Flask does not warn when two blueprints register the same rule.** It dispatches
to whichever registered first; the other view becomes unreachable dead code. Both
files still look correct in review, so what silently ships is the
**first-registered module's auth decorator**.

Four production bugs so far, all `admin_core.py` shadowing `admin/*`: advisors
403'd off `/api/admin/quests`; "Failed to load users" from a copy querying a
nonexistent column; and org admins told **"Superadmin access required"** when
saving a user, which blocked them from promoting anyone to `org_admin`.

- `tests/unit/test_no_duplicate_routes.py` fails on any duplicate. Don't
  suppress it — delete the loser or merge the two views.
- Rules collide by **path shape**, not text: `/users/<user_id>` and
  `/users/<target_user_id>` are the same rule. The name only changes the kwarg.
- Adding a route to an existing path? `grep` the rule across `routes/` first.
- Symptom to recognize: an endpoint enforces a **stricter role than its code
  says**. Resolve the real handler before debugging the decorator:
  ```python
  app.url_map.bind('localhost').match('/api/admin/users/x', method='PUT')
  ```

---

## Testing

While iterating: `npx vitest run <affected test files>`.

**Before production merge (run once):**
```bash
cd frontend && npm run test:run    # Must be 95%+ pass rate
npm run test:coverage              # Must be 60%+ coverage
```

### CI structure

Each test suite is defined ONCE, in a reusable workflow, and called by both
gates — so what gates the merge is identical to what gates the deploy. Edit the
`tests-*.yml` file, never a copy.

| Workflow | Trigger | Purpose |
|---|---|---|
| [ci.yml](.github/workflows/ci.yml) | `pull_request` → main/develop, push develop | **Pre-merge gate** |
| [release.yml](.github/workflows/release.yml) | push `main` | Release gate + deploy + OTA |
| [tests-backend.yml](.github/workflows/tests-backend.yml) | called | pytest + coverage + pip-audit |
| [tests-web.yml](.github/workflows/tests-web.yml) | called | vitest + coverage |
| [tests-mobile.yml](.github/workflows/tests-mobile.yml) | called | jest + coverage + audit gate |
| [tests-integration.yml](.github/workflows/tests-integration.yml) | called | `requires_db` on a free local Supabase stack |
| [supabase-branch-reaper.yml](.github/workflows/supabase-branch-reaper.yml) | daily | Deletes preview branches >3d old |

**Coverage floors** — ratchet up, never down. Set just under measured so a
regression fails and normal churn doesn't:

| Suite | Floor | Measured (2026-08-13) |
|---|---|---|
| Backend | 41% | 42.08% |
| Web (v1) | 53% | 54.44% |
| Mobile (v2) | 31/24/32/23 (stmt/br/line/fn), in `jest.config.js` | 31.37/24.42/32.63/23.75 |

**Integration tests are advisory and red on purpose.** The harness is real; the
143 tests it runs were written against an architecture the app doesn't have and
cannot pass yet. Read
[backend/tests/integration/README.md](backend/tests/integration/README.md)
before touching them.

**Never point a test suite at a Supabase preview branch.** They cost real money
(abandoned ones were 38% of the Aug 2026 invoice) and it puts a service-role key
for a production clone in CI. Use the local stack.

- The mobile job's `npm audit` runs through [scripts/audit-gate.mjs](scripts/audit-gate.mjs):
  advisories with no published fix can be accepted in
  [frontend-v2/audit-allowlist.json](frontend-v2/audit-allowlist.json) with a reason
  and `recheck_after` date. Verify a fix genuinely doesn't exist before allowlisting
  (compare against `npm view <pkg> versions` — npm's "fix available" sometimes
  proposes a downgrade).
- Prod Render deploys fire from `release.yml`'s `deploy` job only on green tests.

**Full testing guide:** [frontend/TESTING.md](frontend/TESTING.md)

---

## Key API Endpoints

### Auth
`POST /api/auth/login` | `POST /api/auth/register` | `POST /api/auth/refresh` | `GET /api/auth/me`

### Quests & Tasks
`GET /api/quests` | `POST /api/quests/:id/start` | `POST /api/tasks/:id/complete` | `DELETE /api/tasks/:id`

### Admin
`GET /api/admin/users/*` | `GET /api/admin/quests/*` | `GET /api/admin/analytics/*` | `GET /api/admin/organizations/*`

### Dependents
`GET /api/dependents/my-dependents` | `POST /api/dependents/create` | `POST /api/dependents/:id/promote`

### Observer
`POST /api/observers/invite` | `GET /api/observers/my-students` | `GET /api/observers/student/:id/portfolio`

---

## File Structure

```
backend/
├── routes/           # API endpoints (use repositories for new code)
├── repositories/     # Data access layer (15 repos)
├── services/         # Business logic (22 services)
└── middleware/       # CSRF, rate limiting

frontend/src/           # V1: web app (React + Vite) — the production web surface
├── pages/              # Route components
├── components/         # UI components
└── services/           # API + auth

frontend-v2/            # V2: mobile iOS/Android app (Expo)
├── app/                # Expo Router pages (file-based routing)
├── src/                # components/ui, config/navigation.ts, hooks, services, stores
├── tailwind.config.js  # Brand tokens (must be .js, not .ts)
└── metro.config.js     # NativeWind integration
```

---

## MCP Quick Reference

Setup, connection details, and troubleshooting: [docs/MCP_SETUP.md](docs/MCP_SETUP.md).

### Supabase projects (same org "Optio", one connection reaches all — pass `project_id` per call)
| Project | ref / project_id | What it is |
|---------|------------------|------------|
| **Optio** | `vvfgxcykxjybtvpfzwyx` | This repo (pathweaver_2.0) — the prod DB. Default for anything in this codebase. |
| chamberlin | `cpuvzobtymgjdoqfalfg` | Separate app (Chamberlin Music). |
| praxis | `qsnbrspowgvcehkcxekm` | Separate app (fitness/nutrition). |

> For work in THIS repo, always target `vvfgxcykxjybtvpfzwyx`.

Useful tools: `list_tables`, `execute_sql` (read-only), `get_schemas`.

### Render services (Shortbird workspace, `tea-d9ah63qq4dsc739armqg`)
| Environment | Service | ID | Branch |
|-------------|---------|-----|--------|
| Dev | Backend | `srv-d9sjl22fngtc73ffenl0` | `develop` |
| Dev | Frontend | `srv-d9sjl3n10e5c73a14b2g` | `develop` |
| Dev | v2 Frontend | `srv-d9sjl42fngtc73fff1d0` | `develop` |
| Prod | Backend | `srv-d9sjl1f10e5c73a14610` | `main` |
| Prod | Frontend | `srv-d9sjl2qjnfac739k091g` | `main` |
| Prod | Cron (dispatch) | `crn-d9sjl4tbedkc73dmb010` | `main` |
| Prod | Redis (rate limit) | `red-d9sjl16gekts738r0u2g` | — |

Auto-deploy: ON for dev services, OFF for prod (CI-triggered only). All backends pin
`PYTHON_VERSION=3.11.9`.

---

## Troubleshooting

| Error | Fix |
|-------|-----|
| "quest_tasks does not exist" | Use `user_quest_tasks` |
| "friendships does not exist" | Table dropped (Mar 2026 audit) |
| "calendar_view_preferences does not exist" | Table dropped (Mar 2026 audit) |
| "Content-Type must be application/json" | Add body: `api.post(url, {})` |
| 401 Unauthorized | Check httpOnly cookies |
| Wrong brand colors | Use `optio-purple`/`optio-pink` |
| RLS policy violations | Use correct client (user vs admin) |

---

## Extended Documentation (read on demand)

- **Local Development**: [LOCAL_DEVELOPMENT.md](LOCAL_DEVELOPMENT.md)
- **Testing Guide**: [frontend/TESTING.md](frontend/TESTING.md)
- **MCP Setup & Troubleshooting**: [docs/MCP_SETUP.md](docs/MCP_SETUP.md)
- **Supabase Branching**: [docs/SUPABASE_BRANCHING.md](docs/SUPABASE_BRANCHING.md)
- **Ops History (deploy flow, hosting, migrations)**: [docs/OPS_HISTORY.md](docs/OPS_HISTORY.md)
- **Repository Pattern**: [backend/docs/REPOSITORY_PATTERN.md](backend/docs/REPOSITORY_PATTERN.md)
- **Design System (web v1)**: [docs/design/DESIGN_SYSTEM.md](docs/design/DESIGN_SYSTEM.md) — when a page and this doc disagree, the page is wrong
- **Core Philosophy**: [core_philosophy.md](core_philosophy.md)
- **Migration Status**: [backend/docs/REPOSITORY_MIGRATION_STATUS.md](backend/docs/REPOSITORY_MIGRATION_STATUS.md)
- **Token Storage Model (ADR-001)**: [docs/ADR-001-token-storage.md](docs/ADR-001-token-storage.md)
- **Audit Implementation Plan**: [AUDIT_IMPLEMENTATION_PLAN.md](AUDIT_IMPLEMENTATION_PLAN.md) — historical (2026-04)
- **Branch Test Data**: [supabase/seed.sql](supabase/seed.sql)
