# Optio Platform - AI Agent Guide

**Last Updated**: April 14, 2026 | **Local Dev**: Enabled | **Multi-Agent**: Available

---

## Critical Rules (Read First)

1. **LOCAL VERIFICATION REQUIRED** - Never commit until user confirms fix works at http://localhost:3000
2. **Commit only after user verification** - `develop` (dev deploy + preview OTA) or `main` (prod). Prod is now direct-push-to-`main` (no PR) — see Git Configuration. Confirm with the user before pushing to `main`.
3. **No emojis** - Professional tone
4. **Verify DB schema first** - Use Supabase MCP before ANY query (table names change)
5. **Use Optio brand colors** - `optio-purple`/`optio-pink` (NOT `purple-600`/`pink-600`)
6. **Run tests before production** - `release.yml` runs them on push to `main`; Render deploys + the production OTA publishes only if they pass. Don't push known-failing code to `main`.
7. **Include superadmin in role checks** - When creating new routes with role-based authorization, ALWAYS include `superadmin` in the allowed roles list.
8. **API keys via Config class only** - All API keys and secrets must be accessed via `Config` from `app_config.py`, never `os.getenv()` directly. See `backend/docs/ENV_KEYS_REFERENCE.md`.
9. **Never count rows in Python** - PostgREST silently truncates every response at 1000 rows (`Config.POSTGREST_MAX_ROWS`), so fetching rows to tally them returns a number that is quietly wrong once an org gets big enough. Use `count='exact'` for one number, or `utils.db_fetch.fetch_all_rows()` when you genuinely need every row. See [Row Limits](#row-limits-postgrests-silent-truncation).

### Role System (Platform vs Organization Users)

Users fall into two categories:

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
Write the role columns and read the flag back. It matters because the flag alone
grants org admin access in `require_school_admin`, `require_org_admin`,
`require_advisor` and `PrivateRoute.jsx` — before the trigger, the ~11 paths that
set roles without it left demoted admins holding admin access.

**Adding a role to `OrgRole` needs a migration.** Two CHECK constraints on `users`
(`valid_org_role`, `valid_org_roles`) list the valid values, and nothing in the app
notices when they disagree — the role validates all the way down and dies at the
write as an unreadable 500. This is how `campus_coordinator` shipped assignable
everywhere except the database. `backend/tests/test_org_role_constraints.py` now
fails CI on that gap.

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

#### Campus coordinator (added 2026-08-04)

`campus_coordinator` is an **org role only** — it is in `OrgRole` but deliberately
NOT in `UserRole`, so it can never appear in `users.role`. It exists because
iCreate needed front-office staff who run the campus without seeing the school's
finances.

The SIS access tiers now live in one place, [backend/utils/sis_roles.py](backend/utils/sis_roles.py)
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

## Multi-Agent Worker System

For large tasks (audits, refactoring, feature implementation), you can ask the user to spawn parallel worker terminals.

### When to Use Workers

Use workers for:
- Full codebase audits (7 parallel audit tasks)
- Implementing fixes from audit findings (multiple files)
- Building features (backend + frontend + tests + docs in parallel)
- Large refactoring tasks

Don't use workers for:
- Quick fixes (single file)
- Debugging (interactive)
- Simple questions

### How to Request Workers

Say something like:
> "This is a large task. I'll create queue tasks for parallel processing. Can you open 2-3 additional terminal windows and run `/work-queue` in each? I'll coordinate from here."

### Available Commands

| Command | Purpose |
|---------|---------|
| `/full-audit` | Create 7 audit tasks (security, performance, a11y, quality, architecture, tests, legal) |
| `/compile-audit` | Compile audit findings after workers finish |
| `/fix-audit` | Create fix tasks from audit findings |
| `/queue-fix [desc]` | Add specific fix tasks manually |
| `/queue-status` | See what's queued/active/completed |
| `/work-queue` | **Run in worker terminals** - processes tasks until empty |
| `/verify-fixes` | Verify fixes after workers complete |
| `/ship-feature [desc]` | Create feature tasks (backend + frontend + tests + docs) |
| `/integrate-feature` | Merge feature work after workers finish |
| `/cleanup` | Clear completed tasks |

### Workflow Pattern

```
T1 (You):     /full-audit           → Creates 7 tasks
T2 (Worker):  /work-queue           → Processes tasks
T3 (Worker):  /work-queue           → Processes tasks  
T4 (Worker):  /work-queue           → Processes tasks
[Workers say "Queue empty"]

T1 (You):     /compile-audit        → Review findings
T1 (You):     /queue-fix [issues]   → Add fix tasks
T2-T4:        /work-queue           → Implement fixes
[Repeat until satisfied]

T1 (You):     /verify-fixes         → Confirm fixes
T1 (You):     git commit
```

### Task Queue Location

Tasks are stored in `.claude/workspace/`:
- `queue/` - Pending tasks (`.json` files)
- `active/` - Being processed
- `completed/` - Finished tasks

### Queue Task Format (IMPORTANT)

Tasks MUST be JSON files (not markdown). Use this structure:

```json
{
  "id": "fix_descriptive_name",
  "type": "implement_fix",
  "priority": 1,
  "payload": {
    "file": "path/to/file.js",
    "issue": "issue_type",
    "description": "Specific instructions for what to fix"
  }
}
```

**Issue types**: `test_reliability`, `large_file`, `refactor`, `todo`, `performance`, `security`, `accessibility`, `test_coverage`

**Creating tasks manually**:
```bash
cat > ".claude/workspace/queue/fix_$(date +%s)_name.json" << 'EOF'
{ "id": "fix_name", "type": "implement_fix", "priority": 1, "payload": { ... } }
EOF
```

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
- **AI**: Gemini `gemini-3.5-flash-lite` (primary; GA 2026-07-21), fallbacks `gemini-3.6-flash` → `gemini-2.5-flash`. Configured in `app_config.py` (`GEMINI_MODEL` / `GEMINI_FALLBACK_MODELS`). Upgraded 2026-07-28 from `gemini-2.5-flash-lite`, which had aged into frequent 503 "high demand" errors.
- **Host**: Render

> **What to call each surface (as of 2026-08-01):** say **web platform** and **mobile app**. "Learning app" is ambiguous — it reads as either one — so it is not used in code comments, docs, or anything a user sees. The SIS console (`sis.optioeducation.com`) is its own surface and keeps that name.

> **Naming convention (as of 2026-05-22):** v1 = the web app (`frontend/`). v2 = the mobile iOS/Android app (`frontend-v2/`). The `frontend-v2/` codebase is technically a universal Expo project that also builds for web — that web target is kept for dev/testing and a future page-by-page rebuild of the web app, but day-to-day "v2 work" means mobile. Web users stay on v1 indefinitely until that rebuild happens.

### Frontend V2 (Mobile App)
The `frontend-v2/` project is the iOS/Android mobile app, built with Expo. It is a universal codebase that also compiles to web (used in local dev and reserved for an eventual web rebuild), but the active product surface is mobile.

**Key files:**
- `src/config/navigation.ts` - Single source of truth for all nav items (sidebar + tabs)
- `src/services/api.ts` - API client with Bearer auth (Platform.select for web vs mobile URLs)
- `src/stores/authStore.ts` - Zustand auth store
- `src/components/ui/` - Shared UI component library
- `tailwind.config.js` - Brand tokens (must be .js not .ts, must include NativeWind preset)

**Mobile tabs:** Bounties, Journal, Home (center), Buddy, Profile
**Desktop sidebar:** Home, Quests, Bounty Board, Buddy, Journal, Profile
**Web-only:** Quests, Admin, Course Builder

**API URL config:** Do NOT set `EXPO_PUBLIC_API_URL` in `.env` -- it breaks mobile. Platform.select in api.ts handles web (localhost) vs mobile (LAN IP) automatically.

### Core Philosophy
"The Process Is The Goal" - Celebrate present-focused learning, not future outcomes

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
1. Lessons provide **minimal info** to start a competent attempt at applying knowledge
2. Learning happens during **task execution**, not content consumption
3. Students encounter knowledge gaps while doing → **intrinsic motivation** to learn more
4. **Personalized tasks** = doing things they're interested in = natural engagement

### Student Flow
1. Enroll in Course via Course Catalog
2. Begin first Project
3. Interact with Lessons (just enough info to start)
4. Complete Lesson Tasks to earn XP toward Project requirement
5. Meet XP requirement for each Project to complete Course

### Course Builder Notes
- Adding a "Project" = creating/connecting a Quest
- Each Lesson should have suggested Task ideas (students can also create their own)
- Pillars are on Tasks, NOT on Quests/Projects
- Tasks are where XP is earned, not Lessons

---

## Local Development

Development happens on macOS. The repo lives at `~/pathweaver_2.0`, the backend venv at `~/pathweaver_2.0/venv` (Python 3.13 via Homebrew), and Node 22 comes from Homebrew (`node@22`, keg-only — it is already linked into the default PATH).

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
# Frontend (port 3000) - targets only the Vite dev server, NOT Claude Code's node process
lsof -tnP -iTCP:3000 -sTCP:LISTEN | xargs kill

# Backend (port 5001)
lsof -tnP -iTCP:5001 -sTCP:LISTEN | xargs kill
```

**WARNING:** Never use `killall node` / `pkill node` - this kills Claude Code itself (which runs on Node.js).

**Before committing:** Stop the servers using the commands above

**Full setup guide:** [LOCAL_DEVELOPMENT.md](LOCAL_DEVELOPMENT.md)

### Git Configuration

**HTTPS + Git Credential Manager:** Configured for Claude Code to push/pull without manual authentication.

- Remote: `https://github.com/shortbird/pathweaver_2.0.git` (HTTPS)
- Auth: Git Credential Manager (`credential.helper = manager`)

**Dev workflow:**
```bash
git push origin develop    # Auto-deploys to Render dev + publishes the preview OTA
```

**Prod workflow (direct-to-main, as of 2026-06-07):**

There is **no PR gate** — `main` is not branch-protected (the `main-protection`
ruleset is disabled), so you push **directly to `main`**:

```bash
git push origin main
```

A single workflow `.github/workflows/release.yml` runs on push to `main`:
- jobs `backend`, `web` (v1 + coverage gate), `mobile` (v2) run in parallel
- job `deploy` (`needs: [backend, web]`) triggers the **prod Render deploys**
  (backend + web) via the Render API, pinned to the pushed SHA — it fires as
  soon as those two test jobs pass, without waiting for mobile/OTA
- job `ota` (`needs: [backend, web, mobile]`) publishes the **production OTA**
  only if all three test jobs pass

Render **auto-deploy is OFF for both prod services** (as of 2026-07-20) — the
old "Deploy after CI checks pass" setting waited for every check on the commit
(including the OTA publish) and sometimes never fired at all. CI is now the
only prod deploy trigger (`RENDER_API_KEY` repo secret). GitHub can't block a
direct push before it lands (checks run on the pushed commit), so "only deploy
if tests pass" is enforced at the **CI-deploy / OTA-gate layer**, not by
GitHub. Bad code can land on `main` but won't *deploy* or *OTA*.

So the prod ship is just: `git push origin main` → watch `Release (main)` →
Render deploys + production OTA publishes when tests pass.

> History: this replaced the old develop→PR→main flow (which double-ran every
> test: once on the develop push, once on the PR). The 3 separate test
> workflows were consolidated into `release.yml`; the OTA pipeline is described
> under "EAS Update / OTA" — `eas-update.yml` is now develop-only (preview).
> Prod web hosting (verified 2026-08-09): both the apex `optioeducation.com`
> and `www.optioeducation.com` are served by **Render** — 100% Render, no
> Vercel anywhere. DNS is at GoDaddy (`domaincontrol.com` nameservers); the
> apex A record is Render's shared anycast IP `216.24.57.1` (never changes),
> and `www`/`api`/`sis` are CNAMEs to the services' `.onrender.com` targets.
> Render routes custom domains by domain *attachment*, not CNAME target. The
> `Server: cloudflare` response header is Render's own CDN, not a Cloudflare
> zone we control. A Render deploy is what users see.

**IMPORTANT: When the user says "push", always stage and commit ALL outstanding changes (staged, unstaged, and untracked relevant files) before pushing. Never selectively unstage files -- push everything.**

---

## Supabase Branching (Safe Testing)

Use Supabase Branching to safely test database changes without affecting production data.

### How Branching Works
- Creates an isolated database copy with the same schema as production
- Production data does NOT carry over (starts fresh)
- All migrations from production are automatically applied
- Branch gets its own URL, API keys, and project reference
- Can merge schema changes back to production when ready

### Branch Management

**Create a branch (via Dashboard):**
1. Go to https://supabase.com/dashboard/project/vvfgxcykxjybtvpfzwyx/branches
2. Click "Create branch" and name it (e.g., `develop`)
3. Note the branch credentials (URL, anon key, service key)

**Using MCP tools:**
```
list_branches     - List all development branches
create_branch     - Create a new branch (requires cost confirmation)
delete_branch     - Delete a branch
merge_branch      - Merge migrations from branch to production
reset_branch      - Reset branch to clean state
rebase_branch     - Apply production migrations to branch
```

### Development Workflow

1. **Create branch** via Supabase Dashboard
2. **Copy credentials** to `backend/.env.branch`
3. **Swap environment**: Rename `.env` to `.env.prod` and `.env.branch` to `.env`
4. **Start local servers** and test at http://localhost:3000
5. **Run dangerous operations** safely (deletes, schema changes)
6. **Seed test data**: `psql $DATABASE_URL -f supabase/seed.sql`
7. **When done**: Swap back to production `.env`

### Configuration Files
| File | Purpose |
|------|---------|
| `backend/.env.branch` | Branch credentials template |
| `supabase/seed.sql` | Test data for fresh branches |

### Cost
- ~$0.32/hour when active
- Auto-pauses after inactivity
- Estimated: $5-15/month for typical development usage

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
`APIResponse` exposes only `data` and `count` — the `Content-Range` header that
would reveal the cut is dropped, so a truncated read is indistinguishable from a
complete one at the call site.

This shipped a real bug: the SIS class list built enrollment counts by fetching
every active `class_enrollments` row for the org and tallying them in Python.
When iCreate passed 1000 active enrollments the tail was silently discarded, so
displayed counts *fell as more families enrolled* — a full class read `0/12` while
its roster still listed twelve students. Postmortem:
[docs/icreate/FAB_TRIAGE_2026-07-29_enrollment_counts.md](docs/icreate/FAB_TRIAGE_2026-07-29_enrollment_counts.md).

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
- Never raise `POSTGREST_MAX_ROWS` to make a symptom go away — that moves the
  cliff without removing it, and it desyncs the canary below.

**Safety net:** `utils/db_truncation_canary.py` hooks the httpx session on every
client and logs a warning + Sentry event (tag `source:db_truncation`) whenever a
response comes back holding exactly the cap. A hit means some read is truncated
and whatever was computed from it is wrong — fix the call site. Watch for these
after any change that grows a customer's data.

### Data API Grants (Supabase 2026-10-30 change)

Supabase is changing the default so new tables in `public` won't be exposed to
the Data API (PostgREST / supabase-py / supabase-js) without an explicit grant.
For this project, [supabase/migrations/20260527_restore_default_data_api_grants.sql](supabase/migrations/20260527_restore_default_data_api_grants.sql)
sets `ALTER DEFAULT PRIVILEGES` so any future `CREATE TABLE` in `public` inherits
the implicit grants that Supabase used to apply automatically.

**You do not need to add per-table GRANT statements in new migrations** — the
default-privileges rule covers it. RLS remains the access-control mechanism.

If you create a table outside the normal migration flow (e.g., as a different
role), verify it's reachable via the backend and add explicit grants if not.

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
Automatic fallback to Authorization headers when cookies blocked. See `session_manager.py` and `browserDetection.js`.

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

---

## Testing

**Run before production merge:**
```bash
cd frontend && npm run test:run    # Must be 95%+ pass rate
npm run test:coverage              # Must be 60%+ coverage
```

**Current stats (v1 web — `frontend/`):** 353 tests, 100% pass rate, ~43% CI line coverage. (The 60.61% figure quoted pre-2026-04-14 came from a local run; CI coverage on a `pull_request` event was never verified until the first gated PR. See the coverage baseline note in `.github/workflows/frontend-tests.yml`.)
**Current stats (v2 mobile — `frontend-v2/`):** 276 tests, 100% pass rate.

**CI gates (enforced by [.github/workflows/](.github/workflows/) + GitHub ruleset + Render):**
- `Web (v1) Tests` (`Vitest + coverage gate` check) — 95%+ pass + 40%+ line coverage on PRs to main. Ratchet the coverage floor up over time; never down.
- `Mobile (v2) Tests` (`Jest Integration Tests` check) — 95%+ pass rate.
- `Backend Tests` (`test` check).
- A GitHub ruleset on `main` makes all three required before merge.
- The mobile job's `npm audit` runs through [scripts/audit-gate.mjs](scripts/audit-gate.mjs): same high/critical bar, but an advisory with **no published fix** can be accepted in [frontend-v2/audit-allowlist.json](frontend-v2/audit-allowlist.json) with a reason and a `recheck_after` date, rather than dropping the whole gate to `critical`. Expired entries fail the build. Check that a fix genuinely doesn't exist before adding one — compare the advisory's vulnerable range against `npm view <pkg> versions`, since npm's own "fix available" line sometimes proposes a downgrade.
- Prod Render deploys are triggered by the `deploy` job in `release.yml` (auto-deploy off), so only commits with green backend + web tests deploy. Dev services remain on "On commit" for fast iteration on `develop`.

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

frontend-v2/            # V2: mobile iOS/Android app (Expo). Universal codebase — also builds for web (dev + future rebuild), but the active product is mobile.
├── app/                # Expo Router pages (file-based routing)
│   ├── (auth)/         #   Login, register
│   └── (app)/(tabs)/   #   Dashboard, quests, journal, bounties, buddy, profile
├── src/
│   ├── components/
│   │   ├── ui/         #   Shared UI primitives (Button, Card, Input, etc.)
│   │   ├── engagement/ #   MiniHeatmap, EngagementCalendar, RhythmBadge
│   │   ├── journal/    #   LearningEventCard, TopicsSidebar
│   │   └── layouts/    #   ScrollPageLayout, Sidebar
│   ├── config/         #   navigation.ts (shared nav config)
│   ├── hooks/          #   useDashboard, useJournal
│   ├── services/       #   api.ts, tokenStore.ts
│   └── stores/         #   authStore.ts (Zustand)
├── tailwind.config.js  # Brand tokens (must be .js, not .ts)
└── metro.config.js     # NativeWind integration (patched for Windows)
```

### Removed in March 2026 Audit
- **Frontend**: Calendar, Payments/Stripe, curiosity-threads, hub, quest-library components deleted
- **Backend**: v1 API routes, calendar route, admin services route, 7 unused AI/recommendation services deleted
- **Dependencies**: @fullcalendar/*, @stripe/*, react-ga4 removed from frontend

---

## MCP Tools (Model Context Protocol)

MCP servers extend Claude Code with external service integrations. Configuration is stored in `~/.claude.json` (user-level) or project-level in the same file under `projects`.

### MCP Setup

**Configuration file:** `~/.claude.json` (NOT `~/.claude/settings.json`)

**Check MCP status:**
```bash
claude mcp list
```

**Add Supabase MCP (user scope - applies to all projects):**
```bash
claude mcp add -s user supabase -- npx -y @supabase/mcp-server-supabase@latest --access-token <TOKEN> --project-ref vvfgxcykxjybtvpfzwyx
```

**Add to specific project only:**
```bash
claude mcp add -s local supabase -- npx -y @supabase/mcp-server-supabase@latest --access-token <TOKEN> --project-ref vvfgxcykxjybtvpfzwyx
```

**Remove an MCP server:**
```bash
claude mcp remove supabase
```

**To update access token:**
1. Go to https://supabase.com/dashboard/account/tokens
2. Generate a new Personal Access Token (PAT)
3. Remove old server: `claude mcp remove supabase`
4. Re-add with new token using command above
5. Restart Claude Code

### Supabase MCP

**Project Details:**
- Project ID (this repo's prod DB): `vvfgxcykxjybtvpfzwyx`
- URL: `https://vvfgxcykxjybtvpfzwyx.supabase.co`

**Multi-project access / which Supabase project to use (verified 2026-06-27):**

All of these Supabase projects live in the **same org ("Optio"**, org id
`ewldvvivnnnxtyeaxmoz`), so a single connection reaches all of them — pass the
right `project_id` per call:

| Project | ref / project_id | What it is |
|---------|------------------|------------|
| **Optio** | `vvfgxcykxjybtvpfzwyx` | This repo (pathweaver_2.0) — the prod DB. Default for anything in this codebase. |
| chamberlin | `cpuvzobtymgjdoqfalfg` | Separate app (Chamberlin Music). |
| praxis | `qsnbrspowgvcehkcxekm` | Separate app (fitness/nutrition). |

> For work in THIS repo, always target `vvfgxcykxjybtvpfzwyx`. The other two are
> only relevant if explicitly asked.

**How the connection is provided (differs by where Claude Code runs):**
- **Local Claude Code (Mac):** PAT-based MCP servers. A project-scoped
  [.mcp.json](.mcp.json) defines `supabase-pathweaver` (http type, pinned to
  `vvfgxcykxjybtvpfzwyx`) authenticated with `Authorization: Bearer ${SUPABASE_PAT}`.
  `SUPABASE_PAT` is exported from `~/.zshrc` (account-level Supabase PAT). Other
  projects (chamberlin, praxis) are additional PAT-based servers in `~/.claude.json`.
  This PAT/header style supports many projects at once.
- **Mobile app / remote Claude Code:** local files (`~/.zshrc`, `~/.claude.json`,
  and possibly even repo `.mcp.json`) are NOT present, and the Claude Connectors
  UI is **OAuth-only** — it does NOT accept a pasted PAT or custom Authorization
  header (`static_bearer` unsupported; query-param creds prohibited). Use the
  account-level **Supabase OAuth connector**, authorized to the **Optio** org and
  left **unpinned** (don't scope it to one project). Unpinned, it reaches all
  three Optio-org projects above via `project_id`. Projects in OTHER orgs (e.g.
  `dub` / `1077`) are NOT reachable from the mobile app — OAuth is one-org-only
  and the app won't take a PAT. Those remain local-Claude-Code-only.

**Available tools (use directly in conversation):**
- `list_tables` - List all database tables
- `execute_sql` - Run read-only SQL queries
- `get_schemas` - Get database schemas

**Example queries:**
```sql
-- Check table schema
SELECT column_name, data_type FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'users';

-- List all tables
SELECT table_name FROM information_schema.tables WHERE table_schema = 'public';
```

### Render MCP

**Status:** Configured (user scope)

**Package:** [`@niyogi/render-mcp`](https://www.npmjs.com/package/@niyogi/render-mcp) — community Render MCP server (there is no official `@render` or `@anthropic-ai` package on npm).

**Add Render MCP:**

Two-step setup -- the MCP server reads its API key from `~/.render-mcp/config.json`, not from a CLI flag.

```bash
# 1. Store the API key in the MCP server's config file
npx -y @niyogi/render-mcp configure --api-key <RENDER_API_KEY>

# 2. Register the server with Claude Code (user scope)
claude mcp add -s user render -- npx -y @niyogi/render-mcp start
```

Verify with `claude mcp list` -- should show `render: ... - ✓ Connected`. Restart Claude Code so the new tools load into the session.

**Not working:** `@anthropic-ai/mcp-server-render` -- 404 on npm. The `claude mcp add ... --api-key ...` pattern also fails because `-y` is parsed by the Claude CLI; hence the `configure` step above.

**Service IDs** (all in the **Shortbird** workspace, `tea-d9ah63qq4dsc739armqg`,
as of 2026-08-09 — migrated from the old Optio workspace, which Render cannot
transfer between; the old `srv-d2t...` services are decommissioned):
| Environment | Service | ID | Branch |
|-------------|---------|-----|--------|
| Dev | Backend | `srv-d9sjl22fngtc73ffenl0` | `develop` |
| Dev | Frontend | `srv-d9sjl3n10e5c73a14b2g` | `develop` |
| Dev | v2 Frontend | `srv-d9sjl42fngtc73fff1d0` | `develop` |
| Prod | Backend | `srv-d9sjl1f10e5c73a14610` | `main` |
| Prod | Frontend | `srv-d9sjl2qjnfac739k091g` | `main` |
| Prod | Cron (dispatch) | `crn-d9sjl4tbedkc73dmb010` | `main` |
| Prod | Redis (rate limit) | `red-d9sjl16gekts738r0u2g` | — |

**Auto-deploy:** ON for the dev services (pushes to `develop` deploy directly).
**OFF for both prod services** — prod deploys are triggered only by the `deploy`
job in `release.yml` after tests pass. All backends pin `PYTHON_VERSION=3.11.9`
via env var (new Render services default to Python 3.14, which breaks
`pydantic_core`; the static sites need the pin too because Render auto-installs
the root `requirements.txt` even for static builds).

**Manual deploy via API:**
```bash
curl -X POST "https://api.render.com/v1/services/<SERVICE_ID>/deploys" \
  -H "Authorization: Bearer <RENDER_API_KEY>" \
  -H "Content-Type: application/json" \
  -d '{"clearCache": "do_not_clear"}'
```

### PostHog MCP

**Status:** Configured (user scope)

**Add PostHog MCP:**
```bash
claude mcp add -s user posthog -- npx -y mcp-remote@latest https://mcp.posthog.com/mcp --header "Authorization:Bearer <POSTHOG_PERSONAL_API_KEY>"
```

**Authentication:** Requires a PostHog Personal API key (`phx_...`). Generate one at https://app.posthog.com/settings/user-api-keys?preset=mcp_server

**Available tools:** Analytics queries, feature flags, experiments, error tracking, annotations, project management.

**EU Cloud:** If using EU Cloud, use `mcp-eu.posthog.com` instead of `mcp.posthog.com`.

### MCP Troubleshooting

| Issue | Solution |
|-------|----------|
| `claude mcp list` shows nothing | Config in wrong file - use `claude mcp add` command |
| MCP not loading after restart | Check `~/.claude.json` has correct `mcpServers` section |
| Auth errors | Regenerate token and re-add server |
| npx not found | Ensure Node.js is in PATH |
| Tools not available in session | Restart Claude Code after adding MCP server |

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

## Extended Documentation

- **Local Development**: [LOCAL_DEVELOPMENT.md](LOCAL_DEVELOPMENT.md)
- **Testing Guide**: [frontend/TESTING.md](frontend/TESTING.md)
- **Repository Pattern**: [backend/docs/REPOSITORY_PATTERN.md](backend/docs/REPOSITORY_PATTERN.md)
- **Design System (web v1)**: [docs/design/DESIGN_SYSTEM.md](docs/design/DESIGN_SYSTEM.md) — canonical tokens, buttons, cards, tabs, states; when a page and this doc disagree, the page is wrong
- **Core Philosophy**: [core_philosophy.md](core_philosophy.md)
- **Migration Status**: [backend/docs/REPOSITORY_MIGRATION_STATUS.md](backend/docs/REPOSITORY_MIGRATION_STATUS.md)
- **Token Storage Model (ADR-001)**: [docs/ADR-001-token-storage.md](docs/ADR-001-token-storage.md) — why v1 web, v2 web preview, and v2 native each use a different strategy
- **Audit Implementation Plan**: [AUDIT_IMPLEMENTATION_PLAN.md](AUDIT_IMPLEMENTATION_PLAN.md) — historical record of the C/H/M/L/A audit items and their fixes (2026-04)
- **Branch Test Data**: [supabase/seed.sql](supabase/seed.sql)