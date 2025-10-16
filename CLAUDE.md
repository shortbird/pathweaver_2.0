# Optio Platform - Technical Documentation

## User Preferences & Guidelines

**IMPORTANT INSTRUCTIONS:**
- **NEVER RUN LOCALLY** - Always test in the develop branch deployment at https://optio-dev-frontend.onrender.com
- **ALWAYS COMMIT TO DEVELOP** - COMMIT all changes to the develop branch for immediate live testing
- Always commit changes automatically unless explicitly told otherwise (but do not push unless requested)
- The diploma page is the CORE offering - students use it on resumes to showcase education
- Keep this documentation up to date with code changes
- Follow core_philosophy.md for all updates - "The Process Is The Goal"
- Never use emojis

**SUBSCRIPTION TIERS (4-Tier System):**
- **Explore** - Free tier (database: "Explore")
- **Accelerate** - Entry tier, $50.00/mo (database: "Accelerate")
- **Achieve** - Mid tier, $300.00/mo (database: "Achieve")
- **Excel** - Highest tier, $600.00/mo (database: "Excel")

**DEVELOPMENT WORKFLOW:**
- **Current Branch**: `develop` - All development happens here
- **Development**: Push to `develop` branch for immediate live testing on dev environment
- **Production**: Merge `develop` → `main` only when ready for production release
- **Branch Strategy**:
  - `develop` → https://optio-dev-frontend.onrender.com & https://optio-dev-backend.onrender.com
  - `main` → https://www.optioeducation.com & https://optio-prod-backend.onrender.com
- **Testing Process**:
  1. Make changes in `develop` branch
  2. Push to `develop` for live testing at dev URLs
  3. When stable, merge `develop` → `main` for production
  4. Never commit directly to `main` - always go through `develop` first

**CORE PHILOSOPHY:**
- **Foundation**: "The Process Is The Goal" - learning is about who you become through the journey
- **Present-Focused Value**: Celebrate growth happening RIGHT NOW, not future potential
- **Internal Motivation**: Focus on how learning FEELS, not how it LOOKS
- **Process Celebration**: Every step, attempt, and mistake is valuable

## Project Overview

Optio is an educational platform where students create self-validated diplomas through completing quests. Students build impressive portfolios by documenting their learning journey with public evidence.

## Tech Stack

**Backend:**
- Flask 3.0.0 + Supabase (PostgreSQL)
- JWT authentication (secure httpOnly cookies + CSRF protection)
- Gemini API for AI features (Model: **gemini-2.5-flash-lite** - ALWAYS use this model)
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
│   ├── users/               # User-specific routes
│   │   ├── completed_quests.py   # Quest completion history
│   │   ├── dashboard.py          # User dashboard data
│   │   ├── profile.py            # User profile management
│   │   └── transcript.py         # Academic transcript
│   ├── admin_core.py        # Core admin functions
│   ├── auth.py              # Authentication & JWT
│   ├── collaborations.py    # Team-up invitations (paid tier)
│   ├── community.py         # Friends system (paid tier)
│   ├── evidence_documents.py # Evidence file uploads
│   ├── portfolio.py         # Diploma/portfolio (CORE)
│   ├── promo.py             # Promo codes
│   ├── quests.py            # Quest system
│   ├── ratings.py           # Quest ratings & feedback
│   ├── settings.py          # User settings
│   ├── subscriptions.py     # Stripe subscription management
│   ├── tasks.py             # Task completions
│   ├── tutor.py             # AI Tutor features
│   └── uploads.py           # File upload handling
├── services/         # Business logic
│   ├── atomic_quest_service.py  # Race condition prevention
│   ├── badge_service.py         # Badge logic & progress tracking
│   ├── image_service.py         # Pexels API for quest & badge images
│   └── quest_optimization.py    # N+1 query elimination
├── scripts/          # Database & maintenance scripts
│   ├── apply_performance_indexes.py  # Database optimization
│   └── simple_indexes.py             # Index management
├── middleware/       # Security & request handling
│   ├── csrf_protection.py       # CSRF token management
│   ├── error_handler.py         # Global error handling
│   ├── rate_limiter.py          # API rate limiting
│   └── security.py              # Security headers
├── utils/           # Shared utilities
│   ├── auth/                    # Authentication utilities
│   │   ├── decorators.py        # @require_auth, @require_paid_tier
│   │   └── helpers.py           # JWT validation helpers
│   └── validation/              # Input validation
└── database.py      # Supabase client management

frontend/src/
├── pages/
│   ├── AdminPage.jsx           # Admin dashboard (modular)
│   ├── DashboardPage.jsx       # User dashboard
│   ├── DemoPage.jsx            # Demo features
│   ├── DiplomaPage.jsx         # CORE FEATURE
│   ├── EmailVerificationPage.jsx  # Email verification
│   ├── ConnectionsPage.jsx     # Connections/community features (paid tier) - NEW REDESIGN
│   ├── FriendsPage.jsx         # DEPRECATED - Redirects to /connections
│   ├── HomePage.jsx            # Landing page
│   ├── LoginPage.jsx           # Authentication
│   ├── PrivacyPolicy.jsx       # Legal pages
│   ├── ProfilePage.jsx         # User profile management
│   ├── PromoLandingPage.jsx    # Promotional campaigns
│   ├── QuestBadgeHub.jsx       # Unified quest & badge hub (replaces old QuestHub)
│   ├── QuestDetail.jsx         # Individual quest page
│   ├── RegisterPage.jsx        # User registration
│   ├── SubscriptionPage.jsx    # Stripe subscription management
│   ├── SubscriptionSuccess.jsx # Subscription confirmation
│   ├── SubscriptionCancel.jsx  # Subscription cancellation
│   └── TermsOfService.jsx      # Legal pages
├── components/
│   ├── admin/        # Extracted admin components
│   │   ├── AdminDashboard.jsx   # Dashboard overview
│   │   ├── AdminQuests.jsx      # Quest management
│   │   ├── AdminUsers.jsx       # User management
│   │   ├── AdminQuestSuggestions.jsx # Quest idea approval
│   │   └── BadgeImageGenerator.jsx # Badge image generation
│   ├── diploma/      # Diploma components
│   ├── demo/         # Demo feature components
│   ├── connections/  # Connections page components (NEW REDESIGN)
│   │   ├── ConnectionsHeader.jsx      # Hero header with philosophy-aligned copy
│   │   ├── ConnectionsTabs.jsx        # Tab navigation (Activity/Connections/Invitations)
│   │   ├── ActivityFeed/              # NEW: Activity feed tab
│   │   │   ├── ActivityFeedTab.jsx
│   │   │   ├── ActivityCard.jsx
│   │   │   └── ActivityEmptyState.jsx
│   │   ├── YourConnections/           # Connections grid view
│   │   │   ├── ConnectionsTab.jsx
│   │   │   ├── ConnectionCard.jsx
│   │   │   ├── ConnectionSearch.jsx
│   │   │   └── ConnectionsEmptyState.jsx
│   │   ├── Invitations/               # Unified invitations view
│   │   │   ├── InvitationsTab.jsx
│   │   │   ├── ConnectionRequest.jsx
│   │   │   ├── TeamUpInvite.jsx
│   │   │   └── InvitationsEmptyState.jsx
│   │   └── Modals/
│   │       └── AddConnectionModal.jsx
│   ├── hub/          # Quest & badge hub components
│   │   ├── BadgeCarouselCard.jsx # Badge card with teen-focused images
│   │   └── QuestCard.jsx         # Quest card component
│   ├── tutor/        # AI Tutor components
│   │   ├── ChatInterface.jsx    # Tutor chat interface
│   │   ├── TutorWidget.jsx      # Tutor widget
│   │   └── ParentDashboard.jsx  # Parent tutor dashboard
│   └── ui/           # Reusable UI components
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
- display_name, first_name, last_name, email
- role (student/parent/advisor/admin)
- subscription_tier (explorer/creator/visionary)
- subscription_status, subscription_end_date
- stripe_customer_id, stripe_subscription_id
- portfolio_slug, bio, avatar_url
- level, total_xp, achievements_count, streak_days
- tos_accepted_at, privacy_policy_accepted_at
- created_at, last_active

**quests**
- id (UUID, PK)
- title, description
- source (khan_academy/brilliant/custom)
- image_url (auto-fetched from Pexels API)
- header_image_url (legacy, same as image_url)
- is_active
- created_at, updated_at
- Note: pillar and xp_value are legacy fields (now task-level)

**quest_tasks** (stores task details)
- id (UUID, PK)
- quest_id (FK to quests)
- title, description
- pillar (STEM & Logic, Life & Wellness, Language & Communication, Society & Culture, Arts & Creativity)
- xp_value (XP for completing this task)
- order_index, is_required
- created_at, updated_at

**quest_task_completions** (tracks completion)
- id (UUID, PK)
- user_id, quest_id, task_id
- evidence_url, evidence_text
- completed_at
- xp_awarded (calculated from task)

**user_skill_xp** (XP tracking by pillar)
- user_id, pillar, xp_amount
- Updated atomically when tasks are completed

**quest_submissions** (Custom quest requests)
- id (UUID, PK)
- user_id
- title, description
- suggested_tasks (JSONB - includes pillar and xp per task)
- make_public (boolean)
- status (pending/approved/rejected)
- approved_quest_id (if approved)
- created_at, updated_at

**user_quests** (Quest enrollment)
- user_id, quest_id
- is_active (false = abandoned)
- started_at, completed_at

**badges** (Achievement badges)
- id (UUID, PK)
- name, description, identity_statement
- pillar_primary (STEM & Logic, Life & Wellness, etc.)
- min_quests, min_xp (requirements to earn badge)
- image_url (auto-fetched from Pexels API with teen-focused images)
- image_generated_at, image_generation_status
- is_active
- created_at, updated_at

### Community & Social Features

**friendships** (Friends system - paid tier only)
- id (UUID, PK)
- requester_id, addressee_id (both FK to users)
- status (pending/accepted/rejected)
- created_at, updated_at
- Note: Updated via bypass function to avoid timestamp triggers

**quest_collaborations** (Team-up system - paid tier only)
- id (UUID, PK)
- sender_id, receiver_id (both FK to users)
- quest_id (FK to quests)
- status (pending/accepted/rejected/cancelled)
- message (optional)
- created_at, updated_at

**quest_ratings** (Quest feedback system)
- id (UUID, PK)
- user_id, quest_id
- rating (1-5 stars)
- feedback_text (optional)
- created_at, updated_at

### Additional Features


**evidence_document_blocks** (File uploads for evidence)
- id (UUID, PK)
- user_id, task_completion_id
- file_name, file_type, file_size
- file_url (Supabase storage)
- created_at

**promo_codes** (Promotional codes)
- id (UUID, PK)
- code (unique)
- discount_type, discount_value
- valid_from, valid_until
- max_uses, current_uses
- is_active

### AI Tutor System Tables

**tutor_conversations** (Chat conversations)
- id (UUID, PK)
- user_id (FK to users)
- mode (enum: study_buddy, teacher, discovery, review, creative)
- title, context
- is_active
- created_at, updated_at

**tutor_messages** (Individual messages)
- id (UUID, PK)
- conversation_id (FK to tutor_conversations)
- user_id (FK to users)
- role (user/assistant)
- content, tokens_used
- safety_level (enum: safe, warning, blocked, requires_review)
- created_at

**tutor_settings** (User tutor preferences)
- user_id (FK to users, PK)
- default_mode, safety_mode
- max_tokens_per_message
- parent_oversight_enabled
- updated_at

**tutor_safety_logs** (Safety monitoring)
- id (UUID, PK)
- user_id, message_id
- flagged_content, safety_score
- action_taken, reviewed_by
- created_at

## Key API Endpoints

### Authentication (httpOnly cookies + CSRF)
- POST /api/auth/login - Login with email/password
- POST /api/auth/register - Create new account
- POST /api/auth/refresh - Refresh JWT tokens
- POST /api/auth/logout - Clear auth cookies
- GET /api/auth/csrf-token - Get CSRF token for frontend

**IMPORTANT - CSRF POST Requests:**
- ALL POST/PUT/DELETE requests MUST include a JSON body (even if empty `{}`)
- CSRF middleware enforces `Content-Type: application/json` header
- Example: `api.post('/api/badges/123/select', {})` NOT `api.post('/api/badges/123/select')`
- Failure to include body results in "Content-Type must be application/json" 400 error

### Quests & Tasks
- GET /api/quests - List active quests
- POST /api/quests/:id/start - Start quest
- GET /api/quests/:id/progress - Check quest progress
- POST /api/tasks/:taskId/complete - Submit task evidence
- GET /api/tasks/:taskId - Get task details

### User Management
- GET /api/users/:userId/dashboard - Dashboard data
- GET /api/users/:userId/profile - User profile
- PUT /api/users/:userId/profile - Update profile
- GET /api/users/:userId/completed-quests - Quest history
- GET /api/users/:userId/transcript - Academic transcript

### Community Features (Paid Tier Only)
- GET /api/community/friends - List friends
- POST /api/community/friends/request - Send friend request
- PUT /api/community/friends/:id/accept - Accept friend request
- POST /api/collaborations/invite - Send collaboration invite
- GET /api/collaborations - List collaboration invites

### Admin API (Modular)
- **User Management**: /api/admin/users/* - User CRUD, roles, subscriptions
- **Quest Management**: /api/admin/quests/* - Quest CRUD operations
- **Quest Ideas**: /api/admin/quest-ideas/* - Quest suggestions workflow
- **Quest Sources**: /api/admin/quest-sources - Source management
- **Quest Images**: POST /api/v3/admin/quests/:id/refresh-image - Refresh quest image from Pexels
- **Badge Images**: POST /api/badges/admin/:badge_id/refresh-image - Refresh badge image from Pexels
- **Badge Bulk Images**: POST /api/badges/admin/batch-generate-images - Generate images for multiple badges

### Badges & Achievements
- GET /api/badges - List all active badges
- GET /api/badges/:id - Get badge details with user progress
- POST /api/badges/:id/select - Select badge (empty JSON body required)

### Portfolio/Diploma (CORE FEATURE)
- GET /api/portfolio/:slug - Public portfolio view
- GET /api/portfolio/diploma/:userId - Get diploma data
- PUT /api/portfolio/:userId/settings - Update portfolio settings

### AI Tutor Features
- POST /api/tutor/chat - Send message to AI tutor
- GET /api/tutor/conversations/:userId - Get user's tutor conversations
- POST /api/tutor/conversations - Create new tutor conversation
- GET /api/tutor/parent-dashboard/:userId - Get parent dashboard data
- POST /api/tutor/feedback - Submit tutor feedback

### Additional Features
- POST /api/uploads - File upload handling
- POST /api/evidence-documents - Upload evidence files
- POST /api/quest-ratings - Rate completed quest
- POST /api/subscriptions/create - Create Stripe subscription
- GET /api/health - Health check endpoint

## Key Features

### Quest System (Current Implementation)
- **Task-based structure**: Each quest contains multiple tasks with individual XP values
- **Per-task configuration**: Each task has its own pillar and XP value
- **Evidence submission**: Text, images, videos, documents via evidence_document_blocks table
- **Completion bonus**: 50% XP bonus for completing all tasks (rounded to nearest 50)
- **Custom quests**: Students can submit quest ideas for admin approval
- **Race condition prevention**: Atomic quest completion with optimistic locking
- **Performance optimized**: N+1 query elimination reduces database calls by ~80%
- **Auto-generated images**: Quest images automatically fetched from Pexels API based on quest title

### Badge System
- **Achievement badges**: Visual recognition of skill mastery in specific areas
- **Unified hub**: Badges displayed in horizontal carousels within QuestBadgeHub (/badges or /quests page)
- **Teen-focused imagery**: Badge images auto-generated from Pexels with "teenage teen student" search terms
- **Progress tracking**: Shows x/x quests completed and x/x XP earned toward badge requirements
- **Identity statements**: Each badge has "I am..." or "I can..." statements reflecting achieved skills
- **Pillar alignment**: Badges tied to one of five skill pillars with matching iconography
- **Background images**: Badge cards feature background images with dark overlays for text readability
- **Admin tools**: Batch image generation interface in admin dashboard
- **Full descriptions**: Badge cards display complete description text for clarity

### Diploma Page (CORE PRODUCT)
- **Public portfolio**: /diploma/:userId or /portfolio/:slug routes
- **Evidence showcase**: Displays completed quests with submitted evidence
- **XP visualization**: Radar chart showing skill pillar breakdown
- **Professional design**: Resume-ready presentation reflecting Optio brand
- **SEO optimized**: Meta tags for sharing on social platforms
- **Auto-navigation**: Scrolls to top when navigating between sections
- **Critical importance**: This is what students showcase to employers

### Connections Feature (Paid Tier Only) - NEW REDESIGN 2025
- **Rebranded**: "Friends" → "Connections" for more professional, educational focus
- **Three-tab interface**: Activity Feed, Your Connections, Invitations
- **Activity Feed (NEW)**: See what connections are learning RIGHT NOW with present-focused language
- **Connection Cards**: Rich cards showing current pillar focus and learning activity
- **Unified Invitations**: Connection requests + team-up invites in one organized view
- **Process-focused copy**: "is exploring", "currently learning", "learning partners" terminology
- **Brand gradient design**: Purple (#6D469B) → Pink (#EF597B) with pillar-specific accent colors
- **Poppins typography**: Bold/Semi-Bold/Medium only (700/600/500)
- **Mobile-first responsive**: Optimized for all screen sizes
- **WCAG 2.1 AA accessible**: Full keyboard navigation, screen reader support
- **Modular architecture**: Clean component structure in `/components/connections/`
- **Database optimization**: Friendship updates use bypass function to avoid timestamp triggers

### Authentication & Security
- **httpOnly cookies**: JWT tokens stored in secure httpOnly cookies
- **CSRF protection**: Double-submit cookie pattern for state-changing requests
- **RLS enforcement**: Row Level Security via user-authenticated Supabase clients
- **Token refresh**: Automatic token renewal without user intervention
- **XSS prevention**: No JavaScript-accessible token storage

### AI Tutor System
- **Conversational AI**: Interactive chat interface powered by Gemini API
- **Learning assistance**: Context-aware help with quest tasks and general learning
- **Parent dashboard**: Oversight tools for parents to monitor student progress
- **Conversation history**: Persistent chat sessions for continuity
- **Feedback system**: Quality assurance and improvement tracking

### Additional Features
- **Quest ratings**: 1-5 star rating system with optional feedback
- **Evidence documents**: File upload system for rich evidence submission
- **Promo codes**: Discount system for subscription management
- **Subscription tiers**: Explorer (free), Creator, Visionary with Stripe integration

### XP System & Skill Progression
- **XP Per Task**: Each task has individual XP value based on difficulty and pillar
- **Completion Bonus**: 50% bonus XP when completing all tasks in a quest (rounded to nearest 50)
- **Five Skill Pillars**: STEM & Logic, Life & Wellness, Language & Communication, Society & Culture, Arts & Creativity
- **Achievement Levels**: Explorer (0 XP) → Builder (250 XP) → Creator (750 XP) → Scholar (1,500 XP) → Sage (3,000 XP)
- **Atomic Updates**: XP stored in user_skill_xp table with race condition prevention

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
  - `GEMINI_API_KEY` (AI features)
  - `STRIPE_SECRET_KEY` (payments)
  - `PEXELS_API_KEY` (Quest image auto-generation)

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
**Supabase MCP Setup:**

To configure Supabase MCP for read-only database access:

```bash
claude mcp add supabase npx -- -y @supabase/mcp-server-supabase@latest --access-token sbp_f2e031d2b3f3f524cd0ee9cc4e977ec7b7f240e3
```

This enables direct read-only SQL queries against the production database for debugging and analysis.
**Service IDs (Clean Architecture):**
- **Dev Backend**: `srv-d2tnvlvfte5s73ae8npg` (optio-dev-backend)
- **Dev Frontend**: `srv-d2tnvrffte5s73ae8s4g` (optio-dev-frontend)
- **Prod Backend**: `srv-d2to00vfte5s73ae9310` (optio-prod-backend)
- **Prod Frontend**: `srv-d2to04vfte5s73ae97ag` (optio-prod-frontend)

**MCP Benefits:**
- Real-time deployment monitoring
- Environment variable management without manual dashboard access
- Log analysis for debugging issues
- Automated service health checks

## Common Issues & Troubleshooting

### Authentication Issues
- **401 Unauthorized**: Check if user is logged in, verify JWT token in httpOnly cookies
- **CSRF Token Missing**: Ensure X-CSRF-Token header is included in state-changing requests
- **CORS Errors**: Verify FRONTEND_URL environment variable matches the requesting domain
- **withCredentials**: All API calls must include `withCredentials: true` for cookie authentication

### Database Connection Issues
- **Connection Timeout**: Use database connection retry logic in community.py pattern
- **RLS Violations**: Use get_user_client() instead of get_supabase_admin_client() for user operations
- **Friendship Updates**: Use bypass function to avoid timestamp trigger issues

### Recent Bug Fixes Applied
- **Friendship Update Errors**: Added database function to bypass timestamp triggers (commit: 8039407)
- **CORS Policy Errors**: Added manual CORS headers and supports_credentials configuration (commit: 8aed486)
- **404 Authentication Errors**: Fixed CSRF endpoint routing and added root route support (commit: 90e2b40)
- **Blueprint Conflicts**: Resolved users route blueprint name conflicts (commit: 8dc54e0)

### Performance Optimization Patterns
- **N+1 Query Prevention**: Use quest_optimization.py service for bulk data loading
- **Memory Leak Prevention**: Use useMemoryLeakFix.js hook for React components
- **Race Condition Prevention**: Use atomic_quest_service.py for quest completions
- **Database Indexing**: Comprehensive indexes applied for frequent query patterns

### File Upload Issues
- **Blob URL Errors**: Ensure proper blob URL handling in evidence_documents.py
- **CORS for File Uploads**: Verify upload endpoints have proper CORS configuration
- **File Size Limits**: Check Supabase storage limits and backend validation

## Development Guidelines

### Code Standards
- **Python**: Follow PEP 8, use type hints, implement proper error handling
- **React**: Use functional components with hooks, implement memory leak prevention
- **Database**: Use proper client selection (admin vs user), implement RLS correctly
- **API Design**: RESTful endpoints, proper HTTP status codes, comprehensive error messages
- **Security**: Always use httpOnly cookies, implement CSRF protection, validate inputs

### Testing & Deployment
- **Environment Strategy**: Test in dev environment first, then deploy to production
- **Branch Management**: Use develop branch for testing, main for production releases
- **Error Handling**: Implement comprehensive error logging and user feedback
- **Performance**: Use optimization patterns from services/ directory

### Code Architecture Principles
- **Modular Design**: Keep components and modules focused on single responsibilities
- **Security First**: Never expose sensitive data, use proper authentication patterns
- **Performance Conscious**: Prevent N+1 queries, use appropriate database indexes
- **User Experience**: Follow core_philosophy.md for messaging and UX patterns

### Recent Architectural Improvements (2024)
- **Backend Modularization**: Split monolithic files into focused modules
- **Security Enhancement**: Migrated to httpOnly cookies with CSRF protection
- **Performance Optimization**: Reduced database calls by ~80% through query optimization
- **Memory Management**: Implemented custom React hooks for leak prevention
- **Race Condition Prevention**: Added atomic operations for critical paths

### Key Files to Reference
- **Core Philosophy**: `core_philosophy.md` - Essential for all user-facing features
- **Authentication**: `backend/middleware/csrf_protection.py` - CSRF implementation
- **Database**: `backend/database.py` - Proper client usage patterns
- **API Client**: `frontend/src/services/api.js` - httpOnly cookie authentication
- **Memory Safety**: `frontend/src/hooks/useMemoryLeakFix.js` - React optimization