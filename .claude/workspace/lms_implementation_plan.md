# LMS Implementation Plan

**Date**: December 27, 2025
**Version**: 1.0
**Target**: Multi-tenant LMS features for Optio Platform

---

## Executive Summary

This plan outlines the implementation strategy for transforming Optio into a multi-tenant Learning Management System (LMS). The work is divided into 3 phases: MVP (core functionality), Phase 2 (enhanced features), and Future (advanced capabilities).

**Key Dependencies**:
1. Database schema changes → Backend APIs → Frontend UI
2. Organization management → Role-based access → LMS features
3. Security/compliance → All features (FERPA/COPPA must be in place before launch)

**Estimated Timeline**:
- MVP: 3-4 weeks (assumes 2-3 developers)
- Phase 2: 2-3 weeks
- Future: Ongoing (feature-by-feature)

---

## Phase 0: Pre-Launch Critical Requirements

### P0.1: FERPA/COPPA Compliance
**Priority**: CRITICAL
**Complexity**: HIGH
**Effort**: 1 week
**Dependencies**: None (blocks all other work)

**Tasks**:
- [ ] Legal review of FERPA/COPPA requirements with counsel
- [ ] Implement age verification on registration (already started in RegisterPage.jsx)
- [ ] Build parental consent workflow
  - [ ] Backend: `POST /api/auth/parental-consent/request` (send email to parent)
  - [ ] Backend: `POST /api/auth/parental-consent/verify` (parent clicks email link)
  - [ ] Backend: Block under-13 logins until consent granted (`consent_status` check)
  - [ ] Frontend: Consent upload page (already exists: `ParentalConsentUploadPage.jsx`)
- [ ] Extend audit logging to cover ALL student record access
  - [ ] Add `student_record_access_log` table (user_id, accessed_by, resource, action, timestamp, IP)
  - [ ] Middleware: Log every read of student data (quests, tasks, portfolio)
  - [ ] Admin dashboard: FERPA audit log viewer
- [ ] Add Gemini AI data processing agreement to Terms of Service
- [ ] Create incident response plan for data breaches

**Integration Points**:
- Existing: `observer_audit_log` (expand this pattern)
- Existing: `RegisterPage.jsx` (age verification already present)
- Existing: `ParentalConsentUploadPage.jsx` (COPPA upload flow)

---

### P0.2: Row-Level Security (RLS) Audit
**Priority**: CRITICAL
**Complexity**: MEDIUM
**Effort**: 3 days
**Dependencies**: P0.1 (security mindset)

**Tasks**:
- [ ] Audit ALL tables for RLS policies
  - [ ] Run SQL: `SELECT tablename FROM pg_tables WHERE schemaname = 'public'`
  - [ ] Verify each table has appropriate `organization_id` filter or is intentionally global
- [ ] Add missing RLS policies
  - [ ] `badges` table (decide: global or org-specific?)
  - [ ] `friendships` table (allow cross-org or restrict?)
  - [ ] `quest_collaborations` (if exists)
  - [ ] `curriculum_attachments` (already in migration 019)
- [ ] Write integration tests for RLS
  - [ ] Test: User from Org A cannot access Org B's quests
  - [ ] Test: Observer from Org A cannot view student from Org B
  - [ ] Test: Admin queries return org-filtered results
- [ ] Document when to use `get_user_client()` vs `get_supabase_admin_client()`
- [ ] Code review: Search codebase for `get_supabase_admin_client()` usage, ensure justified

**Integration Points**:
- Existing: RLS policies on `users`, `quests`, `user_quest_tasks`, `organizations`
- Existing: `get_user_client()` and `get_supabase_admin_client()` in backend

---

### P0.3: Data Migration (Single-Org → Multi-Org)
**Priority**: HIGH
**Complexity**: MEDIUM
**Effort**: 2 days
**Dependencies**: P0.2 (RLS in place before backfill)

**Tasks**:
- [ ] Create default organization
  - [ ] SQL: `INSERT INTO organizations (name, slug, quest_visibility_policy, is_active) VALUES ('Optio Default', 'optio', 'org_only', true)`
  - [ ] Store org ID for backfill
- [ ] Backfill existing data
  - [ ] SQL: `UPDATE users SET organization_id = [default_org_id] WHERE organization_id IS NULL`
  - [ ] SQL: `UPDATE quests SET organization_id = [default_org_id] WHERE organization_id IS NULL`
  - [ ] SQL: `UPDATE lms_integrations SET organization_id = [default_org_id] WHERE organization_id IS NULL`
- [ ] Add NOT NULL constraints AFTER backfill
  - [ ] SQL: `ALTER TABLE users ALTER COLUMN organization_id SET NOT NULL`
  - [ ] SQL: `ALTER TABLE quests ALTER COLUMN organization_id SET NOT NULL`
- [ ] Test on staging with production snapshot
  - [ ] Verify no NULL org_ids remain
  - [ ] Verify RLS policies still work
  - [ ] Verify existing users can still log in

**Integration Points**:
- Existing: `organizations` table (migration 009)
- Existing: `organization_id` columns in `users`, `quests`, `lms_integrations`

---

## Phase 1: MVP (Minimum Viable LMS)

**Goal**: Schools can sign up, create classes, assign quests, track student progress

### MVP.1: Organization-Specific Signup
**Priority**: HIGH
**Complexity**: LOW
**Effort**: 1 day
**Dependencies**: P0.3 (migration complete)

**Tasks**:
- [x] ~~Frontend: Create `/join/:slug` signup page~~ (DONE - `OrganizationSignup.jsx`)
- [ ] Backend: `GET /api/organizations/join/:slug` endpoint
  - [ ] Return org details (name, logo_url, slug, is_active)
  - [ ] Error handling: 404 if not found, 403 if inactive
- [ ] Backend: Update `POST /api/auth/register` to accept `org_slug` param
  - [ ] Look up org by slug
  - [ ] Set `user.organization_id` during registration
  - [ ] Reject if org is inactive
- [ ] Frontend: Update `AuthContext.register()` to pass `org_slug`
- [ ] Test: User registers via `/join/optio`, verify assigned to Optio org

**Files**:
- ✅ `frontend/src/pages/auth/OrganizationSignup.jsx` (created)
- ✅ `frontend/src/App.jsx` (route added)
- `backend/routes/auth.py` (update register endpoint)
- `backend/routes/organization_routes.py` (add join endpoint)

---

### MVP.2: Advisor/Teacher Role & Permissions
**Priority**: HIGH
**Complexity**: MEDIUM
**Effort**: 2 days
**Dependencies**: MVP.1 (org signup ready)

**Tasks**:
- [ ] Database: Add `advisor` role to users table
  - [ ] SQL: `ALTER TABLE users ADD CONSTRAINT check_role CHECK (role IN ('student', 'parent', 'advisor', 'teacher', 'admin', 'superadmin'))`
  - [ ] Update existing constraints if needed
- [ ] Backend: Create advisor permissions middleware
  - [ ] File: `backend/middleware/role_check.py`
  - [ ] Decorator: `@require_role(['advisor', 'admin', 'superadmin'])`
  - [ ] Check user role from session/token
- [ ] Backend: Advisor-specific endpoints
  - [ ] `GET /api/advisor/students` - List students in advisor's org
  - [ ] `GET /api/advisor/quests` - List org quests
  - [ ] `GET /api/advisor/student/:id/progress` - View student progress
- [ ] Frontend: Advisor dashboard page
  - [ ] Route: `/advisor/dashboard`
  - [ ] Display: Class roster, active quests, recent student activity
  - [ ] Use existing `AdvisorDashboard.jsx` or create new
- [ ] Update login redirect logic
  - [ ] If `user.role === 'advisor'`, redirect to `/advisor/dashboard`

**Files**:
- `backend/middleware/role_check.py` (new)
- `backend/routes/advisor_routes.py` (new or expand existing)
- `frontend/src/pages/AdvisorDashboard.jsx` (exists, may need updates)

---

### MVP.3: Quest Invitations/Assignment
**Priority**: HIGH
**Complexity**: MEDIUM
**Effort**: 3 days
**Dependencies**: MVP.2 (advisor role exists)

**Tasks**:
- [ ] Database: Create `quest_invitations` table
  - [ ] Fields: `id`, `quest_id`, `invited_user_id`, `invited_by`, `status` (pending/accepted/declined), `invited_at`, `accepted_at`, `organization_id`
  - [ ] RLS policy: Users can only see invitations for their org
- [ ] Backend: Quest invitation endpoints
  - [ ] `POST /api/quests/:id/invite` - Advisor invites students to quest
    - [ ] Body: `{ "user_ids": [uuid, uuid, ...] }`
    - [ ] Validation: All users in same org as advisor
    - [ ] Create invitation records
    - [ ] Send email/notification to students
  - [ ] `GET /api/quests/invitations/pending` - Student sees pending invitations
  - [ ] `POST /api/quests/invitations/:id/accept` - Student accepts quest
    - [ ] Create user quest enrollment (link to existing quest start logic)
  - [ ] `POST /api/quests/invitations/:id/decline` - Student declines
- [ ] Frontend: Advisor quest assignment UI
  - [ ] Component: `QuestInvitationForm.jsx`
  - [ ] Multi-select student picker (checkboxes)
  - [ ] "Invite Selected Students" button
  - [ ] Confirmation toast
- [ ] Frontend: Student invitation inbox
  - [ ] Page: `/invitations` or section in dashboard
  - [ ] List pending quest invitations
  - [ ] Accept/Decline buttons
- [ ] Email notifications
  - [ ] Template: "You've been invited to [Quest Name] by [Advisor Name]"
  - [ ] Include accept link: `/invitations?quest_id=X`

**Files**:
- `backend/database_migration/020_quest_invitations.sql` (new)
- `backend/routes/quest_routes.py` (add invitation endpoints)
- `frontend/src/components/advisor/QuestInvitationForm.jsx` (new)
- `frontend/src/pages/InvitationsPage.jsx` (new)

---

### MVP.4: Announcements System
**Priority**: MEDIUM
**Complexity**: LOW
**Effort**: 2 days
**Dependencies**: MVP.2 (advisor role)

**Tasks**:
- [ ] Database: Create `announcements` table
  - [ ] Fields: `id`, `organization_id`, `title`, `content` (text or JSONB), `author_id`, `target_audience` (all/students/parents), `is_pinned`, `created_at`, `updated_at`
  - [ ] RLS policy: Users see announcements from their org
- [ ] Backend: Announcement endpoints
  - [ ] `GET /api/announcements` - List announcements for user's org (filter by target_audience)
  - [ ] `POST /api/announcements` - Advisor creates announcement (role check)
  - [ ] `PUT /api/announcements/:id` - Advisor edits announcement
  - [ ] `DELETE /api/announcements/:id` - Advisor deletes announcement
- [ ] Frontend: Announcement display
  - [ ] Component: `AnnouncementBanner.jsx` (pinned announcements at top of dashboard)
  - [ ] Page: `/announcements` - Full list of announcements
  - [ ] Newest first, pinned at top
- [ ] Frontend: Advisor announcement creator
  - [ ] Component: `CreateAnnouncementModal.jsx`
  - [ ] Rich text editor (use MarkdownEditor from curriculum builder)
  - [ ] Target audience selector (radio buttons)
  - [ ] Pin checkbox
- [ ] Optional: Email digest (daily summary of announcements to students/parents)

**Files**:
- `backend/database_migration/021_announcements.sql` (new)
- `backend/routes/announcement_routes.py` (new)
- `frontend/src/components/announcements/AnnouncementBanner.jsx` (new)
- `frontend/src/pages/AnnouncementsPage.jsx` (new)

---

### MVP.5: Parent Progress Reports
**Priority**: MEDIUM
**Complexity**: MEDIUM
**Effort**: 2 days
**Dependencies**: Existing observer system

**Tasks**:
- [ ] Backend: Parent report endpoint
  - [ ] `GET /api/parent/students/:id/report?start_date=X&end_date=Y`
  - [ ] Return: Quests completed, XP earned, badges earned, time period
  - [ ] Include chart data (XP over time, quest completions by pillar)
- [ ] Frontend: Parent report page
  - [ ] Route: `/parent/students/:id/report`
  - [ ] Date range selector (last 7 days, 30 days, all time, custom)
  - [ ] Summary cards (total XP, quests completed, badges earned)
  - [ ] Chart: XP progress over time (use Chart.js or Recharts)
  - [ ] Chart: Quest completions by pillar (pie chart)
  - [ ] List of completed quests with timestamps
- [ ] Export to PDF
  - [ ] Button: "Download PDF Report"
  - [ ] Use `jsPDF` or server-side PDF generation
  - [ ] Include org logo (if available)
- [ ] Email report option
  - [ ] Button: "Email Report to Me"
  - [ ] Backend: Generate PDF, send via email

**Files**:
- `backend/routes/parent_routes.py` (add report endpoint)
- `frontend/src/pages/ParentReportPage.jsx` (new)

---

### MVP.6: Organization Branding
**Priority**: LOW
**Complexity**: LOW
**Effort**: 1 day
**Dependencies**: MVP.1 (org structure exists)

**Tasks**:
- [ ] Database: Add branding fields to organizations table
  - [ ] SQL: `ALTER TABLE organizations ADD COLUMN logo_url TEXT, ADD COLUMN primary_color TEXT, ADD COLUMN secondary_color TEXT`
- [ ] Backend: Org branding endpoint
  - [ ] `GET /api/organizations/:id/branding` - Public endpoint, no auth required
  - [ ] Return: logo_url, primary_color, secondary_color
- [ ] Frontend: Apply org branding
  - [ ] Fetch branding on app load (store in OrganizationContext)
  - [ ] Replace Optio logo with org logo in header (if set)
  - [ ] Apply primary_color to buttons/accents (CSS variables or Tailwind config)
- [ ] Admin: Org branding settings page
  - [ ] Route: `/admin/organization/branding`
  - [ ] Upload logo (use FileUploader component)
  - [ ] Color pickers for primary/secondary colors
  - [ ] Preview section

**Files**:
- `backend/database_migration/022_org_branding.sql` (new)
- `backend/routes/organization_routes.py` (add branding endpoint)
- `frontend/src/contexts/OrganizationContext.jsx` (add branding state)
- `frontend/src/pages/admin/OrgBrandingSettings.jsx` (new)

---

### MVP.7: Curriculum Builder Integration
**Priority**: MEDIUM
**Complexity**: MEDIUM
**Effort**: 2 days
**Dependencies**: Phase 0 migration 019 (schema ready)

**Tasks**:
- [x] ~~Frontend: Curriculum builder UI~~ (DONE - `CurriculumBuilder.jsx`, `MarkdownEditor.jsx`, `IframeEmbed.jsx`, `FileUploader.jsx`)
- [ ] Backend: Curriculum CRUD endpoints
  - [ ] `GET /api/curriculum/:quest_id` - Load curriculum for quest
    - [ ] Return: quest details, curriculum_content (JSONB), attachments list
  - [ ] `PUT /api/curriculum/:quest_id` - Save curriculum content
    - [ ] Body: `{ "curriculum_content": { "markdown": "...", "embeds": [...] } }`
    - [ ] Increment `curriculum_version`
    - [ ] Update `curriculum_last_edited_by` and `curriculum_last_edited_at`
  - [ ] `POST /api/curriculum/upload` - Upload attachment file
    - [ ] Multipart form data: file, quest_id
    - [ ] Upload to S3/storage
    - [ ] Create `curriculum_attachments` record
    - [ ] Return: attachment object (id, file_url, file_name, file_type, file_size_bytes)
  - [ ] `DELETE /api/curriculum/attachments/:id` - Soft delete attachment
    - [ ] Set `is_deleted = true`, `deleted_at = NOW()`, `deleted_by = current_user`
- [ ] Frontend: Add route for curriculum builder
  - [ ] Route: `/quests/:id/curriculum/edit`
  - [ ] Protected: Require advisor/admin role
- [ ] Frontend: Link to curriculum builder from quest detail page
  - [ ] Button: "Edit Curriculum" (visible to advisors/admins only)
  - [ ] Link to `/quests/:id/curriculum/edit`
- [ ] Student view: Display curriculum on quest detail page
  - [ ] Render markdown content
  - [ ] Embed iframes
  - [ ] List downloadable attachments

**Files**:
- ✅ `frontend/src/pages/curriculum/CurriculumBuilder.jsx` (created)
- ✅ `frontend/src/components/curriculum/*.jsx` (created)
- ✅ `backend/database_migration/019_add_curriculum_builder.sql` (created)
- `backend/routes/curriculum_routes.py` (new)
- `backend/services/file_upload_service.py` (new or expand existing)

---

### MVP.8: Audit Logging for Compliance
**Priority**: HIGH
**Complexity**: MEDIUM
**Effort**: 2 days
**Dependencies**: P0.1 (FERPA requirements)

**Tasks**:
- [ ] Database: Extend `observer_audit_log` to cover all access
  - [ ] Rename to `access_audit_log` (more general)
  - [ ] Fields: `id`, `user_id`, `accessed_by`, `resource_type` (quest/task/portfolio/profile), `resource_id`, `action` (view/edit/delete), `ip_address`, `user_agent`, `timestamp`, `organization_id`
- [ ] Backend: Audit logging middleware
  - [ ] Decorator: `@audit_log(resource_type='quest')`
  - [ ] Automatically log all student data access
  - [ ] Apply to routes: `/api/quests/:id`, `/api/tasks/:id`, `/api/profile/:id`, `/api/portfolio/:id`
- [ ] Backend: Audit log viewer endpoint
  - [ ] `GET /api/admin/audit-logs?user_id=X&start_date=Y&end_date=Z`
  - [ ] Filter by user, date range, resource type
  - [ ] Return paginated results
- [ ] Frontend: Admin audit log viewer
  - [ ] Route: `/admin/audit-logs`
  - [ ] Filters: User search, date range, resource type
  - [ ] Table: Timestamp, User, Accessed By, Resource, Action, IP
  - [ ] Export to CSV button (for compliance reporting)

**Files**:
- `backend/database_migration/023_access_audit_log.sql` (new)
- `backend/middleware/audit_log.py` (new)
- `backend/routes/admin_routes.py` (add audit log endpoint)
- `frontend/src/pages/admin/AuditLogsPage.jsx` (new)

---

## Phase 2: Enhanced Features

**Goal**: Improve UX, add analytics, refine workflows

### P2.1: Quest Sharing Across Organizations
**Priority**: MEDIUM
**Complexity**: MEDIUM
**Effort**: 2 days
**Dependencies**: MVP complete

**Tasks**:
- [ ] Database: Create `quest_sharing` table
  - [ ] Fields: `id`, `quest_id`, `shared_with_org_id`, `shared_by_user_id`, `shared_at`, `is_active`
  - [ ] RLS policy: Orgs can see quests shared with them
- [ ] Backend: Quest sharing endpoints
  - [ ] `POST /api/quests/:id/share` - Share quest with another org (admin only)
    - [ ] Body: `{ "organization_id": "uuid" }`
  - [ ] `GET /api/quests` - Update to include shared quests
  - [ ] `DELETE /api/quests/:id/share/:org_id` - Unshare quest
- [ ] Frontend: Share quest UI
  - [ ] Component: `ShareQuestModal.jsx`
  - [ ] Organization selector (dropdown)
  - [ ] List of currently shared orgs with "Unshare" buttons
- [ ] Canvas course ID handling
  - [ ] Prefix LMS course IDs with org ID to prevent collisions
  - [ ] Format: `lms_course_id = 'org_123_course_456'`

**Files**:
- `backend/database_migration/024_quest_sharing.sql` (new)
- `backend/routes/quest_routes.py` (add sharing endpoints)
- `frontend/src/components/admin/ShareQuestModal.jsx` (new)

---

### P2.2: Analytics Dashboard (Advisor View)
**Priority**: MEDIUM
**Complexity**: MEDIUM
**Effort**: 3 days
**Dependencies**: MVP.2 (advisor role), MVP.3 (quest invitations)

**Tasks**:
- [ ] Backend: Analytics endpoints
  - [ ] `GET /api/advisor/analytics/overview`
    - [ ] Return: Total students, active quests, completion rate, avg XP per student
  - [ ] `GET /api/advisor/analytics/quest-completion?quest_id=X`
    - [ ] Return: Students enrolled, students completed, avg time to complete
  - [ ] `GET /api/advisor/analytics/student-engagement`
    - [ ] Return: Students by last login (active this week, month, inactive)
- [ ] Frontend: Analytics dashboard page
  - [ ] Route: `/advisor/analytics`
  - [ ] Summary cards (total students, active quests, completion rate)
  - [ ] Chart: Quest completion rates (bar chart)
  - [ ] Chart: Student engagement (pie chart: active/inactive)
  - [ ] Table: Quest performance (quest name, enrolled, completed, avg time)
- [ ] Date range selector (last 7 days, 30 days, semester, all time)

**Files**:
- `backend/routes/advisor_routes.py` (add analytics endpoints)
- `frontend/src/pages/advisor/AnalyticsDashboard.jsx` (new)

---

### P2.3: Notification System
**Priority**: MEDIUM
**Complexity**: HIGH
**Effort**: 4 days
**Dependencies**: MVP.3 (quest invitations), MVP.4 (announcements)

**Tasks**:
- [ ] Database: Create `notifications` table
  - [ ] Fields: `id`, `user_id`, `type` (quest_invite/announcement/badge_earned/etc), `title`, `message`, `link`, `is_read`, `created_at`, `organization_id`
- [ ] Backend: Notification endpoints
  - [ ] `GET /api/notifications` - List user's notifications (unread first)
  - [ ] `PUT /api/notifications/:id/read` - Mark as read
  - [ ] `PUT /api/notifications/read-all` - Mark all as read
- [ ] Backend: Notification creation service
  - [ ] Function: `create_notification(user_id, type, title, message, link)`
  - [ ] Call from quest invitation, announcement creation, badge award, etc.
- [ ] Frontend: Notification bell icon
  - [ ] Component: `NotificationBell.jsx` (in header)
  - [ ] Badge: Unread count
  - [ ] Dropdown: Recent notifications (click to mark read and navigate)
- [ ] Frontend: Notifications page
  - [ ] Route: `/notifications`
  - [ ] List all notifications
  - [ ] Filter: Unread, All
  - [ ] Mark all as read button
- [ ] Real-time updates (optional)
  - [ ] WebSocket or polling for new notifications

**Files**:
- `backend/database_migration/025_notifications.sql` (new)
- `backend/routes/notification_routes.py` (new)
- `backend/services/notification_service.py` (new)
- `frontend/src/components/notifications/NotificationBell.jsx` (new)
- `frontend/src/pages/NotificationsPage.jsx` (new)

---

### P2.4: Gradebook (Advisor View)
**Priority**: MEDIUM
**Complexity**: MEDIUM
**Effort**: 3 days
**Dependencies**: MVP.3 (quest invitations)

**Tasks**:
- [ ] Backend: Gradebook endpoint
  - [ ] `GET /api/advisor/gradebook?quest_id=X`
  - [ ] Return: Student roster with task completion status
  - [ ] Format: `[{ student_name, tasks: [{ task_id, title, completed, xp_awarded }] }]`
- [ ] Frontend: Gradebook page
  - [ ] Route: `/advisor/gradebook`
  - [ ] Quest selector (dropdown)
  - [ ] Table: Students (rows) x Tasks (columns)
  - [ ] Cell: Checkmark if completed, XP value
  - [ ] Export to CSV button
- [ ] Sorting: By student name, completion %
- [ ] Filtering: Show only incomplete tasks

**Files**:
- `backend/routes/advisor_routes.py` (add gradebook endpoint)
- `frontend/src/pages/advisor/GradebookPage.jsx` (new)

---

### P2.5: Organization Deactivation Workflow
**Priority**: MEDIUM
**Complexity**: MEDIUM
**Effort**: 2 days
**Dependencies**: MVP complete

**Tasks**:
- [ ] Database: Add deactivation fields to organizations
  - [ ] SQL: `ALTER TABLE organizations ADD COLUMN deactivated_at TIMESTAMPTZ, ADD COLUMN deactivated_by UUID REFERENCES users(id)`
- [ ] Backend: Deactivation endpoint
  - [ ] `POST /api/admin/organizations/:id/deactivate` (superadmin only)
  - [ ] Set `is_active = false`, `deactivated_at = NOW()`, `deactivated_by = current_user`
- [ ] Backend: Grace period logic
  - [ ] Update RLS policies: `WHERE is_active = true OR (deactivated_at > NOW() - INTERVAL '30 days')`
  - [ ] Allow read-only access during grace period
  - [ ] Block new quest enrollments, task completions
- [ ] Backend: Archival job
  - [ ] Cron job: Run daily, check for orgs deactivated > 1 year ago
  - [ ] Archive data to cold storage (S3 Glacier or similar)
  - [ ] Soft delete org records (set `archived = true`)
- [ ] Frontend: Deactivation UI
  - [ ] Admin org list: "Deactivate" button
  - [ ] Confirmation modal with grace period warning
- [ ] Email: Notify org admins when deactivated

**Files**:
- `backend/database_migration/026_org_deactivation.sql` (new)
- `backend/routes/admin_routes.py` (add deactivation endpoint)
- `backend/jobs/archive_deactivated_orgs.py` (new cron job)

---

## Phase 3: Future Enhancements

**Goal**: Advanced features for scale and usability

### F3.1: LMS Canvas API Integration (Org-Aware)
**Priority**: LOW
**Complexity**: HIGH
**Effort**: 1 week
**Dependencies**: MVP complete, existing Canvas converter

**Tasks**:
- [ ] Database: Add Canvas config to organizations
  - [ ] SQL: `ALTER TABLE organizations ADD COLUMN canvas_base_url TEXT, ADD COLUMN canvas_api_token_encrypted TEXT`
- [ ] Backend: Canvas OAuth flow
  - [ ] Endpoint: `GET /api/organizations/:id/canvas/authorize` - Redirect to Canvas OAuth
  - [ ] Endpoint: `POST /api/organizations/:id/canvas/callback` - Store encrypted token
- [ ] Backend: Update Canvas converter to use org-specific tokens
  - [ ] Fetch Canvas courses using org's `canvas_base_url` and `canvas_api_token_encrypted`
  - [ ] Prefix `lms_course_id` with `org_id` to prevent collisions
- [ ] Backend: Sync job
  - [ ] Cron: Daily sync of Canvas courses → Optio quests
  - [ ] Update existing quests if Canvas content changes
- [ ] Frontend: Canvas integration settings page
  - [ ] Route: `/admin/organization/integrations/canvas`
  - [ ] "Connect Canvas" button → OAuth flow
  - [ ] List synced courses with last sync timestamp
  - [ ] "Sync Now" button

**Files**:
- `backend/database_migration/027_canvas_org_integration.sql` (new)
- `backend/routes/canvas_routes.py` (update existing)
- `backend/services/canvas_sync_service.py` (new)
- `frontend/src/pages/admin/CanvasIntegrationPage.jsx` (new)

---

### F3.2: Student Portfolio Privacy Controls
**Priority**: MEDIUM
**Complexity**: LOW
**Effort**: 2 days
**Dependencies**: MVP complete

**Tasks**:
- [ ] Database: Add privacy fields to users
  - [ ] SQL: `ALTER TABLE users ADD COLUMN portfolio_visibility TEXT DEFAULT 'public' CHECK (portfolio_visibility IN ('public', 'org_only', 'private'))`
- [ ] Backend: Update portfolio endpoint
  - [ ] `GET /api/portfolio/:user_id` - Respect `portfolio_visibility`
  - [ ] If `org_only`, only users in same org can view
  - [ ] If `private`, only user + observers can view
- [ ] Frontend: Privacy settings on profile page
  - [ ] Radio buttons: Public, Organization Only, Private
  - [ ] Explanation text for each option
- [ ] Frontend: Privacy indicator on portfolio
  - [ ] Badge: "Public Portfolio" / "Organization Only" / "Private"

**Files**:
- `backend/database_migration/028_portfolio_privacy.sql` (new)
- `backend/routes/portfolio_routes.py` (update visibility logic)
- `frontend/src/pages/ProfilePage.jsx` (add privacy controls)

---

### F3.3: Advanced Curriculum Features
**Priority**: LOW
**Complexity**: HIGH
**Effort**: 1 week
**Dependencies**: MVP.7 (curriculum builder)

**Tasks**:
- [ ] Version history
  - [ ] Database: `curriculum_versions` table (snapshot of curriculum_content on each save)
  - [ ] Backend: `GET /api/curriculum/:quest_id/versions` - List versions
  - [ ] Backend: `POST /api/curriculum/:quest_id/revert/:version_id` - Restore old version
  - [ ] Frontend: Version history sidebar in curriculum builder
- [ ] Collaborative editing
  - [ ] WebSocket: Real-time updates when multiple advisors edit same curriculum
  - [ ] Lock mechanism: Warn if another user is editing
- [ ] Templates
  - [ ] Database: `curriculum_templates` table (pre-built curriculum structures)
  - [ ] Backend: `GET /api/curriculum/templates` - List templates
  - [ ] Frontend: "Start from Template" button in curriculum builder
- [ ] AI assistance
  - [ ] Button: "Generate Outline" - Use Gemini to generate curriculum structure from quest title/description
  - [ ] Button: "Suggest Activities" - AI suggests task ideas based on curriculum content

**Files**:
- `backend/database_migration/029_curriculum_versions.sql` (new)
- `backend/routes/curriculum_routes.py` (add version/template endpoints)
- `frontend/src/pages/curriculum/CurriculumBuilder.jsx` (add version history, templates)

---

### F3.4: Mobile App (React Native)
**Priority**: LOW
**Complexity**: VERY HIGH
**Effort**: 2-3 months
**Dependencies**: MVP complete, API stable

**Tasks**:
- [ ] Scaffold React Native project
  - [ ] Use Expo for faster development
  - [ ] Shared API client with web frontend
- [ ] Implement core features
  - [ ] Login/signup
  - [ ] Dashboard (quest list, XP, badges)
  - [ ] Quest detail and task completion
  - [ ] Portfolio view
  - [ ] Notifications (push notifications)
- [ ] Platform-specific features
  - [ ] Camera integration for evidence upload
  - [ ] Offline mode (cache quest data, sync when online)
- [ ] App store deployment
  - [ ] iOS App Store
  - [ ] Google Play Store
- [ ] Push notifications
  - [ ] Firebase Cloud Messaging or similar
  - [ ] Send on quest invitations, announcements, badge awards

**Files**:
- `mobile/` directory (new React Native project)

---

## Implementation Order Recommendation

### Week 1-2: Foundation & Security
1. **P0.1**: FERPA/COPPA Compliance (CRITICAL - blocks everything)
2. **P0.2**: RLS Audit (CRITICAL - security foundation)
3. **P0.3**: Data Migration (HIGH - required for multi-org)
4. **MVP.1**: Org-Specific Signup (easy win after migration)

### Week 3: Core LMS Features
5. **MVP.2**: Advisor/Teacher Role (required for assignments)
6. **MVP.3**: Quest Invitations (core workflow)
7. **MVP.4**: Announcements (communication channel)

### Week 4: Engagement & Compliance
8. **MVP.7**: Curriculum Builder Integration (backend APIs)
9. **MVP.8**: Audit Logging (compliance requirement)
10. **MVP.5**: Parent Progress Reports (stakeholder value)

### Week 5-6: Polish & Phase 2
11. **MVP.6**: Organization Branding (low effort, high impact)
12. **P2.2**: Analytics Dashboard (advisor tool)
13. **P2.3**: Notification System (UX improvement)
14. **P2.4**: Gradebook (advisor tool)

### Week 7+: Future Enhancements
15. **P2.1**: Quest Sharing (optional, can defer)
16. **P2.5**: Org Deactivation Workflow (important for scale)
17. **F3.1**: Canvas API Integration (if needed by customers)
18. **F3.2**: Portfolio Privacy Controls (student request)
19. **F3.3**: Advanced Curriculum Features (nice-to-have)
20. **F3.4**: Mobile App (long-term goal)

---

## Integration Points Summary

### Existing Systems to Leverage
1. **Canvas Converter** (`backend/services/canvas_converter.py`)
   - Update: Add org_id parameter to all functions
   - Update: Prefix `lms_course_id` with org identifier
   - Integration: MVP.7, F3.1

2. **Observer System** (`backend/routes/observer_routes.py`, `observer_audit_log`)
   - Expand: Extend audit logging to cover all student data access
   - Integration: P0.1 (FERPA), MVP.8 (audit logs)

3. **Organization Management** (`backend/routes/organization_routes.py`)
   - Expand: Add branding endpoints, deactivation logic
   - Integration: MVP.1, MVP.6, P2.5

4. **Existing Auth Flow** (`backend/routes/auth.py`, `frontend/src/contexts/AuthContext.jsx`)
   - Update: Add `org_slug` parameter to registration
   - Update: Redirect logic for advisor role
   - Integration: MVP.1, MVP.2

5. **Parental Consent** (`frontend/src/pages/ParentalConsentUploadPage.jsx`)
   - Already exists! Just need backend verification logic
   - Integration: P0.1 (COPPA)

### New Systems to Build
1. **Curriculum Builder** (started)
   - Components: ✅ MarkdownEditor, IframeEmbed, FileUploader
   - Needed: Backend APIs, file upload service
   - Integration: MVP.7

2. **Notification System** (future)
   - New table, endpoints, frontend components
   - Integration: P2.3

3. **Analytics Engine** (future)
   - Aggregate data from quests, tasks, users
   - Integration: P2.2

---

## Risk Mitigation

### High-Risk Areas
1. **FERPA/COPPA Compliance** → Get legal review FIRST
2. **RLS Policy Gaps** → Thorough audit + integration tests
3. **Data Migration** → Test on staging with production snapshot, rollback plan
4. **Canvas API Rate Limits** → Implement caching, respect API quotas
5. **File Upload Security** → Validate file types, scan for malware, size limits

### Testing Strategy
- **Unit Tests**: All new backend endpoints (95%+ coverage target)
- **Integration Tests**: RLS policies, cross-org access attempts
- **E2E Tests**: Critical flows (signup, quest invite, curriculum save)
- **Load Tests**: Simulate 100+ concurrent users per org
- **Security Audit**: Third-party pentest before production launch

---

## Success Metrics

### MVP Success Criteria
- ✅ 3+ schools sign up and onboard classes
- ✅ Advisors create and assign quests to students
- ✅ Students complete quests via LMS (not just direct signup)
- ✅ Parents view progress reports
- ✅ Zero FERPA/COPPA compliance violations
- ✅ 95%+ test coverage maintained
- ✅ < 2 second page load times

### Phase 2 Success Criteria
- ✅ 10+ schools using platform
- ✅ Advisors use analytics dashboard weekly
- ✅ Students engage with notifications (>50% open rate)
- ✅ Quest sharing between 2+ organizations

### Future Success Criteria
- ✅ 50+ schools, 5000+ students
- ✅ Canvas integration used by 20%+ of schools
- ✅ Mobile app downloaded by 30%+ of students
- ✅ Customer retention > 80% year-over-year

---

## Document Maintenance

This plan should be updated:
- After each phase completion (mark tasks complete, add learnings)
- When new requirements emerge (add to Future Enhancements)
- After tech debt is discovered (add to task backlog)

**Last Updated**: December 27, 2025
**Next Review**: After MVP completion
