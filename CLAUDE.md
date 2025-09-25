# Optio Platform - Technical Documentation

## User Preferences & Guidelines

**IMPORTANT INSTRUCTIONS:**
- **NEVER RUN LOCALLY** - Always test in the develop branch deployment at https://optio-dev-frontend.onrender.com
- **ALWAYS PUSH TO DEVELOP** - Push all changes to the develop branch for immediate live testing
- Always commit and push changes automatically unless explicitly told otherwise
- The diploma page is the CORE offering - students use it on resumes to showcase education
- Keep this documentation up to date with code changes
- Follow core_philosophy.md for all updates
- Never use emojis

**DEVELOPMENT WORKFLOW:**
- **Development**: Push to `develop` branch for immediate live testing on dev environment
- **Production**: Deploy to `main` branch only when ready for production release
- **Branch Strategy**: 
  - `develop` → https://optio-dev-frontend.onrender.com & https://optio-dev-backend.onrender.com
  - `main` → https://www.optioeducation.com & https://optio-prod-backend.onrender.com
- **Testing Process**: Always test changes in dev environment first, then merge to main for production

**DESIGN GUIDELINES:**
- **Optio Brand Gradient**: Always use `from-[#ef597b] to-[#6d469b]` (pink to purple)
- **Gradient Direction**: ALWAYS pink on the left (#ef597b), purple on the right (#6d469b) - NEVER swap
- **Complementary Colors**: Use lighter tints like `#f8b3c5` (light pink) and `#b794d6` (light purple)
- **Avoid**: Yellow and orange colors - they clash with the brand gradient
- **Tier Styling**: Academy tier "ACCREDITED" badge uses `bg-green-500`, centered at top
- **Tier Layout**: All tier cards use flexbox with buttons aligned at bottom
- **Favicon**: Located at `https://vvfgxcykxjybtvpfzwyx.supabase.co/storage/v1/object/public/logos/icon.jpg`
- **NEVER USE EMOJIS**: Avoid emojis in UI components, text, or any user-facing content. Use proper icons, SVGs, or design elements instead. Emojis can cause encoding issues and look unprofessional.

## Project Overview

Optio is an educational platform where students create self-validated diplomas through completing quests. Students build impressive portfolios by documenting their learning journey with public evidence.

## Tech Stack

**Backend:**
- Flask 3.0.0 + Supabase (PostgreSQL)
- JWT authentication (secure httpOnly cookies + CSRF protection)
- OpenAI/Gemini APIs for AI features
- Stripe for payments
- Performance optimized with database indexes

**Frontend:**
- React 18.3.1 + Vite + TailwindCSS
- React Router v6, React Query, Axios
- Memory leak prevention with custom hooks
- Optimized component architecture

**Hosting:**
- Backend: Render (optio-dev-backend for dev, optio-prod-backend for production)
- Frontend: Render (optio-dev-frontend for dev, optio-prod-frontend for production)
- Database: Supabase (shared across environments)
- Custom Domain: www.optioeducation.com → optio-prod-frontend service

## Key Directory Structure

```
backend/
├── routes/           # API endpoints
│   ├── admin/               # Modular admin routes
│   │   ├── user_management.py    # User CRUD, subscriptions, roles
│   │   ├── quest_management.py   # Quest CRUD operations
│   │   ├── quest_ideas.py        # Quest suggestions & AI generation
│   │   └── quest_sources.py      # Quest source management
│   ├── quests_v3.py         # V3 quest system
│   ├── tasks.py             # Task completions
│   ├── quest_submissions.py # Custom quests
│   ├── portfolio.py         # Diploma/portfolio
│   └── admin_v3.py          # Core admin functions
├── services/         # Business logic
│   ├── quest_optimization.py    # N+1 query elimination
│   └── atomic_quest_service.py  # Race condition prevention
├── hooks/            # Memory leak prevention
│   └── useMemoryLeakFix.js      # Safe async operations
├── migrations/       # Database performance indexes
│   ├── 001_add_performance_indexes.sql
│   ├── 002_add_evidence_indexes.sql
│   └── 003_add_user_activity_indexes.sql
└── middleware/       # Security, rate limiting, CSRF

frontend/src/
├── pages/
│   ├── QuestHubV3Improved.jsx  # Quest hub (memory optimized)
│   ├── DiplomaPageV3.jsx       # CORE FEATURE
│   ├── CustomizeQuestPage.jsx  # Quest submissions
│   ├── AdminPage.jsx           # Admin dashboard (modular)
│   └── DemoPage.jsx            # Interactive demo experience
├── components/
│   ├── admin/        # Extracted admin components
│   │   ├── AdminDashboard.jsx   # Dashboard overview
│   │   ├── AdminQuests.jsx      # Quest management
│   │   ├── AdminUsers.jsx       # User management
│   │   ├── UserDetailsModal.jsx # User profile modal
│   │   └── BulkEmailModal.jsx   # Bulk email functionality
│   ├── diploma/      # Diploma components
│   ├── demo/        # Demo feature components
│   └── ui/          # Reusable UI components
├── hooks/            # Custom hooks
│   └── useMemoryLeakFix.js      # Memory leak prevention
└── services/
    ├── api.js        # Secure API client (httpOnly cookies)
    └── authService.js # Secure authentication service
```

## Database Schema (Current State)

### Core Tables

**users**
- id (UUID, PK, references auth.users)
- username, first_name, last_name
- role (student/parent/advisor/admin)
- subscription_tier (explorer/creator/visionary)

**quests**
- id (UUID, PK)
- title, description
- source (khan_academy/brilliant/custom)
- is_v3 (boolean - true for current system)
- is_active
- Note: pillar and xp_value are legacy fields (V3 uses task-level)

**quest_tasks** (V3 - stores task details)
- id (UUID, PK)
- quest_id
- title, description
- pillar (STEM & Logic, Life & Wellness, Language & Communication, Society & Culture, Arts & Creativity)
- xp_value (XP for completing this task)
- order_index, is_required

**quest_task_completions** (V3 - tracks completion)
- id (UUID, PK)
- user_id, quest_id, task_id
- evidence_url, evidence_text
- completed_at

**user_skill_xp** (XP tracking)
- user_id, pillar, xp_amount
- Updated when tasks are completed

**quest_submissions** (Custom quest requests)
- id (UUID, PK)
- user_id
- title, description
- suggested_tasks (JSONB - includes pillar and xp per task)
- make_public (boolean)
- status (pending/approved/rejected)
- approved_quest_id (if approved)

**user_quests** (Quest enrollment)
- user_id, quest_id
- is_active (false = abandoned)
- started_at, completed_at

## Key API Endpoints

### Quests & Tasks
- GET /api/v3/quests - List quests
- POST /api/v3/quests/:id/start - Start quest
- POST /api/v3/tasks/:taskId/complete - Submit evidence
- GET /api/v3/quests/:id/progress - Check progress

### Admin API (Modular)
- **User Management**: /api/v3/admin/users/* - User CRUD, roles, subscriptions
- **Quest Management**: /api/v3/admin/quests/* - Quest CRUD operations
- **Quest Ideas**: /api/v3/admin/quest-ideas/* - Quest suggestions workflow
- **Quest Sources**: /api/v3/admin/quest-sources - Source management

### Custom Quest Submissions
- POST /api/v3/quests/submissions - Submit custom quest
- GET /api/v3/admin/quest-ideas - View submissions (admin)
- PUT /api/v3/admin/quest-ideas/:id/approve - Approve quest

### Portfolio/Diploma (CORE)
- GET /api/portfolio/:slug - Public portfolio view
- GET /api/portfolio/diploma/:userId - Get diploma data

## Key Features

### Demo Experience
- Interactive demo at /demo for prospective users
- Persona-based experience (student/parent)
- Sample quest completion workflow
- Auto-scroll navigation between steps

### V3 Quest System
- **Task-based structure**: Each quest has multiple tasks
- **Per-task configuration**: Each task has its own pillar and XP value
- **Evidence submission**: Text, images, videos, documents
- **Completion bonus**: 50% XP bonus for completing all tasks (rounded to nearest 50)
- **Custom quests**: Students can submit quest ideas for approval

### Diploma Page (MOST IMPORTANT)
- Public-facing portfolio at /diploma/:userId or /portfolio/:slug
- Displays completed quests with evidence
- Shows XP breakdown by skill pillar with radar chart visualization
- Professional design for resume use
- Must reflect Optio brand positively
- Auto-scrolls to top when navigating between sections

### XP Calculation
- XP awarded per task completion, not per quest
- Stored in user_skill_xp table by pillar
- Completion bonus applied when all tasks done

## Environment Variables

**Backend Environment Variables:**
- **Required for all environments:**
  - `SUPABASE_URL` - Supabase project URL
  - `SUPABASE_ANON_KEY` - Supabase anonymous key  
  - `SUPABASE_SERVICE_KEY` - Supabase service role key
  - `FLASK_SECRET_KEY` - Must be 32+ characters in production
  - `FLASK_ENV` - Set to "production" for main branch, "development" for develop branch

- **Environment-specific:**
  - `FRONTEND_URL` - CORS configuration
    - Dev: `https://optio-dev-frontend.onrender.com`
    - Prod: `https://www.optioeducation.com`

- **Optional:**
  - `OPENAI_API_KEY`, `GEMINI_API_KEY` (AI features)
  - `STRIPE_SECRET_KEY` (payments)

**Frontend Environment Variables:**
- **Required for all environments:**
  - `VITE_API_URL` - Backend API endpoint (without /api suffix)
    - Dev: `https://optio-dev-backend.onrender.com`
    - Prod: `https://optio-prod-backend.onrender.com`

**Critical Notes:**
- **FLASK_SECRET_KEY** must be exactly 64 characters (32 hex bytes) in production
- **VITE_API_URL** should NOT include `/api` suffix - the frontend code adds `/api` prefix to all requests
- All environment variables should be identical between develop and main branches except for the URLs
- Never commit secrets to the repository - all sensitive values go in Render environment variables

## Production Deployment

**Development Environment:**
```bash
git push origin develop  # Auto-deploys to optio-dev-backend & optio-dev-frontend
```
- **Backend**: https://optio-dev-backend.onrender.com
- **Frontend**: https://optio-dev-frontend.onrender.com

**Production Environment:**
```bash
git push origin main  # Auto-deploys to optio-prod-backend & optio-prod-frontend
```
- **Backend**: https://optio-prod-backend.onrender.com  
- **Frontend**: https://www.optioeducation.com

**Key Files:**
- Backend: `main.py` entry point for Python
- Frontend: `frontend/dist` build output, `_redirects: /* /index.html 200`

**Environment Variables:**
- **Supabase**: SUPABASE_URL, SUPABASE_KEY, SUPABASE_SERVICE_KEY
- **CORS**: FRONTEND_URL, ALLOWED_ORIGINS (configured per environment)
- **Flask**: FLASK_ENV=production for main branch

## MCP Integration

**Render MCP Configuration:**
- MCP provider enables direct management of Render services
- Allows updating environment variables, monitoring deployments, and checking logs
- Available services can be listed and managed programmatically

**Key MCP Commands:**
```bash
# List all Render services
mcp__render__list_services

# Update environment variables (triggers auto-deploy)
mcp__render__update_environment_variables(serviceId, envVars)

# Check deployment status
mcp__render__get_deploy(serviceId, deployId)

# Monitor application logs
mcp__render__list_logs(resource, limit, filters)
```

**Service IDs (Clean Architecture):**
- **Dev Backend**: `srv-d2tnvlvfte5s73ae8npg` (optio-dev-backend)
- **Dev Frontend**: `srv-d2tnvrffte5s73ae8s4g` (optio-dev-frontend)
- **Prod Backend**: `srv-d2to00vfte5s73ae9310` (optio-prod-backend)
- **Prod Frontend**: `srv-d2to04vfte5s73ae97ag` (optio-prod-frontend)

**Legacy Services (DELETE THESE - no longer needed):**
- `srv-d2tnouh5pdvs739ohha0` (optio-backend-dev-v2)
- `srv-d2tnm1uuk2gs73d2cqk0` (optio-backend-dev-new)
- `srv-d2tnm3re5dus73e155u0` (optio-frontend-dev-new)
- `srv-d2s8ravdiees73bfll10` (optio-frontend-dev)
- `srv-d2s8r8be5dus73ddp8h0` (optio-backend-dev)
- `srv-d2r79t7diees73dvcbig` (Optio_FE)
- `srv-d2po3n6r433s73dhcuig` (Optio)

**MCP Benefits:**
- Real-time deployment monitoring
- Environment variable management without manual dashboard access
- Log analysis for debugging issues
- Automated service health checks

## Development Guidelines

- Follow PEP 8 for Python
- Use functional React components with hooks
- TailwindCSS for styling
- Test in production environment
- Update this doc when making schema changes

## Security & Performance Enhancements (2024-12)

### Security Improvements
- **JWT Security**: Migrated from localStorage to secure httpOnly cookies
- **CSRF Protection**: Implemented double-submit cookie pattern for state-changing requests
- **XSS Prevention**: Eliminated JavaScript-accessible token storage
- **Session Security**: Enhanced with httpOnly and secure cookie flags

### Performance Optimizations
- **Database Indexes**: Comprehensive indexing strategy for frequent queries
- **N+1 Query Elimination**: Reduced database calls by ~80% in quest loading
- **Memory Leak Prevention**: Custom React hooks for safe async operations
- **Race Condition Prevention**: Atomic quest completion with optimistic locking

### Code Architecture
- **Backend Modularization**: Split 1720-line admin_v3.py into focused modules
- **Frontend Component Extraction**: Reduced AdminPage.jsx from 1958 to 60 lines
- **Single Responsibility**: Each module/component has clear, focused purpose
- **Maintainability**: 97% reduction in monolithic code complexity

### Database Migrations
Manual application required for production:
```bash
# Apply during low-traffic maintenance window
psql -f backend/migrations/001_add_performance_indexes.sql
psql -f backend/migrations/002_add_evidence_indexes.sql
psql -f backend/migrations/003_add_user_activity_indexes.sql
```

## Critical Notes

- The diploma page is the core product - prioritize its quality
- Custom quests allow student-generated content
- Always maintain backwards compatibility with existing data
- Security: All authentication now uses secure httpOnly cookies
- Performance: Database queries optimized with comprehensive indexing
- Architecture: Code is now modular and maintainable