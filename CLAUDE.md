# Optio Platform - Technical Documentation

## User Preferences & Guidelines

**IMPORTANT INSTRUCTIONS:**
- Always test in production, not locally
- Always commit and push changes automatically unless explicitly told otherwise
- Core philosophy: "The Process Is The Goal"
- The diploma page is the CORE offering - students use it on resumes to showcase education
- Keep this documentation up to date with code changes
- Follow core_philosophy.md for all updates

**DESIGN GUIDELINES:**
- **Optio Brand Gradient**: Always use `from-[#ef597b] to-[#6d469b]` (pink to purple)
- **Gradient Direction**: ALWAYS pink on the left (#ef597b), purple on the right (#6d469b) - NEVER swap
- **Complementary Colors**: Use lighter tints like `#f8b3c5` (light pink) and `#b794d6` (light purple)
- **Avoid**: Yellow and orange colors - they clash with the brand gradient
- **Tier Styling**: Academy tier "ACCREDITED" badge uses `bg-green-500`, centered at top
- **Tier Layout**: All tier cards use flexbox with buttons aligned at bottom

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
- Backend: Railway/Render
- Frontend: Netlify/Vercel
- Database: Supabase

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
- pillar (creativity/critical_thinking/practical_skills/communication/cultural_literacy)
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
- Run `python fix_xp_calculation.py` if XP issues occur

## Environment Variables

**Required:**
- SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_KEY
- FLASK_SECRET_KEY

**Optional:**
- OPENAI_API_KEY, GEMINI_API_KEY (AI features)
- STRIPE_SECRET_KEY (payments)
- FRONTEND_URL (CORS config)

## Production Deployment

**Backend:**
```bash
git push origin main  # Auto-deploys to Railway/Render
```

**Frontend:**
```bash
npm run build  # Auto-deploys via Git integration
```

**Key Files:**
- Procfile: `web: gunicorn app:app`
- _redirects: `/* /index.html 200`

## Common Issues

1. **XP Not Showing**: Run `python fix_xp_calculation.py`
2. **CORS Errors**: Check FRONTEND_URL in config.py
3. **Auth Issues**: Verify Supabase keys match
4. **Upload Limits**: 10MB per file default

## Development Guidelines

- Follow PEP 8 for Python
- Use functional React components with hooks
- TailwindCSS for styling
- Test in production environment
- Update this doc when making schema changes

## Critical Notes

- The diploma page is the core product - prioritize its quality
- XP and pillars are now per-task, not per-quest (V3)
- Custom quests allow student-generated content
- Always maintain backwards compatibility with existing data