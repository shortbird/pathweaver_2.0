# iCreate round 11 — the 2026-08-06 urgent list

**Date:** 2026-08-06 · SIS console: <https://sis.optioeducation.com> · Web platform: <https://www.optioeducation.com>

Six items, plus a verification pass over the financial flow. Two of the six turned
out to be features that already existed and could not be reached — worth saying
plainly, because "we don't see where to do that" and "that isn't built" look
identical from the outside and are fixed very differently.

Migrations applied to production: `20260806_sis_curriculum_courses.sql`,
`20260806_sis_training_audience.sql`.

Before any of it: the round-10 work on this machine was reconciled with the
CLP-done tuition-approval work that reached `main` from the other machine. Two
tests described a world that no longer existed and were corrected.

---

## What shipped

### 1. Assigning a TA to a class

> "i think we built a way to assign TAs to classes but I don't see where to do
> that. add that in."

Half built, and worse than not built. The picker had existed in the class editor
for a while, and the backend supported assistants end to end — but
`ClassesPage.classBody()`, the single funnel every class save goes through,
rebuilt the payload field by field and never copied `assistant_instructor_ids`
across. You could pick an assistant, save, and watch it come back empty. That is
indistinguishable from the feature not existing.

Fixed at the funnel, and the picker added to the **inline row editor** as well —
that is where the office actually edits classes, and its absence there is most of
why this read as missing. The assistant chips, the search box, and the
families-can-see-them switch are the same in both places.

The fields are only sent when the editor in use actually edits them. Sending an
empty value from the row editor would have wiped a class's assistants rather than
left them alone.

### 2. Making somebody a campus coordinator

> "i also think we established a campus coordinator role but we don't know how to
> set someone to have that role."

Correct, and the same shape of gap. The role shipped on 2026-08-04 with every
tier, gate and pay redaction it needs, and no endpoint that could put a person in
it — Kate could be read about but not made one.

The role picker now lives on the staff member's card, next to the roles it
changes, and names what separates the tiers: an admin gets the whole console
including the money, a coordinator runs the campus without it.

Two refusals, both about not locking a school out of its own console:

- a school keeps at least one admin, so the last one cannot be demoted;
- nobody can remove their own admin role — the same mistake with one extra step,
  and the one an admin makes tidying up their own row.

Granting roles is deliberately **not** on the admin tier, which includes
coordinators: a coordinator who can grant roles can grant themselves org_admin
and take back the finance access the role exists to withhold.

Any non-staff role is kept. Making Kate a coordinator does not stop Kate being a
parent in the family portal.

### 3. Signing paperwork by typing a name

> "rather than downloading/signing/scanning/uploading a doc, just give them a
> place to type their name with a checkbox saying something like 'this counts as
> my official signature'."

Four of those five steps need a printer, and the artifact they produce — a
photograph of a signature, emailed around — is no better evidence than a typed
name captured behind a login.

A template item can now be marked **They sign it here**. The person types their
full name, ticks the affirmation, and presses Sign. What gets recorded is what
makes a typed signature hold up: the signed-in account, the name they typed, the
**full text of the sentence they agreed to**, the timestamp, and the request
address. Storing the sentence rather than a bare yes is the part that matters
later — otherwise there is no record of *what* was agreed.

What it refuses is the substance of it:

- a name without the affirmation is not a signature, and stored it would look
  exactly like one that is;
- a signature item cannot be ticked off like an ordinary one;
- an admin can approve and reject, but cannot sign for somebody else.

Staff and families share one signing component, so a parent's signature and a
teacher's are the same thing rather than two implementations with two sets of
bugs.

### 4. Quests for teachers and for families

> "admin need to be able to create quests for all their teachers and families.
> they're doing teacher training through quests and back to school night with
> families will be a quest."

The teacher half already worked. Back to school night is that exact shape pointed
at a different group, so this added an **audience** to the existing catalog
rather than building a parallel one: one place a quest is attached, one progress
report, one vocabulary.

A family quest belongs to the **guardian**. Their own account holds it, their own
progress is reported, and nothing in it reads or writes a student record. The
portal copy says "these are yours to do" for the same reason — a parent who reads
it as their child's homework will not do it.

Admins get a **For teachers / For families** switch, and the same
who-has-done-what report for either. Families see theirs in the family portal.

The console's nav item reads **Quests** for an admin and stays **Training** for a
teacher. Calling it Training for admins hid the place family quests are set,
which is the same failure mode as items 1 and 2.

### 5. The curriculum as the container

> "consolidate curriculum/courses/quests. admin should attach courses/quests to
> curriculum so they're reusable year after year and teachers have resources to
> use, rather than requiring teachers to create their own quests."

Half of this existed: a class could save its quest list back onto a curriculum
(round 9). But only from a class — which is the wrong direction for the actual
job, because an admin setting up next year has no sections yet to edit the set
from. And courses had no link to a curriculum at all.

Both sets are now edited on the curriculum itself, in the library, because that
is the object that outlives the timetable. A class section is *this year's
Tuesday 10:30*; anything hung off it is rebuilt from nothing every August.

The library row says what each entry carries — "3 quests · 1 course" — and an
empty cell is the signal that somebody still has to build it.

The two sets behave differently on purpose, and the screen says which is which
rather than leaving it to be discovered:

| | Behaviour | Why |
|---|---|---|
| **Quests** | copied onto a class | a section owns its own list — per-section publish and due dates, per-section removals. Editing the curriculum changes what the **next** class starts from and never rewrites a class in progress. |
| **Courses** | linked live | a course carries no per-section state, so fixing a wrong attachment in the library fixes it **everywhere** instead of leaving stale copies on every section that inherited it. |

A teacher opening their class now finds the school's courses already attached,
with an Edit link into the builder. Attaching another school's material is
refused at the door rather than filtered at read time — a link only they can
resolve is a row that renders as nothing forever.

This closes two long-open reports: *"we are definitely going to need to have a
way to create courses and connect them to the classes"* and *"if we connect
courses, we need to have a way for the teachers to edit those."*

### 6. The financial flow — verified, and one fix

The tuition flow that landed earlier the same day was checked end to end against
iCreate's live data rather than rebuilt. It works:

- **110** CLP-finished students sitting in the tuition queue awaiting an invoice;
- line items seeding correctly from each student's actual schedule (Abigail
  Sadler: seven classes, $4,725, itemised per class);
- the branded invoice document rendering with the school's identity;
- the school's own Stripe key present, so online card payment is live;
- receipts refusing to open for anyone but the family they belong to.

One real defect surfaced. The invoice reads back as `INV-2026-3B3796` everywhere
a **family** sees it — the branded document, the receipt, the portal — and as
nothing at all in the staff outstanding-balance report the office chases payments
from. `outstanding_invoices()` rebuilt each row field by field and never copied
the number across. Same shape of omission as the TA one.

Not cosmetic: the number is the only identifier a parent recognises, so without
it a payment chase has the office and the family naming the same invoice two
different ways. Fixed, with the column added to the report.

---

## A pattern worth naming

Three of the six items in this round were **reachability**, not absence: the TA
picker, the coordinator role, and the invoice number. Each was built, each was
correct underneath, and each was invisible or silently dropped at exactly one
point on the path a user takes.

They are cheap to fix and expensive to leave, because a feature that half-works
costs more trust than one that is plainly missing — you try it, it appears to
work, and it doesn't. Worth a look at the save funnels and the nav labels
whenever something is reported as "not there".

---

## Not in this round

The 19 open feedback-backlog items were deliberately left (see
[BACKLOG_RECONCILIATION_2026-08-06.md](BACKLOG_RECONCILIATION_2026-08-06.md)).
Several of them are blocked on a policy decision only iCreate can make — waitlist
limits per hour, Open Lab caps, assume-present attendance, non-class schedule
items — and should not be decided on their behalf.

Still open from round 10, unchanged: the schedule-approval rework, supply-budget
spend tracking, and copying parents on class messages.
