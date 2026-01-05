# Optio Platform - AI Agent Guide

**Last Updated**: January 1, 2026 | **Local Dev**: Enabled | **Multi-Agent**: Available

---

## Critical Rules (Read First)

1. **LOCAL VERIFICATION REQUIRED** - Never commit until user confirms fix works at http://localhost:3000
2. **Commit to `develop` only** - After user verification
3. **No emojis** - Professional tone
4. **Verify DB schema first** - Use Supabase MCP before ANY query (table names change)
5. **Use Optio brand colors** - `optio-purple`/`optio-pink` (NOT `purple-600`/`pink-600`)
6. **Run tests before production** - 95%+ pass rate required before merging to `main`
7. **Include superadmin in role checks** - When creating new routes with role-based authorization, ALWAYS include `superadmin` in the allowed roles list.

### Valid Roles (ONLY these 6 exist)
| Role | Access Level |
|------|-------------|
| `superadmin` | Full access to everything (only tannerbowman@gmail.com) |
| `org_admin` | Organization admin tools only |
| `advisor` | Org-specific advisor access |
| `parent` | Org-specific parent access |
| `student` | Org-specific student access |
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
| `/ship-feature [desc]` | Create feature tasks (backend/frontend/tests/docs) |
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
| Local | http://localhost:3000 | any |
| Dev | https://optio-dev-frontend.onrender.com | `develop` |
| Prod | https://www.optioeducation.com | `main` |

### Tech Stack
- **Backend**: Flask 3.0 + Supabase (PostgreSQL) + httpOnly cookies + CSRF
- **Frontend**: React 18.3 + Vite + TailwindCSS
- **AI**: Gemini `gemini-2.5-flash-lite` (always use this model)
- **Host**: Render

### Core Philosophy
"The Process Is The Goal" - Celebrate present-focused learning, not future outcomes

---

## Local Development

**Check if servers running:**
```bash
curl -s http://localhost:5001/api/health  # Backend
curl -s http://localhost:3000             # Frontend
```

**Start if not running:**
```bash
npx kill-port 3000 5001
cd C:/Users/tanne/Desktop/pw_v2 && venv/Scripts/python.exe backend/app.py  # background
cd C:/Users/tanne/Desktop/pw_v2/frontend && npm run dev  # background
```

**Before committing:** `npx kill-port 3000 5001`

**Full setup guide:** [LOCAL_DEVELOPMENT.md](LOCAL_DEVELOPMENT.md)

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
friendships              - id, requester_id, addressee_id, status
organizations            - id, name, slug, quest_visibility_policy, is_active
```

### Deleted Tables (Don't Query)
`task_collaborations`, `subscription_tiers`

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

**Current stats:** 505 tests, 97.8% pass rate, 60.61% coverage

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
├── services/         # Business logic (29 services)
└── middleware/       # CSRF, rate limiting

frontend/src/
├── pages/            # Route components
├── components/       # UI components
└── services/         # API + auth
```

---

## MCP Tools

### Supabase
```bash
mcp__supabase__execute_sql  # Read-only (always use for schema checks)
# Project ID: vvfgxcykxjybtvpfzwyx
```

### Render
```bash
mcp__render__list_services | mcp__render__list_logs
# Dev Backend: srv-d2tnvlvfte5s73ae8npg
# Dev Frontend: srv-d2tnvrffte5s73ae8s4g
# Prod Backend: srv-d2to00vfte5s73ae9310
# Prod Frontend: srv-d2to04vfte5s73ae97ag
```

---

## Troubleshooting

| Error | Fix |
|-------|-----|
| "quest_tasks does not exist" | Use `user_quest_tasks` |
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