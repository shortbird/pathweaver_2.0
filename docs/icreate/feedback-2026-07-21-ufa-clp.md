# iCreate feedback — 2026-07-21 (UFA private school + CLP + Schedule Builder)

Raw feedback from the iCreate meeting, organized into buildable features and
mapped to the current codebase. Nothing here is implemented yet.

## What already exists (grounding)

- **UFA flat tuition** is already modeled: students carry
  `users.sis_tuition_plan = 'ufa_academy'` (staff checkbox in
  `frontend/src/pages/sis/StudentDetailModal.jsx`), and the org's
  `feature_flags.sis_settings.block_pricing.ufa = { year_cents: 475000, min_blocks: 5 }`
  drives a flat-price override plus a "must schedule at least 5 blocks" banner in
  `frontend/src/pages/ScheduleBuilderPage.jsx` (see `ufa` / `ufaShortfall`).
- **Supply fees** exist per class (`supply_fee`); the CLP page already renders
  per-day supply totals in its schedule grid (`supplyByDay` in
  `frontend/src/pages/sis/ClpPage.jsx`); the Schedule Builder only shows a
  lump-sum "Includes $X in supply fees."
- **Funding intent** ("Utah Fits All", "Self-Pay", "OpenED"…) is a registration
  question answer surfaced on CLP as `family.payment_intent`
  (`backend/services/sis_clp_service.py::_family_payment_intent`).
- **Week structure** (Master 26-27 class list): Mon/Wed program days (7 classes)
  plus a large Tue/Thu a-la-carte catalog — matching the M/W vs T/Th language in
  the feedback.
- **Public, unauthenticated schedule data** already exists:
  `GET /api/icreate/schedule-preview/<invitation_code>`
  (`backend/routes/icreate_registration.py`) returns open classes + time blocks
  and powers `/schedule-builder/preview/:previewCode`.
- **Registration questions** are org-configurable
  (`ICreateRegistrationSettings.jsx` → answers in `sis_registrations.answers`) —
  the closest existing thing to "an Optio form".

---

## A. UFA private school requirements in the Schedule Builder
*(feedback items: requirements confirmation, 3-days/5-blocks rule, learning-day
rules, flat tuition display, 4th-day extra charge)*

**The rules as stated:**
1. UFA private school = 3 instructional days with a minimum of **5 blocks of
   in-person classes**. (The 5-block minimum is already enforced via
   `block_pricing.ufa.min_blocks`.)
2. One of the 3 days may be an **at-home day**:
   - No M/W classes → they **must** choose the *Elementary At-Home Academic
     Learning Day* (form — see section B).
   - M/W classes only (2 campus days) → they must choose **either** *Quest
     Learning Day* **or** *Elementary At-Home Academic Learning Day*.
3. Tuition is a **flat $4,750** + supply fees for any Tue/Thu classes.
4. UFA covers **3 days**; if a family schedules a **4th day**, they must see the
   extra charge they'll pay personally.

**Build: a "UFA requirements" checklist panel** on the Schedule Builder, shown
only when `tuition_plan === 'ufa_academy'`, replacing today's single
min-blocks banner. Checklist rows (live-updating as classes are added):

- [ ] At least 5 in-person blocks scheduled (`totalBlocks >= ufa.min_blocks`)
- [ ] 3 instructional days: campus days with classes + chosen learning day
- [ ] Learning-day choice made (Quest Learning Day / At-Home Academic Learning
      Day / not needed), with the M/W conditional logic above
- Tuition line: **$4,750 flat** + itemized supply fees (per day, section C2)
- If days-with-classes + learning day > 3: an **extra-day charge** line —
  "Your 4th day isn't covered by UFA — you'll pay $X personally"

**Config**: extend `sis_settings.block_pricing.ufa` with the day rules, e.g.
`{ year_cents, min_blocks, included_days: 3, campus_day_groups: [[1,3],[2,4]] }`
rather than hard-coding M/W and T/Th.

All open questions for this section are resolved — see **Decisions** at the
bottom of this doc.

## B. Elementary At-Home Academic Learning Day form
*(feedback: "1 at-home day, 'Elementary Academy Learning Day Options' document
turned into an Optio form")*

A parent-facing form, reachable from the UFA checklist (and probably from the
schedule page generally), whose completion satisfies the "learning day chosen"
requirement. Response stored per student; visible to staff on CLP.

- Simplest storage: a new `sis_learning_day_selections` table
  (org, student, choice, answers jsonb, submitted_at) — or fold into the
  approval-submission record in section C3.
- **Blocked on content**: need the "Elementary Academy Learning Day Options"
  document to know the fields/options. Please share it.

## C. Schedule Builder improvements (all students or UFA-flagged)

1. **Empty-block gap indicator** — a student on campus can't have a free block
   between two classes. Per day: if any uncovered teaching block sits between
   two covered blocks, flag it — amber banner ("Jane has an open block between
   classes on Tuesday — on-campus students must be in a class every block") and
   highlight the offending gray slot on the calendar. The coverage math already
   exists in `fullDayGaps`; this generalizes it to "interior gaps on any day
   with 2+ classes".

2. **Daily supply-fee totals** — port the CLP `supplyByDay` rendering into the
   builder's `WeeklySchedule` (per-day footer under each column), matching the
   CLP look.

3. **"Submit for iCreate approval" button** — parent-facing button with an
   info icon/tooltip: "Sends this schedule to iCreate to approve and set up
   billing." Needs:
   - Backend: submission state per student schedule (submitted_at, submitted_by,
     status: draft/submitted/approved), probably a small
     `sis_schedule_submissions` table; email/notification to org admins.
   - Staff side: a queue (SIS admin or CLP) to review + approve or send back.
   - Decided: submit locks parent edits + notifies staff; approval is
     status-only (billing outside Optio); send-back unlocks.

## D. CLP page (staff-facing)

1. **Mark CLP finished** — per-student "CLP complete" toggle so staff can track
   which families are done. Show a badge in the directory list + a filter
   (e.g. "hide finished"). Storage: `sis_clp_status` table
   (org, student, finished_at, finished_by) — same table can hold notes (below).

2. **Meeting notes** — a staff-only, autosaving notes box on the student detail
   (hidden in presentation mode so parents don't see it on the shared screen).

## E. Live schedule widget for the iCreate website

Expose the live class schedule (names, days/times, seats) for embedding on
iCreate's own site. The public `schedule-preview` endpoint already returns
exactly this data without auth.

Decided shape: a public read-only page (e.g. `/schedule/<org-slug>` or
reusing the invitation-code style token) rendering the **weekly grid**,
display-only (no links into registration), plus a copy-paste `<iframe>`
snippet shown in SIS settings ("Embed your live schedule"). A JS widget
script is more work for little gain; iframe first.

---

## Suggested build order

| Phase | Items | Why first |
|-------|-------|-----------|
| 1 | D1, D2 (CLP finished + notes), C2 (daily supply fees) | Small, unambiguous, staff need them for ongoing CLP meetings |
| 2 | C1 (gap indicator), A (UFA checklist + tuition + 4th-day charge) | Core correctness for UFA families; needs the open questions answered |
| 3 | B (at-home form) | Blocked on the source document |
| 4 | C3 (submit for approval), E (embed widget) | New workflow/surface; needs approval-semantics decisions |

## Decisions (Tanner, 2026-07-21)

1. **4th-day extra charge**: a-la-carte — the sum of the normal per-class
   prices for the classes on the extra day, plus their supply fees.
2. **Quest Learning Day**: NOT an enrollable class — it's a recorded choice
   (like the at-home option), stored as a learning-day selection.
3. **UFA flag**: reuse `sis_tuition_plan = 'ufa_academy'` — every flagged
   student is a UFA private school student; all new rules key off it.
4. **Submit for iCreate approval**: submitting locks the schedule from parent
   edits and notifies iCreate staff (review queue). Approval is status-only —
   billing happens outside Optio. (Implication: "send back" must unlock;
   approved schedules stay staff-managed.)
5. **Embed widget**: read-only weekly grid, display-only (no links into
   registration).
6. **Day counting**: an at-home learning day (Quest Learning Day or Elementary
   At-Home) counts toward the 3 instructional days but NOT toward the 5
   in-person blocks.

## Remaining blocker

- The "Elementary Academy Learning Day Options" document — needed to build the
  form's fields/options (section B). Everything else is unblocked.
