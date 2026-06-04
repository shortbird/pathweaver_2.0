# POE 2026 Pilot — Launch Plan & Readiness Checklist

**Owner:** Tanner Bowman (Optio) | **Partner:** Michelle / AGO CoPOE | **Drafted:** June 4, 2026

This is the operational + software plan to get the AGO Pipe Organ Encounter
Fine Arts credit pilot fully live for all four 2026 camps. It is the working
source of truth — update it as items close.

---

## 0. The binding constraint: timing

Today is **June 4**. Documentation happens **live, during camp** (decided). So
the entire pipeline — onboarding, account, consent, journal topic, working
mobile app — must be live before the first camp starts.

| Cohort | Location | Camp dates | Onboarding must be done by | Days of runway |
|--------|----------|-----------|----------------------------|----------------|
| poe-1-2026 | Hartford, CT | Jun 21–26 | **~Jun 19** | **~15 days** |
| poe-2-2026 | Los Angeles, CA | Jun 21–27 | **~Jun 19** | **~15 days** |
| poe-3-2026 | Winston-Salem, NC | Jul 12–17 | ~Jul 10 | ~36 days |
| poe-4-2026 | Provo, UT | Jul 20–25 | ~Jul 18 | ~44 days |

**Strategy: treat this as two waves.** Wave 1 (Hartford + LA) is the hard
deadline; get those signups the instruction email, registered, and linked first.
Wave 2 (Winston-Salem + Provo) has weeks of runway. The "onboarding must be done
by" dates above are when participants should be registered + linked so they can
document live — under the email-driven model this is ops, not a build deadline.

> **Reality check:** Most POE participants are high-schoolers aged 13–17, i.e.
> **minors**. The **teen owns their own login** (independent student account;
> they self-register in the normal app with Google or email/password) and a
> **parent gives consent over email** for 13–17. So the dominant case is "teen
> registers + parent consents by email." Consent is a soft gate: it must be in
> hand before the credit award, but it doesn't block registration or camp activity.

---

## 1. Current state of the software

### Live in production (Phase 1 — interest capture) ✅
- **`/poe` landing page** (`frontend/src/pages/poe/PoePage.jsx`) — hidden public
  page, not in nav. Hero, benefits, how-it-works, interest form.
- **Interest form** — site picker (all 4 cohorts), student name/email/DOB,
  age-gating (blocks <13 COPPA), conditional parent block for minors,
  credit-destination picker (school vs homeschool), school-of-record capture.
- **`POST /api/public/poe/enroll`** — validates, upserts to `poe_signups`
  (one per email per cohort), sends confirmation email (CCs parent for minors),
  rate-limited 5/300s.
- **`GET /api/public/poe/cohorts`** — returns active cohorts.
- **Confirmation email** — `EmailService.send_poe_signup_confirmation()`,
  branded, says "we'll follow up closer to camp."
- **Schema** — `poe_cohorts` (4 seeded), `poe_signups`, `poe_participants`
  (user_id + track_id + school-of-record cols), `parental_consent_log` extended
  with `consent_method` / `signature_name` / `consent_statement_version`.
- **Signups so far: 1** (test record).

### The remaining gap (now small, under the email-driven model) 🔨
Account creation, consent, and onboarding UI are **no longer build items**
(normal-app self-registration handles auth incl. Google; consent is email/offline).
What's left:
1. **"Link participant to POE" admin step** — match a registered user to their
   signup, create the per-student Fine Arts class quest + enrollment + journal
   topic + `poe_participants` row. Small. *Only pre-camp build.* (§10.2)
2. **Verify mobile journal** works for a self-registered POE student (no build,
   just confirm — frontend-v2 has no POE-specific code and needs none).
3. **Post-camp award step** — attendance → `class_review_status='credit_awarded'`.
   Small. *Not needed until late June.* (§10.3)
4. **School-of-record / counselor notification** — *post-camp.*

---

## 2. The participant journey (target end state)

**Credit model (decided):** Attending the POE earns the credit. Documenting the
week in the Optio mobile app is **encouraged but optional** — it's the product
experience, not a gate on credit. Credit is delivered through the existing
**credit-class** machinery (no new credit system needed).

1. **Director announces** the opportunity to their roster (ops — email template).
2. **Family visits `/poe`**, picks their site, joins the interest list. ✅
   *(`/poe` stays a pure interest form — decided 2026-06-04. No account creation,
   no custom onboarding page.)*
3. **When ready, you email the cohort's signups** with registration instructions.
   For minors, **parental consent is collected over email/offline** using the
   v1.0 statement (§11). 📋
4. **Participant self-registers through the normal app** — Google or
   email/password, the existing register flow, **no build**. You then **link them
   to POE**: create their Fine Arts class quest + enrollment + journal topic +
   `poe_participants` row (small admin step). 🔨 (small)
5. **Student documents the camp** in the app journal (encouraged), June dates.
   Uses the existing journal. 🔨 (verify mobile works for them)
6. **After camp**, the director confirms attendance; you flip the participant's
   POE class to `class_review_status='credit_awarded'` → **0.5 Fine Arts credit,
   grade A** (small admin step). 🔨 (small)
7. **Transcript reflects the credit** (existing transcript feature); school-of-record
   contact notified if provided. 🔨 (notify step)

> **Why this shape (decided 2026-06-04):** Routing people through the normal app
> registration instead of a custom POE onboarding page means **Google sign-in
> works for free** (the existing register flow already supports it) and there's
> no token/dual-auth page to build. Consent over email removes the last real
> build item. Because attendance (not documentation) earns credit, the
> mobile/journal experience is *encouraged*, not a credit gate.

---

## 3. Onboarding model — DECIDED: interest form + email-driven self-registration

Confirmed June 4. `/poe` stays a pure **interest form**. When a cohort is ready,
**you email its signups** instructions to register in the normal Optio app; they
self-register (Google or email/password) through the existing flow. You then
link each registered participant to POE with a small admin step. Parental
consent for minors is **collected over email/offline** (§11 text); you keep the
records. Consent is a soft gate — it must be in hand before the post-camp credit
award, but it doesn't block registration or camp activity.

Why this beats a custom onboarding page (the approach we dropped):
- **Google sign-in works for free** — the normal register flow already supports
  Google and email/password. A custom POE page would have had to re-implement
  auth, and the email/password-only version wouldn't have supported Google.
- **No token/dual-auth page to build, no consent UI to build** — the two riskiest
  items in a 15-day window both disappear.
- **Pilot scale makes manual linking cheap** — tens of participants per cohort.

Trade-off accepted: linking and consent are manual per participant. Fine at
pilot volume; revisit automation only if 2027 scales up.

---

## 4. Build plan (now very small)

No auth, consent UI, or onboarding page to build. Participants self-register in
the normal app; the only software is a small admin linking step and a post-camp
award step. Credit delivery reuses the existing **credit-class** model: a
per-student `quests` row with `quest_type='class'` + `transcript_subject='Fine
Arts'` + `class_review_status` (null → `'credit_awarded'`), enrolled via
`user_quests`, surfaced on the existing transcript. (Precedent: the existing
"Piano" class is already `credit_awarded`.) Credit is attendance-based, so the
award is a manual flip post-camp; `xp_threshold` is not the gate.

> **Per-student, not per-cohort:** `class_review_status` lives on the `quests`
> row and user class quests carry `created_by=user_id` (that's why duplicate
> class titles like two "US History" exist). So each participant gets their own
> "Pipe Organ Encounter" class quest.

**The only build — a "link participant to POE" admin step (NEW, small):**
Given a registered user matched to their `poe_signups` row (by email), do, per
participant:
1. Create their per-student POE class quest: `quests.insert({quest_type:'class',
   title:'Pipe Organ Encounter', transcript_subject:'Fine Arts', is_active:true,
   is_public:false, class_review_status:null, created_by:user_id})`.
2. Enroll: `QuestRepository.enroll_user(user_id, class_quest_id)` → `user_quests`.
3. Create the journal topic: `InterestTracksService.create_track(user_id,
   name='Pipe Organ Encounter', icon='music', color='#8b5cf6')`.
4. Insert `poe_participants` (user_id, poe_cohort_id, track_id, class_quest_id +
   school-of-record cols copied from the signup).
- Implement as a superadmin route `POST /api/admin/poe/link-participant` (or a
  short script), idempotent per user. Include `superadmin` in the role check
  (CLAUDE.md rule 7). At pilot scale this can even be run manually per cohort.

**Verify (no build, just confirm):**
- A POE student who self-registers can log in to the **mobile app**, see their
  "Pipe Organ Encounter" journal topic, and add learning events with photos
  during camp. (Encouraged experience; not a credit gate.)

**Post-camp (credit delivery, not needed until late June):**
- **Attendance → award:** director confirms who attended; flip each
  participant's POE class quest to `class_review_status='credit_awarded'`
  (note in `class_review_notes`). Transcript updates automatically. A superadmin
  `POST /api/admin/poe/award-credit` or a short script.
- **School-of-record / counselor notification:** email the captured
  `school_contact_email` with the transcript/credit.

**Consent (no build):** collected over email/offline using the v1.0 statement
(§11); you keep the records; must be in hand before the award for minors.

---

## 5. Operational deliverables (no code — do these this week)

### 5a. Director email template (directors forward to their rosters)
Send-ready. Directors swap in their site name, the webinar date, and sign off.
Keep the detail on `/poe`; this email just gets families to the list.

> Subject: Earn high school Fine Arts credit at your Pipe Organ Encounter
>
> Hi everyone,
>
> I have some exciting news for this summer's Pipe Organ Encounter. Through a new
> partnership between the AGO and Optio, you have the option to earn 0.5 high
> school Fine Arts credit for taking part in your POE, at no cost to you.
>
> The credit is WASC-accredited and is designed to transfer to your school. There
> is nothing extra to prepare or complete. Attending your POE earns the credit,
> and you are welcome to document your week in the Optio app along the way.
>
> Here is how to take part:
>
> 1. Visit optioeducation.com/poe and add your name to the list.
> 2. Choose [YOUR SITE] as your location.
> 3. Watch for a follow-up email from Optio with the simple steps to finish
>    setting up before camp.
>
> Optio will also host a short live info session for students and families before
> camp to walk through how it works and answer questions. Details: [WEBINAR DATE
> AND LINK].
>
> If you have any questions, reply to this email or reach Tanner at Optio
> (tanner@optioeducation.com).
>
> See you this summer,
> [Director name]

Notes for you: confirm the public URL families should use (the `/poe` page),
fill the webinar line once scheduled, and confirm the contact email you want
listed.

### 5b. Family one-pager / FAQ
Short FAQ to attach or post as a `/poe` section. Suggested questions:
- What exactly does my student earn? (0.5 Fine Arts credit, grade A)
- Does it cost anything? (No, free for 2026)
- Will it transfer to our school? (WASC-accredited; we provide a transcript;
  school decides acceptance; share your counselor email so we can help)
- What does my student have to do? (Attending the POE earns the credit; they are
  encouraged to document the week in the Optio app, just a few minutes a day)
- Who runs this? (Optio, in partnership with the AGO)
- My student is under 18, what do I sign? (Your student creates their own Optio
  account; as the parent you complete a short consent form we send by email,
  needed before the credit is issued)
- What about privacy? (No accounts for under-13; for minors we collect parent
  consent and keep your student's work private to their account)

### 5c. Live webinar (decided format)
- **Audience & cadence:** one combined live session for students + families
  across all sites, before Wave 1 (target **week of Jun 8–12**), with Q&A.
  Record it and share the link so Wave 2 families and anyone who missed it can
  watch on demand.
- **Run of show (~20–25 min):** what the credit is and why it's legit (5) →
  how to register in the Optio app (Google or email), shown live (5) → how
  documenting the week in the app works, shown on a phone (7) → consent &
  privacy for parents (3) → Q&A (5).
- **Owner actions:** pick date/time, set up the meeting link, draft the invite
  (directors forward it), prep slides + a phone screen-share of the app.

### 5d. Director coordination
- Collect each director's **point of contact** (email/phone) — `poe_cohorts.point_of_contact`
  is null for all 4; fill it in so you have a per-site escalation path.
- Confirm each director's expected **roster size** so you can plan the linking step.
- Confirm directors are clear their lift is minimal (announce + forward webinar invite).
- Agree how each director will **report attendance** back to you after camp.

### 5e. Participant instruction email (you send to a cohort's signups when ready)
This is the pivotal artifact under the new model. Send to each cohort's signups
(CC the parent for minors) once you're ready to onboard that cohort. Send-ready
draft below — fill the bracketed bits.

> Subject: Your next step for POE Fine Arts credit — set up your Optio account
>
> Hi [First name],
>
> You're confirmed for the [Cohort, e.g. Hartford, CT] Pipe Organ Encounter, and
> you're all set to earn 0.5 high school Fine Arts credit for taking part. Here's
> how to get ready before camp:
>
> 1. Create your free Optio account at [APP URL]. You can sign in with Google or
>    with an email and password — whichever you prefer.
> 2. Reply to this email once you've registered so we can add you to the POE Fine
>    Arts class. (We'll set up your account and a "Pipe Organ Encounter" journal
>    on our end.)
> 3. During camp, open the app and jot down what you're learning — photos, notes,
>    anything. Attending earns the credit; documenting your week is encouraged and
>    makes your experience richer.
>
> FOR PARTICIPANTS UNDER 18: a parent or guardian needs to give consent before we
> issue the credit. [Parent name], please reply to this email with "I consent" (or
> complete the attached consent form), confirming you've read the consent
> statement below.
>
> [Insert the v1.0 consent statement from §11 here for minors.]
>
> Questions? Just reply, or reach me at tanner@optioeducation.com.
>
> Looking forward to seeing what you create this summer,
> Tanner — Optio

Notes for you: confirm the APP URL families register at; decide the consent
mechanism wording (reply-to-consent vs attached form); keep a record of each
consent (a folder or spreadsheet) since it's collected offline. Consider one
variant for minors (with consent block) and a shorter one for 18+.

---

## 6. Risk register

| Risk | Impact | Mitigation |
|------|--------|-----------|
| Participants don't self-register in time | Can't document / award credit | Instruction email out early per cohort; reply-to-confirm so you can chase non-registrants |
| Mobile journal unverified for a POE student | Kids can't document at camp | Verify with a real self-registered account this week (no build, just confirm) |
| Consent records lost or incomplete | Can't issue credit for a minor | Keep a consent folder/spreadsheet; soft gate means collect anytime before award |
| Low signups before camp | Weak pilot | Director email out this week + webinar; directors own the roster reach |
| Credit-transfer confusion at families' schools | Trust hit | FAQ sets expectations; capture counselor email; handle post-camp |
| School-of-record / counselor never notified | Credit not recognized | Notify step in post-camp issuance |
| `/poe` form has an undiscovered bug | First impression fails | Walk the live form end-to-end before directors send (see §7) |
| Manual linking missed for a participant | No credit for them | Reconcile `poe_signups` (registered) vs `poe_participants` (linked) per cohort |

---

## 7. Checklist

**This week (ops + de-risk):**
- [ ] Get AGO/legal sign-off on consent text (§11), lock as v1.0
- [ ] Finalize director email (§5a) and send to the 4 directors
- [ ] Draft the participant instruction email (§5e) + decide consent mechanism
- [ ] Draft family FAQ (§5b)
- [ ] Pick webinar date/time, create link, draft invite (§5c)
- [ ] Collect director points of contact; fill `poe_cohorts.point_of_contact`
- [ ] Agree attendance-reporting method with each director
- [ ] Walk the live `/poe` form end-to-end (every branch: minor, adult, school, homeschool)
- [ ] Self-register a throwaway account and verify the mobile journal works for it

**The only build — "link participant to POE" admin step (§4):**
- [ ] `POST /api/admin/poe/link-participant` (or script): per-student class quest
      + enroll + journal topic + `poe_participants` row; idempotent; superadmin-gated
- [ ] Test it end-to-end with a throwaway self-registered account, then clean up

**Per cohort, when ready to onboard:**
- [ ] Send the instruction email (§5e) to that cohort's signups
- [ ] Collect parent consents (minors); file the records
- [ ] After registrations come in, run the link step; reconcile registered vs linked

**After each camp (credit delivery):**
- [ ] Collect attendance from the director
- [ ] Flip each attendee's POE class quest to `class_review_status='credit_awarded'`
- [ ] Confirm credit shows on transcript
- [ ] Notify school-of-record / counselor where provided

---

## 8. Decisions log / remaining questions

**Decided (June 4):**
- **`/poe` stays a pure interest form.** No account creation, no custom
  onboarding page.
- **Onboarding = email-driven self-registration.** You email a cohort's signups;
  they register in the normal app (Google or email/password); you link them to
  POE with a small admin step. This gives Google sign-in for free and removes the
  auth/onboarding-page build.
- **Consent for minors = collected over email/offline** using the v1.0 statement;
  you keep the records; soft gate (needed before award, not before camp).
- **Credit basis: attendance earns the credit** (grade A, 0.5 Fine Arts).
  Documentation in the app is encouraged, not required.
- **Credit delivery: per-student POE Fine Arts credit-class**; award via
  `class_review_status='credit_awarded'` after the director confirms attendance.
  (Per-student, not per-cohort — see §4.)
- **Transcript: already built** — surfaces the awarded credit, no new work.
- **Info session: live webinar** + recording.

**Still open:**
- **Consent text sign-off** — v1.0 drafted in §11; needs AGO/legal approval
  before it's the live string.
- **Consent mechanism wording** — reply-to-consent vs an attached/linked form.
- **APP URL** participants register at (for the §5e instruction email).
- **Webinar date/time** and who presents besides you.
- **Attendance reporting** method per director.

## 10. Build — BUILT 2026-06-04 (uncommitted)

All code below is written and statically verified (py_compile + import).
Migration applied to prod. Not committed to git yet. Files:
- `supabase/migrations/20260604_poe_participant_class_award.sql` (APPLIED to prod)
- `backend/routes/admin/poe.py` (new blueprint `admin_poe`, `/api/admin/poe`)
- `backend/routes/__init__.py` (registers the blueprint)

### 10.0 How credit actually reaches the transcript (verified)
The transcript/diploma is driven by **`user_subject_xp`** (2000 XP = 1 credit;
0.5 Fine Arts = 1000 XP), the same surface `transfer_credits` feeds. The
`class_review_status='credit_awarded'` flag only marks a class **complete** in
My Classes / portfolio (`utils/quest_status.is_class_credit_awarded`); it does
NOT by itself add transcript credit. (The `CreditMappingService`
`user_credit_summary` view path is dead — the view doesn't exist.) So
attendance-based award must BOTH flip the flag AND deposit the subject XP.

### 10.1 Migration (APPLIED)
Adds `class_quest_id`, `attendance_confirmed_at`, `credit_awarded_at` to
`poe_participants`. Additive, nullable; table had 0 rows.

### 10.2 `POST /api/admin/poe/link-participant` (superadmin)
Body: `{ email, poe_cohort? }`. Resolves the registered user (case-insensitive
email) and their signup/cohort. Idempotent per (user, cohort). Creates the
student's own `quest_type='class'` "Pipe Organ Encounter" quest
(`transcript_subject='fine_arts'`, `created_by=user_id`), enrolls them
(`status='picked_up'`, active — so the class doubles as the journal topic they
document into), and inserts `poe_participants` with school-of-record copied from
the signup. **Design note:** no separate `interest_tracks` topic is created — the
enrolled class is the single documentation topic, avoiding a duplicate
same-named topic. `poe_participants.track_id` stays null.

### 10.3 `POST /api/admin/poe/award-credit` (superadmin, post-camp)
Body: `{ email|user_id, poe_cohort? }`. Idempotent via `credit_awarded_at`.
Sets the class `class_review_status='credit_awarded'` (+`class_review_submitted_at`,
+notes), deposits **1000 `fine_arts` subject XP** + 1000 `art` pillar XP (mirrors
`transfer_credits._sync_transfer_credits_to_user_subject_xp`; does not touch
`users.total_xp`), and stamps `attendance_confirmed_at`/`credit_awarded_at`.
Result reports `credit: {fine_arts: 0.5}`.

### 10.4 `GET /api/admin/poe/signups?cohort=<slug>` (superadmin)
Reconciliation helper: lists each signup with `registered` / `linked` /
`credit_awarded` flags + counts. Use it to see who still needs to register or
be linked.

### 10.5 No build for: account creation (normal app register, supports Google),
consent (email/offline), onboarding page (none), invite email (you send it
yourself per §5e).

---

## 11. Parental consent statement — v1.0 (DRAFT — needs AGO/legal sign-off)

For minors (dominant case). An 18+ self-acknowledgment variant is a trivial
reduction of this. Under the current model this statement is included in the
participant instruction email (§5e) and consent is collected over email/offline;
keep the signed records. (If a consent table is ever wanted later, this is
`consent_statement_version='v1.0'`.)

> Optio: Pipe Organ Encounter Fine Arts Credit Pilot
> Parent / Guardian Consent
>
> I am the parent or legal guardian of the student named below, and the student
> is at least 13 years old.
>
> By signing, I consent to the following:
>
> 1. My student may create and use an Optio account to take part in the 2026
>    Pipe Organ Encounter (POE) Fine Arts credit pilot, offered through a
>    partnership between Optio and the American Guild of Organists (AGO).
> 2. Optio may collect and process my student's name, date of birth, email,
>    school of record (if provided), and any work, photos, text, or other
>    materials my student chooses to add to the app to document their POE
>    experience. Documenting the week is encouraged but optional. The credit is
>    earned by attending the POE.
> 3. Upon confirmation of my student's attendance at their POE, Optio will issue
>    0.5 high school Fine Arts credit (grade A) and make a transcript reflecting
>    this credit available to my family. Acceptance of transfer credit is
>    determined by my student's school, and Optio does not guarantee acceptance.
> 4. If I provide a school or counselor contact, I authorize Optio to share my
>    student's POE credit and transcript with that contact to support credit
>    transfer.
> 5. Participation in the 2026 pilot is free. Optio may charge for the program in
>    future years.
> 6. Optio will handle my student's information in accordance with its Privacy
>    Policy. My student's work is private to their account unless I or my student
>    choose to share it. I may request deletion of my student's account and data
>    at any time.
> 7. Participation is voluntary, and I may withdraw my student at any time before
>    the credit is issued.
>
> I have read and agree to the above.
>
> Parent/Guardian name (typed signature): ______________________
> Student name: ______________________   Date: __________
>
> Typing your name above and submitting serves as your electronic signature.
