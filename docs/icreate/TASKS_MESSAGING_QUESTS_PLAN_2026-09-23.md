# iCreate meeting 2026-09-23 — build plan

Status: planned, not started. Owner answers recorded 2026-09-23. Build in a new
worktree on branch `icreate/tasks-messaging-quests` cut from `main` after the
b067c6c8/ea9756e3/ebfc9253 session commits. Nothing merges to `main` until the
owner verifies at localhost:3000.

Closes tickets: 046aac68 (tasks rework), bf8b754d, d93b24d2, 8ee000b6,
9a335881, 9b46c748 (messaging rework), plus the meeting notes. Supersedes the
create-form half of b067c6c8 (the universal form replaces `NewQuestPanel`).

## Decisions already made

| Topic | Decision |
|---|---|
| Scope | All orgs, not iCreate only |
| Requests | Gone as a concept. One table: everything is a task |
| Forms | Gone. Built-in and custom forms are removed. Families message the school instead |
| Family asks | Family messages the school inbox; office turns the message into a task for a staff member |
| Checklists | Become multi-step tasks, same abilities: upload, signature, approval, blocks access |
| Templates | Any task, one step or many, can be saved as a template |
| Recurring | Admin assigns to anyone (staff, parents, students); each occurrence is due that day and expires |
| Documents | My documents + Secure documents tabs move from Tasks to Library; secure stays HR-only |
| Quest form | One universal create+edit form everywhere the SIS makes a quest; opens as an inactive draft; drafts are never auto-deleted |
| Teacher quest edits | Teachers edit only quests they created, plus class settings (due, release, audience, XP if unlocked) |
| Substitutes | Roll-call record + automatic "covered by" flag + coordinator confirms + optional pre-marked sub |
| Pay from attendance | Separate project later; this build lays the session record it needs |

## Findings that shape the plan

- `sis_onboarding_assignments` must stay the task table: the signature hold
  (`utils/signature_hold.py`, `middleware/api_hold_gate.py` allow-list) is keyed
  on it. Rename in the UI, not in the schema.
- `sis_form_submissions` is read by: supply budget (`sis_supply_budget_service`),
  admin dashboard counts, coordinator dashboard `my_tasks`, teacher dashboard
  `recent_forms`, Schedule Builder add/drop, person-removal history counts,
  erasure column list, `sis_tasks_service` inbox. Every reader moves to tasks.
- Known breakage the merge must not carry over: non-admin assignees cannot work
  a request; parents are notified of comments they cannot read; family custom
  forms cannot be filed.
- School inbox is admin-only end to end; a per-thread grant is a pure backend
  check (no RLS change: inbox account is service-role only).
- Delivery channel today: push always, email only on the family composer.
- Read data mostly exists: `direct_messages.read_at`, `group_members.last_read_at`,
  `announcement_reads` + `announcement_read_stats` (no UI shows them).
- Four quest create paths (library, class, curriculum, training) and five
  editors. Training uses its own backend that drops `diploma_subjects` and
  defaults `is_required` false. Every path except training creates the quest
  active, so it shows in discovery for the whole school before assignment.
- Attendance: one row per student per day; `recorded_by` overwritten on each
  save; no session record; no substitute; `meeting_id` never filled. iCreate
  last 30 days: 334 class-days, 25 rolls by a non-assigned person (21 by three
  teachers of other classes, 4 by coordinators).
- Migration history has drifted (memory: migration-history-drifted-again).
  Run `migration repair` before any `migrate-prod.yml` apply for this branch.

## Phases

All phases land on one branch. Order is dependency order; P1 and P6/P7/P8 are
independent and can run in parallel sub-sessions.

### P1 — Task model (one table)

Migration on `sis_onboarding_assignments`:
- `kind`: add `task`; convert `checklist` rows to `task` (keep `signature_request`).
- `audience`: add `student`.
- Columns: `priority`, `due_date` (row level), `source_conversation_id`,
  `source_group_id`, `source_message_id`, `action` (`do` | `reply`),
  `schedule_id`, `occurrence_date`, `expires_at`.
- `status`: add `expired`; keep `in_progress` / `complete`.
- `batch_id` set on every assign (today only signature sends set it).
- New `sis_task_comments` (task_id, author_id, body, created_at), readable by
  assignee, assigner, and for family tasks the family.

Backend: `sis_onboarding_service.assign_task` writes batch, source, action,
priority; one `sis_task_service` facade for list/detail/comment/complete so the
routes stop splitting by kind. Staff, parent and student routes all get detail
+ comments. Templates: "save as template" writes `sis_onboarding_templates` from
any task.

### P2 — Retire requests and forms

- Data migration: every `sis_form_submissions` row becomes a task (assignee =
  `assigned_to`, assigner = submitter, body/payload into description, status
  mapped: resolved → complete, others → in_progress). `sis_form_comments` →
  `sis_task_comments`. Old tables stay read-only one release, dropped later.
- Custom `sis_form_templates` (3 at iCreate) become task templates: each
  question becomes a step.
- Remove: `sis_forms_service` submit paths, `parent_forms.py`, teacher
  `/forms`, admin `/forms*`, `/form-templates*`, `/form-routing`, FormBuilder,
  PaperworkTemplatesManager form half, AdminQueue, FormRoutingModal,
  `hidden_form_types`, `form_routing`, the `forms` module key (registry, route
  gate, `sisModules.js`), the family "Your requests" half.
- Rewire readers: dashboards count open/overdue tasks; coordinator `my_tasks`
  and teacher dashboard read tasks; person-removal counts and erasure list
  include the new columns/table.
- Schedule Builder add/drop: becomes a prefilled message to the school inbox.
- Supply budget: see open question 1.

### P3 — Tasks UI

- Tasks page tabs: My tasks, Assigned, Templates. Remove Requests tab, New
  request, New form template, and the word "checklist".
- Assigned: one card per batch with done/total; opens a per-person list with
  status, finished time, and per-step state.
- Assign dialog: steps, upload/signature/approval per step, audience incl.
  students and "Pick a class", due date, priority, "Save as template",
  template picker, and the recurrence section (P4).
- Task detail: steps, comments, and for `reply` tasks an "Open the thread" button.
- Family `/family/forms`: shows only their tasks and documents to sign (name:
  open question 3). Student task list on web learning app and mobile (mobile
  needs an OTA; mobile has no task screen today).
- Library gets a Documents panel holding My documents + Secure documents
  (HR-only). `/tasks?tab=secure` redirects.

### P4 — Recurring tasks

- `sis_task_schedules`: org, template/items, title, recipients (people and/or
  class), `days_of_week`, start/end date, created_by, active.
- Cron (existing dispatcher) each morning in org timezone creates that day's
  rows (`schedule_id`, `occurrence_date`, `expires_at` = end of day); a second
  pass marks unfinished past rows `expired`. Idempotent on
  (schedule_id, user_id, occurrence_date). Note: cron auto-deploys ahead of the
  CI-gated backend, so the route must be live before the dispatch call ships.
- Assigned view: date × person grid for a schedule. Edit/pause/end a schedule.

### P5 — Messaging rework

1. One Compose (replaces New message, StaffComposeModal, FamilyAudiencePicker
   split): recipients from any mix of staff, families, students; filters by
   role (multi-select), class, age; class chips split into teacher, aide,
   students, families (`class_membership` split). Group thread vs separately.
   Channels: Optio message always; push and email toggles
   (`_notify_recipient` gets a skip-push flag; email reuses
   `announcement_email_service`).
2. New `message_sends` + `message_send_recipients` to record a bulk send.
3. Announcements leave `/inbox`; live only on Community; audience becomes
   multi-role (`sis_announcements.audience` → array). Community must be
   reachable for every org that posts announcements (open question 2). Fix the
   three links to `/inbox?tab=announcements`.
4. Read receipts: DM "Seen" with time; group "Seen by N" from
   `last_read_at`; bulk send "Read by N of M" with the list; announcement read
   counts surfaced; school-inbox reads record which staff member opened it.
5. Message → task: thread and message menu "Make a task": assignee (any staff),
   action (reply / do), due, priority, note. Creates a task with source ids.
   New `school_thread_grants` (conversation or group, user, task_id, expires
   when the task completes); school-inbox routes accept ADMIN_ROLES or a grant.
   A non-admin gets a single-thread view in the console. Replies go out as the
   school with `sent_by_user_id` = the teacher, shown as "Name for School"
   (open question 4).
6. Family requests: parents use "Message the school" (web and mobile already
   have it). Remove the Forms request entry points.

### P6 — Universal quest form

- One `QuestEditor` component with a `context` prop: `library`, `class`,
  `curriculum`, `training`. Shared body: title, description, header image,
  credit switch, tasks (with required, XP, pillar, subjects, per-task
  resources), quest resources, XP to finish, teachers-may-change-XP (admin
  only), allow custom tasks, AI draft. Context section: curriculum pick;
  class due/release/audience; training category/required/auto-assign/audience.
- Create = insert quest `is_active=false` when the form opens (so files and
  task resources work at once), Publish flips it active and runs the context's
  attach step. Drafts are listed ("Drafts") and never auto-deleted.
- Backend: one create path (`create_org_quest`) for all four; training moves
  onto it (fixes subjects + required defaults). Context attach steps stay in
  their routes. `created_by` on quests (verify column) drives the teacher rule:
  a teacher edits only quests they created; class settings always.
- Replace `NewQuestPanel`, `QuestEditModal`, `QuestInfoEditor`, curriculum
  `QuestDetail` edit, and TrainingForm quest fields.

### P7 — Attendance: who took the roll, substitutes

- `sis_class_sessions`: org, class, date, meeting_id, taken_by (first saver),
  taken_at, substitute_id, sub_status (`none` | `flagged` | `confirmed_sub` |
  `teacher_present` | `other`), confirmed_by/at, planned_by. Unique
  (class_id, date, meeting_id).
- Attendance save upserts the session; first saver is kept. Flag when
  taken_by is not an assigned teacher.
- Pre-marked sub: grants that day's roster access (`class_scope` checks the
  session) and gets the "take attendance" reminder.
- Coordinator dashboard "Teachers to check": classes started N minutes ago
  with no roll; flagged sessions with confirm buttons. Class page shows "Roll
  taken by X at 9:04".
- Fix: `student_day` reads `notes`, column is `note`.

### P8 — Verification and ship

- Full suites: backend, web, mobile. Ratchets updated in RATCHETS.md where a
  number legitimately moves (forms code deleted lowers several).
- Owner walk-through at localhost:3000 per phase.
- Migrations: `migration repair` first, then `migrate-prod.yml` before deploy.
- Mobile OTA for the student task list.
- Ticket notes on each closed ticket; reporter drafts wait on deploy.

## Answers to the open questions (owner, 2026-09-23)

1. Supply budget: past spend stays read-only. No new logging.
2. Announcements: live only on Community. The Community toggle stays as it is;
   an org that wants announcements turns Community on.
3. Family `/family/forms` is renamed "To do".
4. Reply tasks: reply as the school with the teacher's name shown.
5. Recurring expiry: end of the day in the org timezone.
