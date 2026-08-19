# Presence and Pay — discussion agenda for iCreate

**Date**: 2026-08-18
**Audience**: iCreate admins (client-facing; a formatted version was sent to them)
**Tickets**: `09255e75` (campus in/out), `741af39f` (teacher pay from attendance)
**Companion**: [BACKLOG_PLAN_2026-08-18.md](BACKLOG_PLAN_2026-08-18.md)

Twelve questions, plus two carried over from other tickets. Nothing here can be built
until they are answered — not because the engineering is unclear, but because the answers
depend on how the school actually runs.

**Hard deadline: classes begin 2026-08-24.** The in/out request was filed as "before
classes start."

## Context verified against the running platform

- Calendar is populated through April 2027: term starts, Labor Day, fall break,
  Thanksgiving, mid-winter and spring break. `sis_settings.first_day_of_school` =
  `2026-08-24`.
- 158 active classes, 141 with an assigned teacher, 19 with an assistant, 26 teachers.
- **Zero** attendance records and **zero** time-clock entries — neither system is in use
  yet. Nothing to migrate; both features can be designed around how they want to work.
- `sis_settings.block_pricing` carries `convenience_fee_pct: 6` and `installments: 10`.

---

## Request one — the campus in/out button

> "Before classes start, I think we also need an in/out button for the teens, who have a
> parent waiver to do so, to be able to come and go in and out of the building and it is
> only usable if they have a signed waiver to allow them to leave campus during regular
> class hours. That way we can know where they are at all times and they wouldn't even
> need to check in with an actual person before leaving although that would also be a nice
> courtesy. If said in/out button could also have them have to list a destination, that
> would be good."
>
> — filed 2026-08-14 from the Community page

### What exists

| | |
|---|---|
| Have | Per-class attendance; everyone defaults present, teacher marks exceptions |
| Have | Guardian-reported planned absences, surfaced on the teacher's roster |
| Have | Gap alerts — present earlier, missing later → office and guardian notified |
| Have | Family document signing with signature tracking, reminders, and a portal hold |
| Partly | `elsewhere_on_campus` — one of five reasons for *closing* an alert, set after the fact |
| Not yet | Any record of leaving the building: no destination, no time out, no time back |
| Not yet | Any per-student permission the system enforces |
| Not yet | Any record a student is on campus outside a class they're enrolled in |

### The crux

An "out" button implies an "in" the system doesn't have. Today the school only knows a
student is present because a teacher marked a class roster; a teen with a free block is
invisible either way. A whole-day check-in was built for the platform and **removed in June
2026** (`migrations-archive/20260630_drop_sis_checkins.sql`) — we should not rebuild it by
accident.

### Build shape

1. A per-student "may leave campus" permission the system enforces — the first of its kind
   in the platform.
2. The waiver, sent via the existing `send_for_signature(audience='family')` machinery.
3. The button and the log: sign out with destination, sign back in, both timestamped.
4. A front-desk live view of who is off campus right now.
5. Attendance integration so a signed-out student reads as "off campus, signed out 11:05"
   rather than an unexplained absence, and the automatic alert doesn't fire.

**For 24 August**: steps 1, 3 and 4 only — the office ticks who is approved, those students
get the button, the front desk gets the live list. Works off the paper waivers they already
hold. Steps 2 and 5 follow. Needs B1, B2 and B6 answered within a day or two.

### Questions

- **B1** — Does tapping "in" mean arrived at school, or only back from being out?
  *Our lean: start narrow (departures and returns only). It cannot create false absences.*
- **B2** — Who gates the button: the signed waiver, an office toggle, or an age cut-off?
  *Our lean: waiver grants, office overrides either way, age floor as a safety net.*
- **B3** — What does the waiver permit, and how long does it last? One blanket permission
  is simplest; finer grain (lunch only, named destinations, only with a parent) means a
  separate permission and signature each. Does a second guardian need to sign?
- **B4** — Destination free text or a controlled list? Required or optional? Expected
  return time? *Our lean: short editable list plus "other"; destination required, return
  optional.*
- **B5** — Who is notified on sign-out, what is the grace period if they don't return, and
  does the parent hear about it?
- **B6** — Tablet at the door or their own phones? *Our lean: tablet for day one — needs
  nothing from students beforehand. Phones later for stronger identification.*

---

## Request two — paying teachers from the schedule

> "I was thinking our time calculations for teachers would be a lot simpler if we did NOT
> have teachers track their time. Ideally, we would be able to track all of a teacher's
> attendance for classes, and then have a way to calculate their pay based on that. Then if
> there was a substitute, they could mark who was the sub for that day, and then that would
> be calculated on the sub's payroll calculation. And then we could also have them track if
> they attended meetings too (for payroll as well). That said, we don't have to take the
> time sheets out, those may be useful for other employees."
>
> — filed 2026-08-14 from a class page

### What exists

| | |
|---|---|
| Have | Time clock: clock in/out, office edits with a reason, period approval, payroll CSV |
| Have | Weekly class schedule — day, start and end time, room |
| Have | Lead teacher on 141 of 158 classes; assistants on 19 |
| Have | School calendar with term starts and every closure through spring 2027 |
| Partly | Closures are free-text titles; `calendar_categories` has no closure category |
| Partly | "Substitute" is a schedule label and a request form; neither links to class, date or pay |
| Not yet | Any record that a class met, or that a particular teacher taught it |
| Not yet | Start/end dates on a class — a three-week camp and a year-long class look identical |
| Not yet | Pay rates: none of the six staff records has one; `pay_type` is never branched on |

### The crux

To pay from the schedule the system must answer "which days did this class run?" on its
own. It nearly can. Two gaps: closures are written as titles rather than tagged, so a
derivation would be string-matching `NO CLASS` and hoping nobody typos it; and no class has
a run of dates. Neither is a big build — the first is largely a labelling convention on
iCreate's side — but both must be right before any figure can be trusted.

### Build shape

1. Make the calendar countable: a closure tag, plus start/end dates per class.
2. Expand pattern + calendar into dated sessions with a length and an assigned teacher.
3. Exception-only confirmation: sessions are assumed to have happened; a teacher marks only
   what differed. Mirrors how the attendance page already works.
4. Meetings and duties become payable items with attendance.
5. One payroll export blending derived and clocked hours; timesheets stay for non-teaching
   staff via the existing per-person `uses_time_clock` flag.

### Questions

- **A1** — Hourly, per session, or a flat amount per class? *Decides the shape of
  everything else. The schema can only store an hourly rate today.*
- **A2** — Scheduled time or actual time? *Our lean: scheduled block plus a fixed allowance
  if wanted — anything else puts teachers back to recording time.*
- **A3** — What happens on a day that doesn't run? Scheduled closures, versus a class
  cancelled the morning of with the teacher already on site.
- **A4** — How are assistants paid on the 19 classes that have one? Does an assistant
  covering alone count as a substitute?
- **A5** — Who records a substitute, and does the office approve before it reaches payroll?
  Half a session, half the pay? *Our lean: either records it; lands in the existing pay
  period approval queue.*
- **A6** — Which meetings and duties are paid, who takes the register, and are meetings paid
  at the teaching rate?

---

## Carried over from other tickets

- **C1** (`d4bc2603`) — How exactly does the monthly payment price change? We can see a 6%
  convenience fee and a 10-instalment plan configured against block pricing. Confirm the 6%
  is the monthly uplift, whether it applies beyond block-priced tuition, and what happens
  if a family switches after an invoice is issued. **They need to know the family's choice
  before invoicing**, which is what makes this a pricing change rather than a button.
- **C2** (`b0d6324a`) — What is still awkward about onboarding versus forms? Both already
  appear together in the Task Center; keeping the records separate is deliberate.
