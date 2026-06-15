# Gryffin Learning Center — Build Plan

**Status:** In progress | **Created:** 2026-06-15 | **Partner:** Gryffin Learning Center (microschool, v1 web)
**Contact:** Christina Hullinger

**Build progress:**
- ✅ **Phase 0 — feature-flag foundation** (`organizations.feature_flags` jsonb + `backend/utils/org_features.py` + `useOrgFeature` hook). Migrations applied 2026-06-15.
- ✅ **Scheduled publishing of class quests** (`class_quests.publish_at` + read-time gating in `get_class_quests` + gated control in `ClassQuestsTab`). See §8. Verified working. (An earlier course-system version was reverted — Gryffin uses classes, not courses.)
- ✅ **Class management surfaced in `/organization`** via a new **Classes** tab (`OrgClassesTab`).
- ✅ **Gryffin sidebar hub** (`/gryffin`, `GryffinPage.jsx`, slug-gated tab): students see the classes they're enrolled in and each class's published quests; advisors get class management. `StudentClassesView` gained a `basePath` prop so its nav stays inside `/gryffin`.
- ✅ **Due dates** (flag `due_dates`): `class_quests.due_date` + teacher calendar control in `ClassQuestsTab` + "Due" badges (teacher + student) + a student **Upcoming** agenda (`StudentAgenda`) on the Gryffin hub fed by `GET /api/student/agenda`.
- ✅ **Two-way Credit Review feedback** (general): `credit_review_messages` table + `GET/POST /api/credit/<completion_id>/messages` + `CreditFeedbackThread` mounted on the reviewer dashboard (`ItemDetail`) and student view (`CreditIterationHistory`). Reviewer messages show to students as "Optio". Also fixed the grow-this notification copy from "Org Admin Feedback" → "Optio Feedback".
- ✅ **Announcements** (org-admin tool, all orgs): `routes/announcements.py` fans a broadcast out as Optio notifications to students/advisors/parents (role-correct for org_managed + parents) + **Announcements** tab in `/organization`.
- ✅ **Roster group chat**: `group_conversations.source_class_id` + `POST .../classes/<id>/messaging-group` (idempotent create/sync from roster) + "Group chat" button in `ClassStudentsTab` + `/communication?group=<id>` deep-link.
- Younger-kids-no-accreditation already works today (no build). Every gated feature uses the per-org `feature_flags`; Gryffin (`scheduled_publish`, `due_dates`) enabled on its org row.

---

## 1. Goal & guiding principle

Gryffin is a microschool joining the platform next school year. They will use the v1
web app (`frontend/`). They have asked for five capabilities that don't fully exist
today. We want to **build these for Gryffin now, but architect them so any future
microschool can turn them on without new code** — and without making them global/default
features yet.

**The one rule that makes this work:**

> Build every feature **generically** (org-scoped data, harmless when unused) and gate
> every surface behind a **per-org feature flag**. Do NOT hardcode `slug === 'gryffin'`
> into feature logic. Hardcoding by slug is acceptable only for the branded landing
> page/tab (the way Treehouse and OEA already do it).

This gives us: Gryffin gets the features now (flip flags on their org row); the next
microschool gets them by flipping the same flags (zero code); and you can later promote
any feature to a global default as a deliberate, separate decision.

### The five requests → features

| # | Christina's ask | Feature | Net-new vs. exists |
|---|---|---|---|
| A | "assign dates… see a calendar of due dates" | **Due dates + agenda/calendar** | Mostly net-new |
| B | "only one project shows at a time… 'publish' when ready / auto-publish on dates" | **Scheduled / manual publish** | Builds on existing `is_published` |
| C | "can a teacher give feedback and ask questions within the course?" | **Threaded teacher↔student feedback** | Extends one-directional review |
| D | "communication to specific groups… elementary, high school, history" | **Roster-based group messaging + announcements** | Group chat exists; announcements dormant |
| E | (parity) custom partner page like Treehouse/OEA | **Gryffin branded hub** | Pattern exists |

Item B note: `course_quests.is_published` and `curriculum_lessons.is_published` already
exist, and `courses.navigation_mode = 'sequential'` already enforces one-at-a-time.
The only net-new part is **scheduled** auto-publish on a date.

---

## 2. Architecture: the feature-flag layer (Phase 0 — do this first)

Today there is **no generic per-org feature flag**. Programs are gated by hardcoded slug
checks (`frontend/src/components/navigation/Sidebar.jsx:240`, `backend/routes/treehouse.py:33`),
and the only per-org toggles are four AI booleans on `organizations`. We add a generic
jsonb flag store that every later phase depends on.

### 2.1 Migration

`supabase/migrations/20260615_add_org_feature_flags.sql`

```sql
ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS feature_flags jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN organizations.feature_flags IS
  'Per-org capability gates, e.g. {"due_dates": true, "feedback_threads": true}. Absent/false = off.';
```

Flag keys used by this plan: `due_dates`, `scheduled_publish`, `feedback_threads`,
`announcements`, `roster_groups`.

### 2.2 Backend helper

`backend/utils/org_features.py` — mirror the existing `backend/utils/ai_access.py` pattern.

```python
def org_feature_enabled(org_id: str, feature: str) -> bool:
    """True if the org has `feature` toggled on. Superadmin context bypasses (see callers)."""
    # admin client read of organizations.feature_flags -> bool(flags.get(feature))

def require_org_feature(feature: str):
    """Route decorator: 403 unless the requesting user's org has `feature` on,
       OR the user is superadmin (Critical Rule #7)."""
```

- Always allow `superadmin` through, per Critical Rule #7.
- Resolve org via `get_effective_role` / the user's `organization_id`.

### 2.3 Frontend exposure

- Surface `organization.feature_flags` on the existing auth/org context (wherever
  `organization.slug` is already read in `Sidebar.jsx`).
- Add a tiny hook `useOrgFeature('due_dates')` returning a boolean.
- Components render flagged UI only when on; otherwise unchanged for every other org.

### 2.4 Admin toggle (optional, low priority)

Add a flags editor to the existing org admin screen (`/organization` / admin org detail)
so you can flip flags from the UI instead of SQL. Until then, set them directly:

```sql
UPDATE organizations SET feature_flags = feature_flags ||
  '{"due_dates":true,"scheduled_publish":true,"feedback_threads":true,
    "announcements":true,"roster_groups":true}'::jsonb
WHERE slug = 'gryffin';
```

**Effort:** ~0.5 day (column + helper + context wiring). Everything below depends on this.

---

## 3. Phase 1 — Gryffin org + branded hub (Treehouse pattern)

Pure mechanical reuse of the Treehouse model. This is the branded landing/tab; it is the
one place slug-gating is fine.

### 3.1 Data
- Insert an `organizations` row: `slug = 'gryffin'`, `name = 'Gryffin Learning Center'`,
  `is_active = true`, `branding_config` (logo), and `feature_flags` set per §2.4.
- Create Christina's account as **org_admin** plus an **advisor** account for her teacher
  role (she needs advisor to give feedback — see Phase 3). Org users: `role='org_managed'`,
  `org_role` set appropriately.

### 3.2 Frontend
- Pages: `frontend/src/pages/gryffin/GryffinPage.jsx` (role-branching hub: student vs.
  facilitator/teacher), plus child views as needed (e.g. `GryffinAgendaPage.jsx` for the
  calendar in Phase 2, `GryffinAnnouncementsPage.jsx` for Phase 4).
- Routing: add lazy imports + routes in `frontend/src/App.jsx` (mirror the Treehouse
  block at `App.jsx:63-68` and routes near `:510`). Path base `/gryffin`.
- Sidebar tab: add a `gryffin` entry to `ORG_PROGRAM_TABS` in
  `frontend/src/components/navigation/Sidebar.jsx:16`. The existing visibility logic at
  `Sidebar.jsx:240-247` already keys on `organization.slug`, so adding the key is enough.

### 3.3 Backend
- `backend/routes/gryffin.py` — blueprint `bp`, slug constant `GRYFFIN_SLUG = 'gryffin'`,
  a `_context(user_id)` resolver (student vs. facilitator vs. superadmin), all reads/writes
  via `get_supabase_admin_client()`. Mirror `backend/routes/treehouse.py`.
- Register in `backend/routes/__init__.py` right after the Treehouse block (~line 289):
  ```python
  from routes import gryffin
  app.register_blueprint(gryffin.bp)
  ```

### 3.4 Tests
- `backend/tests/test_gryffin_routes.py` — slug gating, role branching, superadmin access.

**Effort:** ~1 day.

---

## 4. Phase 2 — Due dates + agenda/calendar (flag: `due_dates`)

The largest feature. Data is generic (nullable columns, inert when null); only Gryffin
sees the UI.

### 4.1 Migration

`supabase/migrations/20260615_add_assignment_due_dates.sql`

```sql
ALTER TABLE course_quests       ADD COLUMN IF NOT EXISTS due_date timestamptz;
ALTER TABLE curriculum_lessons  ADD COLUMN IF NOT EXISTS due_date timestamptz;
-- user_quest_tasks.due_date already exists (added for Treehouse); reuse it for per-task dates.
```

- All nullable, no default → zero behavior change for any existing org.

### 4.2 Backend
- Course Builder write paths: accept/persist `due_date` on
  `backend/repositories/course_quest_repository.py` and
  `backend/repositories/curriculum_lesson_repository.py` (and the task repo for
  `user_quest_tasks.due_date`).
- New read endpoint for the student agenda, e.g. `GET /api/gryffin/agenda` in
  `gryffin.py` (or a generic `GET /api/me/agenda` guarded by `require_org_feature('due_dates')`):
  returns the student's enrolled course_quests/lessons/tasks that have a `due_date`,
  sorted, with status (upcoming / due-soon / overdue / done).
- Guard all due-date write/read surfaces with `require_org_feature('due_dates')`.

### 4.3 Frontend
- **Set dates (teacher):** add an inline date picker to the Course Builder project/lesson
  editor — rendered only when `useOrgFeature('due_dates')`. Use `optio-purple`/`optio-pink`.
- **Show dates (student):** due-date badge on existing task/project cards (inline,
  flag-gated).
- **Calendar/agenda view:** a list-first agenda (grouped by week) and optional month grid,
  living as a tab inside the Gryffin hub (`GryffinAgendaPage.jsx`). Build fresh — the old
  FullCalendar dependency was removed in the March 2026 audit; do **not** re-add it. A
  lightweight custom agenda (no heavy calendar lib) is preferred.

### 4.4 Tests
- Backend: agenda endpoint sorting/status, flag gating (off → 403, superadmin bypass).
- Frontend (`frontend/`): badge renders only when flag on; agenda groups/sorts correctly.

**Effort:** ~3-4 days (agenda UI is the bulk).

---

## 5. Phase 3 — Threaded teacher↔student feedback (flag: `feedback_threads`)

Today feedback is one-directional: Credit Review `reviewer_feedback` / "Grow This"
(`diploma_review_rounds`) and `observer_comments` (no student reply). Christina wants a
teacher to **ask a question and the student to answer in context**. Add a real thread.

### 5.1 Migration

`supabase/migrations/20260615_create_assignment_threads.sql`

```sql
CREATE TABLE IF NOT EXISTS assignment_comments (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  completion_id   uuid NOT NULL REFERENCES quest_task_completions(id) ON DELETE CASCADE,
  organization_id uuid REFERENCES organizations(id),
  author_id       uuid NOT NULL REFERENCES users(id),
  author_role     text NOT NULL,          -- 'advisor' | 'student' | 'org_admin' | 'superadmin'
  parent_id       uuid REFERENCES assignment_comments(id) ON DELETE CASCADE,  -- reply threading
  body            text NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  edited_at       timestamptz,
  deleted_at      timestamptz
);
CREATE INDEX ON assignment_comments(completion_id);
ALTER TABLE assignment_comments ENABLE ROW LEVEL SECURITY;  -- backend uses admin client; RLS = defense in depth
```

- Note: `observer_comments` itself has **no CREATE-TABLE migration** in the repo (it's
  referenced only in RLS-fix migrations). Rather than retrofit replies onto that
  unmigrated table, a clean new `assignment_comments` table is lower-risk. Keep
  `observer_comments` as-is for the observer encouragement use case.

### 5.2 Backend
- `backend/routes/assignment_comments.py` (or fold into `gryffin.py`):
  - `GET  /api/assignments/<completion_id>/comments` — thread, author-enriched.
  - `POST /api/assignments/<completion_id>/comments` — body + optional `parent_id`.
  - `PATCH/DELETE` for author edits/soft-delete.
- Authorization: the assigned advisor (`advisor_student_assignments` / `class_advisors`),
  the student who owns the completion, org_admin of the org, and superadmin. Rate-limit
  posts (reuse the observer-comments 20/hr pattern).
- Notifications: reuse `NotificationService` — notify the student when a teacher posts,
  notify the teacher when the student replies (mirror `notify_student_comment` /
  `notify_parent_observer_comment`).
- Guard with `require_org_feature('feedback_threads')`.

### 5.3 Frontend
- A `<AssignmentThread completionId=… />` component rendered **inline** on the assignment/
  evidence detail and the Credit Review item detail
  (`frontend/src/components/credit-dashboard/ItemDetail.jsx`), shown only when the flag is on.
- Student sees and replies from their task/evidence view; teacher from the review view.

### 5.4 Tests
- Backend: post/reply auth matrix, threading, flag gating, notifications fire.
- Frontend: thread renders, reply posts, hidden when flag off.

**Effort:** ~2-3 days.

---

## 6. Phase 4 — Announcements / broadcast (org-admin dashboard feature)

**Scope decision (2026-06-15):** announcements are **not** a Gryffin-only flagged feature.
They belong in the **organization admin dashboard** for *any* org: an org admin (and
advisors) can send a notification through Optio to **all students, advisors, and parents in
their org**. This is a natural org-admin capability, so it ships un-flagged to every org's
admin dashboard (still backend-scoped to the sender's org).

**Important correction:** the email told Christina school-wide broadcast already exists.
It does **not** in shipped form — the `announcements` and `announcement_recipients` tables
exist (`backend/migrations/018_create_announcements.sql`) with RLS, but there is **no API
and no UI**. This phase ships the dormant feature. (Group *chat* does exist — Phase 5.)

### 6.1 Data
- Reuse existing `announcements` + `announcement_recipients` tables as-is. `target_audience`
  already supports `all_students`, `specific_quest`, `specific_users`. **Extend the
  audience model** so a broadcast can target everyone in the org — students, advisors, AND
  parents (parents via `managed_by_parent_id` / `parent_student_links` of the org's
  students). Add audience values such as `all_org` / `advisors` / `parents` as needed.

### 6.2 Delivery = Optio notifications
- A broadcast fans out via the existing `NotificationService` so each recipient gets an
  in-app notification (same surface as messages/comments). The `announcements` row is the
  durable record; notifications are the delivery mechanism. Reuse the notification badge /
  feed already in the app — no new push channel required.

### 6.3 Backend
- `backend/routes/announcements.py`:
  - `POST   /api/announcements` — create + fan out notifications (org_admin/advisor/
    superadmin; recipients resolved from the sender's org by `target_audience`).
  - `GET    /api/announcements` — list for the current user (org-scoped, unexpired).
  - `PATCH/DELETE /api/announcements/<id>` — author/org_admin edits, soft expire.
  - `POST   /api/announcements/<id>/read` — mark read (`announcement_recipients`).
- Backend-enforced org scoping (sender can only target their own org; superadmin any).
  Frontends use the Flask backend, not PostgREST, so backend scoping is primary; existing
  RLS is defense in depth. **No `require_org_feature` gate** — this is a standard org-admin
  tool, available to every org.

### 6.4 Frontend
- **Compose:** an "Announcements" section in the **org admin dashboard** (the
  `/organization` management area) — title, body, audience selector (everyone / students /
  advisors / parents), optional pin/expiry.
- **Read:** recipients see the broadcast through the existing notification feed; optionally
  a dismissible banner / announcements list.

### 6.5 Tests
- Backend: audience resolution (students/advisors/parents), org scoping, notification
  fan-out, read tracking.

**Effort:** ~2-3 days.

---

## 7. Phase 5 — Roster-based group messaging (flag: `roster_groups`)

Direct messaging and group chat already ship fully (`backend/routes/group_messages.py`,
`frontend/src/pages/CommunicationPage.jsx`). A teacher can already hand-create a "History"
group and add members. The gap Christina feels is **manual curation**. The `org_classes`
roster system also already exists (`org_classes`, `class_enrollments`, `class_advisors`,
`class_quests` — `backend/migrations/20260209_create_organization_classes.sql`). This phase
**wires the two together**: create/sync a group chat from a class roster in one click.

### 7.1 Data
- No new tables required. Optionally add `group_conversations.source_class_id uuid` (nullable
  FK to `org_classes`) to mark auto-synced groups and keep them in sync.

```sql
ALTER TABLE group_conversations
  ADD COLUMN IF NOT EXISTS source_class_id uuid REFERENCES org_classes(id);
```

### 7.2 Backend
- `POST /api/classes/<class_id>/messaging-group` — create a `group_conversation` whose
  members = the class roster (`class_enrollments`) + class advisors (`class_advisors`);
  idempotent (re-syncs membership if it already exists). Reuse `GroupMessageService`.
- Optional: on roster change (add/remove student to a class), sync the linked group.
- Guard with `require_org_feature('roster_groups')`.

### 7.3 Frontend
- In the class/roster management UI (or Gryffin hub), a "Create group chat for this class"
  button → drops the teacher into the existing `CommunicationPage` group thread. Minimal
  net-new UI since the chat surface already exists.

### 7.4 Prerequisite check — RESOLVED (2026-06-15)
- **Verified: `org_classes` has a complete, working frontend.** Class creation
  (`frontend/src/components/classes/CreateClassModal.jsx`), roster add/remove
  (`ClassStudentsTab.jsx` + `AddStudentsModal.jsx`), advisor assignment
  (`ClassAdvisorsTab.jsx`), and quest assignment (`ClassQuestsTab.jsx`) all exist, reachable
  at `/org-classes` via `classService.js`. No roster UI needs to be built.

**Effort:** ~1-2 days (the low estimate — roster UI confirmed present).

---

## 8. Scheduled publishing of class quests (flag: `scheduled_publish`) — BUILT

**Corrected scope (2026-06-15):** Gryffin does **not** use the course system. They use
**classes of students** (`org_classes`) with quests assigned via **`class_quests`**, and
want to schedule when a quest becomes visible to the students in a class. So scheduling
lives on `class_quests`, not `course_quests`. (An earlier pass mistakenly built this on the
course system and was reverted.)

### 8.1 Migration — `supabase/migrations/20260615_add_class_quest_scheduling.sql`

```sql
ALTER TABLE class_quests ADD COLUMN IF NOT EXISTS publish_at timestamptz;  -- NULL = visible now
```

### 8.2 Mechanism — read-time gating on a single chokepoint (no cron)

Class quests reach students through exactly one read path:
`GET /api/organizations/<org>/classes/<id>/quests` → `ClassService.get_class_quests` →
`ClassRepository.get_class_quests`. Adding a quest to a class does **not** auto-create
`user_quests`, and `class_quests` is referenced nowhere else student-facing. So visibility is
evaluated at read time:

- **Students** (`effective_role == 'student'`) get rows where `publish_at IS NULL OR publish_at <= now()`.
- **Teachers/admins/superadmin** get all rows (scheduled ones shown with a badge).

No `is_published` flip and **no cron job** — the quest appears the moment a student next loads
the class. Simpler and lower-latency than the course approach.

### 8.3 Backend (built)
- `ClassRepository.get_class_quests(class_id, only_published=False)` — read-time `.or_()` filter.
- `ClassRepository.set_quest_schedule(class_id, quest_id, publish_at)`.
- `ClassService` passthroughs + `set_quest_schedule`.
- `routes/classes/quests.py`: `get_class_quests` passes `only_published` for students;
  `add_class_quest` accepts an optional `publish_at`; new
  `PUT /organizations/<org>/classes/<class>/quests/<quest>/schedule`. Writes gated by
  `org_has_feature(class_org, 'scheduled_publish')` (superadmin bypass).

### 8.4 Frontend (built)
- `ClassQuestsTab.jsx`: a per-quest clock control to set/clear a publish date + a "Publishes
  \<date\>" badge, shown when `useOrgFeature('scheduled_publish') || isSuperadmin`.
- `classService.setClassQuestSchedule(...)`.
- **Access point:** class management is surfaced in the org admin dashboard at `/organization`
  via a new **Classes** tab (`OrgClassesTab.jsx` → `ClassList`/`ClassDetailPage` → Quests tab),
  so a Gryffin org admin manages classes and schedules quests from `/organization`. The
  standalone `/org-classes` route still works for advisors/students.

### 8.5 Tests (todo)
- Backend: student vs teacher visibility of a future-scheduled class quest; flag gating;
  schedule set/clear.

**Status:** implemented, pending local verification. **Effort:** ~1 day.

---

## 9. Cross-cutting concerns

- **Critical Rule #7 — superadmin:** every new role check and `require_org_feature` guard
  must allow `superadmin` through.
- **Brand:** `optio-purple` / `optio-pink`, no `purple-600`. No emojis in copy.
- **Clients:** `get_supabase_admin_client()` for cross-user reads/writes; `get_user_client()`
  where RLS should apply. Backend is the access-control boundary (frontends don't use
  PostgREST).
- **Schema verification:** confirm live columns via Supabase MCP before writing queries.
- **Data API grants:** new `public` tables inherit grants via the existing default-privileges
  migration — no per-table GRANT needed.
- **Testing gates (must stay green to ship to `main`):** v1 web 95%+ pass / 40%+ line
  coverage; backend `test` job. Add tests per phase.
- **Verification:** never commit until verified locally at http://localhost:3000 and the
  user confirms.

---

## 10. Recommended sequence & effort

| Order | Phase | Flag | Effort | Depends on |
|---|---|---|---|---|
| 1 | §2 Feature-flag layer | — | 0.5 d | — |
| 2 | §3 Gryffin org + hub | — (slug) | 1 d | Phase 0 |
| 3 | §8 Scheduled publish | `scheduled_publish` | 1-2 d | Phase 0 |
| 4 | §4 Due dates + agenda | `due_dates` | 3-4 d | Phases 0,1 |
| 5 | §5 Feedback threads | `feedback_threads` | 2-3 d | Phase 0 |
| 6 | §6 Announcements | `announcements` | 2-3 d | Phases 0,1 |
| 7 | §7 Roster groups | `roster_groups` | 1-4 d | Phase 0 (+ `org_classes` UI check) |

**Total:** ~11-18 days depending on the `org_classes` UI swing factor. Phases 3-7 are
independent after the foundation, so they can be parallelized across worker terminals
(`/ship-feature` per phase) if desired.

Publish (§8) is sequenced early because it's cheap and directly addresses her "only one
project at a time / publish when ready" pain with the least new code.

---

## 11. File touch-list summary

**New files**
- `supabase/migrations/20260615_add_org_feature_flags.sql`
- `supabase/migrations/20260615_add_assignment_due_dates.sql`
- `supabase/migrations/20260615_create_assignment_threads.sql`
- `supabase/migrations/20260615_add_scheduled_publish.sql`
- `backend/utils/org_features.py`
- `backend/routes/gryffin.py`
- `backend/routes/announcements.py`
- `backend/routes/assignment_comments.py` (or fold into `gryffin.py`)
- `frontend/src/pages/gryffin/GryffinPage.jsx` (+ `GryffinAgendaPage.jsx`, `GryffinAnnouncementsPage.jsx`, facilitator views)
- `frontend/src/components/AssignmentThread.jsx`
- `backend/tests/test_gryffin_routes.py` (+ per-feature tests)
- `docs/gryffin/GRYFFIN_STATUS.md` (status/testing guide, mirror `docs/JJ/TREEHOUSE_STATUS.md`)

**Modified files**
- `frontend/src/components/navigation/Sidebar.jsx` — add `gryffin` to `ORG_PROGRAM_TABS` (~line 16)
- `frontend/src/App.jsx` — lazy imports + routes for `/gryffin*` (mirror Treehouse ~lines 63-68, 510)
- `frontend/src/services/api.js` — `gryffinAPI`, agenda/announcements/comments endpoints
- auth/org context — expose `organization.feature_flags` + `useOrgFeature` hook
- `backend/routes/__init__.py` — register `gryffin`, `announcements`, comments blueprints (~line 289)
- `backend/repositories/course_quest_repository.py` — persist `due_date`/`publish_at`, read-time publish predicate
- `backend/repositories/curriculum_lesson_repository.py` — same
- Course Builder editor components — date pickers (flag-gated)
- `frontend/src/components/credit-dashboard/ItemDetail.jsx` — mount `<AssignmentThread>`

**Reused as-is (no change)**
- `announcements` / `announcement_recipients` tables
- `group_conversations` / `group_members` / `group_messages` + `CommunicationPage.jsx`
- `org_classes` / `class_enrollments` / `class_advisors` (verify UI per §7.4)
- `courses.navigation_mode='sequential'`, `is_published` flags
