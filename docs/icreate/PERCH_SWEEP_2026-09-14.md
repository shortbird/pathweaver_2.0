# Perch sweep, 2026-09-14

41 open iCreate / Optio tickets (39 `building`, 2 `received`). The Perch
dispatcher has been down since 2026-09-04, so nothing filed after that was
ever picked up by an agent, and nothing fixed by hand since then was reflected
back into Perch. The result: 24 of the 41 were already fixed on `main` and
deployed to production (release run 34856689308, 2026-09-14 14:36Z, deploy and
OTA jobs green) while still reading `building` to the client.

Method: grep every ticket id across `backend/`, `web/`, `mobile/` and the git
log before touching anything. Ticket ids are cited in code comments and commit
messages in this repository, so a `building` ticket with a hit is a fix that
shipped without a status update, not open work.

## Already shipped and deployed (24) -> `live` via `shipped.mjs`

| Ticket | Ask | Where it landed |
|---|---|---|
| 2af45fd2 | Teacher sees where each student goes next | e3bbad60, `TeacherClassPage` next_class |
| 910bde64 | Where do I add my phone number | `MyProfilePage` "Your phone number" |
| 0a10f2ae | Preview shows announcement not sent to that teacher | 0db05ac0, `resolve_preview_target` |
| 671305b1 | Sort the Assigned list | 2d8fb095, kind filter with counts |
| 75881cb7, ee40bfaa | Teacher Links loops to dashboard / not on portal | The item was an org-authored resource pointing at the console; office has since pinned five real links, which render on teacher, coordinator and admin homes (f922f593, 0db05ac0) |
| c7615777 | Quests aren't asking for evidence | 0db05ac0 (editor says so); 5af66544 closed the mobile parent shortcut |
| 45c7ced1 | Duplicate quests; total XP per quest | 0db05ac0; f922f593 "XP to finish" |
| 4da3680d | Duplicate tasks | 0db05ac0 |
| 04e30fca | "Marked fine" at bottom of class list | 0db05ac0 |
| 51efdb7c | Templates on their own tab | `TaskCenterPage` tabsFor |
| 1ff43737 | Full/closed classes missing from announcement class dropdown | Composer unified (fd5f13e1); class-targeted sends live in Messaging with every non-archived class |
| 42c4acde | CSV of who hasn't done the onboarding checklist | `/reports/checklist-completion` |
| f1787a98, 3e37d8b8 | Parents/students can't see class materials | 0987f74a; `/student/materials`, `/parent/students/<id>/materials` |
| a6d09acd | Email me when a task is assigned | `sis_forms_service` assignment email |
| e92b18ca | Links on My Tasks | `MyTasksPage` via `AnnouncementBody` |
| 22c43f7c | Parents can't see description / full / age range | ed055cac, schedule slots browsable when locked |
| dcc5f65c | Teacher-parent can't submit evidence for own kids | 404b419a |
| 1d0d41a9 | Hang Time shows 4am | 0bd8c373 |
| 32b2beb3 | CLP: same-time classes in one row | `clp/ScheduleGrid` |
| d48f2b63 | CLP: link to the class | `clp/ScheduleGrid` -> `/classes?class=` |
| e64c4999 | Block label on the day report | `reportsPage/BlockRosters` sticky header |
| eec3e51e | Edit a filed request | `StaffFormsPage` editing |

`shipped.mjs` only looks at the last 50 commits on `main` for the ticket id;
most of these are older than that window, so the runner passes
`--skip-deploy-check` after the verification above.

## Answered, no code change (9)

- fe76f719 -> live. Submissions per class exist (Progress tab -> student ->
  Submissions filtered by class). Evidence is per task and mandatory; the
  no-evidence completions were the mobile parent shortcut, closed 09-05.
- 7f40e795 (Gryffin, Optio client) -> live. "Nobody" on a class quest:
  finished students keep it, started students keep their work and it leaves
  the active list, untouched enrollments are deleted (`withdraw_students_from_quest`).
- 8669f16e -> live. Removing a quest from one class does not affect the other.
- 0754b5eb -> live. Product guidance: one quest per unit, XP to finish, build
  HS quests first then let teachers edit; offer to check credit totals.
- 4a8adbe2 -> live. Praise.
- 3bba85e1 -> triaged. Directory privacy: verified her household is not
  listed (`directory_opt_in=false`, `directory_opted_out=false`, org
  `directory_default_in=false`); no parent-facing endpoint returns another
  adult's email. The org's `feature_flags.email_reply_to` is
  `icreatecollab@gmail.com`, so every school email carries her address as
  Reply-To. Asked which address was used and whether to change the reply-to.
- f444d129 -> triaged. Paid invoices are locked by design
  (`update_invoice`); asked what she needed to change.
- d262941c -> triaged. Text on resources: org Resources page got a multi-line
  instructions box (ed055cac); quest/task instructions live on the task. A
  plain note row inside `sis_curriculum_materials` would need a migration
  (kind CHECK is `file|link`, `url NOT NULL`); asked whether that is what was
  meant before building it.
- 0f33cfc4 -> triaged. Event links are clickable (f922f593); pictures on
  events not built; asked where they'd expect them.

## Built this session (4) -> `ready_for_review`, awaiting release

| Ticket | Change | Files |
|---|---|---|
| 455ffaf6 | "View as student" on People > Everyone for org admins (backend `caller_may_masquerade` already allowed it; the UI was superadmin-only) | `sisRole.canViewAs`, `useSisOrg`, `RosterPage`, `rosterPageViewAs.test.jsx` |
| e40080a8 | "Withdraw from school" on the family record: every student archived (withdrawn, seats freed), guardians/record/history kept | `sis_person_service.withdraw_household`, `SchoolEnrollmentRepository`, `POST /api/sis/households/<id>/withdraw`, `FamilyDetailModal`, tests |
| 774e2fe2 | Resources (links/videos/files) on training quests, per quest and per saved task | `QuestDraftForm questId`, `StaffTrainingPage`, `questDraftResources.test.jsx` |
| edb43711 | "Enter my tasks as I wrote them" on the AI draft: drops the house style, one task per source item, verbatim titles/descriptions, cap 30 | `quest_ai_service.draft_quest_from_context(keep_wording)`, `quest_drafts.py`, `QuestAiDraftPanel`, tests |

## Blocked on the client (3) -> nudged, status unchanged

09255e75 (in/out button: three answers requested 08-19), 741af39f and
e6fb1f94 (teacher pay from attendance: rates requested 08-19 and 08-30).

## Skipped

8b0bdea5: `deleted_at` set by the client on 09-08 (the enrollment refusal
copy was fixed in 0db05ac0 regardless).

---

# Afternoon batch, 2026-09-14

Thirteen more tickets between 17:20Z and 18:27Z: twelve from iCreate (Molly and
Marika, one sitting) and one from Gryffin. All thirteen runs sat `queued`; the
dispatcher is still down. Worked by hand in one session.

## Built (10 tickets, one changeset)

| Ticket | Ask | What changed |
|---|---|---|
| 7ee545c4 | "Needs a reply says (22)" over a queue of 7 | The sender was looked up by matching `direct_messages.created_at` to `message_conversations.last_message_at`, two `now()` calls ~90 ms apart. 12 of 32 threads missed; every miss read as "needs a reply", and 6 empty threads counted too. `last_message_sender_id` is now a column written on send (migration `20260914173000`, backfilled); empty threads are in no pile but All. The Mine tab never had the annotation at all and now reads the same column. |
| 4ae1c6d1 | "Answered" holds threads the school sent and nobody answered | The pile is "Waiting on them": the last word was ours, whether a reply or an unanswered ask. "Seen" appears under our last message once they have opened it (`read_at`). |
| 5c858931 | A "resolve" button | "Mark handled" on the thread header, per side (`resolved_at_p1/p2`), shared across the office on the school tab. A newer message from the other side reopens it by itself. "Handled" is its own pile. |
| 73963487, c8affdb2 | Filter the roster report's class picker by day, time and age; a search; a working Clear | Search (name or teacher), day chips, a start-time select built from the classes' own times, an age box. Filters narrow what is shown, never what is ticked; "N selected · M not shown by the filters" says so. Select all ticks what is shown. Clear is there as soon as anything is ticked. |
| 5e553e23 | Family record > Schedule in day-and-time order | Both the list view and the enroll picker sort by first meeting day, then start time (`classLabel.byDayAndTime`). |
| c7d1f7a5 (b, c, d) | Reorder quests; reorder tasks after publish; resources on the master quest | Up/down arrows on the curriculum's quest list (the PUT already kept order). Up/down on preset tasks through a new `PUT .../tasks/order` (whole list, both the curriculum and class routes; `utils.template_tasks.reorder_template_tasks`), pushed to enrolled students by the existing resync. The curriculum's task editor now gets `questId`, so the per-task and quest-level resource panels render there; they were the same rows the whole time. |
| ac9bde84 (Gryffin) | Upload images into quests for the kids | The quest-level resources panel now sits on the class's quest row too (it was per task only). Images were always allowed; students see them at the top of the quest. |
| 28937c94 | Why keep families who left; their numbers are in reports | Emergency contacts, medications, allergies and the registration-answer sheets skip withdrawn and graduated students (`_reg_context`, `emergency_contacts_report`). The Families list hides a family whose every student has left behind "Show former families (N)"; a search still finds it. |
| 75037697 | "This still doesn't make sense how to permanently delete someone" | The dialog after Delete family now removes the people instead of sending the office to People > Everyone: `POST /api/sis/people/remove` (`routes/sis/people_removal.py`, `sis_person_service.remove_people`) deletes each account outright, or archives it when records depend on it, students before guardians, and reports which. |

Migration: `supabase/migrations/20260914173000_message_conversations_last_sender_resolved.sql`
must go through `migrate-prod.yml` BEFORE the code deploys and before local
verification (local reads prod). Until then every conversation list 400s on the
missing columns.

## Answered, awaiting a product call (3)

- **75c143fe** Task Center tabs as Requests / Tasks / Forms / Checklists /
  Documents. The tabs were exactly that until 2026-08-31, when neither
  iCreate's admin nor ours could say what did what, and they became Requests
  (what people send us) / Assigned (what we ask of people) / Templates /
  Documents. Her own note — "Requests seem like they can come from families and
  teachers, tasks seems like they are internal staff management?" — is the
  current split. Answer that; do not rebuild unless Tanner wants the per-noun
  tabs back.
- **d36dbb58** Announcements as group messaging. Group threads to staff exist
  (Messaging > New message, with presets: all teachers, one class's teachers,
  everyone teaching Thursday). Announcements are the board post with an
  optional notify + email. What is missing is a group message to *families* —
  "all kids in a certain class ages 15+ and their parents". That is a real
  feature (recipients endpoint is staff-only today); Tanner's call.
- **c7d1f7a5 (a)** A Quest library page under Operations. Every per-quest
  route is curriculum-scoped (`/curriculum/<cid>/quests/<qid>/...`), so a page
  listing quests on no curriculum has nothing to edit them through. A
  standalone library needs quest-scoped edit routes first. Not built; the
  three smaller asks in the same ticket are.

## Already there (1)

- **ceeeba85** Pick the columns on the roster report: the field picker has
  been under the report since 2026-08-19 ("Pick the columns after you run
  it"). Her next ticket (c8affdb2, 25 minutes later) says she found it.

## Not mine

The tree also carries another session's `bug_reports` ticket tracker
(migration `20260914170000_bug_reports_become_the_ticket_tracker.sql`, the
`tickets` skill) and a roles change in `routes/sis/__init__.py` /
`sis_service.py`. Nothing here touches those files; the batch-removal route is
its own blueprint for that reason.

## After verification (same day)

Steps 1-5 of the verification passed at :3000. Steps 6-7 could not be run on
Hearthwood: it is not an SIS org, so the family record is not where its admin
works. Two follow-ups, not tickets:

- **Withdraw from school on the web platform's organization page.** Schools
  without the SIS console had Remove (the account leaves the org; class seats
  and history left dangling) and nothing gentler. The People tab now has
  Withdraw / Reinstate on a student's Edit modal
  (`POST /api/admin/organizations/<org>/users/<id>/standing`,
  `routes/admin/org_member_standing.py`, `sis_person_service.set_student_standing`
  -- the roster's Archive), a "Withdrawn" badge, and a "Show withdrawn (N)"
  toggle; the org payload carries `enrollment_status` per user. Removing a
  whole family there is the existing bulk Remove: tick the parent and the
  children, Remove Selected.
- **/reports restructured.** One flat grid of fourteen cards became a grouped
  list on the left (Overview · Rosters & schedules · Health & safety ·
  Attendance · Registration · Money) and the picked report on the right: its
  description, its options, its sheet. A report with nothing to choose runs
  when picked. `?report=` in the URL. The page split into
  `reportsPage/catalog.js`, `ReportNav`, `RosterClassPicker`, `ReportTable`,
  `OverviewStats`; 983 -> 670 lines against the 1,000 cap.
