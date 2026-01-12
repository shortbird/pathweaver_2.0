# Optio Platform - AI Agent Guide

**Last Updated**: January 12, 2026 | **Local Dev**: Enabled | **Multi-Agent**: Available

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

**Add Render MCP:**
```bash
claude mcp add -s user -t http render https://mcp.render.com/mcp -H "Authorization: Bearer <RENDER_API_KEY>"
```

**Service IDs:**
| Environment | Service | ID |
|-------------|---------|-----|
| Dev | Backend | `srv-d2tnvlvfte5s73ae8npg` |
| Dev | Frontend | `srv-d2tnvrffte5s73ae8s4g` |
| Prod | Backend | `srv-d2to00vfte5s73ae9310` |
| Prod | Frontend | `srv-d2to04vfte5s73ae97ag` |

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