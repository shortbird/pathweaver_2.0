# Optio Platform - Technical Documentation

## User Preferences & Guidelines

**IMPORTANT INSTRUCTIONS:**
- Always test in production, not locally
- Always commit and push changes automatically unless explicitly told otherwise
- The diploma page is the CORE offering - students use it on resumes to showcase education
- Keep this documentation up to date with code changes
- Follow core_philosophy.md for all updates
- Never use emojis

**DEVELOPMENT WORKFLOW:**
- **Development**: Push to `develop` branch for immediate live testing on dev environment
- **Production**: Deploy to `main` branch only when ready for production release
- **Branch Strategy**: 
  - `develop` → https://optio-frontend-dev-new.onrender.com & https://optio-backend-dev-new.onrender.com
  - `main` → https://www.optioeducation.com & https://optio-backend-dev.onrender.com (promoted from working dev)
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
- JWT authentication
- OpenAI/Gemini APIs for AI features
- Stripe for payments

**Frontend:**
- React 18.3.1 + Vite + TailwindCSS
- React Router v6, React Query, Axios

**Hosting:**
- Backend: Render (optio-backend-dev for dev, Optio for production)
- Frontend: Render (optio-frontend-dev for dev, Optio_FE for production)
- Database: Supabase (shared across environments)
- Custom Domain: www.optioeducation.com → Optio_FE service

## Key Directory Structure

```
backend/
├── routes/           # API endpoints
│   ├── quests_v3.py         # V3 quest system
│   ├── tasks.py             # Task completions
│   ├── quest_submissions.py # Custom quests
│   ├── portfolio.py         # Diploma/portfolio
│   └── admin_v3.py          # Admin functions
├── services/         # Business logic
└── middleware/       # Security, rate limiting

frontend/src/
├── pages/
│   ├── QuestHubV3Improved.jsx  # Quest hub
│   ├── DiplomaPageV3.jsx       # CORE FEATURE
│   ├── CustomizeQuestPage.jsx  # Quest submissions
│   ├── AdminPage.jsx           # Admin dashboard
│   └── DemoPage.jsx            # Interactive demo experience
└── components/
    ├── diploma/      # Diploma components
    ├── demo/        # Demo feature components
    └── ui/          # Reusable UI components
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

### Custom Quest Submissions
- POST /api/v3/quests/submissions - Submit custom quest
- GET /api/v3/admin/submissions - View submissions (admin)
- PUT /api/v3/admin/submissions/:id/approve - Approve quest

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
    - Dev: `https://optio-frontend-dev-new.onrender.com`
    - Prod: `https://www.optioeducation.com`

- **Optional:**
  - `OPENAI_API_KEY`, `GEMINI_API_KEY` (AI features)
  - `STRIPE_SECRET_KEY` (payments)

**Frontend Environment Variables:**
- **Required for all environments:**
  - `VITE_API_URL` - Backend API endpoint (without /api suffix)
    - Dev: `https://optio-backend-dev-new.onrender.com`
    - Prod: `https://optio-backend-dev.onrender.com` (promoted from working dev)

**Critical Notes:**
- **FLASK_SECRET_KEY** must be exactly 64 characters (32 hex bytes) in production
- **VITE_API_URL** should NOT include `/api` suffix - the frontend code adds `/api` prefix to all requests
- All environment variables should be identical between develop and main branches except for the URLs
- Never commit secrets to the repository - all sensitive values go in Render environment variables

## Production Deployment

**Development Environment:**
```bash
git push origin develop  # Auto-deploys to optio-backend-dev & optio-frontend-dev
```
- **Backend**: https://optio-backend-dev.onrender.com
- **Frontend**: https://optio-frontend-dev.onrender.com

**Production Environment:**
```bash
git push origin main  # Auto-deploys to Optio & Optio_FE
```
- **Backend**: https://optio-8ibe.onrender.com  
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

**Service IDs:**
- **Dev Backend**: `srv-d2tnm1uuk2gs73d2cqk0` (optio-backend-dev-new)
- **Dev Frontend**: `srv-d2tnm3re5dus73e155u0` (optio-frontend-dev-new)
- **Prod Backend**: `srv-d2s8r8be5dus73ddp8h0` (optio-backend-dev - promoted to production)
- **Prod Frontend**: `srv-d2r79t7diees73dvcbig` (Optio_FE)

**Legacy Services (can be deleted after verification):**
- **Old Prod Backend**: `srv-d2po3n6r433s73dhcuig` (Optio - had CORS issues)
- **Old Dev Frontend**: `srv-d2s8ravdiees73bfll10` (optio-frontend-dev - replaced by new)

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

## Critical Notes

- The diploma page is the core product - prioritize its quality
- Custom quests allow student-generated content
- Always maintain backwards compatibility with existing data