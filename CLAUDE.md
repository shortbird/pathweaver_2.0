# Optio Platform - AI Agent Guide

**Last Updated**: December 2025 | **Current Phase**: Phase 3 Complete (Repository Pattern Established)

## Critical Rules

1. **NEVER run locally** - Test at https://optio-dev-frontend.onrender.com
   - DO NOT run `npm run dev`, `flask run`, or ANY local servers
   - DO NOT run `npx playwright test` or ANY E2E tests locally
   - E2E tests run automatically via GitHub Actions on push to develop
   - Use deployed dev environment for all testing
2. **ALWAYS commit to `develop`** - Auto-commit unless told otherwise (don't push without permission)
3. **NEVER use emojis** - Professional tone only
4. **Verify database schema** - Use Supabase MCP before ANY query (table names change)
5. **Use Optio brand colors** - `optio-purple`/`optio-pink` (NOT `purple-600`/`pink-600`)
6. **Multiple Claude instances** - You may work alongside other Claude Code instances. If you see staged/committed changes you didn't make, leave them alone

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
users - id, email, role (student/parent/advisor/admin/observer), display_name, total_xp, organization_id (nullable)
        is_dependent (boolean), managed_by_parent_id (uuid), promotion_eligible_at (date) [NEW Jan 2025]
quests - id, title, quest_type (optio/course), lms_course_id (nullable), is_active, organization_id (nullable)
user_quest_tasks - id, user_id*, quest_id, title, pillar, xp_value, approval_status
quest_task_completions - id, user_id, quest_id, task_id, xp_awarded, completed_at
user_skill_xp - user_id, pillar (stem/wellness/communication/civics/art), xp_amount
badges - id, name, pillar_primary, min_quests, min_xp, image_url
friendships - id, requester_id, addressee_id, status (pending/accepted/rejected)
organizations - id, name, slug, quest_visibility_policy, branding_config, is_active (NEW Dec 2025)
organization_quest_access - organization_id, quest_id, granted_by (for curated policy)
```

### Removed Tables (Don't Query)
- ~~quest_collaborations~~ ← Deleted Jan 2025
- ~~task_collaborations~~ ← Deleted Jan 2025
- ~~subscription_tiers~~ ← Deleted Jan 2025

### MCP Schema Check Pattern
```sql
-- Use Supabase MCP execute_sql (NOT list_tables - exceeds token limit)
SELECT column_name, data_type FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'your_table';
```

---

## Authentication & Security

### Safari/iOS Cookie Compatibility (Jan 2025)

Safari and iOS devices have stricter cookie policies due to Intelligent Tracking Prevention (ITP). Our platform automatically handles this:

**Backend (session_manager.py)**:
- Cookie domain attribute explicitly set for Safari compatibility
- Partitioned cookies (CHIPS) to bypass ITP
- Tokens returned in response body as fallback
- Enhanced logging for Safari debugging (auth method, warnings, etc.)

**Frontend (AuthContext + browserDetection.js)**:
- Automatic Safari/iOS detection
- Auto-fallback to Authorization headers when cookies blocked
- Client-side cookie compatibility testing

**Enhanced Debug Endpoint**: `GET /api/auth/cookie-debug`
- Returns comprehensive diagnostics with human-readable summary
- Token analysis (expiry, validity, type) without exposing values
- Detailed browser detection (Safari, iOS, Chrome, Firefox, Edge)
- All request headers included for debugging
- Server configuration details (domain, SameSite, Secure, Partitioned)
- Request details (path, IP, scheme, host)
- Safari-specific recommendations based on detected state
- SECURITY: Does NOT expose cookie/token values, only metadata

**Backend Logging**:
- `[SessionManager]` logs show auth method used (cookie vs header)
- Safari/iOS requests logged with browser detection
- Warnings if Safari using cookies (unexpected behavior)
- Warnings if domain not set in cross-origin mode
- Cookie TTL and configuration logged on set

**How It Works**:
1. Safari users login normally
2. Backend sets cookies AND returns tokens in response
3. Frontend stores tokens in localStorage (Safari-compatible)
4. All requests use Authorization header (bypasses cookie blocking)
5. Desktop browsers continue using httpOnly cookies

**Debugging Safari Issues**:
1. Check logs for `[SessionManager]` entries showing auth method
2. Visit `/api/auth/cookie-debug` to see comprehensive diagnostics
3. Look for Safari warnings in backend logs
4. Check `summary` field in debug response for quick diagnosis

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
- `GET /api/auth/me` - Get current user profile (includes organization_id)

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

### Organizations (NEW - Dec 2025)
- `GET /api/admin/organizations/organizations` - List all organizations (superadmin)
- `POST /api/admin/organizations/organizations` - Create organization (superadmin)
- `GET /api/admin/organizations/organizations/:id` - Get org details (org admin)
- `PUT /api/admin/organizations/organizations/:id` - Update org (superadmin)
- `GET /api/admin/organizations/:id/users` - List org users (org admin)
- `GET /api/admin/organizations/:id/analytics` - Org analytics (org admin)
- `POST /api/admin/organizations/:id/quests/grant` - Grant quest access (org admin, curated policy)
- `POST /api/admin/organizations/:id/quests/revoke` - Revoke quest access (org admin)

### Portfolio (CORE FEATURE)
- `GET /api/portfolio/:slug` - Public diploma page
- `GET /api/portfolio/diploma/:userId` - Diploma data

### Observer (NEW - Jan 2025)
- `POST /api/observers/invite` - Send observer invitation (sends email)
- `GET /api/observers/my-invitations` - Student views sent invitations
- `GET /api/observers/my-observers` - Student views linked observers
- `DELETE /api/observers/<link_id>/remove` - Student removes observer
- `POST /api/observers/accept/<code>` - Observer accepts invitation (creates account with role='observer')
- `GET /api/observers/my-students` - Observer views linked students
- `GET /api/observers/student/<id>/portfolio` - Observer views student portfolio

### Dependent Profiles (NEW - Jan 2025)
- `GET /api/dependents/my-dependents` - Get all dependents for logged-in parent
- `POST /api/dependents/create` - Create new dependent (requires display_name, date_of_birth)
- `GET /api/dependents/:id` - Get specific dependent
- `PUT /api/dependents/:id` - Update dependent (allowed: display_name, avatar_url, date_of_birth, bio)
- `DELETE /api/dependents/:id` - Delete dependent (cascades all data)
- `POST /api/dependents/:id/promote` - Promote to independent account at age 13 (requires email, password)

**Acting as Dependent** (Quest/Task Operations):
- `POST /api/quests/:id/start-personalization` - Optional body param: `acting_as_dependent_id`
- `POST /api/tasks/:id/complete` - Optional form param: `acting_as_dependent_id`
- All operations verify parent owns dependent before proceeding
- XP and progress tracked under dependent's user_id

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
│   ├── ConnectionsPage.jsx # Social features (NEW 2025)
│   ├── ObserverAcceptInvitationPage.jsx # Observer invitation acceptance (NEW Jan 2025)
│   ├── ObserverWelcomePage.jsx # Observer onboarding (NEW Jan 2025)
│   └── ObserverFeedPage.jsx # Observer dashboard (NEW Jan 2025)
├── components/
│   ├── admin/           # Admin dashboard components
│   ├── connections/     # Redesigned connections UI (Jan 2025)
│   └── quest/           # Quest components
└── services/
    ├── api.js           # Axios instance (httpOnly cookies)
    └── authService.js   # Auth state management
```

---

## Email System

### Email Template Management
All system emails are managed through the **Admin CRM** at `/admin/crm`:
- Database-stored templates with YAML fallback
- Jinja2 templating with base layout (`backend/templates/email/base.html`)
- Admin can customize email copy, subject, and content
- Templates auto-load from `backend/templates/email/*.html` and `*.txt`

### Available Email Templates
- `welcome` - New user welcome email
- `password_reset` - Password reset link
- `email_confirmation` - Email verification
- `parent_invitation` - Parent account invitation
- `observer_invitation` - Observer role invitation (NEW Jan 2025)
- `quest_completion` - Quest completion notification
- `promo_welcome` - Promo campaign welcome
- `consultation_confirmation` - Consultation booking confirmation

### Creating New Email Templates
1. Create HTML template in `backend/templates/email/your_template.html` (extends `base.html`)
2. Create plain text version in `backend/templates/email/your_template.txt`
3. Use `EmailService.send_templated_email(template_name='your_template', ...)`
4. Admin can override template content in `/admin/crm` interface
5. Template system checks database first, falls back to file templates

### Email Sending
```python
from services.email_service import EmailService
email_service = EmailService()
email_service.send_templated_email(
    to_email='user@example.com',
    subject='Subject line',
    template_name='observer_invitation',
    context={'student_name': 'John', 'invitation_link': 'https://...'}
)
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
- ✅ Added observer role to database schema

### Phase 2 (Complete)
- ✅ Removed ~400 lines of tier-related code
- ✅ Deleted tier_management.py
- ✅ All users can select badges (no tier check)

### Phase 3 (Complete - Pragmatic Approach)
- ✅ Repository pattern successfully established in 4 exemplar files
- ✅ Migrated tasks.py, settings.py, helper_evidence.py, community.py
- ✅ Created 15 repositories (all use BaseRepository)
- ✅ All 29 services use BaseService
- ✅ 49% of files use proper abstraction (repositories or services)
- ✅ 51% of files appropriately use direct DB for complex operations
- ✅ Pattern established and enforced for all NEW code going forward

**Pragmatic Decision (Dec 2025)**: After migrating 4 files and analyzing the remaining codebase, we determined that most files either:
1. Already use service layer pattern (no migration needed)
2. Correctly use direct DB for pagination, aggregation, or complex queries per architectural guidelines
3. Are mega-files requiring refactoring before migration

Rather than force migrations where repositories provide minimal benefit, we established the pattern in exemplar files and will enforce it for all NEW code. Old files will be migrated only when touched for other features/bugs.

### Organization System (NEW - Dec 2025)
- ✅ Re-added organizations table (NOT for multi-tenancy/subdomains)
- ✅ Organizations now used for enterprise/school account grouping only
- ✅ OrganizationRepository restored (follows BaseRepository pattern)
- ✅ OrganizationService for business logic
- ✅ Admin routes: `/api/admin/organizations/*` (superadmin only)
- ✅ Frontend: OrganizationContext uses `/api/auth/me` for user org_id
- ⚠️ organizations table EXISTS but organization_id on users/quests is NULLABLE
- ⚠️ Quest visibility NOT affected by organizations (still public + user's own)
- ⚠️ NO subdomains (all users access optio.optioeducation.com)

### Security Fixes (Complete)
- ✅ httpOnly cookies ONLY (no localStorage tokens)
- ✅ Removed tokens from API response bodies
- ✅ Strong password policy (12 chars, complexity)
- ✅ Brand color consistency (233 replacements)

### Observer Role Implementation (NEW - Jan 2025)
- ✅ Added observer role to roles.py enum and permissions system
- ✅ Observer role hierarchy: -1 (relationship-based access, lower than student)
- ✅ Observer permissions: view linked students' diplomas/profiles, edit own profile
- ✅ Created observer invitation email templates (HTML + plain text)
- ✅ Integrated EmailService to send invitations automatically
- ✅ Built ObserverAcceptInvitationPage (public route for accepting invitations)
- ✅ Built ObserverWelcomePage (explains Optio philosophy and observer role)
- ✅ Built ObserverFeedPage (MVP dashboard with multi-student view)
- ✅ Added observer routes: /observer/accept/:code, /observer/welcome, /observer/feed
- ⚠️ Full activity feed not yet implemented (coming soon: chronological feed, reactions, conversation starters)

### Dependent Profiles Implementation (NEW - Jan 2025)
- ✅ Database schema: Added is_dependent, managed_by_parent_id, promotion_eligible_at to users table
- ✅ Created indexes: idx_users_managed_by_parent, idx_users_is_dependent
- ✅ Added COPPA compliance constraints: check_dependent_has_parent, check_dependent_no_email
- ✅ Created RLS policies: parent_view/create/update/delete_dependents
- ✅ Created helper functions: calculate_promotion_eligible_date, is_promotion_eligible, get_parent_dependents
- ✅ Built DependentRepository with full CRUD operations
- ✅ Created 6 API endpoints: /api/dependents/* (create, read, update, delete, promote)
- ✅ Built dependentAPI.js service for frontend
- ✅ Created ProfileSwitcher component (dropdown to switch between parent/dependents)
- ✅ Created AddDependentModal component (form with age validation + COPPA notice)
- ✅ Integrated ProfileSwitcher into ParentDashboardPage header
- ✅ Added acting_as_dependent_id support to quest_personalization.py (start-personalization endpoint)
- ✅ Added acting_as_dependent_id support to tasks.py (complete_task endpoint)
- ✅ XP and progress tracking work correctly for dependents
- ⚠️ Frontend quest components need acting_as_dependent_id parameter passed
- ⚠️ End-to-end testing pending

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
1. Remove collaboration bonuses (2x XP, team-ups)
2. Clean up frontend "Team-up invitations" references
3. Implement rate limiting improvements
4. Optimize frontend bundle size

### Medium Priority
1. Continue testing infrastructure improvements
2. Migrate old route files ONLY when touched for other work
3. Enforce repository/service pattern for all NEW code in reviews

### Documentation
- Phase 3 Progress: `backend/docs/REPOSITORY_MIGRATION_STATUS.md`
- Repository Pattern Guide: `backend/docs/REPOSITORY_PATTERN.md`
- Core Philosophy: `core_philosophy.md`

---

## Getting Help

- **Issues**: https://github.com/anthropics/claude-code/issues
- **Docs**: Use Task tool with `subagent_type='claude-code-guide'`
- **Schema**: Always verify with Supabase MCP before queries
