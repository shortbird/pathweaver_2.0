# Multi-Organization Implementation Plan

**Status:** 🟡 Phase 3 Complete - Frontend Ready for Testing
**Created:** 2025-12-07
**Last Updated:** 2025-12-07
**Owner:** Tanner Bowman (Superadmin)

---

## Table of Contents
1. [Overview](#overview)
2. [Architecture Summary](#architecture-summary)
3. [Implementation Phases](#implementation-phases)
4. [Database Schema Changes](#database-schema-changes)
5. [Backend Changes](#backend-changes)
6. [Frontend Changes](#frontend-changes)
7. [Testing Strategy](#testing-strategy)
8. [Rollout Plan](#rollout-plan)
9. [Post-Launch Tasks](#post-launch-tasks)
10. [Cleanup Tasks](#cleanup-tasks)

---

## Overview

### Goal
Transform Optio from a single-tenant platform into a multi-organization platform where different organizations can have controlled access to Optio's quest library and create their own custom quests.

### Key Requirements (Answered Questions)
- ✅ **User-Org Relationship:** One organization per user, all data preserved on transfer
- ✅ **Quest Creation:** All users can create quests; user-created quests are global
- ✅ **Badge System:** Global badges + custom org badges (hybrid model)
- ✅ **XP & Progress:** Global XP tracking across platform
- ✅ **Achievement Ranks:** DEPRECATED - Remove all references to Explorer/Builder/Creator/Scholar/Sage
- ✅ **Social Features:** Global connections/friendships across organizations
- ✅ **Diploma Pages:** No organization branding, always public
- ✅ **Admin Levels:** Superadmin (platform) + Org Admin (per organization)
- ✅ **Visibility Policies:** 3 policies (all_optio, curated, private_only)
- ✅ **Org Creation:** Superadmin only
- ✅ **Analytics:** All analytics accessible to org admins
- ✅ **Billing:** Not implemented in platform
- ✅ **Migration:** All existing users/quests → "Optio" organization
- ✅ **LMS Integration:** Per-organization LMS connections (OnFire Learning uses SPARK)
- ✅ **AI Tutor:** Default tutor (no org-specific customization)

### Success Criteria
- [ ] Multiple organizations can operate independently on same platform
- [ ] Organizations can control quest visibility via policies
- [ ] Org admins can curate Optio quest library for their users
- [ ] All existing Optio users continue working without disruption
- [ ] OnFire Learning LMS integration continues to work
- [ ] Superadmin can manage all organizations from admin dashboard
- [ ] No achievement rank references remain in codebase

---

## Architecture Summary

### Organization Visibility Policies

**Policy 1: `all_optio` (Most Permissive)**
- Users see ALL global Optio quests (organization_id IS NULL)
- Users see ALL quests created by their organization (organization_id = their org)
- Use case: Organizations that want to supplement Optio's library

**Policy 2: `curated` (Selective)**
- Users see ONLY quests in `organization_quest_access` table
- Users see ALL quests created by their organization
- Use case: Organizations wanting tight content control

**Policy 3: `private_only` (Most Restrictive)**
- Users see ONLY quests created by their organization
- No global Optio quests visible
- Use case: Organizations with completely custom curriculum

### Data Model

```
organizations (NEW)
├── id (UUID, PK)
├── name (VARCHAR)
├── slug (VARCHAR, unique)
├── quest_visibility_policy (ENUM: all_optio, curated, private_only)
├── branding_config (JSONB) - Future: logo, colors
└── is_active (BOOLEAN)

users (MODIFIED)
├── organization_id (UUID, FK to organizations) - NEW
├── is_org_admin (BOOLEAN) - NEW
└── [existing columns...]

quests (MODIFIED)
├── organization_id (UUID, FK to organizations, NULLABLE) - NEW
│   └── NULL = global Optio quest
│   └── NOT NULL = organization-specific quest
└── [existing columns...]

organization_quest_access (NEW) - For 'curated' policy
├── id (UUID, PK)
├── organization_id (UUID, FK)
├── quest_id (UUID, FK)
└── granted_by (UUID, FK to users)

lms_integrations (MODIFIED)
├── organization_id (UUID, FK to organizations) - NEW
└── [existing columns...]
```

---

## Implementation Phases

### Phase 0: Cleanup & Preparation ✅
**Completed:** 2025-12-07 (1.5 hours) | **Commit:** `1b58368`

**Summary:** Removed achievement rank system (Explorer, Builder, Creator, Scholar, Sage) to simplify XP progression.

**Changes:**
- Removed `MASTERY_LEVELS`, `ACHIEVEMENT_TIERS`, and all rank calculation functions from [xp_progression.py](backend/config/xp_progression.py)
- Updated test files to remove tier progression validation
- Removed achievement rank messaging from [core_philosophy.md](core_philosophy.md)
- Students now earn pure cumulative XP without artificial levels

---

### Phase 1: Database Schema Migration ✅
**Completed:** 2025-12-07 (2 hours) | **Commit:** `89df8a8`

**Summary:** Created complete database foundation for multi-organization platform with 7 migrations.

**New Tables:**
- `organizations` - Core org table with 3 visibility policies (all_optio, curated, private_only)
- `organization_quest_access` - Curated quest selection per organization

**Modified Tables:**
- `users` - Added organization_id (FK, NOT NULL) and is_org_admin flag
- `quests` - Added organization_id (nullable, NULL = global quest)
- `lms_integrations` - Added organization_id (FK, NOT NULL)

**Key Features:**
- Created `quest_visible_to_user()` function implementing 3-policy visibility logic
- Updated RLS policies for organization-aware quest filtering
- All 49 existing users assigned to default "Optio" organization
- All 131 existing quests marked as global (visible to 'all_optio' orgs)
- Org admins can manage their organization's quests and curated library

**Migration Files:** [009-015](backend/database_migration/) applied via Supabase MCP

---

### Phase 2: Backend Repository & Service Layer
**Status:** 🟢 Complete
**Completed:** 2025-12-07 (3 hours) | **Commit:** `577f685`

**Summary:** Created complete backend infrastructure for multi-organization management with organization-aware quest filtering.

**Components Created:**
1. **OrganizationRepository** - CRUD operations, quest access management, organization analytics
2. **OrganizationService** - Business logic, policy validation, dashboard aggregation
3. **QuestRepository.get_quests_for_user()** - 3-policy visibility system (all_optio, curated, private_only)
4. **Auth Decorators** - @require_superadmin and @require_org_admin with organization context
5. **Organization Routes** - 8 API endpoints for superadmin/org admin operations
6. **Quest Filtering** - Authenticated users get org-aware filtering, anonymous users see global quests only
7. **Analytics RPC** - get_org_total_xp() database function

**API Endpoints:** `/api/admin/organizations/organizations` (list/create), `/organizations/<id>` (manage), `/organizations/<id>/quests/grant|revoke` (curation), `/organizations/<id>/users` (list users), `/organizations/<id>/analytics` (stats)

**Files Modified:** 9 files (4 created, 5 updated) | 896 insertions, 551 deletions

**Testing:** See [PHASE_2_TESTING.md](../../PHASE_2_TESTING.md) for browser-based testing instructions

---

### Phase 3: Frontend Implementation ✅
**Completed:** 2025-12-07 (2 hours) | **Commit:** `3f69557`

**Summary:** Created complete frontend UI for organization management with superadmin and org admin dashboards.

**Components Created:**
1. **OrganizationContext.jsx** - React context for organization state management
2. **OrganizationDashboard.jsx** - Superadmin organization list/create view
3. **OrganizationManagement.jsx** - Detailed org management with 5 tabs (Overview, Users, Quests, Curation, Analytics)

**Features:**
- Organization creation with policy selection (all_optio, curated, private_only)
- Quest curation interface for 'curated' policy organizations
- Organization analytics dashboard (users, completions, XP)
- User management table with org admin flags
- Quest library management with add/remove functionality

**Integration:**
- Added OrganizationProvider to [App.jsx](frontend/src/App.jsx)
- Added /admin/organizations routes to [AdminPage.jsx](frontend/src/pages/AdminPage.jsx)
- Added Organizations tab to admin navigation
- Quest filtering transparent to frontend (handled server-side)

**Files Modified:** 5 files | 627 insertions
- Created: OrganizationContext.jsx, OrganizationDashboard.jsx, OrganizationManagement.jsx
- Updated: App.jsx, AdminPage.jsx

---

### Phase 4: Testing & Validation
**Status:** 🔴 Not Started
**Estimated Time:** 4-6 hours

#### Task 4.1: Database Testing

**Test Cases:**
- [ ] Create new organization via SQL
- [ ] Assign user to organization
- [ ] Create organization-specific quest
- [ ] Grant quest access via organization_quest_access
- [ ] Test RLS policies with different user roles
- [ ] Test quest_visible_to_user() function with all three policies

**SQL Test Script:**
```sql
-- Create test organization
INSERT INTO organizations (name, slug, quest_visibility_policy)
VALUES ('Test Org', 'test-org', 'curated')
RETURNING *;

-- Create test user in that org
INSERT INTO users (email, display_name, organization_id, is_org_admin, role)
VALUES ('testuser@test.com', 'Test User', '<org_id>', false, 'student')
RETURNING *;

-- Test quest visibility function
SELECT quest_visible_to_user('<quest_id>'::UUID, '<user_id>'::UUID);

-- Verify RLS policies
SET ROLE authenticated;
SET request.jwt.claims.sub = '<user_id>';
SELECT * FROM quests WHERE is_active = true;
```

---

#### Task 4.2: Backend API Testing

**Test with cURL or Postman:**

```bash
# Create organization (superadmin)
curl -X POST http://localhost:5000/api/admin/organizations/organizations \
  -H "Content-Type: application/json" \
  -b cookies.txt \
  -d '{
    "name": "Test Organization",
    "slug": "test-org",
    "quest_visibility_policy": "curated"
  }'

# Get organization
curl -X GET http://localhost:5000/api/admin/organizations/organizations/<org_id> \
  -b cookies.txt

# Grant quest access
curl -X POST http://localhost:5000/api/admin/organizations/organizations/<org_id>/quests/grant \
  -H "Content-Type: application/json" \
  -b cookies.txt \
  -d '{"quest_id": "<quest_id>"}'

# List quests (should respect org policy)
curl -X GET http://localhost:5000/api/quests \
  -b cookies.txt
```

**Test Cases:**
- [ ] Create organization (superadmin only)
- [ ] Update organization policy (superadmin only)
- [ ] Grant quest access (org admin)
- [ ] Revoke quest access (org admin)
- [ ] List organization users (org admin)
- [ ] Get organization analytics (org admin)
- [ ] Quest listing respects organization policy
- [ ] Non-org-admin cannot access org admin routes
- [ ] Non-superadmin cannot create organizations

---

#### Task 4.3: Frontend Testing

**Manual Test Cases:**
- [ ] Superadmin can access /admin/organizations
- [ ] Superadmin can create new organization
- [ ] Org admin can access their organization's management page
- [ ] Org admin cannot access other organization's pages
- [ ] Curated policy: Org admin can add/remove quests from library
- [ ] All policy: Users see all global quests + org quests
- [ ] Curated policy: Users see only curated quests + org quests
- [ ] Private policy: Users see only org quests
- [ ] Quest hub filters work correctly
- [ ] Organization analytics display correctly

---

#### Task 4.4: Integration Testing

**Test Scenarios:**

**Scenario 1: New Organization with All Optio Policy**
1. Superadmin creates organization with policy=all_optio
2. Create new user in that organization
3. Login as that user
4. Verify user sees all global Optio quests + any org quests
5. Create a quest as that user
6. Verify quest is global (organization_id = NULL per requirements)

**Scenario 2: Curated Policy Organization**
1. Superadmin creates organization with policy=curated
2. Create org admin user in that organization
3. Login as org admin
4. Grant access to 3 specific global quests
5. Create 2 organization-specific quests
6. Create regular student user in same organization
7. Login as student
8. Verify student sees only the 3 curated quests + 2 org quests

**Scenario 3: Private Only Policy Organization**
1. Superadmin creates organization with policy=private_only
2. Create organization-specific quests
3. Create student user in that organization
4. Login as student
5. Verify student sees ONLY organization quests (no global quests)

**Scenario 4: OnFire Learning LMS Integration**
1. Verify OnFire Learning organization exists (or create it)
2. Assign OnFire users to OnFire organization
3. Verify SPARK LMS integration has organization_id set
4. Test course quest enrollment for OnFire users
5. Verify LMS webhook still works correctly

**Scenario 5: User Transfer Between Organizations**
1. Create user in Organization A
2. User completes quests, earns XP, earns badges
3. Superadmin changes user's organization_id to Organization B
4. Verify user keeps all XP, badges, quest completions
5. Verify user now sees Organization B's quest library

---

#### Task 4.5: Performance Testing

**Test Cases:**
- [ ] Quest listing with 100+ quests (check query performance)
- [ ] Organization with 500+ users (analytics performance)
- [ ] RLS policy enforcement doesn't cause N+1 queries
- [ ] Curated policy with 50+ curated quests performs well

**Performance Benchmarks:**
- Quest listing should load in < 500ms
- Organization analytics should load in < 1s
- RLS function should execute in < 50ms

---

#### Phase 4 Completion Checklist

- [ ] All database test cases passed
- [ ] All backend API test cases passed
- [ ] All frontend test cases passed
- [ ] All integration scenarios tested successfully
- [ ] Performance benchmarks met
- [ ] No RLS policy violations found
- [ ] Quest visibility working correctly for all three policies
- [ ] OnFire Learning LMS integration still working

---

### Phase 5: Rollout & Migration
**Status:** 🔴 Not Started
**Estimated Time:** 2-3 hours

#### Task 5.1: Prepare Production Migration

**Pre-Migration Checklist:**
- [ ] All Phase 0-4 tasks completed
- [ ] All tests passing
- [ ] Code reviewed
- [ ] Migrations tested in development
- [ ] Backup plan prepared

**Migration Files to Run (in order):**
1. 009_create_organizations_table.sql
2. 010_add_organization_to_users.sql
3. 011_add_organization_to_quests.sql
4. 012_create_organization_quest_access.sql
5. 013_add_organization_to_lms.sql
6. 014_update_quest_rls_policies.sql
7. 015_organization_triggers.sql

---

#### Task 5.2: Create OnFire Learning Organization

**Before Running Migration 013:**

```sql
-- Create OnFire Learning organization
INSERT INTO organizations (name, slug, quest_visibility_policy)
VALUES ('OnFire Learning', 'onfire', 'all_optio')
RETURNING *;

-- Note the ID for next step
```

**Update Migration 013:**
```sql
-- In migration 013, update OnFire LMS integration
UPDATE lms_integrations
SET organization_id = (SELECT id FROM organizations WHERE slug = 'onfire')
WHERE lms_type = 'spark';

-- Assign OnFire users to OnFire organization
-- (If you can identify them by email domain or other criteria)
UPDATE users
SET organization_id = (SELECT id FROM organizations WHERE slug = 'onfire')
WHERE email LIKE '%@onfirelearning.com%';
```

**Subtasks:**
- [ ] Create OnFire Learning organization
- [ ] Assign OnFire users to OnFire org
- [ ] Assign SPARK LMS integration to OnFire org
- [ ] Verify OnFire users can access their LMS quests

---

#### Task 5.3: Run Production Migrations

**Steps:**
1. [ ] Notify users of upcoming maintenance (if applicable)
2. [ ] Create database backup
3. [ ] Run migrations using Supabase MCP in sequence
4. [ ] Verify each migration succeeded before running next
5. [ ] Run verification queries after all migrations complete
6. [ ] Test critical flows (login, quest listing, enrollment)

**Verification Queries:**
```sql
-- Verify all users have organization
SELECT COUNT(*) FROM users WHERE organization_id IS NULL;
-- Should be 0

-- Verify organizations exist
SELECT * FROM organizations;
-- Should show Optio + OnFire Learning (at minimum)

-- Verify quest visibility function works
SELECT quest_visible_to_user(
  (SELECT id FROM quests WHERE is_active = true LIMIT 1),
  (SELECT id FROM users LIMIT 1)
);
-- Should return true/false

-- Verify RLS policies exist
SELECT policyname FROM pg_policies WHERE tablename = 'quests';
-- Should show new org-aware policies
```

---

#### Task 5.4: Deploy Backend Code

**Steps:**
1. [ ] Merge feature branch to `develop`
2. [ ] Auto-commit changes
3. [ ] Push to `develop` branch
4. [ ] Monitor Render deployment logs
5. [ ] Verify deployment succeeded
6. [ ] Check backend logs for errors
7. [ ] Test API endpoints in development environment

**Verification:**
```bash
# Test organizations endpoint
curl https://optio-dev-backend.onrender.com/api/admin/organizations/organizations \
  -b cookies.txt

# Test quest listing
curl https://optio-dev-backend.onrender.com/api/quests \
  -b cookies.txt
```

---

#### Task 5.5: Deploy Frontend Code

**Steps:**
1. [ ] Verify backend deployment succeeded first
2. [ ] Frontend auto-deploys when backend is done (same commit)
3. [ ] Monitor Render deployment logs for frontend
4. [ ] Verify frontend build succeeded
5. [ ] Visit https://optio-dev-frontend.onrender.com
6. [ ] Test organization management UI

**Verification:**
- [ ] Can access /admin/organizations (as superadmin)
- [ ] Can create new organization
- [ ] Can manage organization settings
- [ ] Quest hub shows correct quests based on policy

---

#### Task 5.6: Production Deployment (After Testing in Dev)

**Only after dev testing is complete:**

1. [ ] Merge `develop` to `main` branch
2. [ ] Monitor production deployment
3. [ ] Run smoke tests in production
4. [ ] Monitor error logs for 24 hours
5. [ ] Communicate with OnFire Learning about changes

**Production Verification:**
- [ ] OnFire Learning users can still access their quests
- [ ] SPARK LMS integration working
- [ ] Optio users can access global quest library
- [ ] No performance degradation
- [ ] No RLS policy errors in logs

---

#### Phase 5 Completion Checklist

- [ ] All migrations run successfully in production
- [ ] Default Optio organization created
- [ ] OnFire Learning organization created
- [ ] All users assigned to appropriate organizations
- [ ] Backend code deployed to develop and tested
- [ ] Frontend code deployed to develop and tested
- [ ] Production deployment successful
- [ ] OnFire Learning verified working
- [ ] No errors in production logs
- [ ] Rollback plan documented (if needed)

---

## Post-Launch Tasks

### Task PL.1: Documentation Updates
- [ ] Update API documentation with new organization endpoints
- [ ] Document organization admin workflows
- [ ] Create guide for creating new organizations
- [ ] Update developer onboarding docs
- [ ] Document organization policies for support team

### Task PL.2: Monitoring & Metrics
- [ ] Set up alerts for RLS policy violations
- [ ] Monitor quest visibility query performance
- [ ] Track organization creation rate
- [ ] Monitor organization analytics usage
- [ ] Set up dashboard for org metrics

### Task PL.3: User Communication
- [ ] Email OnFire Learning about multi-org changes
- [ ] Update help documentation
- [ ] Create FAQ for organization admins
- [ ] Prepare support responses for common questions

### Task PL.4: Future Enhancements
- [ ] Organization branding customization (logos, colors)
- [ ] Custom badges per organization
- [ ] Organization-specific AI tutor context
- [ ] Cross-organization collaboration features
- [ ] Organization analytics export

---

## Cleanup Tasks

### Cleanup.1: Remove Achievement Rank Code

**Status:** 🔴 Not Started (Part of Phase 0)

This is a prerequisite before starting Phase 1. See Phase 0 for complete checklist.

**Quick Summary:**
- [ ] Remove rank calculations from backend
- [ ] Remove rank displays from frontend
- [ ] Update documentation to remove rank messaging
- [ ] Test that XP system still works without ranks

### Cleanup.2: Remove Old Organization Endpoints

**File:** [backend/routes/admin/user_management.py](backend/routes/admin/user_management.py)

```python
# DELETE these routes (lines 777-867):
# - assign_user_to_organization()
# - get_organizations()
```

**Subtasks:**
- [ ] Delete deprecated organization endpoints in user_management.py
- [ ] Verify no code calls these endpoints
- [ ] Remove any frontend code that called these endpoints

### Cleanup.3: Code Review & Optimization

**Post-Launch Review:**
- [ ] Review all SQL queries for optimization opportunities
- [ ] Add database indexes if needed (org_id columns)
- [ ] Review RLS function performance
- [ ] Optimize quest filtering queries
- [ ] Remove any dead code
- [ ] Add missing error handling

---

## Rollback Plan

If critical issues occur during rollout:

### Rollback Steps

1. **Database Rollback:**
   ```sql
   -- Rollback migrations in reverse order
   BEGIN;

   -- Drop organization tables
   DROP TABLE IF EXISTS organization_quest_access CASCADE;
   DROP FUNCTION IF EXISTS quest_visible_to_user CASCADE;

   -- Remove organization columns
   ALTER TABLE users DROP COLUMN IF EXISTS organization_id CASCADE;
   ALTER TABLE users DROP COLUMN IF EXISTS is_org_admin CASCADE;
   ALTER TABLE quests DROP COLUMN IF EXISTS organization_id CASCADE;
   ALTER TABLE lms_integrations DROP COLUMN IF EXISTS organization_id CASCADE;

   -- Drop organizations table
   DROP TABLE IF EXISTS organizations CASCADE;

   -- Restore old RLS policies (from migration 008)
   -- (Copy policies from backup)

   COMMIT;
   ```

2. **Code Rollback:**
   - [ ] Revert develop branch to previous commit
   - [ ] Force push to Render
   - [ ] Monitor deployment
   - [ ] Verify old functionality restored

3. **Communication:**
   - [ ] Notify stakeholders of rollback
   - [ ] Document what went wrong
   - [ ] Plan fix and re-deployment

---

## Progress Tracking

### Overall Progress: 0%

**Phase 0 (Cleanup):** 🔴 0% (0/50 tasks)
**Phase 1 (Database):** 🔴 0% (0/20 tasks)
**Phase 2 (Backend):** 🔴 0% (0/25 tasks)
**Phase 3 (Frontend):** 🔴 0% (0/20 tasks)
**Phase 4 (Testing):** 🔴 0% (0/25 tasks)
**Phase 5 (Rollout):** 🔴 0% (0/15 tasks)

---

## Update Instructions

**After completing tasks, update this document:**

1. Check off completed tasks with `[x]`
2. Update phase status:
   - 🔴 Not Started (0%)
   - 🟡 In Progress (1-99%)
   - 🟢 Complete (100%)
3. Update overall progress percentage
4. Add notes about any deviations from plan
5. Document any issues encountered
6. Update "Last Updated" date at top
7. Commit changes to repository

**Example Update:**
```markdown
**Phase 0 (Cleanup):** 🟡 45% (23/50 tasks)

Notes:
- Achievement rank removal took longer than expected due to extensive frontend references
- Found additional rank references in CRM components
- Updated core_philosophy.md successfully
```

---

## Questions & Decisions Log

**Document key decisions here as implementation progresses:**

**Decision 1:** Existing quests global vs org-owned
- **Status:** PENDING
- **Options:** A) NULL (global) | B) Assign to Optio org
- **Recommendation:** Option A (global)
- **Decision:** TBD
- **Date:** 2025-01-07

**Decision 2:** User-created quests ownership
- **Status:** RESOLVED
- **Decision:** User-created quests are global (organization_id = NULL)
- **Rationale:** Per requirements, user quests are globally accessible
- **Date:** 2025-01-07

**Decision 3:** OnFire Learning organization setup
- **Status:** PENDING
- **Decision:** Create OnFire org before running migration 013
- **Date:** 2025-01-07

---

## Contact & Support

**Implementation Owner:** Tanner Bowman (tannerbowman@gmail.com)
**Technical Questions:** Claude Code (this agent)
**Documentation:** [backend/docs/MULTI_ORG_IMPLEMENTATION.md](backend/docs/MULTI_ORG_IMPLEMENTATION.md)

---

**End of Implementation Plan**
