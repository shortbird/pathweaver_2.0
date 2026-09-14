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
