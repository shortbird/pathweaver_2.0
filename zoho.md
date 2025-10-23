# Zoho CRM Integration - Long-Term Implementation Plan

## Executive Summary

This document outlines a comprehensive 4-phase integration plan between Optio and Zoho CRM to transform platform administration, student engagement, parent communication, and institutional partnerships. The integration will enhance every aspect of the platform from user lifecycle management to revenue operations.

**Timeline**: 12-18 months
**Primary Tools**: Zoho CRM, Zoho Campaigns, Zoho Desk, Zoho Analytics, Zoho Subscriptions
**Integration Method**: REST API bi-directional sync + webhook events

---

## Phase 1: Foundation & Core Infrastructure (Months 1-3)

### Objectives
- Establish bi-directional data sync between Optio and Zoho CRM
- Implement basic email infrastructure for transactional communications
- Define and track student lifecycle stages
- Create foundational CRM data model

### Technical Architecture

**Data Sync Strategy**:
- Real-time webhook events for critical actions (registration, quest completion, safety events)
- Nightly batch sync for aggregate data (XP totals, engagement scores, badge counts)
- Bi-directional sync to keep Optio database and CRM in sync

**CRM Data Model**:

**Contacts Module** (Students):
- Standard fields: email, first_name, last_name, phone
- Custom fields:
  - `optio_user_id` (UUID, unique identifier)
  - `display_name` (string)
  - `role` (student/parent/advisor/admin/observer)
  - `current_level` (Explorer/Builder/Creator/Scholar/Sage)
  - `total_xp` (number)
  - `active_quest_count` (number)
  - `completed_quest_count` (number)
  - `badge_count` (number)
  - `connection_count` (number)
  - `portfolio_slug` (string)
  - `portfolio_url` (formula: https://www.optioeducation.com/diploma/{optio_user_id})
  - `last_active_date` (date)
  - `registration_date` (date)
  - `email_verified` (boolean)
  - `lifecycle_stage` (picklist: see below)
  - `engagement_score` (number, 0-100)
  - `at_risk_flag` (boolean)
  - `pillar_primary` (picklist: STEM/Wellness/Communication/Civics/Art)
  - `utm_source` (string, acquisition tracking)
  - `utm_medium` (string)
  - `utm_campaign` (string)
  - `referral_code_used` (string)

**Lifecycle Stages**:
1. **Prospect** - Registered but not verified email
2. **New User** - Verified email, 0 quests started
3. **Activated** - Started first quest
4. **Engaged** - Completed 1+ quest, active in last 7 days
5. **Power User** - Completed 5+ quests, 3+ connections
6. **At Risk** - No activity in 14+ days OR started quest but no progress in 7+ days
7. **Dormant** - No activity in 30+ days
8. **Churned** - No activity in 90+ days
9. **Reactivated** - Returned after being dormant/churned

**Contacts Module** (Parents):
- Standard fields: email, first_name, last_name, phone
- Custom fields:
  - `optio_user_id` (UUID)
  - `linked_student_ids` (multi-select lookup to student contacts)
  - `linked_student_count` (number)
  - `dashboard_last_login` (datetime)
  - `evidence_upload_count` (number)
  - `tutor_monitoring_enabled` (boolean)
  - `parent_engagement_score` (number, 0-100)

**Custom Module: Learning Activities**
- Tracks all major student actions for timeline view
- Fields:
  - `student_id` (lookup to Contacts)
  - `activity_type` (picklist: quest_started, quest_completed, task_completed, badge_unlocked, connection_made, evidence_uploaded, tutor_session)
  - `activity_date` (datetime)
  - `quest_title` (string, nullable)
  - `pillar` (picklist, nullable)
  - `xp_earned` (number, nullable)
  - `details` (text area, JSON blob with additional context)

**Custom Module: Safety Events**
- Tracks AI tutor safety flags for monitoring and parent alerts
- Fields:
  - `student_id` (lookup to Contacts)
  - `conversation_id` (string)
  - `message_id` (string)
  - `flagged_content` (text area)
  - `safety_level` (picklist: safe, warning, blocked, requires_review)
  - `safety_score` (number)
  - `action_taken` (text area)
  - `parent_notified` (boolean)
  - `parent_notification_date` (datetime)
  - `reviewed_by` (lookup to admin user)
  - `event_date` (datetime)

### Phase 1 Implementation Tasks

#### Backend Development

- [ ] **Create Zoho CRM Integration Service** (`backend/services/zoho_crm_service.py`)
  - [ ] Set up Zoho OAuth 2.0 authentication
  - [ ] Implement token refresh mechanism
  - [ ] Create base API client with rate limiting
  - [ ] Add error handling and retry logic
  - [ ] Implement request/response logging for debugging

- [ ] **Implement Contact Sync Functions**
  - [ ] `create_contact(user_data)` - Create CRM contact on user registration
  - [ ] `update_contact(user_id, updates)` - Sync user profile changes
  - [ ] `get_contact(user_id)` - Fetch CRM contact data
  - [ ] `calculate_engagement_score(user_id)` - Algorithm for engagement scoring
  - [ ] `update_lifecycle_stage(user_id)` - Automatic stage progression logic

- [ ] **Create Learning Activity Logging**
  - [ ] `log_activity(user_id, activity_type, details)` - Generic activity logger
  - [ ] `log_quest_started(user_id, quest_id)` - Quest start event
  - [ ] `log_quest_completed(user_id, quest_id, xp_earned)` - Quest completion event
  - [ ] `log_task_completed(user_id, task_id, xp_earned)` - Task completion event
  - [ ] `log_badge_unlocked(user_id, badge_id)` - Badge achievement event
  - [ ] `log_connection_made(user_id, friend_id)` - Connection event

- [ ] **Implement Safety Event Sync**
  - [ ] `create_safety_event(event_data)` - Log safety flag to CRM
  - [ ] `trigger_parent_alert(event_id)` - Send parent notification via email
  - [ ] Update `backend/routes/tutor.py` to call CRM logging on safety events

- [ ] **Add Webhooks to Existing Routes**
  - [ ] `backend/routes/auth.py`:
    - [ ] On registration → Create CRM contact
    - [ ] On email verification → Update lifecycle stage to "New User"
    - [ ] On login → Update `last_active_date` in CRM
  - [ ] `backend/routes/quests.py`:
    - [ ] On quest start → Log activity + update lifecycle stage
    - [ ] On task completion → Log activity + update engagement score
    - [ ] On quest completion → Log activity + update stats
  - [ ] `backend/services/badge_service.py`:
    - [ ] On badge unlock → Log activity
  - [ ] `backend/routes/community.py`:
    - [ ] On connection accepted → Log activity + update connection_count

- [ ] **Create Batch Sync Service** (`backend/services/zoho_batch_sync.py`)
  - [ ] `sync_all_users()` - Nightly sync of all user stats
  - [ ] `sync_engagement_scores()` - Recalculate all engagement scores
  - [ ] `sync_lifecycle_stages()` - Update all lifecycle stages
  - [ ] `sync_at_risk_flags()` - Flag students meeting at-risk criteria
  - [ ] Add Flask CLI command for manual sync: `flask zoho sync-users`

- [ ] **Environment Variables**
  - [ ] Add to both dev and prod Render services:
    - [ ] `ZOHO_CLIENT_ID` - OAuth client ID
    - [ ] `ZOHO_CLIENT_SECRET` - OAuth client secret
    - [ ] `ZOHO_REFRESH_TOKEN` - Long-lived refresh token
    - [ ] `ZOHO_ORGANIZATION_ID` - Zoho org ID
    - [ ] `ZOHO_API_DOMAIN` - Region-specific API domain (e.g., https://www.zohoapis.com)
    - [ ] `ENABLE_ZOHO_SYNC` - Feature flag (default: true)

#### Zoho CRM Configuration

- [ ] **Initial Setup**
  - [ ] Create Zoho CRM account (or use existing)
  - [ ] Set up OAuth client in Zoho API Console
  - [ ] Configure API scopes: ZohoCRM.modules.ALL, ZohoCRM.settings.ALL
  - [ ] Generate initial refresh token

- [ ] **CRM Customization**
  - [ ] Create custom fields in Contacts module (students)
  - [ ] Create custom fields in Contacts module (parents)
  - [ ] Create custom picklists (lifecycle_stage, pillar, activity_type, etc.)
  - [ ] Create custom module: Learning Activities
  - [ ] Create custom module: Safety Events
  - [ ] Set up lookup relationships between modules

- [ ] **Workflows & Automation**
  - [ ] Workflow: Auto-update lifecycle stage based on field changes
  - [ ] Workflow: Flag contact as "at_risk" when last_active_date > 14 days
  - [ ] Workflow: Create task for admin when safety event requires review
  - [ ] Email alert: Notify admin when contact reaches "Power User" stage
  - [ ] Email alert: Notify admin when contact reaches "Churned" stage

- [ ] **Views & Segmentation**
  - [ ] Create view: "At Risk Students" (at_risk_flag = true)
  - [ ] Create view: "Power Users" (lifecycle_stage = Power User)
  - [ ] Create view: "New Users (Last 7 Days)" (registration_date within 7 days)
  - [ ] Create view: "Dormant Students" (lifecycle_stage = Dormant OR Churned)
  - [ ] Create view: "Parents with Multiple Students" (linked_student_count > 1)

#### Email Infrastructure (Zoho Campaigns)

- [ ] **Zoho Campaigns Setup**
  - [ ] Create Zoho Campaigns account (or link existing)
  - [ ] Connect Zoho Campaigns to Zoho CRM
  - [ ] Set up API integration between Optio backend and Campaigns
  - [ ] Configure sending domain (emails@optioeducation.com)
  - [ ] Set up SPF/DKIM/DMARC records for email deliverability

- [ ] **Backend Email Service** (`backend/services/zoho_email_service.py`)
  - [ ] `send_transactional_email(to, template_id, merge_vars)` - Generic email sender
  - [ ] `send_verification_email(user_id)` - Email verification
  - [ ] `send_password_reset_email(user_id, reset_token)` - Password reset
  - [ ] `send_welcome_email(user_id)` - Post-verification welcome
  - [ ] `send_quest_completion_email(user_id, quest_id)` - Celebration email
  - [ ] `send_badge_unlock_email(user_id, badge_id)` - Badge achievement
  - [ ] `send_parent_safety_alert(parent_id, student_id, event_id)` - Safety notification

- [ ] **Email Templates (Zoho Campaigns)**
  - [ ] **Transactional Templates**:
    - [ ] Email verification ("Verify your Optio account")
    - [ ] Password reset ("Reset your Optio password")
    - [ ] Welcome email ("Welcome to Optio - Your learning journey starts now")
  - [ ] **Engagement Templates**:
    - [ ] Quest completion celebration ("You completed [Quest Name]!")
    - [ ] Badge unlock announcement ("You unlocked the [Badge Name] badge!")
    - [ ] First connection celebration ("You made your first connection!")
  - [ ] **Parent Templates**:
    - [ ] Parent invitation accepted ("Your parent now has dashboard access")
    - [ ] Safety alert ("Optio AI Tutor Safety Alert for [Student Name]")
  - [ ] **Re-engagement Templates**:
    - [ ] 7-day inactive ("We miss you! Come back and continue [Quest Name]")
    - [ ] 30-day inactive ("Your quests are waiting for you")

- [ ] **Update Existing Routes to Use Email Service**
  - [ ] `backend/routes/auth.py` → Replace manual email sending with Zoho service
  - [ ] `backend/routes/quests.py` → Add celebration emails on completion
  - [ ] `backend/services/badge_service.py` → Add badge unlock emails

#### Testing & Validation

- [ ] **Integration Tests**
  - [ ] Test contact creation on user registration (dev environment)
  - [ ] Test activity logging on quest completion
  - [ ] Test lifecycle stage progression (prospect → new user → activated)
  - [ ] Test safety event logging and parent alert
  - [ ] Test batch sync service with sample data
  - [ ] Test email delivery for all transactional templates

- [ ] **Data Quality Checks**
  - [ ] Verify all existing users sync to CRM correctly
  - [ ] Validate engagement score calculations
  - [ ] Confirm lifecycle stages match actual user behavior
  - [ ] Check for duplicate contacts in CRM

- [ ] **Performance Monitoring**
  - [ ] Monitor API rate limits (Zoho CRM: 10k calls/day for free tier)
  - [ ] Track webhook processing time (should be <500ms)
  - [ ] Monitor batch sync duration (should complete in <30 min)
  - [ ] Set up error alerting for failed sync attempts

#### Documentation

- [ ] **Technical Documentation**
  - [ ] Document Zoho CRM data model in `zoho.md`
  - [ ] Create API integration guide for developers
  - [ ] Document engagement score calculation algorithm
  - [ ] Create troubleshooting guide for sync issues

- [ ] **Operational Documentation**
  - [ ] Create admin guide for using CRM views
  - [ ] Document how to manually trigger sync
  - [ ] Create runbook for handling sync failures
  - [ ] Document email template customization process

---

## Phase 2: Engagement & Retention (Months 4-6)

### Objectives
- Launch automated re-engagement campaigns for inactive students
- Implement comprehensive parent communication system
- Set up customer support infrastructure with full context
- Build proactive student success workflows

### Phase 2 Implementation Tasks

#### Re-Engagement Campaigns

- [ ] **Campaign Strategy**
  - [ ] Define re-engagement triggers (7-day, 14-day, 30-day, 90-day inactive)
  - [ ] Create campaign messaging aligned with "Process Is The Goal" philosophy
  - [ ] Design A/B test framework for email subject lines and copy
  - [ ] Set up conversion tracking (email open → login → quest activity)

- [ ] **Zoho CRM Workflows**
  - [ ] Workflow: Add contact to "7-Day Inactive" campaign list
  - [ ] Workflow: Add contact to "14-Day Inactive" campaign list
  - [ ] Workflow: Add contact to "30-Day Inactive" campaign list
  - [ ] Workflow: Add contact to "90-Day Reactivation" campaign list
  - [ ] Workflow: Remove from campaign lists when user becomes active again

- [ ] **Zoho Campaigns - Automated Email Sequences**
  - [ ] **7-Day Inactive Sequence** (students who started quest but no progress):
    - [ ] Email 1 (Day 7): "Stuck on [Quest Name]? Here's a tip..."
    - [ ] Email 2 (Day 9): "Your learning journey is waiting"
    - [ ] Exit trigger: User completes task OR starts new quest
  - [ ] **14-Day Inactive Sequence** (no login in 14 days):
    - [ ] Email 1 (Day 14): "We miss you! Your connections are still learning"
    - [ ] Email 2 (Day 17): "Check out these new quests in [Pillar]"
    - [ ] Exit trigger: User logs in
  - [ ] **30-Day Dormant Sequence** (no activity in 30 days):
    - [ ] Email 1 (Day 30): "Come back and celebrate your progress so far"
    - [ ] Email 2 (Day 35): "Your diploma is waiting to be completed"
    - [ ] Email 3 (Day 40): "Last chance - we'd love to see you back"
    - [ ] Exit trigger: User logs in OR quest activity
  - [ ] **90-Day Reactivation Sequence** (churned users):
    - [ ] Email 1 (Day 90): "We've added new features since you left"
    - [ ] Email 2 (Day 100): "Your friends are still learning - join them!"
    - [ ] Email 3 (Day 110): "Special offer: Get back in the flow"

- [ ] **Backend Support for Campaign Tracking**
  - [ ] Add UTM parameter tracking on all campaign links
  - [ ] Log campaign engagement events to CRM (email opened, clicked, converted)
  - [ ] Create endpoint: `GET /api/campaigns/track/:user_id/:campaign_id/:event_type`
  - [ ] Update frontend to track campaign conversions (user came from email link)

- [ ] **Campaign Performance Monitoring**
  - [ ] Set up Zoho Analytics dashboard for campaign metrics
  - [ ] Track: open rate, click rate, conversion rate per sequence
  - [ ] Monitor: reactivation rate by inactive duration
  - [ ] Weekly report: campaign performance summary sent to admin

#### Parent Communication System

- [ ] **Parent Onboarding Sequence**
  - [ ] Email 1 (Immediate): "Welcome! You now have access to [Student]'s dashboard"
  - [ ] Email 2 (Day 3): "How to support your learner's journey"
  - [ ] Email 3 (Day 7): "Understanding the five skill pillars"
  - [ ] Email 4 (Day 14): "Your parent dashboard guide"

- [ ] **Ongoing Parent Engagement**
  - [ ] **Weekly Progress Email** (sent every Monday):
    - [ ] Subject: "[Student Name]'s Learning This Week"
    - [ ] Content: Quests completed, XP earned, badges unlocked, learning rhythm indicator
    - [ ] CTA: "View Full Dashboard" button
    - [ ] Process-focused language: "Here's what [Student] explored this week"
  - [ ] **Monthly Milestone Email** (sent 1st of month):
    - [ ] Subject: "[Student Name]'s Journey This Month"
    - [ ] Content: Monthly XP growth, new pillars explored, connection activity
    - [ ] Encouragement tips based on pillar preferences
    - [ ] Social sharing prompt: "Share [Student]'s diploma"

- [ ] **Parent Alert System**
  - [ ] **Safety Alerts** (immediate):
    - [ ] Trigger: AI tutor flags content as "warning", "blocked", or "requires_review"
    - [ ] Email includes: conversation context, flagged content, action taken
    - [ ] CTA: "View Conversation in Tutor Dashboard"
  - [ ] **Inactivity Alerts** (weekly digest):
    - [ ] Trigger: Student has no activity for 14+ days
    - [ ] Email: "It's been quiet for [Student] this week"
    - [ ] Conversation starters: Process-focused questions to ask student
  - [ ] **Overdue Task Alerts** (daily digest):
    - [ ] Trigger: Student has tasks overdue by 7+ days
    - [ ] Email: "Gentle nudge: [Student] has tasks waiting"
    - [ ] Supportive language: "Sometimes we all need a little reminder"

- [ ] **Backend Parent Email Service** (`backend/services/parent_email_service.py`)
  - [ ] `send_parent_onboarding_sequence(parent_id, student_id)` - Trigger sequence
  - [ ] `send_weekly_progress_email(parent_id, student_id)` - Weekly automation
  - [ ] `send_monthly_milestone_email(parent_id, student_id)` - Monthly automation
  - [ ] `send_safety_alert(parent_id, student_id, event_id)` - Immediate alert
  - [ ] `send_inactivity_alert(parent_id, student_id, days_inactive)` - Weekly check
  - [ ] `send_overdue_task_alert(parent_id, student_id, overdue_tasks)` - Daily check

- [ ] **Scheduled Jobs** (add to backend)
  - [ ] Daily cron job (8am): Check for overdue tasks → send parent alerts
  - [ ] Weekly cron job (Monday 6am): Generate and send weekly progress emails
  - [ ] Monthly cron job (1st of month, 6am): Generate and send monthly milestone emails
  - [ ] Hourly cron job: Check for new safety events → send immediate alerts

- [ ] **Parent Preference Management**
  - [ ] Add parent settings page: `frontend/src/pages/ParentSettingsPage.jsx`
  - [ ] Backend endpoint: `PUT /api/parent/settings/:parentId`
  - [ ] Preferences to manage:
    - [ ] Weekly progress email (on/off)
    - [ ] Monthly milestone email (on/off)
    - [ ] Safety alerts (always on, cannot disable)
    - [ ] Inactivity alerts (on/off)
    - [ ] Overdue task alerts (on/off)
    - [ ] Email frequency (daily digest vs. immediate)
  - [ ] Sync preferences to Zoho CRM custom fields

#### Customer Support Infrastructure (Zoho Desk)

- [ ] **Zoho Desk Setup**
  - [ ] Create Zoho Desk account (or link existing)
  - [ ] Connect Zoho Desk to Zoho CRM (automatic contact/account lookup)
  - [ ] Configure support email: support@optioeducation.com
  - [ ] Set up departments: Student Support, Parent Support, Technical Support, Billing
  - [ ] Configure SLA policies (response time, resolution time)

- [ ] **Ticket Categories & Workflows**
  - [ ] **Categories**:
    - [ ] Account Issues (login, password, verification)
    - [ ] Quest Help (stuck on task, unclear instructions)
    - [ ] Evidence Submission (upload errors, formatting questions)
    - [ ] Parent Dashboard (access issues, feature questions)
    - [ ] AI Tutor (conversation issues, safety concerns)
    - [ ] Connections (friend requests, collaboration issues)
    - [ ] Billing (subscription, payment, upgrades)
    - [ ] Bug Report (technical errors, broken features)
    - [ ] Feature Request (suggestions, improvements)
  - [ ] **Auto-Assignment Rules**:
    - [ ] Parent Support department: tickets from parent role users
    - [ ] Technical Support: tickets tagged "bug" or "error"
    - [ ] Billing: tickets mentioning "payment", "subscription", "upgrade"
  - [ ] **Escalation Rules**:
    - [ ] Escalate to manager if not responded in 4 hours
    - [ ] Escalate to admin if safety concern mentioned
    - [ ] Escalate to billing if refund requested

- [ ] **CRM Integration Features**
  - [ ] Auto-create CRM contact if ticket submitted by non-user
  - [ ] Display in ticket sidebar: student's active quests, last activity, engagement score
  - [ ] Display in ticket sidebar: parent's linked students, dashboard access history
  - [ ] Log all tickets as activities in CRM timeline
  - [ ] Update CRM field `last_support_interaction_date` on ticket creation

- [ ] **Help Center (Zoho Desk Knowledge Base)**
  - [ ] **Student Articles**:
    - [ ] Getting Started with Optio
    - [ ] How to Complete Your First Quest
    - [ ] Understanding the Five Skill Pillars
    - [ ] Submitting Evidence for Tasks
    - [ ] Building Your Public Diploma
    - [ ] Making Connections with Other Learners
    - [ ] Using the AI Tutor
  - [ ] **Parent Articles**:
    - [ ] Understanding Your Parent Dashboard
    - [ ] How to Link with Your Student
    - [ ] Reading the Learning Rhythm Indicator
    - [ ] Supporting Your Learner's Journey
    - [ ] AI Tutor Safety Features
    - [ ] Uploading Evidence on Behalf of Students
  - [ ] **Technical Articles**:
    - [ ] Supported File Formats for Evidence
    - [ ] Browser Requirements
    - [ ] Troubleshooting Login Issues
    - [ ] LMS Integration Guide (for teachers)

- [ ] **Frontend Support Widget**
  - [ ] Add support widget to all pages (bottom right corner)
  - [ ] Widget features: search knowledge base, submit ticket, live chat (future)
  - [ ] Pre-fill ticket with user context (user_id, current page, browser info)
  - [ ] Component: `frontend/src/components/support/SupportWidget.jsx`

- [ ] **Backend Support Integration** (`backend/services/zoho_desk_service.py`)
  - [ ] `create_ticket(user_id, subject, description, category)` - Create support ticket
  - [ ] `get_user_tickets(user_id)` - Fetch user's ticket history
  - [ ] `add_ticket_comment(ticket_id, comment, is_public)` - Add comment to ticket
  - [ ] `close_ticket(ticket_id, resolution)` - Close resolved ticket
  - [ ] API endpoint: `POST /api/support/tickets`
  - [ ] API endpoint: `GET /api/support/tickets/:userId`

#### Proactive Student Success Workflows

- [ ] **Zoho CRM Success Workflows**
  - [ ] **New User Onboarding**:
    - [ ] Day 1: Create task for success team to monitor first quest start
    - [ ] Day 3: If no quest started, trigger email: "Need help getting started?"
    - [ ] Day 7: If no quest completed, create support ticket for proactive outreach
  - [ ] **Stuck Student Detection**:
    - [ ] Daily check: Student has same active task for 5+ days with no progress
    - [ ] Action: Create task for success team to send personalized help email
    - [ ] Action: Trigger email to student: "Stuck on [Task Name]? Let's help!"
  - [ ] **Low-Quality Evidence Detection**:
    - [ ] Weekly check: Student's recent evidence submissions are very short (<50 chars)
    - [ ] Action: Create task for success team to review and provide feedback
    - [ ] Action: Trigger email with examples of high-quality evidence
  - [ ] **Power User Recognition**:
    - [ ] Trigger: Student reaches "Power User" lifecycle stage
    - [ ] Action: Send celebration email with badge/recognition
    - [ ] Action: Invite to beta tester program or ambassador program (future)

- [ ] **CRM Dashboards for Success Team**
  - [ ] Dashboard: "Students Needing Attention Today"
    - [ ] Widget: At-risk students (14+ days inactive)
    - [ ] Widget: Stuck students (same task 5+ days)
    - [ ] Widget: New users not progressing (day 3, 7 checks)
  - [ ] Dashboard: "Success Metrics This Week"
    - [ ] Widget: New user activation rate
    - [ ] Widget: Quest completion rate
    - [ ] Widget: Average time to complete first quest
    - [ ] Widget: Re-engagement campaign conversion rate

- [ ] **Backend Success Automation** (`backend/services/student_success_service.py`)
  - [ ] `detect_stuck_students()` - Find students on same task 5+ days
  - [ ] `detect_low_quality_evidence()` - Find students with minimal evidence
  - [ ] `detect_at_risk_new_users()` - Find new users not progressing
  - [ ] `trigger_success_intervention(user_id, intervention_type)` - Create CRM task + email
  - [ ] Scheduled job (daily 6am): Run all detection functions

#### Testing & Validation

- [ ] **Campaign Testing**
  - [ ] Test all re-engagement email sequences with test users
  - [ ] Verify exit triggers work correctly (user becomes active → remove from sequence)
  - [ ] A/B test subject lines on 7-day inactive sequence
  - [ ] Monitor campaign performance for first 2 weeks, adjust copy as needed

- [ ] **Parent Communication Testing**
  - [ ] Test weekly progress email generation with real student data
  - [ ] Verify safety alerts trigger correctly and include proper context
  - [ ] Test parent preference management (opt-out should stop emails)
  - [ ] Validate inactivity alerts don't spam parents (only send once weekly)

- [ ] **Support System Testing**
  - [ ] Create test tickets from student, parent, and anonymous users
  - [ ] Verify CRM context appears in ticket sidebar
  - [ ] Test auto-assignment rules route tickets correctly
  - [ ] Validate escalation rules trigger on SLA violations

---

## Phase 3: Growth & Revenue Operations (Months 7-9)

### Objectives
- Implement school partnership pipeline and B2B sales process
- Launch marketing attribution and campaign performance tracking
- Build subscription lifecycle management and revenue analytics
- Establish referral program infrastructure

### Phase 3 Implementation Tasks

#### School Partnership Pipeline (B2B Sales)

- [ ] **CRM Data Model for Schools**
  - [ ] **Accounts Module** (Schools/Districts):
    - [ ] Standard fields: account_name, billing_address, phone, website
    - [ ] Custom fields:
      - [ ] `school_type` (picklist: K-12 Public, K-12 Private, Homeschool Co-op, Higher Ed, Other)
      - [ ] `district_name` (string)
      - [ ] `student_count_total` (number)
      - [ ] `student_count_optio` (number, formula: count of students linked to account)
      - [ ] `lms_platform` (picklist: Canvas, Google Classroom, Schoology, Moodle, None)
      - [ ] `lms_integration_status` (picklist: Not Started, In Progress, Live, Issues)
      - [ ] `contract_type` (picklist: Pilot, Annual, Multi-Year, Per-Student)
      - [ ] `contract_start_date` (date)
      - [ ] `contract_end_date` (date)
      - [ ] `contract_value` (currency)
      - [ ] `renewal_status` (picklist: Auto-Renew, Up for Renewal, Churned, Negotiating)
      - [ ] `primary_contact_role` (picklist: Teacher, Administrator, Curriculum Director, IT Director)
      - [ ] `pilot_start_date` (date, nullable)
      - [ ] `pilot_success_metrics` (text area, JSON)
      - [ ] `activation_rate` (percent, formula: students with 1+ quest / total students)
      - [ ] `avg_quests_per_student` (number)
      - [ ] `avg_xp_per_student` (number)
      - [ ] `last_sync_date` (datetime, last LMS roster sync)
  - [ ] **Contacts Module Updates** (Decision Makers):
    - [ ] Link contacts to school accounts
    - [ ] Custom field: `decision_maker_role` (Teacher, Principal, Superintendent, Board Member)
    - [ ] Custom field: `influence_level` (High, Medium, Low)
  - [ ] **Deals Module** (Sales Pipeline):
    - [ ] Standard fields: deal_name, amount, closing_date, stage, probability
    - [ ] Custom fields:
      - [ ] `school_account` (lookup to Accounts)
      - [ ] `expected_student_count` (number)
      - [ ] `pilot_duration_weeks` (number)
      - [ ] `demo_date` (date)
      - [ ] `decision_timeline` (date)
      - [ ] `competition` (multi-select: Other LMS, Khan Academy, Coursera, None)
      - [ ] `champion_contact` (lookup to Contacts)
      - [ ] `barriers_to_close` (text area)

- [ ] **Sales Pipeline Stages**
  - [ ] **Stage 1: Prospect** (Initial contact, no meeting scheduled)
  - [ ] **Stage 2: Discovery Call** (First meeting scheduled/completed)
  - [ ] **Stage 3: Demo Delivered** (Product demo completed)
  - [ ] **Stage 4: Pilot Agreed** (Pilot terms negotiated, awaiting start)
  - [ ] **Stage 5: Pilot Active** (Pilot in progress, monitoring metrics)
  - [ ] **Stage 6: Pilot Review** (Pilot completed, reviewing results)
  - [ ] **Stage 7: Contract Negotiation** (Full contract being negotiated)
  - [ ] **Stage 8: Closed Won** (Contract signed, implementation starting)
  - [ ] **Stage 9: Closed Lost** (Deal did not progress)

- [ ] **CRM Workflows for School Partnerships**
  - [ ] **Pilot Success Monitoring**:
    - [ ] Weekly check: Calculate pilot school metrics (activation rate, avg quests)
    - [ ] Action: If activation rate < 30% after 2 weeks, alert account manager
    - [ ] Action: If activation rate > 70% after 4 weeks, flag for expansion conversation
  - [ ] **Renewal Reminders**:
    - [ ] Trigger: Contract end date is 90 days away
    - [ ] Action: Create task for account manager to schedule renewal call
    - [ ] Action: Generate renewal proposal with updated pricing
  - [ ] **LMS Integration Health**:
    - [ ] Daily check: Last sync date > 7 days ago for active school accounts
    - [ ] Action: Create support ticket for technical team
    - [ ] Action: Alert account manager to inform school contact
  - [ ] **Expansion Opportunities**:
    - [ ] Trigger: School account reaches 80% of contracted student count
    - [ ] Action: Alert account manager to discuss expansion
    - [ ] Action: Create upsell deal in pipeline

- [ ] **Backend School Management** (`backend/services/school_management_service.py`)
  - [ ] `create_school_account(school_data)` - Create school in CRM
  - [ ] `link_students_to_school(school_id, student_ids)` - Bulk link students
  - [ ] `calculate_school_metrics(school_id)` - Compute activation, avg quests, etc.
  - [ ] `sync_school_to_crm(school_id)` - Update school metrics in CRM
  - [ ] `get_schools_needing_attention()` - Find schools with low activation or sync issues
  - [ ] API endpoint: `POST /api/admin/schools` (create school account)
  - [ ] API endpoint: `GET /api/admin/schools/:schoolId/metrics` (fetch metrics)
  - [ ] API endpoint: `PUT /api/admin/schools/:schoolId/students` (link students)

- [ ] **Admin School Management UI**
  - [ ] New admin tab: "School Partnerships" in `frontend/src/pages/AdminPage.jsx`
  - [ ] Component: `frontend/src/components/admin/SchoolManagement.jsx`
  - [ ] Features:
    - [ ] List all school accounts with key metrics
    - [ ] Create new school account
    - [ ] Link students to school (bulk import via CSV)
    - [ ] View school-specific analytics dashboard
    - [ ] Monitor LMS integration health
    - [ ] Export school usage reports (for renewal conversations)

- [ ] **Scheduled Jobs for Schools**
  - [ ] Daily cron job (7am): Sync all school metrics to CRM
  - [ ] Weekly cron job (Monday 8am): Generate school health report for account managers
  - [ ] Monthly cron job (1st of month): Generate invoices for per-student pricing models

#### Marketing Attribution & Campaign Tracking

- [ ] **CRM Data Model for Marketing**
  - [ ] **Campaigns Module**:
    - [ ] Standard fields: campaign_name, type, status, start_date, end_date, budget_cost, actual_cost
    - [ ] Custom fields:
      - [ ] `campaign_channel` (picklist: Social Media, Email, Search Ads, Content Marketing, Partnership, Referral, Other)
      - [ ] `target_audience` (picklist: Students, Parents, Teachers, Homeschoolers, All)
      - [ ] `utm_campaign` (string, unique identifier for tracking)
      - [ ] `utm_source` (string)
      - [ ] `utm_medium` (string)
      - [ ] `landing_page_url` (URL)
      - [ ] `total_visitors` (number, from analytics)
      - [ ] `total_registrations` (number, count of contacts)
      - [ ] `total_activated_users` (number, count of contacts who started quest)
      - [ ] `total_paying_users` (number, count of contacts who subscribed)
      - [ ] `conversion_rate_reg` (percent, formula: registrations / visitors)
      - [ ] `conversion_rate_activation` (percent, formula: activated / registrations)
      - [ ] `conversion_rate_paid` (percent, formula: paying / registrations)
      - [ ] `ltv_total` (currency, sum of LTV from all campaign contacts)
      - [ ] `roi` (percent, formula: (LTV - cost) / cost)
  - [ ] **Contact Updates** (Marketing Source Fields):
    - [ ] Already have: `utm_source`, `utm_medium`, `utm_campaign`, `referral_code_used`
    - [ ] Add: `first_touch_campaign` (lookup to Campaigns, first campaign user interacted with)
    - [ ] Add: `last_touch_campaign` (lookup to Campaigns, campaign that led to conversion)
    - [ ] Add: `attribution_model` (picklist: First Touch, Last Touch, Multi-Touch)

- [ ] **UTM Parameter Capture**
  - [ ] Update `backend/routes/auth.py`:
    - [ ] On registration, capture UTM params from query string
    - [ ] Store in database: users table or new utm_tracking table
    - [ ] Sync to CRM on contact creation
  - [ ] Update `frontend/src/pages/RegisterPage.jsx`:
    - [ ] Parse URL query params on mount
    - [ ] Store in localStorage (persist across pages)
    - [ ] Pass to registration API call

- [ ] **Campaign Performance Tracking**
  - [ ] Backend service: `backend/services/campaign_tracking_service.py`
    - [ ] `track_visitor(campaign_id)` - Increment visitor count
    - [ ] `track_registration(user_id, campaign_id)` - Link user to campaign
    - [ ] `track_activation(user_id)` - Mark user as activated (first quest start)
    - [ ] `track_conversion(user_id)` - Mark user as paying subscriber
    - [ ] `calculate_campaign_roi(campaign_id)` - Compute ROI metrics
  - [ ] API endpoints:
    - [ ] `POST /api/campaigns/track/visit` - Called on landing page load
    - [ ] `POST /api/campaigns/track/registration` - Called on successful registration
    - [ ] `POST /api/campaigns/track/activation` - Called on first quest start
    - [ ] `POST /api/campaigns/track/conversion` - Called on subscription purchase

- [ ] **Multi-Touch Attribution**
  - [ ] Store all campaign interactions in `campaign_interactions` table:
    - [ ] user_id, campaign_id, interaction_type (visit, click, registration, activation, conversion), interaction_date
  - [ ] Algorithm for multi-touch attribution:
    - [ ] First Touch: 100% credit to first campaign
    - [ ] Last Touch: 100% credit to last campaign before conversion
    - [ ] Linear: Equal credit to all campaigns in journey
    - [ ] Time Decay: More credit to recent campaigns
  - [ ] Admin can select attribution model per report

- [ ] **Marketing Dashboard (Zoho Analytics)**
  - [ ] **Campaign Overview Dashboard**:
    - [ ] Widget: Total campaigns by status (Active, Completed, Planned)
    - [ ] Widget: Top 5 campaigns by ROI
    - [ ] Widget: Top 5 campaigns by registrations
    - [ ] Widget: Conversion funnel (visitors → reg → activation → paid)
  - [ ] **Channel Performance Dashboard**:
    - [ ] Widget: Registrations by channel (Social, Email, Search, etc.)
    - [ ] Widget: Cost per acquisition by channel
    - [ ] Widget: LTV by channel
    - [ ] Widget: ROI by channel
  - [ ] **Attribution Analysis Dashboard**:
    - [ ] Widget: Multi-touch attribution comparison (first vs. last vs. linear)
    - [ ] Widget: Customer journey flow (campaign path to conversion)
    - [ ] Widget: Time to conversion by campaign

#### Subscription Lifecycle & Revenue Operations

- [ ] **Zoho Subscriptions Integration**
  - [ ] Set up Zoho Subscriptions account (or use existing Stripe + sync to CRM)
  - [ ] Decide: Migrate from Stripe to Zoho Subscriptions OR keep Stripe and sync data
  - [ ] Option A: Full migration to Zoho Subscriptions (more integrated, but complex migration)
  - [ ] Option B: Keep Stripe, sync subscription data to CRM (simpler, less integration)
  - [ ] **Recommended: Option B** (keep Stripe, sync to CRM)

- [ ] **CRM Data Model for Subscriptions**
  - [ ] **Contacts Module Updates**:
    - [ ] Custom field: `subscription_tier` (picklist: Free, Explorer, Creator, Visionary)
    - [ ] Custom field: `subscription_status` (picklist: Active, Trialing, Canceled, Past Due, Paused)
    - [ ] Custom field: `subscription_start_date` (date)
    - [ ] Custom field: `subscription_end_date` (date, nullable)
    - [ ] Custom field: `mrr` (currency, monthly recurring revenue)
    - [ ] Custom field: `ltv` (currency, lifetime value)
    - [ ] Custom field: `payment_method_status` (picklist: Valid, Expiring Soon, Failed, None)
    - [ ] Custom field: `last_payment_date` (date)
    - [ ] Custom field: `next_billing_date` (date)
    - [ ] Custom field: `churn_risk_score` (number, 0-100)
    - [ ] Custom field: `upgrade_propensity_score` (number, 0-100)
  - [ ] **Custom Module: Subscription Events**:
    - [ ] user_id (lookup to Contacts)
    - [ ] event_type (picklist: Subscribed, Upgraded, Downgraded, Canceled, Reactivated, Payment Failed, Payment Succeeded)
    - [ ] event_date (datetime)
    - [ ] from_tier (string, nullable)
    - [ ] to_tier (string, nullable)
    - [ ] mrr_change (currency, change in MRR)
    - [ ] reason (text area, nullable, for cancellations)
    - [ ] stripe_event_id (string, for audit trail)

- [ ] **Stripe Webhook Handler Updates**
  - [ ] Update `backend/routes/webhooks.py` (or create if missing):
    - [ ] On `customer.subscription.created` → Sync to CRM
    - [ ] On `customer.subscription.updated` → Sync to CRM
    - [ ] On `customer.subscription.deleted` → Log cancellation event
    - [ ] On `invoice.payment_succeeded` → Update last_payment_date
    - [ ] On `invoice.payment_failed` → Trigger dunning workflow
  - [ ] Service: `backend/services/subscription_sync_service.py`
    - [ ] `sync_subscription_to_crm(user_id, stripe_subscription)` - Update CRM fields
    - [ ] `log_subscription_event(user_id, event_type, details)` - Create event record
    - [ ] `calculate_ltv(user_id)` - Compute lifetime value
    - [ ] `calculate_churn_risk(user_id)` - Predict churn likelihood
    - [ ] `calculate_upgrade_propensity(user_id)` - Predict upgrade likelihood

- [ ] **Churn Risk Scoring Algorithm**
  - [ ] Factors:
    - [ ] Days since last login (higher = more risk)
    - [ ] Quest completion velocity (declining = more risk)
    - [ ] Connection count (low = more risk)
    - [ ] Support ticket volume (high = more risk)
    - [ ] Payment failures (any = high risk)
    - [ ] Subscription tenure (very new or very old = more risk)
  - [ ] Score: 0-100 (0 = no risk, 100 = imminent churn)
  - [ ] Threshold: Score > 70 = "High Risk", trigger retention workflow

- [ ] **Upgrade Propensity Scoring Algorithm**
  - [ ] Factors:
    - [ ] Quest completion rate (high = more likely to upgrade)
    - [ ] Connection usage (hitting free tier limits = very likely)
    - [ ] Time on platform (3-6 months = sweet spot)
    - [ ] Evidence upload frequency (high = more engaged)
    - [ ] Badge unlock rate (high = achievement-oriented)
  - [ ] Score: 0-100 (0 = no propensity, 100 = very likely)
  - [ ] Threshold: Score > 70 = "High Propensity", trigger upgrade campaign

- [ ] **CRM Workflows for Revenue Operations**
  - [ ] **Churn Prevention**:
    - [ ] Daily check: Identify contacts with churn_risk_score > 70
    - [ ] Action: Create task for success team to reach out personally
    - [ ] Action: Trigger retention email sequence with special offer
  - [ ] **Payment Failure Recovery (Dunning)**:
    - [ ] Trigger: Stripe webhook for payment failure
    - [ ] Action: Send immediate email with update payment method link
    - [ ] Action: Day 3 reminder email
    - [ ] Action: Day 7 final warning email
    - [ ] Action: Day 10 subscription canceled, send win-back offer
  - [ ] **Upgrade Campaigns**:
    - [ ] Daily check: Identify contacts with upgrade_propensity_score > 70 AND tier = Free
    - [ ] Action: Trigger upgrade email highlighting premium features
    - [ ] Action: Offer limited-time discount (10% off first month)
  - [ ] **Expansion Revenue**:
    - [ ] Trigger: Paid user completes 10+ quests in one month
    - [ ] Action: Email suggesting higher tier for more features
  - [ ] **Win-Back Campaigns**:
    - [ ] Trigger: Subscription canceled
    - [ ] Action: Immediate survey email asking why they canceled
    - [ ] Action: Day 7 win-back offer email (50% off to reactivate)
    - [ ] Action: Day 30 final win-back email with testimonials

- [ ] **Revenue Analytics (Zoho Analytics)**
  - [ ] **MRR Dashboard**:
    - [ ] Widget: Current MRR (total monthly recurring revenue)
    - [ ] Widget: MRR growth rate (month-over-month)
    - [ ] Widget: MRR by tier (breakdown)
    - [ ] Widget: New MRR (from new subscriptions)
    - [ ] Widget: Expansion MRR (from upgrades)
    - [ ] Widget: Contraction MRR (from downgrades)
    - [ ] Widget: Churned MRR (from cancellations)
  - [ ] **Cohort Analysis Dashboard**:
    - [ ] Widget: Retention curve by cohort (% active after 1, 3, 6, 12 months)
    - [ ] Widget: LTV by cohort
    - [ ] Widget: Upgrade rate by cohort
  - [ ] **Churn Analysis Dashboard**:
    - [ ] Widget: Churn rate (monthly)
    - [ ] Widget: Churn reasons (from cancellation surveys)
    - [ ] Widget: Churn by tier
    - [ ] Widget: Churn by acquisition channel

#### Referral Program Infrastructure

- [ ] **CRM Data Model for Referrals**
  - [ ] **Contacts Module Updates**:
    - [ ] Custom field: `referral_code` (string, unique code for sharing)
    - [ ] Custom field: `referred_by_code` (string, code used at signup)
    - [ ] Custom field: `referred_by_user` (lookup to Contacts, nullable)
    - [ ] Custom field: `referral_count` (number, count of successful referrals)
    - [ ] Custom field: `referral_rewards_earned` (currency)
  - [ ] **Custom Module: Referrals**:
    - [ ] referrer_id (lookup to Contacts, person who referred)
    - [ ] referred_id (lookup to Contacts, person who signed up)
    - [ ] referral_code (string)
    - [ ] referral_date (date, when referred user signed up)
    - [ ] referral_status (picklist: Pending, Qualified, Rewarded, Expired)
    - [ ] qualification_criteria (text, e.g., "Completed first quest")
    - [ ] qualified_date (date, when referral became qualified)
    - [ ] reward_type (picklist: Credit, Discount, Free Month, Badge, None)
    - [ ] reward_amount (currency, nullable)
    - [ ] reward_granted_date (date, nullable)

- [ ] **Referral Program Rules** (to be decided)
  - [ ] Option 1: Both get reward (referrer gets $10 credit, referred gets 10% off first month)
  - [ ] Option 2: Referrer only (referrer gets $10 credit after referred completes first quest)
  - [ ] Option 3: Tiered rewards (1 referral = $10, 5 referrals = $75, 10 referrals = $200)
  - [ ] **Recommended: Option 2** (referrer-focused, after qualification)
  - [ ] Qualification criteria: Referred user completes first quest (ensures quality referrals)

- [ ] **Backend Referral System** (`backend/services/referral_service.py`)
  - [ ] `generate_referral_code(user_id)` - Create unique referral code (e.g., FIRSTNAME123)
  - [ ] `validate_referral_code(code)` - Check if code exists and is valid
  - [ ] `track_referral(referrer_code, referred_user_id)` - Log referral on signup
  - [ ] `check_referral_qualification(referral_id)` - Check if referred user met criteria
  - [ ] `grant_referral_reward(referral_id)` - Issue reward to referrer
  - [ ] `get_user_referrals(user_id)` - Fetch user's referral history
  - [ ] API endpoints:
    - [ ] `GET /api/referrals/my-code` - Get user's referral code
    - [ ] `POST /api/referrals/validate` - Validate referral code at signup
    - [ ] `GET /api/referrals/my-referrals` - Get user's referral history and rewards

- [ ] **Frontend Referral Features**
  - [ ] Component: `frontend/src/components/referral/ReferralDashboard.jsx`
    - [ ] Display user's referral code with copy button
    - [ ] Social sharing buttons (email, Twitter, Facebook, WhatsApp)
    - [ ] Referral link with pre-filled code (e.g., optioeducation.com/register?ref=FIRSTNAME123)
    - [ ] Referral history table (who signed up, status, reward earned)
    - [ ] Total rewards earned display
  - [ ] Update `frontend/src/pages/RegisterPage.jsx`:
    - [ ] Accept `?ref=CODE` query parameter
    - [ ] Validate code with API before showing success message
    - [ ] Display "Referred by [Name]" badge during registration
  - [ ] Add referral tab to user dashboard or settings page

- [ ] **CRM Workflows for Referrals**
  - [ ] **New Referral Tracking**:
    - [ ] Trigger: New user registers with referral code
    - [ ] Action: Create referral record with status = "Pending"
    - [ ] Action: Send thank you email to referrer: "[Friend] just signed up with your code!"
  - [ ] **Referral Qualification**:
    - [ ] Trigger: Referred user completes first quest
    - [ ] Action: Update referral status to "Qualified"
    - [ ] Action: Grant reward to referrer (account credit, discount code, etc.)
    - [ ] Action: Send celebration email to referrer: "You earned a $10 credit!"
  - [ ] **Referral Leaderboard**:
    - [ ] Monthly check: Identify top 10 referrers
    - [ ] Action: Send special recognition email with bonus reward
    - [ ] Action: Feature on platform leaderboard (if social proof desired)

- [ ] **Referral Analytics (Zoho Analytics)**
  - [ ] Widget: Total referrals (pending, qualified, rewarded)
  - [ ] Widget: Top referrers (by count)
  - [ ] Widget: Referral conversion rate (qualified / total)
  - [ ] Widget: Referral LTV (avg LTV of referred users vs. non-referred)
  - [ ] Widget: Referral source analysis (where did referrer come from?)

#### Testing & Validation

- [ ] **School Partnership Testing**
  - [ ] Create test school account in CRM
  - [ ] Link test students to school account
  - [ ] Verify school metrics calculate correctly
  - [ ] Test LMS integration health monitoring
  - [ ] Generate sample school usage report

- [ ] **Marketing Attribution Testing**
  - [ ] Create test campaigns with different UTM parameters
  - [ ] Register test users through different campaign links
  - [ ] Verify UTM capture and CRM sync
  - [ ] Test multi-touch attribution calculations
  - [ ] Validate campaign ROI calculations

- [ ] **Subscription Lifecycle Testing**
  - [ ] Test Stripe webhook → CRM sync for all event types
  - [ ] Verify churn risk score calculations
  - [ ] Test dunning workflow with failed payment
  - [ ] Validate upgrade propensity targeting
  - [ ] Test win-back campaign triggers

- [ ] **Referral Program Testing**
  - [ ] Generate test referral codes
  - [ ] Register test users with referral codes
  - [ ] Verify referral tracking and qualification
  - [ ] Test reward granting process
  - [ ] Validate referral dashboard displays correctly

---

## Phase 4: Advanced Features & Optimization (Months 10-12)

### Objectives
- Launch community programs (ambassador, mentor matching)
- Implement product feedback loop with user research
- Build advanced analytics for quest performance and cohort analysis
- Optimize all integrations for scale and reliability

### Phase 4 Implementation Tasks

#### Community Building Programs

- [ ] **Ambassador Program**
  - [ ] **Program Definition**:
    - [ ] Criteria: 10+ completed quests, 5+ connections, 90+ engagement score
    - [ ] Benefits: Early feature access, exclusive Discord channel, recognition badge, merch
    - [ ] Responsibilities: Provide feedback, help new users, share on social media
  - [ ] **CRM Data Model**:
    - [ ] Contacts custom field: `ambassador_status` (picklist: None, Invited, Active, Alumni)
    - [ ] Contacts custom field: `ambassador_join_date` (date)
    - [ ] Contacts custom field: `ambassador_impact_score` (number, based on referrals + feedback)
    - [ ] Custom Module: Ambassador Activities
      - [ ] ambassador_id (lookup to Contacts)
      - [ ] activity_type (picklist: Feedback Submitted, User Helped, Social Share, Event Attended)
      - [ ] activity_date (date)
      - [ ] impact_points (number, points earned for this activity)
      - [ ] details (text area)
  - [ ] **Backend Ambassador Service** (`backend/services/ambassador_service.py`)
    - [ ] `identify_ambassador_candidates()` - Find users meeting criteria
    - [ ] `invite_to_ambassador_program(user_id)` - Send invitation email + create CRM record
    - [ ] `accept_ambassador_invitation(user_id)` - Mark as active ambassador
    - [ ] `log_ambassador_activity(user_id, activity_type, details)` - Track contributions
    - [ ] `calculate_ambassador_impact(user_id)` - Score based on activities
    - [ ] API endpoints:
      - [ ] `GET /api/ambassadors/candidates` (admin only)
      - [ ] `POST /api/ambassadors/invite` (admin only)
      - [ ] `POST /api/ambassadors/accept` (user accepts invitation)
      - [ ] `GET /api/ambassadors/my-activities` (ambassador dashboard)
  - [ ] **Frontend Ambassador Features**:
    - [ ] Component: `frontend/src/components/ambassador/AmbassadorDashboard.jsx`
      - [ ] Display impact score and recent activities
      - [ ] Quick actions: Submit feedback, share on social, report bug
      - [ ] Leaderboard of top ambassadors (opt-in)
    - [ ] Component: `frontend/src/components/ambassador/AmbassadorInvitation.jsx`
      - [ ] Modal shown when user is invited to program
      - [ ] Explains benefits and responsibilities
      - [ ] Accept/decline buttons
  - [ ] **CRM Workflows**:
    - [ ] Weekly check: Identify new ambassador candidates
    - [ ] Action: Create task for community manager to review and invite
    - [ ] Monthly check: Calculate ambassador impact scores
    - [ ] Action: Send recognition email to top 5 ambassadors

- [ ] **Mentor Matching Program**
  - [ ] **Program Definition**:
    - [ ] Mentors: Students with 5+ completed quests in a pillar, opt-in as mentor
    - [ ] Mentees: Students stuck on quest for 5+ days OR new users requesting help
    - [ ] Matching criteria: Pillar expertise, availability, personality fit
  - [ ] **CRM Data Model**:
    - [ ] Contacts custom field: `mentor_status` (picklist: None, Available, Matched, Inactive)
    - [ ] Contacts custom field: `mentor_pillars` (multi-select: STEM, Wellness, Communication, Civics, Art)
    - [ ] Contacts custom field: `mentee_status` (picklist: None, Seeking, Matched, Inactive)
    - [ ] Contacts custom field: `current_mentor` (lookup to Contacts, nullable)
    - [ ] Contacts custom field: `current_mentees` (lookup to Contacts, multi-select)
    - [ ] Custom Module: Mentor Matches
      - [ ] mentor_id (lookup to Contacts)
      - [ ] mentee_id (lookup to Contacts)
      - [ ] match_date (date)
      - [ ] match_status (picklist: Active, Completed, Ended Early)
      - [ ] primary_pillar (picklist)
      - [ ] match_quality_score (number, based on satisfaction surveys)
      - [ ] messages_exchanged (number)
      - [ ] sessions_completed (number)
      - [ ] end_date (date, nullable)
      - [ ] end_reason (text, nullable)
  - [ ] **Backend Mentor Service** (`backend/services/mentor_service.py`)
    - [ ] `register_as_mentor(user_id, pillars, availability)` - User opts in as mentor
    - [ ] `request_mentor(user_id, pillar, reason)` - User requests mentorship
    - [ ] `find_mentor_match(mentee_id)` - Algorithm to find best mentor match
    - [ ] `create_mentor_match(mentor_id, mentee_id, pillar)` - Create match and notify both
    - [ ] `end_mentor_match(match_id, reason)` - Complete or end match
    - [ ] `get_match_recommendations(mentee_id)` - Return top 3 mentor matches with scores
    - [ ] API endpoints:
      - [ ] `POST /api/mentors/register` - Register as mentor
      - [ ] `POST /api/mentors/request` - Request a mentor
      - [ ] `GET /api/mentors/matches/my` - Get user's current matches
      - [ ] `POST /api/mentors/matches/:matchId/end` - End a match
  - [ ] **Mentor Matching Algorithm**:
    - [ ] Score based on:
      - [ ] Pillar expertise (mentor has 5+ quests in mentee's needed pillar)
      - [ ] Availability (mentor not already at max mentees)
      - [ ] Similar interests (other pillar overlaps)
      - [ ] Past match success rate (if mentor has history)
      - [ ] Engagement level (active mentors get priority)
    - [ ] Return top 3 matches for mentee to choose from
  - [ ] **Frontend Mentor Features**:
    - [ ] Component: `frontend/src/components/mentor/MentorRegistration.jsx`
      - [ ] Form to opt-in as mentor, select pillars, set availability
    - [ ] Component: `frontend/src/components/mentor/MentorRequest.jsx`
      - [ ] Form to request mentor, select pillar, describe what help is needed
      - [ ] Show top 3 recommended mentors with profiles
      - [ ] Send match request button
    - [ ] Component: `frontend/src/components/mentor/MentorDashboard.jsx`
      - [ ] For mentors: List current mentees, upcoming sessions, messages
      - [ ] For mentees: List current mentors, upcoming sessions, messages
      - [ ] Integrated messaging (or link to connections chat if exists)
  - [ ] **CRM Workflows**:
    - [ ] Daily check: Identify mentees without a match for 3+ days
    - [ ] Action: Create task for community manager to manually match
    - [ ] Weekly check: Identify inactive matches (no messages in 14 days)
    - [ ] Action: Send check-in email to both mentor and mentee
    - [ ] Monthly check: Send satisfaction survey to active matches
    - [ ] Action: Calculate match quality scores, highlight successful mentors

#### Product Feedback Loop & User Research

- [ ] **CRM Data Model for Product Feedback**
  - [ ] **Custom Module: Feature Requests**
    - [ ] request_title (string)
    - [ ] request_description (text area)
    - [ ] submitted_by (lookup to Contacts)
    - [ ] submission_date (date)
    - [ ] category (picklist: Quests, Badges, Connections, Parent Dashboard, AI Tutor, Diploma, Other)
    - [ ] status (picklist: Submitted, Under Review, Planned, In Development, Shipped, Declined)
    - [ ] priority (picklist: Low, Medium, High, Critical)
    - [ ] vote_count (number, count of users who upvoted)
    - [ ] product_manager_notes (text area)
    - [ ] shipped_date (date, nullable)
    - [ ] declined_reason (text area, nullable)
  - [ ] **Custom Module: Feature Votes**
    - [ ] feature_request_id (lookup to Feature Requests)
    - [ ] user_id (lookup to Contacts)
    - [ ] vote_date (date)
  - [ ] **Contacts Custom Fields**:
    - [ ] `beta_tester_status` (picklist: None, Invited, Active, Alumni)
    - [ ] `beta_tester_join_date` (date)
    - [ ] `user_research_pool` (boolean, willing to participate in interviews/surveys)
    - [ ] `feature_requests_submitted` (number, count)
    - [ ] `feature_votes_cast` (number, count)

- [ ] **Backend Feature Request Service** (`backend/services/feature_request_service.py`)
  - [ ] `submit_feature_request(user_id, title, description, category)` - Create request
  - [ ] `vote_for_feature(user_id, feature_id)` - Upvote feature
  - [ ] `unvote_feature(user_id, feature_id)` - Remove upvote
  - [ ] `get_feature_requests(filter, sort)` - List requests (top voted, recent, by category)
  - [ ] `update_feature_status(feature_id, status, notes)` - Admin updates status
  - [ ] API endpoints:
    - [ ] `POST /api/features/request` - Submit new feature request
    - [ ] `POST /api/features/:id/vote` - Upvote feature
    - [ ] `DELETE /api/features/:id/vote` - Remove vote
    - [ ] `GET /api/features` - List feature requests (with filters)
    - [ ] `PUT /api/features/:id/status` (admin only) - Update status

- [ ] **Frontend Feature Request Features**
  - [ ] Component: `frontend/src/components/features/FeatureRequestBoard.jsx`
    - [ ] List of feature requests (card view)
    - [ ] Filter by category, status
    - [ ] Sort by votes, recent, status
    - [ ] Upvote button on each card (with vote count)
    - [ ] "Submit New Request" button
  - [ ] Component: `frontend/src/components/features/FeatureRequestForm.jsx`
    - [ ] Form: title, description, category
    - [ ] Validation: check for duplicates before submitting
  - [ ] Component: `frontend/src/components/features/FeatureRequestDetail.jsx`
    - [ ] Full request details
    - [ ] Comments section (if desired, or just show in CRM)
    - [ ] Status timeline (submitted → under review → planned → shipped)
    - [ ] Admin controls (update status, priority)
  - [ ] Add link to feature board in main navigation or settings

- [ ] **Beta Tester Program**
  - [ ] **Recruitment**:
    - [ ] Criteria: 90+ engagement score, 5+ completed quests, active in last 7 days
    - [ ] Invitation email: "Help shape the future of Optio"
  - [ ] **Backend Beta Service** (`backend/services/beta_service.py`)
    - [ ] `identify_beta_candidates()` - Find users meeting criteria
    - [ ] `invite_to_beta(user_id, feature_name)` - Send invitation for specific beta
    - [ ] `accept_beta_invitation(user_id)` - User opts into beta program
    - [ ] `grant_beta_access(user_id, feature_flag)` - Enable feature flag for beta tester
    - [ ] `collect_beta_feedback(user_id, feature_flag, feedback)` - Log feedback
    - [ ] API endpoints:
      - [ ] `GET /api/beta/candidates` (admin only)
      - [ ] `POST /api/beta/invite` (admin only)
      - [ ] `POST /api/beta/accept` (user accepts)
      - [ ] `POST /api/beta/feedback` (submit feedback)
  - [ ] **Frontend Beta Features**:
    - [ ] Beta badge shown on user profile (if active beta tester)
    - [ ] In-app feedback widget for beta features (quick survey)
    - [ ] Component: `frontend/src/components/beta/BetaFeedbackWidget.jsx`
  - [ ] **CRM Workflows**:
    - [ ] Weekly check: Identify new beta candidates
    - [ ] Action: Create task for product manager to review and invite
    - [ ] When new beta feature launches:
      - [ ] Send email to all beta testers with feature details
      - [ ] Request feedback after 7 days of usage

- [ ] **User Research Pool**
  - [ ] **Recruitment**:
    - [ ] Add checkbox during registration: "I'm willing to participate in user research"
    - [ ] Add to user settings: opt-in/opt-out of research pool
  - [ ] **CRM Workflows**:
    - [ ] When product team needs research participants:
      - [ ] Filter contacts: user_research_pool = true, engagement score > 70
      - [ ] Create campaign to invite to research study
      - [ ] Track participation in CRM activities
  - [ ] **Research Study Tracking**:
    - [ ] Custom Module: Research Studies
      - [ ] study_name (string)
      - [ ] study_type (picklist: Interview, Survey, Usability Test, Focus Group)
      - [ ] study_date (date)
      - [ ] participants (lookup to Contacts, multi-select)
      - [ ] incentive_offered (currency)
      - [ ] key_findings (text area)
      - [ ] actions_taken (text area, product changes made based on research)

#### Advanced Analytics & Optimization

- [ ] **Quest Performance Analytics (Zoho Analytics)**
  - [ ] **Quest Completion Funnel Dashboard**:
    - [ ] Widget: Completion funnel by quest (started → in progress → completed → abandoned)
    - [ ] Widget: Average time to complete by quest
    - [ ] Widget: Task-level drop-off analysis (which tasks cause abandonment)
    - [ ] Widget: Evidence quality distribution by quest
  - [ ] **Quest Health Report**:
    - [ ] Widget: Quests with highest abandonment rate
    - [ ] Widget: Quests with lowest average time (too easy?)
    - [ ] Widget: Quests with highest average time (too hard?)
    - [ ] Widget: Quests with most support tickets
  - [ ] **Automated Alerts**:
    - [ ] Daily check: Flag quests with >50% abandonment rate
    - [ ] Action: Create task for content team to review and revise quest

- [ ] **Cohort Analysis Dashboard (Zoho Analytics)**
  - [ ] **Cohort Definition**:
    - [ ] By registration month (e.g., Jan 2025 cohort, Feb 2025 cohort)
    - [ ] By acquisition channel (e.g., Social Media cohort, Referral cohort)
    - [ ] By school (e.g., Lincoln High cohort, Homeschool Co-op cohort)
  - [ ] **Cohort Metrics**:
    - [ ] Widget: Retention curve (% active after 1, 3, 6, 12 months)
    - [ ] Widget: Quest completion rate by cohort
    - [ ] Widget: Average XP per user by cohort
    - [ ] Widget: Paid conversion rate by cohort
    - [ ] Widget: LTV by cohort
  - [ ] **Cohort Comparison**:
    - [ ] Side-by-side comparison of 2+ cohorts
    - [ ] Identify best-performing cohorts (for replication)
    - [ ] Identify worst-performing cohorts (for intervention)

- [ ] **Pillar Preference Analysis (Zoho Analytics)**
  - [ ] **Pillar Popularity Dashboard**:
    - [ ] Widget: Quest starts by pillar over time
    - [ ] Widget: Quest completions by pillar over time
    - [ ] Widget: XP distribution by pillar (overall platform)
  - [ ] **User Segmentation by Pillar**:
    - [ ] Segment: STEM-focused students (>50% XP in STEM)
    - [ ] Segment: Wellness-focused students (>50% XP in Wellness)
    - [ ] Segment: Balanced students (no pillar >40% XP)
  - [ ] **Pillar-Based Campaigns**:
    - [ ] Send targeted quest recommendations based on primary pillar
    - [ ] Example: STEM-focused students get email about new coding quests

- [ ] **Backend Analytics Service** (`backend/services/analytics_service.py`)
  - [ ] `sync_analytics_to_zoho()` - Scheduled job to push analytics data to Zoho Analytics
  - [ ] `calculate_quest_health_metrics()` - Compute abandonment rates, avg time, etc.
  - [ ] `calculate_cohort_retention(cohort_id, month)` - Retention % for cohort at month X
  - [ ] `identify_underperforming_quests()` - Flag quests needing review
  - [ ] Scheduled job (daily): Run analytics sync

#### Integration Optimization & Reliability

- [ ] **API Rate Limiting & Caching**
  - [ ] Implement Redis caching for frequently accessed CRM data
  - [ ] Cache user engagement scores (TTL: 1 hour)
  - [ ] Cache campaign data (TTL: 24 hours)
  - [ ] Cache school metrics (TTL: 12 hours)
  - [ ] Monitor Zoho API rate limits (10k calls/day free tier, 100k calls/day paid tier)
  - [ ] Implement request batching (combine multiple CRM updates into single API call)

- [ ] **Error Handling & Retry Logic**
  - [ ] Update all Zoho integration services with robust error handling:
    - [ ] Retry failed API calls with exponential backoff (3 retries max)
    - [ ] Log all API errors to monitoring system (Sentry, LogRocket, etc.)
    - [ ] Graceful degradation: If CRM sync fails, don't block user action
    - [ ] Queue failed syncs for retry (use database table or Redis queue)
  - [ ] Create admin dashboard showing failed sync attempts

- [ ] **Webhook Reliability**
  - [ ] Implement webhook signature verification for all incoming webhooks (Stripe, Zoho)
  - [ ] Idempotency keys for all webhook handlers (prevent duplicate processing)
  - [ ] Webhook retry queue: If webhook processing fails, queue for retry
  - [ ] Webhook monitoring dashboard: Track success rate, avg processing time, failures

- [ ] **Data Consistency Checks**
  - [ ] Scheduled job (nightly): Compare Optio database with CRM data
  - [ ] Detect mismatches (e.g., user in Optio but not in CRM)
  - [ ] Auto-fix simple mismatches (create missing CRM contact)
  - [ ] Alert admin for complex mismatches (data conflict)
  - [ ] Generate daily data consistency report

- [ ] **Performance Monitoring**
  - [ ] Track CRM sync latency (should be <1 second for real-time syncs)
  - [ ] Track email delivery rates (should be >95%)
  - [ ] Track webhook processing time (should be <500ms)
  - [ ] Set up alerts for degraded performance (latency >3 seconds, delivery <90%, etc.)
  - [ ] Monthly performance review: Identify bottlenecks and optimize

- [ ] **Scalability Preparation**
  - [ ] Load test CRM integration with simulated 10k concurrent users
  - [ ] Load test email sending with 100k emails/day volume
  - [ ] Identify bottlenecks and optimize (add caching, database indexes, etc.)
  - [ ] Plan for Zoho tier upgrade if needed (free → paid tier for higher API limits)
  - [ ] Document scaling playbook (when to upgrade, what to optimize)

#### Documentation & Training

- [ ] **Admin Documentation**
  - [ ] CRM User Guide for Success Team
    - [ ] How to read student profiles in CRM
    - [ ] How to use views and filters
    - [ ] How to create tasks and set reminders
    - [ ] How to run reports and export data
  - [ ] Campaign Manager Guide
    - [ ] How to create email campaigns in Zoho Campaigns
    - [ ] How to set up workflows and automation
    - [ ] How to track campaign performance
    - [ ] How to A/B test campaigns
  - [ ] Product Manager Guide
    - [ ] How to manage feature requests
    - [ ] How to recruit beta testers
    - [ ] How to analyze quest performance
    - [ ] How to use analytics dashboards

- [ ] **Technical Documentation**
  - [ ] Integration Architecture Diagram
  - [ ] API Integration Reference
  - [ ] Webhook Event Catalog
  - [ ] Data Model Reference (all CRM modules and fields)
  - [ ] Troubleshooting Guide (common issues and resolutions)
  - [ ] Scaling Playbook (performance optimization strategies)

- [ ] **Training Sessions**
  - [ ] Success Team Training (2 hours):
    - [ ] CRM basics and navigation
    - [ ] Student lifecycle management
    - [ ] Re-engagement workflows
    - [ ] Support ticket handling
  - [ ] Marketing Team Training (2 hours):
    - [ ] Campaign creation and automation
    - [ ] Email template customization
    - [ ] Attribution tracking
    - [ ] Performance analysis
  - [ ] Admin Team Training (2 hours):
    - [ ] School partnership management
    - [ ] LMS integration monitoring
    - [ ] Feature request management
    - [ ] Analytics and reporting

#### Testing & Validation

- [ ] **Community Program Testing**
  - [ ] Recruit 5 test ambassadors, track activities, validate impact scoring
  - [ ] Create 3 test mentor matches, validate matching algorithm quality
  - [ ] Test ambassador dashboard displays correctly
  - [ ] Test mentor dashboard shows matches and messages

- [ ] **Product Feedback Testing**
  - [ ] Submit test feature requests, validate vote tracking
  - [ ] Test feature status updates flow correctly
  - [ ] Invite test users to beta program, validate feature flags work
  - [ ] Test beta feedback widget submission

- [ ] **Analytics Testing**
  - [ ] Validate quest health metrics calculations
  - [ ] Test cohort retention calculations with historical data
  - [ ] Verify Zoho Analytics dashboards display correct data
  - [ ] Test automated alerts trigger correctly

- [ ] **Performance Testing**
  - [ ] Run load tests on all integration endpoints
  - [ ] Validate caching reduces API calls by 50%+
  - [ ] Test webhook retry logic handles failures gracefully
  - [ ] Verify data consistency checks detect and fix mismatches

---

## Success Metrics & KPIs

### Phase 1 Success Metrics
- [ ] 100% of new users synced to CRM within 1 minute of registration
- [ ] 95%+ email delivery rate for transactional emails
- [ ] Lifecycle stage accuracy >90% (manual validation sample)
- [ ] Engagement score correlation with actual engagement (R² > 0.7)

### Phase 2 Success Metrics
- [ ] 7-day inactive campaign: 15%+ reactivation rate
- [ ] Parent weekly emails: 40%+ open rate, 10%+ click rate
- [ ] Support ticket resolution time <24 hours (90th percentile)
- [ ] At-risk student intervention: 25%+ conversion to active

### Phase 3 Success Metrics
- [ ] School pipeline: 5+ active school deals within 3 months
- [ ] Marketing attribution: 100% of registrations tagged with source
- [ ] Churn prevention: 20%+ retention improvement for high-risk users
- [ ] Referral program: 10%+ of registrations from referrals

### Phase 4 Success Metrics
- [ ] Ambassador program: 50+ active ambassadors
- [ ] Mentor matches: 30+ successful matches (both satisfied)
- [ ] Feature requests: 20+ submissions per month
- [ ] Quest performance: 80%+ of quests have <30% abandonment rate

---

## Ongoing Maintenance & Iteration

### Weekly Tasks
- [ ] Review failed sync attempts, manually fix if needed
- [ ] Monitor campaign performance, pause underperforming campaigns
- [ ] Review support tickets for patterns, create help articles for common issues
- [ ] Check school metrics, reach out to low-activation schools

### Monthly Tasks
- [ ] Review lifecycle stage distribution, adjust stage criteria if needed
- [ ] Analyze cohort retention, identify trends
- [ ] Review feature requests, update statuses
- [ ] Generate executive report: key metrics, trends, wins, challenges

### Quarterly Tasks
- [ ] Comprehensive data audit: Compare Optio database with CRM, fix discrepancies
- [ ] Campaign effectiveness review: A/B test results, update templates
- [ ] Integration performance review: Optimize bottlenecks
- [ ] User research synthesis: Compile findings, plan product roadmap

---

## Budget & Resources Estimate

### Zoho Licensing Costs (Annual)
- Zoho CRM Professional: $23/user/month × 5 users = $1,380/year
- Zoho Campaigns: $8/month for 5,000 contacts = $96/year
- Zoho Desk: $20/user/month × 3 users = $720/year
- Zoho Analytics: $30/month = $360/year
- **Total Annual Cost**: ~$2,560/year

### Development Time Estimate
- **Phase 1**: 120-160 hours (backend + CRM setup)
- **Phase 2**: 100-140 hours (campaigns + support)
- **Phase 3**: 140-180 hours (school pipeline + revenue ops)
- **Phase 4**: 100-140 hours (community + analytics)
- **Total**: 460-620 hours (~3-4 months of full-time development)

### Recommended Team
- **Backend Developer**: 1 FTE (API integration, webhooks, services)
- **CRM Administrator**: 0.5 FTE (CRM setup, workflows, reports)
- **Marketing Operations**: 0.5 FTE (campaign creation, template design)
- **Customer Success Manager**: 1 FTE (support, student success workflows)

---

## Risk Mitigation

### Data Privacy & Compliance
- [ ] Ensure COPPA compliance (parental consent for users under 13)
- [ ] Ensure FERPA compliance (student data privacy for school accounts)
- [ ] GDPR compliance (EU users right to be forgotten, data export)
- [ ] Add data processing agreement (DPA) with Zoho
- [ ] Document data retention policies (how long to keep CRM data)

### Integration Failure Scenarios
- [ ] **Zoho API Outage**: Queue all syncs, retry when API recovers
- [ ] **Webhook Failures**: Retry queue ensures no data loss
- [ ] **Email Delivery Issues**: Monitor deliverability, switch to backup provider if needed
- [ ] **Data Corruption**: Daily backups, ability to restore from backup

### Change Management
- [ ] Gradual rollout (pilot with small user group before full launch)
- [ ] Admin training before each phase launch
- [ ] User communication (what's new, what's changing)
- [ ] Feedback loops (weekly check-ins with team during rollout)

---

## Appendix: CRM Workflow Examples

### Example Workflow: New User Onboarding
**Trigger**: Contact created with lifecycle_stage = "Prospect"
**Conditions**: email_verified = false
**Actions**:
1. Wait 5 minutes (allow time for user to verify)
2. If still email_verified = false, send verification reminder email
3. Wait 24 hours
4. If still email_verified = false, send second reminder
5. Wait 48 hours
6. If still email_verified = false, mark as "Unverified - Needs Attention"

### Example Workflow: At-Risk Student Intervention
**Trigger**: last_active_date > 14 days ago
**Conditions**: lifecycle_stage = "Engaged" OR "Activated"
**Actions**:
1. Update lifecycle_stage = "At Risk"
2. Set at_risk_flag = true
3. Create task for success team: "Reach out to [Name] - inactive 14+ days"
4. Send re-engagement email (7-day inactive sequence)
5. Wait 7 days
6. If still inactive, update lifecycle_stage = "Dormant"
7. Send dormant sequence email

### Example Workflow: Payment Failed Dunning
**Trigger**: Stripe webhook invoice.payment_failed
**Conditions**: subscription_status = "Active"
**Actions**:
1. Update payment_method_status = "Failed"
2. Send immediate email: "Payment Failed - Update Payment Method"
3. Wait 3 days
4. If still payment_method_status = "Failed", send reminder email
5. Wait 4 days (7 days total)
6. If still failed, send final warning email
7. Wait 3 days (10 days total)
8. If still failed:
   - Update subscription_status = "Canceled"
   - Send cancellation email with win-back offer
   - Create task for success team: "Win back [Name] - payment failed cancellation"

---

## Appendix: Email Template Examples

### Template: Weekly Parent Progress Email
**Subject**: [Student Name]'s Learning This Week

**Body**:
```
Hi [Parent First Name],

Here's what [Student Name] explored this week on Optio:

🎯 Active Quests:
- [Quest 1 Name] - [Progress Bar: 60% complete]
- [Quest 2 Name] - [Progress Bar: 20% complete]

⭐ This Week's Wins:
- Completed [Task Name] in [Quest Name]
- Earned [XP] XP in [Pillar]
- Made 1 new connection

📊 Learning Rhythm: [Green/Yellow Light with description]
[If Green]: [Student Name] is in flow! They've made steady progress and
are on track with their learning goals.
[If Yellow]: [Student Name] could use some support. Here are some
conversation starters:
- "What quest are you working on right now?"
- "Is there anything you're stuck on that I can help with?"

[CTA Button: View Full Dashboard]

Remember, the journey is the goal. Celebrate the process, not just the
outcome!

- The Optio Team

---
Manage your email preferences: [Link]
```

### Template: 7-Day Inactive Re-engagement
**Subject**: Stuck on [Quest Name]? Let's get you unstuck!

**Body**:
```
Hey [First Name],

We noticed you started [Quest Name] but haven't made progress in a few
days. Getting stuck is part of the learning process - it means you're
challenging yourself!

Here are a few ways to get unstuck:

1. 💬 Ask our AI Tutor for help
   [CTA Button: Open Tutor]

2. 🤝 Connect with another learner
   [Show 2-3 connections or suggested connections]

3. 📚 Check out this resource
   [Link to relevant help article or hint]

Remember: The struggle is where the growth happens. You've got this!

[CTA Button: Continue [Quest Name]]

- The Optio Team

---
Not interested in [Quest Name] anymore? That's okay!
[Link: Explore Other Quests]
```

### Template: Badge Unlock Celebration
**Subject**: 🎉 You unlocked the [Badge Name] badge!

**Body**:
```
Congratulations, [First Name]!

You just unlocked the **[Badge Name]** badge!

[Badge Image]

**[Identity Statement]**
"[I am... / I can...]"

You earned this badge by:
- Completing [X] quests in [Pillar]
- Earning [X] XP in [Pillar]

This badge represents the skills and knowledge you've built through your
learning journey. Add it to your public diploma and show the world what
you've accomplished!

[CTA Button: View My Diploma]

What will you learn next?
[Show 3 recommended quests in same pillar]

Keep exploring!
- The Optio Team
```

---

## Version History

- **v1.0** (2025-01-XX): Initial 4-phase integration plan created
- **v1.1** (TBD): Updates based on Phase 1 implementation learnings

---

## Notes & Open Questions

- [ ] **Data Ownership**: Clarify data ownership with Zoho (can we export all data if needed?)
- [ ] **COPPA Compliance**: Do we need parental consent in CRM for users under 13?
- [ ] **Email Volume**: Will we hit Zoho Campaigns limits? (Free tier: 2,000 emails/month)
- [ ] **API Limits**: Monitor API usage closely - may need paid tier sooner than expected
- [ ] **Ambassador Program Incentives**: What rewards should we offer? (Merch? Credits? Recognition?)
- [ ] **Referral Rewards**: Finalize reward structure and qualification criteria
- [ ] **Mentor Matching**: Should matches be time-limited (e.g., 4 weeks) or ongoing?
- [ ] **Beta Tester Incentives**: Should we offer rewards for beta participation?
