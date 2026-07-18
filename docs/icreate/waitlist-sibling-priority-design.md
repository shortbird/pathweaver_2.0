# Waitlist Sibling Priority + Refundable Fee — Design

**Status:** BUILT 2026-07-18 (pending local verification). Extends the
age-group enrollment waitlist ([age-group-waitlist-gating-design.md](age-group-waitlist-gating-design.md)).

**Problem:** iCreate waitlists kids under a certain age. This breaks when a family
has both a waitlistable younger child and an older child who *can* be accepted —
the older child shouldn't be held up, and the family shouldn't have to choose
between registering now and keeping the younger child's place in line.

## The rules we shipped

1. **Register the whole family at once, pay up front.** Parents register all
   their kids in one funnel and pay the registration fee even for kids in a
   waitlisted age band. Clear messaging says the fee **holds the child's place
   in line** and is **fully refunded if they aren't accepted**. (Previously the
   fee was *deferred* for fully-waitlisted families; that path is gone for new
   registrations — see "Fee model" below.)

2. **The live waitlist is frozen.** Everyone already waiting keeps their exact
   spot. Sibling priority reorders **future registrations only**.

3. **Sibling priority.** A waiting child whose household has an **accepted
   sibling** (an older kid in a non-waitlisted band, or a sibling already
   released off the waitlist) is prioritized over waiting children with no
   accepted sibling — but only within the post-freeze cohort.

4. **Waitlisted kids still can't be scheduled.** A waitlisted child is a real,
   paid registrant, but the schedule builder blocks class selection until the
   school releases them (unchanged `_family_gate` behavior).

5. **Rejection refunds.** When the school decides a waitlisted child won't be
   offered a spot, staff mark them **Not accepted**, which refunds that child's
   share of the family fee and emails the family.

## Ordering: frozen prefix + two priority lanes

There is no `position` column — order is derived at read time. The comparator
sorts each age band's waiting rows into three lanes:

| Lane | Rows | Order within lane |
|------|------|-------------------|
| 0 | created **before** the cutoff (frozen prefix) | by `created_at` |
| 1 | created **after** the cutoff, household has an accepted sibling | by `created_at` |
| 2 | created **after** the cutoff, no accepted sibling | by `created_at` |

`ORDER BY lane, created_at`. Because frozen rows all predate the cutoff, they
always sort ahead of post-cutoff rows — no existing family ever drops a spot.

**Consequence (intentional):** a brand-new family with an accepted older sibling
still lands **behind everyone already waiting**; sibling priority only differentiates
them from *other new* registrants. This is the direct result of "freeze the live
waitlist" — you can't both freeze existing spots and let newcomers jump them.

**Cutoff:** `sis_settings.enrollment_waitlist_priority_since`, stamped to
deploy-time by the migration for every org that gates an age band. Unset → plain
FIFO (feature off).

**"Accepted sibling":** a household student member who is **not blocked**, where
blocked = has a waitlist row in `waiting` or `rejected`. So a non-gated older kid
(no row) or a released sibling counts; a still-waiting or rejected sibling does not.

Implemented in `sis_enrollment_waitlist_service.py`: `_priority_since`,
`_priority_households`, `_queue_sort_key`, `_order_waiting`; applied in both
`_position` (parent's "you're #N") and `list_entries` (staff card), which also
annotates a `priority` flag for the "sibling priority" badge.

## Fee model: pay up front, refund on rejection (Stripe)

- **No more deferral.** `submit_family` sets `fee_deferred = False`; every new
  family pays now. (Legacy `fee_deferred=True` registrations still reopen on
  release, for families who registered under the old model.)
- **Consent.** The fee step shows the hold-your-place / fully-refundable terms and
  a required checkbox when any kid is waitlisted; the ack timestamp is stored on
  the registration (`waitlist_refund_ack_at`).
- **Refund unit = proportional split of the (capped) family fee:**
  `round(fee_cents / num_kids)`, capped by what's left to refund. Because iCreate's
  fee is `lesser` mode ($50/kid capped at $125/family), refunding one kid of three
  returns `$125/3`, not the marginal $50 — a deliberately generous choice.
- **Cumulative guard:** `icreate_registrations.refunded_cents` prevents refunding
  more than was charged across multiple rejections in one family.
- **Mechanics:** `reject()` → `_process_refund()` issues a Stripe partial refund
  against the family's `stripe_payment_ref`; a record-only org (no Stripe key /
  no captured payment) records the intended refund without moving money.

## Schema (`20260718_sis_waitlist_sibling_priority.sql`)

- `sis_enrollment_waitlist.status` CHECK gains `'rejected'`.
- `sis_enrollment_waitlist`: `rejected_by`, `rejected_at`, `refund_cents`, `stripe_refund_id`.
- `icreate_registrations`: `refunded_cents` (default 0), `waitlist_refund_ack_at`.
- Stamps `sis_settings.enrollment_waitlist_priority_since = now()` for gated orgs.

## Not done / follow-ups

- No "reject band" bulk action (per-student reject only).
- Refund assumes `stripe_payment_ref` is a payment intent (`pi_…`); a registration
  that only ever stored a session id would need a manual refund.
