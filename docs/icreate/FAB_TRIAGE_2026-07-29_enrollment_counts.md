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

> Not verified against production data: this session has no Supabase access to
> the iCreate project, so the diagnosis is from the code path plus the symptom
> pattern, not from counting rows in the database. To confirm the cap was the
> trigger: `select count(*) from class_enrollments ce join org_classes oc on
> oc.id = ce.class_id where oc.organization_id = '<icreate>' and ce.status =
> 'active';` — a result above 1000 is the confirmation. After deploying, the
> class list should agree with every roster.

---

## The one part that is not this bug: Van Stanfill

His son really is on the waitlist, and that is working as designed — but it needs
a human action Molly may be waiting on.

A freed seat is **never auto-filled**. When someone drops, the next waitlisted
student stays waiting until an admin uses **Offer next seat** on the class's
Waitlist tab. That was a deliberate call so iCreate vets who comes off the
waitlist (see [FAB_TRIAGE_2026-07-27.md](FAB_TRIAGE_2026-07-27.md), which
answered the same question for Theater JR). `alert_admins_seat_opened` emails the
admin team when a seat opens on a class with people waiting.

So the likely sequence: Lego Robotics filled, his son joined the waitlist, a
student later dropped, and the seat has been sitting open since. Fixing the
counts makes the open seat visible; it does not fill it.

**This is the second round of feedback where the manual-offer rule has caused
confusion.** The deferred "auto-promote the next waitlisted student when a seat
frees (opt-in per class)" item is worth promoting to a real decision rather than
answering the question a third time.
