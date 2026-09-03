# Mobile App Launch — Implementation Plan

**Status**: Planning complete, gap analysis next
**Last Updated**: 2026-05-08
**Owner**: Tanner

---

## Strategic Direction

Build the Optio mobile app on the existing `frontend-v2/` universal Expo project. Architecture stays (Expo Router, NativeWind, auth headers, file-based routing). The visual layer gets a theme pass to port V1's visual identity (gradients, pillar colors, soft-shadowed cards, warmer typography, more generous spacing) into the V2 component library.

The mobile app is a **partner** with the web app, not a full replica. The dividing line is *creation depth*:

- **Mobile owns**: capture, browse, claim, view, complete, reflect, comment, message
- **Web owns**: deep authoring (multi-step quest builder, custom task creation), advisor and admin tooling, billing, org settings

Three roles ship at launch: **student**, **parent**, **observer**. Each has a distinct shell with role-aware tabs.

---

## Account Creation and Linking

Four paths exist:

| Path | Who creates | Linking |
|------|-------------|---------|
| 13+ self-register | Student | School admin links to parent |
| 13+ school-created | School admin | School links to parent |
| Under-13 parent-created | Parent during their own registration | Implicit |
| Under-13 school-created | School admin | School links to parent |

Linking is admin or parent initiated. Students never approve incoming link requests; links arrive pre-existing on their account. COPPA is satisfied because parents always either create the account or have authorized the school to do so.

Observers self-register, then accept an invitation by code. They can be invited by the student (13+), the student's parent (under-13 dependents), or an org admin.

---

## Locked Decisions by Role

### Student

**Tabs**: Bounties, Journal, Capture (center, drawer), Feed, Messages (final placement TBD — tab vs header icon, settled in design pass). Profile lives in the header avatar.

**Capture flow**:
- Drawer with action choices: camera, photo, video, voice, text, file
- Post-capture form: title, description, pillar (manual selection, no AI), bounty link, privacy toggle — all optional
- Save flow tolerates network drops; drafts persist locally

**Quests**: browse the library, claim, view active quests with task list, complete tasks via capture (which links the moment to the quest), see XP and progress. **Out of scope on mobile**: creating new quests, editing quest structure, quick-start from template.

**Feed**: org-scoped. Org users see peers from their school org. Platform-only users (no organization) see a sparse private-family-only feed visible to their linked parents and observers; no peer feed exists for them.

**Under-13 privacy**: moments default to visible-to-linked-family-and-advisors-only. Do not appear on the org peer feed unless a parent explicitly toggles a moment public. DMs allowed only from linked accounts.

**Notifications**: comments on the student's moments, and incoming messages. No view notifications. No bounty deadline notifications (let students pull, not get nagged).

**Onboarding**: school-created accounts log in and land in an empty journal with a "capture your first moment" CTA. Self-register path adds an age gate up front; downstream converges.

---

### Parent

**Tabs**: Family (default landing), Feed, Messages, Profile in header.

**Multi-child UX**: avatar-plus-name-plus-chevron in the page header. Tap opens a bottom sheet listing all linked children and dependents, each row with avatar, name, age badge for under-13, and an attention indicator dot for pending FERPA approvals or new comments. "Add a child" CTA at the bottom of the sheet. Single-child families render a static label without the chevron.

**Family tab features**:
- Child selector (header pattern above)
- Hero card: child's avatar, name, total XP, active quest count, completed quest count, learning rhythm badge
- Quick actions row: Capture (for selected child), Capture All (multiple children), View As, Add Observer, Photo, Give Login (when under-13 dependent)
- FERPA approvals banner when pending, with count and tap-through to a dedicated approvals screen
- Engagement calendar with rhythm
- Active quests list
- Completed quests list
- Recent activity preview (5 most recent moments) with "View all" → Feed tab

**Capture-on-behalf**: stays. Attribution behavior matches V1 (the moment lives on the child's profile, V1 marks parent attribution per existing behavior — not changed for v1).

**View-As (impersonation)**: stays. Swaps the parent's session token to act as the child's account; parent banner in the UI indicates active impersonation.

**FERPA visibility approvals**: in for mobile. Banner on Family tab when pending, dedicated approvals screen for review and consent, push notification when a new approval arrives. These are time-sensitive consents tied to portfolio publishing and need fast turnaround.

**Family quest creation**: web-only. The AI idea generator and multi-step authoring flow are not mobile-friendly enough for v1.

**AI settings toggle**: removed from mobile. (May still exist on web for now.)

**Messaging**: with linked advisors, observers, and org admins.

**Notifications**:
- Child captured a new moment
- FERPA approval pending
- Advisor sent a message
- Observer left a comment on the child's moment

**Onboarding (no children linked yet)**: keep V1's two-path empty state on mobile:
- Create dependent profile (under-13)
- Connect to existing student (13+) — currently routed through support email; this path stays on mobile

---

### Observer

**Tabs**: Activity (default, segmented Feed + Students), Bounties (Posted + Create), Profile in header. **No Messages tab.** Comments on student moments stay (those are part of activity, not messaging).

**Activity tab**:
- `Feed` view: combined activity across all linked students, with a filter chip to scope to one student
- `Students` view: list of linked students with avatars, last-active indicator, and unread/attention count, tap-through to per-student overview screen

**Bounties tab**:
- `Posted`: bounties this observer has created, with status (open, claimed, submitted-for-review, completed). Tap a posted bounty to see who claimed it and review submissions.
- `Create`: new bounty form, same flow as advisor/parent. Disclaimer when observer awards XP: "Observer-awarded XP requires Optio approval before counting toward official totals." XP writes to `user_subject_xp.pending_xp` until reviewed by an Optio admin.

**Bounty audience targeting**: at creation time, observer picks one or many linked students.

**Bounty approval**: observer alone approves submissions for bounties they posted.

**Bounty visibility on student board**: observer-posted bounties appear mixed in with advisor- and parent-posted bounties. Each card displays the poster name and role.

**Welcome screen**: keep V1's `ObserverWelcomePage` content for first-time observers — philosophy, engagement model, what they'll see. Show once, mark seen, never show again.

**Comments on student moments**: stay. Comment modal accessible from feed cards.

**Notifications**:
- New activity from a linked student
- Reply to a comment the observer left
- Submission on one of their bounties is ready to review
- Invitation accepted

---

## Cross-Cutting Decisions

- **Architecture**: V2 (frontend-v2/) stays. Universal Expo, file-based routing, NativeWind, auth headers.
- **Styling**: theme pass, not rewrite. Port V1's visual identity into V2 component library (`src/components/ui/`).
- **Mobile = partner with web**. Creation depth lives on web.
- **Auth**: headers, no cookies. Already in V2.
- **Profile** is a header avatar across all roles, not a tab, freeing tab slots for content.
- **Notifications**: per-role push triggers as defined above.
- **Linking** is admin/parent-initiated. Students don't approve link requests.
- **All three roles ship day one.** No phased role rollout.

---

## Build Phases

### Phase 1 — Gap Analysis (next)

Map every screen in the spec against the current state of `frontend-v2/`. Categorize each as:

- **Match**: spec already implemented, only needs theme pass
- **Needs changes**: implemented but diverges from spec (e.g., V2 family.tsx still has the AI settings toggle that needs to be removed)
- **Missing**: not built yet (e.g., FERPA approvals UI, observer welcome screen, observer bounty creation if not covered by existing bounties/create.tsx)

Output: a concrete punch list with file paths and effort estimates.

### Phase 2 — Theme Pass Scope

Identify which V1 components become the visual reference (gradient header style, pillar badge, card shadow language, empty-state illustrations, typography). Audit `frontend-v2/src/components/ui/` against that reference. Decide for each primitive: rebuild, restyle, or keep.

Output: a short component punch list and a tightened style guide (color usage, shadow tokens, typography scale).

### Phase 3 — Foundation Work

- Auth headers (already in V2 — verify completeness)
- Push notification infrastructure (Expo Push, token registration, server-side delivery)
- Deep linking for invitation acceptance (the V2 `observers/accept.tsx` flow already supports this)
- App store assets and metadata (icons, splash, screenshots, descriptions)

### Phase 4 — Role-by-Role Build

Sequence to be confirmed after gap analysis. Likely order:

1. **Student** (largest surface, foundational components)
2. **Parent** (mostly built — gap fixes, theme pass, FERPA approvals UI)
3. **Observer** (lightest — bounty creation surface and welcome screen are the new pieces)

### Phase 5 — QA + Launch Prep

- TestFlight (iOS) and Play Internal (Android) builds
- Cross-role flow testing (student creates → parent sees in feed → observer comments)
- Performance pass on lower-end devices
- App store submission

---

## Open Items / Deferred

These are intentionally not blocking:

- **Student Messages placement**: tab vs header icon — settled in the design pass when we sketch the actual screen.
- **App store metadata copy**: deferred to launch prep.
- **Onboarding visual polish**: scoped during theme pass.
- **Notification delivery verification**: tested during foundation phase.
- **Multi-child sheet attention indicator semantics**: what counts as "needs attention" — pending FERPA, unread comments, anything else? Settled during build.

---

## Reference: V2 Current State

What `frontend-v2/` already has that maps to this spec:

**Built**:
- Dashboard and Journal screens (student)
- `family.tsx` (parent — most of the spec already implemented; needs AI toggle removed and FERPA approvals added)
- `observers/accept.tsx` (observer invitation acceptance with deep link and QR support)
- `bounties/create.tsx` and `bounties/review/[id].tsx` (bounty authoring and review — supports the observer bounty flow)
- `capture.tsx` tab placeholder
- Auth flow with headers (login, register, reset, verify)

**Backend** (substantial existing infrastructure):
- 11 parent route modules under `backend/routes/parent/`
- 12 observer route modules under `backend/routes/observer/`
- 4 parent linking modules under `backend/routes/parent_linking/`
- `backend/routes/dependents.py` for under-13 management
- `user_subject_xp.pending_xp` column already exists for observer-awarded XP

**Missing or partial**:
- FERPA approvals UI in V2 family.tsx
- Observer welcome screen in V2 (already built in feed.tsx — see below)
- Student capture drawer (per spec)
- Various tab structures and headers per the locked spec

---

## Phase 1 Output: Gap Analysis

Each item is categorized:
- **Match** — already implemented, theme pass only
- **Change** — implemented but diverges from spec
- **Missing** — not built yet

### Cross-Cutting

#### Navigation & Tabs

- **Match**: `frontend-v2/src/components/layouts/MobileHeader.tsx` — header has Profile-via-avatar menu, notification bell with unread count, parent-aware menu item for Family Dashboard.
- **Match**: Observer tab override in `frontend-v2/app/(app)/(tabs)/_layout.tsx:59-110` (observerTabs = ['feed', 'bounties']).
- **Change**: `frontend-v2/src/config/navigation.ts` — `buddy` still in `navItems` (line 26); remove. `quests` is `platforms: ['web']` only (line 24); spec requires student mobile access — change to `['web', 'mobile']`. Stale comment at line 37 references "Feed, Journal, [+ Capture], Buddy, Bounties" (Buddy is gone).
- **Missing**: Parent tab override in `_layout.tsx`. Currently parents fall through to default student tabs. Add a parallel block returning `parentTabs = ['family', 'feed', 'messages']` with `initialRouteName: 'family'`, other routes hidden.

#### Push & Deep Links

- **Match**: `frontend-v2/src/services/pushNotifications.ts` exists, integrated in `app/(app)/_layout.tsx` and `onboarding.tsx`.
- **Match**: Deep link for observer accept supported in `observers/accept.tsx` (handles `?code=` param with auto-accept).
- **Verify**: Backend trigger logic for per-role notifications (comment-on-moment, FERPA-approval-pending, child-captured, advisor-message, observer-comment-on-child, submission-ready-to-review). Some triggers may need backend wiring.

### Student Surfaces

#### Capture (`frontend-v2/src/components/capture/CaptureSheet.tsx`)

- **Match**: Camera + gallery flows, signed-upload to Supabase, parent-on-behalf via `studentIds` prop, video size limits up to 500MB.
- **Change**: Restructure as two-step flow per spec drawer model. Step 1 = action chooser (camera, photo, video, voice, text, file). Step 2 = optional metadata form (title, description, pillar, bounty link, privacy toggle). Current is single-screen description-first.
- **Missing fields**: Title input, manual pillar selector, privacy toggle, bounty/quest link picker integrated as a primary post-capture field. (TaskPickerSheet exists in `src/components/journal/TaskPickerSheet.tsx` and can be the bounty-link surface.)

#### Quests (`frontend-v2/app/(app)/(tabs)/quests.tsx`)

- **Change**: Lines 80-87 render "Desktop Only" on `Platform.OS !== 'web'`. Per spec, students browse, claim, view active quests on mobile. Add mobile rendering path for student-facing quest discovery + active quest detail. Authoring stays web-only.
- **Match**: Web creation flow.
- **Match**: `frontend-v2/app/(app)/quests/[id].tsx` quest detail page exists (verify mobile rendering of task list and capture-link integration).

#### Journal (`frontend-v2/app/(app)/(tabs)/journal.tsx`)

- **Match**: Topics sidebar, learning event cards, capture sheet/modal, edit moments, quest tasks section, generate tasks modal.
- **Match (theme pass only)**: Visual styling pass.

#### Feed (`frontend-v2/app/(app)/(tabs)/feed.tsx`)

- **Match**: Unified feed cross-role, observer welcome modal already built (lines 32-90, one-time display via localStorage key `optio_observer_welcome_seen`).
- **Verify**: Backend feed scoping. Org users get peer feed; platform-only users get family-only feed (linked parents/observers); under-13 students' moments default to family-only visibility.

#### Bounties (`frontend-v2/app/(app)/(tabs)/bounties.tsx`)

- **Match**: Three internal tabs (browse, claims, posted). Supports student claim flow and adult posted-bounty management.
- **Verify**: Posted tab correctly surfaces observer-created bounties when role is observer.

#### Messages (`frontend-v2/app/(app)/(tabs)/messages.tsx`)

- **Match**: Mobile full-screen list/chat, desktop split panel, DM + group chat.
- **Match**: Observer override excludes Messages from observer tabs (correct per spec).
- **Verify**: Group chat creation currently gated to advisor/org_admin/superadmin (line 57). Confirm parents need group creation; if not, leave as-is.

#### Profile (`frontend-v2/app/(app)/(tabs)/profile.tsx`)

- **Match**: XP breakdown, achievements, engagement, viewers list, own-portfolio FERPA consent, observer invite, deletion request.
- **Match**: Reached via header avatar menu (per spec).

### Parent Surfaces

#### Family Dashboard (`frontend-v2/app/(app)/(tabs)/family.tsx`)

- **Match**: Hero card, quick actions row, engagement calendar, active/completed quests, recent activity preview, capture-on-behalf, View-As, Add Observer modals.
- **Change**: Multi-child UX. Replace `ChildSelector` (lines 33-74) — currently horizontal scroll chips — with avatar-plus-name-plus-chevron header that opens a bottom sheet listing all children, attention indicators, and an "Add a child" CTA.
- **Change**: Remove AI settings toggle (lines 423-426 in family.tsx, plus the `handleToggleAI` function).
- **Change**: Polish Promote/"Give Login" flow (lines 294-335) — currently uses `Alert.prompt` (iOS-only) with an Android fallback that hardcodes a placeholder email. Replace with a proper modal form.
- **Missing**: FERPA visibility approvals UI.
  - Banner on Family tab when there are pending approvals, with a count and tap-through.
  - Dedicated approvals screen showing each pending request (student, what's being shared, with whom, deadline) and approve/deny buttons.
  - Push notification when a new approval arrives.
  - Backend exists in `backend/routes/observer/sharing.py` and `backend/routes/parent/learning_moments.py` — needs UI surfacing.

#### Parent Tab Layout

- **Missing**: Parent override in `_layout.tsx`. Add parallel block to observer override: detect parent role (or `has_dependents` / `has_linked_students`), set tabs to `['family', 'feed', 'messages']`, `initialRouteName: 'family'`, hide all other routes.

### Observer Surfaces

#### Activity (segmented Feed + Students)

- **Match**: Feed view (`feed.tsx`) with combined activity and observer welcome modal.
- **Missing**: "Students" segmented view. Spec says Activity tab has Feed | Students segmented control. Recommend: add segmented control inside `feed.tsx` for observer mode rather than a new route. Students view shows linked-student list with avatars, last-active indicator, attention count, tap-through to per-student overview.
- **Missing**: Per-student overview screen on mobile (V1 has `ObserverStudentOverviewPage`, no V2 equivalent).

#### Observer Bounties (Posted + Create)

- **Match**: `bounties/create.tsx` already supports observers — fetches `/api/observers/my-students` (line 94) for the kid selector, alongside `/api/dependents/my-dependents` for parent users.
- **Match**: `bounties.tsx` Posted tab exists.
- **Match**: `bounties/review/[id].tsx` review screen exists.
- **Missing**: XP-pending-approval disclaimer in `bounties/create.tsx`. When current user is observer and rewards include XP, show "Observer-awarded XP requires Optio approval before counting toward official totals." Backend needs to write observer-awarded XP to `user_subject_xp.pending_xp` instead of `xp_amount`.
- **Verify**: Bounty card on student board displays poster name and role label (per spec: mixed feed but each card shows source).
- **Verify**: Observer access path through `bounties/review/[id].tsx` for approving submissions on observer-posted bounties.

#### Observer Tab Override

- **Change**: `_layout.tsx:60` defines `observerTabs = ['feed', 'bounties']`. Spec calls for `Activity` (which the feed tab will become with segmented control) and `Bounties` — same two tabs, plus the segmented-control change inside feed.tsx. No new tab needed.

### Theme Pass Scope

V1 visual primitives to port into V2 components in `frontend-v2/src/components/ui/`:

- **Gradient primary**: `from-optio-purple to-optio-pink` on primary buttons and section headers. V1 uses extensively (e.g., `ParentDashboardPage.jsx` line 348). V2 application is inconsistent.
- **Card shadow language**: V1 uses softer `shadow-lg` with `rounded-2xl`. V2 `Card variant="elevated"` is flatter. Add a card shadow token and adopt as default.
- **Pillar badges**: Verify pillar color tokens in `tailwind.config.js` match V1 vibrance. PillarBadge component exists; audit usage and contrast.
- **Empty states**: V1 has more personality (gradients, illustrations). V2 uses Ionicons + gray text. Inventory empty states across all screens (family.tsx, journal.tsx, feed.tsx, bounties.tsx) and design a consistent empty-state component.
- **Typography**: Confirm Poppins is loaded everywhere; standardize on `font-poppins-bold` for headings, `font-poppins-medium` for emphasis, `font-poppins-regular` for body. V1 is consistent; V2 has some drift.
- **Bottom sheets**: BottomSheet component used heavily (capture, child selector). Confirm rounded top corners (24px), grab bar (40x4 surface-300), backdrop opacity 0.4.

Components to audit and likely rebuild:

- `Button` — gradient on primary, soft shadow on press
- `Card` — shadow + radius
- `Input` — rounded variants matching V1's pill style
- `Badge` / `PillarBadge` — color tokens + readability
- `Avatar` — already aligned
- `BottomSheet` — confirm grab bar and corner radius

### Effort Estimate (rough)

- **Cross-cutting** (parent override, navigation cleanup, push wiring verification): ~1-2 days
- **Capture rework** (drawer + metadata form): ~2-3 days
- **Quests on mobile** (browse + claim + active quest detail): ~3-4 days
- **Family multi-child UX + FERPA approvals**: ~3-4 days
- **Observer Students segmented view + per-student overview**: ~2-3 days
- **Observer XP-pending disclaimer + backend wiring**: ~1 day
- **Theme pass** (component rebuild + screen-level audit): ~5-7 days
- **Polish, testing, app store assets**: ~5-7 days

**Total**: roughly 22-31 days of focused work, parallelizable across roles. Theme pass can run alongside feature work.
