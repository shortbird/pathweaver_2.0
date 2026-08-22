# iCreate Perch sweep — 2026-08-22

**Source**: all 24 open (`building`) tickets on the iCreate client in Perch.
**Branch**: `icreate/perch-sweep-2026-08-21` — continues yesterday's sweep rather than
starting a new one, because that work is still unmerged (see §1).
**Draft replies**: [PERCH_CLIENT_REPLIES_2026-08-22.md](PERCH_CLIENT_REPLIES_2026-08-22.md).
**Yesterday's triage**: [PERCH_TRIAGE_2026-08-21.md](PERCH_TRIAGE_2026-08-21.md).

Twenty of the twenty-four are built. Five are held, waiting on an answer only iCreate can
give. Nothing is merged, nothing is deployed, no Perch ticket was touched.

---

## 1. The thing to fix first

**Yesterday's twelve fixes never reached production.** Eleven commits sit on this branch
and none of them are on `main`, so nothing in the 2026-08-21 batch is live. Perch already
shows those tickets `live`.

That is not a cosmetic mismatch — it produced a new ticket. `9d7f9a98`, filed this morning:
*"oops, you still have the payments report on this page. That doesn't work if we are
letting the non-financial roles view this. I'm also seeing the recorded revenue here."*
That is `c8c134e2`, which was fixed yesterday and which she is still looking at.

Both migrations that batch needs are already applied to prod
(`20260821230250 adult_phone_verification`, `20260821234947 household_payment_plan_preference`),
so the branch is the only thing between the fixes and the client. Shipping is a merge to
`main` and a green `Release (main)`; Render deploys nothing on its own.

**Nothing else in this document matters until that lands.**

---

## 2. Built

Full backend suite 3662 passed, web 1988 passed, both at branch tip.

### Adopted the two stalled PRs

| Ticket | What was wrong with it, and what changed |
|---|---|
| `dbfe0f0f` (PR #92) | Sound in shape — after it, all six enrollment paths clear the waitlist — but it also widened the check on the way IN, which nobody asked for. iCreate splits two-day classes into per-day sections, so a family taking Choir (Tuesday) was refused the Choir (Thursday) waitlist. Only that class's own roster bars an add again. Also: the sibling lookup read the org's entire class table in one request (the shape that truncates silently), and accepting an offer stopped setting the accepted entry `promoted` itself, trusting a helper that swallows its own errors. |
| `0df0e616` (PR #94) | Its tests were written against `main`'s layout, where the template list is always open; this branch collapses it. That is why its staging proof failed. Underneath it sat on a worse problem — see below. |

### Item identity, which everything else needed

A checklist item's key was its **position** when it had no key. Add an item at the top and
the newcomer is handed `item_1`, which an existing item already holds; `update_item` takes
the first match, so one of the two becomes permanently un-completable. PR #94's reorder
buttons made that a one-click mistake, and `f4e1589d` (syncing assigned checklists) could
not be built on it at all. New items get a UUID; existing positional keys are untouched.

### Onboarding

`0df0e616` `4d47fa32` `d3b86332` duplicate + reorder + per-item duplicate ·
`7f040de5` directions at the top of a checklist (migration) ·
`b9583855` an item holds several documents, and removing one deletes the blob ·
`f4e1589d` **Sync assigned** — merges a template edit into checklists people already hold,
never touching completed work, skipping finished checklists and reporting counts ·
`87093f6b` + `417e98bf` the teacher-dashboard banner read the person's most recent
assignment of ANY audience or kind, so a family checklist surfaced on a teacher portal —
and it linked to `/my-tasks`, which ignores preview by design.

### Reports and billing

`9d7f9a98` the residual half — the class report is ADMIN_ROLES and carried tuition, supply
fee and materials allowance, two of them on by default, so the role defined by the money
subtraction could export every price in the school ·
`87d32ab1` the tuition page lists everyone, CLP finished or not, with a badge and a filter ·
`d406dd7a` billing sorts by family ·
`7e6b0be9` **Day rosters** — day, block, class, room, roster, one printable sheet per day.

### Messaging

`d63154c7` `2e930120` `857b5f70` — targeting by class, teacher and age range, ANDed rather
than ORed, with parents reached through their children; and email demoted to a tick box on
the Messaging page. `publish()` defaults `send_email=True`, so the Community board composer
and every script keep the behaviour they have.

### Forms

`16b736f3` + `b0d6324a` — `sis_form_templates`, mirroring `sis_onboarding_templates`, and
both builders on one Task Center tab. The label denormalization
([FORM_BUILDER_PROPOSAL_2026-08-20.md](FORM_BUILDER_PROPOSAL_2026-08-20.md) §3) landed
first and separately, as that document asked, so there is no window where labels are
org-editable and history is still being rewritten.

### Elsewhere

`b0818709` item 4 — the shared source-material cap was raised to 120,000 characters days
ago and `staff_training.py` kept its own 20,000 literal, so the model read the whole
handbook and we filed the first sixth ·
`db438504` — the widget has screenshotted every report since 2026-07-13 and said so
nowhere, which is why she asked for a feature she already had. One line of copy, committed
in `~/perch-runtime`.

---

## 3. Held — waiting on iCreate

Each has a written question on its ticket, unanswered since 19 August. Draft nudges are in
the replies document.

| Ticket | Blocked on |
|---|---|
| `09255e75` in/out button | **The 24 August date is real and about to pass.** Three questions; the leaned defaults are already written on the ticket and are safe to build if she stays silent. |
| `741af39f` pay from attendance | How teachers are actually paid. No staff record carries a rate, and only hourly is storable. |
| `d4bc2603` monthly payments | Whether the existing 6% is the monthly uplift, and what happens when a family switches after invoicing. |
| `832f07e0` refunds | Whether they want a real reversing-entry flow at all. |
| `b0d6324a` (half) | The authoring half is built. Whether that was the friction she meant is still hers to confirm. |

---

## 4. Open questions this sweep raises

- **Two-day classes and shared waitlists.** `dbfe0f0f` asked for enrollment in one section
  to clear the waitlists of all sections, and that is what shipped. But iCreate's per-day
  split classes are siblings by name, so accepting Choir (Tuesday) now also drops the
  Choir (Thursday) queue. Flagged in the client note; easy to exempt if she wants both.
- **Class prices are still readable by a coordinator elsewhere.** The class report is
  redacted, but `/api/sis/classes` returns `price_cents` and the classes page shows it.
  Fixing that properly means deciding whether a coordinator manages classes without seeing
  what they cost, which is a product call rather than a leak to patch quietly.
