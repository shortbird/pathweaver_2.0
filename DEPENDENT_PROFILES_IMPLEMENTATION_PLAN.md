# Dependent Profiles Implementation Plan
## Approach 1: Enable Parents to Manage Young Children (Under 13)

**Last Updated:** January 12, 2025
**Status:** Planning Phase
**Estimated Timeline:** 4 weeks

---

## Overview

Enable parents to create and manage "dependent" child profiles (ages 5-12) within their parent account. Parents act on behalf of dependents without requiring separate login credentials. When dependents reach age 13, they can be promoted to independent accounts.

### Business Problem Solved
- Parents with young children (5-12) can track learning without creating separate accounts
- COPPA compliance (no email/password for children under 13)
- Seamless transition to independent accounts when children turn 13
- Unified family learning management

---

## Implementation Checklist

### Phase 1: Database Schema Changes ⬜

#### 1.1 Modify `users` Table ⬜
- [ ] Create migration file: `add_dependent_profile_support.sql`
- [ ] Add `is_dependent BOOLEAN DEFAULT FALSE` column
- [ ] Add `managed_by_parent_id UUID REFERENCES users(id)` column
- [ ] Add `promotion_eligible_at DATE` column (auto-calculated: DOB + 13 years)
- [ ] Create index: `idx_users_managed_by_parent`
- [ ] Create index: `idx_users_is_dependent`
- [ ] Add constraint: `check_dependent_has_parent`
- [ ] Add constraint: `check_dependent_no_email` (optional for COPPA compliance)
- [ ] Test migration on local database
- [ ] Test migration on dev database

**SQL Migration:**
```sql
-- Migration: add_dependent_profile_support.sql

-- Add dependent profile columns
ALTER TABLE users
  ADD COLUMN is_dependent BOOLEAN DEFAULT FALSE,
  ADD COLUMN managed_by_parent_id UUID REFERENCES users(id) ON DELETE CASCADE,
  ADD COLUMN promotion_eligible_at DATE;

-- Add indexes for fast lookups
CREATE INDEX idx_users_managed_by_parent ON users(managed_by_parent_id) WHERE managed_by_parent_id IS NOT NULL;
CREATE INDEX idx_users_is_dependent ON users(is_dependent) WHERE is_dependent = TRUE;

-- Add constraint: dependent accounts must have managed_by_parent_id
ALTER TABLE users ADD CONSTRAINT check_dependent_has_parent
  CHECK (
    (is_dependent = FALSE) OR
    (is_dependent = TRUE AND managed_by_parent_id IS NOT NULL)
  );

-- Add constraint: dependent accounts cannot have email (COPPA compliance)
ALTER TABLE users ADD CONSTRAINT check_dependent_no_email
  CHECK (
    (is_dependent = FALSE) OR
    (is_dependent = TRUE AND email IS NULL)
  );
```

#### 1.2 Add RLS Policies ⬜
- [ ] Create migration file: `dependent_profile_rls_policies.sql`
- [ ] Create policy: `parent_view_dependents` (SELECT)
- [ ] Create policy: `parent_create_dependents` (INSERT)
- [ ] Create policy: `parent_update_dependents` (UPDATE)
- [ ] Create policy: `parent_delete_dependents` (DELETE)
- [ ] Test RLS policies with test data

**SQL Migration:**
```sql
-- Migration: dependent_profile_rls_policies.sql

-- Parents can view their dependent children
CREATE POLICY parent_view_dependents ON users
  FOR SELECT
  USING (
    managed_by_parent_id = auth.uid()
  );

-- Parents can insert dependent children
CREATE POLICY parent_create_dependents ON users
  FOR INSERT
  WITH CHECK (
    is_dependent = TRUE AND
    managed_by_parent_id = auth.uid()
  );

-- Parents can update their dependent children
CREATE POLICY parent_update_dependents ON users
  FOR UPDATE
  USING (managed_by_parent_id = auth.uid())
  WITH CHECK (managed_by_parent_id = auth.uid());

-- Parents can delete their dependent children
CREATE POLICY parent_delete_dependents ON users
  FOR DELETE
  USING (managed_by_parent_id = auth.uid());
```

#### 1.3 Create Database Functions ⬜
- [ ] Create function: `calculate_promotion_eligible_date(dob DATE)`
- [ ] Create function: `is_promotion_eligible(user_id UUID)`
- [ ] Create function: `get_parent_dependents(p_parent_id UUID)`
- [ ] Test all database functions with sample data

**SQL Migration:**
```sql
-- Function: Calculate promotion eligibility date
CREATE OR REPLACE FUNCTION calculate_promotion_eligible_date(dob DATE)
RETURNS DATE AS $$
BEGIN
  RETURN dob + INTERVAL '13 years';
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Function: Check if dependent is eligible for promotion
CREATE OR REPLACE FUNCTION is_promotion_eligible(user_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
  eligible_date DATE;
BEGIN
  SELECT promotion_eligible_at INTO eligible_date
  FROM users
  WHERE id = user_id AND is_dependent = TRUE;

  RETURN eligible_date <= CURRENT_DATE;
END;
$$ LANGUAGE plpgsql;

-- Function: Get parent's dependents with metadata
CREATE OR REPLACE FUNCTION get_parent_dependents(p_parent_id UUID)
RETURNS TABLE(
  dependent_id UUID,
  dependent_name VARCHAR,
  date_of_birth DATE,
  avatar_url TEXT,
  promotion_eligible BOOLEAN,
  total_xp INTEGER,
  active_quest_count INTEGER
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    u.id,
    u.display_name,
    u.date_of_birth,
    u.avatar_url,
    (u.promotion_eligible_at <= CURRENT_DATE) AS promotion_eligible,
    u.total_xp,
    COUNT(DISTINCT uq.quest_id)::INTEGER AS active_quest_count
  FROM users u
  LEFT JOIN user_quests uq ON u.id = uq.user_id AND uq.is_active = TRUE AND uq.completed_at IS NULL
  WHERE u.managed_by_parent_id = p_parent_id
    AND u.is_dependent = TRUE
  GROUP BY u.id, u.display_name, u.date_of_birth, u.avatar_url, u.promotion_eligible_at, u.total_xp
  ORDER BY u.date_of_birth DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

---

### Phase 2: Backend Implementation ⬜

#### 2.1 Create DependentRepository ⬜
- [ ] Create file: `backend/repositories/dependent_repository.py`
- [ ] Implement `__init__(self, client)`
- [ ] Implement `create_dependent(parent_id, display_name, date_of_birth, avatar_url)`
  - [ ] Validate parent has parent role
  - [ ] Validate child is under 13
  - [ ] Calculate promotion_eligible_at
  - [ ] Insert dependent user record
- [ ] Implement `get_parent_dependents(parent_id)`
- [ ] Implement `get_dependent(dependent_id, parent_id)` with auth check
- [ ] Implement `update_dependent(dependent_id, parent_id, updates)`
  - [ ] Filter allowed fields
  - [ ] Recalculate promotion_eligible_at if DOB changed
- [ ] Implement `delete_dependent(dependent_id, parent_id)`
- [ ] Implement `promote_dependent_to_independent(dependent_id, parent_id, email, password)`
  - [ ] Check promotion eligibility
  - [ ] Integrate with Supabase Auth API for password
- [ ] Write unit tests for all methods
- [ ] Test with real Supabase dev instance

**File Location:** `backend/repositories/dependent_repository.py`

#### 2.2 Create API Routes ⬜
- [ ] Create file: `backend/routes/dependents.py`
- [ ] Create blueprint: `dependents` with prefix `/api/dependents`
- [ ] Implement `GET /my-dependents` - Get all dependents for logged-in parent
- [ ] Implement `POST /create` - Create new dependent
  - [ ] Validate required fields: display_name, date_of_birth
  - [ ] Handle ValidationError for age > 13
- [ ] Implement `GET /<dependent_id>` - Get specific dependent
- [ ] Implement `PUT /<dependent_id>` - Update dependent profile
- [ ] Implement `DELETE /<dependent_id>` - Delete dependent
- [ ] Implement `POST /<dependent_id>/promote` - Promote to independent account
  - [ ] Require email and password
  - [ ] Check promotion eligibility
- [ ] Add comprehensive error handling
- [ ] Write API integration tests
- [ ] Test all endpoints with Postman/curl

**File Location:** `backend/routes/dependents.py`

#### 2.3 Register Blueprint ⬜
- [ ] Open `backend/app.py`
- [ ] Import: `from backend.routes import dependents`
- [ ] Register: `app.register_blueprint(dependents.bp)`
- [ ] Test that routes are accessible
- [ ] Verify in Render dev logs that blueprint loaded

---

### Phase 3: Frontend Implementation ⬜

#### 3.1 Create Dependent API Service ⬜
- [ ] Create file: `frontend/src/services/dependentAPI.js`
- [ ] Implement `getMyDependents()`
- [ ] Implement `createDependent(dependentData)`
- [ ] Implement `getDependent(dependentId)`
- [ ] Implement `updateDependent(dependentId, updates)`
- [ ] Implement `deleteDependent(dependentId)`
- [ ] Implement `promoteDependent(dependentId, credentials)`
- [ ] Test all API calls against dev backend

**File Location:** `frontend/src/services/dependentAPI.js`

#### 3.2 Create ProfileSwitcher Component ⬜
- [ ] Create file: `frontend/src/components/parent/ProfileSwitcher.jsx`
- [ ] Load dependents on component mount
- [ ] Build profiles array: [parent, ...dependents]
- [ ] Display current profile with dropdown toggle
- [ ] Implement profile selection handler
- [ ] Show age for dependent profiles
- [ ] Add "Add Child Profile" button in dropdown
- [ ] Style with Optio brand colors (optio-purple/optio-pink)
- [ ] Add responsive styles for mobile
- [ ] Test dropdown functionality
- [ ] Test profile switching

**File Location:** `frontend/src/components/parent/ProfileSwitcher.jsx`

**Key Features:**
- Dropdown with "Acting as: [Name]"
- Shows age for dependents
- "Add Child Profile" button
- Profile icons/avatars

#### 3.3 Create AddDependentModal ⬜
- [ ] Create file: `frontend/src/components/parent/AddDependentModal.jsx`
- [ ] Add form fields: display_name, date_of_birth, avatar_url
- [ ] Implement form validation
  - [ ] Require display_name
  - [ ] Require date_of_birth
  - [ ] Validate child is under 13 (client-side)
- [ ] Implement form submission
  - [ ] Call `dependentAPI.createDependent()`
  - [ ] Show loading state
  - [ ] Handle errors with toast notifications
- [ ] Add COPPA/age explanation text
- [ ] Style modal with Optio branding
- [ ] Test form submission
- [ ] Test error handling
- [ ] Test validation

**File Location:** `frontend/src/components/parent/AddDependentModal.jsx`

**Key Features:**
- Clean modal design
- Age validation warning
- COPPA compliance notice

#### 3.4 Update ParentDashboardPage ⬜
- [ ] Open `frontend/src/pages/ParentDashboardPage.jsx`
- [ ] Import `ProfileSwitcher` component
- [ ] Import `AddDependentModal` component
- [ ] Add state: `currentProfile`
- [ ] Add state: `showAddDependentModal`
- [ ] Add ProfileSwitcher to header (around line 340)
- [ ] Implement `onProfileChange` handler
  - [ ] Update `currentProfile` state
  - [ ] If dependent: set `selectedStudentId` to dependent ID
  - [ ] If parent: show first linked child or empty state
- [ ] Add AddDependentModal at bottom of component
- [ ] Handle `onDependentAdded` callback (refresh dependents list)
- [ ] Test profile switching in dashboard
- [ ] Test adding new dependent
- [ ] Verify dashboard loads dependent's data correctly

**File Location:** `frontend/src/pages/ParentDashboardPage.jsx`

#### 3.5 Create Dependent Management Page (Optional) ⬜
- [ ] Create file: `frontend/src/pages/ParentDependentsPage.jsx`
- [ ] Display all dependents in card grid
- [ ] Show promotion eligibility status
- [ ] Add "Edit Profile" button for each dependent
- [ ] Add "Promote to Independent Account" button (if eligible)
- [ ] Implement edit dependent modal
- [ ] Implement promote dependent modal
- [ ] Add confirmation dialogs for delete
- [ ] Test all CRUD operations
- [ ] Add to routing: `/parent/dependents`

**File Location:** `frontend/src/pages/ParentDependentsPage.jsx` (optional enhancement)

---

### Phase 4: Quest System Integration ⬜

#### 4.1 Modify Quest Routes ⬜
- [ ] Open `backend/routes/quests.py`
- [ ] Modify `POST /<quest_id>/start` endpoint
  - [ ] Accept `acting_as_dependent_id` in request body
  - [ ] If provided, verify parent owns dependent
  - [ ] Use `effective_user_id` for quest enrollment
- [ ] Add same pattern to other quest endpoints as needed
- [ ] Test quest start as dependent
- [ ] Test quest completion as dependent

**Files to Modify:**
- `backend/routes/quests.py`
- `backend/routes/tasks.py`
- `backend/routes/quest_lifecycle.py`

**Pattern to Apply:**
```python
# Extract acting_as_dependent_id from request
data = request.get_json() or {}
acting_as_dependent_id = data.get('acting_as_dependent_id')

# If acting as dependent, verify ownership
effective_user_id = user_id
if acting_as_dependent_id:
    supabase = get_supabase_admin_client()
    dependent_repo = DependentRepository(client=supabase)
    dependent_repo.get_dependent(acting_as_dependent_id, user_id)  # Raises PermissionError if not authorized
    effective_user_id = acting_as_dependent_id

# Use effective_user_id for all operations
```

#### 4.2 Modify Task Completion Routes ⬜
- [ ] Open `backend/routes/tasks.py`
- [ ] Modify `POST /tasks/<task_id>/complete` endpoint
  - [ ] Accept `acting_as_dependent_id` in request body
  - [ ] Verify parent owns dependent
  - [ ] Complete task under dependent's user_id
- [ ] Test task completion as dependent
- [ ] Verify XP awarded to dependent, not parent

#### 4.3 Modify Evidence Upload Routes ⬜
- [ ] Open `backend/routes/parent_evidence.py` or evidence routes
- [ ] Modify evidence upload endpoints
  - [ ] Accept `acting_as_dependent_id` in request body
  - [ ] Allow parent to upload evidence directly for dependent (no approval needed)
- [ ] Test evidence upload as dependent
- [ ] Verify evidence shows in dependent's portfolio

#### 4.4 Update Frontend Quest Components ⬜
- [ ] Open `frontend/src/pages/QuestBadgeHub.jsx`
- [ ] Add `acting_as_dependent_id` to quest start API calls (if profile is dependent)
- [ ] Open task completion components
- [ ] Add `acting_as_dependent_id` to task completion API calls
- [ ] Test full quest flow as dependent
- [ ] Verify XP and progress tracked under dependent

---

### Phase 5: Testing & Validation ⬜

#### 5.1 Backend Unit Tests ⬜
- [ ] Create file: `backend/tests/test_dependents.py`
- [ ] Test: `test_create_dependent_under_13` - Success case
- [ ] Test: `test_create_dependent_over_13_fails` - Validation error
- [ ] Test: `test_get_parent_dependents` - Returns all dependents
- [ ] Test: `test_update_dependent` - Updates allowed fields
- [ ] Test: `test_delete_dependent` - Soft/hard delete
- [ ] Test: `test_promote_dependent` - Promotion success
- [ ] Test: `test_promote_dependent_not_eligible` - Age validation
- [ ] Test: `test_unauthorized_access` - PermissionError for wrong parent
- [ ] Run all tests: `pytest backend/tests/test_dependents.py`
- [ ] Verify 100% code coverage for DependentRepository

#### 5.2 Backend Integration Tests ⬜
- [ ] Test: Create dependent via API endpoint
- [ ] Test: Get dependents via API endpoint
- [ ] Test: Update dependent via API endpoint
- [ ] Test: Delete dependent via API endpoint
- [ ] Test: Promote dependent via API endpoint
- [ ] Test: Start quest as dependent (with `acting_as_dependent_id`)
- [ ] Test: Complete task as dependent
- [ ] Test: Upload evidence as dependent
- [ ] Run integration tests against dev Supabase

#### 5.3 Frontend Component Tests ⬜
- [ ] Test: ProfileSwitcher renders correctly
- [ ] Test: ProfileSwitcher loads dependents
- [ ] Test: Profile switching triggers callback
- [ ] Test: AddDependentModal form submission
- [ ] Test: AddDependentModal validation
- [ ] Test: AddDependentModal error handling
- [ ] Run frontend tests: `npm test`

#### 5.4 End-to-End Testing ⬜
- [ ] Manual Test: Parent creates dependent profile
- [ ] Manual Test: Parent switches to dependent context
- [ ] Manual Test: Parent starts quest as dependent
- [ ] Manual Test: Parent completes tasks as dependent
- [ ] Manual Test: Parent uploads evidence as dependent
- [ ] Manual Test: Verify dependent's XP increases
- [ ] Manual Test: Verify dependent appears in parent dashboard
- [ ] Manual Test: Promote dependent to independent account (age 13+)
- [ ] Manual Test: Verify promoted account can log in independently
- [ ] Record test scenarios and results

#### 5.5 Edge Cases & Error Handling ⬜
- [ ] Test: Parent tries to create dependent over 13 (should fail)
- [ ] Test: Parent tries to access another parent's dependent (should fail)
- [ ] Test: Non-parent user tries to create dependent (should fail)
- [ ] Test: Dependent tries to log in directly (should fail - no credentials)
- [ ] Test: Parent deletes dependent with active quests (verify cascade)
- [ ] Test: Parent promotes dependent before age 13 (should fail)
- [ ] Test: Multiple parents linked to same child (dependent should only have 1 parent)

---

### Phase 6: Documentation & Rollout ⬜

#### 6.1 Update CLAUDE.md ⬜
- [ ] Open `CLAUDE.md`
- [ ] Add new section: "Dependents (NEW - Jan 2025)"
- [ ] Document API endpoints:
  - `GET /api/dependents/my-dependents`
  - `POST /api/dependents/create`
  - `GET /api/dependents/:id`
  - `PUT /api/dependents/:id`
  - `DELETE /api/dependents/:id`
  - `POST /api/dependents/:id/promote`
- [ ] Document `acting_as_dependent_id` parameter for quest/task endpoints
- [ ] Update database schema section with new columns
- [ ] Add troubleshooting tips

#### 6.2 Create User Documentation ⬜
- [ ] Create file: `docs/PARENT_DEPENDENT_GUIDE.md`
- [ ] Write section: "What are Dependent Profiles?"
- [ ] Write section: "Creating a Dependent Profile"
- [ ] Write section: "Managing Quests for Dependents"
- [ ] Write section: "Switching Between Profiles"
- [ ] Write section: "Promoting to Independent Account"
- [ ] Add screenshots/mockups
- [ ] Review with stakeholders

#### 6.3 Create Migration Guide for Existing Users ⬜
- [ ] Create file: `backend/scripts/migrate_young_students_to_dependents.sql`
- [ ] Write SQL script to convert existing students under 13 to dependents
- [ ] Add safety checks (only convert if parent link exists)
- [ ] Document manual steps for admins
- [ ] Test migration on staging database
- [ ] Create rollback script

**Migration Script:**
```sql
-- Admin script: Convert existing young student accounts to dependents
-- WARNING: Only run with admin supervision

BEGIN;

-- Update young students who have parent links
UPDATE users
SET
  is_dependent = TRUE,
  managed_by_parent_id = (
    SELECT parent_user_id
    FROM parent_student_links
    WHERE student_user_id = users.id
    LIMIT 1
  ),
  promotion_eligible_at = date_of_birth + INTERVAL '13 years',
  email = NULL  -- Remove email to comply with dependent model
WHERE
  EXTRACT(YEAR FROM AGE(date_of_birth)) < 13
  AND role = 'student'
  AND id IN (SELECT student_user_id FROM parent_student_links);

-- Verify migration
SELECT
  COUNT(*) as migrated_count,
  AVG(EXTRACT(YEAR FROM AGE(date_of_birth))) as avg_age
FROM users
WHERE is_dependent = TRUE;

-- COMMIT or ROLLBACK after review
-- COMMIT;
```

#### 6.4 Internal Training ⬜
- [ ] Create demo video showing dependent profiles feature
- [ ] Prepare FAQ document for common questions
- [ ] Train customer support team on new feature
- [ ] Create troubleshooting guide for support

#### 6.5 Deployment Checklist ⬜
- [ ] Merge all changes to `develop` branch
- [ ] Run database migrations on staging
- [ ] Deploy backend to staging (Render)
- [ ] Deploy frontend to staging (Render)
- [ ] Run smoke tests on staging
- [ ] Fix any bugs found in staging
- [ ] Get stakeholder approval
- [ ] Schedule production deployment window
- [ ] Run database migrations on production
- [ ] Deploy backend to production
- [ ] Deploy frontend to production
- [ ] Monitor error logs for 24 hours
- [ ] Send announcement to users (if needed)

---

## Success Metrics

Track these metrics after rollout to measure feature adoption and success:

- [ ] **Week 1:** Number of dependent profiles created
- [ ] **Week 2:** Parent engagement rate with profile switcher
- [ ] **Week 4:** Quest completion rates (dependents vs. independents)
- [ ] **Month 1:** Promotion rate (dependents → independent at age 13)
- [ ] **Month 2:** Parent satisfaction survey (NPS score)
- [ ] **Month 3:** Retention rate of parents with dependents

**Target Metrics:**
- 30% of parent users create at least 1 dependent profile (Month 1)
- 50% of dependents complete at least 1 quest per week
- 90% parent satisfaction rating
- Zero critical bugs reported

---

## Timeline

### Week 1: Database & Backend Foundation
- **Day 1-2:** Database migrations (Phase 1)
  - Schema changes
  - RLS policies
  - Database functions
- **Day 3-4:** DependentRepository implementation (Phase 2.1)
- **Day 5:** API routes for dependents (Phase 2.2)

### Week 2: Frontend Components
- **Day 1-2:** Dependent API service + ProfileSwitcher component (Phase 3.1-3.2)
- **Day 3:** AddDependentModal component (Phase 3.3)
- **Day 4-5:** Update ParentDashboardPage integration (Phase 3.4)

### Week 3: Quest System Integration & Testing
- **Day 1-2:** Quest/task route modifications (Phase 4.1-4.3)
- **Day 3:** Frontend quest component updates (Phase 4.4)
- **Day 4:** Backend unit tests (Phase 5.1)
- **Day 5:** Integration tests (Phase 5.2)

### Week 4: Testing, Documentation & Deployment
- **Day 1:** End-to-end testing (Phase 5.4)
- **Day 2:** Documentation updates (Phase 6.1-6.2)
- **Day 3:** Staging deployment and validation
- **Day 4:** Bug fixes and polish
- **Day 5:** Production deployment

---

## Rollback Plan

If critical issues are discovered after deployment:

1. **Immediate:** Disable dependent creation endpoint (feature flag)
2. **Within 1 hour:** Revert frontend deployment (previous build)
3. **Within 2 hours:** Revert backend deployment (previous build)
4. **Within 4 hours:** Rollback database migrations if needed
5. **Post-mortem:** Document issues, fix, and re-deploy

**Feature Flag Location:** `backend/config.py`
```python
ENABLE_DEPENDENT_PROFILES = os.getenv('ENABLE_DEPENDENT_PROFILES', 'false') == 'true'
```

---

## Questions & Decisions Log

### Open Questions
- [ ] Should dependents have optional email addresses? (COPPA allows with parental consent)
- [ ] What happens to dependent's data if parent account is deleted?
- [ ] Should we allow multiple parents to manage the same dependent?
- [ ] Should dependents be visible in search/public directories?
- [ ] Age limit: Strictly under 13, or allow 13-17 with parental controls?

### Decisions Made
- ✅ Use `is_dependent` boolean flag (not separate table)
- ✅ Dependents are users with `role='student'` (reuse existing system)
- ✅ No email/password for dependents (COPPA compliance)
- ✅ Promotion at age 13 (create Supabase Auth account)
- ✅ Parent manages all quest/evidence activity for dependent

---

## Notes

- **COPPA Compliance:** Dependent accounts without email/password ensures compliance with Children's Online Privacy Protection Act
- **Data Ownership:** All quest/XP/evidence data belongs to the dependent user_id, making promotion seamless
- **Future Enhancement:** Consider "family pods" (shared quests between siblings)
- **Future Enhancement:** Grandparent/observer role for dependents
- **Future Enhancement:** Transition wizard at age 13 (celebrate independence!)

---

## Contact & Support

**Implementation Lead:** Claude (AI Assistant)
**Product Owner:** [Your Name]
**Timeline Start:** January 12, 2025
**Target Launch:** February 9, 2025

For questions or blockers, refer to this document and update checklist items as you progress.
