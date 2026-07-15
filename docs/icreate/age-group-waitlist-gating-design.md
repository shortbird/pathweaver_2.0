# Age-Group Enrollment Waitlist — Design

**Status:** BUILT 2026-07-15 (pending local verification) — enrollment-level waitlist, NOT per-class
**Source:** iCreate SIS feedback FAB, 2026-07-15 (Marika Connole, /registration):
> "When a family enrolls, if we have enabled a waitlist for a certain age of kids, it would
> be nice to toggle age groups off or on if they are able to start selecting classes or if
> we need to waitlist them. On the family end of things, I think it would be nice if they
> can see a message saying that student will be waitlisted as soon as they input a student
> of a certain age. Then, if we toggle an age group to the on position, the parent could
> automatically be notified that their student could now choose classes? ... we probably
> need to be able to allow for only some students to get off the waitlist. IE if we
> discover we have room for 9 more kids to enroll and there are 12 on the waitlist in
> those age groups, then we need to only allow the 9, not the entire age grouping."

## Model (the key decision)

This is a **student-level enrollment waitlist**, not a class waitlist. A student in a
gated age band is waitlisted as a person: they complete registration, but they cannot
select classes at all until the school releases them. This is distinct from (and
coexists with) the existing per-class waitlist for full classes.

## Proposal

### 1. Org-level age gates (SIS Registration page)

New `sis_settings.enrollment_age_gates` in `organizations.feature_flags`:

```json
"enrollment_age_gates": [
  { "min_age": 5, "max_age": 9, "mode": "waitlist" }
]
```

- Default (no matching gate): open — behavior identical to today.
- Age = as of first day of school (same `age_on` math as everywhere else).
- No DOB: gate does not apply (unknown age never blocks; the builder already
  nags about missing birthdates).
- Applies to **new registrations only** — students already enrolled in classes
  are never retroactively waitlisted by turning a gate on.
- UI: an "Age groups" card on the Registration page — add/remove bands, each
  with an Open / Waitlist toggle.

### 2. Waitlist state (new table `sis_enrollment_waitlist`)

```
org_id, student_user_id, household_id, age_snapshot, band_label,
status (waiting | released), created_at, released_at, released_by
```

- A row is created when a gated-age student is registered. Position = created_at
  order within the band.
- Releasing (status → released) is what unlocks class selection. The gate toggle
  does NOT auto-release existing rows — Marika's "only allow the 9" case. Turning
  a band to Open only affects future registrants; a "Release all waiting in this
  band" bulk action (count-confirmed) covers the everyone case.

### 3. Parent-facing behavior

- **Registration funnel, student entry step:** the moment an entered DOB lands in
  a waitlisted band, show inline: "Students ages 5-9 are currently joining a
  waitlist. You can finish registering [name] — the school will let you know when
  they can choose classes." Registration (paperwork, fee, siblings) continues
  normally.
- **Schedule Builder:** a waitlisted student's week renders read-only with a
  banner ("[Name] is #4 on the waitlist for ages 5-9 — you'll get an email when
  they can choose classes") instead of "+ Pick a class" slots. Siblings outside
  the band are unaffected.
- Tuition: a waitlisted student contributes nothing to the tuition estimate
  (they have no classes).
- No exception-request link for gated bands — the waitlist IS the queue.
  (Decided 2026-07-15.)

### 4. Staff-facing (Registration page)

An "Enrollment waitlist" card, grouped by age band:

- Each band: count waiting, list of students (name, age, family, requested date,
  position) with a per-student **Release** button — releases exactly that student
  (the "9 of 12" case).
- Bulk: "Release all N waiting" per band.
- Staff direct enrollment of a waitlisted student (from Families/Classes) is an
  implicit release — staff action IS the override, same principle as age
  exceptions and capacity.

### 5. Notifications (automatic, Brevo transactional)

- On release: email the guardian — "[Student] can now choose classes at
  [school]" with a Schedule Builder link. (Decided 2026-07-15: automatic.)
- Parent emails only — never students.

## Decided (Tanner, 2026-07-15)

1. Tuition excludes waitlisted students until released/enrolled.
2. Release is per-student (the enrollment model makes "class-by-class" moot —
   per-class waitlists for full classes are unchanged and still release
   seat-by-seat via Offer next).
3. No exception-request escape hatch for gated bands.
4. Release notifications are automatic via Brevo.

## Decided (Tanner, 2026-07-15, round 2)

5. Registration fee DEFERS when every student in the household is waitlisted:
   the funnel completes unpaid (`icreate_registrations.fee_deferred`); the
   first release reopens the registration at the fee step (resumable at
   /register/icreate/resume with the normal Stripe flow) and holds the
   household (`registration_hold`, reason mentions the fee) until it's paid.
   Paying clears the hold; paying EARLY (before release) also clears the
   deferral so a later release never reopens a settled registration.
6. Parents see their student's position in line ("#4 on the waitlist for
   ages 5–9"), matching per-class waitlist behavior.

## Implementation map

- Migration: `supabase/migrations/20260715_sis_enrollment_waitlist.sql` (applied to prod)
- Service: `backend/services/sis_enrollment_waitlist_service.py`
- Funnel gating + fee deferral: `backend/routes/icreate_registration.py`
- Add-block + schedule payload: `sis_parent_service._family_gate` / `student_schedule`
- Staff endpoints: `routes/sis/registration.py` (/api/sis/enrollment-waitlist*)
- UI: RegistrationPage (AgeGatesCard, EnrollmentWaitlistCard),
  ICreateRegisterPage (DOB notice, deferred fee step), ScheduleBuilderPage
  (read-only week + position banner, fee-due hold link)

## Rough scope

- Backend: migration (table + default grants come free), gate evaluation on
  registration + Schedule Builder payload, release/bulk endpoints, Brevo email
  hook — ~1 day.
- Frontend: settings card, funnel notice, builder read-only state + banner,
  staff waitlist card — ~1 day.
- Out of scope v1: auto-release counters ("open when N drop"), SMS, date-based
  gate scheduling.
