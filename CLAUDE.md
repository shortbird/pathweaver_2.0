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

## Project Overview

Optio is an educational platform that allows students to create self-validated diplomas through completing quests. Students build impressive diplomas by documenting their learning journey, with accountability coming from public evidence of their achievements.

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
- id (UUID, PK)
- username (unique)
- first_name, last_name
- subscription_tier (explorer/creator/visionary)
- stripe_customer_id
- role (student/admin/educator)

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
- user_id, pillar
- xp_amount

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