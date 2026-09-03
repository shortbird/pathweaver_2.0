# Credit Partner Program — design and build plan

**Status:** Proposal | **Drafted:** August 31, 2026 | **Owner:** Tanner

How an outside organization (a soccer club, a piano studio, a dance company, a
robotics team) enrolls its participants in Optio Academy and has their
participation turn into high school credit on an accredited transcript that
Optio delivers to the family's school of record.

This generalizes the AGO Pipe Organ Encounter pilot
([POE_LAUNCH_PLAN.md](../POE_LAUNCH_PLAN.md)) from one hardcoded program into a
repeatable one. Nothing here is subject-specific.

---

## 1. What the POE pilot already proved

The end-to-end path works in production today. Verified against prod on
2026-08-31:

- 28 interest signups, 20 linked participants, 14 class quests marked
  `credit_awarded`.
- 13 official transcripts emailed to real registrars (Agoura High School, Sage
  Oak Charter, Mt. Everest Academy, Green Canyon High School, BYU Online High
  School, Stuyvesant, Evergreen Lutheran) through
  `POST /api/admin/transcript/<user_id>/send`, each logged in
  `transcript_transfer_log` with a public verification link.

So the hard parts — accredited credit, a real transcript, delivery to a
registrar who accepts it — are done. What does not scale is everything around
them.

## 2. What does not scale

Every piece of POE is spelled with the letters P, O, E:

| Hardcoded today | Where |
|---|---|
| `poe_cohorts`, `poe_signups`, `poe_participants` tables | [20260601_create_poe_cohorts.sql](../supabase/migrations-archive/20260601_create_poe_cohorts.sql) |
| The class title, big idea, subject, pillar, logo, hero image, credit XP | [backend/routes/admin/poe.py](../backend/routes/admin/poe.py) |
| The five day-by-day tasks | `POE_DAILY_TASKS`, same file |
| The public interest page | [frontend/src/programs/poe/PoePage.jsx](../frontend/src/programs/poe/PoePage.jsx) |
| Linking a registered user to the program | `POST /api/admin/poe/link-participant`, superadmin, one at a time |
| Awarding the credit | `POST /api/admin/poe/award-credit` |
| The school-of-record columns | `poe_signups` / `poe_participants` only |
| A carve-out in the transcript builder | `poe_quest_ids` in [transcript_generator.py](../backend/routes/admin/transcript_generator.py) |

Adding a second partner by copying this is a migration, a route module, a public
page, and a transcript carve-out per partner. Adding the tenth is unmaintainable.
The partner also has no surface of their own: every step runs through a
superadmin.

## 3. Two things to fix before scaling

Both found while researching this plan. Both are in the direct path of partner
credit.

### 3a. Org-managed students get no accreditation mark

`resolve_transcript_accreditation`
([backend/utils/accreditation.py](../backend/utils/accreditation.py)) decides
whether a transcript carries the WASC mark:

- `organization_id IS NULL` → `'optio'` (treated as an Optio Academy student)
- otherwise → the org's `organizations.accreditation_source`

**In prod, every organization has `accreditation_source = 'none'` — including
Optio Academy itself.** The five real students sitting in the Optio Academy org
(`8ee22671-6e38-473c-a326-90ff86460310`) would render a transcript with no
accreditation claim on it.

This has not bitten yet only because all 13 transcripts sent so far belonged to
platform-direct students. It bites the day a partner's students are enrolled
under an org, which is exactly what this project does.

"No `organization_id`" is a proxy for "Optio Academy student" that stops being
true the moment a student belongs to any organization — and partner students
frequently already belong to one (a microschool, another program). The fix is to
stop inferring it. See `academy_enrollments` in §5.

### 3b. The POE credit has two award paths and they disagree

All 20 `poe_participants` rows have `credit_awarded_at = NULL`, yet 14 of their
class quests are already `class_review_status = 'credit_awarded'`. The credit was
awarded through the generic class-review path, not `/api/admin/poe/award-credit`.

Today's transcripts are still correct, because the XP deposit that endpoint
performs never happened either — so there is nothing to double-count. But the
system now has two mechanisms for "this credit is awarded" that write different
rows, and a carve-out in the transcript builder that keys off the one that is
empty. Running the POE award endpoint on those 14 students now would deposit
1000 fine-arts XP on top of a class credit they already hold.

Pick one mechanism before there are ten partners. Recommendation in §5.4.

---

## 4. The model

Four ideas, in the shape the platform already has.

**A partner is an organization.** Not a new entity. `Utah Elite Sports`,
`The Artful Nest Studio` and `OnFire Learning` are already `organizations` rows.
Being a credit partner is a module they have switched on, per
[ARCHITECTURE_BLOCKS.md](ARCHITECTURE_BLOCKS.md). That inherits org branding,
org admin roles, invitations, and the registration funnel for free.

**A student is an Optio Academy enrollee, explicitly.** A row, not an inference
from a null column. It is what makes the transcript an Optio Academy transcript,
and it is independent of whatever org the student's account lives in. One student
can hold credit from two partners and still have one Academy enrollment.

**The partner attests, Optio awards.** The coach confirms participation. A
licensed Optio teacher reviews and awards the credit. This is the accreditation
firewall, and it is also already the code's shape: awarding runs through
`require_admin`, which is superadmin-only
([class_reviews.py](../backend/routes/admin/class_reviews.py)). The partner never
gets that button.

**Where the records go is captured at enrollment, once, per student.** Not typed
into a modal at send time by whoever happens to be sending.

---

## 5. What to build

### 5.1 `academy_enrollments`

The student's relationship with Optio Academy, the accredited school of issue.

```
id                uuid pk
user_id           uuid not null references users(id)
pathway           text not null   -- 'full_time' | 'parent_supported' | 'partner_credit'
status            text not null   -- 'active' | 'completed' | 'withdrawn'
grade_level       text
graduation_year   int
enrolled_at       timestamptz not null default now()
withdrawn_at      timestamptz
agreement_signed_at timestamptz
consent_log_id    uuid references parental_consent_log(id)
unique (user_id)                  -- one Academy enrollment per student
```

Then change `resolve_transcript_accreditation` to return `'optio'` when an
active `academy_enrollments` row exists, **before** consulting
`organization_id`. Keep the existing platform-direct fallback so nothing regresses,
and separately set `accreditation_source = 'optio'` on the Optio Academy org
(§3a). Backfill a row for every current platform-direct student who holds Optio
credit, and for the 14 POE awardees.

### 5.2 `student_records_destination`

The registrar question, asked once, stored structured. This is the POE
school-of-record columns lifted out of POE.

```
id                  uuid pk
user_id             uuid not null unique references users(id)
destination_type    text not null   -- 'school' | 'homeschool' | 'optio_only'
school_name         text
school_city         text
school_state        text
school_district     text
registrar_name      text
registrar_email     text
registrar_phone     text
student_id_at_school text
auto_send_consent   boolean not null default false
consent_captured_at timestamptz
updated_by          uuid references users(id)
```

`auto_send_consent` matters. Emailing a minor's transcript and date of birth to a
third party is outward-facing; the family authorizes it at enrollment or it does
not happen in bulk. Without consent the credit-awarded email instead gives the
family a one-click "send it to my school" button.

Wire it in three places:
- a step in the registration funnel (§5.5)
- prefill `TransferToSchoolModal`
  ([frontend/src/components/transcript/TransferToSchoolModal.jsx](../frontend/src/components/transcript/TransferToSchoolModal.jsx))
  instead of typing the school by hand
- the bulk roster send (§5.6)

### 5.3 `partner_offerings` and `partner_enrollments`

The generalization of `poe_cohorts` / `poe_participants`.

```
partner_offerings
  id                 uuid pk
  organization_id    uuid not null references organizations(id)
  slug               text not null unique      -- public URL key
  title              text not null             -- "Competitive Season 2026-27"
  subject            text not null             -- SCHOOL_SUBJECTS key: 'pe', 'fine_arts', ...
  credit_value       numeric not null default 0.5
  expected_hours     int                       -- the basis for the credit (§7)
  award_model        text not null default 'attestation'  -- 'attestation' | 'portfolio'
  start_date         date
  end_date           date
  enrollment_opens_at  timestamptz
  enrollment_closes_at timestamptz
  is_active          boolean not null default true
  syllabus           jsonb    -- outcomes, evidence guidance, task template,
                              -- branding (logo_url, hero_url) — everything that is
                              -- a constant at the top of routes/admin/poe.py today

partner_enrollments
  id                    uuid pk
  user_id               uuid not null references users(id)
  offering_id           uuid not null references partner_offerings(id)
  class_quest_id        uuid references quests(id)
  status                text not null  -- 'interested' | 'enrolled' | 'documenting'
                                       -- | 'attested' | 'credit_awarded' | 'declined'
  partner_attested_at   timestamptz
  partner_attested_by   uuid references users(id)
  partner_notes         text
  hours_reported        int
  credit_awarded_at     timestamptz
  awarded_by            uuid references users(id)
  unique (user_id, offering_id)
```

Provisioning is `_provision_poe` with its constants read from
`partner_offerings.syllabus` instead of module-level globals: create the
per-student class quest, enroll, generate tasks from the template, write the
enrollment row. Same function, same idempotency, no POE in it.

### 5.4 One award mechanism

Use the class-quest path (`class_review_status = 'credit_awarded'` →
`class_credits` in the transcript). Retire the subject-XP deposit in
`/api/admin/poe/award-credit` and the `poe_quest_ids` carve-out with it.

One blocker: the class path hardcodes `CLASS_CREDIT_VALUE = 0.5` in two files
([transcript_generator.py:64](../backend/routes/admin/transcript_generator.py#L64),
[public.py:336](../backend/routes/public.py#L336)). A full year of piano is 1.0.
Add `quests.credit_value numeric default 0.5`, set it from the offering, and read
it in both places. Also revisit the hardcoded `grade: 'A'` — a participation-based
credit is more defensibly recorded as `P`.

### 5.5 Enrollment: reuse the funnel

`/enroll/<code>`
([registration_funnel.py](../backend/routes/registration_funnel.py)) is already
org-neutral and already runs for Optio Academy, iCreate, and Gryffin. It handles
the parts POE had to do by hand: account creation, Google and Apple sign-in,
email OTP, attaching an account that already exists elsewhere, per-student
questions, and e-signed paperwork into `parental_consent_log`.

Two additions:
- a **records destination** step writing `student_records_destination` (§5.2),
  configurable on per org so only credit partners see it
- an **offering** step when the org has more than one active offering

That replaces the entire `/poe` page, the `poe_signups` table, the confirmation
email, and the manual link-participant step with configuration.

### 5.6 The partner's own surface

The piece POE never had, and the reason it needs a superadmin per student.

A roster page for the partner org admin, at `/partner` in the app, gated on the
`credit_partner` module:

- **Roster** — who enrolled, who is documenting, who is attested, who is awarded
- **Attest** — check off participants at the end of the term, add hours and a
  note, submit. Writes `partner_attested_at`. Does **not** award.
- **Share** — their enrollment link and a QR code
- **Status** — counts only; no transcripts, no other families' data

On the Optio side, a "partner attested" queue in the existing Credit Review
dashboard, plus a bulk approve for a whole roster, plus a bulk transcript send
for the students whose families consented.

### 5.7 Phasing

| Phase | Contents | Unblocks | Status |
|---|---|---|---|
| **0** | Partner-facing guide and partner agreement. No code. | Signing partners now, run manually on the POE path | Guide **done**; agreement not written |
| **1** | `academy_enrollments` + accreditation fix (§3a), `student_records_destination` + funnel step, `TransferToSchoolModal` prefill | The registrar capture this project is about; manual operation at 10x | **Built** 2026-08-31, see §5.8 |
| **2** | `partner_offerings` / `partner_enrollments`, generic provisioning, partner roster + attestation | Partners self-serve; superadmin out of the per-student loop | Not started |
| **3** | `quests.credit_value`, single award path, POE retired onto it, bulk send, partner dashboard | Multiple credit values; no per-program carve-outs | Not started |

Phase 1 is the answer to "how do we gather the registrar info". Phase 2 is what
makes it a program rather than a favor.

### 5.8 What phase 1 actually shipped

Migration
[20260831000000_academy_enrollment_and_records_destination.sql](../supabase/migrations/20260831000000_academy_enrollment_and_records_destination.sql)
(applied to prod 2026-08-31; additive, two new tables, no data touched).

| Piece | Where |
|---|---|
| Enrollment + destination logic, all idempotent | [backend/services/academy_enrollment_service.py](../backend/services/academy_enrollment_service.py) |
| Accreditation reads the enrollment first (§3a fix) | [backend/utils/accreditation.py](../backend/utils/accreditation.py), wired at all 3 call sites |
| `POST /api/registration/registrations/<id>/records` | [backend/routes/registration_funnel.py](../backend/routes/registration_funnel.py) |
| Completion enrolls each student in Optio Academy | `academy_enrollment_service.enroll_registration_kids`, called from `_finish_fee_step` |
| Saved answers returned on resume | `academy_enrollment_service.destinations_for_kids` |
| The School records funnel step | [frontend/src/pages/RegisterFunnelPage.jsx](../frontend/src/pages/RegisterFunnelPage.jsx) |
| Admin switches for both behaviors | [frontend/src/components/sis/RegistrationSetupTab.jsx](../frontend/src/components/sis/RegistrationSetupTab.jsx) |
| Send form pre-fills from the stored destination | [frontend/src/components/transcript/TransferToSchoolModal.jsx](../frontend/src/components/transcript/TransferToSchoolModal.jsx) |
| Tests | [backend/tests/test_academy_enrollment.py](../backend/tests/test_academy_enrollment.py) (22), [frontend/src/pages/registrationRecordsStep.test.jsx](../frontend/src/pages/registrationRecordsStep.test.jsx) (7), 6 added to `registrationSetupTab.test.jsx` |

**Turning a partner on** (superadmin, no code):

1. Create the organization, or use the existing one.
2. SIS -> Registration: the family registration link is auto-provisioned.
3. On the Contacts & questions step, open **Optio Academy credit** and tick
   both switches (ask for the records destination; enroll in Optio Academy).
4. Save. The funnel gains a **School records** step, and finishing it enrolls
   each student in Optio Academy under `pathway='partner_credit'` with
   `partner_org_id` set to that organization.
5. Send the partner their link plus the guide.

Two deliberate limits, both waiting on phase 2:

- **The class quest is still provisioned by hand.** Enrollment records who is an
  Academy student and where the transcript goes; it does not yet create the
  per-student credit class. That is `partner_offerings` (§5.3).
- **`auto_send_consent` is captured but nothing sends on it yet.** The bulk send
  is §5.6. Until then the field records permission the family has given, and the
  Transfer to School form pre-fills from the same row.

---

## 6. What not to rebuild

Already in production and load-bearing:

- Account creation, Google/Apple, OTP, existing-account attach, e-signed
  paperwork, parental consent — the registration funnel
- Credit-class machinery: `quest_type='class'`, `transcript_subject`,
  submit-for-review, `credit_awarded`
- Transcript render, PDF, public verification page, registrar email, transfer
  audit log — 13 real sends
- WASC display and compliance constants
  ([frontend/src/constants/accreditation.js](../frontend/src/constants/accreditation.js))
- Org branding, org admin roles, invitations
- The mobile app journal and evidence capture

---

## 7. Decisions needed before Phase 2

These are business calls, not engineering ones. Each one changes what gets built.

1. **Who pays, and how much.** Leaning (2026-08-31): the **partner collects from
   families at their own price, and Optio invoices the partner at Optio's rate**.
   Pricing is negotiated per partner rather than published, so the partner guide
   deliberately carries no cost figure. Two consequences for the build: Optio
   needs partner-level invoicing (a per-term, per-head bill to the org, not a
   family checkout), and the funnel's Stripe fee step stays **off** for credit
   partners. Settle the rate card before Phase 2.
2. **The hours standard.** A WASC-accredited school awarding 0.5 credit for a
   soccer season needs a stated, documented basis. The common convention is 60
   to 75 contact hours per 0.5 credit. Write the number down, put it in the
   partner agreement, and store it in `partner_offerings.expected_hours`. This
   is the single most important thing to settle: it is the first question a
   receiving registrar or an accreditation visit will ask.
3. **Is documentation required?** POE decided attendance alone earns the credit
   and documenting is optional. That is defensible for a supervised camp with a
   roster. It is weaker for "my coach says my kid played." `award_model` supports
   both; pick the default.
4. **Grade convention.** `A` for everyone, or `P` for participation-based credit.
5. **Teacher of record.** The Optio reviewer is the teacher of record and should
   be named on the transcript. Confirm who that is at volume.
6. **What happens when a school says no.** A receiving district can decline any
   outside credit. The partner guide sets the expectation honestly (§ in the
   guide); confirm the refund or remedy position, if any.

---

## 8. Operational deliverables

- **Partner guide** — how it works, what the partner does, what Optio does, and
  ready-to-use website and parent messaging. Written: [docs/partner/CREDIT_PARTNER_GUIDE.html](partner/CREDIT_PARTNER_GUIDE.html). Cost was cut from it on 2026-08-31 (handled per partner); the remaining fill-ins are credit value, subject, dates, and contact.
- **Partner agreement** — the hours basis, attestation duty, data and consent
  terms, use of the Optio name and WASC phrase, term and termination. Not
  written yet.
- **Partner onboarding checklist** — create the org, enable the module, set the
  offering, generate the link, brief the partner on attestation.
