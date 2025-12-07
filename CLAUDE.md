# Optio Platform - AI Agent Guide

**Last Updated**: January 2025 | **Current Phase**: Phase 3 (Repository Pattern Migration)

## Critical Rules

1. **NEVER run locally** - Test at https://optio-dev-frontend.onrender.com
2. **ALWAYS commit to `develop`** - Auto-commit unless told otherwise (don't push without permission)
3. **NEVER use emojis** - Professional tone only
4. **Verify database schema** - Use Supabase MCP before ANY query (table names change)
5. **Use Optio brand colors** - `optio-purple`/`optio-pink` (NOT `purple-600`/`pink-600`)

## Quick Reference

### Deployment
- **Dev**: `develop` → https://optio-dev-frontend.onrender.com (auto-deploy on push)
- **Prod**: `main` → https://www.optioeducation.com (merge develop when stable)

### Core Philosophy
"The Process Is The Goal" - Celebrate present-focused learning, not future outcomes

### Tech Stack
- **Backend**: Flask 3.0 + Supabase (PostgreSQL) + httpOnly cookies + CSRF
- **Frontend**: React 18.3 + Vite + TailwindCSS
- **AI**: Gemini `gemini-2.5-flash-lite` (ALWAYS use this model)
- **Host**: Render (both frontend/backend)

---

## Database Schema (Critical)

### ⚠️ Common Mistakes
- ❌ `quest_tasks` table DOES NOT EXIST (renamed to `user_quest_tasks`)
- ❌ Don't use `.select('*, quest_tasks(*)')` - relationship removed
- ✅ ALWAYS verify table names with Supabase MCP first

### Core Tables
```
users - id, email, role (student/parent/advisor/admin/observer), display_name, total_xp
quests - id, title, quest_type (optio/course), lms_course_id (nullable), is_active
user_quest_tasks - id, user_id*, quest_id, title, pillar, xp_value, approval_status
quest_task_completions - id, user_id, quest_id, task_id, xp_awarded, completed_at
user_skill_xp - user_id, pillar (stem/wellness/communication/civics/art), xp_amount
badges - id, name, pillar_primary, min_quests, min_xp, image_url
friendships - id, requester_id, addressee_id, status (pending/accepted/rejected)
```

### Removed Tables (Don't Query)
- ~~quest_collaborations~~ ← Deleted Jan 2025
- ~~task_collaborations~~ ← Deleted Jan 2025
- ~~subscription_tiers~~ ← Deleted Jan 2025
- ~~organizations~~ ← Deleted Jan 2025 (subdomain multi-tenancy removed)

### MCP Schema Check Pattern
```sql
-- Use Supabase MCP execute_sql (NOT list_tables - exceeds token limit)
SELECT column_name, data_type FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'your_table';
```

---

## Authentication & Security

### httpOnly Cookies ONLY (Jan 2025 Security Fix)
```javascript
// ✅ CORRECT - No token storage
api.post('/api/auth/login', { email, password })
// Backend sets httpOnly cookies automatically

// ❌ WRONG - Never store tokens
localStorage.setItem('token', ...)  // XSS vulnerability!
```

### Key Security Rules
1. Tokens ONLY in httpOnly cookies (never localStorage/response body)
2. All POST/PUT/DELETE need CSRF token in header
3. User operations: `get_user_client()` (RLS enforced)
4. Admin operations: `get_supabase_admin_client()` (bypasses RLS)
5. Auth decorators use admin client for role checks (bypass RLS restrictions)

---

## Repository Pattern (Phase 3)

### When to Use Repositories
✅ Use for: CRUD operations, common queries, standard relationships
❌ Skip for: Complex filtering, pagination, optimization service calls

### Example Refactoring
```python
# ❌ OLD - Direct DB access
task = supabase.table('user_quest_tasks').select('*').eq('id', task_id).single().execute()

# ✅ NEW - Repository pattern
from backend.repositories.task_repository import TaskRepository
task_repo = TaskRepository(client=supabase)
task = task_repo.get_task_with_relations(task_id, user_id)
```

### Available Repositories
- `TaskRepository` / `TaskCompletionRepository` - Task operations
- `QuestRepository` - Quest queries
- `UserRepository` - User profile operations
- `BadgeRepository` - Badge management
- `EvidenceRepository` - Evidence uploads
- `FriendshipRepository` - Connections system
- `ParentRepository` - Parent-student linking
- `TutorRepository` - AI tutor data
- `LMSRepository` - LMS integration
- `AnalyticsRepository` - Admin analytics

**Status**: 1/51 route files migrated (tasks.py complete)
**Docs**: `backend/docs/REPOSITORY_MIGRATION_STATUS.md`

---

## API Endpoints (Key Routes)

### Auth
- `POST /api/auth/login` - Login (sets httpOnly cookies)
- `POST /api/auth/register` - Registration
- `POST /api/auth/refresh` - Token refresh (httpOnly cookie rotation)

### Quests & Tasks
- `GET /api/quests` - List quests (pagination, filtering)
- `POST /api/quests/:id/start` - Enroll in quest
- `POST /api/tasks/:id/complete` - Submit task evidence (uses repository)
- `DELETE /api/tasks/:id` - Drop task (uses repository)

### Admin
- `GET /api/admin/users/*` - User management
- `GET /api/admin/quests/*` - Quest management
- `GET /api/admin/analytics/*` - Platform analytics
- `GET /api/admin/analytics/user/:userId/activity` - User activity logs

### Portfolio (CORE FEATURE)
- `GET /api/portfolio/:slug` - Public diploma page
- `GET /api/portfolio/diploma/:userId` - Diploma data

---

## Common Patterns & Fixes

### Brand Colors
```jsx
// ✅ CORRECT
<div className="bg-gradient-to-r from-optio-purple to-optio-pink">

// ❌ WRONG (inconsistent brand colors)
<div className="bg-gradient-to-r from-purple-600 to-pink-600">
```

### CSRF POST Requests
```javascript
// ✅ CORRECT - Always include body (even if empty)
api.post('/api/badges/123/select', {})

// ❌ WRONG - Missing body causes CSRF error
api.post('/api/badges/123/select')
```

### RLS Client Selection
```python
# User operations (RLS enforced)
supabase = get_user_client()
task = supabase.table('user_quest_tasks').select('*').eq('user_id', user_id)

# Admin operations (bypasses RLS)
admin = get_supabase_admin_client()
all_users = admin.table('users').select('*')

# Auth decorators (ALWAYS use admin for role checks)
@require_auth
def endpoint(user_id: str):
    admin = get_supabase_admin_client()  # For role verification
    user_client = get_user_client()      # For user data
```

---

## File Structure (Key Locations)

### Backend
```
backend/
├── routes/              # API endpoints (51 files, 1 migrated to repositories)
│   ├── tasks.py         # ✅ Migrated to repository pattern
│   ├── auth.py          # Auth & JWT
│   ├── quests.py        # Quest system
│   └── admin/           # Admin routes
├── repositories/        # Data access layer (15 repositories)
├── services/            # Business logic (29 services, all use BaseService)
├── middleware/          # CSRF, rate limiting, error handling
└── database.py          # Supabase client management
```

### Frontend
```
frontend/src/
├── pages/               # Route components
│   ├── DiplomaPage.jsx  # CORE FEATURE (public portfolio)
│   ├── QuestBadgeHub.jsx # Main quest/badge interface
│   └── ConnectionsPage.jsx # Social features (NEW 2025)
├── components/
│   ├── admin/           # Admin dashboard components
│   ├── connections/     # Redesigned connections UI (Jan 2025)
│   └── quest/           # Quest components
└── services/
    ├── api.js           # Axios instance (httpOnly cookies)
    └── authService.js   # Auth state management
```

---

## Environment Variables

### Backend (Render)
```bash
# Required
SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_KEY
FLASK_SECRET_KEY  # 64 chars (32 hex bytes) in production
FLASK_ENV         # "development" (develop) or "production" (main)
FRONTEND_URL      # CORS config (dev/prod URLs)

# Optional
GEMINI_API_KEY    # AI features
PEXELS_API_KEY    # Quest image generation
```

### Frontend (Render)
```bash
VITE_API_URL  # Backend URL (NO /api suffix - added by frontend)
# Dev: https://optio-dev-backend.onrender.com
# Prod: https://optio-prod-backend.onrender.com
```

---

## MCP Tools

### Supabase MCP
```bash
# Project ID: vvfgxcykxjybtvpfzwyx
mcp__supabase__execute_sql  # Read-only queries (ALWAYS use for schema checks)
```

### Render MCP
```bash
# Workspace
# ID: tea-d2po2eur433s73dhbrd0
# Name: Optio
# Email: tannerbowman@gmail.com
# Auto-selected when calling list_workspaces (only one workspace)

# Service IDs
mcp__render__list_services
mcp__render__get_deploy(serviceId, deployId)
mcp__render__list_logs(resource, limit)

# Dev Backend: srv-d2tnvlvfte5s73ae8npg
# Dev Frontend: srv-d2tnvrffte5s73ae8s4g
# Prod Backend: srv-d2to00vfte5s73ae9310
# Prod Frontend: srv-d2to04vfte5s73ae97ag
```

**IMPORTANT**: DO NOT use `text` filter parameter with `list_logs` - it causes 500 errors. Use `level` and `type` filters instead, then search results manually.

---

## Recent Changes (Jan 2025)

### Phase 1 (Complete)
- ✅ Deleted 6 tables (collaborations, ratings, subscriptions)
- ✅ Removed 5 user columns (subscription_tier, etc.)
- ✅ Added observer role

### Phase 2 (Complete)
- ✅ Removed ~400 lines of tier-related code
- ✅ Deleted tier_management.py
- ✅ All users can select badges (no tier check)

### Phase 3 (In Progress - 2% Complete)
- ✅ Migrated tasks.py to repository pattern
- ✅ Created 15 repositories (all use BaseRepository)
- ✅ All 29 services use BaseService
- ⚠️ 50 route files still use direct DB access

### Subdomain/Multi-Tenancy Removal (Complete - Jan 7, 2025)
- ✅ Removed organization-based multi-tenancy (subdomain) code
- ✅ Deleted organizations table and organization_id columns from users/quests
- ✅ Deleted OrganizationRepository and organization middleware
- ✅ Deleted NEW_CLIENT_INTEGRATION_PROCESS.md documentation
- ✅ All clients now use single Optio domain (no subdomains like ignite.optioeducation.com)
- ✅ Simplified quest visibility logic (public + user's own quests)

### Security Fixes (Complete)
- ✅ httpOnly cookies ONLY (no localStorage tokens)
- ✅ Removed tokens from API response bodies
- ✅ Strong password policy (12 chars, complexity)
- ✅ Brand color consistency (233 replacements)

---

## Troubleshooting

### Common Errors
1. **"quest_tasks does not exist"** → Use `user_quest_tasks` instead
2. **"Content-Type must be application/json"** → Add body to POST: `api.post(url, {})`
3. **401 Unauthorized** → Check httpOnly cookies (withCredentials: true)
4. **Wrong brand colors** → Use `optio-purple`/`optio-pink` (not Tailwind defaults)
5. **RLS policy violations** → Use correct client (user vs admin)

### Performance Issues
- Use `quest_optimization_service` for N+1 query prevention
- Use `atomic_quest_service` for race condition prevention
- Check database indexes: `backend/scripts/apply_performance_indexes.py`

---

## Next Steps for AI Agents

### High Priority
1. Continue repository migration (simple routes first)
2. Remove collaboration bonuses (2x XP, team-ups)
3. Clean up frontend "Team-up invitations" references

### Medium Priority
1. Migrate auth.py to UserRepository (complex filtering)
2. Document XP bonus removal plan
3. Test repository changes in dev environment

### Documentation
- Phase 3 Progress: `backend/docs/REPOSITORY_MIGRATION_STATUS.md`
- Repository Pattern Guide: `backend/docs/REPOSITORY_PATTERN.md`
- Core Philosophy: `core_philosophy.md`

---

## Getting Help

- **Issues**: https://github.com/anthropics/claude-code/issues
- **Docs**: Use Task tool with `subagent_type='claude-code-guide'`
- **Schema**: Always verify with Supabase MCP before queries
