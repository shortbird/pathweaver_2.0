# iCreate SIS — Architecture Discovery & Codebase Audit

**Status:** Discovery / planning. No code changes yet.
**Branch:** `claude/optio-sis-implementation-u314sk`
**Source spec:** iCreate "Create Student Information System (SIS) — Architecture & Discovery Document" (Draft v1.0)
**Audit date:** 2026-06-26 | **Scope:** web v1 (`frontend/` + `backend/`). Mobile v2 out of scope.

This document maps the iCreate SIS spec against what already exists in the Optio
web v1 codebase, draws a hard line between **LMS** and **SIS** responsibilities,
and lists what we reuse vs. build. It ends with the open questions that gate
implementation.

---

## 1. TL;DR

- Optio already has a **built-but-dormant SIS MVP** (June 2026): `households`,
  `household_members`, `emergency_contacts`, `school_enrollments` tables, a
  `/api/sis/*` blueprint, and a separate **SIS console surface** (`sis.` host or
  `?app=sis`) gated per-org by `organizations.feature_flags.sis_enabled`. It
  covers ~25% of the spec: family/student records, school-enrollment lifecycle,
  emergency contacts, roster, dashboard, and family messaging.
- The platform is **rich on the LMS + people side** and we can reuse a lot:
  multi-tenant orgs, a 6-role auth system with org/platform users, the
  parent/dependent/guardian family model, advisor (≈ teacher) tooling,
  portfolios/diplomas, notifications/announcements/email/push, and evidence uploads.
- The platform is **empty on the operational-school side**. There is **no**
  pricing engine, tuition/billing, payment processing (Stripe was removed in the
  March 2026 audit), scheduling, attendance, capacity/waitlists, or QuickBooks
  integration. These are greenfield.
- "Class" already exists in the codebase but means a **teaching cohort**
  (`org_classes` + `class_quests`), not a **registration unit** with capacity, a
  meeting schedule, an instructor, and a price. The spec's Program→Class model is
  new work that can *reuse the cohort shell* but needs a real scheduling/capacity layer.

---

## 2. The LMS / SIS line (system-of-record split)

The spec frames Optio as the **School Operating System** and Simple Biz Suite as
the **Business Operating System**. Internally we draw a second line: within Optio,
keep **LMS** (learning) and **SIS** (operations) as separate concerns sharing the
same users/orgs/auth. The dormant MVP already follows this — additive tables, a
separate route prefix (`/api/sis/*`), and a separate frontend surface.

| Concern | LMS (already built) | SIS (build / extend) |
|---|---|---|
| **Enrollment** | `course_enrollments`, `user_quests` — enrollment in *content* | `school_enrollments` — standing in the *school* (applicant→enrolled→withdrawn→graduated). **Program/class registration is new.** |
| **Grouping** | `org_classes` + `class_quests` — teaching cohort + assigned quests | Registration "Class/Section" with capacity, schedule, instructor, price — **new** |
| **People** | learner/advisor/observer roles on content | family/household/guardian/student records, emergency contacts |
| **Portfolio** | student-owned `diplomas` + evidence gallery (LMS) | teacher-managed portfolio entries (spec §4.10/§6.4) — **overlap, see §6** |
| **Money** | none | pricing, tuition, payment plans, billing, late fees — **new** |
| **Time** | lesson progress, `publish_at`/`due_date` on class quests | class schedules, attendance, conflict detection, waitlists — **new** |
| **Comms** | notifications, announcements, DMs, email, push | **reuse all of it** for family/teacher/admin messaging |
| **Reporting** | parent dashboard, advisor daily summary | enrollment/revenue/attendance reports — **new aggregations over new data** |

**Routing convention going forward:** LMS stays on `/api/courses|quests|curriculum|tasks|evidence|portfolio/*`; SIS stays on `/api/sis/*`. Frontend: LMS on the learning surface, SIS on the `sis.` console surface.

---

## 3. What already exists (reuse map)

### 3.1 Identity, orgs, roles — REUSE AS-IS
- **Multi-tenant orgs**: `organizations` (slug, `quest_visibility_policy`,
  `feature_flags` jsonb incl. `sis_enabled`). Each microschool = one org.
- **6-role system** with platform vs. org users; `get_effective_role(user)` in
  `backend/utils/roles.py` resolves `org_managed` → `org_role`. Roles:
  `superadmin, org_admin, advisor, parent, student, observer`.
- **Auth gating**: `@require_role`, `@require_admin`, `@require_advisor` (backend);
  `<PrivateRoute requiredRole/blockRoles>` + `AuthContext.effectiveRole` (frontend).
- **Masquerade** (superadmin "act as") and **acting-as** (parent view-as-child)
  — useful for admin "complete registration on behalf of a family" (spec §7.3).

### 3.2 Family / guardian / student model — REUSE, HOUSEHOLDS SIT ON TOP
- `users.is_dependent` + `managed_by_parent_id` + `date_of_birth` — COPPA-safe
  under-13 child accounts managed by a parent (no email/credentials).
- `parent_student_links` (+ `parent_invitations`) — 13+ parent↔student linking
  with invite/approval.
- **SIS `households` + `household_members`** group these existing users into a
  family unit *within a school* (relationship: student|guardian|other,
  `is_primary_guardian`). They do **not** replace the link/dependent model.
- `advisor_student_assignments` — advisor↔student (basis for teacher rosters).
- `observer_student_links` + audit logging — read-only extended-family access.

### 3.3 Teacher surface — REUSE ADVISOR TOOLING
Advisor dashboard, check-ins, learning moments, student overview, quest
invitations, classes page. `@require_advisor` already covers advisor/org_admin/
superadmin. This is the closest thing to the spec's **Teacher Portal** (§6).

### 3.4 Parent surface — REUSE PARENT/OBSERVER TOOLING
`/parent/*` (multi-child dashboard, child overview, progress reports,
communications) + `/observer/*` (feed, portfolio, comments). Relationship-based
access (`verify_parent_access`) rather than role-gated. Basis for **Parent Portal** (§5).

### 3.5 Comms & notifications — REUSE, EXTEND WITH NEW EVENT TYPES
- In-app notifications (`notification_service.py`, typed events, prefs, Realtime).
- **Announcements** (`/api/announcements`) — org broadcast to students/parents/
  advisors; **already reused by SIS family messaging**.
- Direct + group messaging; **email** (SendGrid SMTP, Jinja templates,
  ~25 templated emails); **web push** (VAPID) + **mobile push** (Expo).
- For SIS we add event types (payment due/failed, waitlist offer, schedule
  change, enrollment confirmation) on top of this infra — no new transport needed.

### 3.6 LMS / portfolios — KEEP SEPARATE, SHARE EVIDENCE PIPELINE
Course→Quest→Lesson→Task, XP, `diplomas` portfolios (public/FERPA-gated),
evidence uploads (`evidence_documents`, signed-URL flow, magic-byte validation).
SIS links to a student's existing portfolio; it does not fork the diploma model
(pending the teacher-portfolio decision in §6).

### 3.7 Existing SIS MVP — EXTEND
Tables, `sis_service.py`, `household_repository.py`, `/api/sis/*` (dashboard,
roster, members, households+members, enrollments, emergency contacts, roster CSV),
`SisRoutes`/`SisLayout`/`SisSidebar`, `appSurface.js` surface detection. Staff-gated,
org-scoped (`resolve_org_id`), superadmin can target any org.

---

## 4. What's missing (greenfield — must build)

Mapped to the spec's 8 core modules (§8):

| Module | Spec refs | Today | Gap |
|---|---|---|---|
| Family & Student Mgmt | §4.1, §5.2 | **MVP built** | bulk import, family comms prefs, profile depth |
| Program & Class Mgmt | §4.3, §7.2 | cohort shell only (`org_classes`) | programs, classes/sections, **capacity, instructor, prerequisites, eligibility (age)** |
| Registration & Enrollment | §4.2, §5.x | status field only | **multi-step registration flow, resumable/partial, admin override/complete, per-program enrollment** |
| Scheduling & Waitlists | §4.4, §4.7 | none | **schedules/time slots, conflict detection, waitlist queue + auto-offer** |
| Pricing & Payments | §4.5, §4.6 | **none** (Stripe removed) | **pricing engine, tuition calc, discounts, payment plans, recurring billing, late/change fees, billing history** |
| Portals (Parent/Student/Teacher) | §4.9, §5–6 | partial (parent/advisor/student) | **self-service registration, teacher gradebook/attendance, family billing views** |
| LMS & Portfolios | §4.10 | **built** | teacher-managed portfolio entries (overlap, §6) |
| Reporting & Communication | §4.8, §7.8 | partial | **attendance, revenue, enrollment-trend, transcript reporting** |

Plus integrations (§9): **Simple Biz Suite ↔ Optio sync** and **QuickBooks** —
neither exists.

---

## 5. The "Class" ambiguity (important)

The codebase has **two** unrelated "class" concepts, and the spec adds a third meaning:

1. **`quest_type='class'`** — a *class as a transcript subject* (1000 XP ≈ one
   semester credit), with `transcript_subject`, holistic review. This is an **LMS**
   credit construct.
2. **`org_classes` + `class_quests`** — a *teaching cohort*: a named group in an
   org that gets quests assigned with `sequence_order`, `due_date`, `publish_at`.
   No capacity, no meeting schedule, no instructor, no price. An **LMS/grouping** construct.
3. **Spec "Class"** (§3, §4.3) — a *registration & scheduling unit*: a thing a
   family enrolls a student into, with capacity, a meeting schedule, an instructor,
   prerequisites, and a price; can roll up into a Program. This is a **SIS** construct.

**Recommendation:** introduce a SIS-native registration model (`sis_programs`,
`sis_classes`/sections, `sis_class_meetings`, `sis_enrollments` per class,
`sis_waitlist_entries`) rather than overloading `org_classes`. A SIS class can
*optionally* link to an `org_classes` cohort so that registering for a class also
drops the student into the teaching group that receives quests — cleanly bridging
SIS registration → LMS delivery. (Confirm in open questions.)

---

## 6. Overlap to resolve: portfolios

LMS portfolios are **student-owned** (`diplomas`, public/FERPA toggle, evidence
gallery from completed quests). Spec §4.10/§6.4 wants **teacher-managed** portfolio
entries (teacher uploads projects/media, provides feedback, shares to parents).

Two options:
- **A — One portfolio, more authors:** allow teacher/advisor to add entries to the
  student's existing diploma/evidence stream (reuse `evidence_documents` +
  uploader tracking). Simplest; keeps a single student narrative.
- **B — Separate SIS portfolio:** a distinct teacher-curated collection alongside
  the LMS diploma. More faithful to "teacher portal manages portfolio," more to build.

Recommendation: **A**, extended with an "added by teacher" provenance, unless the
school wants teacher portfolios kept separate from the student's self-authored diploma.

---

## 7. Proposed build sequencing (for discussion)

Each phase is independently shippable behind `sis_enabled` (and a finer per-module
flag), additive-only, with no impact on existing schools.

1. **Phase 0 — Activate + harden the MVP.** Wire up the `sis.` host, finish
   household/roster/enrollment UX, confirm no-regression for non-SIS orgs.
2. **Phase 1 — Program & Class Management.** SIS programs/classes/sections,
   capacity, instructor assignment, age/prereq eligibility; optional link to
   `org_classes` cohort.
3. **Phase 2 — Registration & Enrollment.** Multi-step, resumable, per-student,
   multi-program; admin override/complete; eligibility + conflict checks.
4. **Phase 3 — Scheduling & Waitlists.** Meeting schedules, conflict detection,
   capacity enforcement, ordered waitlist with auto-offer notifications.
5. **Phase 4 — Pricing & Billing.** Pricing engine, tuition calc, discounts,
   payment plans; then payment processing + recurring billing + QuickBooks
   (scope depends on Q1 below).
6. **Phase 5 — Attendance & Teacher Portal.** Class-level attendance, teacher
   roster/gradebook, parent/admin attendance visibility.
7. **Phase 6 — Reporting & Integrations.** Enrollment/revenue/attendance
   dashboards; Simple Biz Suite sync.

---

## 8. Open questions (gating — see chat)

1. **Billing scope.** Does Optio *process* tuition (recurring billing — needs a
   re-introduced payment processor), or does Simple Biz Suite collect payment and
   Optio only *calculates + records + displays* (and syncs to QuickBooks)?
2. **First milestone.** Which module do we build first after activating the MVP —
   Program/Class + Registration, or Billing?
3. **Class model.** Build a SIS-native Program/Class/Section model (recommended)
   that optionally links to `org_classes`, or extend `org_classes` directly?
4. **Simple Biz Suite integration.** Is there an API/webhook available now, or is
   SBS↔Optio sync future/manual (registration begins in Optio for now)?
5. **Teacher portfolios.** One shared portfolio with teacher authorship (A) or a
   separate SIS teacher-curated portfolio (B)?

---

## Appendix — key files

**SIS (existing):** `backend/routes/sis/__init__.py`, `backend/services/sis_service.py`,
`backend/repositories/household_repository.py`, `supabase/migrations/20260623_sis_mvp_tables.sql`,
`frontend/src/sis/SisRoutes.jsx`, `frontend/src/pages/sis/*`, `frontend/src/components/sis/*`,
`frontend/src/utils/appSurface.js`, `docs/SIS_MVP.md`.

**Reusable platform:** `backend/utils/roles.py`, `backend/utils/auth/decorators.py`,
`backend/routes/parent/*`, `backend/routes/observer/*`, `backend/routes/advisor/*`,
`backend/routes/admin/organization_management.py`, `backend/services/notification_service.py`,
`backend/routes/announcements.py`, `backend/services/email_service.py`,
`backend/services/push_notification_service.py`, `frontend/src/components/navigation/Sidebar.jsx`,
`frontend/src/components/PrivateRoute.jsx`, `frontend/src/contexts/AuthContext.jsx`.

**LMS (keep separate):** `backend/routes/courses/*`, `backend/routes/quest/*`,
`backend/routes/curriculum/*`, `backend/routes/tasks/*`, `backend/routes/portfolio.py`,
`backend/routes/evidence_documents.py`, migrations `020_add_curriculum_lessons.sql`,
`023_course_system.sql`, `20260527_add_class_quest_fields.sql`, `20260615_add_class_quest_scheduling.sql`.
</content>
</invoke>
