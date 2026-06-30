# iCreate SIS — Parent Registration → Class Enrollment Workflow

**Status:** Draft / living document
**Last updated:** 2026-06-30
**Owner:** Tanner Bowman
**Purpose:** Source of truth for the end-to-end workflow: a parent registers from the iCreate site (on an iCreate-branded Optio page), enters their family, pays, completes paperwork, schedules a Customized Learning Plan meeting, and enrolls their child(ren) in classes.

> **[exists]** = Optio already does this (reuse). **[net-new]** = must be built. **[decided]** = locked. **[open]** = still to diagram.

---

## 1. Goal

A parent goes from the **Register** button on the iCreate marketing site to a **confirmation email** — creating an account, paying, completing paperwork, scheduling a CLP meeting, and selecting classes for every student in the family, fully self-serve.

---

## 2. The Decided Workflow

```
iCreate marketing site — "Register" button
   │   (links to Optio, iCreate-branded page)
   ▼
┌──────────────────────────────────────────────────────────────────────────┐
│ OPTIO  (white-labeled as iCreate)                                          │
│                                                                            │
│  STEP 1  Registration form                                                 │
│            Parent:    first · last · email                                 │
│            Student(s): first · last · email (only if 13+) · birthdate      │
│                        [+ add another student]                             │
│            → SAVE                                                          │
│            │                                                               │
│            ▼                                                               │
│  STEP 2  BLOCKER — Pay registration fee                                    │
│            $125 / family  +  $50 / student   (Stripe)                      │
│            │  (when fee is paid)                                           │
│            ▼                                                               │
│  STEP 3  Paperwork page  (fill out required paperwork → finish)            │
│            │  (when finished)                                              │
│            ▼                                                               │
│  STEP 4  EMAIL → "Schedule your CLP meeting"  (BizSuite scheduling link)   │
│            │                                                               │
│            ▼                                                               │
│  STEP 5  Select classes  (capacity / waitlists)  →  SAVE                   │
│            │                                                               │
│            ▼                                                               │
│  STEP 6  EMAIL → confirmation of changes                                   │
└──────────────────────────────────────────────────────────────────────────┘
```

### Step 1 — Registration (iCreate-branded Optio page)
- **Trigger:** "Register" on the iCreate site links to **Optio**, rendered on an **iCreate-branded (white-label) page**.
- **Form fields:**
  - **Parent:** first name, last name, email
  - **Student(s)** (repeatable): first name, last name, **email — only if 13 or older**, birthdate
  - **Save**
- **Mapping:** parent → `org_managed` / `org_role='parent'` under the iCreate org; each student → dependent user (`is_dependent`, `managed_by_parent_id`) inheriting the iCreate `organization_id`. Birthdate decides under-13 (no email/login) vs. 13+ (email, may get a login).
- **Reuse:** `/api/auth/register` + `org_slug`; `/api/dependents/create`.
- **[net-new]:** white-label/branded registration page; a single combined parent + repeatable-students form; student count feeds Step 2.
- **[open]:** how the parent sets a **password / login credential** (the form lists no password — magic link / emailed set-password, or add a password field?) — see Q9.

### Step 2 — Pay registration fee (blocker)
- **State:** A **blocker page** appears after Save; the account can't proceed until the fee is paid.
- **[decided] Fee = `$125 per family + $50 per student`** → `125 + (50 × #students)`. One-time, via **Stripe**. **No per-class tuition.**
- **[net-new] ⚠️ Stripe was removed in the March 2026 audit** (`@stripe/*` dropped, payment routes gone). Re-integration: Stripe keys, one Checkout Session for the computed amount, webhook, payment-record table.
- **[open]:** refund-on-withdraw policy; fee handling if a student is added/removed later.

### Step 3 — Paperwork page
- **State:** After payment, a **paperwork page** must be completed before continuing (the to-do/checklist gate).
- **Reuse:** parental consent (COPPA) docs + admin review becomes one item.
- **[net-new]:** paperwork **requirements model** (items + per-family/student status), the **feature-gating layer** (locked until fee paid AND paperwork finished), and the paperwork/to-do UI.
- **[open]:** exact list of paperwork items (Q4).

### Step 4 — Email: "Schedule your CLP meeting"
- **Action:** On finishing paperwork, the system **emails the parent a prompt to schedule their CLP (Customized Learning Plan) meeting** via a **BizSuite scheduling link**.
- **[net-new]:** the "schedule your CLP meeting" email template + trigger; the BizSuite scheduling link.
- **[open]:** Is Step 5 (class selection) **gated** on the CLP meeting (booked? attended?) or independent of it? Does the CLP produce a stored learning-plan artifact, or just a booked call for now? Is the BizSuite link a single static per-org URL or generated per-family? — see Q8.

### Step 5 — Select classes
- **Action:** Parent browses the iCreate class catalog and **selects classes** for each student, then clicks **Save**. Classes have **capacity**; full classes offer a **waitlist**.
- **Reuse backbone:** `org_classes` + `class_enrollments` + `class_advisors` + `class_quests`.
- **[net-new]:** parent-facing **catalog + selection UI**; **capacity + waitlist** on classes; **parent-initiated enrollment** (today only org_admin/advisor enroll — needs a parent endpoint + RLS, with waitlist handling).
- **[open]:** meeting times / conflicts (Q5); term + add/drop dates, e.g. 9/9/26 (Q7); auto-enroll vs. admin approval after Save (Q6).

### Step 6 — Email: confirmation of changes
- **Action:** After Save, the parent gets an **email confirming the changes** — the classes/waitlists selected (or modified) per student.
- **Reuse:** transactional email infra (`backend/templates/email/`).
- **[net-new]:** the confirmation-of-changes email template + send trigger (fires on each save/change, consistent with an editable add/drop window).

---

## 3. Actors & Roles

| Actor | Optio mapping |
|-------|---------------|
| Parent / Guardian | `org_managed` + `org_role='parent'` under iCreate org |
| Child / Student | dependent user, inherits iCreate `organization_id` |
| iCreate admin | `org_admin` (catalog, paperwork defs, rosters, CLP) |
| Instructor / Advisor | `advisor`, assigned via `class_advisors` |

---

## 4. Net-New Build Checklist (derived from the workflow)

| # | Piece | Step |
|---|-------|------|
| N1 | iCreate-branded (white-label) registration page on Optio | 1 |
| N2 | Combined **parent + repeatable-students** registration form → creates org_managed parent + dependents | 1 |
| N3 | **Stripe re-integration** — one-time Checkout for `125 + 50×students` + webhook + payment record (blocker until paid) | 2 |
| N4 | Paperwork **requirements model** (items + per-family/student status) | 3 |
| N5 | **Feature-gating layer** (lock until fee paid AND paperwork finished) | 2–3 |
| N6 | Paperwork **page / to-do UI** | 3 |
| N7 | **"Schedule your CLP meeting" email** + BizSuite scheduling link | 4 |
| N8 | **Capacity + waitlist** (+ term/add-drop dates) on `org_classes` | 5 |
| N9 | Parent-facing **class catalog + selection UI** (with waitlist) | 5 |
| N10 | **Parent-initiated enrollment** endpoint + RLS (incl. waitlist) | 5 |
| N11 | **Confirmation-of-changes email** template + trigger | 6 |

---

## 5. Current State Reused (detail)

- **Parent registration** — `backend/routes/auth/registration.py`; org join by slug; OTP/link email verify.
- **Dependents** — `backend/routes/dependents.py` (`create`, `my-dependents`, `promote`, etc.); student = full `users` row, inherits org; under-13 has no login.
- **Parental consent (COPPA)** — `submit-documents` + admin review; under-13 cannot self-register (parent-first).
- **Organizations** — `backend/routes/organizations.py`; one iCreate org, families join as `org_managed`.
- **Classes** — `backend/migrations/20260209_create_organization_classes.sql`, `services/class_service.py`, `routes/classes/{crud,advisors,quests}.py`. Tables: `org_classes`, `class_advisors`, `class_enrollments`, `class_quests`. RLS-scoped to org; enrollment currently staff-only.
- **Email** — `backend/templates/email/`.

---

## 6. Decisions & Open Questions

| # | Item | Status |
|---|------|--------|
| Q1 | iCreate org structure | **DECIDED: one iCreate org**; families join as `org_managed`/`parent`. |
| Q2 | When/what student data at signup | **DECIDED: during registration. Fields — parent: first/last/email; student: first/last/email-if-13+/birthdate.** |
| Q3 | Payment scope | **DECIDED: one-time fee = $125/family + $50/student; no per-class tuition.** Refund policy open. |
| Q5 | Class scheduling detail | **Partly decided: capacity + waitlist in scope.** Meeting times/conflicts still open. |
| Q4 | Paperwork checklist items | **Open** — consent is one; what else? |
| Q6 | After Save: auto-enroll vs. admin/advisor approval | **Open.** |
| Q7 | First day of school / term + add-drop dates (9/9/26?) | **Open.** |
| Q8 | CLP meeting: gate class selection on booked/attended? stored plan artifact? BizSuite link static vs per-family? | **Open.** |
| Q9 | How parent sets password / login credential (no password field on form) | **Open** (new). |

---

## 7. Attendance & Absence Notifications

**[decided] No check-in/check-out.** There is no student-driven attendance (no
kiosk tap-in/out). Attendance is **teacher-marked**: the class advisor opens the
roster for a meeting, everyone defaults to **present**, and the teacher flags who is
**absent** (or **excused**), then saves.

**[built 2026-06-30]** End-to-end attendance for org classes:

| Piece | Detail |
|-------|--------|
| `class_attendance` table | One row per `(class_id, student_id, meeting_date)`; status `present`/`absent`/`excused`; RLS mirrors `org_classes` (org_admin + advisor manage; student sees own; parent sees dependent's). Migration `backend/migrations/20260630_create_class_attendance.sql`. |
| Mark / view roster | `GET` + `POST /api/organizations/:org/classes/:class/attendance` (advisor / org_admin / superadmin). `routes/classes/attendance.py` → `AttendanceService`. |
| Teacher UI | **Attendance** tab on the class detail view (SIS → Classes → a class). Date picker (defaults today), per-student Present/Absent/Excused, "Mark all present", Save. `components/classes/ClassAttendanceTab.jsx`. |

### Notification rules (in `AttendanceService` / `NotificationService`)
- **A student becomes `absent` → notify the parent(s)** (`student_absent` type;
  parents resolved via `get_parents_for_student` — `managed_by_parent_id` +
  `parent_student_links`). Mobile push enabled.
- **A student marked `present` is later changed to `absent` → notify the parent(s)
  AND the org admin(s)**, flagged as a correction ("changed to absent").
- Re-marking an already-absent student does nothing (no duplicate pings).

### Teacher reminder at the start of each class
- **[built]** Recurring cron (`render.yaml` → `class-attendance-reminder`, every
  15 min) hits `POST /api/admin/attendance-reminder/trigger` (cron-secret auth),
  running `ClassAttendanceReminderJob` → `AttendanceService.send_attendance_reminders`.
- For each **active** class whose `days_of_week` includes today and whose
  `start_time` falls in the next window, if attendance hasn't been taken yet, each
  class advisor gets an `attendance_reminder` notification ("Take attendance"). The
  schedule data comes from the `org_classes` scheduling fields added with the Add
  Class form. Idempotent per advisor+class+date; timezone defaults to America/Denver.

> **[open]** Timezone is currently a single default (America/Denver) rather than
> per-org; multi-timezone orgs would need a per-org tz on the class/organization.

---

## 8. Changelog

- 2026-06-30 — Captured initial workflow; logged build checklist + open questions. Decided Q1 (one iCreate org), Q3 (flat fee), Q2 (students at signup).
- 2026-06-30 — Fee set to **$125/family + $50/student**; added CLP meeting; class selection gained capacity + waitlists.
- 2026-06-30 — **Refined to 6 numbered steps with field-level detail.** Registration page is **iCreate-branded but hosted on Optio** (N1). Form fields locked (Q2). **CLP meeting moved to an emailed scheduling prompt** sent after paperwork (Step 4 / N7), not an in-app step. Final step is a **confirmation-of-changes email** (N11). New open question Q9 (how the parent sets a password).
- 2026-06-30 — **Attendance built (Section 7).** Decided **no check-in/check-out** — attendance is teacher-marked. Shipped `class_attendance` table, the mark/view endpoints, the **Attendance** tab in the SIS class view, parent absence notifications (parent + org_admin on a present→absent change), and a 15-min cron that reminds advisors to mark absences at the start of each class.
