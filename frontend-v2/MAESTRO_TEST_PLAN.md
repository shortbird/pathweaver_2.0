# Maestro E2E Test Plan

**Created**: 2026-03-31
**Purpose**: Comprehensive end-to-end test coverage for Optio v2 (web + mobile)
**Status**: Planning

---

## Test Infrastructure

### Directory Structure
```
maestro/
├── config/
│   ├── test-users.yaml         # Seeded credentials per role
│   └── env.yaml                # API URLs, timeouts, platform flags
├── flows/
│   ├── auth/                   # Authentication flows
│   ├── student/                # Student journeys
│   ├── parent/                 # Parent journeys
│   ├── observer/               # Observer journeys
│   ├── advisor/                # Advisor journeys
│   ├── org-admin/              # Org admin journeys
│   ├── superadmin/             # Superadmin journeys
│   ├── invitations/            # All invitation/linking flows
│   ├── notifications/          # Push + in-app notifications
│   └── cross-role/             # Flows that span multiple roles
├── shared/                     # Reusable sub-flows
│   ├── login.yaml              # Parameterized login (email, password)
│   ├── org-login.yaml          # Org slug login
│   ├── logout.yaml
│   ├── navigate-to-quest.yaml
│   ├── navigate-to-course.yaml
│   ├── capture-moment.yaml
│   └── upload-evidence.yaml
└── suites/
    ├── smoke.yaml              # ~8 critical paths, <3 min
    ├── core.yaml               # ~30 role journeys, <15 min
    ├── invitations.yaml        # All invitation flows
    ├── full-web.yaml           # Everything, web
    └── full-mobile.yaml        # Everything, mobile
```

### Test Users (to be seeded)
| User | Role | Organization | Notes |
|------|------|-------------|-------|
| `test-student@optio.test` | student | None | Platform student, has active quests + courses |
| `test-parent@optio.test` | parent | None | Has 2 dependents (one under 13) |
| `test-advisor@optio.test` | advisor | None | Has assigned students |
| `test-observer@optio.test` | observer | None | Linked to test student |
| `test-orgadmin@optio.test` | org_managed (org_admin) | Test Org | Org admin for "Test Academy" |
| `test-orgstudent@optio.test` | org_managed (student) | Test Org | Student in "Test Academy" |
| `test-orgparent@optio.test` | org_managed (parent) | Test Org | Parent in "Test Academy" |
| `test-super@optio.test` | superadmin | None | Superadmin |
| `fresh-user@optio.test` | (none) | None | For registration tests (deleted + recreated each run) |

### Prerequisites
- Test database seeded with known state (quests, courses, bounties, tasks)
- Seed script resets test data before each full suite run
- `testID` props added to all interactive elements in the app

---

## Priority 1: Smoke Suite (Run Every Deploy)

These are the absolute critical paths. If any of these break, the app is unusable.

| # | Flow | Role | Description |
|---|------|------|-------------|
| S1 | `auth/login-student` | student | Login with email/password, verify dashboard loads |
| S2 | `student/dashboard-loads` | student | Dashboard shows welcome, stats, active quests, courses |
| S3 | `student/complete-task-with-evidence` | student | Open quest, create task, upload evidence, complete task, verify XP |
| S4 | `student/course-lesson-task` | student | Open course, view lesson, complete lesson task with evidence |
| S5 | `parent/act-as-child` | parent | Login, select child, act as child, verify child dashboard |
| S6 | `parent/capture-for-child` | parent | Login, capture learning moment for child |
| S7 | `auth/register-student` | fresh | Register new account, verify all validations, land on dashboard |
| S8 | `auth/org-login` | org_student | Login via org slug, verify dashboard |

---

## Priority 2: Core Role Journeys

### 2.1 Authentication (13 flows)

| # | Flow | Description | Platform |
|---|------|-------------|----------|
| A1 | `auth/login-email-password` | Standard login, verify role-based redirect | web + mobile |
| A2 | `auth/login-validation-errors` | Empty fields, invalid email, wrong password | web + mobile |
| A3 | `auth/login-google-oauth` | Google OAuth button -> callback -> redirect | web only |
| A4 | `auth/register-full-flow` | All fields, password strength meter, ToS, COPPA, email verification | web + mobile |
| A5 | `auth/register-under-13-blocked` | Enter DOB < 13 years ago, verify registration blocked | web + mobile |
| A6 | `auth/register-password-strength` | Verify all 5 password rules display and update live | web + mobile |
| A7 | `auth/register-field-validation` | Missing fields, email format, password mismatch | web + mobile |
| A8 | `auth/forgot-password` | Open modal from login, enter email, verify success message | web + mobile |
| A9 | `auth/reset-password` | Navigate with token, enter new password, verify redirect to login | web + mobile |
| A10 | `auth/org-login-valid-slug` | Navigate to /org-login/:slug, see org branding, login | web + mobile |
| A11 | `auth/org-login-invalid-slug` | Navigate to /org-login/bad-slug, verify error state | web + mobile |
| A12 | `auth/org-login-already-authenticated` | Visit org login while logged in, see continue/switch options | web + mobile |
| A13 | `auth/session-persistence` | Login, close app, reopen, verify still authenticated | mobile |

### 2.2 Student Flows (22 flows)

#### Dashboard
| # | Flow | Description | Platform |
|---|------|-------------|----------|
| ST1 | `student/dashboard-welcome-stats` | Welcome card, XP count, quest count, task count | web + mobile |
| ST2 | `student/dashboard-active-quests` | Quest cards render with heatmap, rhythm badge | web + mobile |
| ST3 | `student/dashboard-enrolled-courses` | Course cards with image, progress bar | web + mobile |
| ST4 | `student/dashboard-learning-rhythm` | RhythmBadge displays, engagement calendar renders | web + mobile |
| ST5 | `student/dashboard-next-up-panel` | Next Up shows 1 task per quest with pillar + XP | web + mobile |
| ST6 | `student/dashboard-completed-quests` | Completed quests section with dates | web + mobile |
| ST7 | `student/dashboard-empty-state` | New student with no quests, shows browse link | web + mobile |
| ST8 | `student/dashboard-diploma-tracker` | Diploma credit tracker renders (if applicable) | web + mobile |

#### Quests
| # | Flow | Description | Platform |
|---|------|-------------|----------|
| ST9 | `student/quest-discovery` | Browse quests, search, filter by topic/subtopic | web only |
| ST10 | `student/quest-start` | Find quest, click Start, verify enrollment | web only |
| ST11 | `student/quest-restart-conflict` | Start a previously-abandoned quest, handle 409 dialog | web only |
| ST12 | `student/quest-create-task` | In active quest, create manual task with title + pillar + XP | web only |
| ST13 | `student/quest-ai-task-generation` | Use AI to generate personalized tasks | web only |
| ST14 | `student/quest-submit-evidence-photo` | Upload photo evidence on a task | web only |
| ST15 | `student/quest-submit-evidence-text` | Submit text evidence on a task | web only |
| ST16 | `student/quest-submit-evidence-link` | Submit link evidence on a task | web only |
| ST17 | `student/quest-complete-task` | Complete a task, verify XP updates in progress bar | web only |
| ST18 | `student/quest-completion-celebration` | Complete all required tasks, verify celebration screen | web only |
| ST19 | `student/quest-leave` | Leave/end quest with confirmation dialog | web only |

#### Courses
| # | Flow | Description | Platform |
|---|------|-------------|----------|
| ST20 | `student/course-browse-enrolled` | View enrolled courses, search | web only |
| ST21 | `student/course-detail-lessons` | Open course, expand project, view lessons, navigate steps | web only |
| ST22 | `student/course-complete-lesson` | Step through lesson, mark complete, verify checkmark | web only |
| ST23 | `student/course-task-from-suggestions` | Add suggested task from carousel, complete it | web only |
| ST24 | `student/course-manual-task-create` | Create custom task within course project | web only |
| ST25 | `student/course-task-evidence-upload` | Upload evidence on a course task, complete task | web only |
| ST26 | `student/course-progress-tracking` | Verify progress bar updates as tasks complete | web only |

#### Learning Journal
| # | Flow | Description | Platform |
|---|------|-------------|----------|
| ST27 | `student/journal-view-moments` | View journal, see moments in topic sidebar | web + mobile |
| ST28 | `student/journal-capture-quick` | Use FAB/capture to quickly capture a moment with media | web + mobile |
| ST29 | `student/journal-edit-moment` | Tap moment, edit title/desc/pillars/topic via modal | web + mobile |
| ST30 | `student/journal-create-topic` | Create new interest topic with name, color, icon | web + mobile |
| ST31 | `student/journal-assign-to-topic` | Assign an unassigned moment to a topic | web + mobile |
| ST32 | `student/journal-delete-moment` | Delete a moment with confirmation | web + mobile |
| ST33 | `student/journal-evolve-topic-to-quest` | Evolve a topic into a quest | web only |
| ST34 | `student/journal-ai-suggestions` | Edit moment, trigger AI suggestions for title + pillars | web + mobile |

#### Bounties
| # | Flow | Description | Platform |
|---|------|-------------|----------|
| ST35 | `student/bounty-browse` | View bounty board, filter by pillar | web + mobile |
| ST36 | `student/bounty-claim` | Claim a bounty, verify appears in Claims tab | web + mobile |
| ST37 | `student/bounty-complete-deliverables` | Check off deliverables, upload evidence per deliverable | web + mobile |
| ST38 | `student/bounty-turn-in` | Turn in completed bounty, verify status change | web + mobile |
| ST39 | `student/bounty-create` | Create a new bounty with deliverables + rewards | web + mobile |
| ST40 | `student/bounty-edit` | Edit an existing bounty | web + mobile |
| ST41 | `student/bounty-review-submission` | As poster, review a claim: approve/reject/request revision | web + mobile |

#### Buddy
| # | Flow | Description | Platform |
|---|------|-------------|----------|
| ST42 | `student/buddy-create` | New user creates buddy, verify display | web + mobile |
| ST43 | `student/buddy-feed` | Feed buddy, verify daily limit, vitality change | web + mobile |
| ST44 | `student/buddy-tap` | Tap buddy, verify bond change | web + mobile |

#### Profile
| # | Flow | Description | Platform |
|---|------|-------------|----------|
| ST45 | `student/profile-view` | View profile: avatar, stats, pillar radar, engagement | web + mobile |
| ST46 | `student/profile-edit` | Edit name, display name, bio | web + mobile |
| ST47 | `student/profile-invite-observer` | Invite observer via email from profile | web + mobile |
| ST48 | `student/profile-remove-observer` | Remove an observer from list | web + mobile |
| ST49 | `student/profile-portfolio-share` | Toggle portfolio public, copy share link | web + mobile |
| ST50 | `student/profile-ferpa-consent` | FERPA consent modal flow for making portfolio public | web + mobile |
| ST51 | `student/profile-account-deletion` | Request account deletion, verify 30-day grace period | web + mobile |
| ST52 | `student/profile-cancel-deletion` | Cancel pending deletion request | web + mobile |

#### Feed
| # | Flow | Description | Platform |
|---|------|-------------|----------|
| ST53 | `student/feed-view` | View activity feed with learning moments + task completions | web + mobile |
| ST54 | `student/feed-like` | Like a feed item, verify optimistic UI | web + mobile |
| ST55 | `student/feed-share` | Share a feed item (clipboard on web, share sheet on mobile) | web + mobile |
| ST56 | `student/feed-toggle-visibility` | Toggle post public/private with eye icon | web + mobile |
| ST57 | `student/feed-confidential-share-blocked` | Attempt to share a private post, verify blocked | web + mobile |

#### Communication
| # | Flow | Description | Platform |
|---|------|-------------|----------|
| ST58 | `student/messages-send-dm` | Open contacts, select user, send direct message | web only |
| ST59 | `student/messages-view-conversations` | View conversation list, open existing chat | web only |

#### Notifications
| # | Flow | Description | Platform |
|---|------|-------------|----------|
| ST60 | `student/notifications-view` | View notification list, see unread count | web + mobile |
| ST61 | `student/notifications-mark-read` | Mark single notification as read | web + mobile |
| ST62 | `student/notifications-mark-all-read` | Mark all as read | web + mobile |
| ST63 | `student/notifications-delete` | Delete a notification | web + mobile |
| ST64 | `student/notifications-deep-link` | Tap notification, navigate to linked content | web + mobile |
| ST65 | `student/notifications-filter-unread` | Toggle unread filter | web + mobile |

### 2.3 Parent Flows (16 flows)

| # | Flow | Description | Platform |
|---|------|-------------|----------|
| P1 | `parent/family-dashboard-loads` | View family tab, see child selector, hero card, stats | web + mobile |
| P2 | `parent/select-child` | Switch between multiple children | web + mobile |
| P3 | `parent/child-hero-stats` | Verify XP, active quests, completed quests for selected child | web + mobile |
| P4 | `parent/child-active-quests` | View child's active quests list | web + mobile |
| P5 | `parent/child-engagement-calendar` | View child's engagement calendar + rhythm badge | web + mobile |
| P6 | `parent/child-activity-feed` | View child's recent activity in feed | web + mobile |
| P7 | `parent/capture-for-single-child` | Capture learning moment for selected child | web + mobile |
| P8 | `parent/capture-for-all-children` | Capture learning moment for all children at once | web + mobile |
| P9 | `parent/act-as-child-view` | "View As" child, see child's dashboard/quests/journal | web + mobile |
| P10 | `parent/act-as-return-to-parent` | Return to parent view from act-as mode | web + mobile |
| P11 | `parent/invite-observer-for-child` | Invite observer via email for selected child | web + mobile |
| P12 | `parent/remove-observer-from-child` | Remove an observer from child | web + mobile |
| P13 | `parent/toggle-ai-for-child` | Toggle AI features on/off for child | web + mobile |
| P14 | `parent/upload-child-avatar` | Upload profile picture for child | web + mobile |
| P15 | `parent/promote-dependent-to-login` | Give child their own login credentials | web + mobile |
| P16 | `parent/empty-state-no-children` | View family tab with no linked children | web + mobile |

### 2.4 Observer Flows (8 flows)

| # | Flow | Description | Platform |
|---|------|-------------|----------|
| O1 | `observer/feed-linked-students` | View feed showing linked students' activity | web + mobile |
| O2 | `observer/like-student-activity` | Like a student's feed item | web + mobile |
| O3 | `observer/comment-on-activity` | Post a comment on a student's work | web + mobile |
| O4 | `observer/delete-comment` | Delete own comment | web + mobile |
| O5 | `observer/view-student-portfolio` | View a linked student's portfolio | web + mobile |
| O6 | `observer/multiple-students` | View feed with multiple linked students, see student names | web + mobile |
| O7 | `observer/share-feed-item` | Share a student's feed item | web + mobile |
| O8 | `observer/toggle-feed-visibility` | Toggle visibility on feed items | web + mobile |

### 2.5 Advisor Flows (8 flows)

| # | Flow | Description | Platform |
|---|------|-------------|----------|
| AD1 | `advisor/dashboard-caseload` | View student caseload list, search students | web only |
| AD2 | `advisor/student-detail` | Select student, view engagement calendar, rhythm, quests | web only |
| AD3 | `advisor/student-pillar-radar` | View student's pillar radar chart | web only |
| AD4 | `advisor/create-checkin` | Create a check-in note for a student | web only |
| AD5 | `advisor/checkin-history` | View check-in history for a student | web only |
| AD6 | `advisor/create-quest` | Create a quest from advisor dashboard | web only |
| AD7 | `advisor/feed-student-activity` | View linked students' activity in feed | web + mobile |
| AD8 | `advisor/quest-discovery-create` | Create quest from quest discovery page | web only |

### 2.6 Org Admin Flows (10 flows)

| # | Flow | Description | Platform |
|---|------|-------------|----------|
| OA1 | `org-admin/org-login` | Login via org slug as org_admin | web + mobile |
| OA2 | `org-admin/dashboard` | View org admin dashboard | web + mobile |
| OA3 | `org-admin/invite-student-email` | Send email invitation to student | web only |
| OA4 | `org-admin/invite-parent-email` | Send parent invitation linked to student | web only |
| OA5 | `org-admin/generate-invite-link` | Generate shareable invitation link | web only |
| OA6 | `org-admin/view-pending-invitations` | View list of sent invitations + status | web only |
| OA7 | `org-admin/resend-invitation` | Resend an expired/pending invitation | web only |
| OA8 | `org-admin/cancel-invitation` | Cancel a pending invitation | web only |
| OA9 | `org-admin/view-org-users` | View all users in the organization | web only |
| OA10 | `org-admin/manage-courses` | View/manage org courses | web only |

### 2.7 Superadmin Flows (12 flows)

| # | Flow | Description | Platform |
|---|------|-------------|----------|
| SA1 | `superadmin/admin-panel-users` | View users tab, search, filter by role | web only |
| SA2 | `superadmin/admin-panel-quests` | View quests tab | web only |
| SA3 | `superadmin/admin-panel-orgs` | View organizations tab | web only |
| SA4 | `superadmin/masquerade-as-user` | Masquerade as another user, verify their view | web only |
| SA5 | `superadmin/broadcast-notification` | Send broadcast notification to audience | web only |
| SA6 | `superadmin/send-targeted-notification` | Send notification to specific user | web only |
| SA7 | `superadmin/view-all-bounties` | See all bounties in Posted tab | web only |
| SA8 | `superadmin/moderate-bounty` | Moderate/remove a bounty | web only |
| SA9 | `superadmin/manage-org-detail` | View org detail, members, settings | web only |
| SA10 | `superadmin/course-management` | View all courses (published/draft/archived) | web only |
| SA11 | `superadmin/course-edit` | Edit a course via course editor | web only |
| SA12 | `superadmin/buddy-debug-controls` | Use debug sliders to manipulate buddy state | web only |

---

## Priority 3: Invitation Flows (Cross-Role)

These flows span multiple user roles and are critical for user onboarding.

### 3.1 Observer Invitation Flows (8 flows)

| # | Flow | Description | Roles Involved |
|---|------|-------------|----------------|
| INV1 | `invitations/student-invites-observer` | Student invites observer from profile, observer receives and accepts | student -> observer |
| INV2 | `invitations/parent-invites-observer` | Parent invites observer for child from family tab | parent -> observer |
| INV3 | `invitations/observer-accepts-via-code` | Observer enters invitation code manually | observer |
| INV4 | `invitations/observer-accepts-via-deep-link` | Observer clicks link, auto-accepts | observer |
| INV5 | `invitations/student-views-pending-invitations` | Student sees list of pending observer invitations | student |
| INV6 | `invitations/student-cancels-observer-invitation` | Student cancels a pending invitation | student |
| INV7 | `invitations/student-removes-observer` | Student removes an active observer | student |
| INV8 | `invitations/parent-removes-observer-from-child` | Parent removes observer from child | parent |

### 3.2 Organization Invitation Flows (8 flows)

| # | Flow | Description | Roles Involved |
|---|------|-------------|----------------|
| INV9 | `invitations/org-invite-new-student` | Org admin invites new student by email, student accepts | org_admin -> new user |
| INV10 | `invitations/org-invite-existing-user` | Org admin invites existing platform user, they join org | org_admin -> existing user |
| INV11 | `invitations/org-invite-parent-linked` | Org admin invites parent linked to specific student(s) | org_admin -> parent |
| INV12 | `invitations/org-invite-via-link` | Org admin generates link, new user visits /invite/:code | org_admin -> new user |
| INV13 | `invitations/org-link-existing-account-join` | Existing user visits invite link, detects account, enters password to join | existing user |
| INV14 | `invitations/org-invite-invalid-code` | Visit /invite/:code with expired/invalid code | any |
| INV15 | `invitations/org-invite-logged-in-quick-join` | Already authenticated user visits invite link, quick-join button | authenticated user |
| INV16 | `invitations/org-resend-and-cancel` | Org admin resends then cancels an invitation | org_admin |

### 3.3 Parent-Child Linking Flows (4 flows)

| # | Flow | Description | Roles Involved |
|---|------|-------------|----------------|
| INV17 | `invitations/parent-creates-dependent` | Parent creates a new dependent child account | parent |
| INV18 | `invitations/parent-promotes-dependent` | Parent gives dependent their own login | parent |
| INV19 | `invitations/promote-observer-to-parent` | Promote an observer to parent role | parent/admin |
| INV20 | `invitations/parent-toggle-child-access` | Parent toggles which children an observer can see | parent |

---

## Priority 4: Edge Cases & Error States (20 flows)

| # | Flow | Description | Priority |
|---|------|-------------|----------|
| E1 | `edge/login-wrong-password` | Wrong password shows error, doesn't crash | high |
| E2 | `edge/login-nonexistent-email` | Nonexistent email shows appropriate error | high |
| E3 | `edge/register-duplicate-email` | Attempt to register with existing email | high |
| E4 | `edge/quest-409-restart-dialog` | Previously abandoned quest shows restart modal | high |
| E5 | `edge/expired-invitation-code` | Invitation page shows expired/invalid state | high |
| E6 | `edge/reset-password-invalid-token` | Reset password with bad token shows error | high |
| E7 | `edge/network-error-recovery` | API failure shows error state, retry works | medium |
| E8 | `edge/empty-feed` | Feed with no items shows empty state | medium |
| E9 | `edge/empty-bounty-board` | Bounty board with no bounties shows empty state | medium |
| E10 | `edge/empty-courses` | Courses tab with no enrolled courses | medium |
| E11 | `edge/empty-quests` | Quest discovery with no results after filter | medium |
| E12 | `edge/confidential-post-share-blocked` | Share button blocked on private posts | medium |
| E13 | `edge/bounty-revision-requested` | Bounty claim shows revision banner + action | medium |
| E14 | `edge/under-13-parent-controls` | Under-13 child has appropriate restrictions | medium |
| E15 | `edge/concurrent-session` | Login from second device, first session still works | low |
| E16 | `edge/deep-link-unauthenticated` | Deep link to app content redirects to login first | medium |
| E17 | `edge/pull-to-refresh` | Pull to refresh updates data on feed/dashboard | low |
| E18 | `edge/long-content-truncation` | Long quest titles, descriptions don't break layout | low |
| E19 | `edge/special-characters-input` | Special chars in names, descriptions, messages | low |
| E20 | `edge/dark-mode-toggle` | Toggle dark mode, verify readability | low |

---

## Priority 5: Platform-Specific Flows (8 flows)

| # | Flow | Description | Platform |
|---|------|-------------|----------|
| PL1 | `platform/mobile-tab-navigation` | Navigate all 5 bottom tabs: Bounties, Journal, Home, Buddy, Profile | mobile |
| PL2 | `platform/web-sidebar-navigation` | Navigate all sidebar items: Home, Quests, Bounty Board, Buddy, Journal, Profile | web |
| PL3 | `platform/mobile-capture-camera` | Open capture with camera on mobile | mobile |
| PL4 | `platform/mobile-push-notification-received` | Receive push notification while app is open | mobile |
| PL5 | `platform/mobile-push-notification-tap` | Tap push notification, navigate to content | mobile |
| PL6 | `platform/web-desktop-only-pages` | Quests, Admin, Courses show "Desktop Only" on mobile web | web (narrow) |
| PL7 | `platform/mobile-back-navigation` | Back button works correctly on all screens | mobile |
| PL8 | `platform/web-responsive-layout` | Sidebar collapses at breakpoint, tabs switch | web |

---

## Flow Count Summary

| Category | Count |
|----------|-------|
| Smoke (P1) | 8 |
| Auth (P2) | 13 |
| Student (P2) | 65 |
| Parent (P2) | 16 |
| Observer (P2) | 8 |
| Advisor (P2) | 8 |
| Org Admin (P2) | 10 |
| Superadmin (P2) | 12 |
| Invitation Cross-Role (P3) | 20 |
| Edge Cases (P4) | 20 |
| Platform-Specific (P5) | 8 |
| **Total** | **188** |

Note: Smoke suite flows are a subset of P2 flows, not additive. **Unique total: ~180 flows.**

---

## Suite Definitions

### `smoke.yaml` -- Run on every deploy (~3 min)
Flows: S1-S8

### `core.yaml` -- Run before merging to main (~15 min)
Flows: All P2 flows (auth + all roles)

### `invitations.yaml` -- Run when invitation code changes (~5 min)
Flows: All P3 flows (INV1-INV20)

### `full-web.yaml` -- Run nightly or before release (~25 min)
Flows: All P1-P5 flows filtered to `web` platform

### `full-mobile.yaml` -- Run nightly or before release (~25 min)
Flows: All P1-P5 flows filtered to `mobile` platform

---

## Implementation Order

### Phase 1: Foundation (do first)
1. Set up maestro project structure + config
2. Create test user seed script
3. Add `testID` props to all interactive elements app-wide
4. Build shared sub-flows (login, logout, navigate)
5. Write smoke suite (S1-S8)

### Phase 2: Student Core
6. Student dashboard flows (ST1-ST8)
7. Student quest flows (ST9-ST19)
8. Student course flows (ST20-ST26)
9. Student journal flows (ST27-ST34)

### Phase 3: Student Extended
10. Student bounty flows (ST35-ST41)
11. Student buddy flows (ST42-ST44)
12. Student profile flows (ST45-ST52)
13. Student feed flows (ST53-ST57)
14. Student comms + notifications (ST58-ST65)

### Phase 4: Other Roles
15. Parent flows (P1-P16)
16. Observer flows (O1-O8)
17. Advisor flows (AD1-AD8)
18. Org admin flows (OA1-OA10)
19. Superadmin flows (SA1-SA12)

### Phase 5: Cross-Role + Edge Cases
20. Observer invitation flows (INV1-INV8)
21. Org invitation flows (INV9-INV16)
22. Parent-child linking flows (INV17-INV20)
23. Edge cases (E1-E20)
24. Platform-specific flows (PL1-PL8)

---

## testID Convention

All interactive elements need `testID` props for reliable Maestro selection.

```
Pattern: {page}-{element}-{qualifier}

Examples:
  testID="login-email-input"
  testID="login-password-input"
  testID="login-submit-button"
  testID="dashboard-welcome-card"
  testID="dashboard-quest-card-{id}"
  testID="quest-detail-start-button"
  testID="quest-detail-task-{id}"
  testID="family-child-selector-{id}"
  testID="family-capture-button"
  testID="invite-accept-button"
  testID="notification-item-{id}"
```

---

## CI/CD Integration

- **On push to `develop`**: Run smoke suite
- **On PR to `main`**: Run core + invitations suites
- **Nightly (scheduled)**: Run full-web + full-mobile suites
- **Before release**: Run everything, require 100% pass rate
