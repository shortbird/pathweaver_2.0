# Optio Platform - AI Agent Guide

**Last Updated**: December 27, 2025 | **Current Phase**: Phase 3 Complete (Repository Pattern Established) | **Local Development**: Enabled

## Critical Rules

1. **LOCAL VERIFICATION REQUIRED before committing** (Windows only) - See LOCAL_DEVELOPMENT.md for setup
   - Implement the fix/feature
   - Start local servers (if not already running): backend + frontend
   - **ASK USER TO VERIFY** at http://localhost:3000 - DO NOT commit until user confirms
   - **NEVER commit to develop until user says the fix works**
   - Wait for explicit user confirmation like "looks good", "verified", "works", etc.
   - DO NOT run `npx playwright test` locally (E2E tests run via GitHub Actions only)
2. **ALWAYS commit to `develop`** - But ONLY after user verification (don't push without permission)
3. **NEVER use emojis** - Professional tone only
4. **Verify database schema** - Use Supabase MCP before ANY query (table names change)
5. **Use Optio brand colors** - `optio-purple`/`optio-pink` (NOT `purple-600`/`pink-600`)
6. **Multiple Claude instances** - You may work alongside other Claude Code instances. If you see staged/committed changes you didn't make, leave them alone
7. **ALWAYS run tests before production** - Before merging `develop` to `main`:
   - Run `cd frontend && npm run test:run` to execute all tests
   - Verify 95%+ pass rate (current standard: 97.8%)
   - Verify 60%+ coverage on business-critical paths (current: 60.61%)
   - Generate coverage report: `npm run test:coverage`
   - ALL tests must pass before production deployment

## Quick Reference

### Deployment
- **Local (Windows)**: `start-local.bat` → http://localhost:3000 (instant hot-reload, 2 CMD windows)
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

## Local Development Workflow (Windows) - NEW Dec 2025

**Platform**: Windows 10/11 only (uses .bat scripts for CMD/PowerShell)

### Quick Start

**First Time Setup** (run once in CMD or PowerShell):
```cmd
setup-local.bat
```
Creates Python venv, installs all dependencies, configures .env files.

**Daily Development** (run each time in CMD or PowerShell):
```cmd
start-local.bat
```
Opens two CMD windows: backend (port 5001) and frontend (port 3000).

Then open: **http://localhost:3000**

**Claude Code Quick Start** (when user asks to start locally):

**IMPORTANT**: Before starting servers, CHECK if they're already running:
```bash
# Check for running servers FIRST
curl -s http://localhost:5001/api/health  # Backend check
curl -s http://localhost:3000             # Frontend check

# If servers respond, DO NOT start new ones - they're already running!
```

**Only if servers are NOT running**, start them:
```bash
# Kill any processes on required ports to ensure consistent port numbers
npx kill-port 3000 5001

# Start backend (run in background)
cd C:/Users/tanne/Desktop/pw_v2 && venv/Scripts/python.exe backend/app.py

# Start frontend (run in background)
cd C:/Users/tanne/Desktop/pw_v2/frontend && npm run dev

# Verify backend is running
curl -s http://localhost:5001/api/health
# Should return: {"status":"healthy"}
```

**Port Requirements**:
- Backend MUST run on port 5001
- Frontend MUST run on port 3000 (not 3001, 3002, etc.)
- If ports are in use, kill existing processes first with `npx kill-port 3000 5001`

NOTE: The batch files don't work well from Claude Code's bash environment. Use the direct commands above instead.

### Development Workflow

**MANDATORY: User must verify locally before any commit to develop**

1. **Implement the Fix/Feature**:
   - Edit frontend files in `frontend/src/` → Browser auto-reloads instantly
   - Edit backend files in `backend/` → **MUST RESTART BACKEND** for changes to take effect
     - Kill and restart: `npx kill-port 5001 && cd C:/Users/tanne/Desktop/pw_v2 && venv/Scripts/python.exe backend/app.py`

2. **Start Local Servers** (only if not already running):
   ```bash
   # FIRST: Check if servers are already running
   curl -s http://localhost:5001/api/health  # If returns {"status":"healthy"}, backend is running
   curl -s http://localhost:3000             # If returns HTML, frontend is running

   # ONLY if not running, kill ports and start fresh:
   npx kill-port 3000 5001
   cd C:/Users/tanne/Desktop/pw_v2 && venv/Scripts/python.exe backend/app.py  # background
   cd C:/Users/tanne/Desktop/pw_v2/frontend && npm run dev  # background
   ```

3. **User Verification** (REQUIRED):
   - Ask user to test at http://localhost:3000
   - Wait for explicit confirmation ("works", "looks good", "verified", etc.)
   - **DO NOT commit until user confirms the fix works**

4. **Kill Background Tasks** (BEFORE committing):
   ```bash
   npx kill-port 3000 5001
   ```
   - This ensures clean state before commit
   - User can restart servers themselves if needed after

5. **Commit to Develop** (only after user confirmation AND killing background tasks):
   ```cmd
   git add .
   git commit -m "Your message"
   git push origin develop
   ```
   - E2E tests run automatically via GitHub Actions
   - Deploy happens automatically to https://optio-dev-frontend.onrender.com

6. **Final Verification** (optional):
   - Test on deployed dev environment
   - Check GitHub Actions for E2E test results

7. **Merge to Main** (for production):
   - Create PR: develop → main
   - Review and merge
   - Production deploys automatically

### Why Local Development?

**Before** (Deploy-Only):
- Change → Commit → Push → Wait 3-5 minutes → Test → Find bug → Repeat

**Now** (Local First):
- Change → Test instantly → Iterate (seconds) → Push once when confident

**Time Savings**: 10-20x faster iteration

### Environment Configuration

**Frontend** (`frontend/.env`):
```env
VITE_API_URL=http://localhost:5001
VITE_SUPABASE_URL=https://vvfgxcykxjybtvpfzwyx.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

**Backend** (`backend/.env`):
```env
ALLOWED_ORIGINS=http://localhost:3000,http://localhost:5173
DISABLE_RATE_LIMIT=true
```

**Full Setup Guide**: See [LOCAL_DEVELOPMENT.md](LOCAL_DEVELOPMENT.md)

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

## Testing Infrastructure (NEW - Dec 2025)

### Frontend Unit Testing (Vitest + React Testing Library)

**Status**: Production-ready infrastructure, 505 tests written, 97.8% pass rate
**Coverage**: 60.61% (Month 6 goal ACHIEVED - production-ready coverage)

### Pre-Production Testing Protocol

**CRITICAL**: Before merging `develop` to `main` for production deployment:

1. **Run full test suite**: `cd frontend && npm run test:run`
2. **Verify pass rate**: Must be 95%+ (current standard: 97.8%)
3. **Check coverage**: Must be 60%+ on business-critical paths (current: 60.61%)
4. **Generate coverage report**: `npm run test:coverage`
5. **Review coverage report**: Ensure no regressions in critical paths:
   - Authentication flows (AuthContext, LoginPage, RegisterPage)
   - API communication layer (api.js, errorHandling.js)
   - Network resilience (retryHelper.js)
   - Cache management (queryKeys.js)
   - Core utilities (logger.js, pillarMappings.js)

**Production Deployment Checklist**:
- [ ] All tests passing (0 failures)
- [ ] Pass rate ≥ 95%
- [ ] Coverage ≥ 60% overall
- [ ] No new errors in critical paths
- [ ] E2E tests passing on develop (GitHub Actions)

**If tests fail**: DO NOT merge to main. Fix failures on develop branch first.

### Running Tests
```bash
# Watch mode (re-runs on file changes)
npm test

# Run once
npm run test:run

# Interactive UI dashboard
npm run test:ui

# Generate coverage report
npm run test:coverage
```

### Test Suite Statistics
- **Test Files**: 15 total (UI components, pages, contexts, services, utilities)
- **Total Tests**: 505 tests
- **Passing**: 494 tests (97.8% pass rate)
- **Skipped**: 11 tests (timing-related edge cases)
- **Speed**: ~50ms per test (600x faster than E2E)
- **Coverage**: 60.61% overall (Statement: 60.61%, Branch: 59.78%, Function: 63.47%, Line: 61.21%)

### Testing Patterns

**1. Component Testing**
```javascript
import { render, screen } from '@testing-library/react'
import { Button } from './Button'

it('renders button with text', () => {
  render(<Button>Click Me</Button>)
  expect(screen.getByRole('button')).toBeInTheDocument()
})
```

**2. User Interactions**
```javascript
import userEvent from '@testing-library/user-event'

it('calls onClick when clicked', async () => {
  const user = userEvent.setup()
  const handleClick = vi.fn()

  render(<Button onClick={handleClick}>Click</Button>)
  await user.click(screen.getByRole('button'))

  expect(handleClick).toHaveBeenCalled()
})
```

**3. Context Testing (Auth, Organization)**
```javascript
import { renderWithProviders, createMockUser } from '../tests/test-utils'

it('shows user name when authenticated', () => {
  const mockUser = createMockUser({ display_name: 'John' })

  renderWithProviders(<MyComponent />, {
    authValue: { user: mockUser, isAuthenticated: true }
  })

  expect(screen.getByText('Hello, John')).toBeInTheDocument()
})
```

**4. Async Testing**
```javascript
import { waitFor } from '@testing-library/react'

it('shows error on failure', async () => {
  render(<LoginForm />)
  await user.click(submitButton)

  await waitFor(() => {
    expect(screen.getByText(/error/i)).toBeInTheDocument()
  }, { timeout: 3000 })
})
```

### Test Utilities

**Custom Render Helper** (`src/tests/test-utils.jsx`):
```javascript
// Wraps components with Auth, Organization, Router, QueryClient
renderWithProviders(<Component />, {
  route: '/quests',
  authValue: { user: mockUser, isAuthenticated: true }
})
```

**Mock Factories**:
```javascript
const user = createMockUser({ role: 'student', display_name: 'Test' })
const quest = createMockQuest({ title: 'Learn React', xp_value: 100 })
const task = createMockTask({ title: 'Complete assignment' })
const badge = createMockBadge({ name: 'STEM Explorer' })
```

### Key Testing Files

**Infrastructure** (4 files):
- `vitest.config.js` - Vitest configuration (React, paths, coverage)
- `src/tests/setup.js` - Global setup, browser API mocks
- `src/tests/test-utils.jsx` - Custom render helpers, mock factories
- `TESTING.md` - Comprehensive 400-line testing guide

**Test Files** (15 files, 505 tests):

**UI Components** (4 files - 100% coverage):
- `Alert.test.jsx` - 24 tests (5 variants, icons, accessibility)
- `Button.test.jsx` - 56 tests (6 variants, 5 sizes, loading states)
- `Card.test.jsx` - 68 tests (Card family with 5 sub-components)
- `Input.test.jsx` - 90 tests (Input, Textarea, Select)

**Pages** (3 files):
- `LoginPage.test.jsx` - 21 tests (100% coverage - form validation, auth flows)
- `RegisterPage.test.jsx` - 25 tests (97.95% coverage - COPPA compliance, validation)
- `QuestDetail.test.jsx` - 13 tests (42.65% coverage - quest details, navigation)

**Contexts** (2 files):
- `AuthContext.test.jsx` - 23 tests (76.96% coverage - login/logout/refresh)
- `QuestCardSimple.test.jsx` - 48 tests (100% coverage - quest states)

**Services** (1 file):
- `api.test.js` - 76 tests (84.65% coverage - tokens, CSRF, interceptors, all endpoints)

**Utilities** (5 files - 92-100% coverage):
- `errorHandling.test.js` - 26 tests (100% coverage - error extraction, API responses)
- `logger.test.js` - 20 tests (100% coverage - environment-gated logging)
- `queryKeys.test.js` - 68 tests (100% coverage - cache keys, invalidation)
- `pillarMappings.test.js` - 48 tests (100% coverage - pillar data, legacy mappings)
- `retryHelper.test.js` - 22 tests (92% coverage - exponential backoff, resilience)

### Coverage Goals

**Month 1**: 10% coverage - ✅ COMPLETE (41.75% achieved)
- ✅ Fixed all critical test failures
- ✅ Added RegisterPage tests (25 tests, 97.95% coverage)
- ✅ Added UI component tests (4 files, 100% coverage)

**Month 2**: 20% coverage - ✅ EXCEEDED (60.61% achieved)
- ✅ Quest enrollment flow tests (QuestDetail, QuestCardSimple)
- ✅ Task completion tests (covered in api.test.js)
- ✅ Navigation component tests (covered in page tests)

**Month 6**: 60% coverage - ✅ COMPLETE (60.61% achieved in 1 day)
- ✅ Full auth flow coverage (AuthContext: 76.96%, LoginPage: 100%, RegisterPage: 97.95%)
- ✅ All UI components tested (100% coverage on Alert, Button, Card, Input)
- ✅ Critical user journeys covered (api.js: 84.65%, errorHandling: 100%, retryHelper: 92%)
- ✅ Business-critical paths production-ready

**Next Steps** (Optional - Beyond 60% Goal):
- Backend repository tests (ready to run, require Flask-WTF setup)
- QuestDetail component tests (currently 42.65%, major user flow)
- secureTokenStore tests (currently 3.4%, security critical)
- Integration tests for complete user workflows

### Best Practices

**DO**:
- Test user behavior, not implementation details
- Use accessible queries (getByRole, getByLabelText)
- Test edge cases (empty states, errors, loading)
- Keep tests isolated (clear mocks between tests)

**DON'T**:
- Test third-party libraries (trust React Router, Axios work)
- Test styles in detail (use visual regression for that)
- Over-mock (only mock external dependencies)
- Test implementation details (internal state, private methods)

### Documentation
- [frontend/TESTING.md](frontend/TESTING.md) - Comprehensive testing guide
- [frontend/TESTING_PROGRESS.md](frontend/TESTING_PROGRESS.md) - Detailed progress report
- Example tests in all 15 test files demonstrate testing patterns
- [CODEBASE_AUDIT_2025.md](CODEBASE_AUDIT_2025.md) - Test coverage milestone achievement

### E2E vs Unit Testing Comparison

| Aspect | E2E (Playwright) | Unit (Vitest) |
|--------|------------------|---------------|
| **Tests** | 19 passing | 505 written, 494 passing (97.8%) |
| **Speed** | 30s per test | 50ms per test (600x faster) |
| **Scope** | Full user flows | Component logic + API layer |
| **Environment** | Deployed services | Local, no backend |
| **Feedback** | Minutes (on push) | Seconds (on save) |
| **Coverage** | Integration bugs | Edge cases, component logic, business-critical paths |
| **Production Ready** | Yes | Yes (60.61% coverage achieved) |

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

### Backend

**Local Development** (`backend/.env`):
```bash
FLASK_ENV=development
SECRET_KEY=your-secret-key
SUPABASE_URL=https://vvfgxcykxjybtvpfzwyx.supabase.co
SUPABASE_KEY=your-anon-key
SUPABASE_SERVICE_KEY=your-service-key
ALLOWED_ORIGINS=http://localhost:3000,http://localhost:5173
FRONTEND_URL=http://localhost:3000
DISABLE_RATE_LIMIT=true  # Makes local testing easier
```

**Render (Dev/Prod)**:
```bash
# Required
SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_KEY
FLASK_SECRET_KEY  # 64 chars (32 hex bytes) in production
FLASK_ENV         # "development" (develop) or "production" (main)
FRONTEND_URL      # CORS config (dev/prod URLs)

# Optional
GEMINI_API_KEY    # AI features
PEXELS_API_KEY    # Quest image generation
REDIS_URL         # Redis connection string for persistent rate limiting
                  # Falls back to in-memory if not set (local dev)
                  # Render Key Value instance: optio-redis-rate-limiting
```

### Frontend

**Local Development** (`frontend/.env`):
```bash
VITE_API_URL=http://localhost:5001  # NO /api suffix
VITE_SUPABASE_URL=https://vvfgxcykxjybtvpfzwyx.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
VITE_ENVIRONMENT=development
```

**Render (Dev/Prod)**:
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
# Redis (Rate Limiting): red-d57cu7m3jp1c73ath0p0
```

**IMPORTANT**: DO NOT use `text` filter parameter with `list_logs` - it causes 500 errors. Use `level` and `type` filters instead, then search results manually.

---

## Recent Changes (Jan 2025)

### Local Development Setup (NEW - Dec 2025)
- ✅ Created LOCAL_DEVELOPMENT.md comprehensive setup guide
- ✅ Created setup-local.bat for automated first-time setup
- ✅ Created start-local.bat for quick daily startup
- ✅ Frontend and backend run locally with instant hot-reload
- ✅ Connects to cloud Supabase (no local database needed)
- ✅ Updated CLAUDE.md with local development workflow
- ✅ 10-20x faster iteration vs deploy-only workflow

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
- ✅ Redis rate limiting (Dec 2025) - Persistent rate limits across deployments
  - Render Key Value instance: optio-redis-rate-limiting (free tier, oregon)
  - Sorted sets for precise time-window tracking
  - Automatic fallback to in-memory if Redis unavailable
  - Protects against brute force attacks during deployments

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
