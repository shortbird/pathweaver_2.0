# What each role can do in the SIS

**Last verified:** 2026-09-18 · **Generated from:** `backend/scripts/dump_role_matrix.py`

iCreate asked for admin-defined roles: create a role, tick what it can see, assign
people to it. The answer is no, and this document is the reason it can be no.

The seven roles are load-bearing in places a settings screen cannot reach — two
Postgres CHECK constraints on `users`, a cross-language conformance fixture
(`shared/roleCases.json`) pinned by three test suites, the tier tuples in
`backend/utils/sis_roles.py`, and about fifteen call sites that ask "is this
person an admin" in slightly different words. Replacing that enum with per-org
rows is an auth-layer rewrite, and the failure mode of getting it wrong is a
parent seeing another family's child.

But the request underneath it was real and was not about configurability. Nobody
could **say** what a role could do. The answer lived in thirty-odd route files'
worth of decorators, so every conversation about who should see what started by
guessing. This document is that answer, and
`backend/tests/unit/test_role_matrix_doc.py` fails the build when it stops
matching the code.

---

## The seven roles

| Role | What it is |
|---|---|
| `superadmin` | Optio staff. Everything, in every school. |
| `org_admin` | Runs the school. The only role that sees the money and the HR store. Also holds everything `advisor` holds — the teacher portal (My Classes, My Schedule, My Time, My Profile), check-ins, notes, transcripts — because at a microschool the admin is the teacher (Horizon, 2026-09-11). |
| `campus_coordinator` | Runs the campus. Everything `org_admin` has **minus the money and minus HR**. Org-only — it can never appear in `users.role`. |
| `advisor` | A teacher. Their own classes, and the school-wide things everyone shares. |
| `parent` | Their own children. Never a roster, never another family. |
| `student` | Their own work. |
| `observer` | A view-only follower of specific students. **Has no SIS surface at all** — no route, no dashboard. Learning-app only. |

A person can hold several. `users.org_roles` is an array and the answer is the
union: at iCreate most teachers are also parents, and the checks that read
`org_role` alone rather than every held role have been a recurring source of
bugs (a coordinator locked out of her own children's accounts; a
teacher-and-parent refused a group chat).

## The four tiers

Almost every route names one of the tuples from `backend/utils/sis_roles.py`
rather than listing roles. Import them; never retype a role tuple.

| Tier | Members | Use for |
|---|---|---|
| `STAFF_ROLES` | admin, coordinator, advisor, superadmin | Anything staff touch. Class-scoped downstream for teachers. |
| `ADMIN_ROLES` | admin, coordinator, superadmin | The front office: people, classes, registration, attendance, paperwork. |
| `FINANCE_ROLES` | admin, superadmin | **The money.** Billing, tuition, Stripe, pay rates. |
| `HR_ROLES` | admin, superadmin | The secure-documents store: contracts, background checks, custody and medical files. |
| `ROLE_GRANT_ROLES` | admin, superadmin | Granting `org_admin`, or changing anybody who holds it. Not a route tier since 2026-09-14 — the service asks it per call. |
| `MEMBER_ROLES` | everyone with a seat: student, parent, observer, advisor, coordinator, admin, superadmin | The family-facing reads (`community.py`'s feed). The route resolves the org through membership; the tuple only says who may ask. |
| `ADULT_ROLES` | parent, advisor, coordinator, admin, superadmin | Family-authored writes a student may not make (`community.py`'s carpool board). |

`FINANCE_ROLES`, `HR_ROLES` and `ROLE_GRANT_ROLES` have identical membership and
are deliberately three names: they answer three different questions, and if the
coordinator tier ever gains one it should not silently gain the others.

## What a campus coordinator cannot do

The whole role is a subtraction, so this is the short list that matters:

- **Money.** `billing.py` and `tuition.py` in full; the revenue rows in
  `reports.py`; pay rates in `staff_admin.py`. Pay fields are
  also stripped per-field from records they legitimately read — an employment
  profile carries the emergency contact they need and the hourly rate they do
  not (`sis_staff_service.PAY_FIELDS`).
- **The HR store.** All of `secure_documents.py`.
- **The admin role.** They cannot grant `org_admin` — by role change,
  account creation, invitation or standing link — and cannot change the role
  of anybody who holds it. Every role below it (coordinator, teacher, parent,
  student, observer) is theirs to give and take, on both role endpoints
  (`PUT /staff/<id>/roles`, `PATCH /users/<id>/role`) and on the create and
  invite routes (`sis_service.caller_may_grant`). Until 2026-09-14 they could
  change no role at all and create no staff account; the ask was "can change
  roles from CC down".

Everything else the front office does, they do.

## Where each area is gated

Read off the decorators on 2026-09-10. Regenerate with
`python backend/scripts/dump_role_matrix.py`.

### Front office — `ADMIN_ROLES`

`__init__.py` (people, households, roster), `registration.py`, `waitlist.py`,
`clp.py`, `coordinator.py`, `messaging.py`, `prior_learning.py`,
`schedule_ai.py`, `schedule_sync.py`, `reports.py`, `staff_admin.py`,
`settings.py` (`PATCH /settings`, the one writer of the school's settings; the
finance paths inside the blob are still held for a coordinator by
`org_finance_flags`).

`reports.py` and `staff_admin.py` also carry `FINANCE_ROLES` on their money
routes. `__init__.py` carried `ROLE_GRANT_ROLES` on `PUT /staff/<id>/roles`
until 2026-09-14; that route is `ADMIN_ROLES` now and the `org_admin`
boundary is enforced inside `sis_service.set_staff_roles` against the caller.

### Everyone on staff — `STAFF_ROLES`

`staff_portal.py`, `submissions.py`, `engagement.py`, `goals.py`,
`student_records.py`, `quest_drafts.py`, `gradebook.py`.

`tasks.py` is three tiers in one file (2026-09-24): `STAFF_ROLES` for the
staff member's own list, `ADMIN_ROLES` for assigning, the Assigned view and
recurring schedules, and `@require_auth` + the task itself for one task, its
steps and its comments -- `sis_tasks_service.may_see_task` admits the
assignee, whoever assigned it, and an admin of the task's own school. That is
how a teacher, a parent or a student works a task assigned to them.

Mixed tiers, where a teacher reads and the office writes: `attendance.py`,
`catalog.py`, `curriculum.py`, `events.py`, `resources.py`,
`staff_training.py`, `community.py`.

**Teachers are class-scoped, not org-scoped**, and that scoping is a MANUAL
`sis_service.class_scope()` call in each handler, counted by
`tests/unit/test_class_scope_coverage.py`. Forgetting it reads the whole school.

`gradebook.py` is retired from the UI (2026-07-28) and kept only so its score
data survives.

### The money — `FINANCE_ROLES`

`billing.py`, `tuition.py`, and the marked routes in `reports.py` and
`staff_admin.py`.

### HR — `HR_ROLES`

`secure_documents.py`, reachable from the Documents area of the Library.

### Gated some other way (no `@require_role`)

These authorize per-record rather than per-role, which is usually stricter:

| File | Gate |
|---|---|
| `class_materials.py`, `class_quests.py`, `class_quest_students.py` | Per-class moderator: org admin, primary instructor, named assistant, or an active `class_advisors` row (`class_quests._authorize`, which `class_quest_students` imports). Plus a family read for guardians. The student-specific routes in `class_quest_students.py` (one student's work, reminders, adding or removing a student from a quest) also require a teacher or org-staff relationship to that student. |
| `curriculum_materials.py` | A teacher of any class on the curriculum. **See the open question below.** |
| `quest_resources.py` | An org admin of the quest's org, or a teacher of a class the quest is attached to. |
| `parent.py`, `parent_prior_learning.py` | The family relationship, checked inside `sis_parent_service`. |
| `school.py`, `signature_request_views.py` | Membership, or a signed token. |
| `student_training.py` | Self-scoped to the caller. They must hold the student role at their own school (`sis_training_service._student_org`), and a done mark only lands on a student-audience training link of that school. Anyone else gets an empty list and a 404. |
| `portal_views.py` | No routes of its own. The bodies of the parent portal (`parent.py`) and the teacher portal (`staff_portal.py`) -- onboarding, uploads, document links, tasks -- mounted once each under those files' own gates. |
| `pay.py` | A token in the URL — no session at all. |
| `internal.py` | The seven cron sweeps: the `X-Cron-Secret` header, or a signed-in superadmin triggering one by hand. Not org-scoped — a sweep covers every org and the service filters per org. |

## Parents

There is no `PARENT_ROLES` tuple, and there should not be: a parent's access is
never "parents may read this", it is "this parent may read this child". That is
`@require_relationship_to('student_id', allow=('parent', ...))`, and the
predicate behind `parent` is `utils.portfolio_access.is_parent_of`.

**One definition, three links** (2026-09-10): `users.managed_by_parent_id`, an
approved `parent_student_links` row, or a guardian row in `household_members` —
the last being what the SIS registration funnel writes. Before they were
unified, a guardian's capabilities depended on which code path had created the
child's account: the same parent could pay tuition and pick classes, and got a
403 from that child's dashboard. `tests/unit/test_one_definition_of_parent.py`
keeps the definition from being re-inlined.

Two things stay narrower than "any guardian":

- **`is_dependent = True`** for acting-as, delete and promote. A student with
  their own login is not impersonable by anyone.
- **`owner_only`** for delete, promote and add-login. Any guardian may act FOR a
  child; only the guardian who created the account may end it or give it
  credentials.

## Observers

No SIS route, no SIS dashboard, no nav entry. An observer follows specific
students in the learning app and can comment on their work. They appear in
`RoleViewSwitcher`, `roleCases.json` and one literal tuple in `community.py`,
and nowhere else in this console. That is deliberate — the SIS is the school's
operational record, and an observer is not part of the school.

## Open question for Tanner

`curriculum_materials.py` has no role gate: a teacher of **any** class on a
curriculum can add files, add links, and flip `visible_to_students` on materials
inherited by **every** section that shares it. That is probably fine at iCreate,
where a curriculum has one owner. It is worth a decision before a school runs
six sections of the same course with six teachers.

## Keeping this true

`backend/tests/unit/test_role_matrix_doc.py` compares this document against the
generated matrix and fails when a file changes tier or loses its gate. When it
fails: run `python backend/scripts/dump_role_matrix.py`, decide whether the code
or the document is wrong, and fix that one.
