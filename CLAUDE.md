# Optio Quest Platform - Technical Documentation

## User Preferences & Guidelines

**IMPORTANT INSTRUCTIONS:**
- Always test in production, not locally. Never provide local testing instructions.
- Always commit and push changes automatically unless explicitly told otherwise.
- Core philosophy: "The Process Is The Goal."
- The diploma page is the CORE offering - students use it on resumes to showcase education
- Accountability comes from public evidence availability
- Diplomas reflect student effort - poor documentation reflects poorly on them
- Must be well-designed and reflect the Optio brand positively
- This is often the first exposure to the brand - must clearly communicate self-validated diploma value
- If you identify discrepancies with production code and this CLAUDE.md file, update this file. Specifically focus on keeping the database schema up to date.
- Update CLAUDE.md before committing & pushing updates

## Project Overview

Optio is an educational platform that allows students to create self-validated diplomas through completing quests. Students build impressive diplomas by documenting their learning journey, with accountability coming from public evidence of their achievements.

This project has a core_philosophy.md file. Ensure all updates are in line with this philosophy.

## Architecture

### Tech Stack

**Backend:**
- Flask 3.0.0 (Python web framework)
- Supabase (PostgreSQL database with real-time features and auth)
- Gunicorn (Production WSGI server)
- JWT authentication
- OpenAI/Google Gemini APIs for AI features
- Stripe for payment processing

**Frontend:**
- React 18.3.1 with React Router v6
- Vite (Build tool)
- TailwindCSS (Styling)
- React Query (Data fetching)
- React Hook Form (Form management)
- Axios (HTTP client)
- Recharts (Data visualization)

**Infrastructure:**
- Railway/Render (Backend hosting)
- Netlify/Vercel (Frontend hosting)
- Supabase (Database & Auth)

## Directory Structure

```
pw_v2/
├── backend/
│   ├── app.py                    # Main Flask application
│   ├── config.py                  # Configuration management
│   ├── database.py                # Supabase client management
│   ├── cors_config.py             # CORS configuration
│   ├── routes/                    # API endpoints
│   │   ├── auth.py               # Authentication endpoints
│   │   ├── quests.py             # Quest management (legacy)
│   │   ├── quests_v3.py          # Quest management (V3)
│   │   ├── tasks.py              # Task completion
│   │   ├── collaborations.py    # Team-up functionality
│   │   ├── learning_logs_v3.py  # Learning logs
│   │   ├── admin.py              # Admin endpoints
│   │   ├── admin_v3.py           # Admin V3 endpoints
│   │   ├── portfolio.py         # Portfolio/diploma endpoints
│   │   ├── subscriptions.py     # Stripe subscription management
│   │   ├── community.py         # Social features
│   │   ├── sources.py           # Quest source management
│   │   └── uploads.py           # File upload handling
│   ├── middleware/               # Request/response middleware
│   │   ├── security.py          # Security middleware
│   │   ├── error_handler.py    # Global error handling
│   │   ├── rate_limiter.py     # Rate limiting
│   │   └── csrf_protection.py  # CSRF protection
│   ├── services/                # Business logic services
│   │   ├── email_service.py    # Email notifications
│   │   ├── evidence_service.py # Evidence upload to Supabase
│   │   ├── quest_completion_service.py
│   │   └── xp_service.py       # XP calculation
│   ├── utils/                   # Utility functions
│   │   ├── auth/               # Authentication utilities
│   │   ├── validation/         # Input validation
│   │   └── session_manager.py # Session management
│   └── migrations/             # Database migrations
├── frontend/
│   ├── src/
│   │   ├── App.jsx            # Main React component
│   │   ├── pages/             # Page components
│   │   │   ├── HomePage.jsx
│   │   │   ├── QuestHubV3.jsx      # Quest hub (V3)
│   │   │   ├── QuestDetailV3.jsx   # Quest detail (V3)
│   │   │   ├── DiplomaPageV3.jsx   # Diploma/portfolio page (CORE FEATURE)
│   │   │   ├── DashboardPage.jsx   # User dashboard
│   │   │   └── AdminPage.jsx       # Admin dashboard
│   │   ├── components/        # Reusable components
│   │   │   ├── quest/        # Quest-related components
│   │   │   ├── evidence/     # Evidence upload components
│   │   │   └── admin/        # Admin components
│   │   ├── contexts/         # React contexts
│   │   │   └── AuthContext.jsx
│   │   └── services/         # API service layer
│   │       └── api.js
│   └── public/
└── supabase/
    ├── migrations/           # SQL migrations
    └── functions/           # Edge functions

```

## Database Schema

### Core Tables

**users** (extends auth.users)
- id (UUID, PK, references auth.users(id))
- username (unique)
- first_name, last_name  
- subscription_tier (explorer/creator/visionary)
- stripe_customer_id
- role (student/parent/advisor/admin)
- created_at
- Note: email is stored in auth.users table, not users table

**quests**
- id (UUID, PK)
- title, description
- evidence_requirements
- pillar (creativity/critical_thinking/practical_skills/communication/cultural_literacy)
- xp_value (default 100)
- source (khan_academy/brilliant/code_academy/custom)
- source_url
- is_active
- is_v3 (flag for V3 quests)

**user_quests** (tracks progress)
- id (SERIAL, PK)
- user_id, quest_id
- status (in_progress/pending_review/completed/needs_changes)
- started_at, completed_at

**quest_tasks** (V3 feature)
- id (UUID, PK)
- quest_id
- title, description
- order_index
- is_required

**quest_task_completions** (V3 feature)
- id (UUID, PK)
- user_id, quest_id, task_id
- evidence_url, evidence_text
- completed_at

**quest_collaborations** (Team-up feature)
- id (UUID, PK)
- quest_id
- requester_id, partner_id
- status (pending/accepted/declined/completed/cancelled)

**learning_logs**
- id (UUID, PK)
- user_id, quest_id
- content
- reflection_prompt
- created_at

**diplomas**
- id (UUID, PK)
- user_id
- portfolio_slug (unique URL slug for public access)
- public_visibility

**user_skill_xp**
- user_id (references users(id))
- pillar (skill category name)
- xp_amount (total XP for that pillar)

### Supporting Tables
- quest_ratings
- quest_ideas
- site_settings
- activity_log
- friendships
- submission_evidence
- submissions

## API Endpoints

### Authentication
- POST /api/auth/register - User registration
- POST /api/auth/login - User login
- POST /api/auth/logout - User logout
- GET /api/auth/me - Get current user
- POST /api/auth/refresh - Refresh JWT token

### Quests (V3)
- GET /api/v3/quests - List all quests
- GET /api/v3/quests/:id - Get quest details
- POST /api/v3/quests/:id/start - Start a quest
- GET /api/v3/quests/:id/progress - Get user's progress

### Tasks (V3)
- POST /api/v3/tasks/:taskId/complete - Complete a task with evidence
- GET /api/v3/tasks/quest/:questId - Get tasks for a quest

### Collaborations
- POST /api/v3/collaborations/invite - Send team-up invitation
- POST /api/v3/collaborations/:id/accept - Accept invitation
- POST /api/v3/collaborations/:id/decline - Decline invitation
- GET /api/v3/collaborations/pending - Get pending invitations

### Portfolio/Diploma (CORE FEATURE)
- GET /api/portfolio/:slug - Get public portfolio by slug
- GET /api/portfolio/diploma/:userId - Get diploma by user ID
- PUT /api/portfolio/settings - Update portfolio settings

### Admin (V3)
- GET /api/v3/admin/quests - List all quests (admin)
- POST /api/v3/admin/quests - Create new quest
- PUT /api/v3/admin/quests/:id - Update quest
- DELETE /api/v3/admin/quests/:id - Delete quest
- POST /api/v3/admin/quests/:id/tasks - Add tasks to quest

### Learning Logs
- POST /api/v3/logs - Create learning log
- GET /api/v3/logs/quest/:questId - Get logs for quest
- PUT /api/v3/logs/:id - Update log
- DELETE /api/v3/logs/:id - Delete log

## Key Features

### 1. Quest System
- Students complete quests to earn XP in 5 skill pillars
- Each quest has tasks that must be completed with evidence
- Evidence can be text, images, videos, or documents
- Quests can be sourced from external platforms (Khan Academy, Brilliant, etc.)

### 2. V3 Quest System (Current)
- Modular task-based quests
- Team-up functionality for collaborative learning
- Learning logs for reflection
- Better progress tracking
- AI-powered quest generation capabilities
- **Completion Bonus**: Users who complete ALL tasks in a quest receive a 50% XP bonus (rounded up to nearest 50)

### 3. Diploma Page (CORE FEATURE)
- **THIS IS THE MOST IMPORTANT FEATURE**
- Public-facing page showcasing student achievements
- Displays completed quests with evidence
- Shows XP breakdown by skill pillar
- Customizable portfolio slug for easy sharing
- Used for resume/portfolio purposes
- Must be beautifully designed and professional
- Routes: /diploma/:userId and /portfolio/:slug

### 4. Authentication & Security
- JWT-based authentication with Supabase Auth
- Row Level Security (RLS) policies in database
- Rate limiting on sensitive endpoints
- Input sanitization and validation
- CSRF protection available (disabled by default for API compatibility)
- Security headers (XSS, clickjacking protection)

### 5. File Uploads
- Evidence upload to Supabase Storage
- Support for images, videos, documents
- 10MB file size limit per upload
- Automatic file type validation
- Storage in backend/uploads/evidence/

### 6. Subscription Tiers
- Explorer (free tier)
- Creator (paid tier)
- Visionary (premium tier)
- Stripe integration for payments
- Webhook handling for subscription events

## Configuration

### Environment Variables

**Required:**
- SUPABASE_URL - Supabase project URL
- SUPABASE_KEY / SUPABASE_ANON_KEY - Anon/public key
- SUPABASE_SERVICE_KEY / SUPABASE_SERVICE_ROLE_KEY - Service role key
- FLASK_SECRET_KEY / SECRET_KEY - Flask session secret (32+ chars in production)

**Optional:**
- OPENAI_API_KEY - For AI features
- GOOGLE_API_KEY / GEMINI_API_KEY - For Gemini AI
- STRIPE_SECRET_KEY - Payment processing
- STRIPE_WEBHOOK_SECRET - Stripe webhooks
- FRONTEND_URL - Frontend URL for CORS (default: http://localhost:5173)

### Security Configuration
- MAX_CONTENT_LENGTH: 50MB (configurable)
- Password requirements: 8+ chars, uppercase, lowercase, number
- Rate limiting: 100 requests/hour default
- CORS: Configured for specific origins (localhost, optioed.org)
- Session cookies: Secure in production, HttpOnly, SameSite=Lax

## Production Commands

### Deploy Backend (Railway/Render)
```bash
git add .
git commit -m "Deploy message"
git push origin main
```

### Deploy Frontend (Netlify/Vercel)
```bash
cd frontend
npm run build
# Automatic deployment via Git integration
```

### Database Migrations
```bash
cd backend
python run_quest_v3_migration.py
python run_source_migration.py
python create_sources_table.py
```

## Testing Strategy

### Backend Testing
- Unit tests in backend/tests/unit/
- Integration tests in backend/tests/integration/
- Test files: test_auth.py, test_xp_calculation.py, test_api_endpoints.py
- Run with: `pytest`

### Frontend Testing
- Component testing with React Testing Library
- E2E testing for critical user flows
- Focus on diploma page functionality

## Production Deployment Checklist

### Backend (Railway/Render)
1. Set all required environment variables
2. Ensure Procfile exists: `web: gunicorn app:app`
3. Verify requirements.txt is complete
4. Check database migrations are applied
5. Deploy via Git push to main branch

### Frontend (Netlify/Vercel)
1. Build command: `npm run build`
2. Publish directory: `frontend/dist`
3. Configure _redirects for SPA: `/* /index.html 200`
4. Set environment variables (VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY)
5. Verify custom domain configuration

## Security Best Practices

1. **Authentication**: All protected routes require valid JWT token
2. **Authorization**: RLS policies enforce data access at database level
3. **Input Validation**: All inputs sanitized using bleach and custom validators
4. **Rate Limiting**: Prevents abuse (5/min for auth, 60/min for API)
5. **File Uploads**: Type validation, size limits, Supabase Storage
6. **XSS Protection**: CSP headers, input sanitization
7. **SQL Injection**: Prevented by Supabase query builder and parameterized queries

## Performance Optimizations

1. **Database**: 
   - Indexes on user_id, quest_id, status columns
   - Connection pooling via Supabase client
   - Optimized queries with select() projections

2. **Caching**: 
   - Simple in-memory caching
   - 5-minute default timeout
   - Upgradeable to Redis

3. **Frontend**:
   - React code splitting
   - Lazy loading for routes
   - React Query for data caching

4. **File Handling**:
   - Direct upload to Supabase Storage
   - CDN delivery for static assets

## Monitoring & Logging

- Flask logging: INFO level in dev, WARNING in production
- Error tracking via global error handler middleware
- Activity logging in database for user actions
- Consider Sentry integration for production error tracking

## Common Issues & Solutions

1. **CORS Errors**: 
   - Check FRONTEND_URL in backend/config.py
   - Verify allowed origins include your domain

2. **Auth Failures**: 
   - Verify Supabase keys match between frontend and backend
   - Check JWT token expiration

3. **File Upload Issues**: 
   - Check Supabase Storage bucket policies
   - Verify file size limits (10MB default)

4. **Rate Limiting**: 
   - Adjust limits in middleware/rate_limiter.py
   - Consider Redis for distributed rate limiting

5. **Database Connection**:
   - Check SUPABASE_URL format
   - Verify service role key for admin operations

## API Response Format

Standard success response:
```json
{
  "success": true,
  "data": {...},
  "message": "Operation successful"
}
```

Standard error response:
```json
{
  "error": "Error message",
  "details": "Detailed error information",
  "code": "ERROR_CODE"
}
```

## Development Notes

### Git Workflow
- Main branch for production
- Feature branches for development
- Automatic deployment on push to main

### Code Style
- Python: PEP 8 compliance
- JavaScript: ES6+ syntax
- React: Functional components with hooks
- CSS: TailwindCSS utility classes

### Important Files
- PRD.md - Product requirements document
- design_implementation.md - Design decisions
- SECURITY_FIX_CHANGELOG.md - Security updates log
- AI_imp_plan.md - AI implementation roadmap
- supabase_issues.md - Current security/performance issues from Supabase dashboard

### Demo Feature Implementation (2025-08-30)

**Interactive Demo Successfully Implemented:**

The interactive demo feature at `/demo` route has been fully implemented with the following components:

1. **Core Demo Components** (All fully functional):
   - DemoPage.jsx - Main container orchestrating the demo experience
   - DemoHero.jsx - Animated hero section with rotating text and CTAs
   - DemoDiploma.jsx - Interactive diploma showcase with expandable quests
   - DemoQuestBrowser.jsx - Searchable/filterable quest browser
   - DemoHowItWorks.jsx - Step-by-step animated walkthrough
   - DemoProgress.jsx - Progress tracking with gamification
   - DemoTestimonials.jsx - Success stories carousel
   - DemoDataManager.jsx - localStorage state management

2. **Supporting Utilities**:
   - demoAnalytics.js - Comprehensive event tracking
   - demoData.js - Realistic sample data
   - useDemoABTest.js - A/B testing implementation

3. **Key Features**:
   - No authentication required
   - localStorage persistence between sessions
   - Mobile-responsive design
   - A/B testing with two variants (Adventure vs Portfolio focus)
   - Progress tracking and gamification
   - Analytics integration ready
   - Smooth scroll navigation
   - Interactive quest browsing with filters
   - Expandable evidence viewing
   - Confetti animation on 100% completion

4. **Routes Added**:
   - `/demo` - Main demo page
   - `/demo/diploma/:demoUserId` - Standalone demo diploma view

5. **Dependencies Added**:
   - @heroicons/react - For UI icons

6. **Known Issues**:
   - Demo images referenced in demoData.js need to be added to `/frontend/public/images/demo/`
   - Images needed: avatar-alex.jpg, avatar-sarah.jpg, avatar-james.jpg, avatar-maya.jpg, 
     quest-5k.jpg, quest-webapp.jpg, quest-watercolor.jpg, quest-debate.jpg, 
     quest-ancient.jpg, quest-robot.jpg

The demo is production-ready but will show broken images until placeholder images are added.

### CORS Fix for Production Domains (2025-08-30)

**Fixed CORS Issues for optioeducation.com:**
- Changed from @before_request OPTIONS handler to @after_request for all responses
- CORS headers now added to ALL responses, not just OPTIONS preflight requests
- Changed from wildcard (*) to explicit allowed origins list
- Ensured www.optioeducation.com and optioeducation.com are in allowed origins
- CORS now properly validates origin against whitelist before setting headers
- Fixes both preflight and actual request CORS issues

### Railway Deployment Fix (2025-08-30)

**Fixed Railway Deployment Failure:**
1. **Removed python-magic dependency completely:**
   - Initially changed `python-magic-bin` to `python-magic` but libmagic system library issues persisted
   - Made python-magic import optional in `backend/routes/uploads.py` with try/except
   - Removed python-magic from requirements.txt entirely
   - Application now uses fallback file validation when python-magic is not available
   - Fallback validation checks file headers for executable signatures and validates extensions

2. **Updated configuration:**
   - Updated Procfile to use `$PORT` environment variable instead of hardcoded 5000
   - Removed nixpacks.toml as system dependencies are no longer needed
   - Railway can now deploy with standard Python buildpack without issues

### Recent Security Updates (2025-08-30)

**Critical Security Fixes Applied:**

1. **Removed Dangerous Dev Utils**:
   - Deleted dev_utils.py which contained hardcoded admin password "Test123!"
   - Removed secret endpoint `/api/dev/emergency-reset-Test123` that bypassed all authentication
   - Eliminated critical security vulnerability allowing complete rate limit bypass

2. **Secured Portfolio Endpoints**:
   - Added authentication requirement to `/api/portfolio/user/<user_id>` endpoint
   - Users can now only view their own portfolio data via authenticated endpoint
   - Public portfolios still accessible via `/api/portfolio/public/<slug>` without auth
   - Added authorization checks to prevent unauthorized access to other users' data

3. **Enhanced File Upload Security**:
   - Implemented whitelist-based file extension validation
   - Added MIME type validation to prevent file type spoofing
   - Implemented magic byte (file signature) validation
   - Reduced file size limit from 50MB to 10MB for better security
   - Added filename sanitization to prevent path traversal attacks
   - Added file hash generation for integrity verification
   - Prevented upload of executable files and malicious content

4. **Strengthened CORS Configuration**:
   - Removed HTTP versions of production domains (HTTPS only)
   - Disabled credentials support unless strictly needed
   - Increased max age to 24 hours to reduce preflight requests

5. **Fixed React Memory Leaks**:
   - Fixed useEffect cleanup functions in DiplomaPageV3 component
   - Added proper subscription handling to prevent state updates on unmounted components
   - Implemented useCallback hooks to prevent unnecessary re-renders
   - Fixed stale closure issues in async operations

6. **Upgraded Frontend Dependencies**:
   - Upgraded from deprecated react-query v3 to @tanstack/react-query v5
   - Improved performance and security with latest query library
   - Added python-magic-bin for enhanced file validation

### Recent Security Updates (2025-08-29)

**Latest Security and Performance Fixes Applied:**

1. **Security Definer View Fixed**:
   - Removed SECURITY DEFINER from ai_generation_analytics view
   - Ensures proper RLS policy enforcement

2. **Function Security Hardening**:
   - Added search_path restrictions to ALL database functions
   - Prevents SQL injection via search path manipulation
   - Fixed 13 vulnerable functions

3. **RLS Performance Optimizations**:
   - Fixed auth.uid() calls to use (SELECT auth.uid()) for better query planning
   - Created is_admin() helper function for efficient admin checks
   - Added database indexes to improve RLS policy performance

4. **Consolidated Multiple Permissive Policies**:
   - Merged redundant policies on 10+ tables
   - Significantly improved query performance
   - Simplified policy management

5. **Created Missing RLS Policies**:
   - Added policies for ai_cycle_logs, ai_generated_quests, ai_generation_jobs
   - Added policies for ai_prompt_templates, ai_quest_review_history, ai_seeds
   - Enabled RLS on friendships, learning_logs_backup, quest_reviews, user_achievements

6. **Migration Files Created** in `supabase/migrations/`:
   - 20250829_fix_security_definer_view.sql - Fixes view security
   - 20250829_fix_function_search_paths.sql - Secures all functions
   - 20250829_move_extensions_to_schema.sql - Extension relocation guide
   - 20250829_fix_rls_performance.sql - Optimizes RLS performance
   - 20250829_consolidate_permissive_policies.sql - Merges redundant policies
   - 20250829_create_missing_rls_policies.sql - Adds missing policies
   - 20250829_comprehensive_security_fixes.sql - Master migration with all fixes
   - 20250829_fix_performance_issues.sql - Fixes auth RLS init and consolidates policies

**Manual Actions Required in Supabase Dashboard:**
1. Move extensions (pg_net, pg_trgm, vector) from public to extensions schema
2. Apply migration files via SQL Editor (requires superuser privileges)
3. Configure Auth settings:
   - Set OTP expiry to less than 1 hour
   - Enable leaked password protection (HaveIBeenPwned)
4. Run `SELECT * FROM public.check_security_fixes()` to verify all fixes
5. Verify Security Advisor shows resolved issues after migration

### Previous Security Updates (2025-01-08)

**Critical Security Fixes Applied:**
1. **RLS (Row Level Security) enabled** on previously unprotected tables:
   - learning_logs, learning_logs_backup, submissions, friendships
   - quest_collaborations, quest_reviews, user_achievements, leaderboards

2. **Performance optimizations** for RLS policies:
   - Fixed auth.uid() calls to use (SELECT auth.uid()) for better query planning
   - Consolidated multiple permissive policies to reduce overhead
   - Optimized policies on 25+ tables for improved performance

3. **Function security hardening**:
   - Added search_path restrictions to all database functions
   - Prevents SQL injection via search path manipulation

4. **Migration files created** in `supabase/migrations/`:
   - 20250108_security_fixes.sql - Enables RLS and creates policies
   - 20250108_performance_fixes.sql - Optimizes RLS performance  
   - 20250108_function_security_fixes.sql - Secures database functions

## Future Enhancements

1. **Core Improvements**:
   - Enhanced diploma page design with themes
   - Portfolio customization options
   - Public profile SEO optimization

2. **Features**:
   - Badge/achievement system
   - Parent/educator oversight dashboard
   - Advanced analytics for students
   - Peer review system
   - AI-powered learning recommendations

3. **Technical**:
   - WebSocket support for real-time collaboration
   - Redis caching layer
   - Elasticsearch for quest search
   - CDN integration for media files
   - Comprehensive test coverage (target 80%)

## Contact & Support

For technical issues or questions:
1. Check existing documentation (PRD.md, design_implementation.md)
2. Review security changelog for recent changes
3. Consult AI implementation plan for upcoming features

Remember: The diploma page is the heart of Optio - it must always be exceptional.