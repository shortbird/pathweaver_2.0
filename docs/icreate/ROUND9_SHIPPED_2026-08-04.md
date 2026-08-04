# iCreate round 9 — the 2026-08-04 batch, and what happened to each item

**Date:** 2026-08-04 · SIS console: <https://sis.optioeducation.com> · Web platform: <https://www.optioeducation.com>

Eight in-app reports arrived on 2026-08-04 from `dmchrplus@gmail.com`, plus three
older items that were still open from 07-30 / 08-01. Nine shipped in this build.
Four are deliberately still open — see the bottom.

Migrations applied to production: `20260804_class_show_assistants.sql`,
`20260804_sis_curriculum_quests.sql`.

---

## What shipped

### 1. Photos you can actually see

> "It'd be really helpful if we could click on the image of the person and make
> it bigger so we could actually see what they look like." (People)
>
> "It'd be great to have the images of the kids here, and then be able to click
> on them to see the pictures bigger. This would help teachers remember who is
> in their class." (a class roster)

A 36px circle is an identicon, not a face. `PersonPhoto` now renders the avatar
and enlarges it on click, across People (both lenses), the student modal and the
family modal.

The teacher's class roster had a second problem: it showed no photos **at all**,
despite the page's own docstring promising "the roster (photos, ages, guardian
contacts…)" since the day it was written. The roster endpoint had been returning
`avatar_url` the whole time; nothing rendered it. It does now.

Clicks are stopped at the photo, so opening one never also opens the row's modal
underneath. Initials stay inert — there is nothing to enlarge, and offering a
zoom that does nothing is worse than not offering one.

### 2. Assistant teachers — the portal, and the toggle

> "Can we have a way to add an assistant? And maybe a toggle to show the
> assistant or not. We would want to be able to add that class to their schedule
> in the teacher portal."

Adding one was already possible; the field just didn't do anything for the
assistant. `advisor_class_ids` — which decides both what a teacher **sees** and
what they may **touch** — only looked at `primary_instructor_id` and
`class_advisors`. So naming an assistant put them in the catalog and nowhere
else: not My Classes, not their weekly schedule, not the roster.

- An assistant now gets the class in their portal, badged **Assistant** so it
  doesn't read as one they lead.
- They can manage that class's quests too — they already saw the tab, and
  without this every button on it would have 403'd.
- Archiving or deleting staff now detaches them from assistant lists as well as
  from classes they taught. It previously left a stale id pointing at a departed
  person.
- **The toggle**: `org_classes.show_assistants` (default on). Families now see
  the assistant on a class — they never did before, so there was neither a
  display to control nor a way to suppress one. Staff views ignore the flag and
  say *(hidden from families)* when it's off, so "why isn't Julia on the
  catalog?" answers itself.

### 3. Two families with the same last name

> "When we have two families with the same last name, we need to have them
> identified differently than 'The Scott Family'. It caused some issues where
> the wrong kids were connected to the wrong parent!"

Households are auto-named `<Last> Family` at registration. iCreate has three
"Larson Family" rows in production, and the family picker showed three identical
options.

Colliding names now carry the guardians' first names — **Larson Family (Shahn)**,
**(Christie)**, **(Sarie)** — falling back to city, then street, then nothing at
all rather than an empty pair of brackets. Unique names are untouched, and every
family picker reads the disambiguated label, including the "add this student to a
family" dropdown where the mistake happened.

### 4. Campus coordinator role

> "I think we will need a campus coordinator role. Right now Kate is an admin,
> but it'll probably make more sense to have this as a role because we don't
> want the cc's to have access to all the financial stuff… We also will have
> Julia as a campus coordinator too."

`campus_coordinator` is an **org_admin minus the money** — modelled as a
subtraction, because that's what was asked for, not as a new permission model.
It's an org role only (absent from `UserRole`, so it can never land in
`users.role`).

The money sits behind three doors and all three are shut:

| Door | What happens |
|------|--------------|
| Whole modules | Billing, timesheets, time-entry edits, approvals, `payroll.csv` are `FINANCE_ROLES` |
| Pay fields on an operational record | An employment profile also carries the emergency contact and work schedule a coordinator needs, so `pay_type` / `payroll_id` / `hourly_rate_cents` are redacted per-field and **rejected on write** — a blind write is the same leak backwards |
| The staff roster CSV | Was handing out Pay Type and Payroll ID columns. Dropped for coordinators, not blanked — an empty column claims nobody has a payroll ID |

Adding a third staff role meant editing 26 role tuples across 20 route modules,
which is 26 chances to miss one and a silent 403 for every miss. The tiers now
live in **[backend/utils/sis_roles.py](../../backend/utils/sis_roles.py)** —
`STAFF_ROLES`, `ADMIN_ROLES`, `FINANCE_ROLES`. Don't re-declare a role tuple in a
route module; see the rules in [CLAUDE.md](../../CLAUDE.md#campus-coordinator-added-2026-08-04).

### 5. A curriculum that carries its quests

> "I like the idea of quests in here, but I'm wondering if we can add the
> ability to add an in-house course that is tied to the curriculum. That way we
> don't have to start anew with the quests every year? And maybe some teachers
> want to fill it in in advance."

The mismatch was which object the quests hang off. `class_quests` belongs to a
**section** — this year's Tuesday 10:30 Reading Workshop. Next year's section is
a new row, so it opens empty. `sis_curriculum` is the durable object: it already
outlives the timetable and one entry already backs four sections.

So the reusable set now lives on the curriculum (`sis_curriculum_quests`), and a
section copies across it in either direction, from the class Quests tab:

- **Add N to this class** — seed a new section from the saved set.
- **Save this class's quests to the curriculum** — bank this year's work for next
  year, which is also how a teacher fills one in ahead of time.

A copy, **not** a live union: a section's quests carry their own `publish_at` /
`due_date` and get individually removed, and a live union would either lose that
or silently change what enrolled students see the moment someone edited a
curriculum mid-semester. The copy is additive and idempotent — existing quests
keep their dates, a second click adds nothing — and every saved quest is
re-checked at copy time, because a curriculum outlives the quests it names.
Quests since deleted, archived, or belonging to another school are counted and
reported rather than silently dropped.

### 6. Two signposts

> "Where did the page go where we entered in our links for people to go through
> the registration process (like the tuition agreement, etc)? I thought it was
> this page, but that info isn't here any more." — filed as a bug

Not a regression: the registration funnel config moved to **Settings →
Registration & enrollment**, and nothing on `/registration` said so. That page now
links straight to it, and the section has an anchor so the link lands on it.

> "There's no way to get back to the teacher dashboard from here." (Resources)
>
> "Are teachers adding resources for their students here? Might this get too
> large?"

Resources gained the "← Teacher dashboard" link its neighbours already had. The
second is a question, and the honest answer belongs in the page copy rather than
a reply: Resources is the **school-wide** family library; material for one class
goes on that class's Curriculum tab. The page says so now, which is what stops it
getting too large.

---

## Still open, deliberately

| Item | Why |
|------|-----|
| **Schedule flow** — "submit for approval, but then their schedule is locked… I keep on having to unlock them" | iCreate flagged this themselves as "something we need to talk over". Their own proposal (finalize-after-CLP, with an opt-out for one-class families) changes the approval model, so it wants a conversation before code. |
| **Supply budget spend tracking** — "figure out a way to coordinate their supply requests or reimbursement requests forms so they know how much supply budget they have left" | Teachers see "spend up to $X" today (shipped round 8) but not what's left. Needs a reimbursement/request flow that draws the budget down — the largest of the open asks. |
| **Copy parents on class messages** | Their own note: "we'll have to think this through so parents aren't getting a ton of messages!" |
| **iOS photo attachment** — a student on 07-30 | Handled separately. |
