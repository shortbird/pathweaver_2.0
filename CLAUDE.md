# Optio Platform - AI Agent Guide

**Last Updated**: April 14, 2026 | **Local Dev**: Enabled | **Multi-Agent**: Available

---

## Critical Rules (Read First)

1. **LOCAL VERIFICATION REQUIRED** - Never commit until user confirms fix works at http://localhost:3000
2. **Commit to `develop` only** - After user verification
3. **No emojis** - Professional tone
4. **Verify DB schema first** - Use Supabase MCP before ANY query (table names change)
5. **Use Optio brand colors** - `optio-purple`/`optio-pink` (NOT `purple-600`/`pink-600`)
6. **Run tests before production** - 95%+ pass rate required before merging to `main`
7. **Include superadmin in role checks** - When creating new routes with role-based authorization, ALWAYS include `superadmin` in the allowed roles list.
8. **API keys via Config class only** - All API keys and secrets must be accessed via `Config` from `app_config.py`, never `os.getenv()` directly. See `backend/docs/ENV_KEYS_REFERENCE.md`.

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

### Valid Roles (6 total)
| Role | Access Level |
|------|-------------|
| `superadmin` | Full access to everything (only tannerbowman@gmail.com) |
| `org_admin` | Organization admin tools only |
| `advisor` | Advisor access (org-specific or platform) |
| `parent` | Parent access (org-specific or platform) |
| `student` | Student access (org-specific or platform) |
| `observer` | View-only access to linked students, can comment on student work |

**INVALID roles** (do NOT use): `admin`, `teacher`, `educator`, `school_admin`

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
| Local (v1) | http://localhost:3000 | any |
| Local (v2 web) | http://localhost:8081 | any |
| Local (v2 mobile) | exp://192.168.86.20:8081 | any |
| Dev | https://optio-dev-frontend.onrender.com | `develop` |
| Prod | https://www.optioeducation.com | `main` |
| API | https://api.optioeducation.com | `main` |

### Tech Stack
- **Backend**: Flask 3.0 + Supabase (PostgreSQL) + httpOnly cookies + CSRF
- **Frontend (v1)**: React 18.3 + Vite + TailwindCSS (in `frontend/`)
- **Frontend (v2)**: Expo SDK 55 + Expo Router + NativeWind + Gluestack-style UI (in `frontend-v2/`)
- **Mobile**: Same `frontend-v2/` project, dev builds via EAS
- **AI**: Gemini `gemini-2.5-flash-lite` (always use this model)
- **Host**: Render

### Frontend V2 (Universal App)
The `frontend-v2/` project is a universal Expo app that builds for both web and native mobile (iOS/Android). It will replace `frontend/` once the page-by-page rebuild is complete.

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

**Check if servers running (from WSL):**
```bash
powershell.exe -Command "Invoke-WebRequest -Uri 'http://localhost:5001/api/health' -UseBasicParsing | Select-Object StatusCode"
powershell.exe -Command "Test-NetConnection -ComputerName localhost -Port 3000 | Select-Object TcpTestSucceeded"
```

**Start servers (from WSL using PowerShell):**
```bash
# Backend
powershell.exe -Command "Start-Process -FilePath 'C:\Users\tanne\Desktop\pw_v2\venv\Scripts\python.exe' -ArgumentList 'C:\Users\tanne\Desktop\pw_v2\backend\app.py' -WorkingDirectory 'C:\Users\tanne\Desktop\pw_v2' -WindowStyle Hidden"

# Frontend
powershell.exe -Command "Start-Process -FilePath 'cmd.exe' -ArgumentList '/c cd /d C:\Users\tanne\Desktop\pw_v2\frontend && npm run dev' -WindowStyle Hidden"

# Wait for startup
sleep 10
```

**Stop servers:**
```bash
# Stop frontend (port 3000) - targets only the Vite dev server, NOT Claude Code's node process
powershell.exe -Command "Get-NetTCPConnection -LocalPort 3000 -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique | ForEach-Object { Stop-Process -Id \$_ -Force -ErrorAction SilentlyContinue }"

# Stop backend (port 5001)
powershell.exe -Command "Get-NetTCPConnection -LocalPort 5001 -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique | ForEach-Object { Stop-Process -Id \$_ -Force -ErrorAction SilentlyContinue }"
```

**WARNING:** Never use `Get-Process -Name node | Stop-Process` - this kills Claude Code itself (which runs on Node.js).

**Note:** WSL2 cannot directly access Windows localhost. Use `powershell.exe` commands to interact with local servers.

**Before committing:** Stop the servers using the commands above

**Full setup guide:** [LOCAL_DEVELOPMENT.md](LOCAL_DEVELOPMENT.md)

### Git Configuration

**HTTPS + Git Credential Manager:** Configured for Claude Code to push/pull without manual authentication.

- Remote: `https://github.com/shortbird/pathweaver_2.0.git` (HTTPS)
- Auth: Git Credential Manager (`credential.helper = manager`)

**Dev workflow (unchanged):**
```bash
git push origin develop    # Auto-deploys to Render dev
```

**Prod workflow (gated, as of 2026-04-14):**

`main` is protected by a GitHub ruleset and Render prod services are set to
"Deploy after CI checks pass". Never push directly to `main`, and never click
"Merge pull request" in the GitHub web UI — always use the API so the flow is
auditable and scriptable.

Required CI checks (must all be green before merge):
- `Jest Integration Tests` (frontend-v2-tests.yml)
- `Vitest + coverage gate` (frontend-tests.yml)
- `test` (backend-tests.yml)

The merge flow Claude Code should use:

```bash
# 1. Get the stored token from Git Credential Manager.
TOKEN=$(printf "protocol=https\nhost=github.com\n\n" | git credential fill 2>/dev/null \
  | awk -F= '/^password=/ {print $2}')

# 2. Open PR from develop -> main.
curl -sS -X POST "https://api.github.com/repos/shortbird/pathweaver_2.0/pulls" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Accept: application/vnd.github+json" \
  -d '{"title":"...","head":"develop","base":"main","body":"..."}'

# 3. Poll required check runs until all three pass.
curl -sS -H "Authorization: Bearer $TOKEN" \
  "https://api.github.com/repos/shortbird/pathweaver_2.0/commits/<sha>/check-runs"

# 4. Merge only when green.
curl -sS -X PUT "https://api.github.com/repos/shortbird/pathweaver_2.0/pulls/<N>/merge" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Accept: application/vnd.github+json" \
  -d '{"merge_method":"merge"}'
```

Once the merge commit lands on `main`, Render prod services wait for its
status checks to finish, then auto-deploy. No manual deploy trigger needed.

If the merge returns `"message": "Repository rule violations found"`, one of
the required checks is red — fix first, don't try to bypass.

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

**Current stats (frontend v1):** 353 tests, 100% pass rate, ~43% CI line coverage. (The 60.61% figure quoted pre-2026-04-14 came from a local run; CI coverage on a `pull_request` event was never verified until the first gated PR. See the coverage baseline note in `.github/workflows/frontend-tests.yml`.)
**Current stats (frontend v2):** 276 tests, 100% pass rate.

**CI gates (enforced by [.github/workflows/](.github/workflows/) + GitHub ruleset + Render):**
- `Frontend (v1) Tests` (`Vitest + coverage gate` check) — 95%+ pass + 40%+ line coverage on PRs to main. Ratchet the coverage floor up over time; never down.
- `Frontend V2 Tests` (`Jest Integration Tests` check) — 95%+ pass rate.
- `Backend Tests` (`test` check).
- A GitHub ruleset on `main` makes all three required before merge.
- Prod Render services use "Deploy after CI checks pass", so only green merge commits deploy. Dev services remain on "On commit" for fast iteration on `develop`.

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

frontend/src/           # V1 frontend (React + Vite, being replaced)
├── pages/              # Route components
├── components/         # UI components
└── services/           # API + auth

frontend-v2/            # V2 universal frontend (Expo, web + mobile)
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
- Project ID: `vvfgxcykxjybtvpfzwyx`
- URL: `https://vvfgxcykxjybtvpfzwyx.supabase.co`

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

**Add Render MCP:**
```bash
claude mcp add -s user render -- npx -y @anthropic-ai/mcp-server-render --api-key <RENDER_API_KEY>
```

**Service IDs:**
| Environment | Service | ID | Branch |
|-------------|---------|-----|--------|
| Dev | Backend | `srv-d2tnvlvfte5s73ae8npg` | `develop` |
| Dev | Frontend | `srv-d2tnvrffte5s73ae8s4g` | `develop` |
| Prod | Backend | `srv-d2to00vfte5s73ae9310` | `main` |
| Prod | Frontend | `srv-d2to04vfte5s73ae97ag` | `main` |

**Auto-deploy:** Enabled on all services. Pushes to `develop` deploy to dev, pushes to `main` deploy to prod.

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
- **Core Philosophy**: [core_philosophy.md](core_philosophy.md)
- **Migration Status**: [backend/docs/REPOSITORY_MIGRATION_STATUS.md](backend/docs/REPOSITORY_MIGRATION_STATUS.md)
- **Token Storage Model (ADR-001)**: [docs/ADR-001-token-storage.md](docs/ADR-001-token-storage.md) — why v1/v2 web/v2 native each use a different strategy
- **Audit Implementation Plan**: [AUDIT_IMPLEMENTATION_PLAN.md](AUDIT_IMPLEMENTATION_PLAN.md) — historical record of the C/H/M/L/A audit items and their fixes (2026-04)
- **Branch Test Data**: [supabase/seed.sql](supabase/seed.sql)