# Optio Platform - Complete Refactoring & Migration Plan

## Executive Summary
Comprehensive plan to refactor the Optio platform, fix persistent bugs, clean up legacy code, and establish a proper dev/production pipeline on Render while maintaining Supabase for database, auth, and storage.

---

## Phase 1: Bug Fixes & Data Model Updates
**Timeline: 3-4 days**

### 1.1 Update Tier System
- [ ] **Database Migration**
  - Create migration script to update `users` table:
    - Replace `explorer` → `free`
    - Replace `creator` → `supported`
    - Replace `visionary` → `academy`
  - Update any tier-related constraints or indexes

- [ ] **Backend Updates**
  ```
  backend/routes/stripe_routes.py
  backend/routes/users.py
  backend/services/subscription_service.py
  backend/config.py (update tier constants)
  ```
  - Find/replace all tier references
  - Update Stripe product mapping
  - Update tier validation logic

- [ ] **Frontend Updates**
  ```
  frontend/src/pages/PricingPage.jsx
  frontend/src/pages/ProfilePage.jsx
  frontend/src/pages/DashboardPage.jsx
  frontend/src/components/TierBadge.jsx (if exists)
  frontend/src/utils/constants.js
  ```
  - Update all UI references to new tier names
  - Update tier-related styling (Academy "ACCREDITED" badge)

### 1.2 Update Skill Pillars
- [ ] **Database Migration**
  - Create mapping for old → new pillars:
    - `critical_thinking` → `stem_logic`
    - `practical_skills` → `life_wellness`
    - `communication` → `language_communication`
    - `cultural_literacy` → `society_culture`
    - `creativity` → `arts_creativity`
  - Update `quest_tasks` table pillar values
  - Update `user_skill_xp` table pillar values

- [ ] **Backend Updates**
  ```
  backend/routes/quests_v3.py
  backend/routes/tasks.py
  backend/services/xp_service.py
  backend/utils/constants.py
  ```

- [ ] **Frontend Updates**
  ```
  frontend/src/pages/QuestHubV3Improved.jsx
  frontend/src/pages/DiplomaPageV3.jsx
  frontend/src/components/SkillRadarChart.jsx
  frontend/src/components/PillarIcon.jsx (if exists)
  ```

### 1.3 Fix Specific Bugs

#### Bug 1: Favicon Not Loading
- [ ] Update `frontend/index.html`:
  ```html
  <link rel="icon" type="image/jpeg" 
        href="https://vvfgxcykxjybtvpfzwyx.supabase.co/storage/v1/object/public/logos/icon.jpg">
  ```
- [ ] Add favicon fallback in `frontend/public/`

#### Bug 2: Dashboard Data Not Loading
- [ ] Debug `frontend/src/pages/DashboardPage.jsx`
  - Check API endpoint calls
  - Verify authentication headers
  - Add proper error handling
- [ ] Fix `backend/routes/dashboard.py`
  - Ensure proper data aggregation
  - Add logging for debugging

#### Bug 3: Diploma Data Not Loading
- [ ] Fix `backend/routes/portfolio.py`:
  - Check query joins
  - Verify XP calculation logic
  - Ensure proper data transformation
- [ ] Update `frontend/src/pages/DiplomaPageV3.jsx`:
  - Add loading states
  - Implement error boundaries
  - Check data mapping

#### Bug 4: Admin Analytics Error
- [ ] Fix `backend/routes/admin_v3.py`:
  - Debug analytics queries
  - Add proper error responses
- [ ] Update `frontend/src/pages/AdminPage.jsx`:
  - Add error handling for analytics
  - Implement retry logic

#### Bug 5: Page Refresh 404 Error
- [ ] Create `frontend/public/_redirects`:
  ```
  /* /index.html 200
  ```
- [ ] Update Render static site configuration:
  - Add rewrite rules for SPA routing

#### Bug 6: Quest Completion Status
- [ ] Fix `backend/services/quest_service.py`:
  ```python
  def check_quest_completion(user_id, quest_id):
      # Get all tasks for quest
      # Check if all required tasks completed
      # Update user_quests.completed_at if all done
  ```
- [ ] Add completion check trigger after task completion

#### Bug 7: Team-up Request Issue
- [ ] Fix `backend/routes/team_requests.py`:
  - Check for existing pending requests
  - Allow resending after rejection/expiry
- [ ] Update database constraints on `team_requests` table

#### Bug 8: Stripe Tier Update
- [ ] Fix `backend/routes/stripe_webhooks.py`:
  - Verify webhook signature
  - Check subscription update logic
  - Add logging for debugging
- [ ] Test with Stripe CLI locally

---

## Phase 2: Code Cleanup & Refactoring
**Timeline: 2-3 days**

### 2.1 Remove Legacy Code
- [ ] **Delete V2 Quest System Files**
  ```
  backend/routes/quests.py (if V2)
  backend/routes/quests_v2.py
  backend/services/quest_service_v2.py
  frontend/src/pages/QuestHub.jsx (if V2)
  frontend/src/pages/QuestHubV2.jsx
  ```

- [ ] **Remove Unused Deployment Configs**
  ```
  DELETE:
  - netlify.toml
  - vercel.json
  - railway.json
  - nixpacks.toml
  - Procfile (if not needed for Render)
  - .nvmrc (unless needed)
  - All .ps1 files (Windows scripts)
  - All .bat files
  ```

- [ ] **Clean Backend**
  ```
  backend/
  - Remove unused routes
  - Delete old migrations
  - Remove backup folders
  - Clean up unused utils
  ```

- [ ] **Clean Frontend**
  ```
  frontend/src/
  - Remove unused components
  - Delete old pages
  - Clean up unused assets
  ```

### 2.2 Update Dependencies
- [ ] **Backend (requirements.txt)**
  ```
  Flask==3.0.0
  flask-cors==4.0.0
  supabase==2.0.0
  stripe==7.0.0
  google-generativeai==0.3.0
  gunicorn==21.2.0
  python-dotenv==1.0.0
  # Remove OpenAI and unused packages
  ```

- [ ] **Frontend (package.json)**
  ```
  - Remove unused packages
  - Update to latest stable versions
  - Audit for security vulnerabilities
  ```

### 2.3 Standardize Code Structure
- [ ] **Backend Structure**
  ```
  backend/
  ├── app.py              # Main application
  ├── config.py           # Configuration
  ├── requirements.txt
  ├── routes/
  │   ├── __init__.py
  │   ├── auth.py
  │   ├── quests.py       # V3 only
  │   ├── tasks.py
  │   ├── portfolio.py
  │   ├── admin.py
  │   ├── stripe.py
  │   └── submissions.py
  ├── services/
  │   ├── __init__.py
  │   ├── quest_service.py
  │   ├── xp_service.py
  │   ├── ai_service.py   # Gemini only
  │   └── stripe_service.py
  ├── middleware/
  │   ├── __init__.py
  │   ├── auth.py
  │   └── rate_limit.py
  └── utils/
      ├── __init__.py
      ├── constants.py     # New tiers & pillars
      └── validators.py
  ```

- [ ] **Frontend Structure**
  ```
  frontend/
  ├── index.html
  ├── package.json
  ├── vite.config.js
  ├── public/
  │   ├── _redirects
  │   └── favicon.ico    # Fallback
  └── src/
      ├── main.jsx
      ├── App.jsx
      ├── pages/
      │   ├── Dashboard.jsx
      │   ├── QuestHub.jsx
      │   ├── Diploma.jsx
      │   ├── Admin.jsx
      │   └── Demo.jsx
      ├── components/
      │   ├── common/
      │   ├── quests/
      │   ├── diploma/
      │   └── admin/
      ├── services/
      │   ├── api.js
      │   └── auth.js
      └── utils/
          ├── constants.js
          └── helpers.js
  ```

---

## Phase 3: Supabase Reset & Schema Update
**Timeline: 1 day**

### 3.1 Backup Current Schema
- [ ] Export current schema structure (no data)
- [ ] Document any custom RLS policies
- [ ] Save any edge functions

### 3.2 Create New Schema
- [ ] **Updated Schema with Fixes**
  ```sql
  -- Users table with new tiers
  CREATE TABLE users (
    id UUID PRIMARY KEY REFERENCES auth.users,
    username TEXT UNIQUE NOT NULL,
    first_name TEXT,
    last_name TEXT,
    role TEXT CHECK (role IN ('student', 'parent', 'advisor', 'admin')),
    subscription_tier TEXT DEFAULT 'free' 
      CHECK (subscription_tier IN ('free', 'supported', 'academy')),
    stripe_customer_id TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
  );

  -- Quests table (V3 only)
  CREATE TABLE quests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL,
    description TEXT,
    source TEXT CHECK (source IN ('khan_academy', 'brilliant', 'custom')),
    is_active BOOLEAN DEFAULT true,
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
  );

  -- Quest tasks with new pillars
  CREATE TABLE quest_tasks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    quest_id UUID REFERENCES quests(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT,
    pillar TEXT CHECK (pillar IN (
      'stem_logic', 
      'life_wellness', 
      'language_communication', 
      'society_culture', 
      'arts_creativity'
    )),
    xp_value INTEGER DEFAULT 100,
    order_index INTEGER,
    is_required BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW()
  );

  -- Task completions
  CREATE TABLE quest_task_completions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id),
    quest_id UUID REFERENCES quests(id),
    task_id UUID REFERENCES quest_tasks(id),
    evidence_url TEXT,
    evidence_text TEXT,
    completed_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, task_id)
  );

  -- User skill XP with new pillars
  CREATE TABLE user_skill_xp (
    user_id UUID REFERENCES users(id),
    pillar TEXT CHECK (pillar IN (
      'stem_logic', 
      'life_wellness', 
      'language_communication', 
      'society_culture', 
      'arts_creativity'
    )),
    xp_amount INTEGER DEFAULT 0,
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (user_id, pillar)
  );

  -- User quests enrollment
  CREATE TABLE user_quests (
    user_id UUID REFERENCES users(id),
    quest_id UUID REFERENCES quests(id),
    is_active BOOLEAN DEFAULT true,
    started_at TIMESTAMPTZ DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    PRIMARY KEY (user_id, quest_id)
  );

  -- Quest submissions
  CREATE TABLE quest_submissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id),
    title TEXT NOT NULL,
    description TEXT,
    suggested_tasks JSONB,
    make_public BOOLEAN DEFAULT false,
    status TEXT DEFAULT 'pending' 
      CHECK (status IN ('pending', 'approved', 'rejected')),
    approved_quest_id UUID REFERENCES quests(id),
    admin_notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    reviewed_at TIMESTAMPTZ
  );

  -- Team requests with fix for multiple requests
  CREATE TABLE team_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sender_id UUID REFERENCES users(id),
    recipient_id UUID REFERENCES users(id),
    status TEXT DEFAULT 'pending' 
      CHECK (status IN ('pending', 'accepted', 'rejected', 'expired')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    responded_at TIMESTAMPTZ,
    UNIQUE(sender_id, recipient_id, status) 
      WHERE status = 'pending'  -- Only one pending request between users
  );

  -- Create indexes for performance
  CREATE INDEX idx_user_quests_user ON user_quests(user_id);
  CREATE INDEX idx_task_completions_user ON quest_task_completions(user_id);
  CREATE INDEX idx_quest_tasks_quest ON quest_tasks(quest_id);
  ```

### 3.3 Setup RLS Policies
- [ ] Configure Row Level Security for all tables
- [ ] Test policies with different user roles

### 3.4 Create Seed Data
- [ ] Create sample quests with new pillar system
- [ ] Add demo users for testing
- [ ] Include test data for each tier

---

## Phase 4: Render Setup & Deployment Pipeline
**Timeline: 2 days**

### 4.1 Render Configuration

#### Backend Service (render.yaml)
```yaml
services:
  # Production Backend
  - type: web
    name: optio-backend-prod
    env: python
    branch: main
    buildCommand: pip install -r requirements.txt
    startCommand: gunicorn app:app
    envVars:
      - key: FLASK_ENV
        value: production
      - key: SUPABASE_URL
        sync: false
      - key: SUPABASE_ANON_KEY
        sync: false
      - key: SUPABASE_SERVICE_KEY
        sync: false
      - key: STRIPE_SECRET_KEY
        sync: false
      - key: STRIPE_WEBHOOK_SECRET
        sync: false
      - key: GEMINI_API_KEY
        sync: false
      - key: FRONTEND_URL
        value: https://optio-frontend-prod.onrender.com

  # Dev Backend
  - type: web
    name: optio-backend-dev
    env: python
    branch: develop
    buildCommand: pip install -r requirements.txt
    startCommand: gunicorn app:app
    envVars:
      - key: FLASK_ENV
        value: development
      - key: SUPABASE_URL
        sync: false
      # Use different Supabase project for dev
      - key: FRONTEND_URL
        value: https://optio-frontend-dev.onrender.com

  # Production Frontend
  - type: static
    name: optio-frontend-prod
    buildCommand: npm install && npm run build
    staticPublishPath: ./dist
    branch: main
    routes:
      - type: rewrite
        source: /*
        destination: /index.html
    envVars:
      - key: VITE_API_URL
        value: https://optio-backend-prod.onrender.com
      - key: VITE_SUPABASE_URL
        sync: false
      - key: VITE_SUPABASE_ANON_KEY
        sync: false

  # Dev Frontend
  - type: static
    name: optio-frontend-dev
    buildCommand: npm install && npm run build
    staticPublishPath: ./dist
    branch: develop
    routes:
      - type: rewrite
        source: /*
        destination: /index.html
    envVars:
      - key: VITE_API_URL
        value: https://optio-backend-dev.onrender.com
```

### 4.2 Git Workflow Setup
- [ ] Create `develop` branch
- [ ] Setup branch protection rules:
  - `main`: Production (protected, requires PR)
  - `develop`: Development (auto-deploy)
- [ ] Configure GitHub Actions for testing

### 4.3 Environment Variables
- [ ] Production Supabase project (existing)
- [ ] Development Supabase project (new)
- [ ] Stripe test keys for dev
- [ ] Stripe live keys for production

---

## Phase 5: Testing & Validation
**Timeline: 2 days**

### 5.1 Functional Testing Checklist
- [ ] **Authentication**
  - [ ] Sign up with new account
  - [ ] Login/logout
  - [ ] Password reset
  - [ ] JWT token refresh

- [ ] **Quest System**
  - [ ] Browse quests
  - [ ] Start quest
  - [ ] Submit task evidence
  - [ ] Complete all tasks (verify completion status)
  - [ ] XP calculation correct
  - [ ] Abandon quest

- [ ] **Custom Quest Submission**
  - [ ] Submit custom quest
  - [ ] Admin approval workflow
  - [ ] Quest becomes available after approval

- [ ] **Diploma/Portfolio**
  - [ ] Public URL works
  - [ ] Data loads correctly
  - [ ] XP totals accurate
  - [ ] Radar chart displays
  - [ ] Evidence visible

- [ ] **Team Features**
  - [ ] Send team request
  - [ ] Resend request after rejection
  - [ ] Accept/reject requests
  - [ ] Team member visibility

- [ ] **Stripe Integration**
  - [ ] Purchase subscription
  - [ ] Tier updates correctly
  - [ ] Webhook processes
  - [ ] Cancel subscription

- [ ] **Admin Dashboard**
  - [ ] Analytics load
  - [ ] User management
  - [ ] Quest approval
  - [ ] System metrics

### 5.2 Performance Testing
- [ ] Page load times < 3s
- [ ] API response times < 500ms
- [ ] Database query optimization
- [ ] Image optimization

### 5.3 Cross-browser Testing
- [ ] Chrome
- [ ] Firefox
- [ ] Safari
- [ ] Edge
- [ ] Mobile responsive

---

## Phase 6: Migration Execution
**Timeline: 1 day**

### 6.1 Pre-Migration
- [ ] Full backup of current system
- [ ] Document current environment variables
- [ ] Notify users of maintenance window

### 6.2 Migration Steps
1. [ ] Deploy dev environment first
2. [ ] Run full test suite on dev
3. [ ] Fix any issues found
4. [ ] Deploy to production
5. [ ] Verify production functionality
6. [ ] Update DNS if needed

### 6.3 Post-Migration
- [ ] Monitor error logs
- [ ] Check performance metrics
- [ ] User acceptance testing
- [ ] Document any issues

---

## Phase 7: Documentation & Cleanup
**Timeline: 1 day**

### 7.1 Update Documentation
- [ ] Update CLAUDE.md with new structure
- [ ] Create deployment guide
- [ ] Document new tier/pillar system
- [ ] Update API documentation

### 7.2 Create Runbooks
- [ ] Deployment procedure
- [ ] Rollback procedure
- [ ] Common troubleshooting
- [ ] Database backup/restore

### 7.3 Final Cleanup
- [ ] Remove old deployment files
- [ ] Clean up unused branches
- [ ] Archive old repositories
- [ ] Update README.md

---

## Rollback Plan

If critical issues occur:

1. **Immediate Rollback** (< 1 hour)
   - Revert Render to previous deployment
   - Point DNS back to old infrastructure

2. **Partial Rollback** (< 4 hours)
   - Keep new infrastructure
   - Revert code to last working version
   - Restore database from backup

3. **Full Rollback** (< 1 day)
   - Restore complete old infrastructure
   - Restore database
   - Revert all code changes

---

## Success Criteria

- [ ] All bugs from list are resolved
- [ ] Dev/Prod pipeline working smoothly
- [ ] Page load times improved by 20%
- [ ] Zero critical bugs in production
- [ ] Clean codebase with no legacy code
- [ ] Comprehensive documentation
- [ ] Automated deployment working

---

## Risk Mitigation

| Risk | Mitigation |
|------|------------|
| Data loss | Full backups before migration |
| Downtime | Migrate during low-traffic hours |
| Stripe webhook issues | Test thoroughly in dev with Stripe CLI |
| Auth breaking | Keep Supabase, minimal changes |
| DNS issues | Keep old infrastructure ready |

---

- [ ] All bugs from list are resolved and tested
- [ ] Dev/Prod pipeline working with automated tests
- [ ] Test coverage > 80% across all codebases
- [ ] MCP integration working for both Render and Supabase
- [ ] Page load times improved by 20%
- [ ] Zero critical bugs in production
- [ ] Clean codebase with no legacy code
- [ ] Comprehensive documentation including test guides
- [ ] Automated deployment via GitHub branches
- [ ] All tier and pillar references updated

---

## Risk Mitigation (Updated)

| Risk | Mitigation |
|------|------------|
| Data loss | Full backups before migration, test database separate |
| Downtime | Migrate during low-traffic hours, test in dev first |
| Stripe webhook issues | Test thoroughly with Stripe CLI, unit tests for webhooks |
| Auth breaking | Keep Supabase, minimal changes, comprehensive auth tests |
| DNS issues | Keep old infrastructure ready |
| Test failures blocking deploy | Fix tests in dev before PR to main |
| MCP connection issues | Fallback to manual deployment procedures |

---

## Total Estimated Timeline: 14-17 days

- Phase 1: Bug Fixes (3-4 days)
- Phase 2: Cleanup (2-3 days)
- Phase 3: Supabase (1 day)
- Phase 4: MCP Setup (2 days)
- Phase 5: Testing Infrastructure (3-4 days)
- Phase 6: Render Setup (2 days)
- Phase 7: Testing & Validation (2 days)
- Phase 8: Migration (1 day)
- Phase 9: Documentation (1 day)

**Note**: Phases can overlap. Testing setup can begin while bug fixes are in progress. MCP can be configured alongside other work.