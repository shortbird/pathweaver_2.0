# iCreate Perch queue — triage and plan

**Date**: 2026-08-21
**Source**: all 31 open tickets on the iCreate client in Perch (30 `building`, 1 `received`),
plus Molly's email of the same date (three questions, quoted in full in §1).
**Verified against**: `main` at `9803aec8`, and against production data
(project `vvfgxcykxjybtvpfzwyx`) wherever a ticket turned on what the data actually says.

Every ticket below was read against the code before being classified. Six turn out to be
already fixed, four are questions rather than defects, and six are blocked on an answer only
iCreate can give. That leaves fifteen that are real work, and ten of those are small.

---

## The state of the queue itself

Nineteen of the thirty `building` tickets have an `agent_runs` row still sitting at
`queued` — no branch, no PR, no error. The dispatcher has not picked up anything filed since
**2026-08-14**, so "building" on the client's screen currently means "received and
untouched" for most of the list. Two runs did produce work and stalled:

| Ticket | Run | Where it stopped |
|---|---|---|
| `dbfe0f0f` waitlist auto-drop | [PR #92](https://github.com/shortbird/pathweaver_2.0/pull/92) | CI red (backend), three repair attempts |
| `0df0e616` duplicate/reorder templates | [PR #94](https://github.com/shortbird/pathweaver_2.0/pull/94) | changes requested, staging proof failed |

**Left alone deliberately.** Nothing in this plan touches Perch, its dispatcher, those two
PRs, or any ticket status — two agents fixing the same ticket is worse than a slow queue.
The five tickets those PRs and the widget own are listed in §6 so they are not lost.

---

## 1. Molly's email

> So "new form, request or task" Is still under the assign or send button. Why have a button?
> Why not just have those be tabs like the other ones?
>
> Can we set up the forms so that they automatically go to the appropriate person? For example
> — substitute requests from the teachers could just be set up to go right to Julia. Otherwise
> they come to us first? Can we reassign tasks from teachers or parents once they come in?

Three asks, and they land on the same screen as four open tickets (`18909673`, `e9870e13`,
`16b736f3`, `b0d6324a`). Answering the email answers those too.

### 1a. "Why a button?"

The three tabs are **views** (Requests, Checklists, Sent paperwork); the menu holds
**create actions**. That distinction is real — you look at requests far more often than you
file one — but it costs a click on every single create, and the label on the button
("Assign or send") names none of the three things it does.

**Doing:** the primary action moves onto the tab, and says what that tab makes. On Requests
the button reads *New form, request or task*; on Checklists, *Assign a checklist*; on Sent
paperwork, *Send a document for signature*. One click, and it is labelled for where you are
standing. The other two stay reachable from a small `▾` on the same button, so nothing that
works today stops working. `TaskCenterPage.jsx`.

Not literally making them tabs: a tab you cannot go back to is a button wearing the wrong
hat, and switching to a "New form" tab would lose the queue you were reading.

### 1b. "Can forms go automatically to the right person?"

Not today — every submission lands in one queue and waits for a human to assign it. The
routing column asked for in [FORM_BUILDER_PROPOSAL_2026-08-20.md](FORM_BUILDER_PROPOSAL_2026-08-20.md)
(`default_assignee_id`) is the right answer, but it does not need the whole form builder to
ship.

**Doing:** a routing table in Task Center — one row per form type, one staff picker each.
A form filed against a type with a route arrives already assigned, its assignee notified as
if a person had assigned it, and it still appears in the office queue so nothing becomes
invisible. Substitute requests to Julia; maintenance to whoever holds the keys. Stored in
`organizations.feature_flags.sis_settings.form_routing` — no migration, and the form builder
inherits the map when it lands.

Applies only when the filer did not assign it themselves, so an admin filing a task
pre-assigned always wins over the rule.

### 1c. "Can we reassign tasks once they come in?"

Yes, today: Task Center → Requests → click the row → **Assigned to**. It works for anything
in the queue whoever filed it, teacher or parent, and the new assignee is notified.

It is one click too deep to be discoverable, so alongside it: an **assignee filter** on the
queue (Anyone / Me / Unassigned), which is what makes "who has this?" answerable without
opening rows one at a time.

---

## 2. Already fixed — verify and tell them

Nothing to build. These need a look in production and a note on the ticket.

| Ticket | Report | What happened |
|---|---|---|
| `38cc232a` | Could not remove Kayla Rose after removing her children | Fixed by `d0fe3b83` + migration `user_delete_actor_fks_set_null`, **confirmed applied to prod**. The delete was dying on a foreign key (`group_members.added_by`) nobody had listed. Filed 12:00, fixed 14:50 the same day. |
| `f03b849c` | "Add a column so we know if they can see it" (secure documents) | `ae0b03ba` landed 38 minutes before this was filed, so she was almost certainly on the old build. Every document row now carries a **Shared with them / Private** pill, plus a bulk share. Worth confirming she sees it before closing. |
| `e9870e13` | Sent Paperwork says "Nothing sent for signature yet" | It was empty because nothing had been sent. Her report is timestamped 02:54 UTC; the first 69 sends happened at 18:27 UTC the same day, and the tab has listed them since. The real content of the ticket is the second sentence — she expected to *send* from Task Center and thought it lived in Secure Documents. That is §1a. |
| `b0818709` | Quest creator, seven complaints | Five fixed in `4ec791c5` and answered on the ticket; #4 (document truncated at ~20k characters) and #7 (does not follow tasks already in the doc) remain, and are §5. Perch cancelled the run as superseded but the ticket is still open. |
| `23edd56a` | "Airspeed velocity of an unladen swallow" | Karl's smoke test. Close it. |
| `db438504` | "Nice to be able to send you a screenshot" | Perch's widget, not this repo. §6. |

---

## 3. Built — branch `icreate/perch-sweep-2026-08-21`

Ten items, all verified to a root cause, ordered by consequence. **Built and committed on
the branch; nothing merged, nothing deployed.** Backend 3454 passed, web 1951 passed.

Three commits:

| Commit | What |
|---|---|
| `02955486` | The ten below, §3.1 to §3.10 |
| `9bdf7836` | Add and move students from the roster (§4 item 2, brought forward) |
| `5738915d` | The payments report (§4 item 3, brought forward) |

### 3.1 `c8c134e2` — Revenue is showing to campus coordinators *(security)*

**Confirmed.** `/api/sis/reports/revenue` is decorated `ADMIN_ROLES`
([reports.py:52](../../backend/routes/sis/reports.py#L52)), and `ADMIN_ROLES` includes
`campus_coordinator` by design — it is the *operations* tier. Revenue is money, so it belongs
to `FINANCE_ROLES`. The whole point of the coordinator role is the money subtraction
([sis_roles.py](../../backend/utils/sis_roles.py)), and this is a hole in it. Julia and Kate
can read the school's billed / collected / outstanding totals today.

**Fix:** `FINANCE_ROLES` on the revenue route; the Reports page stops fetching and stops
rendering the tile when `canSeeFinance` is false. Enrollment and attendance stay — they are
operational. Backend test in the negative style the coordinator suite already uses.

Her second sentence ("maybe that and enrollment should be in the time and money section") is
a layout preference, not part of the fix; enrollment is not financial and moving it would
take it away from the people who use it.

### 3.2 `3de400bb` — The contract asks her to read two family forms first

**Confirmed, with the timeline to prove it.** A signature checklist item that names no
document signs against the pool of "everything shared with you and flagged for signature"
([sis_onboarding_service.office_documents](../../backend/services/sis_onboarding_service.py#L335)).
On 2026-08-20 at 18:27 UTC the office sent the Family Service Program form and the Student
Behavior Agreement out for signature — 69 assignments, all flagged. Three hours later she
reported that her *teacher contract* was telling her to review them.

**Fix:** exclude documents already claimed by a signature-request item from the generic pool.
A document sent through the send-for-signature flow has its own task and its own row in My
Tasks; it must never also appear as reading material under somebody's contract. Narrow and
testable — the pool query gains one `not in` against that person's claimed document ids.

### 3.3 `aea51a67` — Cannot type a year into a due date

**Confirmed by reading the control.** In the queue, the due-date input PATCHes on every
keystroke: `onChange={(e) => update(f.id, { due_date: e.target.value || null })}`
([StaffFormsPage.jsx:365](../../frontend/src/pages/sis/StaffFormsPage.jsx#L365)). A native
date input reports an empty value until the whole date is valid, so typing `08/20/…` fires a
save of `null`, the row reloads, and the year she was halfway through typing is wiped. The
calendar picker works because it only ever emits a complete date.

**Fix:** commit on `blur`/complete value rather than on every keystroke, and never save a
partial. Same treatment for the priority/status controls is not needed — they are selects.

### 3.4 `0950b1c4` — Cannot tell who is waitlisted on the roster report

The report is right: waitlisted rows come back with a **Status** of `Waiting` or `Offered`,
and Status is a default column. Two ways she still ends up unable to tell, both real:

- ticking **Include waitlisted students** after running does not re-run, so the table on
  screen silently stays the enrolled-only one;
- Status can be unticked in the column picker, which then persists in that browser.

**Fix:** re-run when the toggle changes; force Status into the selection whenever the
waitlist is included (and stop it being untickable in that mode); badge waitlisted rows in
the on-screen table so it reads at a glance rather than by column-scanning.

### 3.5 `e22e07e2` — "Include archived classes" on the roster class list

The picker calls `/api/sis/classes` with no `include_archived`, so it already excludes them
— but iCreate has **47 archived classes against 152 active**, and the Class report next to it
*does* have the checkbox, so the absence reads as an inconsistency.

**Fix:** the same checkbox on the Class rosters card, off by default, refetching with
`include_archived=true` and labelling archived options so a deliberate pick is obvious.

### 3.6 `5ba8fd56` — Tick the classes, and add gender

Two asks. The class picker is a `<select multiple>`, which is the control everyone
ctrl-clicks wrong; and `users.gender` exists, is **required at iCreate registration**, and is
already in the People export — it is simply not among the roster report's fields.

**Fix:** checkbox list (with Select all / Clear, which the multi-select already had) and a
`gender` field on the roster report, off by default like the other identity columns.

### 3.7 `aca2cadf` — Quest dropdown: alphabetise, and group it

**Confirmed.** `/training/assignable-quests` returns the school's quests and the Optio
library concatenated in database order with no sort
([staff_training.py:591](../../backend/routes/sis/staff_training.py#L591)).

**Fix:** sort by title within each source, and render `<optgroup>`s — *Your school's quests*
then *Optio library*. That is her "subcategories", and it is the natural one: the source is
already on every row.

### 3.8 §1a — The create action moves onto the tab

### 3.9 §1b — Form routing rules

New `GET`/`PUT /api/sis/staff-admin/form-routing` (ADMIN_ROLES — routing is operational, not
financial), storing `{form_type: user_id}` in `sis_settings.form_routing`; applied in
`sis_forms_service.submit()` only when the submission arrives unassigned; a small editor in
Task Center listing every form type against a staff picker.

### 3.10 §1c — Assignee filter on the queue

---

## 4. Next — real work, no decisions needed from iCreate

Sized and understood, but each is bigger than the sweep above. Suggested order.

| # | Tickets | Work |
|---|---|---|
| 1 | `d63154c7`, `2e930120`, `857b5f70` | **Messaging: who it goes to, and whether it emails.** Today the Messaging page sends to three whole-school audiences and *always* emails every recipient ([announcement_service.py:147](../../backend/services/announcement_service.py#L147)). Needs a recipient resolver — by class (one or several), by age range, by teacher — and an explicit "email this too" tick, so an in-app note is not 300 emails. Community board posts already only email when audiences are picked, which is the model to copy. Her "overlap between community and messaging" resolves the same way: the board is the noticeboard, messaging is the send. |
| 2 | `c3cd1747`, `f8626f75` | ~~**Add and move students from the roster popup.**~~ **Done — `9bdf7836`.** A student picker on the roster (`SearchSelect` over `/api/sis/roster`, per the platform rule), honouring the school-waitlist 409 the same way the student page does; and a *Move* limited to sibling sections, which is the only move that cannot change what a family is charged. Enrols into the new section before dropping the old, so a half-failure leaves the student somewhere. |
| 3 | `1f50e9ea` | ~~**Payments report.**~~ **Done — `5738915d`.** One row per payment with the split by method above the table, FINANCE_ROLES, CSV. The "tuition trades" half stays in §5, unanswered. |
| 4 | `b9583855` | **An onboarding item should hold several documents.** Already answered on the ticket and promised: uploading a second file offers *Replace* because the item has room for one. Needs the item's document to become a list, plus "add another" wording. Interacts with PR #94's item identity — do it after, or the reorder remaps which file belongs to which item. |
| 5 | `f4e1589d` | **Sync assigned checklists.** Scoped and promised on the ticket (button, not automatic; merges by item; never touches completed work; reports counts). Explicitly depends on PR #94 landing first. |
| 6 | `e9870e13` | Nothing to build beyond §1a — keep for the client note. |

---

## 5. Blocked on iCreate — do not start

Each already has a written reply on its ticket asking specific questions. None has been
answered. The build is not the hard part in any of them; the answer is.

| Ticket | Blocked on | Note |
|---|---|---|
| `09255e75` **teen in/out button** | Three questions: does "in" mean arrived or returned; what gates the button (waiver / office toggle / age); tablet or phones. | **The deadline is real — 24 August.** Scoped and ready to build the day they answer; the leaned defaults are already written on the ticket. Nothing is being built on assumption. |
| `741af39f` **pay from attendance, not timesheets** | How teachers are actually paid (hourly vs per session vs flat), scheduled block vs actual time, assistants, who records a sub. | Also needs two data conventions first: tagged closures, and start/end dates on classes. No attendance or clock rows exist yet, so nothing has to be migrated. |
| `d4bc2603` **monthly payment choice** | Is the existing 6% the monthly uplift; does it apply off block pricing; what happens if a family switches after invoicing. | The choice must be captured *before* the invoice, so it is a registration question, not a button on the tuition page. |
| `832f07e0` **refunds** | Whether they want a real refund flow at all. | Recorded by hand today. A refund is a reversing entry, not an edit — `PAYMENT_CORRECTABLE_FIELDS` deliberately excludes the money ([sis_billing_service.py:808](../../backend/services/sis_billing_service.py#L808)) so history stays honest. Design it properly or leave it manual. |
| `1f50e9ea` (part) **tuition trades** | What a trade is worth and against what. | The payments report ships without it; a trade is probably just a method value plus a note, but not until they say what they are recording. |
| `b0d6324a` **combine onboarding with forms** | Which half is friction: doing the paperwork, or building and assigning it. | Task Center already presents both as one list to the person who owes them. The guess on the ticket is that it is the *authoring* side; unanswered. |

---

## 6. Owned elsewhere

| Ticket | Owner |
|---|---|
| `dbfe0f0f` drop from other waitlists on enrolment | Perch PR #92 — CI red, three repair attempts spent |
| `0df0e616` duplicate templates, reorder sections | Perch PR #94 — changes requested |
| `db438504` attach a screenshot to a report | Perch's widget (`perch.js`), not this repo |
| `d5d04098` quest reads the document before directions | Ticket deleted in Perch, run cancelled — the ticket row is still `building`. Reconcile or re-file. |
| `16b736f3` how do we add forms | The form builder, scoped in [FORM_BUILDER_PROPOSAL_2026-08-20.md](FORM_BUILDER_PROPOSAL_2026-08-20.md). §3.9 ships the routing column early; the rest is a real build and should be planned as one. |
| `b0818709` #4, #7 | Quest creator: the ~20k character document cap, and following tasks already written in the source document. Both are prompt/pipeline work, both were answered honestly as not-fixed. |

---

## What is not in this plan

- **Nothing is merged or deployed.** Everything above sits on
  `icreate/perch-sweep-2026-08-21` for review.
- **The messaging cluster (§4 item 1) is deliberately not built.** Recipient targeting by
  class, age and teacher is straightforward; deciding whether an announcement should still
  email everyone by default is not, and Molly asked it as a question ("Does that make
  sense?"). It changes delivery for every org on the platform, so it wants an answer before
  a commit, not after.
- **No Perch writes.** No ticket status changed, no comment posted, no dispatcher restarted.
- **No client copy sent.** Draft replies — the email and a line per ticket — are in
  [PERCH_CLIENT_REPLIES_2026-08-21.md](PERCH_CLIENT_REPLIES_2026-08-21.md), for Tanner to send.
