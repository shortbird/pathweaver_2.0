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

### Phase 4: Browser-Based Testing & Validation
**Status:** 🔴 Not Started
**Estimated Time:** 2-3 hours

**Testing Environment:** https://optio-dev-frontend.onrender.com (or production after deployment)

**Prerequisites:**
- Superadmin account credentials (your account)
- Access to Supabase dashboard for user/org verification

---

#### Test 1: Organization Creation & Management (Superadmin)

**Steps:**
1. Login as superadmin at https://optio-dev-frontend.onrender.com/login
2. Navigate to `/admin/organizations`
3. Click "Create Organization"
4. Fill in form:
   - Name: "Test Organization Alpha"
   - Slug: "test-org-alpha"
   - Policy: "All Optio Quests + Org Quests"
5. Submit and verify organization appears in list

**Expected Results:**
- [ ] Organizations page loads without errors
- [ ] Create modal opens and accepts input
- [ ] New organization appears in list after creation
- [ ] Organization card shows correct name, slug, and policy
- [ ] "Manage" link navigates to `/admin/organizations/{org_id}`

---

#### Test 2: Organization Dashboard - All Tabs (Superadmin)

**Steps:**
1. Click "Manage" on the test organization
2. Verify Overview tab shows:
   - Organization name, slug, policy, status
   - Three metric cards (Total Users, Quest Completions, Total XP)
3. Click "Users" tab - should show table with headers (Name, Email, Role, XP, Org Admin)
4. Click "Quests" tab - should show org-specific quests table
5. Click "Analytics" tab - should show metrics

**Expected Results:**
- [ ] All 5 tabs render without errors
- [ ] Overview tab displays organization details correctly
- [ ] Users tab shows table (may be empty for new org)
- [ ] Quests tab shows table (may be empty for new org)
- [ ] Analytics tab shows metrics (zeros for new org)
- [ ] Tab switching works smoothly

---

#### Test 3: Quest Curation (Curated Policy Only)

**Steps:**
1. Create a new organization with "Curated Quests + Org Quests" policy
2. Navigate to that organization's management page
3. Click "Quest Curation" tab (should only appear for curated orgs)
4. Click "Add Quest" button
5. Select a global quest from the dropdown
6. Submit and verify quest appears in curated list
7. Click "Remove" on the quest and verify it's removed

**Expected Results:**
- [ ] Quest Curation tab only appears for curated policy orgs
- [ ] Add Quest modal loads global quests (organization_id = NULL)
- [ ] Quest successfully added to curated library
- [ ] Quest appears in table with title, pillar, granted date
- [ ] Remove button successfully revokes access

---

#### Test 4: Quest Visibility - All Optio Policy

**Steps:**
1. In Supabase, create a test user assigned to "Test Organization Alpha" (all_optio policy)
2. Set is_org_admin = false, role = 'student'
3. Login as that test user
4. Navigate to `/quests`
5. Count total quests visible

**Expected Results:**
- [ ] User sees ALL global Optio quests (organization_id IS NULL)
- [ ] User sees any quests created by their organization
- [ ] Total quest count = (all global quests) + (org-specific quests)
- [ ] Quest filtering and search work normally

---

#### Test 5: Quest Visibility - Curated Policy

**Steps:**
1. In Supabase, create "Test Organization Beta" with curated policy
2. As superadmin, curate exactly 3 global quests for this org
3. Create a test user in this organization (is_org_admin = false)
4. Login as that test user
5. Navigate to `/quests`
6. Count visible quests

**Expected Results:**
- [ ] User sees ONLY the 3 curated global quests
- [ ] User sees any org-specific quests (if created)
- [ ] User does NOT see non-curated global quests
- [ ] Total quest count = 3 + (org-specific quests)

---

#### Test 6: Quest Visibility - Private Only Policy

**Steps:**
1. In Supabase, create "Test Organization Gamma" with private_only policy
2. Create test user in this organization
3. Login as that test user
4. Navigate to `/quests`

**Expected Results:**
- [ ] User sees ZERO global Optio quests
- [ ] User only sees quests where organization_id = their org ID
- [ ] Quest hub may appear empty (if no org quests exist)

---

#### Test 7: Organization Admin Access Control

**Steps:**
1. In Supabase, create user with is_org_admin = true in "Test Organization Alpha"
2. Login as that org admin user
3. Try to access `/admin/organizations` (superadmin only)
4. Navigate to their own org's management page
5. Try to access a different organization's management page

**Expected Results:**
- [ ] Org admin CANNOT access `/admin/organizations` (403 or redirect)
- [ ] Org admin CAN access their own org's dashboard
- [ ] Org admin CANNOT access other org's dashboards (403 error)
- [ ] All permitted tabs work correctly for org admin

---

#### Test 8: User Management & Analytics

**Steps:**
1. In Supabase, add 3-5 test users to "Test Organization Alpha"
2. Have these users complete some quests and earn XP
3. As superadmin, navigate to the org's management page
4. Check Users tab
5. Check Analytics tab

**Expected Results:**
- [ ] Users tab lists all organization members
- [ ] Each user shows correct display_name, email, role, total_xp
- [ ] Org admin flag displays correctly (Yes/No)
- [ ] Analytics shows accurate total_users count
- [ ] Analytics shows total_completions and total_xp aggregates

---

#### Test 9: Default Optio Organization Verification

**Steps:**
1. In Supabase, verify the default "Optio" organization exists
2. Check that existing users have organization_id = Optio org ID
3. Check that existing quests have organization_id = NULL (global)
4. Login as an existing Optio user
5. Verify quest access hasn't changed

**Expected Results:**
- [ ] Default "Optio" organization exists in database
- [ ] All pre-existing users assigned to Optio org
- [ ] All pre-existing quests remain global (NULL organization_id)
- [ ] Existing users can still access all quests (all_optio policy)
- [ ] No disruption to existing user experience

---

#### Test 10: Anonymous User Quest Visibility

**Steps:**
1. Open browser in incognito/private mode
2. Navigate to https://optio-dev-frontend.onrender.com/quests (without logging in)
3. Observe visible quests

**Expected Results:**
- [ ] Anonymous users see only global public quests (organization_id IS NULL)
- [ ] Anonymous users do NOT see organization-specific quests
- [ ] No authentication errors occur
- [ ] Quest listing loads successfully

---

#### Performance & Error Checks

**Monitor throughout all tests:**
- [ ] No JavaScript console errors
- [ ] All API requests complete in < 2 seconds
- [ ] Organization dashboard loads in < 1 second
- [ ] Quest curation actions respond immediately
- [ ] No network timeout errors
- [ ] Browser DevTools Network tab shows all 200/201 responses

---

#### Database Verification Queries (Supabase SQL Editor)

After completing tests, verify data integrity:

```sql
-- Verify all users have an organization
SELECT COUNT(*) FROM users WHERE organization_id IS NULL;
-- Should return 0

-- Check organization policies
SELECT name, slug, quest_visibility_policy FROM organizations;

-- Verify global quests remain global
SELECT COUNT(*) FROM quests WHERE organization_id IS NULL;
-- Should match total global Optio quests

-- Check curated quest access
SELECT o.name, COUNT(oqa.quest_id) as curated_count
FROM organizations o
LEFT JOIN organization_quest_access oqa ON o.id = oqa.organization_id
WHERE o.quest_visibility_policy = 'curated'
GROUP BY o.id, o.name;
```

---

#### Phase 4 Completion Checklist

- [ ] All 10 browser tests passed successfully
- [ ] Quest visibility works correctly for all three policies
- [ ] Organization creation and management UI functional
- [ ] Quest curation interface works for curated orgs
- [ ] Access control properly enforced (superadmin vs org admin)
- [ ] No console errors or broken UI elements
- [ ] Database verification queries return expected results
- [ ] Performance acceptable (<2s API calls, <1s page loads)
- [ ] Existing Optio users unaffected by migration

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
