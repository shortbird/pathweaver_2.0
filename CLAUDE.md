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

**SUBSCRIPTION TIERS:**
- Tiers are stored in the `subscription_tiers` database table and fetched dynamically via `/api/tiers`
- View current tier information and pricing at `/subscription` page (https://optio-dev-frontend.onrender.com/subscription)
- Tier data includes: display_name, tier_key, price_monthly, description, features[], limitations[], badge_text, badge_color, sort_order
- All tier information is managed through the admin panel, NOT hardcoded in code
- DO NOT hardcode tier names or prices - always fetch from database

**DEVELOPMENT WORKFLOW:**
- **Current Branch**: `develop` - All development happens here
- **Development**: Push to `develop` branch for immediate live testing on dev environment
- **Production**: Merge `develop` → `main` only when ready for production release
- **Branch Strategy**:
  - `develop` → https://optio-dev-frontend.onrender.com & https://optio-dev-backend.onrender.com
  - `main` → https://www.optioeducation.com & https://optio-prod-backend.onrender.com
- **Testing Process**:
  1. Make changes in `develop` branch
  2. Push to `develop` for live testing at dev URLs (auto-deploys immediately)
  3. Optionally run manual tests via GitHub Actions (see Testing Infrastructure below)
  4. When stable, merge `develop` → `main` for production
  5. Never commit directly to `main` - always go through `develop` first

**Testing Infrastructure (Optional - Manual Trigger Only):**
- **Strategy**: GitHub Actions with manual trigger + dedicated test_schema in Supabase
- **Cost**: $0 (uses separate schema in existing database, not a new project)
- **Coverage**: 40% minimum (current), targeting 60% over time
- **Critical Paths Covered**: Auth, Quest Completion, XP, Parent Dashboard, Badges
- **Key Point**: Tests are OPTIONAL - develop auto-deploys regardless of test status
- **How to Run**:
  1. Go to GitHub Actions → "Run Backend Tests (Manual)"
  2. Click "Run workflow" button
  3. Set coverage threshold (default 40%)
  4. Wait ~2 minutes for results
  5. Download coverage report from artifacts
- **Test Database**: Uses `test_schema` in existing Supabase database (complete isolation)
- **Documentation**: See `backend/docs/TESTING.md` for comprehensive guide
- **Workflow File**: `.github/workflows/run-tests.yml`
- **Test Structure**:
  ```
  backend/tests/
  ├── unit/              # Fast, mocked tests
  ├── integration/       # Real database tests (test_schema)
  ├── services/          # Service layer tests
  └── repositories/      # Repository pattern tests
  ```

**CORE PHILOSOPHY:**
- **Foundation**: "The Process Is The Goal" - learning is about who you become through the journey
- **Present-Focused Value**: Celebrate growth happening RIGHT NOW, not future potential
- **Internal Motivation**: Focus on how learning FEELS, not how it LOOKS
- **Process Celebration**: Every step, attempt, and mistake is valuable

**COLOR SYSTEM & GRADIENTS (CRITICAL):**
- **Optio Brand Colors** (defined in `tailwind.config.js`):
  - `optio-purple`: #6D469B (primary brand purple)
  - `optio-purple-dark`: #5A3A82 (hover states)
  - `optio-pink`: #EF597B (primary brand pink)
  - `optio-pink-dark`: #E73862 (hover states)
- **Standard Gradient**: `bg-gradient-to-r from-optio-purple to-optio-pink`
  - NEVER use Tailwind's default `purple-600` (#9333EA) or `pink-600` (#DB2777)
  - These are DIFFERENT colors and create visual inconsistency
- **Common Gradient Mistake**: Using `from-purple-600 to-pink-600` instead of Optio brand colors
- **Check Gradients**: Always verify buttons, headers, and avatar circles use Optio colors

**ADVISOR CHECK-IN SYSTEM (January 2025):**
- **Quest-Specific Notes**: Stored in `advisor_checkins.quest_notes` JSONB column
  - Structure: `[{ quest_id: 'uuid', notes: 'text' }, ...]`
  - Displayed in check-in history modal under each quest
  - Optional field in check-in form below each active quest
- **Check-in Components**:
  - `AdvisorCheckinPage.jsx` - Create new check-ins with quest notes
  - `CheckinHistoryModal.jsx` - View past check-ins (reusable in admin panel)
  - `CheckinAnalytics.jsx` - Dashboard analytics widget
- **Admin Access**: Admins can view all check-in logs via User Details Modal → Actions tab
- **Metrics Change**: Replaced "Badges Earned" with "Quests Completed" throughout advisor dashboard
  - Backend: `_get_bulk_student_quest_counts()` queries `user_quests` WHERE `completed_at IS NOT NULL`
  - Frontend: Displays `quest_count` instead of `badge_count`

**ADVISOR DASHBOARD STRUCTURE (January 2025):**
- **Two Tabs**: Overview (main student table) and Quests (quest creation)
- **Removed**: "Students" tab - consolidated into Overview tab
- **Overview Tab Shows**:
  - Stats cards: Total Students, Active Students, Quests Completed
  - Check-in Analytics widget
  - Full student table: Student (avatar/name/email), Total XP, Quests, Last Check-in, Actions
  - Action buttons: Check-in, History, Advisor Notes
- **All Students Displayed**: No 5-student limit - shows complete roster

**ADMIN PANEL USER MANAGEMENT:**
- **User Details Modal**: Three tabs (Profile, Role, Actions)
- **Actions Tab**: Chat Logs, Advisor Check-ins, Set Password, Verify Email, Delete Account
- **Button Text**: "Details" (not "Edit Details") for user detail access
- **Reusable Components**: Admin panel reuses CheckinHistoryModal from advisor components
- **Color Coding**: Each action has distinct color (purple=chat, blue=checkins, orange=password, teal=email, red=delete)

## Project Overview

Optio is an educational platform where students create self-validated diplomas through completing quests. Students build impressive portfolios by documenting their learning journey with public evidence.

## Tech Stack

**Backend:**
- Flask 3.0.0 + Supabase (PostgreSQL)
- JWT authentication (secure httpOnly cookies + CSRF protection)
- Gemini API for AI features (Model: **gemini-2.5-flash-lite** - ALWAYS use this model)
- LMS Integration (LTI 1.3, OAuth 2.0) for Canvas, Google Classroom, Schoology, Moodle
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

## Important Files

**CRITICAL - Python Dependencies:**
- **ROOT `requirements.txt`** - Used by Render for production deploys (THIS IS THE ONE THAT MATTERS!)
- `backend/requirements.txt` - Local development reference only (NOT used by Render)
- **ALWAYS update the ROOT requirements.txt when adding Python packages**

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
│   ├── collaborations.py    # Team-up invitations (ALL users)
│   ├── community.py         # Connections/friends system (ALL users)
│   ├── evidence_documents.py # Evidence file uploads
│   ├── portfolio.py         # Diploma/portfolio (CORE)
│   ├── promo.py             # Promo codes
│   ├── quests.py            # Quest system
│   ├── ratings.py           # Quest ratings & feedback
│   ├── settings.py          # User settings
│   ├── tasks.py             # Task completions
│   ├── tutor.py             # AI Tutor features
│   ├── lms_integration.py   # LMS integration (LTI, roster sync, grade passback)
│   └── uploads.py           # File upload handling
├── services/         # Business logic
│   ├── atomic_quest_service.py  # Race condition prevention
│   ├── badge_service.py         # Badge logic & progress tracking
│   ├── image_service.py         # Pexels API for quest & badge images
│   ├── lti_service.py           # LTI 1.3 integration service
│   ├── lms_sync_service.py      # LMS roster & grade sync
│   └── quest_optimization.py    # N+1 query elimination
├── config/           # Configuration
│   └── lms_platforms.py         # LMS platform configuration
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
│   ├── ConnectionsPage.jsx     # Connections/community features (ALL users) - NEW REDESIGN
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
│   │   ├── BadgeImageGenerator.jsx # Badge image generation
│   │   └── LMSIntegrationPanel.jsx # LMS integration admin panel
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
│   │   └── ParentDashboard.jsx  # Parent tutor monitoring dashboard
│   ├── parent/       # Parent dashboard components
│   │   ├── ParentLinking.jsx    # Student view: send parent invitations
│   │   └── ParentInvitationApproval.jsx # Parent view: accept/decline invitations
│   └── ui/           # Reusable UI components
├── hooks/            # Custom hooks
│   └── useMemoryLeakFix.js      # Memory leak prevention
└── services/
    ├── api.js        # Secure API client (httpOnly cookies)
    └── authService.js # Secure authentication service
```

## Database Schema (Current State)

**⚠️ CRITICAL - UPDATED January 2025 - Phase 1 Refactoring Complete**

**🚨 IMPORTANT TABLE NAME CHANGES:**
- ~~`quest_tasks`~~ table DOES NOT EXIST - it was renamed to `user_quest_tasks`
- Tasks are now **PERSONALIZED PER STUDENT** stored in `user_quest_tasks` table
- **ALWAYS use `user_quest_tasks`, NEVER `quest_tasks`** when querying task data
- **DO NOT** use Supabase relationship syntax like `.select('*, quest_tasks(*)')` - the relationship doesn't exist
- This is a **COMMON ERROR** - always verify table names with Supabase MCP before writing queries

### Core Tables

**users**
- id (UUID, PK, references auth.users)
- display_name, first_name, last_name, email
- role (student/parent/advisor/admin/observer) ← **UPDATED: observer role added**
- ~~subscription_tier~~ ← **REMOVED**
- ~~subscription_status~~ ← **REMOVED**
- ~~subscription_end_date~~ ← **REMOVED**
- ~~stripe_customer_id~~ ← **REMOVED**
- ~~stripe_subscription_id~~ ← **REMOVED**
- portfolio_slug, bio, avatar_url
- level, total_xp, achievements_count, streak_days
- tos_accepted_at, privacy_policy_accepted_at
- created_at, last_active

**quests**
- id (UUID, PK)
- title, description
- quest_type (optio/course) ← **Quest type distinguishes Optio-created vs course-based quests**
  - **optio**: Student-personalized quests created within Optio platform
  - **course**: Structured course quests (may or may not be linked to external LMS)
- lms_course_id, lms_assignment_id, lms_platform ← **LMS integration columns (optional)**
  - Present when course quest is linked to external LMS (e.g., Spark, Canvas)
  - Empty when course quest is Optio-only (no external LMS)
- image_url (auto-fetched from Pexels API)
- header_image_url (legacy, same as image_url)
- is_active
- created_at, updated_at
- Note: pillar and xp_value are legacy fields (now task-level)
- **NOTE**: Quests no longer have a direct relationship to tasks - tasks are per-user in `user_quest_tasks`

**user_quest_tasks** (🚨 RENAMED FROM quest_tasks - PERSONALIZED PER STUDENT)
- id (UUID, PK)
- user_id (UUID, FK to users) ← **CRITICAL: Tasks are now per-user**
- quest_id (UUID, FK to quests)
- user_quest_id (UUID, FK to user_quests)
- title, description
- pillar (stem, wellness, communication, civics, art) ← **UPDATED January 2025: Simplified to single-word names**
- xp_value (XP for completing this task)
- order_index, is_required
- is_manual (boolean - whether task was manually added by student/advisor)
- approval_status (text - for advisor approval workflow)
- diploma_subjects (JSONB - school subject mappings)
- subject_xp_distribution (JSONB - XP distribution across subjects)
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
- pillar_primary (stem, wellness, communication, civics, art) ← **UPDATED January 2025**
- min_quests, min_xp (requirements to earn badge)
- image_url (auto-fetched from Pexels API with teen-focused images)
- image_generated_at, image_generation_status
- is_active
- created_at, updated_at

### Community & Social Features

**friendships** (Connections system - available to ALL users)
- id (UUID, PK)
- requester_id, addressee_id (both FK to users)
- status (pending/accepted/rejected)
- created_at, updated_at
- Note: Updated via bypass function to avoid timestamp triggers

~~**quest_collaborations**~~ ← **REMOVED January 2025**
~~**task_collaborations**~~ ← **REMOVED January 2025**
~~**quest_ratings**~~ ← **REMOVED January 2025**
~~**subscription_tiers**~~ ← **REMOVED January 2025**
~~**subscription_requests**~~ ← **REMOVED January 2025**
~~**subscription_history**~~ ← **REMOVED January 2025**

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

### LMS Integration Tables (January 2025)

**lms_integrations** (User LMS connections)
- id (UUID, PK)
- user_id (FK to users)
- lms_platform (canvas/google_classroom/schoology/moodle)
- lms_user_id (LMS-specific user ID)
- lms_course_id (optional)
- sync_enabled (boolean)
- sync_status (active/paused/error)
- last_sync_at
- created_at, updated_at

**lms_sessions** (LTI session tracking)
- id (UUID, PK)
- user_id (FK to users)
- lms_platform
- session_token
- expires_at
- created_at

**lms_grade_sync** (Grade passback queue)
- id (UUID, PK)
- user_id (FK to users)
- quest_id (FK to quests)
- lms_platform
- lms_assignment_id
- score (numeric)
- max_score (default 100)
- sync_status (pending/completed/failed)
- sync_attempts (integer)
- error_message (text, nullable)
- synced_at (nullable)
- last_attempt_at (nullable)
- created_at

### Activity Tracking & Analytics Tables (SIMPLIFIED - January 2025)

**user_activity_events** (Single source of truth for all activity tracking)
- id (UUID, PK)
- user_id (UUID, FK to users, nullable) - NULL for anonymous tracking
- session_id (UUID, NOT NULL) - Session identifier from cookie
- event_type (varchar, NOT NULL) - Specific event (quest_started, task_completed, etc.)
- event_category (varchar, NOT NULL) - High-level category (quest, badge, tutor, auth, etc.)
- event_data (JSONB) - Event-specific metadata (quest_id, task_id, etc.)
- page_url (text) - URL where event occurred
- referrer_url (text) - Previous page URL
- user_agent (text) - Browser user agent string
- duration_ms (integer) - Request duration in milliseconds
- created_at (timestamptz) - Event timestamp
- Indexes: 6 indexes including GIN for JSONB queries, BRIN for time-series data
- RLS: Admins can view all (users cannot view own logs)

**Removed Tables (January 2025 Simplification):**
- ~~user_sessions~~ - Never populated (0 records)
- ~~page_view_analytics~~ - No aggregation job existed (0 records)
- ~~learning_journey_events~~ - Never used (0 records)
- ~~error_events~~ - Never implemented (0 records)
- ~~activity_log~~ - Legacy duplicate system (migrated to user_activity_events)

**Event Taxonomy (40+ Event Types):**
- **Authentication**: login_success, login_failed, logout, registration_success, registration_failed
- **Quests**: quest_started, quest_completed, quest_abandoned, quest_viewed, quest_progress_checked
- **Tasks**: task_completed, task_viewed
- **Badges**: badge_claimed, badge_viewed
- **Evidence**: evidence_uploaded
- **AI Tutor**: tutor_message_sent, tutor_conversation_started, tutor_opened
- **Community**: connection_request_sent, connection_accepted, connection_declined
- **Profile**: profile_viewed, profile_updated
- **Navigation**: dashboard_viewed, portfolio_viewed, page_view
- **Parent**: parent_dashboard_opened, parent_evidence_uploaded

## Key API Endpoints

**API Versioning Strategy** (Updated January 2025):
- **No URL versioning**: All endpoints use clean `/api/*` paths without version numbers
- **Branch-based deployment**: Version control through git branches (develop vs main)
- **Rationale**: Simpler URLs, easier maintenance, version control via deployment environments
- **Breaking changes**: Handled through careful migration and backward compatibility when possible

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

### Connections & Community Features (Available to ALL Users)
- GET /api/community/friends - List connections
- POST /api/community/friends/request - Send connection request
- PUT /api/community/friends/:id/accept - Accept connection request
- DELETE /api/community/friends/:id/decline - Decline connection request
- DELETE /api/community/friends/:id/cancel - Cancel sent connection request
~~- POST /api/collaborations/invite~~ ← **REMOVED January 2025**
~~- GET /api/collaborations/invites~~ ← **REMOVED January 2025**
~~- POST /api/collaborations/:id/accept~~ ← **REMOVED January 2025**
~~- POST /api/collaborations/:id/decline~~ ← **REMOVED January 2025**
~~- DELETE /api/collaborations/:id/cancel~~ ← **REMOVED January 2025**

### Admin API (Modular)
- **User Management**: /api/admin/users/* - User CRUD, roles, subscriptions
- **Quest Management**: /api/admin/quests/* - Quest CRUD operations
- **Quest Ideas**: /api/admin/quest-ideas/* - Quest suggestions workflow
- **Quest Sources**: /api/admin/quest-sources - Source management
- **Quest Images**: POST /api/admin/quests/:id/refresh-image - Refresh quest image from Pexels
- **Badge Images**: POST /api/badges/admin/:badge_id/refresh-image - Refresh badge image from Pexels
- **Badge Bulk Images**: POST /api/badges/admin/batch-generate-images - Generate images for multiple badges
- **Analytics**: GET /api/admin/analytics/* - Admin dashboard analytics
- **AI Tools**: /api/admin/ai-* - AI-powered admin features

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

### LMS Integration API (January 2025)
- POST /lti/launch - Handle LTI 1.3 launches from LMS (SSO authentication)
- GET /api/lms/platforms - List supported LMS platforms with config status (admin)
- POST /api/lms/sync/roster - Upload OneRoster CSV for bulk user import (admin)
- POST /api/lms/sync/assignments - Import LMS assignments as quests (admin)
- GET /api/lms/grade-sync/status - Monitor grade passback queue (admin)
- GET /api/lms/integration/status - Get user's LMS integration status

### Activity Tracking & Analytics API (SIMPLIFIED - January 2025)
- **Popular Content**: GET /api/analytics/popular-quests - Quest popularity metrics (admin only)
- **Event Counts**: GET /api/analytics/event-counts - Event totals by category (admin only)
- **Admin Dashboard Endpoints**:
  - GET /api/admin/analytics/overview - Key platform metrics
  - GET /api/admin/analytics/activity - Recent activity feed
  - GET /api/admin/analytics/trends - Historical trends (30 days)
  - GET /api/admin/analytics/user/:userId/activity - Individual user activity logs (NEW)
    - Query params: start_date, end_date, event_type, limit
    - Returns: Chronological list of events with page URLs, navigation flow, time on page

**Removed Endpoints (January 2025 Simplification):**
- ~~POST /api/analytics/activity/track~~ - Middleware handles tracking automatically
- ~~GET /api/analytics/engagement/:userId~~ - Unused engagement metrics
- ~~GET /api/analytics/at-risk-students~~ - Dropout prediction removed
- ~~GET /api/analytics/page-views~~ - Aggregation table didn't exist
- ~~GET /api/analytics/journey/:userId~~ - Learning journey table empty
- ~~GET /api/analytics/errors~~ - Error tracking table empty
- ~~GET /api/admin/analytics/health~~ - Health score feature removed

### Additional Features
- POST /api/uploads - File upload handling
- POST /api/evidence-documents - Upload evidence files
~~- POST /api/quest-ratings~~ ← **REMOVED January 2025**
~~- POST /api/subscriptions/create~~ ← **REMOVED January 2025**
- GET /api/health - Health check endpoint

## Key Features

### Quest System (Current Implementation)
- **Task-based structure**: Each quest contains multiple tasks with individual XP values
- **Per-task configuration**: Each task has its own pillar and XP value
- **Evidence submission**: Text, images, videos, documents via evidence_document_blocks table
- ~~**Completion bonus**: 50% XP bonus~~ ← **TO BE REMOVED in Phase 2**
- **Custom quests**: Students can submit quest ideas for admin approval
- **Race condition prevention**: Atomic quest completion with optimistic locking
- **Performance optimized**: N+1 query elimination reduces database calls by ~80%
- **Auto-generated images**: Quest images automatically fetched from Pexels API based on quest title
- **Quest sources**: Simplified to 'optio' (Optio-created) or 'lms' (LMS-integrated) ← **UPDATED January 2025**

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

### Parent Dashboard (NEW 2025)
- **Purpose**: Read-only dashboard for parents to support their learner's journey
- **Core Feature - Learning Rhythm Indicator**: Green/yellow light system showing student flow state
  - **Green (Flow)**: No overdue tasks AND progress in last 7 days
  - **Yellow (Needs Support)**: Overdue tasks OR no recent progress
  - Dynamic content box: Weekly Wins (green) or Conversation Starters (yellow)
- **Multi-child support**: Parents can switch between multiple linked students
- **Four main tabs**: Overview, Calendar, Insights, Communications
- **Key capabilities**:
  - View active quests with progress bars
  - See calendar with scheduled tasks and deadlines
  - Access learning insights (time patterns, pillar preferences, completion velocity)
  - Monitor AI tutor conversations (safety monitoring)
  - Upload evidence on behalf of students (requires student approval)
- **Process-focused language**: Aligned with "The Process Is The Goal" philosophy
- **Privacy-respecting**: Students must approve parent connection (2-step: invite + approval)
- **No revocation**: Once approved, parent access is permanent (by design)
- **Parents cannot start quests**: Only observe and upload evidence for active tasks
- **Database tables**:
  - `parent_student_links`: Active connections (no revoke status)
  - `parent_invitations`: Pending invitations with 48-hour expiry
  - `parent_evidence_uploads`: Parent-uploaded evidence (requires student approval)
- **Backend API endpoints**:
  - `/api/parents/my-children` - Get list of linked students
  - `/api/parents/my-links` - Get linked parents and pending invitations (student view)
  - `/api/parents/invite` - Send parent invitation (student)
  - `/api/parents/invitations/:id` - Cancel invitation (student)
  - `/api/parents/pending-invitations` - Get pending invitations (parent view)
  - `/api/parents/invitations/:id/approve` - Approve invitation (parent)
  - `/api/parents/invitations/:id/decline` - Decline invitation (parent)
  - `/api/parent/dashboard/:studentId` - Main dashboard data with learning rhythm
  - `/api/parent/calendar/:studentId` - Calendar view
  - `/api/parent/progress/:studentId` - XP breakdown by pillar
  - `/api/parent/insights/:studentId` - Time patterns and learning analytics
  - `/api/parent/evidence/:studentId` - Evidence upload
  - `/api/tutor/parent/conversations/:studentId` - AI tutor conversations (safety monitoring)
  - `/api/tutor/parent/conversations/:conversationId/messages` - Conversation messages
  - `/api/tutor/parent/safety-reports/:studentId` - Safety reports
  - `/api/tutor/parent/settings/:studentId` - Parent monitoring settings
- **Frontend implementation**:
  - **Main page**: `ParentDashboardPage.jsx` at `/parent/dashboard` or `/parent/dashboard/:studentId`
  - **Components**:
    - `ParentLinking.jsx` - Student view for sending parent invitations and managing connections
    - `ParentInvitationApproval.jsx` - Parent view for accepting/declining student invitations
    - `ParentDashboard.jsx` (tutor folder) - AI tutor monitoring dashboard
  - **API service**: `parentAPI` in `api.js` with all parent-related API methods
  - **Access control**: Routes protected with `<PrivateRoute requiredRole="parent" />`
  - **Design**: Poppins typography, purple/pink gradient accents, process-focused language
- **Encouragement tips**: Context-aware conversation starters for process-focused support

### Authentication & Security
- **httpOnly cookies ONLY**: JWT tokens stored EXCLUSIVELY in secure httpOnly cookies (never in localStorage)
- **CSRF protection**: Double-submit cookie pattern for state-changing requests
- **RLS enforcement**: Row Level Security via user-authenticated Supabase clients
- **Token refresh**: Automatic token renewal without user intervention
- **XSS prevention**: NO JavaScript-accessible token storage (Phase 1 security fix complete)
- **IMPORTANT**: Tokens are NEVER returned in API response bodies - only in httpOnly cookies
- **IMPORTANT**: Frontend NEVER stores tokens in localStorage - this was a critical XSS vulnerability (fixed January 2025)
- **Strong Password Policy** (Phase 1 Security Fix - January 2025):
  - Minimum 12 characters (increased from 6)
  - At least 1 uppercase letter (A-Z)
  - At least 1 lowercase letter (a-z)
  - At least 1 digit (0-9)
  - At least 1 special character (!@#$%^&*...)
  - Common password blacklist (100+ patterns blocked)
  - Interactive strength meter with real-time validation feedback
  - **Note**: Existing users with 6-char passwords are grandfathered in

### AI Tutor System
- **Conversational AI**: Interactive chat interface powered by Gemini API
- **Learning assistance**: Context-aware help with quest tasks and general learning
- **Parent dashboard**: Oversight tools for parents to monitor student progress
- **Conversation history**: Persistent chat sessions for continuity
- **Feedback system**: Quality assurance and improvement tracking

### Email System (Enhanced January 2025)
- **Architecture**: SendGrid SMTP integration with Jinja2 templating engine
- **Service layer**: `EmailService` class in `backend/services/email_service.py` extending `BaseService`
- **Copy management**: Centralized YAML configuration in `backend/templates/email/email_copy.yaml`
  - Single source of truth for all email content
  - Non-technical team members can edit copy
  - Variable substitution with `{variable_name}` syntax
- **Email types** (10 total):
  - Welcome email, Email confirmation, Quest completion, Password reset
  - Promo welcome, Consultation confirmation, Parental consent
  - Parent invitation, Subscription requests (user + admin), Service inquiry
- **Enhanced styling** (January 2025):
  - **Logo**: Optio logo image hosted on Supabase storage (`site-assets/email/optio-logo.png`)
  - **Gradients**: Purple (#6D469B) → Pink (#EF597B) gradient on header and buttons
  - **Outlook fallback**: Solid purple background for clients that don't support gradients
  - **Brand consistency**: All templates use consistent Optio brand colors
- **Template architecture**:
  - **Base template**: `base.html` with logo, gradient header, CTA buttons, footer
  - **Template inheritance**: 10 templates extend base.html for consistency
  - **Standalone**: `parent_invitation.html` (custom table-based layout)
  - **Signatures**: Reusable signature macros (team, tanner, support)
- **Styling constraints**:
  - **System fonts only**: Email clients block web fonts (Poppins not available)
  - **Inline CSS**: Email client compatibility requires inline styles
  - **Gradients**: Limited support (Outlook shows solid fallback)
  - **Images**: Hosted on Supabase storage for reliability
- **SMTP configuration**:
  - Host: `smtp.sendgrid.net:587`
  - Authentication: SendGrid API key
  - Sender: `support@optioeducation.com`
  - Auto-BCC: All emails BCC to support email
  - Click tracking: Disabled via X-SMTPAPI header
- **Email features**:
  - Dual-format: HTML + plain text fallback
  - Mobile-responsive: Optimized for all screen sizes
  - Accessibility: Proper alt text and semantic HTML
  - CC/BCC support: Flexible recipient management
- **File locations**:
  - Service: `backend/services/email_service.py`
  - Copy loader: `backend/services/email_copy_loader.py`
  - Templates: `backend/templates/email/*.html`
  - Copy config: `backend/templates/email/email_copy.yaml`
  - Upload script: `backend/scripts/upload_email_assets.py`
- **Asset hosting**:
  - Bucket: `site-assets` (public Supabase storage bucket)
  - Logo URL: `https://vvfgxcykxjybtvpfzwyx.supabase.co/storage/v1/object/public/site-assets/email/optio-logo.png`
  - Upload assets to this bucket for use in email templates

### LMS Integration (NEW - January 2025)
- **Multi-platform support**: Canvas, Google Classroom, Schoology, Moodle
- **LTI 1.3**: Standards-based integration with SSO for Canvas and Moodle
- **OAuth 2.0**: API integration for Google Classroom and Schoology
- **OneRoster CSV**: Bulk user import/sync with validation and error handling
- **Grade passback**: Queue-based grade sync to LMS gradebooks (LTI AGS)
- **Assignment import**: Convert LMS assignments to Optio quests
- **Admin panel**: Full-featured LMS integration dashboard with:
  - Platform configuration status with missing env var detection
  - Roster sync interface with real-time results
  - Grade sync monitoring (pending/completed/failed)
  - Link to comprehensive setup documentation
- **Supported features by platform**:
  - **Canvas**: LTI 1.3, SSO, roster sync, grade passback, deep linking
  - **Google Classroom**: OAuth 2.0, roster sync (manual CSV)
  - **Schoology**: OAuth 2.0, roster sync, grade passback
  - **Moodle**: LTI 1.3, SSO, roster sync, grade passback
- **Security**: JWT validation, JWKS fetching, role mapping, session management
- **Documentation**: Complete setup guides at `docs/LMS_INTEGRATION.md`
- **Frontend route**: `/admin/lms-integration` (admin only)

### Activity Tracking & Analytics System (SIMPLIFIED - January 2025)
**Focus**: Individual user activity logs + high-level platform trends (scope creep removed)

**Core Features**:
- **Automatic Tracking**: Middleware automatically logs 40+ event types (auth, quests, tasks, badges, etc.)
- **Individual User Activity Logs**: Admin can view detailed activity for any user
  - Accessible via Users tab → "Activity" button per user
  - Route: `/admin/user/:userId/activity`
  - Two views: Table (default) and Timeline
  - Shows: Page visits, time on page, navigation flow, event descriptions
  - Filters: Date range, event type, result limit
  - Component: `UserActivityLog.jsx` with both table and timeline views
- **Admin Dashboard**: High-level analytics at `/admin/analytics` with:
  - Platform metrics (active users, completions, XP, pending reviews)
  - Activity feed (recent quest completions, signups, badges)
  - Trend charts (user growth, quest completions, XP by pillar)
  - Auto-refresh every 5 minutes
- **Event Taxonomy**: 8 categories (auth, quest, badge, tutor, community, parent, navigation, other)
- **Performance Optimized**:
  - Async logging via ThreadPoolExecutor (non-blocking)
  - BRIN indexes for time-series queries
  - GIN indexes for JSONB event data
- **Backend Architecture**:
  - Middleware: `backend/middleware/activity_tracker.py` (Flask auto-tracking)
  - Service: `backend/services/analytics_service.py` (simplified - 2 methods only)
  - Routes: `backend/routes/analytics.py` (2 endpoints) & `backend/routes/admin/analytics.py` (5 endpoints)
  - User activity endpoint: `GET /api/admin/analytics/user/:userId/activity`

**What Was Removed (January 2025 Simplification)**:
- ~~Frontend tracking hook~~ - Middleware handles all tracking automatically
- ~~Health score & alerts~~ - Over-engineered for needs
- ~~Dropout prediction & risk scoring~~ - Unused complex algorithms
- ~~Session tracking table~~ - Never populated (0 records)
- ~~Page view analytics aggregation~~ - No aggregation job existed
- ~~Learning journey events~~ - Never used (0 records)
- ~~Error tracking table~~ - Never implemented (0 records)
- ~~Privacy anonymization scripts~~ - Unnecessary for student data
- ~~Manual event tracking endpoint~~ - Redundant with middleware

### Additional Features
- **Quest ratings**: 1-5 star rating system with optional feedback
- **Evidence documents**: File upload system for rich evidence submission
- **Promo codes**: Discount system for subscription management
- **Subscription tiers**: Explorer (free), Creator, Visionary with Stripe integration

### XP System & Skill Progression
- **XP Per Task**: Each task has individual XP value based on difficulty and pillar
- **Completion Bonus**: 50% bonus XP when completing all tasks in a quest (rounded to nearest 50)
- **Five Skill Pillars**: STEM, Wellness, Communication, Civics, Art ← **UPDATED January 2025: Simplified to single-word names (lowercase keys: stem, wellness, communication, civics, art)**
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
  - `PEXELS_API_KEY` (Quest image auto-generation)

- **LMS Integration (January 2025):**
  - Canvas LMS:
    - `CANVAS_CLIENT_ID` - Canvas Developer Key ID
    - `CANVAS_PLATFORM_URL` - Your institution's Canvas URL
  - Google Classroom:
    - `GOOGLE_CLIENT_ID` - Google Cloud OAuth client ID
    - `GOOGLE_CLIENT_SECRET` - Google Cloud OAuth client secret
  - Schoology:
    - `SCHOOLOGY_CLIENT_ID` - Schoology OAuth client ID
    - `SCHOOLOGY_CLIENT_SECRET` - Schoology OAuth client secret
  - Moodle:
    - `MOODLE_URL` - Your Moodle instance URL
    - `MOODLE_CLIENT_ID` - Moodle LTI client ID
  - Feature flags:
    - `ENABLE_LMS_SYNC` - Enable roster synchronization (default: true)
    - `ENABLE_GRADE_PASSBACK` - Enable grade passback to LMS (default: true)

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

project ID: vvfgxcykxjybtvpfzwyx

To configure Supabase MCP for read-only database access:

```bash
claude mcp add supabase npx -- -y @supabase/mcp-server-supabase@latest --access-token sbp_f2e031d2b3f3f524cd0ee9cc4e977ec7b7f240e3
```

This enables direct read-only SQL queries against the production database for debugging and analysis.

**CRITICAL: ALWAYS USE SUPABASE MCP TO CHECK SCHEMA BEFORE WRITING QUERIES**
- Before writing ANY database query, ALWAYS verify table/column names with Supabase MCP
- NEVER rely on documentation alone - the database is the source of truth and may have different table/column names
- Example: If documentation says `quest_tasks` but database has `user_quest_tasks`, the database wins

**EFFICIENT SCHEMA CHECKING (AVOID TOKEN LIMIT ERRORS):**
- **DO NOT USE** `mcp__supabase__list_tables` without filters - it returns ALL tables and exceeds token limits
- **ALWAYS USE** `mcp__supabase__execute_sql` with targeted queries instead:
  ```sql
  -- Check if specific table exists
  SELECT table_name FROM information_schema.tables
  WHERE table_schema = 'public' AND table_name = 'your_table_name';

  -- Get columns for a specific table
  SELECT column_name, data_type, is_nullable
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'your_table_name';

  -- Check foreign key relationships for a table
  SELECT
    tc.table_name,
    kcu.column_name,
    ccu.table_name AS foreign_table_name,
    ccu.column_name AS foreign_column_name
  FROM information_schema.table_constraints AS tc
  JOIN information_schema.key_column_usage AS kcu
    ON tc.constraint_name = kcu.constraint_name
  JOIN information_schema.constraint_column_usage AS ccu
    ON ccu.constraint_name = tc.constraint_name
  WHERE tc.constraint_type = 'FOREIGN KEY'
    AND tc.table_name = 'your_table_name';

  -- Search for tables matching a pattern (e.g., tables with 'activity' in name)
  SELECT table_name FROM information_schema.tables
  WHERE table_schema = 'public' AND table_name LIKE '%activity%';
  ```
- Use these SQL queries to efficiently check schema without hitting token limits
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

### Phase 1 Refactoring Complete (January 2025)
**Database Simplification - ALL MIGRATIONS EXECUTED:**
- ✅ **6 Tables Deleted**: quest_collaborations, task_collaborations, quest_ratings, subscription_tiers, subscription_requests, subscription_history
- ✅ **5 User Columns Removed**: subscription_tier, subscription_status, subscription_end_date, stripe_customer_id, stripe_subscription_id
- ✅ **Observer Role Added**: users.role now supports student/parent/admin/advisor/observer
- ✅ **Quest Sources Simplified**: All quests migrated to source='optio' (from khan_academy/brilliant/custom/ai_generated)
- ✅ **LMS Integration Columns**: Added lms_course_id, lms_assignment_id, lms_platform to quests table
- ✅ **Backup Schema Created**: All deleted data preserved in backup_schema for rollback safety

**Still Active (Phase 2 Pending):**
- ⚠️ Backend routes still exist: collaborations.py, ratings.py, tiers.py, subscription_requests.py (to be deleted)
- ⚠️ XP bonuses still active: 2x collaboration, 50% completion, 500 XP badge bonus (to be removed)
- ⚠️ @require_paid_tier decorator still active (to be removed)
- ⚠️ Connections page still shows "Team-up invitations" (frontend cleanup needed)

### Phase 3 Architecture Consolidation Complete (January 2025)
**Service Layer & Repository Pattern Implementation:**
- ✅ **29/29 Services Migrated**: All services now inherit from BaseService
  - Consistent error handling and retry logic
  - Standardized logging patterns
  - Proper RLS client management
  - Services: atomic_quest, badge, quest_ai, email, xp, image, lti, lms_sync, quest_optimization, tutor, and 19 others
- ✅ **6 New Repositories Created**:
  - `EvidenceRepository` - Evidence document uploads
  - `FriendshipRepository` - Connection/friendship management
  - `ParentRepository` - Parent-student linking
  - `TutorRepository` - AI tutor conversations and safety
  - `LMSRepository` - LMS integration and grade sync
  - `AnalyticsRepository` - Admin analytics and reporting
- ✅ **Repository Imports Added**: 39/50 route files now import repositories
- ✅ **Documentation Created**: `backend/docs/REPOSITORY_PATTERN.md` with usage examples
- ⚠️ **In Progress**: Full route refactoring to eliminate direct database access (imports added, logic migration ongoing)

### Key Files to Reference
- **Core Philosophy**: `core_philosophy.md` - Essential for all user-facing features
- **Authentication**: `backend/middleware/csrf_protection.py` - CSRF implementation
- **Database**: `backend/database.py` - Proper client usage patterns
- **API Client**: `frontend/src/services/api.js` - httpOnly cookie authentication
- **Memory Safety**: `frontend/src/hooks/useMemoryLeakFix.js` - React optimization