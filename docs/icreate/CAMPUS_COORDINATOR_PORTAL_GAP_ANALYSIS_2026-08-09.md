# Campus Coordinator Portal — Requirements vs. What Exists

**Date**: 2026-08-09
**Source**: iCreate "Campus Coordinator Portal – Programmer Requirements" (received 2026-08-09)
**Status**: BUILT 2026-08-09 (same day, uncommitted). Everything below except
Phase 3 (time off) and campus scoping (blocked on iCreate answering the campus
question) is implemented. Migration
`supabase/migrations/20260809_campus_coordinator_portal.sql` is written but
NOT yet applied — every Supabase access path was down during the build
(expired PAT in the MCP config; claude.ai connector unauthorized). Apply it
before local verification: the new columns (visible_to_roles, alert workflow
fields, priority/due_date, sis_form_comments) are referenced by the code.

---

## Headline

iCreate's "Important Design Principle" (section 9: one staff portal + role-based
permissions + role-specific dashboard) is the architecture the SIS console
already has. The document reads as a from-scratch portal spec, but most of the
named surfaces exist and the campus coordinator role already reaches them at the
admin tier (everything except finance). The real work is in five places:

1. **Per-role content visibility** — the doc's foundational ask; nothing today
   supports it (everything is a two-tier admin/teacher split plus an
   `audience` enum).
2. **A coordinator dashboard** — the admin dashboard is enrollment stats and two
   links; none of the operational widgets the doc describes exist there.
3. **The attendance accountability workflow** — strong foundations exist
   (parent pre-reporting, alert sweep, excused/unexcused reporting) but the
   "not accounted for" resolution loop does not.
4. **Campus scoping** — there is no campus/location entity anywhere in the data
   model. Everything is org-wide. This is the biggest open question.
5. **The internal task system (their Phase 2)** — mostly already modeled in
   `sis_form_submissions` (including an `assigned_to` column no UI can set).

Two items need attention regardless of iCreate's priorities, because current
behavior contradicts the doc's stated confidentiality intent:

- **Secure documents (contracts, background checks, HR files) are readable by
  campus coordinators today.** `routes/sis/secure_documents.py` gates on
  `ADMIN_ROLES`, which includes coordinators; the `PAY_FIELDS` redaction does
  not reach this store. The doc says coordinators should not see contracts or
  HR documentation.
- **Coordinators cannot be assigned staff onboarding.** The onboarding
  recipient list (`sis_onboarding_service.list_recipients`) filters staff to
  `advisor`/`org_admin` and omits `campus_coordinator`, so "Campus Coordinator
  onboarding" (their Phase 1) is currently impossible to assign.

---

## Requirement-by-requirement map

Legend: DONE = exists and coordinators have it | PARTIAL = foundations exist,
work needed | MISSING = does not exist.

### 1. Role-based permissions

| Ask | Status | Notes |
|---|---|---|
| Campus Coordinator role | DONE | Org role, DB constraints, access tiers (`sis_roles.py`), nav, console gate. Admin tier minus finance, minus role-granting. |
| More roles (Registrar, Curriculum Staff, Financial Manager) | MISSING | Deliberately not built. Adding a role requires a migration (two CHECK constraints on `users`). Recommend not minting these until iCreate names real people who hold them and nothing else — see Questions. |
| Multiple roles per user | DONE | `users.org_roles` array; all helpers handle it. |
| Content visible per role (resources, docs, forms, training, reports, sections) | MISSING | Everywhere today: `audience` enum (`staff`/`family`/`all`) or admin-vs-teacher flags. No per-role targeting on any system. This is the load-bearing gap — most of section 3 of their doc becomes trivial once it exists. |
| Visible to specific individuals | PARTIAL | Onboarding is per-person (bulk select). Resources/training/forms are not. |

### 2. Campus Coordinator dashboard

The admin dashboard (`SisDashboard.jsx`) shows: four stat cards (students,
active, families, enrolled), an enrollment-status panel, two links. The teacher
dashboard (`TeacherDashboard.jsx`) already has the machinery the doc wants —
"Today" schedule card, resources rail, forms rail, onboarding banner — but
coordinators are routed to the admin one.

| Widget | Status | Notes |
|---|---|---|
| Today's schedule (org-wide classes today: name, time, teacher, room, count, click-through to class/CLP) | PARTIAL | `class_meetings` has day/time/location; the teacher dashboard renders a personal version. An org-wide "today" query is new but sits on existing tables. |
| My work schedule (own shifts) | PARTIAL | `sis_staff_assignments` (duties/events/meetings) + `MySchedulePage` exist but are teacher-surfaced; coordinators don't get the page (teacherOnly nav). Surface the same data to coordinators. True shift scheduling does not exist (see Phase 3). |
| Today's attendance board (expected / present / excused / unaccounted) | PARTIAL | See section on attendance below. |
| Assigned tasks / to-dos | PARTIAL | Their Phase 2; `sis_form_submissions.assigned_to` exists with no UI. See Phase 2 section. |
| Quick links (role-configurable) | MISSING | Zero quick-links mechanism in the repo. All dashboard links are JSX literals. |

### 3. Navigation sections

| Ask | Status | Notes |
|---|---|---|
| Classes (view all: teacher, schedule, room, roster, CLP, curriculum) | DONE | Coordinators get the full admin Classes surface. Doc raises which fields should be *editable* vs view-only for coordinators — today they have full admin edit. Open question, not a gap. |
| CLPs | DONE | `adminOnly` nav, coordinator included. |
| Curriculum | DONE | Same. |
| Teachers (name, classes, schedule, messaging, CLPs; NOT pay/contracts/HR/notes) | PARTIAL | People→Staff shows operational fields; `PAY_FIELDS` (`pay_type`, `payroll_id`, `hourly_rate_cents`) redacted per-field for coordinators. Gaps: (a) secure documents (contracts/background checks) are NOT redacted — coordinators can read them today; (b) there is no staff-to-staff messaging surface at all (broadcast announcements only; DMs exist only inside a shared class). Note: no HR-notes field exists anywhere, so there is nothing of that kind to leak. |
| School calendar (view + add/edit campus-relevant items) | DONE (org-wide) | `sis_events`: coordinators can create/edit/delete (`ADMIN_ROLES`). Audience scoping exists (`school`/`teachers`/`admins`); campus/program scoping does not (no campus entity; `location` is free text). No recurring events. |
| Attendance + accountability workflow | PARTIAL | See below. |
| Resources (role-assignable library, quick links) | PARTIAL | `org_resources` with categories, file uploads, required-read acknowledgment tracking with re-ack versioning. Missing: per-role visibility (audience enum only), quick-links surfacing. Most of the doc's example resources are just content to upload once the scoping exists. |
| Training (role-assignable, completion tracked) | PARTIAL | `sis_staff_training` flags Optio quests as school-set; completion tracked through the normal quest tables; admin gets a staff-by-quest progress matrix. Missing: per-role assignment (`is_required` is all-staff-or-nothing). Their example split (All Staff / Teacher / Campus Coordinator training) is exactly the role-scoping gap. |

### Attendance accountability (their safety-tool ask)

What exists is more than they may realize:

- `sis_attendance` per class per day, taken by teachers, statuses
  `present/absent/late/excused` in the DB.
- **Parent pre-reporting already works**: `student_planned_absences` — guardian
  reports a child out (whole day or one class), surfaces on the teacher's
  roster as "Parent reported out", admins notified.
- **Alert sweep already runs** (cron): newly-absent notifications to all org
  admins; a gap alert when a student was present earlier but absent later
  (notifies admins and guardians, deduped per day); take-attendance reminders
  to teachers.
- **Daily report** already distinguishes excused vs unexcused per student.

What's missing for the doc's workflow:

- The roll-taking UI can only write `present`/`absent` — `late` and `excused`
  exist in the schema and the reporting math but no control sets them.
- The "absent but not pre-excused → flag" rule: pieces exist (planned absences,
  absent notifications) but the notification fires for every absence, not just
  unexcused ones, and goes to all org admins.
- A live "today" board (expected / present / excused / unaccounted) — the daily
  report is close but is a retrospective report, not a resolution surface.
- **Alert resolution with a recorded outcome** (elsewhere on campus / late /
  absent without notice / mis-marked) — `sis_attendance_alerts` is a dedupe
  table, not a workflow; nothing is resolvable or annotated.

### 4. Onboarding

Checklist system exists (`sis_onboarding_templates`/`_assignments`: documents,
typed signatures, approvals, snapshots). Two gaps: coordinators are excluded
from the staff recipient list (fix regardless), and there is no link to Optio
quests — "onboarding with an Optio quest" is what the *training* system already
does (category "Onboarding" exists as a convention), so this may be a
conversation about which tool they mean rather than a build.

### 5. Forms

`sis_form_submissions` with 12 hard-coded staff types — most of the doc's
examples already map (incident, supply_request, maintenance≈facility issue,
technology, parent_contact≈parent follow-up). Missing types: student concern,
teacher support request, substitute request. Gaps: definitions are hard-coded
Python dicts (doc asks for configurable), and no per-role targeting of the
queue (every admin sees everything).

### 6. Internal request/task system (their Phase 2)

Closest existing system: the forms queue. `sis_form_submissions` already has
`assigned_to` (FK to users), status workflow, `resolution_notes`,
categories, student/class links, and staff + parent submitters — the doc's own
framing ("expand the family request concept") describes exactly this table.
The backend accepts assignment; **no UI can set it**. Missing vs the doc:
priority, due date, richer statuses (new/assigned/in-progress/waiting/done vs
submitted/under-review/resolved), comments thread, dashboard surfacing.
Recommendation: build Phase 2 as an evolution of this table, not a new system.

### 7. Staff scheduling / time off (their Phase 3)

- Duties/assignments (`sis_staff_assignments`) and a merged teaching+duties
  weekly view (`MySchedulePage`) exist; admin creates rows one at a time.
- Time clock + timesheets exist (finance-gated, export-only payroll).
- **Time-off requests: nothing exists.** Repo-wide search for
  time-off/PTO/leave/substitute-request concepts: zero hits. No staff absence
  record at all (attendance is students only). Their Phase 3 is a genuine
  from-scratch build; agreeing it stays Phase 3 is the right call.

### 8. Quick links

No mechanism exists. Small build: an org-settings list (name, URL, roles) plus
a dashboard card. Becomes trivial after the role-visibility mechanism exists.

---

## The campus question (biggest architectural decision)

The doc says "their campus" throughout — campus schedule, campus attendance,
campus events, teachers at their campus. **There is no campus/site/room entity
in the data model.** The only location data anywhere is four free-text
`location` columns (`org_classes`, `class_meetings`, `sis_events`,
`sis_staff_assignments`). The coordinator role is an org-wide permission tier
with no location binding. Attendance sweep hours, calendar, directory, reports:
all single-campus-per-org assumptions, some explicitly commented as such.

If iCreate runs (or will run) multiple campuses under one Optio org, a campus
entity (campuses table, `campus_id` on classes/events/staff, coordinator→campus
assignment) has to come before "their campus" means anything — and it touches
nearly every SIS query. If each campus is its own org, none of that is needed
and "campus" just means "org". **This must be answered before committing to
Phase 1 scope.**

---

## Recommended sequencing

**Now (small, closes contradictions with the doc):**
1. Exclude coordinators from secure documents (`FINANCE_ROLES`-style gate or a
   dedicated tuple — it's HR/confidential, not finance, so likely a new
   `HR_ROLES = ('org_admin', 'superadmin')`).
2. Add `campus_coordinator` to onboarding staff recipients.
3. Let the attendance UI write `late`/`excused` (schema already supports it).
4. Forms assignment UI (backend already done) — quietly starts their Phase 2.

**Phase 1a — role-scoped visibility (the enabling mechanism):**
Replace/augment the `audience` enums on `org_resources`, `sis_staff_training`,
and form types with a roles array (e.g. `visible_to_roles text[]` validated
against `OrgRole`), plus optional per-user targeting where it matters. Build it
once, apply to all three systems. Do NOT mint the six roles from their list yet
— the mechanism should take any `OrgRole` value so new roles drop in later.

**Phase 1b — coordinator dashboard:**
Route coordinators to a new dashboard assembled largely from existing pieces:
org-wide "today's schedule" (new query over `class_meetings`), today's
attendance board + unexcused alert resolution (the one real new workflow), own
work schedule (existing data, new surface), quick links (new, small), resources
and forms rails (ported from the teacher dashboard).

**Phase 2 — task system:** evolve `sis_form_submissions` (priority, due date,
statuses, comments, dashboard widget). Do not build a parallel system.

**Phase 3 — time off / substitute coverage:** genuinely new; keep deferred.

**Blocked on iCreate:** anything campus-scoped.

---

## Questions to send iCreate

1. **Campuses**: how many physical campuses operate under the single iCreate
   org today, and near-term? (Determines whether we need a campus entity before
   any "their campus" feature means anything.)
2. **Coordinator edit rights on classes**: today coordinators have full admin
   edit on classes. Your doc suggests some fields should be view-only for them
   — which ones, or is full edit acceptable?
3. **Secure documents**: confirm coordinators should not see the secure
   documents store (contracts, background checks, medical) — today they can;
   we plan to close this.
4. **New roles**: are Registrar / Curriculum Staff / Financial Manager real
   people today who are not also admins? If they're hats the same two admins
   wear, the visibility system can launch with the three existing staff roles
   and grow later.
5. **Coordinator personal schedule**: is a view of duties/shifts entered by an
   admin sufficient for Phase 1 "My Work Schedule", with self-serve scheduling
   and time-off deferred to Phase 3?
