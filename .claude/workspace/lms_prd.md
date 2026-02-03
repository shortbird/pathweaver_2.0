# Optio LMS Product Requirements Document

**Version:** 1.0
**Last Updated:** December 27, 2025
**Status:** Draft
**Product Owner:** Optio Education Platform Team

---

## 1. Executive Summary

### 1.1 Vision
Transform Optio from a supplemental gamification platform into a standalone Learning Management System (LMS) that embodies the "Process Is The Goal" philosophy. Optio LMS eliminates traditional grading systems, due dates, and pass/fail outcomes in favor of self-directed learning verified by advisors who focus on effort and engagement rather than performance metrics.

### 1.2 Core Philosophy
- **XP replaces grades:** All academic progress measured through experience points, not letter grades
- **No pass/fail:** Students cannot fail; they grow at their own pace
- **No due dates/terms:** Self-directed learning timelines without artificial semester constraints
- **Effort over outcomes:** Advisors verify and celebrate engagement, not evaluate performance
- **Multi-tenant architecture:** Strict row-level security (RLS) ensuring complete organizational data isolation

### 1.3 Target Users
- **Schools:** Alternative education institutions, homeschool co-ops, microschools
- **Students:** Self-directed learners (K-12 and beyond)
- **Parents:** Guardians monitoring dependent progress
- **Advisors:** Mentors verifying effort and providing guidance
- **Administrators:** School leaders managing curriculum and users

---

## 2. User Roles & Permissions

### 2.1 Superadmin
**Purpose:** Platform-level management and organization creation

**Capabilities:**
- Create new organizations with unique slugs and signup URLs
- Configure organization-level settings (quest visibility policies, branding)
- View aggregate platform analytics (not individual student data)
- Manage Canvas LTI integrations for organizations
- Access audit logs for all organizations (compliance purposes)
- Enable/disable organization accounts

**Restrictions:**
- Cannot view student academic data within organizations
- Cannot manage day-to-day operations within organizations

### 2.2 School Administrator
**Purpose:** Organization-level management and oversight

**Capabilities:**
- Manage organization profile (name, settings, policies)
- Create and manage advisor and student accounts within organization
- Configure quest visibility policy (org-wide, invitation-only, advisor-assigned)
- Create custom quests and curriculum for the organization
- View organization-wide analytics and reports
- Send organization-wide announcements
- Access audit logs for their organization
- Configure Canvas LTI settings for their organization

**Restrictions:**
- Cannot access data from other organizations
- Cannot delete the organization (must contact superadmin)

### 2.3 Advisor (Teacher/Mentor)
**Purpose:** Guide students and verify effort

**Capabilities:**
- View assigned students and their portfolios
- Verify task completions (approve/request revision)
- Create custom quests for assigned students
- Invite students to specific quests
- Send messages to students and parents
- View student XP progress and quest history
- Add notes to student profiles (visible to student and parents)
- Generate progress reports for students

**Restrictions:**
- Cannot assign grades or fail students
- Cannot view students outside their advisory group (unless granted access)
- Cannot modify organization settings

### 2.4 Parent (Observer)
**Purpose:** Monitor dependent's progress and support learning

**Capabilities:**
- View dependent's portfolio, XP, and completed quests
- Receive automated progress reports (weekly/monthly)
- View task completions and advisor notes
- Communicate with assigned advisor
- Manage dependent account settings (if account owner)

**Restrictions:**
- Cannot complete tasks on behalf of student
- Cannot view other students' data
- Cannot communicate with students outside their dependents

### 2.5 Student
**Purpose:** Engage in self-directed learning

**Capabilities:**
- Browse available quests based on visibility settings
- Start quests and create custom tasks
- Submit task completions for advisor verification
- Track XP across four pillars (Knowledge, Wisdom, Courage, Community)
- Earn and select badges
- Connect with peers via friendships
- View personal portfolio and progress
- Receive messages from advisors

**Restrictions:**
- Cannot access quests not made visible to them
- Cannot verify own task completions (requires advisor approval)
- Cannot view other students' full portfolios (only public badges/XP if friended)

---

## 3. Organization Management

### 3.1 Multi-Tenant Architecture
**Database Design:**
- All core tables include `organization_id` foreign key
- Row-Level Security (RLS) policies enforce strict data isolation
- Each organization has unique:
  - Slug (URL-safe identifier)
  - Signup URL (`https://optioeducation.com/join/{org_slug}`)
  - Branding configuration (optional: logo, colors, welcome message)

**Organization Creation Workflow:**
1. Superadmin creates organization record via admin panel
2. System generates unique slug and signup URL
3. Superadmin creates initial school admin account
4. School admin receives invitation email with setup instructions
5. School admin configures organization settings and creates users

### 3.2 Organization Settings
**Configurable Parameters:**
- **Quest Visibility Policy:**
  - `org_wide`: All students see all active quests
  - `invitation_only`: Students only see quests they're explicitly invited to
  - `advisor_assigned`: Advisors assign quests to specific students
- **Announcement Permissions:** Who can send org-wide announcements
- **Parent Access Level:** What data parents can view
- **Friendship Policy:** Allow/restrict student friendships within org
- **Badge Display:** Public vs. private badge visibility
- **LMS Integration:** Enable Canvas LTI, course sync settings

### 3.3 Signup Flow
**Organization-Specific Registration:**
1. User visits `https://optioeducation.com/join/{org_slug}`
2. System validates org slug and checks if organization is active
3. Registration form includes:
   - Email, password, display name
   - Role selection (student/parent/advisor) - validated by school admin
   - Parent code (if registering as dependent student)
4. Account created with `organization_id` set automatically
5. School admin receives notification to approve new account
6. Upon approval, user receives welcome email with onboarding guide

---

## 4. Quest Visibility & Invitations

### 4.1 Quest Visibility Policies
**Org-Wide Visibility:**
- All active quests appear in student quest library
- Students self-select quests based on interest
- Advisors monitor which quests students start

**Invitation-Only:**
- Quests hidden by default
- Advisors explicitly invite students to specific quests
- Students receive notification when invited
- Quest appears in their library only after invitation

**Advisor-Assigned:**
- Advisors create personalized quest pathways
- Students see only quests assigned by their advisor
- Supports differentiated learning plans

### 4.2 Quest Invitation Workflow
**Step-by-Step:**
1. Advisor navigates to quest detail page
2. Clicks "Invite Students" button
3. Selects students from advisory group or search
4. Optionally adds invitation message
5. System creates invitation records
6. Students receive in-app and email notifications
7. Quest appears in student's "Invited Quests" section
8. Student can accept/decline (declining removes from library)

### 4.3 Quest Types in LMS Context
**Curriculum Quests:**
- Created by school admin or advisors
- Tied to learning objectives/standards (optional metadata)
- Can be cloned and customized per student
- Support prerequisite chains (Quest B unlocks after Quest A completion)

**Student-Created Quests:**
- Students propose custom learning projects
- Requires advisor approval before tasks can be verified
- Encourages agency and self-directed exploration

**LTI-Imported Quests:**
- Synced from Canvas courses via LTI integration
- Assignments become Optio tasks
- Grade passback disabled (send XP instead)

---

## 5. Custom Curriculum Builder

### 5.1 Quest Creation Interface
**Fields:**
- Title, description, quest type (curriculum/project/collaboration)
- Pillar alignment (Knowledge, Wisdom, Courage, Community)
- Visibility settings (public, invitation-only, advisor-assigned)
- Prerequisites (other quests that must be completed first)
- Learning objectives (optional text field for standards alignment)
- Estimated XP range
- Cover image upload

**Task Pre-Definition:**
- Advisors can pre-populate tasks when creating curriculum quests
- Each task includes: title, pillar, XP value, description/instructions
- Students can add additional custom tasks to the quest
- Pre-defined tasks serve as guided structure, not rigid requirements

### 5.2 Quest Templates
**Template Library:**
- School admin and advisors can save quests as templates
- Templates shareable within organization
- Clone and customize templates for different students
- Supports curriculum standardization while maintaining flexibility

**Template Marketplace (Future Phase):**
- Superadmin-curated public templates
- Organizations can opt-in to share templates across platform
- Community-driven curriculum resources

### 5.3 Quest Cloning & Differentiation
**Use Case:** Advisor wants 5 students to do similar quest with modifications

**Workflow:**
1. Create master quest as template
2. Clone quest 5 times (one per student)
3. Customize task XP values, descriptions, or add/remove tasks
4. Assign each cloned quest to specific student
5. Students progress independently through their version

---

## 6. Communication & Announcements

### 6.1 Announcement System
**Org-Wide Announcements:**
- Created by school admins (and advisors if permitted)
- Appear on all users' dashboards within organization
- Support rich text, links, attachments
- Can target specific roles (e.g., "Parents only")

**Advisory Group Announcements:**
- Advisors send messages to their assigned students
- Visible to students and their parents
- Supports scheduling (send later)

**Direct Messaging:**
- One-on-one communication between advisor and student
- Parents can view messages to/from their dependents
- No student-to-student messaging (use friendships for peer interaction)

### 6.2 Notification System
**Notification Types:**
- Task verification results (approved/revision requested)
- Quest invitations
- New announcements
- Friendship requests
- Badge earned
- Weekly/monthly progress reports

**Delivery Channels:**
- In-app notification center
- Email (user-configurable preferences)
- Optional SMS for critical updates (future phase)

---

## 7. Parent Progress Reports

### 7.1 Automated Reports
**Weekly Digest:**
- Tasks completed this week
- XP earned by pillar
- Quests started/completed
- Advisor notes added
- Upcoming milestones

**Monthly Summary:**
- Total XP growth trend
- Quest completion rate
- Pillar balance visualization
- Badges earned
- Advisor commentary (if provided)

### 7.2 On-Demand Reports
**Generate Custom Report:**
- Date range selection
- Filter by pillar or quest
- Include/exclude specific metrics
- Export as PDF
- Email to parent and cc advisor

### 7.3 Parent Dashboard
**Real-Time View:**
- Current XP totals across pillars
- Active quests and progress
- Recently completed tasks (last 10)
- Upcoming advisor meetings (if scheduled)
- Quick link to message advisor

---

## 8. Audit Logging

### 8.1 What Gets Logged
**User Actions:**
- Login/logout events
- Account creation/deletion/role changes
- Quest creation/modification
- Task completion submissions and verifications
- Quest invitations sent
- Announcements created
- Settings changes

**Administrative Actions:**
- Organization configuration changes
- User role modifications
- Quest visibility policy changes
- Bulk user imports
- LTI configuration changes

### 8.2 Audit Log Schema
**Fields:**
- Timestamp (UTC)
- Organization ID
- User ID (actor)
- Target user ID (if applicable)
- Action type (enum)
- Resource type (quest, task, user, etc.)
- Resource ID
- Old value / New value (for updates)
- IP address
- User agent

### 8.3 Access & Retention
**Access Levels:**
- Superadmin: All audit logs across platform
- School Admin: Logs for their organization only
- Advisors: No direct access (can request from school admin)

**Retention Policy:**
- Keep all logs for 7 years (compliance with educational records laws)
- Automated archival to cold storage after 2 years
- Searchable and exportable via admin interface

### 8.4 Compliance Use Cases
- Investigate data access patterns
- Track changes to student records
- Verify advisor verification activity
- Audit organization configuration history
- Support FERPA compliance requirements

---

## 9. Canvas LTI Integration

### 9.1 LTI 1.3 Implementation
**Integration Points:**
- Deep linking: Embed Optio quests in Canvas modules
- Grade passback: Send XP totals to Canvas gradebook (optional)
- Names and Roles Provisioning: Auto-sync student roster
- Assignment and Grade Services: Sync Canvas assignments as Optio quests

### 9.2 Configuration Workflow
**School Admin Setup:**
1. Enable Canvas integration in org settings
2. Generate LTI 1.3 credentials (client ID, deployment ID)
3. Configure Canvas Developer Key with Optio redirect URIs
4. Test connection with Canvas test environment
5. Map Canvas course to Optio organization
6. Configure sync preferences (one-way vs. two-way)

### 9.3 Quest Sync Logic
**Canvas Assignment → Optio Quest:**
- Create quest with title/description from Canvas assignment
- Set due date as quest metadata (not enforced, for context only)
- Import assignment description as quest description
- Create single pre-defined task matching assignment

**XP → Canvas Grade (Optional):**
- School can choose to pass XP back as percentage
- Formula: `(XP earned / XP possible) * 100`
- Note in Canvas: "This is an XP-based score, not a traditional grade"

### 9.4 Single Sign-On (SSO)
**LTI Launch Flow:**
1. Student clicks Optio link in Canvas
2. Canvas sends LTI launch request with user ID
3. Optio validates signature and organization
4. If user exists: auto-login via session token
5. If new user: create account with Canvas data (name, email, role)
6. Redirect to requested Optio quest or dashboard

---

## 10. Technical Architecture

### 10.1 Database Schema Updates
**New Tables:**

```sql
-- Organizations
organizations
  - id (uuid, PK)
  - name (text)
  - slug (text, unique)
  - quest_visibility_policy (enum: org_wide, invitation_only, advisor_assigned)
  - is_active (boolean)
  - created_at (timestamp)
  - settings (jsonb)

-- Audit Logs
audit_logs
  - id (uuid, PK)
  - organization_id (uuid, FK)
  - user_id (uuid, FK, nullable)
  - action_type (text)
  - resource_type (text)
  - resource_id (uuid, nullable)
  - old_value (jsonb, nullable)
  - new_value (jsonb, nullable)
  - ip_address (inet)
  - user_agent (text)
  - created_at (timestamp)

-- Quest Invitations
quest_invitations
  - id (uuid, PK)
  - quest_id (uuid, FK)
  - student_id (uuid, FK)
  - invited_by (uuid, FK)
  - invitation_message (text, nullable)
  - status (enum: pending, accepted, declined)
  - created_at (timestamp)
  - responded_at (timestamp, nullable)

-- Announcements
announcements
  - id (uuid, PK)
  - organization_id (uuid, FK)
  - author_id (uuid, FK)
  - title (text)
  - content (text)
  - target_roles (text[], nullable)
  - is_pinned (boolean)
  - created_at (timestamp)
  - expires_at (timestamp, nullable)

-- LTI Configurations
lti_configs
  - id (uuid, PK)
  - organization_id (uuid, FK)
  - platform_name (text)
  - client_id (text)
  - deployment_id (text)
  - auth_endpoint (text)
  - token_endpoint (text)
  - jwks_url (text)
  - sync_enabled (boolean)
  - grade_passback_enabled (boolean)
  - created_at (timestamp)
```

**Updated Tables:**
- `users`: Add `organization_id (FK)`, `role (enum: superadmin, school_admin, advisor, parent, student)`
- `quests`: Add `organization_id (FK)`, `visibility (enum)`, `created_by (FK)`, `prerequisites (uuid[])`
- `user_quest_tasks`: Add `verification_notes (text)`, `verified_by (FK)`, `verified_at (timestamp)`

### 10.2 RLS Policies
**Core Principle:** All queries filtered by `organization_id` matching user's organization

**Example Policies:**
```sql
-- Users can only see users in their organization
CREATE POLICY users_org_isolation ON users
  FOR SELECT
  USING (organization_id = current_setting('app.current_organization_id')::uuid);

-- Students only see quests based on visibility policy
CREATE POLICY quest_visibility ON quests
  FOR SELECT
  USING (
    organization_id = current_setting('app.current_organization_id')::uuid
    AND (
      visibility = 'org_wide'
      OR id IN (SELECT quest_id FROM quest_invitations WHERE student_id = current_setting('app.current_user_id')::uuid AND status = 'accepted')
    )
  );
```

### 10.3 API Endpoints
**New Routes:**
- `POST /api/organizations` (superadmin only)
- `GET /api/organizations/:id/settings`
- `PUT /api/organizations/:id/settings`
- `POST /api/quests/:id/invite` (advisors)
- `GET /api/quests/invitations` (students)
- `POST /api/quests/invitations/:id/respond` (accept/decline)
- `GET /api/announcements` (all users)
- `POST /api/announcements` (admins/advisors)
- `GET /api/audit-logs` (admins only)
- `POST /api/lti/launch` (LTI provider)
- `GET /api/reports/student/:id` (parents/advisors)

---

## 11. User Experience Flows

### 11.1 New Student Onboarding
1. Receive signup link from school: `optioeducation.com/join/lincoln-academy`
2. Register with email, password, display name
3. Select role: "Student" or "Student (Dependent)" - if dependent, enter parent code
4. Await school admin approval (notification email sent)
5. Upon approval, receive welcome email with login link
6. First login: guided tour of dashboard, quest library, XP pillars
7. Browse available quests (based on org visibility policy)
8. Start first quest or receive advisor-assigned quest

### 11.2 Advisor Verifying Task
1. Receive notification: "Student completed task: 'Read Chapter 3'"
2. Navigate to student's task completion page
3. Review student's submission (text, attachments, reflection)
4. Choose:
   - **Approve:** XP awarded, task marked complete, student notified
   - **Request Revision:** Add notes explaining what to improve, student notified
5. Optionally add private note to student's profile (visible to student and parents)

### 11.3 Parent Checking Progress
1. Login to parent dashboard
2. See dependent's XP totals across 4 pillars (visual chart)
3. View "Recent Activity" feed: tasks completed this week
4. Read latest advisor note: "Great effort on the research project!"
5. Click "Generate Report" to create PDF summary for last month
6. Email advisor with question about upcoming quest

### 11.4 School Admin Creating Curriculum
1. Navigate to "Quest Builder" in admin panel
2. Create new quest: "American Revolution Study"
3. Set visibility: "Advisor-Assigned"
4. Add 5 pre-defined tasks:
   - "Watch documentary" (Wisdom, 50 XP)
   - "Read primary sources" (Knowledge, 100 XP)
   - "Create timeline" (Knowledge, 75 XP)
   - "Discussion with advisor" (Community, 50 XP)
   - "Reflection essay" (Courage, 100 XP)
5. Save as template for future use
6. Notify advisors that new curriculum quest is available

---

## 12. Success Metrics

### 12.1 Product KPIs
- **Student Engagement:** Average quests started per student per month
- **Task Completion Rate:** % of started tasks that get verified
- **Advisor Activity:** Average task verifications per advisor per week
- **Parent Engagement:** % of parents logging in at least monthly
- **XP Distribution:** Balance across 4 pillars (ideal: 25% each)
- **Organization Growth:** New orgs created per quarter

### 12.2 Philosophy Alignment Metrics
- **Self-Direction:** % of quests that are student-created vs. assigned
- **No Grades:** Zero instances of grade-like language in advisor notes (monitored via audit logs)
- **Process Focus:** Average time spent in quests (longer = deeper engagement)
- **Effort Verification:** % of tasks approved on first submission (target: 70-80%, shows students understand expectations)

### 12.3 Technical Performance
- **Page Load Time:** < 2 seconds for dashboard
- **API Response Time:** < 500ms for quest/task queries
- **Uptime:** 99.9% availability
- **RLS Enforcement:** Zero cross-organization data leaks (verified via automated testing)

---

## 13. Rollout Plan

### 13.1 Phase 1: Foundation (Months 1-3)
- Implement multi-tenant architecture and RLS policies
- Build organization management for superadmin
- Create school admin dashboard
- Develop advisor and student basic workflows
- Launch with 2-3 pilot schools

### 13.2 Phase 2: Core Features (Months 4-6)
- Complete custom curriculum builder
- Implement quest invitation system
- Add parent progress reports
- Build announcement and messaging system
- Audit logging implementation
- Expand to 10-15 schools

### 13.3 Phase 3: Integration (Months 7-9)
- Canvas LTI 1.3 integration
- SSO via LTI
- Quest sync and grade passback
- Template library launch
- Scale to 25+ schools

### 13.4 Phase 4: Optimization (Months 10-12)
- Advanced analytics for advisors and admins
- Mobile app development
- Performance optimization
- Template marketplace beta
- Full public launch

---

## 14. Open Questions & Future Considerations

### 14.1 Questions for Stakeholders
1. Should advisors be able to modify student-created tasks, or only approve/deny the quest?
2. What level of Canvas grade passback do schools want? (XP only, or also map to letter grades?)
3. Should superadmin have emergency access to student data for support requests?
4. Do we need real-time collaboration features (multiple students working on same quest)?
5. How should we handle student transfers between organizations?

### 14.2 Future Features (Post-Launch)
- **Competency-Based Progression:** Map XP to learning standards/competencies
- **Peer Review:** Students verify each other's tasks (advisor still approves)
- **Quest Chains:** Multi-quest pathways with branching based on student choice
- **AI Advisor Assistant:** Suggest quests based on student interests and XP gaps
- **Public Portfolios:** Students can publish portfolios for college/job applications
- **Video Conferencing:** Built-in advisor-student video calls
- **Mobile App:** Native iOS/Android apps for on-the-go task submission

### 14.3 Risks & Mitigations
**Risk:** Schools resist "no grades" model
**Mitigation:** Offer XP → grade mapping as optional export feature, emphasize college acceptance data from pilot schools

**Risk:** Advisors struggle with verification workload
**Mitigation:** Build batch verification UI, suggest peer review systems, provide advisor training

**Risk:** Multi-tenant RLS bugs cause data leaks
**Mitigation:** Extensive automated testing, third-party security audit, bug bounty program

**Risk:** Canvas integration breaks with LTI spec changes
**Mitigation:** Use Instructure's official libraries, maintain test environment, monitor Canvas developer forums

---

## 15. Conclusion

Optio LMS represents a paradigm shift from traditional educational technology. By eliminating grades, due dates, and failure, we create space for genuine self-directed learning where students own their educational journey. The multi-tenant architecture enables schools to maintain their unique cultures while benefiting from shared platform infrastructure.

Success depends on rigorous adherence to the "Process Is The Goal" philosophy in every feature decision. When in doubt, we ask: "Does this feature celebrate effort and growth, or does it measure outcomes?" This PRD provides the roadmap to build an LMS that truly serves learners, not just administrators.

**Next Steps:**
1. Review and approve this PRD with stakeholders
2. Create technical architecture diagrams
3. Break down into implementation sprints
4. Begin Phase 1 development with pilot schools
