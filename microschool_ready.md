# Microschool Pilot Readiness Plan

**Created**: December 30, 2025
**Status**: In Progress
**Target**: Prepare platform for microschool organization onboarding

---

## AI Agent Instructions

When working on tasks in this document:
1. Mark tasks as `[x]` when completed
2. Add completion date and brief notes after completed tasks
3. If a task is blocked, add `[BLOCKED]` prefix with reason
4. Update the "Last Updated" timestamp when making changes
5. Add any new sub-tasks discovered during implementation

**Last Updated**: December 31, 2025 (Session 7)

---

## Priority 1: Critical for Launch

### 1.1 Fix Invalid Roles in User Management

**Estimated Effort**: 30 minutes
**File**: `backend/routes/admin/user_management.py:294`

**Problem**: Code contains invalid roles (`educator`, `admin`, `school_admin`) that don't match the platform's actual role system.

**Tasks**:
- [x] Update `valid_roles` list at line 294 to use correct roles
- [x] Search codebase for other instances of invalid roles
- [x] Update any frontend role dropdowns if needed
- [x] Test role assignment functionality
- [x] Verify role changes persist correctly

**Correct roles** (per CLAUDE.md):
```python
valid_roles = ['student', 'parent', 'advisor', 'org_admin', 'superadmin', 'observer']
```

**Search command for AI agent**:
```bash
grep -r "educator\|school_admin" --include="*.py" --include="*.jsx" backend/ frontend/src/
```

**Completion Notes**:
**December 30, 2025 - Session 2**

Fixed `educator` and `school_admin` invalid roles in these files:
- `backend/routes/admin/user_management.py:294,299,928-929,1016-1017` - Updated valid_roles and role checks
- `frontend/src/contexts/AuthContext.jsx:368` - Fixed isAdmin check
- `frontend/src/services/authService.js:369` - Fixed isAdmin method
- `backend/routes/advisor.py:406,456` - Updated require_role decorators
- `frontend/src/pages/curriculum/CurriculumPage.jsx:81,141` - Fixed isAdmin checks
- `backend/services/announcement_service.py:309` - Changed school_admin to org_admin
- `backend/tests/unit/test_auth.py:74,90` - Fixed test role values

**Additional 'admin' references found (lower priority)**:
Many files still use `'admin'` as a role. These may need review:
- `backend/routes/advisor.py` (10+ decorators)
- `backend/routes/advisor_notes.py`, `advisor_checkins.py`
- `backend/routes/admin/task_flags.py`, `student_task_management.py`
- `backend/routes/parental_consent.py`
- `frontend/src/pages/AdminPage.jsx`, `ParentDashboardPage.jsx`, `HomePage.jsx`
- Several test files

The core role validation in user_management.py is now correct. The additional 'admin' references may be intentional org_role values (member/admin for organization membership) or need migration.

---

### 1.2 Bulk User Import for Org Admins

**Estimated Effort**: 8-16 hours
**Priority**: High - Microschools need to onboard 10-50+ students quickly

**Backend Tasks**:
- [x] Create `backend/routes/admin/bulk_import.py` with CSV upload endpoint
- [x] Add CSV parsing with validation (email, name, role, date_of_birth)
- [x] Implement batch user creation using Supabase Auth admin API
- [x] Handle duplicate email detection gracefully
- [x] Generate temporary passwords or send invite emails
- [x] Add audit logging for bulk imports
- [x] Create rate limiting for bulk operations
- [x] Add `superadmin` and `org_admin` to allowed roles for this route
- [x] Write unit tests for CSV parsing and validation

**Frontend Tasks**:
- [x] Create `frontend/src/components/admin/BulkUserImport.jsx` component
- [x] Add CSV file upload with drag-and-drop
- [x] Show preview of users to be imported
- [x] Display validation errors per row
- [x] Show progress during import
- [x] Display results summary (created, failed, skipped)
- [x] Add download template CSV button
- [x] Integrate into Organization Management page (Users tab)

**CSV Template Columns**:
```csv
email,first_name,last_name,role,date_of_birth
student1@example.com,John,Doe,student,2012-05-15
parent1@example.com,Jane,Doe,parent,
```

**API Endpoint Design**:
```
POST /api/admin/organizations/{org_id}/users/bulk-import
Content-Type: multipart/form-data
Body: { file: <csv_file>, send_invites: boolean }
Response: {
  success: true,
  created: 15,
  failed: 2,
  skipped: 1,
  errors: [{ row: 3, error: "Invalid email format" }]
}
```

**Completion Notes**:
**December 30, 2025 - Session 3**

Implemented complete bulk user import feature:

**Backend** (`backend/routes/admin/bulk_import.py`):
- `POST /api/admin/organizations/{org_id}/users/bulk-import` - Main import endpoint
- `POST /api/admin/organizations/{org_id}/users/bulk-import/validate` - Preview/validate CSV
- `GET /api/admin/organizations/{org_id}/users/bulk-import/template` - Download CSV template
- Features: CSV parsing, email validation, date of birth validation, role validation
- Generates temporary passwords for each user
- Creates Supabase Auth users with auto-confirmation
- Initializes diploma and skill categories
- Audit logging for imports
- Rate limited to 5 imports per 5 minutes
- Maximum 100 users per import

**Frontend** (`frontend/src/components/admin/BulkUserImport.jsx`):
- Drag-and-drop CSV upload
- Validation preview before import
- Shows valid/invalid row counts
- Displays validation errors per row
- Import progress indicator
- Results summary with created/failed/skipped counts
- Download template button
- Download results CSV with temporary passwords

**Integration**:
- Added "Bulk Import" subtab to Users tab in Organization Management page
- Uses `@require_org_admin` decorator (org_admin and superadmin access)

**Status**: Tested and verified working in browser.

**December 30, 2025 - Session 4**
- Added comprehensive unit tests in `backend/tests/unit/test_bulk_import.py`
- 66 tests covering: password generation, email validation, date validation, CSV parsing, row validation
- All tests passing

---

### 1.3 Email Invitation System for Org Admins

**Estimated Effort**: 4-8 hours
**Priority**: High - Alternative to bulk import for smaller batches

**Backend Tasks**:
- [x] Create `backend/routes/admin/user_invitations.py`
- [x] Create `invitations` table migration (or use existing if available)
- [x] Implement `POST /api/admin/organizations/{org_id}/invitations` endpoint
- [x] Generate unique invitation codes with expiration (7 days)
- [x] Send invitation email using existing EmailService
- [x] Create invitation acceptance endpoint
- [x] Track invitation status (pending, accepted, expired)
- [x] Allow org admins to resend or cancel invitations
- [x] Add `superadmin` and `org_admin` to allowed roles

**Frontend Tasks**:
- [x] Create `frontend/src/components/admin/InviteUserModal.jsx`
- [x] Add invite button to Organization Management Users tab
- [x] Create form with email, name, role fields
- [x] Show pending invitations list with status
- [x] Add resend/cancel actions for pending invites
- [x] Create invitation acceptance page `frontend/src/pages/AcceptInvitationPage.jsx`

**Email Template**:
- [x] Create `backend/templates/email/org_invitation.html`
- [x] Add entry to `backend/templates/email/email_copy.yaml`

**Database Schema** (if needed):
```sql
CREATE TABLE org_invitations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID REFERENCES organizations(id),
  email VARCHAR(255) NOT NULL,
  invited_name VARCHAR(255),
  role VARCHAR(50) DEFAULT 'student',
  invitation_code VARCHAR(64) UNIQUE NOT NULL,
  invited_by UUID REFERENCES users(id),
  status VARCHAR(20) DEFAULT 'pending', -- pending, accepted, expired, cancelled
  expires_at TIMESTAMP NOT NULL,
  accepted_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);
```

**Completion Notes**:
**December 30, 2025 - Session 5**

Implemented complete email invitation system for org admins:

**Backend** (`backend/routes/admin/user_invitations.py`):
- `GET /api/admin/organizations/{org_id}/invitations` - List invitations with status filter
- `POST /api/admin/organizations/{org_id}/invitations` - Create and send invitation
- `POST /api/admin/organizations/{org_id}/invitations/{id}/resend` - Resend invitation email
- `DELETE /api/admin/organizations/{org_id}/invitations/{id}` - Cancel pending invitation
- `GET /api/admin/organizations/invitations/validate/{code}` - Validate invitation code (public)
- `POST /api/admin/organizations/invitations/accept/{code}` - Accept invitation and create account (public)
- Uses `@require_org_admin` decorator (org_admin and superadmin access)
- Rate limited to prevent abuse
- 7-day expiration with auto-expire on fetch
- Sends templated email via EmailService

**Frontend**:
- `InviteUserModal.jsx` - Modal to send invitation with email, name, role
- `PendingInvitationsList.jsx` - Shows invitations with status filter, resend/cancel actions
- `AcceptInvitationPage.jsx` - Public page for accepting invitation and creating account
- Added "Invite Users" subtab to Organization Management Users tab
- Route `/invitation/:code` for invitation acceptance

**Email Template** (`email_copy.yaml`):
- Added `org_invitation` template with invitation details and CTA button

**Database Migration** (`027_create_org_invitations.sql`):
- Table created with RLS policies for org admins
- Unique constraint on pending invitations per email per org
- Indexes for performance

**Status**: COMPLETE - Tested and working. User confirmed email variables render correctly.

---

## Priority 2: Important for Good Experience

### 2.1 Org-Specific Announcements

**Estimated Effort**: 4-8 hours
**Priority**: Medium - Microschools need to communicate with students

**Research Tasks**:
- [x] Review existing `backend/routes/announcements.py` for org filtering
- [x] Check if `announcements` table has `organization_id` column
- [x] Review frontend announcement components

**Backend Tasks**:
- [x] Ensure announcements can be scoped to organization
- [x] Add `POST /api/organizations/{org_id}/announcements` for org admins
- [x] Filter announcements by user's organization in GET endpoints
- [x] Add announcement targeting (all org, specific roles, specific users)

**Frontend Tasks**:
- [x] Add Announcements tab to Organization Management page
- [x] Create announcement composer for org admins
- [x] Show org-filtered announcements on student dashboard
- [x] Add notification badge for unread announcements

**Completion Notes**:
**December 30, 2025 - Session 6**

**Research Findings**: The announcement system was already fully implemented with organization scoping:
- Backend `announcements.py` already filters by user's `organization_id`
- `AnnouncementService` and `AnnouncementRepository` support org filtering
- Table has `organization_id` column
- Target audience filtering (students, parents, advisors, all) already works

**New Implementation**:
- Added **Announcements tab** to Organization Management page (`OrganizationManagement.jsx`)
- Created `OrgAnnouncementsTab.jsx` component with:
  - List of organization announcements with pinned indicators
  - Create/Edit/Delete modal for announcements
  - Target audience selection (Everyone, Students, Parents, Advisors)
  - Pin announcement feature (max 3)
  - Author display and timestamps
- Added **Announcements link** to sidebar navigation (`Sidebar.jsx`)
- Added **unread announcement badge** on sidebar showing count
  - Badge updates every 60 seconds
  - Shows on both collapsed (icon) and expanded (text) sidebar states
- Existing `AnnouncementsFeed.jsx` and `CreateAnnouncement.jsx` continue to work for students/advisors

**Status**: COMPLETE

---

### 2.2 Enhanced Org Admin Analytics

**Estimated Effort**: 4-8 hours
**Priority**: Medium - Helps microschool track student progress

**Backend Tasks**:
- [x] Add `GET /api/admin/organizations/{org_id}/students/progress` endpoint
- [x] Return per-student progress data (quests started, completed, XP, badges)
- [x] Add date range filtering
- [x] Implement CSV export for student progress
- [x] Add class-wide aggregated statistics

**Frontend Tasks**:
- [x] Create `frontend/src/components/admin/OrgStudentProgress.jsx`
- [x] Add sortable/filterable student progress table
- [x] Show progress bars for each student
- [x] Add export to CSV button
- [x] Create simple charts for class-wide metrics
- [x] Add to Organization Management as "Progress" tab

**Data Points to Include**:
- Student name
- Total XP
- Quests enrolled / completed
- Tasks completed this week/month
- Last active date
- Badge count

**Completion Notes**:
**December 31, 2025 - Session 7**

**Backend** (`backend/routes/admin/organization_management.py`):
- `GET /api/admin/organizations/{org_id}/students/progress` - Full student progress endpoint
- Query params: `start_date`, `end_date`, `format` (json/csv), `role`
- Default date range: last 30 days
- Returns per-student: name, email, total_xp, quests_enrolled, quests_completed, tasks_completed_period, tasks_completed_all, badge_count, last_active, joined
- Returns summary: total_students, total_xp, total_completions_period, avg_xp, date_range
- CSV export with all columns for download
- Uses admin client for org-wide queries

**Frontend** (`frontend/src/components/admin/OrgStudentProgress.jsx`):
- Sortable table with click-to-sort headers (name, XP, quests, tasks, badges, last_active)
- Date range picker with quick filters (7 days, 30 days, 90 days)
- Summary cards showing total students, total XP, tasks completed, avg XP
- Export to CSV button with loading state
- Student avatars with initials
- Color-coded task completion badges (green for active, gray for inactive)
- Badge count with star icon

**Integration**:
- Added "Progress" tab to Organization Management page
- Lazy-loaded component for performance
- Uses same styling patterns as other org admin tabs

**Bug Fix (also in this session)**:
- Fixed `xp_awarded` column error in multiple files
- Column doesn't exist in `quest_task_completions` - XP is stored in `user_quest_tasks.xp_value`
- Fixed: `completed_quests.py`, `dependent_progress_service.py`, `course_service.py`, `xp_service.py`

**Status**: COMPLETE

---

### 2.3 Complete Observer Role Implementation

**Estimated Effort**: 8-12 hours
**Priority**: Medium - Valuable for mentors/extended family viewing

**Research Tasks**:
- [ ] Review current observer implementation in `backend/routes/observer.py`
- [ ] Check `observer_invitations` and `observer_links` tables
- [ ] Review frontend observer pages

**Backend Tasks**:
- [ ] Complete any missing observer endpoints
- [ ] Ensure observers can only view (not modify) linked students
- [ ] Add observer notification preferences
- [ ] Test observer invitation flow end-to-end

**Frontend Tasks**:
- [ ] Complete `ObserverDashboard` showing linked students
- [ ] Ensure read-only portfolio view works
- [ ] Add comment functionality on student work
- [ ] Create observer settings page

**Completion Notes**:
<!-- AI: Add notes here when completed -->

---

## Priority 3: Nice to Have

### 3.1 Student Grouping/Cohorts

**Estimated Effort**: 12-20 hours
**Priority**: Low - Useful for larger microschools

**Backend Tasks**:
- [ ] Create `cohorts` table migration
- [ ] Create `cohort_members` junction table
- [ ] Add CRUD endpoints for cohort management
- [ ] Add cohort filtering to analytics

**Frontend Tasks**:
- [ ] Create cohort management UI in org admin
- [ ] Add cohort assignment to user management
- [ ] Show cohort-filtered views

**Database Schema**:
```sql
CREATE TABLE cohorts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID REFERENCES organizations(id),
  name VARCHAR(255) NOT NULL,
  description TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE cohort_members (
  cohort_id UUID REFERENCES cohorts(id),
  user_id UUID REFERENCES users(id),
  added_at TIMESTAMP DEFAULT NOW(),
  PRIMARY KEY (cohort_id, user_id)
);
```

**Completion Notes**:
<!-- AI: Add notes here when completed -->

---

### 3.2 Org Admin Quick Actions Dashboard

**Estimated Effort**: 4-6 hours
**Priority**: Low - Quality of life improvement

**Tasks**:
- [ ] Create org admin dashboard with quick stats
- [ ] Add recent activity feed for organization
- [ ] Show pending invitations count
- [ ] Show students needing attention (inactive, stuck)
- [ ] Add quick links to common actions

**Completion Notes**:
<!-- AI: Add notes here when completed -->

---

## Pre-Launch Verification Checklist

**Complete these checks before pilot launch**:

### Organization Setup
- [ ] Create organization for microschool in database
- [ ] Set appropriate quest visibility policy
- [ ] Upload organization logo
- [ ] Test registration URL works (`/join/{slug}`)

### User Management
- [ ] Verify org admin can view all org users
- [ ] Test role assignment works correctly
- [ ] Confirm user removal from org works
- [ ] Test password reset flow

### Content Management
- [ ] Create or import initial quests for organization
- [ ] Verify quests appear correctly for org students
- [ ] Test task completion flow
- [ ] Confirm XP and badges award correctly

### Parent Features
- [ ] Test parent registration and dependent creation
- [ ] Verify "act as" feature works
- [ ] Confirm parent can view progress reports
- [ ] Test progress report export

### Email Notifications
- [ ] Verify welcome emails send correctly
- [ ] Test password reset emails
- [ ] Confirm all email templates render properly

### Data Isolation
- [ ] Verify users only see their organization's data
- [ ] Test that org admins can't access other orgs
- [ ] Confirm RLS policies are enforced

---

## Implementation Log

Use this section to track progress across sessions:

### Session 1 - December 30, 2025
- Created implementation plan
- Identified 7 major gaps
- Prioritized features for microschool launch

### Session 2 - December 30, 2025
- Fixed Task 1.1: Invalid Roles in User Management
- Updated 8 files with correct role values (educator, school_admin -> org_admin, superadmin)
- Discovered 80+ additional 'admin' role references for future review
- Core role validation in user_management.py now uses correct 6 roles

### Session 3 - December 30, 2025
- Verified Task 1.1 role fixes work correctly (user confirmed)
- Implemented Task 1.2: Bulk User Import feature
  - Created backend `bulk_import.py` with 3 endpoints (import, validate, template)
  - Created frontend `BulkUserImport.jsx` component with drag-and-drop, preview, and results
  - Integrated into Organization Management page as subtab in Users section
  - Features: CSV validation, temp password generation, audit logging, rate limiting
- User verified bulk import working in browser
- Fixed remove user from org (NOT NULL constraint - now moves to default org)
- Optimized bulk import speed (batch inserts for profiles and skills)
- Fixed double confirmation dialog on user removal
- Added multi-select bulk remove to Organization Management Users tab
- Added multi-select bulk delete to Admin Panel (Manage Users)
- Added "Send Welcome Emails" placeholder button to bulk import results (coming soon)

### Session 4 - December 30, 2025
- Completed Task 1.2: Added unit tests for bulk import CSV parsing and validation
  - Created `backend/tests/unit/test_bulk_import.py` with 66 tests
  - Tests cover: password generation, email validation, date validation, CSV parsing, row validation
  - All tests passing
- Task 1.2 (Bulk User Import) is now fully complete

### Session 5 - December 30, 2025
- Implemented Task 1.3: Email Invitation System for Org Admins
  - Created `backend/routes/admin/user_invitations.py` with 6 endpoints
  - Created `frontend/src/components/admin/InviteUserModal.jsx`
  - Created `frontend/src/components/admin/PendingInvitationsList.jsx`
  - Created `frontend/src/pages/AcceptInvitationPage.jsx`
  - Added `org_invitation` email template to `email_copy.yaml`
  - Added "Invite Users" subtab to Organization Management Users tab
  - Added route `/invitation/:code` in App.jsx
- Fixed `@require_org_admin` decorator parameter mismatch (added `current_user_id, current_org_id, is_superadmin` params)
- Fixed email template to use Jinja2 `{{ variable }}` syntax instead of `{variable}`
- User ran migration `027_create_org_invitations.sql` on database
- Task 1.3 (Email Invitation System) COMPLETE - tested and working

### Session 6 - December 30, 2025
- Implemented Task 2.1: Org-Specific Announcements
  - Research found backend already had full org-scoping for announcements
  - Added Announcements tab to Organization Management page
  - Created `OrgAnnouncementsTab.jsx` with create/edit/delete functionality
  - Added Announcements link to sidebar navigation
  - Added unread announcement badge with 60-second refresh
- Task 2.1 (Org-Specific Announcements) COMPLETE

---

## Related Files Reference

**Key Backend Files**:
- `backend/routes/admin/organization_management.py` - Org CRUD
- `backend/routes/admin/user_management.py` - User management
- `backend/routes/auth/registration.py` - User registration with org assignment
- `backend/services/email_service.py` - Email sending
- `backend/services/organization_service.py` - Org business logic

**Key Frontend Files**:
- `frontend/src/pages/admin/OrganizationManagement.jsx` - Org admin UI
- `frontend/src/pages/DashboardPage.jsx` - Student dashboard
- `frontend/src/pages/ParentDashboardPage.jsx` - Parent dashboard

**Configuration**:
- `CLAUDE.md` - Project rules and valid roles
- `backend/.env` - Environment variables (SMTP, etc.)
