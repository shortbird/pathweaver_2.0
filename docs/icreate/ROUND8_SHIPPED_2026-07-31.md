# iCreate round 8 — the 2026-07-29/30 feedback, and what happened to each item

**Date:** 2026-07-31 · SIS console: <https://sis.optioeducation.com> · Learning app: <https://www.optioeducation.com>

Twelve in-app reports arrived between 2026-07-29 04:34 and 2026-07-30 22:36 from
`dmchrplus@gmail.com`, `homeschool@completelee.com`, and `katechr2@gmail.com`.
Five were already fixed earlier in the week; the other seven are this build.

---

## Already fixed before this build

| Filed | Item | Where it was fixed |
|-------|------|--------------------|
| 07-29 18:22 | Approve a schedule from the CLP meeting page | `a331d0c` |
| 07-29 21:58 / 22:02 / 22:20 | Class enrollment counts drifting (`12/12` → `0/12`, roster vs count vs waitlist) | `598c401`, `750245b`, `14c101e` — PostgREST was silently truncating org-wide reads at 1000 rows. [Postmortem](FAB_TRIAGE_2026-07-29_enrollment_counts.md) |
| 07-30 18:10 | "She gets logged out every time she opens the app" | `5487041` — three client paths were throwing away a still-valid session on a transient failure. [Audit](../SESSION_LOGOUT_AUDIT_2026-07-30.md) |

The Lego Robotics case from 22:20 (`13/15` shown, 14 on the roster, a parent who
believed her son was waitlisted) is resolved in the data: Van Stanfill is
actively enrolled, the class reads 14/15, and no iCreate student is now both
enrolled in a class and queued for it.

---

## What shipped in this build

### 1. Waitlist offers that staff can actually finish

> "We can't add people into a class from the waitlist that got offered a seat.
> They also can't accept the offer. And, we have waitlisted people that get
> offered a seat and it has expired before we can get them into the class."

Three separate defects, all in one place: the class's **Waitlist** tab listed
people and a status word, and the only action was *Offer next seat*, which by
construction can only reach the front of the queue.

- **Enroll now** — admit a named student immediately, without waiting for the
  family to claim. Deliberately not blocked by a full class: an admin doing this
  by hand *is* the override.
- **Offer again** — hand the seat back to someone whose offer lapsed or who
  declined. An expired entry used to be unreachable forever (`Offer next seat`
  looks at `waiting` only), so a lapsed offer was a dead end.
- **Remove** — take someone off the list.
- **The offer window is now 7 days**, not 48 hours; iCreate kept losing offers to
  a weekend. An org can set its own with
  `feature_flags.sis_settings.waitlist_offer_ttl_hours`.
- Each row now shows a plain status (`Offered`, `Offer expired`, `Waiting`) and
  the time left on a live offer.

Related fixes to the same tangle:

- **Enrolling a student anywhere now clears their waitlist entry for that class**
  (staff roster add, re-registration, age-exception approval). A child who was
  both on the roster and "Waitlist #2" is what made the numbers look haunted.
- **A student who is already enrolled can never be queued** for the same class.
- If a family clicks **Claim spot** and the seat was filled in the meantime, the
  org admins now get a notification saying so, so the office can admit them with
  *Enroll now* instead of the family hitting a dead button in silence.

### 2. Removing a person from the school

> "I deleted the duplicate swenson family, but three members of that family are
> still showing and Idk how to remove them."

Deleting a family removes the household and its member links — on purpose, so a
mis-typed family name never takes real students with it. But nothing could then
remove the leftover **accounts**, and a duplicate registration leaves three of
them.

**People › Everyone › ⋯ › Remove from school** now exists for students and
guardians (staff already had this on the Staff page, and are routed through that
same code path). It checks what the account is attached to first, then offers:

- **Archive** — a student is marked withdrawn and their class seats are freed; a
  guardian is detached from the school. The account and its history survive.
- **Delete permanently** — only offered when the account has no attendance, no
  completed work, no registrations, and no children linked to it. This is the
  duplicates-and-typos case.

The family-delete confirmation now says where the accounts end up, and points at
this action.

### 3. Health alerts on class rosters

> "On the alert that you have on students on the class rosters, some of those
> have an alert but they have no allergies! Also I wonder if you can make those
> clickable? Hovering doesn't always seem to work."

Both real, and the first one was ours: the roster flagged an alert whenever the
allergies or medications field was non-empty — and 55 iCreate students had a
parent-typed **"None" / "none" / "NA" / "N/A"** sitting in that box. A red badge
on students with nothing to report teaches teachers to ignore the badge that
matters.

`utils/blank_values.py` now decides what counts as an answer (shared with the
allergy report, which already knew this), and the roster uses it. "No nuts" and
"none except dairy" are still content — only exact ways of saying *nothing* are
treated as blank.

The badge is now a **button** that opens the detail inline. A `title` tooltip
never appears on the tablet teachers actually take attendance on.

### 4. People CSV export

> "When exporting a CSV file from the People page, it doesn't include grade
> level, just the column for it. I had it filtered for students only and by what
> age, but it included parents and didn't show age on the CSV."

The export called a server endpoint that dumped the whole organization, so the
on-screen filters did nothing to it, and it had no Age column at all — while
iCreate records ages, not grade levels (0 of their `school_enrollments` rows
carry one; 193 of their people have a date of birth).

Export now writes exactly the rows on screen — same search, same filters, same
sort — and carries **Age** and **Date of Birth** alongside the existing columns.
Grade Level stays for schools that use it.

### 5. Calendar events in more than one category

> "With the color coding on the calendar, can we make it so that we can choose
> more than one category? Some things will belong in more than one category."

Events take a list of categories now. The first one is the primary: it colours
the event on the grid and drives the per-category ICS feeds, and the others show
as coloured dots after the title (hover names them all). Filtering by a category
keeps every event that carries it, not only the ones where it happens to be
first. Family-facing event views show all of an event's categories.

Migration `20260731_sis_event_multi_category.sql` — **already applied to
production** and verified: `categories text[]` on `sis_events`, backfilled from
the existing `category` (7 of 54 events had one), plus a GIN index.

### 6. Curriculum library as a sortable table

> "I'm wondering if maybe we can sort the pages more like the class list … class
> title, ages, subject, folder link and then be able to sort it by those topics?
> And then it could have a drop down like it does in the classes if it needed
> more info?"

The library is now a table: **Title · Ages · Subject · Classes · Folder**, every
column sortable, with the description, staff note, and the list of classes using
the entry behind a per-row disclosure. Ages are inherited from the classes that
teach the curriculum (an entry nobody teaches this term shows *Not taught this
term* and sorts last by age).

### 7. Deleting a quest that was never assigned

> "Being able to delete a quest you have created. (This is a teacher request
> from one she started creating last year and she wants it gone and try creating
> a new one)"

Quest deletion shipped on 07-29 (`e9c36a8`) but only on quests **assigned to a
class** — an abandoned draft that never made it onto one still had no way out.
The assign picker now offers Delete on the school's own quests, so a teacher can
clear a draft without assigning it first. The API guard is unchanged: an
Optio-library quest can't be deleted, and neither can one a student has started.

---

## The batch that arrived mid-build (2026-07-31 00:25–00:30)

Five more reports landed while this was being written. All five are in.

### 8. "When we click Offer next seat … we can't put them in the class either"

> "the person gets a notification that they have come up on the waitlist.
> However, they have no way to actually get their kid in the class, and we can't
> put them in there either. We need something that will help us get them in the
> class."

This is exactly item 1 above — **Enroll now** on the class Waitlist tab, and the
same button on the CLP screen (below). It also confirmed the diagnosis: the
notification went out, and nothing on either side could finish the job.

### 9. Who has finished their CLP, and whose schedule still needs approving

> "Can we get a list somewhere that shows who all has completed their CLP? And a
> list of everyone who needs their schedule approved still?"

The CLP student picker now has four lenses with live counts: **Everyone · CLP to
do · CLP done · Needs approval**. Same list you already work from, filtered.

*Needs approval* includes students who never submitted anything, not just the
ones waiting in the queue — in a CLP meeting the schedule is built live with the
family and never goes through the Schedule Builder, so "no submission" is the
normal state of an unapproved schedule.

### 10. Open requests, on the meeting screen

> "It would be helpful to have any waitlist or age exceptions that parents have
> requested listed here somewhere. Maybe to the left of the schedule?"

An **Open requests** panel now sits above the weekly schedule (staff-only —
never rendered with the screen turned toward the family). It lists the student's
live waitlist places and pending age-exception requests, each actionable in
place: *Enroll now* / *Remove* for a waitlist place, *Approve* / *Decline* for an
exception.

### 11. What Approve Schedule does to open requests

> "What happens when we hit Approve Schedule? Does it take students off the
> waitlisted classes? Cuz it should!" and "If someone's schedule is approved,
> then I think it should also remove the age exception requests."

- **Age-exception requests are now closed by the approval**, recorded against
  what the approved schedule actually says: the student is in that class →
  approved; they aren't → declined. Nothing is enrolled or dropped, because the
  approval already settled the roster.
- **Waitlist places are deliberately kept.** An approved schedule doesn't tell
  us the family stopped wanting the seat they're queued for, and dropping them
  would lose their place in line — so approving now *reports* them instead:
  "Schedule approved · 1 age exception closed · still on 1 waitlist", with the
  rows one click away in the Open requests panel. **If iCreate does want approval
  to clear waitlist places outright, say so and it's a one-line change** — we
  didn't want to guess at something irreversible.

### 12. Private-school status during the CLP

> "we also would love to know who is private school and who is not. Likely that
> should be added during registration (at least for next year.) For now, maybe we
> could check the box during the CLP and/or let parents select that in their
> portal?"

The field already existed (`households.enrolled_private_school`, shown as the
School pill on the CLP screen) but could only be *set* on the Families page. The
pill is now a toggle on the meeting screen — click it to set or clear the school
of record, right in the meeting. It stays read-only in presentation mode.

The other two options are open questions: adding it to the registration funnel
for next year, and letting parents set it themselves in their portal. Say which
you want and they're small.

---

## Follow-on fix: "Offer next seat" on a waitlist with nobody waiting

> "It says 'offer next seat' on brain games thurs for 1 on the waitlist, but when
> I click on it it says no one is waiting." *(02:38, after the round-8 deploy)*

Real, and older than round 8. A class row's **Waitlist** count is the whole live
queue — `waiting` **plus** `offered` — but only a `waiting` entry can be handed a
seat. Brain Games 8‑11 (Thu Block 2) had exactly one entry and it was already
`offered`, so the row said *1*, the button appeared, and the answer was "no one
is waiting". Three iCreate classes were in that state.

Fixed on all three surfaces so the number and the button can't disagree:

- The class list now knows the difference (`waitlist_waiting` /
  `waitlist_offered`), and the row shortcut only appears when someone is
  genuinely waiting.
- The count says what it's made of: **1 offered**, or **3 · 1 offered** for a
  mixed queue.
- When there is nothing to offer, the API explains rather than denying the queue:
  *"1 student on this waitlist already has an offer out. Open the Waitlist tab to
  enroll them now or offer again."* The Waitlist tab's own button is disabled
  with the same explanation.

The way forward in that state is round 8's per-entry buttons — **Enroll now** or
**Offer again** — which is exactly what the message points at.

---

## Follow-on fix: no way back to the teacher dashboard

> "No way to get back to the dashboard from this page." *(/my-classes)*
> "No way to get to the teacher dashboard from this page." *(/forms, /onboarding)*

Three reports in two minutes. The sidebar does carry a Dashboard link, but it is
generic nav that sits behind a drawer on a narrow screen — the class page's own
**← My Classes** is the pattern people actually find, and nobody has ever filed
a report about that one.

Every teacher-portal page now opens with the same back-link: My Classes, Forms,
Onboarding, My Schedule, My Documents, My Time, My Profile, Directory.

The label follows what `/` will actually render for the viewer. A teacher — or
an admin previewing a teacher's portal — gets **← Teacher dashboard**. An admin
who is *not* previewing lands on the School Dashboard, so they get **← Dashboard**
rather than a promise the app won't keep.

---

## Tests

- Frontend: **993 passing** (50 new — waitlist staff actions, People export and
  removal, curriculum table, calendar categories, roster alerts, quest-picker
  delete, CLP lenses / open requests / school toggle, and the waiting-vs-offered
  split on the class list, and the teacher-portal back-link on all eight pages).
- Backend: **new suites** `test_sis_waitlist_staff_actions.py` (19),
  `test_sis_person_removal.py` (19), `test_blank_values.py` (40),
  `test_sis_clp_open_requests.py` (10), plus 7 added to the calendar suite and 8
  covering the waiting-vs-offered split. The
  pre-existing failures in the backend suite (repositories, xp/atomic-quest
  services, transcription, rate limiting) are unchanged by this build — verified
  by running them against a clean tree.

## Follow-ups not done, and open questions for iCreate

- The three orphaned Swenson accounts are **left in place** — they are iCreate's
  data to remove, and the tool to do it is now on the People page. All three are
  clean (no records), so Delete will be offered.
- A family whose offered seat is filled before they claim it still can't claim
  it; the office is notified instead. Reserving the seat for the length of the
  offer would be the fuller fix.
- **Should approving a schedule drop the student's waitlist places?** Today it
  keeps them and tells you. Answer this and it changes in a line.
- **Private-school status:** add it to the registration funnel for next year,
  and/or let parents set it in their portal? The CLP toggle covers today.
