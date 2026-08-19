# iCreate backlog — consolidated plan

**Date**: 2026-08-18
**Source**: 23 open Perch tickets for client `iCreate`, verified against `main` as of this date.
**Companion**: [PRESENCE_AND_PAY_DISCUSSION_2026-08-18.md](PRESENCE_AND_PAY_DISCUSSION_2026-08-18.md) —
the client-facing agenda for the two Phase 4 features.

> Perch ticket *briefs* are first-pass analyses from a cheap model that only saw the
> file tree. Several pointed at the wrong subsystem entirely. Where this plan and a
> brief disagree, this plan reflects the code as read on 2026-08-18.

## Phase 0 — close out work that already exists

| Ticket | State |
|---|---|
| `47d53200` coordinators can't assign classrooms | Fixed on `main` by `99aa4ef8`. Verify on prod, mark shipped. |
| `dbfe0f0f` auto-drop sibling-section waitlists | PR #92, reviewer "ship", stalled on a Playwright timeout in staging verify. |
| `0df0e616` duplicate/reorder onboarding templates | PR #94, same stall. |
| `b0818709` quest creator | 2 of 7 complaints already fixed by `4ec791c5`. |

The brief for `47d53200` blamed role tuples in `backend/routes/classes/crud.py`. Wrong stack —
the SIS pages use `backend/routes/sis/catalog.py`, where `/schedule-settings` is `STAFF_ROLES`
and the class PATCH is `ADMIN_ROLES`, both of which already include `campus_coordinator`.

**Before merging PR #92**: the parent-accept path `respond_to_offer`
(`sis_waitlist_service.py:490-503`) creates the enrollment without calling
`clear_entry_for_enrollment` at all. If the PR only covers the staff-enroll path in
`catalog.py`, a parent claiming an offered seat still leaves sibling entries live.

**Before merging PR #94**: `_clean_items` (`sis_onboarding_service.py:57`) regenerates item
`key` from array index when missing, and documents and signatures are looked up by
`item.key` (`update_item`, `:715`). A reorder or duplicate that drops keys silently remaps
them. Needs a key-preservation test.

## Phase 1 — small fixes with verified root causes

### `20602da1` — "Let people add their own tasks" is enforced nowhere

`backend/routes/quest/detail.py:37-46` has an explicit column list that omits
`allow_custom_tasks`. The frontend gate `quest.allow_custom_tasks !== false`
(`QuestDetail.jsx:560`) therefore sees `undefined` and never closes, and `onAddTask` is
passed unconditionally at `:631`. No backend endpoint checks the flag either
(`quest_personalization.py:626`, `:272`, `:773`).

Fix all three layers. The server-side 403 is the real gate; the UI guard alone is
bypassable. Admins editing a template quest must keep the ability to add tasks.

### `9fd43833` — classes CSV includes archived classes

`ClassesExportModal.jsx`: grid formats skip archived (`:109`), the Class-list format does
not, and the modal receives the page's raw array which includes archived rows whenever
"Show archived" is on. Add an "Exclude archived classes" checkbox, default on, persisted
with the other prefs in `localStorage['sis_classes_export']`.

### `2629701d` — "Open all 1 closed" without saying which class

Per-class Closed badges already exist (`ClassesTable.jsx:209`, `ClassesPage.jsx:690`); the
closed class can just be out of view. Make the count clickable to filter to closed classes
so "Open all" is never a blind action.

### `dcceb57b` — "7 students, 1 enrolled"

Both numbers come from one query on `school_enrollments`
(`sis_reports_service.py:54-65`). "Students" counts every row regardless of status —
withdrawn and graduated included — and "Enrolled" counts `status='enrolled'`. The SIS
dashboard's "Total students" is a third definition entirely (`users` rows by role).

Split the card row into Enrolled / Applicants / Withdrawn with labels that say what they
count. Keep the API response backward-compatible.

### `a91bb5fa` — offered waitlist kids have no names (**repro first**)

The brief guessed a missing join. Wrong: `sis_waitlist_service.py:89-104` sets
`student_name` on every row regardless of status, and the school-level queue does too. Some
specific surface is at fault — likely the offer-sweep notification copy or a counts-only
popup. Reproduce as an iCreate admin before touching the service.

### `86c33ee6` — no way to correct a recorded payment's method

`sis_payment_records` is insert-only. Single writer `record_payment`
(`sis_billing_service.py:606-638`); no update, no delete, and the `void` invoice status is
written by no code path at all.

Fix narrowly: `PATCH` for `method`, `note`, `external_ref` only — display metadata that
recomputes nothing — gated `FINANCE_ROLES`, audited. Amount corrections and a real
void-and-re-record path are ledger design and belong on the debt list.

## Phase 2 — the roster desk

Owned by another agent as of 2026-08-18; the notes below are acceptance criteria for
review, not a second implementation brief. iCreate asked for rosters-in-a-spreadsheet four
separate times (`ff701e99`, `0334366b`, `90b91553`, `00877fea`) — the highest-demand item
in the backlog.

One engine: `GET /api/sis/reports/rosters.csv?class_ids=&fields=&include_waitlist=`,
following the pattern the class report already proved — a server-side field whitelist
shipped with the data (`CLASS_REPORT_FIELDS`, `sis_reports_service.py:175-203`) so picker
and CSV can't drift. Multi-class in one file, enrolled and waitlisted rows distinguished,
preferred names via the assembly at `catalog.py:427-451`, guardian contacts joined.
`ADMIN_ROLES`, org-scoped, and **paged reads** — a multi-class export is exactly where
PostgREST's silent 1000-row cap bites.

Three surfaces: the Reports page (class multi-select + field picker), the Classes page
roster tab (Export CSV + Print, reusing the print-stylesheet pattern from
`TeacherClassPage.jsx:121-127` — print satisfies the PDF ask without a PDF pipeline), and
the teacher class page backed by the class-scoped route (`staff_portal.py:91`).

Also in this phase:

- `169a05e6` class report with selectable fields — **already shipped**; audit
  `CLASS_REPORT_FIELDS` against the request and close with a pointer.
- `c3cd1747` add a student from the roster modal — wire to `catalog.py:457`; over capacity
  routes to the waitlist.
- `f8626f75` move a student between classes — compose withdraw (`catalog.py:520`) with
  enroll; surface conflicts via `schedule_conflicts` (`sis_waitlist_service.py:340`).
  Depends on PR #92 so the transfer also clears sibling waitlists.
- `b9583855` multi-file onboarding uploads — `item.document_url` is a scalar and the UI
  labels the second upload "Replace document" (`OnboardingPage.jsx:180`). **Workaround
  now, no code**: tell them to split ID and birth certificate into separate template
  items. Then make it `documents[]` with read-compat, touching both upload flows,
  `update_item`, the `documents_kept` counter in `unassign`, and the client-side
  awaiting-review reducers.
- `b0818709` quest creator remainder — unify the three independent 20,000-char truncation
  literals (`quest_drafts.py:35`, `quest_ai_service.py:374`,
  `personalization_service.py:1018`) behind one constant and raise it; extend
  `test_quest_draft_instruction_priority.py` with the two reported fidelity failures.

## Phase 3 — decisions, answered 2026-08-18

### 25 XP stays the platform-wide floor (`b0818709`)

**Decided: no change.** The clamp in `quest_ai_service.py:457-464`, `_MIN_XP`
(`staff_training.py:167`) and `MIN_TASK_XP` is intentional and stays — no org exemption,
training quests included. XP is one economy across every school. Answer the "5 XP per task"
complaint as working as intended.

Still a bug, though, and unrelated to the floor: `is_required` defaults to true when the
model omits it (`quest_ai_service.py:470`, mirrored at `staff_training.py:168`), so "make
only the first task required" produces an all-required quest. Fix independently.

### Template edits sync to in-progress checklists, on an explicit button (`f4e1589d`)

**Decided.** A "Sync assigned checklists" button per template, never automatic on save,
reaching in-progress assignments only. Per-key merge: new items appended as pending,
wording updated on matching keys, progress/uploads/signatures never touched, removed items
dropped only where still pending. Show added/updated/removed counts and how many finished
checklists are being deliberately skipped. Depends on PR #94's key preservation.

### Monthly pay is a pricing question, not a button (`d4bc2603`)

**Rescoped, larger than the ticket suggested.** iCreate charges more for autopay, so the
family's choice must be known *before* the invoice is generated — it changes the amount.
Offering autopay on an already-issued one-time invoice does not fit their system.

Work moves out of the family billing page and into the pre-invoice path: capture at
registration or as a pre-invoice question, surface in the tuition approval queue
(`routes/sis/tuition.py`, `TuitionApprovalPage.jsx`), and have pricing apply the right
amount. `sis_pricing.py` is pure and unit-tested, which helps.

The uplift may already be configured: iCreate's `sis_settings.block_pricing` carries
`convenience_fee_pct: 6` and `installments: 10` alongside block tiers (5/10/15/20 blocks →
$1,500–$5,200/year, plus a UFA tier). Confirm with them — question C1 in the companion doc.

### "Combine onboarding with forms" — already delivered (`b0d6324a`)

**Decided: reply, no build.** The Task Center already presents both queues as one surface
and `/api/sis/my-tasks` aggregates them. `TaskCenterPage.jsx:19-25` records the deliberate
decision against flattening the tables; onboarding's signature capture and per-item
document review have no equivalent in forms. Ask what specific friction remains — the
likely real complaint is having two places to *build and assign* paperwork.

## Phase 4 — design-first builds

Both need a scoping conversation with iCreate; `09255e75` is already escalated in Perch for
exactly that. **Classes begin 2026-08-24**, which puts a real deadline on the in/out
request. Full agenda in the companion document.

### `741af39f` — teacher pay derived from class attendance

`class_meetings` is a recurrence *pattern* (day_of_week + start/end time) — no instances, no
expansion job, no duration computed anywhere. Teacher attendance isn't modeled at all, and
"substitute" is a schedule-chip label with no link to a class, a date, or pay.

Two prerequisites, both smaller than they first look. iCreate's calendar is already
populated through April 2027 (term starts, Labor Day, fall/Thanksgiving/mid-winter/spring
breaks) and `sis_settings.first_day_of_school` is `2026-08-24`. But closures are free-text
titles (`NO CLASS - FALL BREAK`) and the org's `calendar_categories` has no closure
category, so a derivation would be string-matching titles. And no class carries a date
range, so a three-week camp and a year-long class are indistinguishable.

Then: expand pattern + calendar into dated sessions; exception-only confirmation with a
per-session staff override (`meeting_id`, `user_id`, role primary/assistant/substitute) so
hours move to the sub, mirroring how the attendance page already defaults-and-excepts;
meeting and duty attendance; one payroll export blending derived and clocked hours, with
timesheets retained for non-teaching staff via `uses_time_clock`. All new surfaces
`FINANCE_ROLES` with `PAY_FIELDS`-style redaction.

**Blocked on the rate model, not engineering**: zero of iCreate's six staff profiles has an
`hourly_rate_cents`, and `pay_type` is stored but never branched on — `uses_time_clock` is
the real switch. If teachers are paid per session or per class rather than per hour, the
current schema cannot express it.

### `09255e75` — campus in/out for teens with a waiver

Escalated needs-human in Perch. Nothing in the platform records a student leaving the
building: no destination, no time out, no time back. `elsewhere_on_campus` is one of five
strings a coordinator picks when *closing* an alert, not a state a student can enter. There
is no enforced per-student permission of any kind — the media release is a registration
answer that reports list and nothing acts on. And a whole-day check-in was built and
removed in June 2026 (`migrations-archive/20260630_drop_sis_checkins.sql`), so an "in"
button risks rebuilding it by accident.

The signature system is the strong foundation: `send_for_signature(..., audience='family',
blocks_access=True)` already sends a document, tracks who signed, sends reminders, and can
hold a family out of the portal until they do.

## Cross-cutting rules

- New SIS routes default to `ADMIN_ROLES`; `FINANCE_ROLES` only where money shows. Both
  include superadmin. Never re-declare role tuples in a route module — the legacy
  `routes/classes/*` files did, and omitted `campus_coordinator` throughout.
- `count='exact'` for numbers, `fetch_all_rows` for full reads.
- Grep the rule shape before adding `/api/sis/reports/*` or payment routes; Flask
  dispatches to whichever blueprint registered first, silently.
- Keep green: `classesPageWaitlist`, `classesExportModal`,
  `test_sis_waitlist_staff_actions`, the onboarding and Task Center suites,
  `test_sis_forms_queue_views`, and the quest-draft instruction tests.

## Debt surfaced while verifying (no ticket)

- The payment ledger has no void or correction path, and `invoice.void` is written by
  nothing.
- Replaced onboarding documents orphan their old blobs in `staff-documents` forever.
- The legacy `routes/classes/*` role tuples omit `campus_coordinator` throughout.
- Three different definitions of "student count" across Dashboard, Reports and class
  enrollments will generate the next confused ticket if only the Reports labels are fixed.
