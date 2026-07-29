# iCreate class-list enrollment counts collapsing — 2026-07-29

Three bug reports came in through the SIS feedback button (FAB) from
`dmchrplus@gmail.com` (Molly Christensen) within 22 minutes, all on `/classes`:

| Time (UTC) | Report ID | What she saw |
|---|---|---|
| 21:58 | `61125c8e-7e21-46fe-b3df-ad4db63bd39e` | "outdoor adventure on tuesday … was full with 12/12 students in it. And now it's 0/12." |
| 22:02 | `12255985-3fcc-4c6b-8ea9-18570ba80230` | "thursday sword of truth had 6/16, and now it's 5/16 … I was offering people seats and then I started noticing that some of these have changed enrollment. Middle school microschool B used to have more too." |
| 22:20 | `30931eda-013f-4042-9ad8-2115c616ce6e` | "Lego robotics says 13/15, then I look at the roster and there are 14 on the roster, and then I had someone just message me saying her son is waitlisted. (Van Stanfill.)" |

**These are one bug, and it is a display bug.** No student was dropped, no
enrollment was lost, and nobody was enrolled or waitlisted incorrectly by it.
The *numbers on the class list* were under-reporting.

---

## Root cause: PostgREST truncated the count read, silently

Supabase caps a single Data API response at `db-max-rows` (1000 by default) and
gives the client **no signal** that it did so — a truncated read is
indistinguishable from a complete one.

`SisClassRepository.enrollment_counts_for_classes()` built the whole class
list's counts by fetching **every active `class_enrollments` row for the org in
one request** and tallying them in Python:

```python
resp = (self.client.table('class_enrollments')
        .select('class_id').in_('class_id', class_ids)
        .eq('status', 'active').execute())        # <- silently capped at 1000
```

While iCreate had fewer than ~1000 active enrollments this was correct. As
families kept picking classes the org crossed the cap, and every enrollment row
past the cut vanished from the tally. So the displayed counts **fell as more
students enrolled** — which is why it looked like students were disappearing.

That accounts for each report exactly:

- **`12/12` → `0/12`.** Molly had just filled Outdoor Adventure by offering
  seats, so its rows were the newest — contiguous, and entirely past the cut. All
  twelve dropped out of the tally at once.
- **`6/16` → `5/16`**, Microschool B "used to have more". Classes straddling the
  boundary lose one or two rows.
- **List says `13/15`, roster says `14`.** The roster tab
  (`routes/sis/catalog.py`) reads *one* class — 14 rows, never truncated, so it
  was right. The class list read the whole org and came back short. Two reads of
  the same fact disagreeing, with the org-wide one always lower, is the
  signature of this bug.

Same defect, same shape, in four other org-wide reads: the per-class waitlist
counts, the class-meetings read (a truncated read blanks out day/time), the
supply-budget roster tally (a low count means a budget ceiling *below* what
families actually paid — the round-6 feature Molly is verifying now), and the
schedule-conflict scan (a short read hides real conflicts).

### Why the enrollment itself was never wrong

The decision points don't use these tallies. Both the family self-service add
(`sis_parent_service.add_class`) and the waitlist claim path re-count that one
class with an exact `count='exact'` query before deciding to enroll or waitlist.
So capacity was always enforced against the true number.

---

## The fix

New `backend/utils/db_fetch.py` — `fetch_all_rows(build_query)`, which pages
until a short page comes back, ordering by a unique column so pages can't skip or
repeat rows. Applied to every org-scoped bulk read above:

| File | Read |
|---|---|
| `repositories/sis_class_repository.py` | `enrollment_counts_for_classes`, `waitlist_counts_for_classes`, `meetings_for_classes`, `list_for_org` |
| `services/sis_supply_budget_service.py` | `_enrolled_counts` |
| `services/sis_registration_service.py` | `list_schedule_conflicts` |
| `services/sis_engagement_service.py` | class quests + enrollments (already chunked by class id; the *rows* were unbounded) |

Tests: `backend/tests/test_db_fetch_paging.py` (12) plus one added to
`tests/services/test_supply_budget.py`. They run a fake client that enforces a
row cap and assert the counts stay exact — including the "full class reads 0/12"
case specifically. The old code fails them.

### Verified against production

| Check | Result |
|---|---|
| Project's PostgREST `max_rows` | **1000** |
| iCreate active enrollments | **1070** — 70 rows past the cap |
| Non-archived classes | 154 |

Emulating the capped read (`… WHERE status='active' LIMIT 1000`) and diffing the
resulting tally against the true per-class counts reproduces her numbers:

| Class | Real | List showed | Capacity |
|---|---|---|---|
| Lego Robotics (Non-competition) | **14** | **13** | 15 |
| Sword of Truth (Tuesday) | 16 | 15 | 16 |
| ALD: Academic Learning Day (At Home) | 8 | **0** | — |
| QLD: Quest Learning Day (At Home) | 7 | **0** | — |
| Creative Explorers: Nature & Art (Tues, Block 4) | 11 | 7 | 12 |

34 classes were affected in that single sample — most losing 1–2, two reading
zero. "Lego robotics says 13/15 … there are 14 on the roster" is reproduced to
the digit.

**Nothing was dropped.** Outdoor Adventure (Tuesday) — the `0/12` she reported —
holds **12 active enrollments and zero withdrawals**. Sword of Truth (Thursday)
still has the 6 she remembered. Which classes lose rows shifts between requests,
because the read has no `ORDER BY`; that instability is why the numbers appeared
to change as she worked.

One caveat on the reproduction: an unordered `LIMIT` in raw SQL need not pick the
identical 1000 rows PostgREST did, so the per-class breakdown is representative
rather than a byte-exact replay of what was on her screen.

After deploying, the class list should agree with every roster.

---

## The one part that is not this bug: the waitlisted son

He is **not** on the Lego Robotics waitlist — that class has zero waitlist
entries. He is held by the **age-group enrollment gate**, which is a different
mechanism with a different fix, and that is why looking at the class list gave
Molly no explanation.

iCreate gates two bands in `sis_settings.enrollment_age_gates`, both in
`waitlist` mode: **ages 5–9** and **ages 10–11** (age judged as of the first day
of school, 2026-08-24). Current queue:

| Band | waiting | released |
|---|---|---|
| 5–9 | 1 (queued 07-27) | 12 |
| 10–11 | **1 (queued 07-29 — today)** | 0 |

A student in a gated band completes registration but **cannot select any class**
until staff release them. The 10–11 row was queued the same day the parent
messaged, and nobody has been released from that band yet.

**The action is Registration → Enrollment waitlist → Release** for that student —
*not* "Offer next seat", which only applies to a full class's own queue. Releasing
unlocks the Schedule Builder and emails the guardian.

Worth asking Molly directly whether gating ages 10–11 is still intended, since
the 5–9 band has been actively released (12 students) while 10–11 has released
nobody. If that band was switched on to manage a specific crunch and the crunch
has passed, it is now quietly blocking registrants.

### Separately: per-class seats sitting open

Three classes have a free seat *and* students waiting, which needs **Offer next
seat** on each class's Waitlist tab (a freed seat is never auto-filled — the
deliberate call recorded in [FAB_TRIAGE_2026-07-27.md](FAB_TRIAGE_2026-07-27.md)
for Theater JR):

| Class | Enrolled | Seats open | Waiting |
|---|---|---|---|
| Elementary Microschool (Monday) | 10/12 | 2 | 3 |
| Elementary Microschool (Wednesday) | 10/12 | 2 | 1 |
| Beginning Guitar Jam (Tues Block 1) | 5/6 | 1 | 3 |

**This is the second round where the manual-offer rule has caused confusion.**
The deferred "auto-promote the next waitlisted student when a seat frees (opt-in
per class)" item is worth a decision rather than a third explanation.

---

## Unrelated finding worth a look

**3D Modeling & Printing (Tues Block 5) is over capacity: 11 enrolled, cap 10.**
It is the only over-cap class in the org. Staff-side enrollment is intentionally
unrestricted (staff override is the override), so this is most likely deliberate
or an accident during hand-enrollment rather than a capacity-check failure — the
family self-service path re-counts with an exact query and would have waitlisted
the 11th. Worth confirming with Molly whether the cap or the roster is wrong.

Under the truncation this class displayed `10/10` — exactly full and unremarkable
— so the fix will make it start showing `11/10`. That is the correct number, not
a new bug.
