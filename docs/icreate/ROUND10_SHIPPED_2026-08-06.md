# iCreate round 10 — the 2026-08-05 batch

**Date:** 2026-08-06 · SIS console: <https://sis.optioeducation.com> · Web platform: <https://www.optioeducation.com>

Five in-app reports arrived on 2026-08-05 from `dmchrplus@gmail.com`, all after
round 9 shipped. All five are in this build. The three items round 9 left open
deliberately are still open, for the same reasons — they are restated at the
bottom so nothing looks forgotten.

Migrations applied to production: `20260806_onboarding_assignment_audience.sql`,
`20260806_family_directory_default_and_carpool.sql`.

---

## What shipped

### 1. A teacher who is also a parent

> "When I try to add a teacher who is also a parent, it just says 'a user with
> this email already exists' but it won't let me add them as a teacher."

The dead end was real: **Add teacher** created an account, and an address that
already had one could only fail. But a parent who teaches is one person with one
login, not a collision.

Adding a teacher whose email already has an Optio account now stops on a
decision screen — "They already have an account: mom@example.com is already a
parent here" — with one button, **Make them a teacher**. That adds the teacher
role to the account they already have. They keep every role they had, sign in
exactly as before, and gain the teacher portal; they get the same
"you now have staff access" email a linked teacher gets, not a set-password mail
for an account they never lost.

The refusals that should stay refusals still do: a student's address, a child
account, and an address belonging to another school are all turned away by name,
and somebody who is *already* a teacher here is reported as already on the staff
list rather than silently re-granted.

This is the same merge the placeholder-linking flow has always done at the end —
it just wasn't reachable unless a placeholder row happened to exist.

### 2. The family portal was showing the teacher onboarding

> "For some reason, in the learning app/family portal, it has the teacher
> onboarding template, lol."

The family portal listed every checklist assigned to the signed-in user id, and
an admin who is also staff holds staff ones. The audience (staff vs family)
lived only on the *template*, and a checklist's template can be edited or
deleted after assignment, so the answer had to be recorded at assign time.

Each assignment now carries its own audience, snapshotted the same way its items
are. The family portal shows family checklists, the console shows staff ones,
and the admin roll-up still shows everything it assigned. All nine existing
assignments in production were staff ones — which is why this looked like a
teacher template wandering into the family portal: it was the only kind there
was.

### 3. An admin could never complete their own checklist

> "In the family portal it also had an 'Upload document' to click, but here in
> the teacher portal, I'm not seeing that."

Onboarding is role-switched: teachers get their checklist, admins get the
template manager. An admin assigned a checklist of their own therefore had
nowhere to tick it off and no Upload button — the page only ever showed them the
manager.

The admin view now opens with **Your checklist** when the admin has one, with
the same items, the same tick boxes and the same Upload button a teacher sees,
above the template manager. An admin with no checklist of their own sees no
change.

### 4. Waiving a registration fee

> "How do we waive the registration fee? I'd like to unlock Katrine Myers family
> and not have her pay the fee."

There was no way to. Being "unlocked" and "not paying" were two different levers
and neither was in the console, so this needed a database edit.

The family's **Registration** tab now has **Waive the fee** whenever they owe
one or sit behind a hold. One click does the three things that sentence needs:

- marks the family prepaid, so the funnel computes $0 for them — now and on any
  later registration, which is the part that stops the bill coming back;
- finishes their open registration at $0, sending the same next-step email a
  paying family gets, so they land where everyone else lands;
- lifts the fee hold, which is what actually unlocks class signup.

A hold the office placed for some *other* reason is left alone — that is
somebody's deliberate decision, and forgiving a fee must not quietly undo it.

The button follows the finance tier, not the admin tier: a campus coordinator
runs registration but does not decide who pays.

### 5. The family directory: opt-out, cities, and carpooling

> "I would really like this to be opt OUT instead of opt in. They could change
> this in the settings or something (I want this to be harder for them to opt
> out.) Another really useful thing would be to show the city they live in and
> then have something they could check that says if they would be open to
> carpooling. And then we could filter it so that people wanting carpools could
> see who wanted to carpool and could reach out to other families to form
> carpools."

Three parts, all in.

**Opt-out.** A new school setting, *Family directory lists everyone by default*,
in SIS Settings. On, every family is in the directory unless they ask to be left
out; off, it stays opt-in. Each family still chooses whether their email, phone
and street address are shown, so "listed" never means "everything published".

The switch is **off for iCreate until you turn it on** — it publishes families'
contact details to other families without them acting, so it should be your
click, not a deploy's. It is one toggle in Settings.

Turning it on later cannot resurrect anyone: a family that switched themselves
off has *opted out*, recorded separately from never having opted in, and an
opt-out beats the school default in both directions.

**Cities.** Each listed family shows its city, independent of the street
address. A town name is what makes the directory usable for finding somebody on
your side of the valley; the street stays behind the family's own choice.

**Carpooling.** A family can tick *We're open to carpooling* on their directory
settings. Those families carry a Carpool tag, and one filter chip —
*Open to carpooling (n)* — narrows the list to just them, so a parent looking
for a ride share sees only the families willing to talk about one.

---

## Still open, deliberately

Unchanged from round 9 — restated so they are not mistaken for dropped:

| Item | Why |
|------|-----|
| **Schedule flow** — "submit for approval, but then their schedule is locked… I keep on having to unlock them" | iCreate flagged this themselves as "something we need to talk over". Their proposal (finalize-after-CLP, with an opt-out for one-class families) changes the approval model, so it wants a conversation before code. Families can already take back a submission the school has not reviewed, which removed most unlock requests. |
| **Supply budget spend tracking** — "coordinate their supply requests or reimbursement requests forms so they know how much supply budget they have left" | Teachers see "spend up to $X" today (round 8) but not what is left. Needs a reimbursement/request flow that draws the budget down — the largest of the open asks. |
| **Copy parents on class messages** | Their own note: "we'll have to think this through so parents aren't getting a ton of messages!" |
