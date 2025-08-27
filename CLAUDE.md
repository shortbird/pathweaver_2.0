# CLAUDE.md - AI Assistant Guide for OptioQuest Platform

## Project Overview
OptioQuest (formerly PathWeaver 2.0) is an educational quest platform that gamifies learning through skill-based challenges. The platform allows students to complete quests, earn XP across different skill pillars, and track their educational progress.

## Quick Start Commands
```bash
# Start both frontend and backend
npm run dev

# Or separately:
# Backend (from root)
cd backend && venv/Scripts/python.exe app.py

# Frontend (from root)  
cd frontend && npm run dev
```

## Architecture Summary
- **Frontend**: React 18 + Vite + Tailwind CSS (http://localhost:5173)
- **Backend**: Flask REST API + Supabase (http://localhost:5001)
- **Database**: PostgreSQL via Supabase
- **Auth**: Supabase Auth with JWT tokens
- **Payments**: Stripe integration
- **AI**: OpenAI GPT & Google Gemini for quest generation

## Critical Context & Known Issues

### ⚠️ ONGOING MIGRATION - Pillar System Conflict
The codebase is transitioning between two skill systems:
- **OLD**: 6 categories (reading_writing, thinking_skills, personal_growth, life_skills, making_creating, world_understanding)
- **NEW**: 5 pillars (creativity, critical_thinking, practical_skills, communication, cultural_literacy)

**Current State**: Mixed implementation causing XP calculation errors. Check with stakeholder before making changes.

### 🔴 Duplicate User Routes
Two parallel implementations exist:
- `backend/routes/users_old.py` - Legacy monolithic file
- `backend/routes/users/` - New modular approach
Both are active. Verify with stakeholder which to use.

### 🔧 Database Schema Mismatch
- Schema file (`supabase_schema.sql`) uses old subject-based system
- Code expects new skill-based tables (`quest_skill_xp`, `user_skill_xp`)
- Multiple fix scripts indicate data integrity issues

## File Structure & Key Components

### Backend Structure
```
backend/
├── app.py                 # Main Flask app - registers all routes
├── config.py              # Environment configuration
├── database.py            # Supabase client initialization
├── routes/
│   ├── auth.py           # Authentication & user registration
│   ├── quests.py         # Quest CRUD & AI generation
│   ├── admin.py          # Admin panel & AI review queue
│   ├── users/            # NEW modular user routes
│   └── users_old.py      # LEGACY - potential removal
├── services/
│   └── quest_completion_service.py  # Quest completion logic
└── utils/
    ├── auth/             # Auth decorators & JWT handling
    └── validation/       # Input sanitization
```

### Frontend Structure
```
frontend/src/
├── pages/                # Route components
│   ├── DashboardPage.jsx # Main user dashboard
│   ├── QuestHub.jsx     # Quest browsing & selection
│   └── AdminDashboard.jsx # Admin control panel
├── components/
│   ├── quest/           # Quest-related components
│   └── Layout.jsx       # Main layout wrapper
├── contexts/
│   └── AuthContext.jsx  # Auth state management
└── services/
    └── api.js           # API call utilities
```

## API Endpoints Reference

### Authentication
- `POST /api/auth/register` - User registration
- `POST /api/auth/login` - User login
- `GET /api/auth/user` - Get current user
- `POST /api/auth/logout` - Logout user

### Quests
- `GET /api/quests` - List all quests
- `POST /api/quests` - Create quest (admin)
- `GET /api/quests/user` - User's quests
- `POST /api/quests/{id}/complete` - Submit quest completion
- `POST /api/quests/ai/generate` - Generate AI quest

### Users
- `GET /api/users/dashboard` - Dashboard data
- `GET /api/users/profile` - User profile
- `GET /api/users/xp` - XP breakdown
- `GET /api/users/completed-quests` - Completion history

## Environment Variables Required
```bash
# Backend (.env in /backend)
FLASK_ENV=development
FLASK_SECRET_KEY=your-secret-key
SUPABASE_URL=your-supabase-url
SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-key
OPENAI_API_KEY=your-openai-key
GOOGLE_API_KEY=your-google-key
STRIPE_SECRET_KEY=your-stripe-key

# Frontend (.env in /frontend)
VITE_SUPABASE_URL=your-supabase-url
VITE_SUPABASE_ANON_KEY=your-anon-key
VITE_API_URL=http://localhost:5001
```

## Common Tasks & Solutions

### Running Database Migrations
```bash
cd backend
python -m venv venv
venv/Scripts/activate
python migrate_database.py
```

### Fixing XP Calculation Issues
Multiple fix scripts exist due to ongoing migration:
- `backend/fix_user_xp.py` - Main XP fixer
- `backend/utils/fix_quest_xp.py` - Quest XP specific
Check with stakeholder before running.

### Adding New Quest Categories
1. Update skill mappings in `backend/routes/users/helpers.py`
2. Update frontend mappings in `frontend/src/utils/pillarMappings.js`
3. Run database migration to update existing quests

### Debugging Auth Issues
1. Check token in browser DevTools > Application > Cookies
2. Verify CORS settings in `backend/cors_config.py`
3. Ensure Supabase keys match between frontend/backend

## Testing & Quality Checks
```bash
# Backend linting (if configured)
cd backend && python -m flake8

# Frontend linting
cd frontend && npm run lint

# Type checking (if configured)
cd frontend && npm run typecheck
```

## Deployment Information
Multiple deployment configs exist (choose based on platform):
- **Heroku**: `Procfile` + `runtime.txt`
- **Render**: `backend/render.yaml`
- **Vercel**: `vercel.json` (frontend)
- **Netlify**: `netlify.toml` (frontend)

## AI Integration Notes

### Quest Generation
- Uses OpenAI GPT-4 or Google Gemini
- Admin can trigger manual generation
- AI quests enter review queue before publishing
- Prompts are in `backend/routes/quests.py`

### AI Review Queue
- Located in Admin Dashboard
- Allows editing before approval
- Tracks generation cycles and seeds
- Can bulk approve/reject

## Security Considerations
- Never commit `.env` files
- Use environment variables for all secrets
- Auth tokens expire after 24 hours
- Rate limiting enabled on API endpoints
- Input sanitization on all user inputs

## Performance Notes
- Frontend uses React Query for caching
- Backend implements in-memory cache (`cache.py`)
- Database indexes on frequently queried fields
- Lazy loading for quest lists

## Troubleshooting Guide

### "Module not found" Errors
- Check if `venv` is activated
- Run `pip install -r requirements.txt`
- Verify `PYTHONPATH` includes backend directory

### CORS Errors
- Check allowed origins in `backend/cors_config.py`
- Ensure frontend URL is in allowed list
- Verify API_URL in frontend .env

### Database Connection Issues
- Verify Supabase credentials
- Check service role key vs anon key usage
- Ensure database migrations are applied

### XP Not Calculating
- Known issue due to pillar system migration
- Run fix scripts as temporary solution
- Check `user_skill_xp` table for data

## Important Files to Review
1. `backend/config.py` - All configuration
2. `backend/routes/users/helpers.py` - XP calculation logic
3. `frontend/src/contexts/AuthContext.jsx` - Auth state
4. `backend/services/quest_completion_service.py` - Completion logic
5. `REFACTORING_PLAN.md` - Detailed cleanup plan

## Contact & Resources
- Main deployment: https://optioed.org
- Supabase Dashboard: Check project settings
- Error tracking: Check logs in deployment platform
- Database: Supabase SQL editor for queries

## Notes for Future Development
1. Complete pillar system migration before adding features
2. Resolve duplicate user routes before modifying user functionality  
3. Standardize API responses before adding new endpoints
4. Add comprehensive tests before major refactoring
5. Document any new environment variables immediately

---
*Last Updated: [Current Date]*
*Platform Version: 2.0*
*Migration Status: In Progress*