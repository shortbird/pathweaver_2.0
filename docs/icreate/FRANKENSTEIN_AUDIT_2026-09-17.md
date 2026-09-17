# The iCreate experience, audited for Frankenstein code

**Date**: 2026-09-17, verified against `main` at `f685a2ab`.
**Scope**: every surface an iCreate org admin, campus coordinator, parent or student
touches — the SIS console, the registration funnel, the family pages on the web
platform, the student pages, and the mobile app where it reaches the same data.
**Method**: three code sweeps (backend, SIS web, parent/student) on 2026-09-14 at
`b842213b`, re-run line by line on 2026-09-17 after seventy commits landed, plus
production counts read over the Supabase MCP and the open tickets in `bug_reports`.
Every `path:line` below was checked against `f685a2ab`; a script confirmed each
cited file exists and each line is inside it.

## 1. Headline

"Frankenstein" here means one concrete thing: **the same entity or concept exists
several times, built on different days for different tickets, and the copies
disagree.** iCreate asked for features in eleven rounds between 2026-06-23 and
2026-09-10, most of them one-day builds answering that week's feedback. Each round
added a feature beside the one that already did most of the job. The console works,
and iCreate runs on it every day (2,432 attendance rows, 188 invoices, 211 classes,
98 households), but the seams show wherever two copies of one fact are read on two
screens.

Two production incidents came straight from duplicates: an announcement written once
existed as two database rows and showed up twice or not at all (2026-08-01,
2026-08-28), and a tuition invoice once "billed a number the family was never shown"
because the price on the Schedule Builder and the price on the invoice were computed
by different code. Twenty-six iCreate tickets are open today; about a third of them
are symptoms of a duplicate surface (section 4 names them).

| What is duplicated | How many |
|---|---|
| Gates that can stop a family | 8 (one fully orphaned, one enforced only by the web router) |
| Ways the school talks to people | 9 send paths; 2 announcement tables, double-written; 4 "tell staff about a registration" paths |
| Money: pricing engines / invoice writers / Stripe checkout sites / poll-verifiers | 4 backend + 2 browser mirrors / 3 (+5 caller shapes) / 7 / 2, no webhooks |
| Calendar and schedule concepts | 7 across 6 tables and 1 JSON blob; 6 calendar reads; 3 "what is today" assemblers |
| Places that show one student / family / staff member / class | 6 (+1 on the learning app) / 4 / 6 / 6 |
| Queue pages, each with a private status vocabulary | 9 pages, 15 status maps in 14 files |
| Places an admin configures the school / last-write-wins writers of one JSON column | 5 / 12 components, 17 write sites |
| Registration funnel renderings | 3 (live, preview mode, a hand-written copy for the setup editor) |
| Training systems | 2 (quest-based and link-based, since 2026-09-15) |
| Kiosks | 2 (generic and Treehouse) |
| Copies of the same backend org-resolution helper | 27, in 3 variants, 3 of them carrying a bug fix the other 24 lack |
| Hand-rolled UI: input recipes / tab bars / sort headers / `money()` / `fmtTime` / raw tables | 36 / 14 / 6 / 10 web + 5 backend / 9 / 23 |

Three decisions frame what follows, made 2026-09-14:

1. **This document is the deliverable.** No code changed. Each roadmap move in section
   5 is its own later piece of work.
2. **Other schools are constraints.** Gryffin (8 families), Optio Academy (12), Horizon
   (2), Arete (63 students on a kiosk) and the Treehouse (2 live kiosk devices) share
   this console. Nothing they use may break, and modules iCreate hides but they use —
   goals, kiosk, submissions, prior learning — stay.
3. **Keep everything, merge duplicates.** Unused features stay, including the fifteen
   SIS tables with zero rows anywhere (time clock, staff duties, resource acks, lost &
   found, learning-day selections, student records, the old cart registration, form
   templates, discount rules, payment reminders, and so on). Only *copies* get merged.
   Dead code that is not a feature — a write-only column, a retired route file — is
   listed separately in section 6 for a separate call.

A note on drift, because it decides how the roadmap has to be built. Between the
first sweep and the second, three days apart, upstream work **resolved four**
findings outright (one child list for parents, the `/api/icreate` alias, the missing
link from the admin class modal to the class page, the three People pages) and
**added seventeen new duplicates**: the settings-writer count doubled, a whole second
training system appeared, the org-resolution helper was copied twice more. The
feature cadence outruns any one-off cleanup. That is why every move in section 5
ships with a ratchet test in the repository's existing style
(`backend/tests/unit/test_one_definition_of_parent.py`,
`backend/tests/unit/test_direct_db_calls_do_not_grow.py`): the test is the
deliverable, the merge is what makes it pass.

## 2. How it got this way

Rounds reconstructed from `docs/icreate/*`, memory, and `git log --reverse` on the
SIS paths. The right-hand column is the duplicate each round left behind.

| When | Commit(s) | What landed | What it duplicated |
|---|---|---|---|
| 2026-06-23 to 06-26 | `90471b8d` and the phases after it | The whole SIS in four days: programs, classes, registration and enrollment, ordered waitlists, record-only billing, attendance, reports, notifications, same-day check-in | The cart-style class registration (`sis_registrations`) that the Schedule Builder replaced a week later and nothing ever deleted |
| 07-01 to 07-02 | `21625f10`, `1ff91947`, `6ff57190` | Schedule Builder, messaging overhaul, the iCreate registration funnel ported from OurSchoolHangout, registration tiers and holds, calendar, resources, family directory | Holds born in two stores at once (`households.registration_hold` and `sis_family_directives.registration_hold`); `registration_tier` written by three paths and, since tiers were dropped a week later, read by none |
| 07-07 | `60918fe5` | Funnel rework (schedule and appointment steps, photos, DOB), events calendar, AI schedule editor, time blocks | `sis_events` beside `class_meetings`; time blocks as JSON in `feature_flags` rather than a table |
| 07-10 to 07-15 | `163824f4`, `d1a4bcef`, `75fcd797` | Google-Sheet master schedule sync (built twice for two sheet layouts), age exceptions, the age-band enrollment waitlist, sibling priority | The second waitlist, sharing a word and a screen with the per-class one |
| 07-20 to 07-22 | `22c26581`, `0bc8d919`, `21d1cced` | CLP meeting view, attach-existing-accounts, UFA rules, schedule approval (later removed), teacher portal | A third student profile (`clp/StudentDetail.jsx`); a parent portal and a teacher portal built as two copies of one checklist/forms/documents machine |
| 07-23 to 07-25 | `8612e379`, `5ecb6b98`, `7e1eb3c2`, `34428995` | Billing redesign, registration config moved into Settings, secure documents, parent forms, embeds, Gryffin's goals/submissions/kiosk/gradebook | The org-generic kiosk beside the Treehouse one; the setup editor as a second hand-written funnel |
| 07-27 to 07-29 | `50147fef`, `6986c364`, `b7de1bbe`, `d08cf92a` | Funding source and school of record, processing fees and online pay, **Community Hub**, curriculum library, staff training, supply budgets | `sis_announcements` beside `announcements`; five fields that all mean "UFA private school" |
| 08-01 to 08-06 | `a7708e34`, `838c3d41`, `989a02c1`/`6169786c` | Campus coordinator role, CLP-done tuition approver (schedule approval removed), curriculum-as-container (built twice, six days apart), sign-by-typing, pay links, carpool | Third signature UI; three signed-token namespaces for "pay without logging in" |
| 08-09 | `6e2d36a2` | Coordinator portal: dashboard, task assignment, attendance resolution | Third dashboard; the forms queue rendered on two pages |
| 08-10 | `dc4c0d42` | Org-neutral registration funnel for Optio Academy | The `icreate_registration` config key kept as a legacy mirror, so every save writes two keys and every money guard has to list every field twice |
| 08-18 to 08-21 | `9c0aaf45`, `dc9ae8ce` | Backlog consolidation, payment-method visibility, adult phone-verification hold | A second whole-API hold middleware cloned from the first |
| 09-10 | `3ac8c3b6`, `544de655`, `fd5f13e1` | Requests v2: school inbox, class hub, quest resources, staff group compose; three announcement composers become one | The school inbox beside two older "message this family" endpoints (an orphan second school account had to be merged the same day) |
| 09-14 to 09-17 | `51d4bfda`, `469cd53a`, `6b3e3a72`, `2980a375`, `47896b71` | One People table, one Forms page for families, the school as one page with tabs, training links, coordinator role grants | Training links as a second training system; five more settings cards each writing the whole `feature_flags` blob |

Two things the history makes plain. First, several rounds *were* consolidations —
the People merge, Task Center, one announcement composer, the school page as tabs —
and section 5 builds on them rather than restarting. Second, the pattern repeats:
each consolidation merged the *list* or the *shell* and left the *writers* and the
*detail views* in place, which is where the next duplicate grows.

## 3. What each person sees

### 3.1 The org admin (Molly, Marika, and eight others)

The sidebar (`web/src/components/sis/SisSidebar.jsx:61-159`): Dashboard, People,
Community; Academics (Classes, My Classes, My Schedule, CLP, Calendar, Attendance,
Submissions, Prior Learning); Tasks & Documents (My Tasks, Onboarding, Task Center);
Operations (Registration, Reports, Resources, Curriculum, Training, Messaging); Time &
Money (My Time, Timesheets, Tuition, Billing); Settings and My Profile. Twenty-six
items. Three of them are doors onto the same rows as another item.

What the admin hits, screen by screen:

- **People** is now one table (`web/src/pages/sis/PeoplePage.jsx`), which is right. But
  clicking a row opens one of nine modals mounted on that page
  (`web/src/pages/sis/PeoplePage.jsx:305-357`), and editing one teacher fully means
  opening `StaffDetailModal`, then `TeacherModal`, then `StaffProfileModal`, then
  `LinkStaffAccountModal` in sequence (`web/src/pages/sis/PeoplePage.jsx:308-340`).
  A phone number can be edited in four of them. The `+ Add` menu offers Person,
  Teacher and Family — three creation paths that end in the same table
  (`web/src/pages/sis/PeoplePage.jsx:223-227`).
- **A student** opens `StudentDetailModal` from People and from inside the family
  modal, a different profile on the CLP page (`web/src/pages/sis/clp/StudentDetail.jsx`,
  38 props), a day view on Attendance, a progress panel on a class, a roster row on a
  class, and — the one ticket `7962081e` was filed from — the learning app's own
  admin student page at `/admin/organizations/<org>/student/<id>`, which cannot rename
  a child without an email. None of these is a superset of the others.
- **A family** is a modal on People, a row on Tuition, a ledger on Billing with no
  link back to the modal (`web/src/pages/sis/BillingPage.jsx:168`), and an email
  address on Registration (`web/src/pages/sis/RegistrationPage.jsx:409`).
- **A class** is a card or a table row on Classes, a create modal, a detail modal that
  embeds the create modal again (`web/src/pages/sis/classesPage/ClassDetailModal.jsx:82`),
  and a second full class page (`web/src/pages/sis/TeacherClassPage.jsx:66`, six tabs).
  The link between the two was added on 2026-09-15; the two remain.
- **Messaging** has a school inbox, a personal inbox and an announcements tab
  (`web/src/pages/sis/SchoolInboxPage.jsx`); the same announcement composer is also
  mounted on Community (`web/src/pages/sis/CommunityPage.jsx:108`); and the unread
  badge sums two counts while the bell counts a third
  (`web/src/components/sis/InboxUnreadBadge.jsx:50-60`). Ticket `4b364a4c`: "why does
  it say 9+ messages when I only have 3 unanswered?" Ticket `b32b2fca`: "this
  announcements thing isn't really working right now".
- **Onboarding** is a sidebar item *and* a tab inside Task Center; the sidebar's own
  comment defends both doors (`web/src/components/sis/SisSidebar.jsx:103-111`). The
  Requests queue on Task Center is the Forms page's queue imported wholesale
  (`web/src/pages/sis/TaskCenterPage.jsx:14`). Dashboard tiles deep-link to tab names
  a compatibility table has to remap (`web/src/pages/sis/TaskCenterPage.jsx:58`).
- **Training** has, since 2026-09-15, two ways to add a training (a quest or a link),
  two targeting models, two progress reports and two staff pickers on one page
  (`web/src/pages/sis/StaffTrainingPage.jsx:119`,
  `web/src/components/sis/TrainingLinks.jsx`). Six tickets were filed on `/training`
  on 2026-09-17.
- **Settings** is five places: the Settings page, the Registration setup tab (which
  also mounts two settings cards inside the funnel preview), the learning app's
  `/organization` page, Task Center's Templates tab and its routing modal, and the org
  settings card. Twelve components write the same JSON column with a read-spread-PUT,
  so two admins on two cards overwrite each other
  (`web/src/components/sis/SisOrgSettings.jsx:85`, `web/src/settings/cards/ParentDigestCard.jsx:43`
  — the latter's comment names the hazard and then does it).
- **Reports** was rebuilt as a list on 2026-09-16 and is much better to use; it still
  has its own column picker and sort model beside the three export modals, and prints
  through one of five print paths.

### 3.2 The campus coordinator (seven of them)

The coordinator is an admin minus money and HR (`docs/sis/ROLE_CAPABILITIES.md`), so
everything above applies. What is specific:

- The Time & Money section vanishes except My Time; the Billing tab in the family
  modal is hidden per field, correctly.
- Since 2026-09-14 a coordinator can grant every role below admin (`47896b71`). The
  rule is enforced in the service, not the route, which is the right place — and it
  means the "who can do what" answer now lives in three layers (route tier, service
  check, UI hiding), which the role-matrix guard test keeps honest.
- Ticket `ba6a89fc`, filed by a coordinator from the CLP page: "the waitlist says
  she's #14 for Art Expeditions, but when I go to Art Expeditions…" — the age-band
  enrollment waitlist and the per-class seat waitlist share a word, a screen, and a
  dashboard tile that counts only one of them (`web/src/pages/sis/SisDashboard.jsx:73`).
  This is the third round of that confusion.
- Masquerading as a parent-teacher and then finding "exit masquerade" says "not
  currently masquerading" (ticket `7e0a06dd`): the two whole-API holds each carry their
  own masquerade carve-out, added separately on 2026-09-16
  (`backend/middleware/signature_gate.py`, `backend/middleware/phone_verification_gate.py`).

### 3.3 The parent (93 families)

The journey, in order (`web/src/App.jsx` routes):

1. **Registration funnel** at `/enroll/<code>` (`web/src/pages/RegisterFunnelPage.jsx`,
   983 lines): account and OTP, family (parent photo, one card per child with photo,
   DOB, allergies), contacts and questions, paperwork with type-your-name signature,
   fee (one-time and, since 2026-09-14, an optional monthly plan on a Stripe
   subscription), next steps. The same wizard has a `?preview=1` mode woven through
   it with ten early-returns, and the SIS setup editor renders a *third*, hand-written
   copy that is missing the preferred-name, gender, photo and teen-email fields the
   real form asks for (`web/src/components/sis/registrationSetup/FamilyStepPreview.jsx`).
   The fee step is two complete renderings of one step, one per cadence
   (`web/src/pages/registerFunnel/FeeStep.jsx:50-118`, `:120-180`).
2. **Immediately after registering**, the parent is sent to `/verify-phone` and shown
   their own number pre-filled — the funnel wrote `users.phone_number` but never
   `phone_verified_at` (`backend/routes/registration_funnel.py:522-537`).
3. **Holds**: an unsigned required document holds the whole API; so does an unverified
   phone; an unfinished funnel holds the web router only (`web/src/components/PrivateRoute.jsx:100-142`),
   so a stale tab or the mobile app walks past it; a household hold and an age-band
   waitlist hold class signup. Eight gates, five different places.
4. **Home** at `/family` (`web/src/pages/home/FamilyHome.jsx`): child cards, attention
   items, the family's quests.
5. **The school as one page** (`web/src/pages/school/SchoolShell.jsx`, since 2026-09-16):
   Feed, Calendar, Schedule *or* Goal Setting, Absences, Billing, Forms, Prior
   Learning, with resources, directory and carpool as rail cards. This is a real
   consolidation and it reads well. Underneath it: the Schedule tab computes tuition in
   the browser from the raw `block_pricing` blob (`web/src/pages/ScheduleBuilderPage.jsx:222-278`),
   the Billing tab shows invoices priced by a different engine, and the Forms tab
   lists "from the school" quests from one endpoint while Home lists "your family's
   quests" from another (`backend/routes/sis/parent.py:613`, `backend/routes/family_quests.py:63`).
6. **The child's week** renders four ways: on the Schedule tab, on the printable
   schedule page, inside the Feed tab, and on the phone — three endpoints, three
   payload shapes (`web/src/pages/SchoolPage.jsx:63`, `web/src/pages/ScheduleBuilderPage.jsx:203`,
   `mobile/src/hooks/useClassSchedule.ts:181`).
7. **Announcements** reach the parent from two tables merged at read time. The web
   merge was hardened on 2026-08-27 to key on `source_announcement_id`; the mobile
   feed still dedupes by title and day (`mobile/src/components/school/SchoolFeed.tsx:49-64`),
   so an edited notice shows twice on the phone.
8. **Mobile**: the school hub has six tabs that do not match the web shell's seven;
   Schedule, Billing, Forms and Prior Learning fall through to "view on web"
   (`mobile/src/services/deepLinkRouter.ts:141`). The paperwork hold on the phone is a
   stopgap that points at the website (`mobile/src/components/layouts/PaperworkHost.tsx:16-18`);
   the phone-verification hold runs fully in-app.

### 3.4 The student (229 of them)

- Under-13s have no login; the parent works as themselves in family scope (one child
  list now, `backend/routes/family_children.py:24-32`). Teens log in at `/login`.
- A shared classroom iPad runs `/kiosk` (`web/src/pages/KioskPage.jsx`): tap a face,
  turn in a photo, three-minute idle sign-out. The Treehouse runs a second kiosk with
  its own device table, token format and page, and no idle sign-out
  (`backend/routes/treehouse.py:1104-1236`, `web/src/programs/treehouse/TreehouseKioskPage.jsx`).
- Home, quests, evidence, journal, classes and the school page (letterhead plus feed,
  no tabs for a student) all work off the platform's own model; the SIS shows up as
  the class quests a teacher assigned and the materials on a class.
- There is no student attendance surface; attendance is teacher-entered
  (`backend/routes/sis/attendance.py:59`). The campus in/out button iCreate asked for on
  2026-08-14 is still blocked on their answers (see `PRESENCE_AND_PAY_DISCUSSION_2026-08-18.md`).
- "Goals" means two things on two screens: the family goals a parent sets
  (`backend/routes/sis/goals.py`) and the weekly XP goal a student sets
  (`backend/routes/xp_goals.py`).
- Nothing on mobile is student-and-org-specific that the web lacks; there is no kiosk
  on mobile.

## 4. Findings by theme

Each finding: the claim, where it is, and what a person sees. Status notes record
what changed between 2026-09-14 and 2026-09-17 where it matters.

### A. Money

**A1. Two independent "this family pays monthly" systems.** The funnel's monthly plan
(`backend/services/registration_pricing.py`, 173 lines; a Stripe subscription on the
school's own account, `backend/routes/registration_payments.py:274-293`) and the
office's recurring tuition (`backend/services/sis_recurring_tuition_service.py`, 489
lines; a saved card and an Optio-issued household invoice each month,
`bill_household` at `:311`, `charge_due` at `:359`). Neither knows the other exists;
`registrations.stripe_subscription_id` is read by exactly two lines outside its
writer. *A family can carry two different monthly amounts; cancelling one does not
stop the other.* Today only Optio Academy has recurring tuition rows, so this is a
trap for iCreate's next pricing change rather than a live fault.

**A2. Four backend pricing engines, plus a processing-fee fifth.**
`backend/services/sis_pricing.py` (discount rules, installments);
`backend/services/sis_tuition_service.py:186` and `:205` (supply fees, flat plan vs
per class); `backend/services/registration_pricing.py:54-172` (monthly, family cap,
add-ons — its own docstring at `:6` names the next one as a separate engine);
`backend/routes/registration_funnel.py:141-165` (`_compute_fee_cents`: flat, per
student, lesser); `backend/services/sis_billing_service.py:82` (processing fee).

**A3. The arithmetic is mirrored in the browser, three times.**
`web/src/components/registration/monthlyPricing.js:46-77` mirrors
`registration_pricing.py` line for line and says so; `web/src/pages/RegisterFunnelPage.jsx:279-288`
mirrors `_compute_fee_cents`; the setup editor mirrors it again in
`web/src/components/sis/registrationSetup/PaperworkFeeSteps.jsx`; the Schedule Builder
computes block-tier tuition from the raw settings blob
(`web/src/pages/ScheduleBuilderPage.jsx:222-278`). `backend/services/sis_tuition_service.py:186-192`
records the day the invoice "billed a number the family was never shown". *The number
on the page and the number Stripe charges come from different code.*

**A4. Seven Stripe checkout sites, three invoice writers with five caller shapes, two
poll-based verifiers, three signed-link namespaces.** Checkout:
`backend/routes/registration_payments.py:284` (payment or subscription) and `:342`
(staff preview); `backend/services/sis_billing_service.py:1748` (invoice), `:1872`
(pay link), `:2004` (whole family), `:2187` (autopay setup), `:2950` (card setup).
Invoice rows are inserted at `backend/services/sis_billing_service.py:279`, `:404`,
`:504`, called from five places that each shape lines differently. Payment is
confirmed by polling in two unrelated implementations
(`backend/services/sis_billing_service.py:1907`, `backend/routes/registration_payments.py:133`);
there is no webhook. Pay-without-login tokens are signed three ways in
`backend/services/sis_pay_links.py:43`, `:108`, `:166`, each with a route pair in
`backend/routes/sis/pay.py`. *Status*: `26fcad0f` (2026-09-16) started a `kind` metadata
and idempotency-key convention on two of the seven sites; `4460de35` added a
second-payment guard to the funnel site. Both are fixes inside one site each.

**A5. Finance redaction lists the money fields for two config keys.**
`backend/utils/org_finance_flags.py:28-36` — improved on 2026-09-16 to spell the list
once and apply it to both the current `registration` key and the legacy
`icreate_registration` mirror. The mirror is the reason the list has to be applied
twice (see H3).

**A6. Ten copies of `money(cents)` on the web and five of `_money` on the backend,
disagreeing on null, negatives and trailing zeros.** Web:
`web/src/components/registration/funnelUi.jsx:32`, `web/src/components/schedule/ClassDetailsModal.jsx:11`,
`web/src/pages/embed/embedShared.js:84`, `web/src/pages/FamilyBillingPage.jsx:13`,
`web/src/pages/sis/TuitionApprovalPage.jsx:25`, `web/src/pages/sis/RecurringTuitionList.jsx:26`,
`web/src/pages/sis/reportsPage/OverviewStats.jsx:4`, `web/src/pages/sis/SisDashboard.jsx:114`,
`web/src/pages/sis/billingPage/money.jsx:6`, `web/src/pages/sis/FamilyDetailModal.jsx:62`.
Backend: `backend/services/sis_recurring_tuition_service.py:55`,
`backend/services/sis_billing_alerts.py:46`, `backend/services/sis_invoice_pdf.py:107`,
`backend/services/sis_billing_service.py:2778`, `backend/services/registration_alerts.py:31`.
*A zero balance reads "—" on one page, "$0.00" on another and "$0" on a third.*

### B. Gates on a family or student

Eight things can stop a family. They live in seven places and three of them talk to
each other by comparing a sentence.

| # | Gate | Where it is set | Where it is read |
|---|---|---|---|
| G1 | `households.registration_hold` (+ reason) | `backend/routes/sis/__init__.py:478`, `backend/services/sis_enrollment_waitlist_service.py:695-698`, the import script | only `backend/services/sis_parent_service.py:592-616` — class signup |
| G2 | `sis_family_directives.registration_hold` (staged by parent **email**) | `backend/routes/sis/__init__.py:1012-1041` | only the funnel, `backend/routes/registration_funnel.py:750` |
| G3 | `sis_family_directives.fee_prepaid` | same | re-applied at four moments: `backend/routes/registration_funnel.py:826`, `backend/routes/registration_payments.py:225`, `:437`, `:483` |
| G4 | `registration_tier` (households and directives) | `backend/routes/sis/__init__.py:508-512`, `:1028-1037`, the import script | **nobody**, backend or web, since tiers were dropped on 2026-07-07 |
| G5 | age-band enrollment waitlist row | `sis_enrollment_waitlist_service` | `backend/services/sis_parent_service.py:607-613` — the child's week goes read-only |
| G6 | unsigned required document | signature requests | `backend/middleware/signature_gate.py` — the whole API |
| G7 | unverified phone | `backend/services/phone_verification_service.py:251` | `backend/middleware/phone_verification_gate.py` — the whole API |
| G8 | unfinished funnel | the funnel | `web/src/hooks/useRegistrationGate.js:29-32` and `web/src/components/PrivateRoute.jsx:100-142` — **web router only** |

**B9.** G1 and G2 are never reconciled; staff can set the directive hold while the
household hold stays off (`backend/routes/sis/__init__.py:1038`). *A family shows "on
hold" on Registration and adds classes anyway, or the reverse.*

**B10.** The fee hold depends on a literal sentence: defined and written at
`backend/services/sis_enrollment_waitlist_service.py:32` and `:697`, then compared
verbatim to clear the hold at `backend/services/registration_funnel_service.py:136`
and `backend/services/sis_service.py:2358`. *An admin tidies the wording of a hold
reason on the Families page; the family pays and stays locked out of class signup.*

**B11.** G6 and G7 are structural near-copies (same allow-list shape, same
`before_request`, same asymmetric cache). On 2026-09-16 the masquerade exemption had
to be added to both, separately.

**B12.** Five fields say "UFA private school": `households.funding_source` (the staff
gate), `registrations.answers.payment_intent` (the family's own answer),
`households.ufa_private`, `households.enrolled_private_school`,
`users.sis_tuition_plan='ufa_academy'`. *Improved 2026-09-16*: `backend/services/sis_payment_profile.py:97`
is now the one derivation and the mirrors are written from it at three sites
(`backend/routes/registration_funnel.py:1000-1018`, `backend/routes/sis/__init__.py:492-503`,
`backend/services/sis_billing_service.py:1532-1536`, the last behind a new parent
self-service endpoint `backend/routes/sis/parent.py:311-333`). Three write paths into
one field; the family's answer and the staff gate stay two fields on purpose.

**B13.** The funnel writes `users.phone_number` and never `phone_verified_at`
(`backend/routes/registration_funnel.py:522-537`). *Every new parent is asked to verify
the number they just typed.*

**B14.** The funnel never writes `school_enrollments`, so every funnel family lands
on the roster as "unassigned" (`backend/services/sis_service.py:433`) until somebody
touches them by hand.

### C. Facts about a family, stored several ways

**C1. Emergency contacts three ways.** The funnel writes them as JSON on the
registration *and* as one row per child, deleting and re-inserting on every back-edit
(`backend/routes/registration_funnel.py:954-963`, `:975`). The SIS has a student-level
API and a household-level API over the same table, plus a copy-from-family endpoint
because the two drift (`backend/routes/sis/__init__.py:851-899`, `:924-991`).
*A parent re-submitting the details step deletes the contact the office added.*

**C2. Eleven stores for "something we know about this family":** directives,
`households.notes`, `sis_student_records`, `sis_student_materials`, CLP meeting notes,
advisor notes, class internal notes, form submissions and comments, goals, prior
learning, and three alert tables.

**C3. School of record in three or four places:** the academy enrollment's
`student_records_destination` (`backend/services/academy_enrollment_service.py:174`),
`school_enrollments`, `households.enrolled_private_school`, and
`sis_student_records.profile` (the one the family page reads). *The parent states it
once in the funnel and never sees it again.*

**C4. Two family photos** since 2026-09-15: `households.image_url`
(`backend/routes/sis/__init__.py:477`) and `users.family_cover_url`
(`backend/routes/parent/family_cover.py`), whose header says a platform family "has
no row of its own" — the household is that row, in the other API.

### D. Communication

**D1. The Community Hub double-writes every announcement.**
`backend/services/sis_community_service.py:222-255` inserts a board row, then calls
`announcement_service.publish` which inserts a second row plus per-recipient
snapshots and an email; edits and deletes are forwarded by hand
(`revise_for_source` at `:283`, `retract_for_source` at `:300`). The canonical
announcements blueprint no longer has a create endpoint
(`backend/routes/announcements.py`: GET, DELETE, mark-read, archive only). The web
feed merges the two by `source_announcement_id`
(`web/src/components/announcements/UnifiedFeed.jsx:51-58`); the mobile feed still
merges by title and day (`mobile/src/components/school/SchoolFeed.tsx:49-64`).
Incidents 2026-08-01 and 2026-08-28. Tickets `b32b2fca`, `597ba9a4`, `b4a4d250`.

**D2. Three audience vocabularies for one question.**
`backend/services/announcement_service.py:31` (students, parents, advisors);
`backend/services/sis_community_service.py:135-155` (school, families, teachers, with
a comment admitting "three composers with three different audience models");
`backend/routes/sis/events.py:28` (school, teachers, admins);
`backend/routes/announcements.py:283`. Ticket `597ba9a4`: "not sure how to tell if the
announcements for teachers only are showing up for parents too."

**D3. Two ways for the office to write to one family**: the school inbox
(`backend/services/school_inbox_service.py`) and the older
`POST /api/sis/households/<id>/message` and `/students/<id>/message`
(`backend/routes/sis/__init__.py:902`, `:827`). An orphan second school account had to
be merged on 2026-09-10 because replies landed where nobody read them.

**D4. Five staff-to-staff paths** and one notification type: group compose
(`backend/routes/sis/messaging.py:56`), class chats, platform DMs, the credit-review
thread, the email relay; every SIS notification is `type='announcement'`
(`backend/services/sis_notifications.py:17`), so the bell cannot label them.

**D5. Four "tell staff a family registered" paths** since 2026-09-15:
`backend/services/registration_alerts.py:103` beside `sis_billing_alerts`,
`sis_notifications`, and the funnel's own completion emails; it re-renders the
student, payment and answer lines that two other modules already render.

**D6. On the console:** the announcement composer is mounted on both `/inbox` and
`/community` (`web/src/pages/sis/SchoolInboxPage.jsx:428`, `web/src/pages/sis/CommunityPage.jsx:108`);
two unread indicators sit side by side (`web/src/components/sis/InboxUnreadBadge.jsx:50-60`
sums two counts; `web/src/components/sis/SisLayout.jsx:127` mounts the bell). The
message *rendering* was unified on 2026-09-15 (`16013836`: one bubble, one thread row,
one cache) — the send paths and indicators were not.

### E. Calendar, schedule, time

**E1. Time blocks are JSON in a settings column, not a table.** Read by reports
(`backend/services/sis_reports_service.py:754`, `:851`, `:1005`, now through
`backend/services/sis_catalog_service.py:240-243`), the parent builder
(`backend/services/sis_parent_service.py:729`, `:740`, `:826`, `:844`), the sheet sync
(`backend/services/sis_schedule_sync_service.py:320-338`) and the AI prompt
(`backend/services/sis_schedule_ai_service.py:89-120`). A block is a label the code
agrees on by string. *Renaming a block on Settings silently orphans the block-rosters
report and the AI editor's idea of the day.*

**E2. Six calendar reads, each with its own audience filter:**
`backend/routes/sis/events.py:282`, `backend/routes/sis/parent.py:946`,
`backend/routes/sis/community.py:343` (re-reading `sis_events` at
`backend/services/sis_community_service.py:691-700`), the ICS feed at
`backend/routes/sis/events.py:308-333`, the admin dashboard
(`backend/services/sis_dashboard_service.py:214`) and the family context
(`backend/services/sis_parent_service.py:1353`).

**E3. Three "what happens today" assemblers:**
`backend/services/sis_coordinator_service.py:76-123`; the admin dashboard, which
imports it (`backend/services/sis_dashboard_service.py:302`) *and* still calls the
older `sis_service.get_dashboard` (`:258`); and the teacher schedule
(`backend/services/sis_staff_service.py:318`).

**E4. The event time is rendered by four web implementations, two of which share
function names and disagree.** `web/src/pages/sis/SisDashboard.jsx:118-135`;
`web/src/pages/sis/CommunityPage.jsx:47-56` and
`web/src/components/sis/BoardAnnouncementsTab.jsx:52-60` (both define
`isDateOnly`/`fmtDate`; one uses UTC options, the other a local-noon shim);
`web/src/pages/sis/CalendarPage.jsx:28-39` (string slicing). The mobile app fixed this
family of bug for the third time on 2026-09-16 (`c88c70c0`, Marika: "this would
likely explain our low turnout at all events") by centralising in one file with a
guard test. The web has neither the file nor the guard.

**E5. Weekly grids and their helpers.** Five grid implementations
(`web/src/components/sis/WeeklyScheduleGrid.jsx:31`, `web/src/pages/sis/clp/ScheduleGrid.jsx:8-27`,
inline in `web/src/pages/sis/MyClassesPage.jsx:61-76`, `web/src/pages/sis/MySchedulePage.jsx:38`,
`web/src/components/schedule/WeeklySchedule.jsx:43`), two of them carrying the same
comment about the same 2026-08-25 bug. `toMin` seven times; overlap three times;
`fitsAge` four times (`web/src/pages/ScheduleBuilderPage.jsx:53`,
`web/src/pages/sis/clp/clpHelpers.jsx:86`, `web/src/pages/sis/StudentDetailModal.jsx:543`,
`web/src/pages/sis/reportsPage/rosterClassFilter.js:41-46`); `ageFromDob` four times
with different reference dates; `fmtTime` nine definitions while
`web/src/utils/timeFormat.js` sits mostly unused. *The builder, the CLP screen and the
child's profile can disagree on whether a class fits a child's age.*

**E6. Six renderings of a class in a list**, each with its own seat vocabulary: "N
spots left / Full — waitlist" (`web/src/pages/scheduleBuilder/SlotClassesModal.jsx:74-78`),
"Full — waitlist available" (`web/src/components/schedule/ClassDetailsModal.jsx:66-75`),
a `Full` chip (`web/src/pages/sis/classesPage/ClassCard.jsx:25`), the CLP card, "N
seats left / Class full / Full · Waitlist: N" (`web/src/pages/embed/EmbedCatalogPage.jsx:14-33`),
"N left / Full / Waitlist: N" (`web/src/pages/embed/EmbedSchedulePage.jsx:16-24`).

**E7. Three endpoints answer "which classes is this child in"** with three payload
shapes and four renderers: `/api/student/classes`, `/api/sis/school/my-schedule`
(`backend/routes/sis/school.py:60`), `/api/sis/parent/students/<id>/schedule`
(`backend/routes/sis/parent.py:505`).

**E8. Two waitlists, one word.** The per-class seat queue
(`backend/services/sis_waitlist_service.py`, auto-offer) and the age-band admission
queue (`backend/services/sis_enrollment_waitlist_service.py`, manual release). Both
arrive in one payload (`web/src/pages/ScheduleBuilderPage.jsx:210`, `:217`); two
hand-add flows (`web/src/pages/sis/classesPage/ClassWaitlist.jsx:53`,
`web/src/components/sis/AddToWaitlistModal.jsx:18`); one dashboard tile that counts
only the second (`web/src/pages/sis/SisDashboard.jsx:73`). Ticket `ba6a89fc`. *These
are different things and stay different; the fix is naming (section 7).* Improved
2026-09-16: parents now see their position in both.

**E9. The cart-style registration path is dead but complete.**
`backend/services/sis_registration_service.py` (605 lines), staff routes
`backend/routes/sis/registration.py:37-146`, parent routes
`backend/routes/sis/parent.py:66-157`, and `backend/services/sis_parent_service.py:398-484`
— no web or mobile caller; `backend/services/sis_dashboard_service.py:271-273` says
"no console page lists them". `backend/services/sis_billing_service.py:231-244` still
quotes from it. The tables stay (decision 3); the duplicate *path* is the finding.

### F. Obligations, queues, paperwork

**F1. Four kinds of "something you must do"** — a request assigned to you, a checklist
item, a document sent for signature, a resource you must acknowledge — and one
aggregator whose docstring names the problem
(`backend/services/sis_tasks_service.py:1-19`), exposed three times:
`/api/sis/my-tasks` (`backend/routes/sis/tasks.py:48`), `/api/sis/teacher/tasks`
(`backend/routes/sis/staff_portal.py:352`), `/api/sis/parent/my-tasks`
(`backend/routes/sis/parent.py:667`).

**F2. Form templates deliberately mirror checklist templates** —
`backend/services/sis_form_template_service.py:14-16` says so — with parallel endpoint
sets (`backend/routes/sis/staff_admin.py:225-310` vs `:313-395`). The web already has
one authoring shell over both (`web/src/components/sis/tasks/PaperworkTemplatesManager.jsx`).

**F3. Signature requests are reachable at two paths** with two permission tiers over
one store (`backend/routes/sis/staff_admin.py:533-577`,
`backend/routes/sis/secure_documents.py:203-248`, both through
`backend/routes/sis/signature_request_views.py`).

**F4. Three signature widgets**: the funnel's, with a hard-coded affirmation
(`web/src/pages/registerFunnel/PaperworkStep.jsx:30`, `:35`); the checklist's, with
the affirmation from the server (`web/src/components/sis/ChecklistSignature.jsx:24`);
the HR request. *A parent types their name to sign three times in three boxes with
three different sentences.*

**F5. The parent portal and the teacher portal are the same endpoints twice**, over
the same services, differing by bucket and gate: `backend/routes/sis/parent.py:631`,
`:653`, `:667`, `:687`, `:718`, `:735`, `:776` versus
`backend/routes/sis/staff_portal.py:322`, `:339`, `:352`, `:367`, `:382`, `:400`,
`:444`, `:559`, `:591`, `:668`. On the web the family side became one Forms page on
2026-09-16 (`web/src/pages/FamilyFormsPage.jsx`); the staff side is still
`OnboardingPage`, `MyTasksPage` and `TaskCenterPage`. *A teacher who is also a parent
sees two checklists in two apps.*

**F6. Nine queue pages, fifteen private status vocabularies.** Inbox, Submissions,
Prior Learning, Goals review, Tuition approval, Task Center requests, the Forms
queue (the same rows — `web/src/pages/sis/TaskCenterPage.jsx:14` imports it),
Registration queues, attendance alerts. Status maps in
`web/src/pages/sis/PriorLearningPage.jsx:71`, `web/src/pages/sis/MyTimePage.jsx:24`,
`web/src/pages/sis/TimesheetsPage.jsx:23`, `web/src/pages/sis/MyTasksPage.jsx:48`,
`web/src/pages/sis/StaffFormsPage.jsx:24`, `web/src/pages/sis/GoalsReviewPage.jsx:18`,
`web/src/pages/sis/OnboardingPage.jsx:30`, `web/src/components/sis/ChecklistAssignments.jsx:29`
(a copy of the previous one that has already drifted by one token),
`web/src/components/sis/StudentDayModal.jsx:19`, `web/src/pages/sis/AttendancePage.jsx:24`,
`web/src/pages/sis/TeacherClassPage.jsx:36` (the attendance colours, verbatim twice),
`web/src/pages/sis/BillingPage.jsx:26`, `web/src/pages/sis/RecurringTuitionList.jsx:28`,
`web/src/pages/sis/people/PeopleTable.jsx:30`. The shared `ui/StatusBadge` was deleted
on 2026-09-15 as unused, so there is nothing to adopt. *The same colour means
different things on different queues.*

**F7. Doors.** `/onboarding` is on the sidebar and inside Task Center, and the
sidebar's comment defends both (`web/src/components/sis/SisSidebar.jsx:103-111`).
Dashboard tiles deep-link to tab names a legacy table remaps
(`web/src/pages/sis/SisDashboard.jsx:68`, `web/src/pages/sis/TaskCenterPage.jsx:58`).
`/forms`, `/my-documents` and `/secure-documents` are off the nav but still mounted
for deep links (`web/src/sis/SisRoutes.jsx:190-193`), and Secure Documents has no nav
entry at all despite an `hrOnly` gate that no item uses.

### G. One entity, many admin surfaces

**G1. A student**: `web/src/pages/sis/StudentDetailModal.jsx:32-42` (five tabs, opened
from People and from inside the family modal); the People row; the CLP profile
(`web/src/pages/sis/clp/StudentDetail.jsx:16-24`, 38 props); the attendance day modal
(`web/src/components/sis/StudentDayModal.jsx:30`); the class progress panel
(`web/src/components/sis/StudentProgressTab.jsx:79`); the class roster row
(`web/src/pages/sis/classesPage/ClassRoster.jsx:16`); and the learning app's admin
student page. Seven on 2026-09-14, six plus one now; none a superset.

**G2. A family**: the modal (`web/src/pages/sis/FamilyDetailModal.jsx:64-84`), the
recurring-tuition list (`web/src/pages/sis/RecurringTuitionList.jsx:53-61`), the
billing ledger with no way back (`web/src/pages/sis/BillingPage.jsx:168`), the
directives card keyed by email (`web/src/pages/sis/RegistrationPage.jsx:409`).

**G3. A staff member**: four modals stacked on People
(`web/src/pages/sis/PeoplePage.jsx:308-340`), plus Directory and My Profile; the phone
number is editable in `web/src/components/sis/TeacherModal.jsx:38`,
`web/src/components/sis/StaffProfileModal.jsx:204`, `web/src/pages/sis/MyProfilePage.jsx:119`
and `web/src/pages/sis/TeacherDashboard.jsx:44`. Six staff-linking entry points in
`backend/services/sis_service.py`, one of which (`link_staff_account`, `:1799`) is the
consolidated piece.

**G4. A class**: card, table row with inline editor, create modal, detail modal that
embeds the create modal (`web/src/pages/sis/classesPage/ClassDetailModal.jsx:82`), the
teacher class page (`web/src/pages/sis/TeacherClassPage.jsx:66`), and three preview
variants. Two input recipes for the same class form differ by two pixels, with a
comment explaining the mismatch rather than fixing it
(`web/src/components/sis/ClassesTable.jsx:21`, `web/src/components/sis/ClassFieldsEditor.jsx:30-33`).
*Resolved 2026-09-15*: the admin modal and the table now link to the class page.

**G5. Three dashboards** (`web/src/pages/sis/SisDashboard.jsx` forks to the teacher and
coordinator ones) with three local `Card` components and three backend endpoints.

**G6. Two pages fetch the whole org payload with copy-pasted code**
(`web/src/pages/sis/SettingsPage.jsx:43`, `web/src/pages/sis/RegistrationPage.jsx:44`).

### H. Settings

**H1. Five configuration surfaces**: the registry (`web/src/settings/settingsRegistry.jsx:38-56`,
11 cards); the Registration setup tab (`web/src/components/sis/RegistrationSetupTab.jsx`,
589 lines) which mounts two settings cards inside the funnel preview
(`web/src/components/sis/registrationSetup/FamilyStepPreview.jsx:53-54`; one of them
still says it "lives on the SIS Settings page",
`web/src/components/sis/EnrollmentAgeGatesCard.jsx:12`); the learning app's
`/organization` page (`web/src/pages/admin/OrganizationManagement.jsx:18-27`, eight tabs,
two overlapping People and Classes); Task Center Templates and its routing modal; the
org settings card.

**H2. Twelve components, seventeen sites, read the `feature_flags` column, spread it,
and PUT the whole thing back** — last write wins:
`web/src/components/sis/SisOrgSettings.jsx:85`, `:114`, `:288`, `:343`, `:357`, `:366`,
`:375`; `web/src/components/sis/ClassroomsCard.jsx:42`; `web/src/components/sis/QuickLinksCard.jsx:45`;
`web/src/components/sis/EnrollmentAgeGatesCard.jsx:29`; `web/src/components/sis/RegistrationSetupTab.jsx:168`,
`:363`; `web/src/components/sis/TimeBlocksCard.jsx:32`; `web/src/components/sis/FirstDayOfSchoolCard.jsx:35`;
`web/src/components/sis/CalendarCategoriesCard.jsx:29`; `web/src/settings/cards/HelpVideoCard.jsx:59`;
`web/src/settings/cards/ParentDigestCard.jsx:51`; `web/src/settings/cards/PillarsCard.jsx:29`;
`web/src/settings/cards/StepPrintingCard.jsx:23`. Six of these on 2026-09-14, twelve on
09-17. *Two admins editing two different cards erase each other's change.*

**H3. The registration config is written to two keys on every save**
(`web/src/components/sis/RegistrationSetupTab.jsx:51`, `:168`, `:366`: "legacy mirror
until the rename ships") and resolved from either by
`backend/utils/registration_config.py`. This is why A5 has to guard two keys.

**H4. One bespoke module gate and one hard-coded slug remain**: CLP via
`web/src/pages/sis/sisModules.js:110-111`, leaking into the tuition approver
(`web/src/pages/sis/TuitionApprovalPage.jsx:43`); superadmins default to iCreate by
slug (`web/src/pages/sis/sisOrgStore.js:58`).

### I. The registration funnel

**I1.** Three renderings (section 3.3 step 1): `web/src/pages/RegisterFunnelPage.jsx`,
its `previewMode` with ten early-returns (`:305`, `:407`, `:473`, `:542`, `:601`,
`:638`, `:658`, `:681`, `:739`, `:786`), and `web/src/components/sis/registrationSetup/`
(about 925 lines, out of sync with the live form).

**I2.** The fee step is two full renderings of one step
(`web/src/pages/registerFunnel/FeeStep.jsx:50-118`, `:120-180`); its deferred-fee copy
(`:64-70`, `:126-133`) is dead for every new family since deferral was reversed
(`backend/routes/registration_funnel.py:823-828`).

**I3.** Three client-side memories of one registration: a localStorage draft
(`web/src/pages/RegisterFunnelPage.jsx:302-333`), a sessionStorage identity for the
Stripe round-trip (`:758-761`), and a module cache in the gate
(`web/src/hooks/useRegistrationGate.js:29-32`).

**I4.** The paid-once guard added on 2026-09-15 (`4460de35`) exists because the
funnel, the resume page and the 402 self-heal each re-derived "is this paid".

**I5.** *Resolved on the backend*: the `/api/icreate` blueprint alias and its CSRF
mirror are gone (`backend/routes/__init__.py:353-359`). Four web route aliases remain
on purpose for distributed links (`web/src/App.jsx:880-883`).

**I6.** Docs drift: `docs/icreate/osh-registration-inventory.md:104-109` still lists as
"not yet captured" fields that have been captured since July.

### J. Student

**J1. Two kiosks** (section 3.4). Generic: `backend/routes/kiosk.py` (module-gated,
`org_kiosk_devices`, `ksk_` tokens, CSRF markers, idle timeout). Treehouse:
`backend/routes/treehouse.py:1104-1236` (slug-hardcoded, `treehouse_kiosk_devices`,
`thk_` tokens, cohort grouping, no timeout). `backend/routes/kiosk.py:1-9` calls itself
the generalisation of the other; the other was never retired.

**J2.** No student attendance surface; **J3.** "goals" means two things; **J4.**
nothing student-and-org-specific on mobile that the web lacks.

### K. Backend hygiene

**K1. Twenty-seven copies of the org-resolution helper in three variants.** Twenty-six
under `backend/routes/sis/` and one in `backend/routes/admin/roster_import.py:26`.
Only three carry the `request.form` fix that makes superadmin file uploads work
(`backend/routes/sis/__init__.py:48` — whose comment at `:53-62` records the bug —
`backend/routes/sis/catalog.py:46`, `backend/routes/sis/staff_portal.py:37`). Newest
copy: `backend/routes/sis/training_links.py:55`. *A superadmin viewing another school
gets "No organization in context" on some upload endpoints and not others.*

**K2. Three hand-rolled role tuples** in `backend/routes/sis/community.py:344`, `:390`,
`:406`, out of 398 `@require_role` calls in the SIS; `backend/utils/sis_roles.py:1-27`
explains what that costs. Five separate "does the caller see money" predicates in
`backend/services/sis_service.py:1045-1108`.

**K3. Four AI features on `BaseAIService` with no shared propose/apply step or prompt
layer**: schedule editor (`backend/services/sis_schedule_ai_service.py:89-120`,
inline prompt), sheet sync (which has no apply of its own and routes through the
schedule editor's, `backend/routes/sis/schedule_sync.py:6-11`), quest drafts, the
prior-learning analyzer (`backend/services/sis_prior_learning_analyzer.py:33`, built on
a module whose docstring says nothing calls a model). Three web AI panels share
nothing. The admin prompt-management service no longer exists.

**K4. Eleven ways an account gets created or attached**, and duplicate detection
rebuilt four times (`backend/services/sis_service.py:316`, `:345`, `:359`, `:1358`). A
third door onto student standing arrived on 2026-09-16
(`backend/routes/admin/org_member_standing.py:30`).

**K5. Six backend CSV routes, five column pickers with five storage keys, five print
paths.** Backend: `backend/routes/sis/__init__.py:92`, `:101`, `:1069`;
`backend/routes/sis/reports.py:153`, `:219`, `:239` (`:271`: "same CSV response pattern
as roster.csv"). Web pickers: `web/src/components/sis/PeopleExportModal.jsx`,
`web/src/components/sis/ClassesExportModal.jsx`, `web/src/components/sis/ClassRosterExportModal.jsx`,
`web/src/pages/sis/ReportsPage.jsx:155-176`, `web/src/pages/sis/reportsPage/ReportTable.jsx:18-40`.
Print: `web/src/pages/sis/ReportsPage.jsx:33-54`, `web/src/components/sis/ClassRosterExportModal.jsx:145`,
`web/src/pages/sis/BillingPage.jsx:305`, `web/src/components/sis/SubstituteSheet.jsx:42`,
`web/src/components/sis/StudentProgressTab.jsx:50-76`.

**K6. Seven cron endpoints with an identical shape** (`backend/routes/sis/attendance.py:158`,
`backend/routes/sis/billing.py:459`, `:493`, `:520`, `backend/routes/sis/engagement.py:198`,
`backend/routes/sis/class_quests.py:1185`, `backend/routes/sis/waitlist.py:213`); the
retired gradebook (`backend/routes/sis/gradebook.py`, 452 lines, still registered);
the prior-learning AI seam.

**K7. Two training systems** (since 2026-09-15): `backend/routes/sis/training_links.py`
(seven routes, `org_resources.is_training`, its own progress report at `:302`, its own
`_applies_to` at `:322`) beside `backend/routes/sis/staff_training.py` (twenty routes,
quests, progress at `:1224`, `_applies` at `:1245`). Two visibility filters over the
same `visible_to_roles` columns; `backend/routes/sis/resources.py:140` now has to
exclude trainings from the document library. iCreate already has 14 training links
and 4 training quests. Tickets `be12106a`, `b26c05e3`, `b2e109d4`, `f1286b5a`,
`05cc69d8`, `8cdaef04`, `7c8c12a2`.

### L. UI primitives in the SIS

The console has its own dialect and `docs/design/DESIGN_SYSTEM.md:7-9` puts it out of
scope on purpose. Measured anyway:

- **36 hand-rolled input class strings in four recipes**; `web/src/components/ui/Input.jsx`
  and `FormField.jsx` used by zero SIS files. One recipe is duplicated verbatim
  between `web/src/pages/sis/StaffTrainingPage.jsx:48` and
  `web/src/components/sis/TrainingLinks.jsx:28`.
- **14 tab-bar recipes** (twelve underline bars, a pill bar, a third shape, and the new
  chip-and-select filter bar); `web/src/components/ui/GlassTabBar.jsx` used by fifteen
  non-SIS pages and zero SIS pages.
- **6 `SortHeader` components, 5 sort-state models, 23 raw `<table>` elements**, no
  shared table.
- **Modals**: `ModalOverlay` in 30 files, `ui/Modal` in 2, a billing-local modal shell,
  five hand-rolled `fixed inset-0` overlays.
- **`SearchSelect`** is used in 22 files, yet four person pickers were rebuilt from
  scratch (`web/src/components/sis/StaffComposeModal.jsx:28-45`,
  `web/src/components/sis/TrainingPeoplePicker.jsx:22-35`,
  `web/src/components/sis/tasks/AssignComposer.jsx:30`,
  `web/src/components/sis/RoleViewSwitcher.jsx:85-99`); 31 raw search inputs; 21 raw
  date inputs.
- **30 pages each mount the org picker and the same header row** instead of
  `web/src/components/sis/SisLayout.jsx` doing it once.
- **96 hand-spelled brand gradients across 60 files** (the spelling the design system
  forbids); `.btn-primary` used zero times; `ui/Button` imported by 32 of 182 SIS files;
  `text-neutral-*` 1,904 times against `text-gray-*` 201; `ui/Card` unused.

### M. Already consolidated — credit where due

The People merge (three pages, one table, `51d4bfda`); Task Center; one announcement
composer (`fd5f13e1`); one school inbox sender (`544de655`); one message bubble,
thread row and cache for messenger and console (`16013836`); the school as one page
with tabs (`6b3e3a72`); one Forms page for families (`469cd53a`); one child list for
parents (`a9413945`); one definition of "parent" with a ratchet
(`backend/tests/unit/test_one_definition_of_parent.py`); role tiers in
`backend/utils/sis_roles.py` with `docs/sis/ROLE_CAPABILITIES.md` guarded by a test;
`fetch_all_rows` for the 1,000-row cap; `ClassFieldsEditor` shared by table and modal;
the settings registry as one index; the tasks aggregator; the funding-source
derivation (`6b3e3a72`); the `/api/icreate` alias removed; the class cross-links
(`f05c1969`); the Reports list (`6c72cb5d`); 164 dead web files and 11 dead backend
modules deleted (`eb196454`, `da6b5ad1`).

### N. New since the first sweep (2026-09-14 to 09-17)

Listed so the roadmap absorbs them rather than discovering them again.

- **Backend**: the second training system (K7); a 27th org helper; a third door onto
  student standing; two family photos (C4); four repositories over "who is in this
  family"; a sixth backend money formatter; a fourth registration-notify path (D5);
  a third writer of `funding_source` (B12).
- **SIS web**: training links (K7); a copied-and-drifted status map
  (`web/src/components/sis/ChecklistAssignments.jsx:29`); a fourth `fitsAge`; a fifth
  column picker and sort model; five new settings writers; a new status vocabulary
  and `fmtDate` on the People table; two same-named date helpers that disagree (E4);
  a three-door `+ Add` menu; two more tab-bar recipes; Secure Documents with no nav
  entry.
- **Parent and student**: a duplicate route rule for `/connections`
  (`web/src/App.jsx:625` and `:721`, the second unreachable); two doors onto peer
  approvals (`web/src/pages/ConnectionApprovalsPage.jsx` and the child card); two
  "family quests" endpoints (section 3.3 step 5); three request shapes on one absence
  endpoint with mobile on the oldest (`backend/routes/sis/parent.py:419-445`); mobile
  and web school hubs with different tab sets; a fifth consumer of the child schedule
  (`web/src/pages/SchoolPage.jsx:59-93`); two child-summary endpoints
  (`backend/routes/parent/child_overview.py:52`, `backend/routes/parent/dashboard_overview.py:104`).

## 5. The consolidation roadmap

Nineteen moves in four waves. Rules that apply to all of them:

- **Independently shippable.** Own PR, own "done when", no shared migration.
- **Canonical means an existing thing.** Each move names the module or component that
  wins; the others become thin wrappers, redirects, or are deleted only when they are
  pure copies. No new frameworks.
- **Every move ships a ratchet.** A unit test in the style of
  `backend/tests/unit/test_direct_db_calls_do_not_grow.py` that counts the duplicate
  and fails if it grows. Route moves update `docs/sis/ROLE_CAPABILITIES.md`, which
  `backend/tests/unit/test_role_matrix_doc.py` guards.
- **Guardrails from CLAUDE.md**: one route one owner; `count='exact'` or
  `fetch_all_rows`, never `len()` on a PostgREST page; role tiers only from
  `backend/utils/sis_roles.py`; teachers class-scoped via `sis_service.class_scope()`;
  `SearchSelect` for long pickers.
- **Not merged**: the pairs in section 7 share a word, not a meaning.

Persona codes: A admin, CC campus coordinator, T teacher, P parent, S student, Ops
Optio staff. Sizes: S about a day, M two to four days, L a week or more.

### Track A — correctness (incidents already seen in production)

**M1. One school voice.** Collapses D1-D6, K2's three tuples, and the mobile
title-and-day merge. `sis_announcements` is the post and `sis_community_service.post`
its only writer; `announcement_service.publish` becomes the delivery step (recipient
snapshots, in-app notification, email) and its row is a receipt never rendered alone
when `source_announcement_id` is set. The feed is assembled once, server-side, in
`sis_community_service.family_feed`; `mergeFeedItems` and the mobile heuristic are
deleted. A small `services/sis_audiences.py` holds the canonical audience keys and the
mapping to recipient roles (events adopt it in M12; stored values unchanged). The two
older "message this household/student" endpoints call `school_inbox_service` through
one `school_account(org)` resolver so a second orphan account cannot be created
again. SIS notifications get their own types so the bell can label them; the four
"tell staff about a registration" paths share one recipients helper.
*On screen*: P/S one notice per announcement on web and phone, edits and retractions
reach both; A/CC one send-as-school behaviour wherever it starts. Tickets
`b32b2fca`, `597ba9a4`, `b4a4d250`, `4b364a4c`. Other orgs read the same feed; no
migration. **Size M. Wave 0.** Ratchet: `publish` has one caller; no `mergeFeedItems`;
no `norm(title)|dayOf` in mobile.

**M2. One family hold.** Collapses G1-G4 and B9-B10. `households` is the only hold
store once a household exists. Directives stay what they are — a pre-household
staging area keyed by parent email — and are applied exactly once, at the moment the
funnel attaches a household (`apply_directives(household)` sets hold, reason, code and
prepaid, stamps `applied_at`); the four `_apply_prepaid_directive` call sites go. Add
`households.registration_hold_code` (`unpaid_fee | manual | enrollment_waitlist`) with
a one-time backfill from the sentence; the three sentinel comparisons become
`clear_hold_if(household, code='unpaid_fee')`. A `services/sis_holds.py` owns
`set_hold / clear_hold_if / family_gate`; `_family_gate` moves there and both the
funnel and class signup call it. `registration_tier`'s three writers are retired in
the same PR — the column has had no reader anywhere since July.
*On screen*: A/CC a labelled hold chip ("Fee unpaid", "Manual: reason") on the family
modal and the registration queue; editing the wording no longer breaks the
auto-clear. P the same hold message in the funnel and in class signup. One additive
column; Optio Academy's holds keep working. **Size M. Wave 1.** Ratchet: no literal
`FEE_HOLD_REASON` comparison outside `sis_holds.py`; `registration_hold` written only
through it.

**M3. One API-wide hold gate.** Collapses G6/G7 (B11). One `middleware/api_hold_gate.py`
with one allow-list (the union of both, pinned by a snapshot test) and a registry of
hold providers; the two `utils/*_hold.py` modules become the providers, each keeping
its own cache semantics. G8 — the unfinished funnel, today web-only — becomes the
third provider once M4 gives the server a reliable completion signal. Must preserve
the masquerade exemption and the redirect counter from the 2026-08-22 loop incident
(`e4768113`); 2026-09-16 already had to patch masquerade into both gates separately,
which is exactly the cost this move removes.
*On screen*: nothing, which is the point; later, a held parent is held on the phone
too. **Size S. Wave 0.** Ratchet: exactly one hold `before_request` registered.

**M4. The funnel lands the family in the SIS's own stores.** Collapses B12-B14, C1,
C3, C4. (a) OTP success stamps `phone_verified_at`. (b) Funnel completion calls the
same enrollment service the SIS "assign" action uses, so status follows the org's
`post_registration_flow`. (c) One `emergency_contacts_service.replace_for_students(...)`
used by the funnel, both SIS endpoint families and copy-from-family;
`registrations.emergency_contacts` becomes the funnel's draft only and is never read
by SIS code. (d) `funding_source` (the staff gate) and `payment_intent` (the family's
answer) both stay; the derivation already exists — the remaining work is one
`set_funding_source(household, source, actor)` write path replacing three, and
`ufa_private`, `enrolled_private_school`, `sis_tuition_plan='ufa_academy'` become
derived reads only; school of record canonical on the academy enrollment's
destination, the others read-only. (e) One family photo: the household's
`image_url` is the row the cover route says a platform family lacks.
*On screen*: P no second phone verification; the child shows as enrolled; one family
photo. A/CC contacts edited anywhere are the same rows, no "copy from family"
surprises, one funding field. Two small per-org backfills (Optio Academy uses the
funnel too). **Size M. Wave 1, after M2.** Ratchet: no SIS read of
`registrations.emergency_contacts`; the mirrors have zero writers outside the derivation.

### Track B — money (strictly M5 → M6 → M7)

**M5. One quote per money question, shown before it is billed.** Collapses A2, A3,
I2. Two quote endpoints, both returning `{lines[], total_cents, cadence}`.
Registration: `registration_pricing.py` absorbs `_compute_fee_cents` and
`fee_prepaid → 0`, exposed as `GET /api/registration/<id>/quote` and a
`quote-preview` for unsaved setup config; `FeeStep.jsx` renders lines under a cadence
header (one rendering); `estimateFeeCents`, `draftFeeCents` and `monthlyPricing.js`
are deleted and their tests move to the backend. Tuition: `sis_tuition_service` is
the one quote, the Schedule Builder calls `GET /api/sis/parent/students/<id>/tuition-quote`,
and invoice creation records the quoted lines verbatim. `sis_pricing.py` stays pure
math used by both.
*On screen*: P the fee or tuition on the funnel and the builder is byte-identical to
the invoice. A the setup-tab preview is the real quote. Optio Academy's monthly plan
runs through this. **Size M. Wave 1.** Ratchet: no `*_cents` arithmetic in `web/src`
outside display; one function computes the registration fee.

**M6. One invoice writer, one checkout factory, one verifier.** Collapses A4 and the
dead-cart quote in E9. `sis_billing_service.create_charge` is the only row writer;
the other creators become callers passing `lines`, `kind` and a source reference.
One `start_checkout(kind, ref, mode, urls)` wraps every Stripe session with one
metadata convention — `26fcad0f` already started `kind` + idempotency keys on two
sites; this finishes it — and `mode='subscription'` is the funnel's monthly case.
One `find_paid_session(kind, ref)` used by the sweep and the funnel confirm. Pay-link
namespaces stay three (section 7) but share one signing helper.
`sis_billing_service.py:231-244` is re-pointed off `sis_registrations`. Webhooks
stay out of scope; with one verifier they become a one-place addition.
*On screen*: A every invoice has the same fields and "paid via" trail whatever
created it; P fewer "payment pending" states. Money across every org; a Stripe
test-mode run per `kind`. **Size L. Wave 1.** Ratchet: `checkout.Session.create`
appears once; the `sis_invoices` insert appears once.

**M7. One household billing view, one money formatter.** Collapses A1 (as a read
model, not a data merge — section 7), G2's billing spread, A6, A5.
`household_billing_summary(org, household)` returns open invoices, recurring
schedules, the school-managed subscription if any, and the saved card, with
`count='exact'`. The family modal's Billing tab renders it and is the hub; Billing
and the recurring list link to it; labels say "Monthly tuition (invoiced by the
school)" and "Monthly plan (Stripe subscription)". `web/src/utils/money.js
formatCents` replaces the ten web copies; `utils/money.format_cents` replaces the five
backend ones; the legacy config mirror in `org_finance_flags` goes with M8.
*On screen*: A/CC one card answers "how does this family pay, and are they current";
P `$0`, `-$12.00` and blank render the same everywhere. **Size S/M. Wave 1.**
Ratchet: no local `money(` or `_money(` helper.

### Track C — settings, obligations, queues

**M8. One settings writer.** Collapses H1-H3, G6. Moved up to Wave 0 because the
writer count doubled in three days. First half: backend `PATCH /api/sis/settings`
does the read-modify-write of `sis_settings` keys in one place;
`registration_config.with_registration_config` is the one registration-config
writer and the `icreate_registration` mirror stops; web `useSisSettings()` exposes
`settings` and `patch({key})` and the twelve cards use it; `settingsRegistry.jsx` is
the one index and the two cards the setup tab mounts register there; one
`useRegistrationConfig()` replaces the two copy-pasted org fetches. Second half,
later and larger: a `sis_time_blocks` table with stable ids so renaming a block no
longer orphans block rosters, the builder, the sheet sync and the AI prompt (E1).
*On screen*: A two admins on two cards no longer erase each other; one Settings index,
one Registration setup. **Size S then L. Wave 0 (first half), Wave 3 (second).**
Ratchet: no `feature_flags` PUT from `web/src/components/sis` or `web/src/settings`;
`icreate_registration` has zero writers.

**M9. One portal, one signature capture.** Collapses F1-F5. Copy the pattern the repo
already uses for signature requests: a `routes/sis/portal_views.py` with functions
taking `(org, user, bucket, allow_hr)`; `parent.py` and `staff_portal.py` become thin
mounts (route owners unchanged). `/secure-documents/signature-requests` is the one
mount; the staff-admin path redirects for one release. The three task endpoints each
become a one-liner into `sis_tasks_service.list_my_tasks(audience)` (their gates
differ, so this is a ratchet, not a merge). Web: one `MyTasksPage` (audience from
role) for staff, matching the family Forms page's shape; one `SignatureCapture` that
fetches the affirmation text from the server, used by the funnel step, the checklist
and HR. Mobile's paperwork host keeps linking to the web.
*On screen*: P and T the same "My tasks" shape and the same signature widget; the
funnel's affirmation matches what the school configured; A signature requests in
one place. **Size M. Wave 2.** Ratchet: portal route bodies are three lines or fewer;
one `SignatureCapture`.

**M10. One queue recipe, one status pill, one door per destination.** Collapses F6,
F7, G5, and the new copies. A `components/sis/ui/StatusPill.jsx` plus a
`statusMaps.js` holding the fifteen vocabularies as data (nothing to adopt — the old
shared badge was deleted as unused). The Forms queue is mounted once and `/forms`
redirects. Dashboard tiles link to canonical tab ids and the legacy remap goes.
`/onboarding` becomes a redirect into Task Center; `/forms`, `/my-documents`,
`/secure-documents` keep their deep-link mounts as `SisRoutes.jsx:190-193` explains,
and Secure Documents gets a nav entry under the `hrOnly` gate nobody uses. One
`DashboardCard` for the three dashboards.
*On screen*: A/CC/T the same colour means the same status on every queue; one way
into each queue from sidebar, dashboard and deep link. **Size S/M. Wave 0.**
Ratchet: no `STATUS_STYLES`, `ATT_COLORS`, `ITEM_BADGE` or `STATUS_TONE` outside
`statusMaps.js`; no redirected route rendering a page.

### Track D — calendar and schedule

**M11. One schedule toolkit.** Collapses E5-E7 and the time formatters in L.
`web/src/utils/schedule.js` exports `toMin, overlaps, fitsAge, ageFromDob(dob, asOf),
fmtTime, fmtDays`, with `asOf` the org's first day of school so the builder, the CLP
screen and the student modal agree on a child's age. `WeeklyScheduleGrid` is
canonical; the CLP grid and My Classes become usages, and the 2026-08-25 bug is fixed
once. One `ClassSummaryLine` (seats, ages, price) for the six renderings. Backend:
`sis_service.student_schedule(org, student_id)` returns one shape; the three routes
keep their owners and serialize it; one web `ClassListItem` and one mobile type
consume it.
*On screen*: P the builder, the CLP meeting and the child's profile agree on which
classes fit; times look the same everywhere. T My Classes and the class page share
a grid. S the same class rows on the phone. **Size M. Wave 0.** Ratchet: one
`fmtTime`, one `fitsAge`, one `ageFromDob` in `web/src`.

**M12. One "today", one events feed, one event clock.** Collapses E2-E4.
`_today_org_schedule` becomes public `today_schedule(org, date, class_scope=None)`;
the admin dashboard drops the legacy `get_dashboard` slice; the teacher route is the
same call with `class_scope()`. One `sis_events_service.feed(org, viewer)` derives
audience from the caller's role and backs all six reads, including ICS; events adopt
M1's audience module for labels. Port the mobile fix: `fmtTimeRange` and
`fmtDayHeading` into `web/src/utils/timeFormat.js` with a `schoolEventWallClock`
guard test that refuses a reader formatting these stamps anywhere else, replacing the
four web implementations. The guard matters more than the helper — this bug family
has shipped three times.
*On screen*: A/CC/T today's schedule is the same list on the dashboard, the
coordinator view and the teacher schedule; P the calendar and the community feed
show the same events at the time the office typed. **Size M. Wave 0.** Ratchet:
`sis_events` read from one function; no `timeZone: 'UTC'` literal outside
`timeFormat.js`.

### Track E — one surface per entity

**M13. One detail surface per entity.** The People merge did the list half; the
detail half remains. Five independently shippable sub-moves:
- 13a Student: `StudentDetailModal` canonical; the CLP profile opens it; one
  `StudentRow` for the People table and class rosters; the learning-app admin student
  page links to it rather than keeping its own editor (ticket `7962081e`).
- 13b Family: `FamilyDetailModal` canonical; Billing, the recurring list and the
  directives card link into it; one family photo (M4e).
- 13c Staff: one `StaffDetailModal` with tabs absorbs the teacher, employment and
  link-account modals; the phone number is edited on My Profile (self) or the staff
  modal (others), nowhere else.
- 13d Class: `ClassFieldsEditor` is the one form (fix the two pixels, delete the
  comment); stop embedding the create modal inside the detail modal; the preview
  variants become one `ClassPreview` with an audience prop. The cross-link is done.
- 13f One `useRegistrationConfig()` hook (with M8).
*On screen*: A/CC clicking a student, a family, a staff member or a class anywhere
opens the same thing with the same tabs. **Size M each. Wave 2.** Ratchet: one
staff phone input; `CreateClassModal` mounted once.

### Track F — primitives and hygiene

**M14. SIS layout and primitives adoption**, page by page, ratcheted. Collapses L.
In order, each its own PR: (a) `SisLayout` renders the org-picker header once and
thirty pages delete theirs; (b) `GlassTabBar` for every SIS tab bar and `StatusPill`
from M10; (c) a `PersonPicker` on `SearchSelect` replaces the four rebuilt pickers;
(d) `ui/Modal` for every dialog; (e) `ui/Input`, `FormField` and `ui/Button` page by
page, and one `SortableTable` for the 23 raw tables. Bring the SIS into
`docs/design/DESIGN_SYSTEM.md`.
*On screen*: everyone gets the same header, tabs, inputs, buttons and dialogs on
every console page; no feature changes. **Size L overall, S per page. Wave 0 for
(a) and (b), Wave 2 for the rest.** Ratchet: a `test_sis_primitives_do_not_grow`
counting hand-rolled recipes, decremented in each PR.

**M15. Backend route hygiene.** Collapses K1, K6. `utils/org_resolve.py
org_or_error(user_id)` built on `sis_service.resolve_org_id` with the `request.form`
fix, imported by all 27 modules; a `routes/sis/internal.py` registrar declares the
seven cron endpoints.
*On screen*: Ops superadmin uploads work on every SIS route. **Size S. Wave 0.**
Ratchet: no `def _org_or_error` in `backend/routes`.

**M16. One person-matching and one attach path.** Collapses K4 and the new doors.
`likely_same_student` becomes the single matcher in `services/person_matching.py`;
`services/sis_attach_service.attach_student(org, student, household, source)` is the
one write path (and where M2's `apply_directives` runs), called by every entry point
including the People page's three-door `+ Add` menu; `link_staff_account()` for the
six staff-linking paths; the standing change has one service and three thin doors.
*On screen*: A/CC "possible duplicate" means the same thing on the roster, in the
unassigned filter and in imports; a family attached by any route gets its directives
applied. Data-affecting for every org that imports; fixture tests per entry point.
**Size L. Wave 3, after M2 and M4.** Ratchet: `household_members` inserts in one module.

**M17. One export and one print path.** Collapses K5. One `ExportColumnsModal` with
`columns` and `storageKey` props, also used by the Reports table; one
`roster_export_service.rows(org, scope, columns)` on `fetch_all_rows` behind the six
CSV routes; one `PrintView` stylesheet.
*On screen*: A/CC/T the same export dialog everywhere, remembering columns per
context. **Size S/M. Wave 0.**

**M18. One training system.** Collapses K7 — new on 2026-09-15 and cheapest to fix
while it is three days old. One training catalogue row shape `{kind: 'quest' |
'link', targeting, required, progress}` served by `staff_training.py` (the older,
richer API is canonical); a link is a training whose completion is an
acknowledgment; one `_applies` predicate over one targeting model (the newer
`visible_to_roles` + `visible_to_user_ids` one, with age bands folded in); one
progress report; the document library no longer has to exclude trainings. Web: one
`TrainingForm` with a kind switch, `SearchSelect` for people, `trainingCopy.js` for
both kinds. Fold in the three independent 20,000-character truncation literals from
`BACKLOG_PLAN_2026-08-18.md` (tickets `8cdaef04`, `7c8c12a2`).
*On screen*: A one Training page with one add flow and one "who has done what".
Tickets `be12106a`, `b26c05e3`, `b2e109d4`, `f1286b5a`, `05cc69d8`. iCreate's 14 link
rows either migrate to `sis_staff_training` or keep their column and are read
through the one service; either is tiny. **Size M. Wave 1.** Ratchet: one
`/api/sis/training*` progress endpoint; no `inputClass` in `TrainingLinks.jsx`.

**M19. Parent surface parity.** Collapses the parent-side items in N. (a) Delete the
unreachable second `/connections` rule and pick one door for peer approvals (the
child card; the approvals page redirects). (b) Name the two "family quests"
honestly — "your family's quests" and "from the school" — and render both through one
`QuestListItem`. (c) Retire the two legacy absence request shapes once mobile sends
`selections`, with a mobile OTA first. (d) Make the mobile school hub's tabs match
the web shell's, with web-only tabs as "view on web" doors inside the hub rather
than missing. (e) One child-summary endpoint, the other an adapter.
*On screen*: P the same school hub on phone and web; one place for approvals; one
"quests" word per meaning. **Size S/M. Wave 2.** Ratchet: one route rule per path in
`App.jsx`.

### Deferred — real duplicates, not on the clock

- **Kiosk** (J1). The right shape is obvious: the generic kiosk gains cohort grouping
  and a configurable idle timeout as org kiosk settings, the Treehouse page becomes a
  wrapper, device rows are copied preserving tokens so nothing re-enrolls. The reward
  for iCreate is zero and the risk is two physical devices. Schedule it when the
  Treehouse asks for a generic-kiosk feature or vice versa, with someone on site.
- **AI propose/apply primitive** (K3). Consolidate when the fifth AI feature arrives;
  until then it is three components, not a correctness risk.

### The waves

| Wave | Moves | Why together |
|---|---|---|
| **0** — mechanical or already an incident; parallel-safe; no migrations | M1, M3, M8 (first half), M10, M11, M12, M15, M17, M14a/b | Each can be a separate branch. Only overlap: M1 and M15 both touch `routes/sis/community.py`; M1 owns it. |
| **1** — data-shaped; one owner per track | Money strictly M5 → M6 → M7; in parallel M2 → M4; M18 | M5 defines the `lines` shape M6 writes and M7 shows. M2 before M4 because the funnel's landing step is where directives get applied. M18 while the duplicate is days old. |
| **2** — UX coherence once the data is straight | M9, M13a-d and 13f, M14c/d/e, M19 | So surfaces are not rebuilt twice. |
| **3** | M16, M8 (second half), then the deferred items if ever | M16 depends on M2 and M4. |

M14 is the ideal "spare afternoon" queue: one page per PR, the ratchet count goes
down by one.

## 6. Optional dead-code cleanup — Tanner's call, not the roadmap

Each of these is a write-only column, a route file with no caller, or a stale seam —
not a feature a school could turn on. Confirm zero callers with a grep and Sentry
before removing any of them.

- `registration_tier` on `households` and `sis_family_directives`: three writers, no
  reader anywhere since the web filter went on 2026-09-16 (folded into M2).
- `backend/routes/sis/gradebook.py`, 452 lines, retired from the UI on 2026-07-28,
  still registered; its two tables are still read by `student_records.py`, so the
  routes can go and the tables stay.
- `backend/services/sis_prior_learning_ai.py`: a docstring that says nothing calls a
  model, imported by the analyzer that does.
- The dead cart *path* (E9): `backend/services/sis_registration_service.py`, the cart
  routes in `backend/routes/sis/registration.py:37-146` and
  `backend/routes/sis/parent.py:66-157`. Tables stay per decision 3. Only after M6
  re-points the billing quote.
- After M4: the `ufa_private`, `enrolled_private_school` and `sis_tuition_plan` writers.
- After M8: the `icreate_registration` keys and the legacy fallback in
  `backend/utils/registration_config.py`.
- After M1: `mergeFeedItems`, the mobile heuristic, and the `revise_for_source` /
  `retract_for_source` forwarding.
- After M10: `LEGACY_TABS`; after M13d: the two-pixel comment.
- Already gone since the first sweep: the `/api/icreate` alias, the CSRF alias prefix,
  the admin prompt-management service, 164 web files and 11 backend modules.

## 7. Where a merge would be wrong

These share a word or a screen. The fix is naming, linking or one read model — never
a data merge.

| Pair | Why they are different | The fix |
|---|---|---|
| Per-class seat waitlist vs age-band enrollment waitlist | A seat queue vs an admission queue | Rename everywhere: "Class waitlist" and "Enrollment waitlist"; one Add-to-waitlist modal that asks which; the dashboard tile shows both counts (M10, M13a) |
| `households.funding_source` vs the family's `payment_intent` answer | Staff-set gate vs the family's own words (decided 2026-08-21) | Keep both; retire the three mirrors (M4) |
| School of record in three places | One concept, two mirrors of the first | Canonical destination; mirrors read-only (M4) |
| `sis_family_directives` vs household holds | Staging before a household exists vs the live record | Apply once at attach (M2); never reconcile continuously |
| `announcements` vs `sis_announcements` | Delivery receipt vs the post | Single writer and single server-side reader (M1); both tables stay |
| Three pay-link namespaces | Three different powers granted to a link holder | One signing helper, three namespaces (M6) |
| Recurring tuition vs the funnel's Stripe subscription | Optio-issued invoice vs school-managed subscription; different owners of the money | One household billing card with honest labels (M7). Whether iCreate ever uses the subscription mechanism is a product decision |
| Form templates vs checklist items | Two obligation kinds; form templates is a zero-row feature that stays | Already unified at the task and authoring layers; M9 thins the endpoints only |
| `/api/parent/*` vs `/api/sis/parent/*` | Platform parent vs school parent | One child list already (done); the APIs stay |
| Unread badge vs notification bell | Conversations vs system notifications | Keep two; SIS notifications get their own type (M1) |
| Training quest vs training link | Same concept, two stores | Merge (M18) — this one *is* a duplicate |
| Generic kiosk vs Treehouse kiosk | Same concept; one is two live devices | Deferred |

## 8. Open questions for iCreate

Answers that change what gets built, in the order the roadmap needs them.

1. **Monthly pricing** (ticket `d4bc2603`, carried since August): is the 6% the
   monthly uplift, does it apply beyond block-priced tuition, and what happens when a
   family switches after an invoice is out? M5 needs this to be one quote.
2. **Will iCreate ever use the Stripe-subscription mechanism** the funnel now
   offers, or stay on invoiced recurring tuition? Decides which of the two monthly
   systems M7 labels as yours.
3. **Age band 10-11**: the gate has released nobody while 5-9 has released twelve. Is
   it still intended, or is it quietly blocking registrants?
4. **Auto-promote from a class waitlist** when a seat frees, opt-in per class: this is
   the third round of "why is the seat open with people waiting". A yes or no.
5. **Coordinator edit rights on classes**: today full edit. Any fields that should be
   view-only for them?
6. **Campuses**: one physical campus under the org, or several? Nothing in the data
   model knows a campus; "their campus" cannot mean anything until this is answered.
7. **Training**: is a link-based training with an "I've read it" tick enough, or do
   some trainings need the quest's evidence and XP? M18 keeps both kinds; the answer
   decides the default.

## 9. Appendix

### 9.1 Production usage, read 2026-09-17

SIS-enabled orgs and who is in them:

| Org | Admin tier | of which coordinators | Teachers | Parents | Students | Notes |
|---|---|---|---|---|---|---|
| icreate | 10 | 7 | 31 | 93 | 229 | community on; phone gate on; funnel config; no hidden modules |
| optio-academy | 0 | 0 | 0 | 12 | 13 | hides 8 modules; goals flow; only user of recurring tuition |
| gryffin | 1 | 0 | 4 | 8 | 15 | hides timesheets, CLP; goals flow |
| horizon | 1 | 0 | 1 | 2 | 6 | goals flow |
| arete | 1 | 0 | 3 | 2 | 63 | hides 12 modules; kiosk on; submissions on |
| test | 0 | 0 | 0 | 0 | 0 | kiosk on |

Rows per table, by org (iCreate first): attendance 2,432 / 157 gryffin / 25 horizon;
attendance alerts 198 / 8; planned absences 69; invoices 188 / 5 optio-academy;
payment records 92 / 5; QuickBooks sync log 334 / 10; recurring tuition 7
(optio-academy only); form submissions 50 / 1; onboarding assignments 111; events
83 / 1; secure documents 136; submission reviews 104 / 265 gryffin / 21 horizon / 7
arete; engagement alerts 554 / 291 / 35; CLP records 149; enrollment waitlist 47;
class waitlist entries 151; family directives 63; carpool posts 7; announcements
27 / 1; board announcements 11; training quests 4; training links 14; student goals
3 (optio-academy); kiosk devices 4 (arete and test orgs); households 98 / 9 / 8 / 4;
classes 211 / 20 / 15 test / 7 horizon; open tickets 26 iCreate, 14 unattributed, 1
gryffin.

Zero rows anywhere (2026-09-14, `pg_stat_user_tables`): `sis_time_entries`,
`sis_staff_assignments`, `sis_resource_acks`, `sis_lost_found`,
`sis_learning_day_selections`, `sis_student_records`, `sis_student_materials`,
`sis_registrations`, `sis_registration_items`, `sis_form_templates`,
`sis_assignment_templates`, `sis_student_assignments`, `sis_discount_rules`,
`sis_payment_reminders`, `sis_curriculum_courses`. These stay (decision 3).

### 9.2 Code inventory

Backend: 40 route modules under `backend/routes/sis/` (17.3k lines; the largest
`backend/routes/sis/staff_training.py` 1,340, `backend/routes/sis/curriculum.py` 1,282,
`backend/routes/sis/__init__.py` 1,241, `backend/routes/sis/class_quests.py` 1,127);
52 SIS and registration services (27.3k lines; the largest
`backend/services/sis_billing_service.py` 2,915, `backend/services/sis_service.py` 2,504,
`backend/services/sis_parent_service.py` 1,625, `backend/services/sis_onboarding_service.py` 1,475). Web: 44 SIS pages (33.3k lines; the largest
`FamilyDetailModal.jsx` 957, `StaffTrainingPage.jsx` 916, `ReportsPage.jsx` now 670
after the rebuild, `StudentDetailModal.jsx` 900) and 69 SIS components (17k lines; the
largest `ClassQuestsManager.jsx` 743, `RegistrationSetupTab.jsx` 589,
`CurriculumResources.jsx` 574), plus the funnel (`RegisterFunnelPage.jsx` 983,
`registerFunnel/` steps) and the Schedule Builder (`ScheduleBuilderPage.jsx` 920,
`scheduleBuilder/` 16 files). 182 SIS source files, 304 with tests; every page has at
least one test.

### 9.3 Open iCreate tickets that are this problem

From `bug_reports` on 2026-09-17 (Perch is retired; the `tickets` skill has the
vocabulary). By the move that closes them:

- **M1** `b32b2fca` bulk messaging; `597ba9a4` teacher-only announcements visible to
  parents?; `b4a4d250` announcements as group messaging; `4b364a4c` "9+ messages when I
  have 3"; `83c94d73`, `83092eae`, `72dabff8` announcements tab loading (being fixed).
- **E8 naming, M10/M13a** `ba6a89fc` "#14 for Art Expeditions but…".
- **M13a** `7962081e` cannot rename a student without an email, filed from the
  learning-app admin page.
- **M18** `be12106a`, `b26c05e3`, `b2e109d4`, `f1286b5a`, `05cc69d8`, and the
  truncation pair `8cdaef04`, `7c8c12a2`.
- **M3/masquerade** `7e0a06dd` exit masquerade says not masquerading; `851764d3`,
  `b25bfa75` call for help fired while previewing (being fixed).
- **H1/G4** `f9b5f2ea` quest library as its own Operations tab.

### 9.4 Sources

`docs/icreate/BACKLOG_PLAN_2026-08-18.md`, `CAMPUS_COORDINATOR_PORTAL_GAP_ANALYSIS_2026-08-09.md`,
`FEEDBACK_ROUND6_QUESTIONS_2026-07-28.md`, `FORM_BUILDER_PROPOSAL_2026-08-20.md`,
`PRESENCE_AND_PAY_DISCUSSION_2026-08-18.md`, `REQUESTS_V2_HANDOFF.md`,
`PERCH_SWEEP_2026-09-14.md`, `TEACHER_PORTAL_PLAN.md`, `age-group-waitlist-gating-design.md`,
`waitlist-sibling-priority-design.md`, `feedback-2026-07-21-ufa-clp.md`,
`FAB_TRIAGE_2026-07-29_enrollment_counts.md`; `docs/sis/ROLE_CAPABILITIES.md`;
`docs/OPTIO_ACADEMY_ONBOARDING_AUDIT_2026-09.md` (the parent journey for the other
funnel-using org); commit messages on `main` between `90471b8d` and `f685a2ab`.
