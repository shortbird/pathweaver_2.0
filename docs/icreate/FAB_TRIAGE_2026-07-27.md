# iCreate / SIS in-app feedback triage — 2026-07-27

Triage of the open `bug_reports` submitted via the SIS feedback button (FAB) from
`dmchrplus@gmail.com` (iCreate — Molly Christensen) and `homeschool@completelee.com`
(Complete Lee). Most items were submitted 2026-07-14 → 2026-07-25, **before** the
round-4/round-5 SIS work shipped, so a large share are already live — the client
simply hadn't seen the fix yet or couldn't find it. This doc records, per theme:
**Shipped** (already live, verified in code), **Fixed this run**, **Answer** (a
question, no code needed), or **Deferred** (logged for a future round).

Resolved rows are marked `status='resolved'` in `bug_reports` with a triage note.
Deferred rows are left open as the backlog.

---

## Shipped already (verified live) — resolved

**Dropping students from classes** (the most-repeated complaint). Drop now exists
in all three places the client looked:
- Class → **Roster** tab has a per-student **Drop** button (`ClassesPage` `ClassRoster`).
- **CLP** page: each enrolled class has a Drop control, on the block grid and the list.
- **People → Families → student → Schedule**: Drop on both the block-schedule grid
  and the list view (`StudentDetailModal` `SchedulePanel`).

**CLP page**
- Waitlisted classes and a **Low enrollment (<4 students)** at-risk panel are shown.
- **UFA vs UFA – Private School** now shows on the CLP (fixed this run, see below).

**Class list**
- **Duplicate a class** exists ("… duplicated — review and open registration when ready").
- **Click a class → see the roster with names + ages**; the Waitlist tab shows waitlisted
  students' names + ages.
- **Export CSV / spreadsheet download** with Name, Teacher, Day(s), Time, Ages,
  Description, Supply fee, Tuition, Classroom, Enrolled, Capacity, Waitlist.
- Basic **column sorting** on the class list.

**Attendance / roster** — class labels carry day + time (`classLabel`); times render
in am/pm via `range12h`. (Ages on the attendance roster: see Attendance/Calendar batch.)

**Households / Families**
- **Search sits above Create family**; Create is demoted to a subtle "+ Create a family
  manually" link (both orgs asked for this).
- **Delete family** is gated behind a confirm warning.
- **Student ages** show next to names on family cards and member lists.

**Users / People list**
- Click-to-sort headers by **name, last name, age, role, family, last active**, with a
  dedicated Age column (mirrors the class-list sort UX).

**Reports**
- All report tables are **sortable** by column.
- **Medications** report lists only students who have medications recorded.
- **Allergy report** exists (only students with allergies).
- The special-needs / question report lists only students who actually have an answer.

**Other**
- **Assistant teacher** on classes.
- **Onboarding → Portals & Templates** for teacher/family portals.

---

## Fixed this run

- **CLP: UFA vs UFA – Private School.** Funding source (UFA / UFA – Private School /
  Private Pay / Other) is now an explicit field, distinct from *school of record*
  ("iCreate Academy"). Shown on the CLP page, the family detail, and the student
  record. Because "some iCreate Academy students are not with UFA private school,"
  enrollment and funding are tracked separately. (`households.funding_source`,
  `households.enrolled_private_school`; org label from
  `organizations.branding_config.private_school_name`.)
- **"UFA Private School" label → the org's school name** ("iCreate Academy") on the
  family and student surfaces. The Schedule Builder "UFA Private School requirements"
  heading is intentionally left as-is — the 3-instructional-day rule is a genuine UFA
  requirement, not a school-of-record label.
- **Users list: "Students only" filter** added (the one gap the client named that
  wasn't already built — "a list of JUST students … sortable like the class list").
- **Emails:** the schedule-approval email now has a "Review the schedule" button to the
  SIS Registration page; the "can now choose classes" email uses the student's first
  name in the body (full name still in the subject); the "Seat open … N waiting" alert
  is now a single CC'd email instead of one per admin.
Note: the **calendar special-character encoding** fix (`&amp;amp;` → clean text),
**attendance am/pm** times, and **ages on the attendance roster** were already shipped
in the round-4 batch (commit `34428995`) — verified live this run, not re-fixed.

---

## Questions — answers (no code change needed)

- **"When I offer a seat to the next waitlisted person, how long do they have to
  accept?"** The offer carries an expiry; if it lapses the seat can be offered to the
  next student. Offering is manual ("Offer next seat" on the class Waitlist tab) so you
  stay in control — a freed seat is never auto-filled.
- **"There are 17/20 enrolled in Theater JR with 2 on the waitlist — why didn't they
  get in?"** Waitlisted students are **not auto-enrolled** when seats are open; an admin
  must offer the seat (class → Waitlist → **Offer next seat**), or raise the capacity.
  This is deliberate so you can vet who comes off the waitlist. (See the deferred
  "auto-promote on free seat" item if you'd prefer it automatic.)
- **"I moved a class from Tues block 3 to Thurs block 5 — did that notify students or
  move the kids?"** Editing a class's meeting time moves the existing enrolled students
  with the class (their schedule reflects the new block); it does not send an automatic
  "your class moved" notification. If you want move notifications, that's a small add —
  logged as deferred.
- **"What is the Goals page for?"** It's the student-goals review queue (goals students
  set, for staff to review/approve) — part of the goals flow shipped with the Gryffin
  SIS rollout. Hidden for orgs that don't use goals mode.
- **"Can parents submit forms too?"** Yes — parent-facing form submission exists
  (the `/api/sis/parent_forms` flow), which is the intended path for things like
  requesting the at-home learning-day curriculum.
- **"How do we set up a course/quest for each class — what's the difference?"** A
  **Quest** is a single project a student works through (lessons + tasks that earn XP).
  A **Course** bundles several quests/projects into a sequenced curriculum. To attach
  learning content to a class, create/link a quest to the class; a course is only needed
  when you want a multi-quest sequence. (Deep "connect Optio course to class + let
  teachers edit it" is a deferred feature below.)
- **"'Students already waiting stay until released' — what does that mean?"** When you
  enable an enrollment waitlist for an age band, students already in that band who
  registered stay on the waitlist until you *release* them (toggle the age group on /
  release specific students). Releasing lets them choose classes and emails the family.
- **"If a student turns the right age by the time classes start, are they eligible?"**
  Today eligibility is evaluated against the configured cutoff date. Making eligibility
  "by first day of class" (so a child who turns 7 by the start date qualifies) is a
  small rule change — logged as deferred (age-cutoff = class-start).

---

## Deferred — logged for a future round (left open)

Grouped by area; each is a real request that's larger than a quick win.

**Billing/enrollment**
- Report: "how many more students can we accept by age" (open seats by age band).
- Waitlist: limit to 1 per hour per student (keeps enrollment numbers honest).
- Auto-promote the next waitlisted student when a seat frees (opt-in per class).

**Classes / catalog**
- Connect an Optio **course/quest to a class** and let **teachers edit** it.
- Non-class schedule items: "Other" bucket for Quest Learning Day, field-trip bundles,
  market credit, etc.
- Limit **Open Labs** to 2 per student unless they're in the Summit program.
- "Contact everyone enrolled to switch sections" before reopening registration.
- Multi-level sort (keep the primary sort, then sort by a secondary column).
- Per-row **closed-class highlight** in the list (there's a banner + "Open all" today).
- Class-update save shouldn't scroll back to the top with the toast.

**Bugs to investigate**
- **Supply-fee overwrite**: editing Open Art Studio set *tuition* to $35 instead of the
  *supply fee*. Needs repro against the class-edit + AI-editor write path.
- **AI schedule editor** not applying instructions reliably ("change supply fee to $35 on
  all 4 Open Art Studio classes" did nothing; adding a description didn't take). Needs a
  prompt/tool-call audit of `sis_schedule_ai_service`.

**Portals / people**
- **Family portals** (view like teacher portals; put forms/assessments on them; parents
  see kids' portfolios).
- Let staff (e.g. Kate) open the **family learning-app view** for CLP demos.
- **Family** tag in Staff + time tracking for your own kids' work hours.
- Remove graduates from a family.

**Directory** (privacy-sensitive — recommend as a setting, not a blind default flip)
- Make the family directory **opt-out** instead of opt-in, and move the control into
  Settings so it's harder to toggle accidentally. Recommend an org setting
  `directory_default = opt_in | opt_out` (default `opt_in` for safety) that iCreate can
  switch, rather than defaulting every family's contact info to shared.

**Calendar / comms**
- Calendar **view categories/audiences** (school-wide vs teacher vs admin) — partly
  addressed by the audiences work; extend to viewer-scoped calendars.
- Family-view school calendar as a **calendar grid**, not a list.
- Pin frequently-used message **groups** across the top (LMS side).

**Attendance**
- Daily **excused report** that links parent-submitted excuses to teacher-marked
  absences (so the campus coordinator sees excused-and-absent at a glance).
- Teacher portal: assume **present** unless marked absent; let admins/coordinators mark
  **excused** and have it show on the roster.
- Teacher portal **schedule view** (block schedule of when they teach).

**Forms / resources / onboarding**
- Assign form-review items to **specific people**.
- When a registration-form document is replaced, update it in **Resources** too.
- Secure **W-2 / background-check** upload (or keep on paper if not securely supportable).

**Misc**
- Personalize "Your school" copy to the org's name (e.g. "Let iCreate know…") using the
  org's configured name.
- Embeddable **HTML widgets** for the public site (class catalog + Tue/Thu schedule with
  live spots-left / waitlist).
- Discussion boards on some quests/classes.
- Make the Stripe secret-key section on Registration harder to edit accidentally and move
  it further down (it's only touched at initial setup).

---

_This triage reflects code state on `develop` as of 2026-07-27. "Shipped already"
items were verified by reading the current source, not assumed._
