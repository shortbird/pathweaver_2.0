# SIS simplification: one console for every school

Started 2026-10-08. A living document: every session that works on this adds to
the log at the bottom and updates the tables in place. Follows
[MICROSCHOOL_FIRST_PLAN.md](../MICROSCHOOL_FIRST_PLAN.md), which gave new
schools a starter set of modules and the org-admin Features card.

## Why

The SIS console was built for iCreate first. Most of its pages, texts and
dashboard numbers still assume a school that registers families, bills
tuition, runs classes on a timetable and holds CLP meetings. A microschool like
Apogee Cache Valley does none of that through Optio, and the console shows it
all anyway, or shows text written for iCreate's process.

The goal is a console where a school sees only the blocks it has turned on, and
nothing else on any page refers to a block it has turned off.

## The two rules

1. **The sidebar is a function of the modules.** A nav item shows when its
   module is on for the org (and the reader's role allows it). No item has a
   bespoke switch outside the module system. Today four do: `goalsMode`,
   `communityMode`, `priorLearningMode`, `clpMode`
   (web/src/pages/sis/sisNavVisibility.js). Each should become a plain module
   check.
2. **A module that is off leaves no trace.** Text, dashboard tiles and cards,
   quick actions, links, empty-state hints, search entries and family-side
   pages that belong to an off module are hidden. This applies on every page,
   not only the page the module owns.

A third rule follows from the second: **text is generic.** Copy that describes
one school's process ("Parents set goals from their Goal Setting page after
registering") is either rewritten so it is true at any school, or shown only
when the module that makes it true is on.

## Pilot school: Apogee Cache Valley

Org `53ff61f2-2635-477f-9934-be27a320359d`, owner Mandie Gochnour (org_admin),
coach David Nilson (advisor). Montessori-style microschool, about 43 students.
Context: memory files apogee-cache-valley-weekly-goals, bloomy-sync-2026-10-05,
apogee-points-2026-10-08.

### Target sidebar (Tanner, 2026-10-08)

| Item | Notes |
|---|---|
| Dashboard | Shows data from active modules only. |
| People | |
| Prior Learning | |
| Goals | Weekly Goals is merged into Goals. Generic text, not iCreate's. |
| Points | |
| Bounties | |
| Bloomy | |
| Operations section | Messaging only. |
| Settings | |
| My Profile | |

### Current sidebar (measured 2026-10-08, org admin)

Modules on: ai, billing, bloomy, bounties, bounty_management, classes, clp,
credits, friends, goals, individual_work, journal, messaging, observer, points,
portfolio, prior_learning, quests, registration, reports, resources, sis,
student_chat, submissions, tasks, teaching, training, transcripts,
weekly_goals, xp.
Modules off: attendance, calendar, catalog, community, course_builder, courses,
curriculum, kiosk, onboarding.

| Shown now | In target? | How it would go |
|---|---|---|
| Dashboard | yes | |
| People | yes | |
| Classes | **no** | turn off `classes` (decision 1) |
| Prior Learning | yes | |
| Goals | yes | absorbs Weekly Goals |
| Weekly Goals | **no, merged** | becomes a tab or section of Goals |
| Points | yes | |
| Bounties | yes | |
| Bloomy | yes | |
| Tasks | **no** | turn off `tasks` |
| Registration | **no** | turn off `registration` (and `billing`, which requires it) |
| Reports | **no** | turn off `reports` |
| Library | **no** | turn off `resources`, `training`, `secure_documents` (the page hides when all its tabs' modules are off) |
| Billing | **no** | turn off `billing` |
| Messaging | yes | the only Operations item |
| Settings | yes | |
| My Profile | yes | |

CLP is already hidden: `clp` is on in the module set, but `clpMode` also needs
`sis_settings.clp_enabled`, which Apogee does not have. The module itself
should be off, so the rule-1 cleanup does not show it.

## Findings

### Dashboard (web/src/pages/sis/SisDashboard.jsx)

Already gated on modules: the attention tiles (attendance, tasks,
registration, goals, prior learning), the quick actions, Teachers to check
(attendance), the Money card (billing).

Correction (2026-10-08, while building phase 4): Today's classes, Leaving
soon and Coming up were already gated on the backend (classes, classes,
calendar); only the page lacked the second filter. What was really ungated:
the Noticeboard (pins are Resources rows), the Enrolled stat (registration),
and Goals to review, which counts the parents' goal setting. Families,
Students not in a family and Add a family are People, which every school has,
so they stay.

Missing for the active modules: nothing on the dashboard says anything about
weekly goals (students without goals this week, check-ins not done), bounties
(claims to review), points, or Bloomy (students with no Bloomy work this week).
"Shows data from active modules" means adding these as well as hiding the
rest. The backend dashboard payload should own the gating, with the page
filtering a second time as it already does for tiles.

### Goals (web/src/pages/sis/GoalsReviewPage.jsx, WeeklyGoalsPage.jsx)

- Goals today is the iCreate-shaped parent flow: a parent sets a direction and
  year goals per subject after registering, and staff review them in a family
  meeting. Its empty state says "No family goals yet. Parents set goals from
  their Goal Setting page after registering."
- Weekly Goals is Apogee's coach flow (Monday goals, Thursday check-in,
  freedom), with year goals per subject that staff can edit
  (PUT /api/sis/goals/students/<id>/year) and that the parent flow also writes.
- Merge: one Goals page. Weekly goals (when `weekly_goals` is on) and family
  goals (when the parent flow is on) are views of the same student's goals.
  The empty-state text says only what is true for the school: a school
  without the parent flow never reads about parents setting goals.

### Text and references (to inventory)

Start the inventory here and add to it. Search terms that find iCreate-shaped
copy: "CLP", "registering", "family meeting", "tuition", "enroll",
"Goal Setting", "funnel", "waitlist", "iCreate".

## New schools start minimal, and see everything they could turn on

Tanner, 2026-10-08: a new organization starts with few modules on, so the
console is not overwhelming, but it can see every option available to it.

What exists (MICROSCHOOL_FIRST_PLAN parts 1 and 3):

- `feature_flags.module_baseline = 'starter'` on every new org.
  `STARTER_OFF` (backend/modules/registry.py) turns off registration, catalog,
  billing, tasks, onboarding, secure_documents, clp, resources, training. It
  leaves on classes, attendance, submissions, curriculum, calendar, reports.
- The Settings "Features" card (backend/services/school_features_service.py)
  lets an org admin switch modules, but only the ones in `FEATURES`. The
  `SUPERADMIN_ONLY` modules (ai, credits, transcripts, prior_learning,
  course_builder, bloomy, kiosk, sis) and `NOT_HERE` (student_chat, goals, clp)
  are not listed, so a school never learns they exist.

What changes:

- The starter baseline becomes the Apogee shape (decision 2): off also
  classes, attendance, calendar, curriculum, reports, submissions-as-a-page
  (see the individual students module). On: people, goals and weekly goals,
  individual students, messaging, settings. Points, bounties and prior
  learning are listed but off.
- The Features card lists every module, grouped, with one plain sentence
  each. A module the school can switch has a switch. A module only Optio
  turns on (Bloomy needs a key, prior learning is Optio Academy's review,
  credits and transcripts are certified) shows as available with "Ask Optio
  to turn this on", which files a ticket (bug_reports, the `tickets` skill)
  instead of a switch.
- A plain way in from the console: the sidebar ends with "Add features",
  which opens the Features card. A new school sees a short sidebar and one
  place that shows the rest.

## Decisions (Tanner, 2026-10-08)

1. **Classes off at Apogee, and individual work becomes its own module.**
   Some schools run classes; some, like Apogee, work with each student one at
   a time. `individual_work` already exists as a module (commit 8a375fd47,
   2026-10-07: assign a quest to one student with a due date, write a quest or
   tasks for just them, private notes, a student page at /student-work/<id>).
   Its only way in is the Students tab on the Classes page, and the
   Submissions inbox is also a Classes tab. With `classes` off, both vanish.
   So: `individual_work` gets its own sidebar item and list page ("Students"),
   independent of `classes`, and the student page carries that student's
   submissions to review. The Classes page keeps classes only. Check that
   nothing in student_work.py, the submissions inbox or the quest editor's
   'student' draft context depends on the `classes` module gate.
2. **The target sidebar is the new default for all microschools**, through
   the starter baseline above. Existing orgs keep their modules; Apogee's are
   set by hand.
3. **Goals: tabs, plus a page on the student's individual view.** The Goals
   page has tabs (This week, Year goals, Family goals), each shown only when
   its module is on. The individual student page (decision 1) gets a Goals
   section with that student's weekly and year goals.

### Answers before the full build (Tanner, 2026-10-08)

4. **The inbox shows all the work** at a school with `individual_work` on:
   every quest task any current student turns in, not only class work and
   quests given by name.
5. **All staff see it**, as on the Students page.
6. **Apogee's modules:** approved to turn off classes, tasks, registration,
   billing, reports, resources, training, secure_documents and clp.
7. **New schools only** get the smaller starting set. Existing schools keep
   their modules and use the Features card.
8. **"Ask Optio"** on the Features card files a ticket (bug_reports) the
   school can follow. No email.

## Plan

Each phase is one sitting and ends with a localhost check by Tanner.

1. **Individual students as its own page.** Sidebar item "Students" for
   `individual_work`; list page (the StudentsPanel moved out of Classes); the
   student page gains Submissions and Goals sections; Classes loses the
   Students tab. Verify every `individual_work` route works with `classes`
   off.
2. **Rule 1.** Replace `goalsMode`, `communityMode`, `priorLearningMode`,
   `clpMode` with plain module checks; `clp` off where `clp_enabled` is not
   set (data). Tests: sisNavVisibility, sisSearchIndex.
3. **Goals merge** with tabs and generic text; weekly goals moves under
   Goals; /weekly-goals redirects to its tab.
4. **Dashboard by module.** Gate every card, tile, stat and link (backend
   payload first, page second); add tiles for weekly goals, bounties to
   review, points and Bloomy.
5. **Operations = Messaging** for Apogee falls out of the module changes;
   check no other item is ungated.
6. **Starter baseline and Features card.** New STARTER_OFF; Features card
   lists every module, with "Ask Optio" for the ones a school cannot switch;
   "Add features" in the sidebar. Tests: test_module_registry,
   test_school_features.
7. **Apogee data.** Turn off classes, tasks, registration, billing, reports,
   resources, training, secure_documents and clp (statement shown and
   approved first).
8. **Rule 2 everywhere else.** Work through the text inventory page by page.

## What was built (2026-10-08, all phases)

1. **Students** page for `individual_work` (phase 1, committed e3cd3d997).
   The inbox now holds ALL of a school's student work when `individual_work`
   is on (decision 4): `routes/sis/submissions._inbox` is the one scope rule,
   shared with the dashboard's `new_count`.
2. **Rule 1.** `goalsMode`, `communityMode`, `priorLearningMode`, `clpMode` are
   gone from the sidebar; each item follows its module. CLP is an opt-in
   module on its own legacy source `clp_enabled` (only iCreate has it), so
   `isClpEnabled` is the module check.
3. **Goals** is one page (`GoalsPage`): This week and Year goals (weekly_goals),
   Family goals (goals). /weekly-goals redirects. Year goals save on the
   weekly goals door (PUT /api/sis/weekly-goals/students/<id>/year, shared with
   the goals blueprint's write). The family goals empty text no longer says
   "after registering".
4. **Dashboard** queues for the microschool blocks: Work to review, No goals
   this week, Check-ins to do (from Thursday), Bounties to review, No Bloomy
   work this week, Points given this week. Noticeboard and Enrolled gated.
5. **Operations = Messaging** at Apogee follows from step 7 (sidebar test
   `components/sis/sisSidebar.test.jsx` holds the exact list).
6. **Microschool baseline** (`MICROSCHOOL_OFF` / `MICROSCHOOL_ON` in
   modules/registry.py) for every org created from now; 'starter' orgs keep
   theirs. The Features card lists every option; what only Optio turns on has
   "Ask Optio" (POST /api/school-features/request, one open ticket per school
   and feature, no email). "Add features" at the foot of the sidebar.
7. **Apogee data** applied in production 2026-10-08 14:45 UTC: classes, tasks,
   registration, billing, reports, resources, training, secure_documents and
   clp set false through modules.toggle.apply_changes (hidden_modules kept in
   step). Audit row 3db89115 (admin_audit_logs). Until the release ships,
   production's old console has no Classes page, which is where Students and
   Submissions lived; one statement turns classes back on if needed.
8. **Rule 2 sweep:** the family record's Billing and Registration tabs,
   registration hold, funding source and directory row follow their modules;
   pins and the staff library follow resources on every dashboard; All class
   chats follows classes.

### Still to inventory (rule 2)

- The Settings "School" card (SisOrgSettings): MICROSCHOOL_FIRST_PLAN part 2
  gated its fields, but read it again with Apogee's module set.
- The family side (learning app) school page and cards: checked only for the
  new Points and Weekly Goals cards.
- Mobile: no SIS console, but its school screens read the same modules.
- Copy that names iCreate's process on pages a microschool can open: search
  "CLP", "registering", "family meeting", "tuition", "UFA".

## Log

- 2026-10-08: **phases 2-8 built** (uncommitted until Tanner's localhost
  check), Apogee's modules turned off in production. See "What was built".
- 2026-10-08: **phase 1 built** (uncommitted until Tanner's localhost check).
  Students is its own page (/students, sidebar item for `individual_work`)
  with two tabs, Students and Submissions; Classes lost its Students tab
  (/classes?tab=students redirects). The student page shows their work
  waiting for review (GET /api/sis/submissions?student_id=, new, narrows the
  caller's scope only) and their goals (this week, year goals; the weekly
  goals history now returns `year_goals`). /submissions goes to Students when
  classes is off. The inbox drops its class filter and class list request when
  classes is off. Checked: every `individual_work` route works with
  `classes` off (student_work.py, quest editor drafts, assignable quests).
  **Open for Tanner:** the inbox lists only class work and quests given to a
  student by name. Quests a student picked up on their own (and Bloomy tasks)
  never reach it, which at Apogee is most of the work. Decide whether a
  school with `individual_work` on reviews all of its students' quest work.
- 2026-10-08: decisions 1-3 and the new-schools requirement recorded; plan
  rewritten into eight phases. Nothing built yet. The points work (uncommitted,
  waiting on Tanner's localhost check) touches SisSidebar.jsx, registry.py and
  moduleKeys.json, so commit it before phase 1 starts.
- 2026-10-08: document started. Apogee's target sidebar from Tanner; current
  state measured; dashboard and Goals findings written. Points module built
  and live in prod data (migration applied, `modules.points` on); code
  uncommitted until Tanner checks it at localhost.
