# V2 Launch Readiness - Page-by-Page Verification

**Created**: 2026-03-27
**Updated**: 2026-03-27
**Purpose**: Systematic comparison of v1 vs v2 web functionality for v2 launch
**Status**: In Progress - Auth fixed, bounties fixed, journal/capture updated, courses redesigned (task-first)

Legend:
- [x] = Verified working in v2
- [ ] = Not yet verified
- MISSING = Feature does not exist in v2 yet
- PARTIAL = Exists but incomplete vs v1
- OK = Feature parity with v1

---

## Priority 1: Core Student Experience

### 1.1 Authentication

#### Item 1: Login (`/(auth)/login`) -- FIXED 2026-03-27

| Feature | V1 | V2 | Gap |
|---------|----|----|-----|
| Email/password fields | Yes | Yes | OK |
| Email regex validation | Yes (client-side) | Yes | **FIXED** |
| Field-level error messages | Yes (per-field, aria) | Yes (per-field, red border) | **FIXED** |
| Show/hide password toggle | Yes | Yes | OK |
| Google OAuth button | Yes | Yes (web only) | OK |
| Forgot Password link | Yes (navigates) | Yes (modal with API call) | **FIXED** |
| Sign Up link | Yes | Yes | OK |
| Loading state on submit | Yes (spinner + text) | Yes (Button prop) | OK |
| Error display | Red banner with icon | Red box, plain text | PARTIAL |
| Role-based redirect after login | Yes (parent->parent dash, observer->welcome/feed, etc.) | Yes (parent->family, advisor->advisor, student->dashboard) | **FIXED** |
| Observer invitation code handling | Yes (localStorage, auto-accept) | No | MISSING |
| Account switching (already authenticated) | Yes (continue as / switch) | Yes (parent act-as + admin masquerade) | **FIXED** |
| Session end warning | Yes (yellow banner) | No | MISSING |

**Tests**: 17 unit tests in `app/(auth)/__tests__/login.test.tsx` -- validation, role redirect, forgot password modal

#### Item 2: Registration (`/(auth)/register`) -- FIXED 2026-03-27

| Feature | V1 | V2 | Gap |
|---------|----|----|-----|
| First/Last name fields | Yes | Yes | OK |
| Email field | Yes | Yes | OK |
| Email format validation | Yes (regex) | Yes | **FIXED** |
| Password field | Yes | Yes | OK |
| Password strength validation | 12 chars, upper, lower, number, special | Yes (same rules, live indicators) | **FIXED** |
| Password strength meter UI | Yes (PasswordStrengthMeter) | Yes (inline checkmarks) | **FIXED** |
| Confirm password field | Yes (must match) | Yes | **FIXED** |
| Date of birth field | Yes (required) | Yes (native date picker on web) | **FIXED** |
| Under-13 age check + block | Yes (COPPA, blocks registration) | Yes (amber warning, button disabled) | **FIXED** |
| Terms of Service checkbox | Yes (required, links to /terms) | Yes (checkbox with linked text) | **FIXED** |
| Privacy Policy acceptance | Yes (required, links to /privacy) | Yes (same checkbox) | **FIXED** |
| Google OAuth sign-up | Yes | Yes (web only) | **FIXED** |
| Observer invitation code flow | Yes (query param, localStorage) | No | MISSING |
| Email verification screen | Implied | Yes (explicit screen) | OK |
| Role-based redirect after register | Yes (parent/observer/student) | Yes | **FIXED** |
| Per-field error messages | Yes (inline, aria) | Yes (per-field, red border) | **FIXED** |
| Error object rendering crash | N/A | Fixed (extracts .message from objects) | **FIXED** |

**Tests**: 12 unit tests in `app/(auth)/__tests__/register.test.tsx` -- field validation, password strength, terms, error display

#### Item 3: Org Login (`/login/:slug`)
**Status**: MISSING from v2. No page exists.

#### Item 4: Forgot Password
**Status**: **FIXED** 2026-03-27. Integrated as modal in login page. Calls `POST /api/auth/forgot-password`, shows success/error.

#### Item 5: Reset Password (`/(auth)/reset-password`) -- FIXED 2026-03-27

| Feature | V1 | V2 | Gap |
|---------|----|----|-----|
| Token from URL query param | Yes | Yes | OK |
| New password field | Yes | Yes | OK |
| Confirm password field | Yes | Yes | OK |
| Password strength indicators | Yes | Yes (live checkmarks) | OK |
| Invalid/expired token handling | Yes | Yes (error display) | OK |
| Success state + redirect to login | Yes | Yes | OK |
| API field name (new_password) | Yes | Yes | **FIXED** (was sending wrong field) |

**Tests**: 9 unit tests in `app/(auth)/__tests__/reset-password.test.tsx` -- token handling, validation, API call, success/error

#### Item 6: OAuth Callback (`/auth/callback`)
**Status**: Exists in v2. Handles Google redirect and token exchange.

#### Item 7: Email Verification
**Status**: MISSING as standalone page. V2 shows verification message inline after registration.

#### Auth Store Tests -- ADDED 2026-03-27
18 unit tests in `src/stores/__tests__/authStore.test.ts` covering login, register, logout, loadUser, forgotPassword, and error object extraction bug fix.

#### Backend Fix: Delete User -- FIXED 2026-03-27
`admin_core.py:delete_user_account` was referencing deleted `promo_codes` table causing 500 error. Removed stale reference.

---

### 1.2 Dashboard

#### Item 8: Student Dashboard (`/(app)/(tabs)/dashboard`) -- PARTIAL FIX 2026-03-27

| Feature | V1 | V2 | Gap |
|---------|----|----|-----|
| Welcome card with greeting | Yes (new user vs returning) | Yes (always "Welcome back") | PARTIAL - no new user variant |
| User stats (XP, quests, tasks) | Yes | Yes (3 stats in welcome card) | OK |
| Active quests grid | Yes (QuestCardSimple) | Yes (QuestCard with heatmap) | OK |
| Enrolled courses display | Yes (CourseCardWithQuests) | Yes (cards with image, progress) | **FIXED** |
| Learning Rhythm section | Yes (RhythmIndicator + calendar) | Yes (RhythmBadge + EngagementCalendar) | OK |
| Rhythm explainer modal | Yes (click to learn more) | No (static display) | MISSING |
| Upcoming Tasks panel ("Next Up") | Yes (1 task per quest, pillar variety) | No | MISSING |
| Diploma Credit Tracker | Yes (DiplomaCreditTracker) | No | MISSING |
| Completed quests section | Yes (grid + list with dates) | Yes (list with dates) | OK |
| Quick Capture FAB | Yes (floating button) | No | MISSING |
| Browse quests link (empty state) | Yes | Yes (wired to navigation) | **FIXED** |
| Browse All button | Yes | Yes (wired to quests page) | **FIXED** |
| Auto-refresh (30s interval) | Yes | No (pull-to-refresh only) | MISSING |
| Acting as dependent (parent view) | Yes (ActingAsContext) | Yes (actingAsStore + banner) | **FIXED** |
| Mini heatmap on quest cards | No | Yes | V2 improvement |
| RhythmBadge on quest cards | No | Yes | V2 improvement |

**Tests**: 15 unit tests in `app/(app)/(tabs)/__tests__/dashboard.test.tsx` -- welcome header, stats, quest cards, enrolled courses, navigation, empty states

#### Item 9: Activity Feed (`/(app)/(tabs)/feed`) - FIXED 2026-03-27

| Feature | V2 Status | Notes |
|---------|-----------|-------|
| Learning moment cards | Yes | Title, description, evidence, pillars |
| Task completion cards | Yes | Task title, quest, pillar, XP |
| Infinite scroll (cursor pagination) | Yes | 0.3 threshold, loadMore |
| Like/unlike (optimistic UI) | Yes | Heart icon, animated scale |
| Comment button -> CommentSheet | Yes | Opens bottom sheet |
| Share button | Yes | **FIXED** -- creates share link, copies to clipboard (web) or native share sheet (mobile), inline toast confirmation |
| Public/private toggle (students) | Yes | **FIXED** -- eye icon on own posts, toggles is_confidential via API |
| Confidential post protection | Yes | **FIXED** -- share blocked on private posts with alert |
| Evidence display (images, video, text, links, docs) | Yes | Full-screen modal for media |
| Role-based feed source | Yes | Students: own activity; Parents/advisors/observers: linked students |
| Student avatar + name (multi-student) | Yes | Only shown for parent/advisor/observer |
| Pull-to-refresh | Yes | |
| Pillar badges + XP display | Yes | |
| Filter by pillar/type/student | N/A | Not needed per requirements |
| Sort options | N/A | Timestamp desc only - sufficient |
| Search | N/A | Not needed per requirements |

**Tests**: 12 unit tests in `src/components/feed/__tests__/FeedCard.test.tsx` -- rendering, share/clipboard, visibility toggle, confidential blocking, like, XP display

---

### 1.3 Quests

#### Item 10: Quest Discovery (`/(app)/(tabs)/quests`) - Web Only -- PARTIAL FIX 2026-03-27

| Feature | V1 | V2 | Gap |
|---------|----|----|-----|
| Search bar | Yes (debounced 500ms) | Yes (debounced 500ms) | **FIXED** |
| Topic filter chips | Yes (9 topics with counts) | Yes (topics with counts) | OK |
| Subtopic secondary filter | Yes (8-10 per topic) | No | MISSING |
| Infinite scroll | Yes (IntersectionObserver) | Yes (200px threshold) | OK |
| Quest cards in grid | Yes (3-col) | Yes (3-col) | OK |
| Create Quest button + modal | Yes (admin/advisor) | No | MISSING (admin-only, lower priority) |
| Hero gradient banner | Yes (purple-to-pink) | No | MISSING (cosmetic) |
| URL parameter persistence | Yes (?search=&topic=) | No | MISSING |
| Sticky action bar (count, clear) | Yes | No | MISSING (cosmetic) |
| Skeleton loading | Yes (6 items) | Yes (6 items) | OK |
| Empty state | Yes (with create button) | Yes (icon + message) | OK |
| Mobile native support | Yes | No (web-only, shows "Desktop Only") | N/A for web launch |

#### Item 11: Quest Detail (`/(app)/quests/[id]`) - Web Only -- PARTIAL FIX 2026-03-27

| Feature | V1 | V2 | Gap |
|---------|----|----|-----|
| Hero image | Yes | Yes (full-bleed 272-384px) | OK |
| Quest title + description | Yes | Yes | OK |
| Task list display | Yes (TaskWorkspace component) | Yes (expandable inline cards) | OK (different UI) |
| Start/enroll in quest | Yes (enroll button) | Yes ("Start Quest" CTA card) | OK |
| Create task (manual) | Yes (in wizard) | Yes (TaskCreationWizard) | OK |
| AI task generation | Yes (QuestPersonalizationWizard) | Yes (simplified in wizard) | PARTIAL |
| Complete task with evidence | Yes (TaskEvidenceModal) | Yes (inline evidence) | OK (different UI) |
| Evidence upload: photo/file | Yes | Yes (file picker) | OK |
| Evidence upload: text | Yes | Yes (text input modal) | OK |
| Evidence upload: link | Yes | Yes (URL prompt) | OK |
| Evidence upload: document | Yes | Yes (via file picker) | OK |
| Progress bar with XP earned | Yes | Yes (bar + X/Y tasks + XP) | **FIXED** |
| Quest completion celebration | Yes (confetti modal) | Yes (trophy card + XP summary) | **FIXED** |
| XP breakdown by pillar | Yes (pillar breakdown display) | Yes (colored dots in progress) | **FIXED** |
| Leave quest / end quest | Yes (with confirmation) | Yes (confirm dialog, preserves work) | **FIXED** |
| Approach examples section | Yes (before enrollment) | Yes (renders when data available) | OK |
| Task reordering (drag-drop) | Yes | No | MISSING |
| Display mode switching (list/board) | Yes | No | MISSING |
| Metadata card (deliverables) | Yes | No | MISSING |
| Restart quest modal (409 conflict) | Yes (load previous or start fresh) | No | MISSING |
| Role-based features (advisor/admin) | Yes | No | MISSING |
| Lazy-loaded components | Yes (6 components) | No (all eager) | MISSING |
| Engagement widgets (heatmap, rhythm) | No | Yes (MiniHeatmap, RhythmBadge) | V2 improvement |

#### Items 12-13: Quest Curriculum, Task Library
**Status**: Both MISSING from v2. No pages exist.

---

### 1.4 Courses

#### Item 14: My Courses (`/(app)/(tabs)/courses`) - Web Only -- UPDATED 2026-03-27

NOTE: This tab shows **enrolled courses only** (admin-enrolled). The public `/catalog` page is for browsing all courses. Students do NOT self-enroll.

| Feature | V1 | V2 | Gap |
|---------|----|----|-----|
| Search enrolled courses | Yes | Yes | OK |
| Status filter (All/Published/Drafts) | Yes (superadmin) | Yes (superadmin, admin_all filter) | **FIXED** |
| Create Course button | Yes (superadmin) | No | MISSING |
| Edit Course button | Yes (creators) | Yes (superadmin, View + Edit buttons) | **FIXED** |
| Grid of course cards | Yes (3-col) | Yes (3-col) | OK |
| Card: cover image | Yes | Yes | OK |
| Card: title + description | Yes | Yes | OK |
| Card: status badges | Yes (Draft/Archived/Public) | No | MISSING |
| Card: project count | Yes | Yes | **FIXED** |
| Card: estimated hours, age range | No | Yes | V2 improvement |
| Card: guidance level badge | No | Yes | V2 improvement |
| Skeleton loading | Yes | Yes | OK |
| Empty state | Yes | Yes | OK |

#### Item 15: Course Detail (`/(app)/courses/[id]`) -- REDESIGNED 2026-03-27

NOTE: V2 uses a new task-first design that is intentionally different from v1. Courses are decoupled from quest pages. Students interact with tasks, evidence, and lessons entirely within the course page.

| Feature | V1 | V2 | Gap |
|---------|----|----|-----|
| Hero image | Yes | Yes (full-bleed) | OK |
| Title + description | Yes | Yes | OK |
| Course progress (XP + bar) | Yes | Yes (progress bar + XP earned/total) | **FIXED** |
| Projects as collapsible cards | Yes (sidebar) | Yes (cards with image, progress bar, XP) | **REDESIGNED** |
| Project image in header | No | Yes (thumbnail in collapsed row) | V2 improvement |
| Lesson viewing | Yes (CurriculumView) | Yes (horizontal lesson cards, inline LessonViewer with step nav) | **FIXED** |
| Lesson step-by-step navigation | Yes | Yes (LessonViewer with prev/next/done) | **FIXED** |
| Lesson completion tracking | Yes | Yes (marks complete on "Done", green checkmark) | **FIXED** |
| Lesson content: HTML + video | Yes | Yes (HtmlContent + VideoEmbed in LessonViewer) | **FIXED** |
| Task list per project | Yes (from quest page) | Yes (expandable task cards with evidence) | **REDESIGNED** |
| Task evidence upload | Yes (quest page) | Yes (inline: attach files, notes; capture-style) | **FIXED** |
| Task completion with evidence | Yes | Yes (requires at least 1 evidence block) | **FIXED** |
| Task XP applied to project | Yes | Yes (local + server-side) | **FIXED** |
| Suggested tasks library | No (template tasks) | Yes (quest_template_tasks, carousel with Add buttons) | V2 improvement |
| Suggested task detail modal | No | Yes (tap card to see full description, Add button) | V2 improvement |
| AI task generation | Yes (quest page) | Yes (shared TaskCreationWizard modal) | **FIXED** |
| Manual task creation | Yes (quest page) | Yes (shared TaskCreationWizard modal) | **FIXED** |
| Browse suggested tasks in wizard | No | Yes (Browse Ideas option when suggestions available) | V2 improvement |
| Remove task from project | No explicit | Yes (trash icon in task header) | V2 improvement |
| Delete uploaded evidence | No explicit | Yes (X button on each evidence block) | V2 improvement |
| Course label in portfolio | No | Yes (school icon + course name on quest groups) | V2 improvement |
| Superadmin: View/Edit on catalog | Yes | Yes (buttons on course cards) | **FIXED** |
| Superadmin: Reset progress | No | Yes (text link next to course title) | V2 improvement |
| Enrollment button | Admin-initiated | Yes (enrollment CTA for non-enrolled) | OK |
| Sidebar navigation | Yes (desktop + mobile drawer) | No | MISSING |
| Deep linking (URL params) | Yes (quest=, lesson=, step=) | No | MISSING |
| Unenroll button | Yes (destructive) | No | MISSING |
| Tutorial / onboarding | Yes (walkthrough) | No | MISSING |
| Quest Journey Map | Yes (visual timeline) | No | MISSING |

---

### 1.5 Learning Journal

#### Item 16: Learning Journal (`/(app)/(tabs)/journal`) -- UPDATED 2026-03-28

| Feature | V1 | V2 | Gap |
|---------|----|----|-----|
| Topic sidebar (desktop) | Yes (always visible) | Yes (at 768px+) | OK |
| Mobile topic/detail toggle | Yes | Yes | OK |
| Unassigned moments section | Yes (with count) | Yes (banner) | OK |
| Interest topics list | Yes (collapsible) | Yes (collapsible sections) | OK |
| Quest moments section | Yes | Partial (via hooks) | PARTIAL |
| Course hierarchy in sidebar | Yes (nested projects) | No | MISSING |
| AI topic suggestions | Yes (from unassigned moments) | No | MISSING |
| Create new topic | Yes (modal: name, desc, color, icon) | Yes (modal + inline from card assign menu) | **FIXED** |
| Edit topic (rename) | Yes | Yes (inline rename) | **FIXED** |
| Delete topic | Yes (with confirmation) | Yes (confirm dialog) | **FIXED** |
| Topic icon selection | Yes (folder, star, book, etc.) | No (hardcoded) | MISSING |
| Topic color picker | Yes (6-color palette) | No (random) | MISSING |
| Evolve topic to quest | Yes (modal with AI preview, editable tasks) | Yes (calls API, redirects to quest) | **FIXED** |
| Already-evolved indicator | Yes (green "Evolved!" box) | Yes (green card with link to quest) | **FIXED** |
| Learning event cards | Yes (title, desc, date, pillars) | Yes (tap to expand actions, inline media) | **FIXED** |
| Card: inline media (image/video) | Yes | Yes (images render, videos play inline on web) | **FIXED** |
| Card: delete moment | Yes (delete button) | Yes (tap card, action menu) | **FIXED** |
| Card: edit moment | Yes (edit button + modal) | Yes (EditMomentModal: title, desc, pillars, date, topic) | **FIXED** |
| Card: assign to topic | Yes (dropdown + inline create) | Yes (inline topic picker + create new topic) | **FIXED** |
| AI suggestions in edit | Yes (after 30 chars) | Yes (AI suggest title + pillars, overwrites fields) | **FIXED** |
| Moment detail modal | Yes (full view + edit/delete) | Covered by EditMomentModal (evidence rendered inline) | **FIXED** (via edit modal) |
| Section collapse/expand | Yes (courses, quests, tracks) | No | MISSING |
| Keyboard shortcut hint | Yes (Ctrl+Shift+L) | No | MISSING |
| Parent view of child journal | Yes (/journal/:childId) | No | MISSING |
| Refresh buttons | Yes | No | MISSING |

**Tests**: 7 unit tests in `src/components/journal/__tests__/EditMomentModal.test.tsx` -- pre-fill, pillar selection, save, AI suggestions, topic picker, full-state save, null event
**Tests**: 7 unit tests in `src/components/journal/__tests__/LearningEventCard.test.tsx` -- rendering, topic tags, evidence indicators, description dedup, action menu

#### Item 28: Capture Sheet (CaptureSheet modal) - UPDATED 2026-03-28

NOTE: Quick capture is intentionally minimal -- capture media fast, add details later via journal edit.

| Feature | V2 Status | V1 Equivalent | Gap vs V1 |
|---------|-----------|---------------|-----------|
| Description textarea | Yes | Yes (LearningEventModal) | OK |
| Multiple file upload | Yes (multi-select picker, shared /api/uploads/evidence) | Yes (multiple blocks) | **FIXED** |
| Pillar selection | Yes (web CaptureModal only, optional) | Yes (5 pillar toggles) | **FIXED** (web) |
| Title field | Via journal edit (EditMomentModal) | Yes (optional) | **FIXED** (edit-after-capture) |
| Event date picker | Via journal edit (EditMomentModal) | Yes | **FIXED** (edit-after-capture) |
| Topic/track assignment | Via journal edit (EditMomentModal) | Yes (TrackSelector) | **FIXED** (edit-after-capture) |
| Evidence blocks (text, link, doc) | No | Yes (4 block types) | MISSING |
| AI suggestions (title + pillars) | Via journal edit (EditMomentModal) | Yes (after 30 chars) | **FIXED** (edit-after-capture) |
| Edit mode (edit existing moment) | Yes (EditMomentModal from journal) | Yes | **FIXED** |
| Voice capture | Placeholder (disabled) | No | N/A |
| Parent capture for child | Yes (studentIds prop, JSON body) | Yes | OK |
| File upload uses shared service | Yes (same /api/uploads/evidence as bounty evidence) | N/A | **FIXED** |
| Evidence blocks saved with file_url | Yes (backend save_evidence_blocks stores file_url + file_name) | N/A | **FIXED** |

**Tests**: 6 unit tests in `src/components/capture/__tests__/CaptureSheet.test.tsx` -- rendering, camera, multi-select, shared upload save flow, description-only save, close reset
**Tests**: 3 unit tests in `src/components/capture/__tests__/CaptureSheet.parentCapture.test.tsx` -- single kid, multi-kid, realtime source type

---

### 1.6 Bounties

#### Item 17: Bounty Board (`/(app)/(tabs)/bounties`)

| Feature | V1 | V2 | Gap |
|---------|----|----|-----|
| Three tabs (Browse/Claims/Posted) | Yes | Yes (with count badges) | OK |
| Browse: pillar filter | Yes (grid buttons) | Yes (horizontal scroll) | OK |
| Browse: bounty cards | Yes | Yes | OK |
| Browse: custom reward display | Yes | Yes (gift icon + text) | OK |
| Claims: progress bar per claim | Yes (X/Y deliverables) | Yes | OK |
| Claims: deliverables list | Yes (checkmarks) | No | MISSING |
| Claims: evidence upload on board | Yes (modal) | No | MISSING |
| Claims: turn in from board | Yes | No | MISSING |
| Claims: status badges | Yes | Yes | OK |
| Posted: edit button | Yes | Yes (pencil icon) | OK |
| Posted: delete button | Yes | Yes | OK |
| Posted: "awaiting review" badge | Yes | Yes | OK |
| Posted: post bounty button | No | Yes | V2 improvement |
| Superadmin: see all bounties in Posted | N/A | Yes | V2 improvement |

#### Item 18: Bounty Detail (`/(app)/bounties/[id]`)

| Feature | V1 | V2 | Gap |
|---------|----|----|-----|
| Bounty info (title, desc, rewards) | Yes | Yes | OK |
| Deliverables list with status | Yes | Yes | OK |
| Progress bar (when claimed) | No | Yes | V2 improvement |
| Claim bounty button | Yes | Yes | OK |
| Evidence upload per deliverable | Yes (modal) | Yes (bottom sheet) | OK (different UI) |
| Evidence viewing inline | Yes (viewer modal) | Yes (inline per deliverable) | OK |
| Evidence deletion | Yes | Yes (trash icon per item) | OK |
| Turn in button | Yes | Yes | OK |
| Status messages (submitted/approved/rejected) | Yes (4 types) | Yes (4 types) | OK |
| Revision requested status | Yes (with instructions) | Yes (banner + "Revise" action) | OK |
| Poster/superadmin redirect to review | Yes (on same page) | Yes (separate /review page) | OK (restructured) |

#### Item 19: Create Bounty (`/(app)/bounties/create`)

| Feature | V1 | V2 | Gap |
|---------|----|----|-----|
| Title + description | Yes | Yes | OK |
| Dynamic deliverables list | Yes | Yes | OK |
| XP rewards with pillar | Yes (25-200) | Yes (0-200, custom-only allowed) | OK |
| Custom rewards | Yes | Yes | OK |
| Bounty pillar selector | Implicit (from XP reward) | Yes (explicit pill selector) | V2 improvement |
| Visibility (public/family/org) | Yes (3 options) | Yes (2 options, no org) | PARTIAL |
| Kid selector (family visibility) | Yes | Yes (pill selector) | OK |
| Max claims field | Yes (0=unlimited) | No | MISSING |
| Sponsor preview | Yes | No | MISSING |
| Edit mode (edit existing) | Yes (same page) | Yes (?edit=id param) | OK |
| Per-field validation | Yes | Partial (single formError) | PARTIAL |

#### Item 20: Bounty Review (`/(app)/bounties/review/[id]`)

| Feature | V1 | V2 | Gap |
|---------|----|----|-----|
| Submitted claims list | Yes (inline on detail) | Yes (separate page) | OK (restructured) |
| Student identification | ID only | Avatar + name | V2 improvement |
| Evidence preview per deliverable | Yes (images, video, text, links, docs) | Yes (inline images, text, video links, docs) | OK |
| Deliverable labels in review | Yes | Yes (mapped from bounty data) | OK |
| Fullscreen image modal | Yes | Yes (tap to expand) | OK |
| Feedback textarea | Yes | Yes (submitted only) | OK |
| Approve button | Yes | Yes | OK |
| Request Revision button | Yes | Yes | OK |
| Reject button | Yes | Yes | OK |
| All claims section | No | Yes (grouped view) | V2 improvement |
| Edit bounty link from review | No | Yes | V2 improvement |
| Superadmin full access | No | Yes (view/edit/review any bounty) | V2 improvement |

---

### 1.7 Buddy

#### Item 21: Buddy (`/(app)/(tabs)/buddy`)

| Feature | V1 | V2 | Gap |
|---------|----|----|-----|
| Pet SVG display + animations | Yes | Yes | OK |
| Feed interaction (daily limit) | Yes | Yes | OK |
| Tap interaction (bond) | Yes | Yes | OK |
| Stage evolution (6 stages) | Yes | Yes | OK |
| Vitality + bond stats | Yes | Yes | OK |
| Feed counter dots | Yes | Yes | OK |
| Create buddy form (new users) | Yes | Yes | OK |
| Superadmin debug controls | Yes | Yes (web-only sliders) | OK |
| Quick presets | Yes | Yes | OK |

**Status: Feature parity achieved.**

---

### 1.8 Profile & Portfolio

#### Item 22: Profile (`/(app)/(tabs)/profile`)

| Feature | V1 | V2 | Gap |
|---------|----|----|-----|
| Hero section (avatar, name, stats) | Yes | Yes (card-based) | OK |
| Total XP, quest count, task count | Yes | Yes | OK |
| Member since date | Yes | Yes | OK |
| Edit profile (name fields) | Yes (inline collapsible) | Yes (modal) | OK (different UI) |
| Bio / Learning Vision editing | Yes | No | MISSING (cosmetic) |
| Pillar radar chart | Yes (SkillsRadarChart) | Yes (PillarRadar) | OK |
| Engagement calendar (heatmap) | Implicit in snapshot | Yes (EngagementCalendar) | V2 improvement |
| RhythmBadge | No | Yes | V2 improvement |
| Portfolio section | Yes (achievements, evidence, sharing) | Yes (collapsed, no sharing) | PARTIAL |
| Portfolio sharing / QR code | Yes | No | MISSING |
| Subject credits display | Yes (with progress bars) | Yes (raw data, no bars) | PARTIAL |
| Diploma credit requirements | Yes | No | MISSING |
| Learning Snapshot (active quests) | Yes | No | MISSING |
| Learning Constellation | Yes (quest + badge orbs) | No | MISSING |
| Learning Journal section | Yes (inline moments) | No | MISSING |
| Account Settings | Yes (personal info, privacy, deletion) | Yes (deletion with 30-day grace, cancel) | **FIXED** |
| Privacy / visibility toggle | Yes (make public/private) | No | MISSING |
| FERPA consent modal | Yes | No | MISSING |
| Observer list management | Yes (list + remove) | Yes (viewers list + remove observers) | **FIXED** |
| Invite observer modal | No | Yes (bottom sheet) | V2 addition |
| Family dashboard link (mobile) | No | Yes (parent/superadmin) | V2 addition |
| Sign out button | Yes (in settings) | Yes (bottom of page) | OK |
| Account deletion | Yes | Yes (30-day soft delete + cancel) | **FIXED** |

#### Items 23-25: Constellation, Credit Tracker, Transcript
**Status**: All MISSING from v2. No pages exist.

---

### 1.9 Communication

#### Item 26: Messaging (`/(app)/(tabs)/messages`)
**Status**: PLACEHOLDER in v2. Two-panel layout exists but non-functional.

#### Item 27: Notifications
**Status**: MISSING from v2. No page exists.

---

## Priority 2-7: Non-Core Pages

### Priority 2: Parent Experience
- **Family tab** exists with child selector, hero card, quick actions, activity feed
- **Parent quest view**: MISSING
- **Parent journal view**: MISSING
- **Dependent progress report**: MISSING
- **Create dependent**: TBD

### Priority 3: Observer Experience
- **Observer feed**: Shared via Feed tab (role-based)
- **Observer accept invitation**: Exists (`/(app)/observers/accept`)
- **Observer welcome**: MISSING
- **Observer student view**: MISSING
- **Student feedback management**: Invite-only in profile

### Priority 4: Advisor Experience
- **Advisor dashboard**: Exists (web only, two-panel)
- **Advisor check-in**: MISSING (may be tab in advisor panel)
- **Advisor verification**: MISSING
- **Quest invitations**: MISSING
- **Curriculum builder**: MISSING
- **Classes**: MISSING

### Priority 5: Admin & Superadmin
- **Admin panel**: PARTIAL (tabs exist for Users, Quests, Orgs, Emails, Bulk Gen, Docs)
- **Course builder/editor**: MISSING
- **Course generator wizard**: MISSING
- **Course generation queue**: MISSING
- **Course plan mode**: MISSING
- **Bulk generation**: MISSING
- **Credit review dashboard**: MISSING

### Priority 6: Public Pages
All 10 public pages MISSING (landing, catalog, course preview, diploma, docs, terms, privacy, how-it-works, org signup, parental consent)

### Priority 7: Sharing & Misc
All 5 sharing pages MISSING (evidence reports, shared feed post, public evidence report, quest invitation accept, my invitations)

---

## Critical Gap Summary

### CRITICAL (Blocks Launch)

| # | Issue | Page | Why Critical | Status |
|---|-------|------|-------------|--------|
| ~~1~~ | ~~No password strength validation~~ | ~~Registration~~ | ~~Security~~ | **FIXED** |
| ~~2~~ | ~~No Terms of Service acceptance~~ | ~~Registration~~ | ~~Legal~~ | **FIXED** |
| ~~3~~ | ~~No Privacy Policy acceptance~~ | ~~Registration~~ | ~~Legal~~ | **FIXED** |
| ~~4~~ | ~~No under-13 age check~~ | ~~Registration~~ | ~~COPPA~~ | **FIXED** |
| ~~5~~ | ~~No lesson viewing in courses~~ | ~~Course Detail~~ | ~~Core learning path broken~~ | **FIXED** (LessonViewer with step nav, completion tracking) |
| ~~6~~ | ~~No evidence preview on bounty review~~ | ~~Bounty Review~~ | ~~Poster can't see submissions~~ | **FIXED** |
| ~~7~~ | ~~Forgot Password non-functional~~ | ~~Login~~ | ~~Users locked out~~ | **FIXED** |

**7 of 7 critical issues resolved.**

### HIGH (Significant UX/Feature Gap)

| # | Issue | Page | Impact | Status |
|---|-------|------|--------|--------|
| ~~8~~ | ~~No role-based redirect after login~~ | ~~Login~~ | ~~Wrong landing page~~ | **FIXED** |
| ~~9~~ | ~~No confirm password field~~ | ~~Registration~~ | ~~Typo risk~~ | **FIXED** |
| ~~10~~ | ~~No quest completion celebration~~ | ~~Quest Detail~~ | ~~Missing reward feedback~~ | **FIXED** |
| ~~11~~ | ~~No delete enrollment / end quest~~ | ~~Quest Detail~~ | ~~Users stuck in quests~~ | **FIXED** |
| ~~12~~ | ~~No bounty edit page~~ | ~~Create Bounty~~ | ~~Posters can't fix mistakes~~ | **FIXED** |
| ~~13~~ | ~~No account settings / deletion~~ | ~~Profile~~ | ~~Users can't manage account~~ | **FIXED** |
| ~~14~~ | ~~No observer list management~~ | ~~Profile~~ | ~~Can't see/remove observers~~ | **FIXED** |
| ~~15~~ | ~~No evolve topic modal~~ | ~~Journal~~ | ~~Core feature broken~~ | **FIXED** |
| ~~16~~ | ~~No edit/delete moments~~ | ~~Journal~~ | ~~Users can't fix mistakes~~ | **FIXED** (EditMomentModal: title, desc, pillars, date, topic) |
| ~~17~~ | ~~Lessons in courses are read-only~~ | ~~Course Detail~~ | ~~Can't consume lessons~~ | **FIXED** (interactive lesson cards, step viewer, completion) |

**10 of 10 high issues resolved.**

### MEDIUM (Should Fix Before Launch)

| # | Issue | Page | Status |
|---|-------|------|--------|
| ~~18~~ | ~~No email format validation~~ | ~~Login + Registration~~ | **FIXED** |
| ~~19~~ | ~~No search debounce~~ | ~~Quest Discovery~~ | **FIXED** |
| 20 | No subtopic filtering | Quest Discovery | Open |
| 21 | No Create Quest from discovery | Quest Discovery | Open |
| 22 | No task reordering | Quest Detail | Open |
| 23 | No XP breakdown by pillar | Quest Detail | Open |
| ~~24~~ | ~~No enrolled courses on dashboard~~ | ~~Dashboard~~ | **FIXED** (course cards with progress on dashboard) |
| 25 | No upcoming tasks panel | Dashboard | Open |
| 26 | No auto-refresh (30s) | Dashboard | Open |
| ~~27~~ | ~~No topic edit/delete~~ | ~~Journal~~ | **FIXED** (was already fixed, stale entry) |
| ~~28~~ | ~~No AI suggestions (capture)~~ | ~~Journal / Capture~~ | **FIXED** (AI suggestions in EditMomentModal) |
| ~~29~~ | ~~No multiple evidence blocks~~ | ~~Capture Sheet~~ | **FIXED** (multi-file upload in CaptureSheet + CaptureModal) |
| ~~30~~ | ~~No title/date/topic on capture~~ | ~~Capture Sheet~~ | **FIXED** (via edit-after-capture in EditMomentModal) |
| ~~31~~ | ~~No progress bars on bounty claims tab~~ | ~~Bounty Board~~ | **FIXED** |
| 32 | No portfolio sharing / QR | Profile | Open |
| 33 | No bio editing | Profile | Open |
| 34 | No diploma credit tracking | Profile | Open |
| 35 | Messaging placeholder | Messages | Open |
| 36 | No notifications page | -- | Open |

**6 of 19 medium issues resolved.**

### OTHER FIXES (Found During Testing)

| # | Issue | Location | Status |
|---|-------|----------|--------|
| 37 | Delete user 500 (stale promo_codes reference) | `backend/routes/admin_core.py` | **FIXED** |
| 38 | Register error renders object instead of string | `authStore.ts` register catch | **FIXED** |
| 39 | Reset password API sends wrong field name | `api.ts` resetPassword | **FIXED** |
| 40 | FRONTEND_URL points to v1 (port 3000) | `backend/.env` | **FIXED** |
| 41 | Reset password page missing entirely | `app/(auth)/reset-password.tsx` | **FIXED** (created) |
| 42 | Google sign-up button missing on register | `app/(auth)/register.tsx` | **FIXED** |
| 43 | CaptureSheet/CaptureModal file upload broken (FormData to JSON endpoint) | `src/components/capture/` | **FIXED** (JSON create + shared /api/uploads/evidence) |
| 44 | Evidence blocks not saving file_url/file_name columns | `backend/services/learning_events_service.py` | **FIXED** |
| 45 | Evidence rendering only checked file_url, not content.url | `EditMomentModal`, `LearningEventCard` | **FIXED** (resolves from file_url, content.url, content.items[0].url) |
| 46 | Date display off by 1 day (UTC midnight timezone bug) | `LearningEventCard` | **FIXED** (append T12:00 to date-only strings) |
| 47 | "Unexpected text node" error (empty string in View) | `journal.tsx` | **FIXED** (activeSubtitle && → ternary with null) |
| 48 | MAX_FILE_SIZE 10MB too low | `backend/config/constants.py` | **FIXED** (raised to 100MB) |

---

## Test Coverage (Added 2026-03-27)

| Test File | Tests | Covers |
|-----------|-------|--------|
| `app/(auth)/__tests__/login.test.tsx` | 17 | Validation, role redirect, forgot password modal |
| `app/(auth)/__tests__/register.test.tsx` | 12 | Field validation, password strength, terms, COPPA, errors |
| `app/(auth)/__tests__/reset-password.test.tsx` | 9 | Token handling, validation, API integration, success/error |
| `src/stores/__tests__/authStore.test.ts` | 18 | Login, register, logout, loadUser, forgotPassword, error extraction |
| `app/(app)/(tabs)/__tests__/dashboard.test.tsx` | 15 | Welcome header, stats, quests, courses, navigation, empty states |
| `src/components/feed/__tests__/FeedCard.test.tsx` | 12 | Rendering, share/clipboard, visibility toggle, confidential, like, XP |
| `app/(app)/(tabs)/__tests__/bounties.test.tsx` | 5 | Cards, tabs, XP/custom rewards, claim progress bars |
| `app/(app)/bounties/__tests__/create.test.tsx` | 6 | Form validation, pillar selector, edit mode |
| `app/(app)/bounties/__tests__/detail.test.tsx` | 6 | Rendering, evidence inline, revision banner, claim button |
| `app/(app)/bounties/review/__tests__/review.test.tsx` | 5 | Evidence preview, student names, deliverable labels, actions, empty state |
| `src/components/journal/__tests__/EditMomentModal.test.tsx` | 7 | Pre-fill, pillar selection, save, AI suggestions, topic picker, no-op save, null event |
| `src/components/journal/__tests__/LearningEventCard.test.tsx` | 7 | Rendering, topic tags, evidence indicators, description dedup, action menu |
| `src/components/capture/__tests__/CaptureSheet.test.tsx` | 6 | Rendering, camera, multi-select, shared-upload save flow, description-only save, close |
| `src/components/capture/__tests__/CaptureSheet.parentCapture.test.tsx` | 3 | Single kid JSON, multi-kid JSON, realtime source type |
| `src/hooks/__tests__/useQuestDetail.test.ts` | 7 | Session, generate, accept, complete, delete, enroll |
| `app/(app)/quests/__tests__/detail.test.tsx` | 5 | Renders quest, task list, add task (shared TaskCreationWizard) |
| `src/hooks/__tests__/useProfile.test.ts` | 2 | Parallel fetch, edit profile (Achievement now includes course) |
| **Total new/updated** | **142** | |

All tests are unit tests with mocked data (no live backend). E2E tests via Maestro planned separately.

---

## Score Summary

| Category | Total Features | OK / Fixed | Partial | Missing | % Complete |
|----------|---------------|-----------|---------|---------|------------|
| Auth (Login + Register + Reset) | 30 | 22 | 1 | 7 | **73%** |
| Dashboard | 14 | 8 | 1 | 5 | 57% |
| Feed (new) | 14 | 10 | 0 | 4 | 71% |
| Quest Discovery | 11 | 5 | 1 | 5 | 45% |
| Quest Detail | 22 | 9 | 1 | 12 | 41% |
| Course Catalog | 12 | 8 | 0 | 4 | 67% |
| Course Detail | 29 | 22 | 0 | 7 | **76%** |
| Journal | 24 | 12 | 1 | 11 | 50% |
| Capture | 13 | 11 | 0 | 2 | 85% |
| Bounties (all) | 47 | 37 | 2 | 8 | **79%** |
| Buddy | 9 | 9 | 0 | 0 | 100% |
| Profile | 22 | 10 | 2 | 10 | 45% |
| **TOTAL** | **251** | **166 (66%)** | **9 (4%)** | **76 (30%)** | **66%** |

**V2 is at approximately 66% feature parity with v1 for Priority 1 pages (up from 65% after journal/capture overhaul). All 7 critical and all 10 high issues resolved.**
