# Optio Academy: onboarding audit

**Date**: 2026-09-16
**Occasion**: dozens of new high-school families arriving at once, most of them
moving over from Hearthwood Academy, all of them transferring in prior
homeschool work and working toward an accredited Optio Academy diploma.
**Priority order**: the parent's experience first, the student's second, both
run by Optio Academy administration (a superadmin).

Numbers in this document were read from the production database on the date
above. Everything else is from the code on this branch.

---

## 1. What Optio Academy is, in plain words

Optio Academy is an accredited online private school (ACS WASC) where the
parent is the teacher and Optio makes the learning official.

The one-sentence version for a parent:

> Your kid's real life becomes an accredited high school transcript. You lead
> the learning; we give it structure, review the work, and issue the credits,
> the transcript and the diploma.

What a family actually does, in order:

1. **Enroll.** A parent registers the family once. Each student gets an
   account, and the parent's account is linked to every child.
2. **Bring what you have.** The parent uploads the paperwork from the years
   before Optio (transcripts, course lists, portfolios). Optio reviews it and
   awards transfer credit onto the transcript.
3. **Do real work, capture it.** The student picks quests, does the work,
   and logs evidence: photos, videos, writing, links. The parent can do any of
   this with them, from their own login.
4. **Credit lands.** Evidence earns XP in one of eleven school subjects.
   2,000 XP in a subject is one credit. Optio reviews the work before the XP
   counts.
5. **Track the diploma.** The family watches credits fill in against the
   24-credit requirement. The transcript is official and can be sent to any
   school or college.

Why this is better education: it is personalized. The subject requirements
are fixed; what the student does to meet them is not. A soccer season is PE.
A game they shipped is Computer Science. The school fits the kid instead of
the kid fitting the school. The Optio philosophy ("the process is the goal")
explains why the product looks the way it does, and it comes second, after the
practical answer to "will it count?" The answer is yes, officially.

---

## 2. How it runs on the platform today

### The two organizations that matter

| Org | slug | Parents | Students | Model | Notes |
|---|---|---|---|---|---|
| Optio Academy | `optio-academy` | 12 | 13 (9 with logins, 4 managed profiles) | Core XP-per-subject credits, SIS on, registration funnel on, prior learning on | This is the school the new families join. |
| Hearthwood Academy | `hearthwood` | 47 | 61 (39 with logins, 22 managed profiles) | The OEA diploma program: self-attested course credits, three pathways, quarterly minimums, GPA | SIS off, pillars hidden, own program tab at `/hearthwood`. |

These two orgs do **not** share a credit model. That is the whole migration
problem, covered in section 5.

### The systems an Optio Academy family touches

| Concern | Where it lives | State |
|---|---|---|
| Registration | `/enroll/<code>` funnel, seven steps, parent-account-first (`backend/routes/registration_funnel.py`) | Working. Monthly plan is $50 per student, $150 family cap, teacher-support add-on. |
| Family home | `/family` (`web/src/pages/home/FamilyHome.jsx`) | One parent dashboard since 2026-09-15. Child cards, "needs attention" strip, family quests, settings modal. |
| Working as a child | Family scope (`web/src/contexts/FamilyScopeContext.jsx`, `backend/utils/guardian_scope.py`) | Parent stays logged in as themselves and every student page renders pointed at the child. Replaced "act as" on 2026-09-15. |
| Prior learning | `/family/prior-learning`, reviewed on the SIS Prior Learning page, converted to `transfer_credits` | Working, document-first. Enabled for Optio Academy only. |
| Credits and diploma | `shared/data/credits.json` (2,000 XP = 1 credit, 24 credits, 11 subjects); child's `/overview` | Working through the transcript generator. |
| Credit review | `/credit-dashboard`; final award is superadmin-only | Working. Optio Academy has `credit_review_by_optio`, so requests skip org approval. |
| Transcript | `/api/admin/transcript/<id>`; public `/public/transcript/<id>`; send-to-registrar | Working. |
| Accreditation mark | `backend/utils/accreditation.py` | **At risk. See finding A1.** |
| Billing | SIS billing, `sis_recurring_tuition`, Stripe subscription on the registration | Working. |

---

## 3. The parent journey, step by step

What a new Optio Academy parent goes through, and what happens at each step
today. "Fixed on this branch" means the code change is in this audit's commit.

### 3.1 Enrollment (the funnel)

1. Parent opens the enrollment link, creates an account, confirms a 6-digit
   email code.
2. Adds each child: name, birth date, photo. Under 13 becomes a managed
   profile with no login; 13 and up gets their own login and a link to the
   parent.
3. Answers Optio Academy's questions per student: grade level, prior school,
   interest in teacher support.
4. Signs the Participant and Parent Agreement and the Handbook.
5. Sets up the monthly plan.
6. Lands on "Your account is ready" and is sent to Goal Setting.

What is wrong or missing:

- **A1. Enrolled students get no Academy enrollment row.** The Optio Academy
  org's registration config has `academy_enrollment: false`, so the funnel
  never writes `academy_enrollments`. There are 0 rows in that table today.
  The org row also carries `accreditation_source: 'none'`. The accreditation
  resolver checks the enrollment row first, then "no organization", then the
  org's source. An Optio Academy student is org-managed, so every one of them
  falls through to `'none'`: **their transcripts render without the WASC
  statement or the Head of School signature block.** Two config writes fix it
  (section 6, "flip now").
- **A2. The records step is off.** `records_destination: false` means nobody
  is asked where transcripts should go. For a diploma family the answer is
  usually "Optio only", but the question is what makes the eventual send a
  confirmation instead of a data-entry task. Turn it on.
- **A3. Goal Setting asks about the wrong subjects.** `sis_settings.goal_subjects`
  for Optio Academy is the five pillars (STEM, Communication, Civics, Wellness,
  Art). A diploma family sets goals in diploma subjects (Math, Science, Language
  Arts...). The Hearthwood parent who wrote in on 2026-08-25 said exactly this:
  "the Pillar and task sizes are so bizarre and hard to make sense of."
  Hearthwood had pillars hidden in response; Optio Academy does not.
- **A4. No "bring what you have" step.** The funnel ends at goals. A transfer
  family's first real job is uploading prior work, and nothing on the done
  page or in the completion email points at `/family/prior-learning`.
- **A4a. The public signup page cannot make a parent.** `/register` never
  sends the `account_type` the backend honours for the mobile picker, so a
  parent who signs up on the web becomes a student with no Family page and no
  way to add a child. The under-13 warning's "I am a parent registering"
  link only clears the birth-date field. Optio Academy families enter through
  the funnel, so this does not block the cohort, but every parent who finds
  the app before the enrollment email will hit it. Add the picker, or send
  `account_type: 'parent'` from that link.
- **A5. The `family_first_home` flag is not set on the Optio Academy row.**
  The web app still relies on a hardcoded org id fallback
  (`web/src/config/optioAcademy.js`). Harmless today, but the comment on that
  constant says to delete it once the flag is written, and it never was.

### 3.2 First login and the family home

The parent lands on `/family`: a cover photo, a greeting, a "needs your
attention" strip (checklist items, open requests, balance due), one card per
child, and the family's shared quests. Settings is one modal with a tab per
child.

What is wrong or missing:

- **A6. Nothing on the family home says "diploma".** The child card shows XP,
  streak, active quests and rhythm. For a high-school family the number that
  matters is credits earned against 24, per subject. That is one click away
  on the child's Portfolio page, but it is the reason they enrolled and it is
  not on the home.
- **A7. Nothing on the family home says "prior learning".** The door exists in
  the school section of the sidebar ("Prior Learning") and nowhere on the
  page. A submitted record that is "Being reviewed" should appear in the
  attention strip.
- **A8a. The family home is the only onboarding there is.** There is no
  parent welcome, tour or checklist anywhere in the product: the course
  coachmarks mount only inside a course, the SIS family checklists need the
  `onboarding` module, and Optio Academy has it on but has never assigned a
  template. A new parent's first run is the empty state "No children on your
  account yet". Nothing explains scope, quests, evidence, XP or the diploma.
- **A8. The attention strip probes modules the school turned off.** Optio
  Academy's `hidden_modules` list is long and the home degrades silently, so
  this is a telemetry problem rather than a parent-facing one (Sentry
  OPTIO-BACKEND-92/93 are the same shape on another org).

### 3.3 Working with a child (family scope)

The parent clicks Open on a child card and every student page renders for
that child: dashboard, quests, quest detail, journal, portfolio. Reads add
`?student_id=`, writes carry `student_id`, and the backend verifies the
guardian on every request.

What was wrong (fixed on this branch):

- **A9. The credit feedback thread refused parents.** A parent opening a
  child's completed task got "Access denied" from the feedback thread on the
  page (Sentry OPTIO-WEB-1Y on read, OPTIO-WEB-23 on reply; the reporter was a
  Hearthwood parent). `credit_messages._can_access` had no guardian branch.
  Fixed: a parent reads and replies on the family's side of the thread, and
  a parent's reply notifies the reviewer the way the student's would.
- **A10. Class handouts refused parents.** The curriculum panel on a class
  quest asked for materials as the parent, and the class-membership gate said
  no (Sentry OPTIO-WEB-1X). Fixed: in family scope the panel asks for the
  child's read, gated on the family relationship, visible rows only.
- **A11. The family quests read truncated at 1,000 rows.** A family on many
  quests silently under-counted every member's tasks (Sentry
  OPTIO-BACKEND-90). Fixed: both unbounded reads are paged.

- **A11a. The credit tracker on the child's dashboard showed the parent's own
  requests.** Every other read on that page carried the child's id; this one
  did not, so a parent saw an empty "Diploma credit" panel under the child's
  name. Fixed: the tracker follows family scope.
- **A11b. `/credits` and `/transcript` were dead pages.** Neither was in the
  nav, both called endpoints that do not exist, and both were wrapped in the
  family-scope guard while reading the parent's own id. Retired on this
  branch: both redirect to `/overview`, and the four orphaned files are gone.

What is still rough:

- **A11c. A parent cannot see the official transcript.** The transcript
  section on the child's overview is gated to school admins, because the
  endpoint behind it (`/api/admin/transcript/<id>`) is admin-only and every
  parent visit used to 403 (Sentry OPTIO-WEB-3). The transcript is the
  artifact the family is paying for. Give the read a parent branch
  (`allow=('parent', 'org_staff')`), drop the admin-shaped footer links for
  non-staff, and show it. This is the top build item for parents after the
  bulk import.
- **A11d. Home learning a parent logs is a dead end for credit.** The parent
  capture button writes a learning moment and awards no XP; the journal's
  quick-add awards 25 pillar XP but only for managed under-13 profiles; and
  the "Request XP" and "Add to quest" controls on a moment are hidden from
  parents (`LearningEventCard.canRequestXp = !isParentView`). Since 2026-09-15
  the rule is that a parent may do everything the child can do; the journal
  has not caught up. For a parent-taught under-13, home learning can only
  reach the transcript through Prior Learning.
- **A12. No age-based rules in scope.** By design since 2026-09-15, a parent
  can do everything the child can do. Good. But the parent has no way to tell,
  on the quest page, that they are acting for the child except the sidebar
  header. A thin banner ("Working as Romney") would prevent the wrong-child
  mistake with three kids.
- **A13. Pillars show everywhere.** Task pickers, quest headers and the
  overview all carry the five pillars alongside the eleven subjects. Hearthwood
  turned them off after one complaint. Optio Academy should ship the same way
  for diploma families: `feature_flags.hide_pillars: true`.

### 3.4 Prior learning (transfer work)

The parent picks a child, drops in every file at once, optionally notes what
each is, and sends. Staff review on the SIS, optionally with an AI suggestion,
accept, and convert to a transfer-credit row that appears on the transcript
as its own block with the school name.

What is wrong or missing:

- **A14. Two caps disagree.** Staff can accept up to 12 credits per subject
  (`sis_prior_learning_service.MAX_CREDITS_PER_SUBJECT`) but conversion
  refuses above 10 (`transfer_credit_service.MAX_CREDITS_PER_SUBJECT`). A
  record accepted at 11 fails at the last step.
- **A15. Two subject-to-pillar maps disagree.** Transfer credit moves a
  student's pillar totals differently than their own task work does
  (`transfer_credit_service.SUBJECT_TO_PILLAR` vs
  `school_subjects.SUBJECT_TO_PILLAR`). Invisible if pillars are hidden, wrong
  if they are not.
- **A16. No bulk path.** Every transfer credit is one admin, one student, one
  form. For dozens of families the admin side is the bottleneck: dozens times
  (open the student, type eleven subject boxes, type course names, attach the
  scan). A CSV import for `transfer_credits` is the single highest-leverage
  admin tool to build before the wave lands.

### 3.5 Watching the diploma fill in

The child's `/overview` page shows credits by subject against the requirement,
the transcript section, and the portfolio. The public transcript link and the
send-to-registrar modal are on the same page.

What is wrong or missing:

- **A17. The credits API reads a view that does not exist.**
  `/api/credits/my-credits` and `/api/credits/transcript` read
  `user_credit_summary`, which is not in production (the only view is
  `announcement_read_stats`). Nothing on the web calls them any more (A11b),
  so the whole `credit_mapping_service` read path can go.
- **A18. Backend and web graduation math disagree.** The web spills surplus
  non-elective credit into Electives; the backend caps per subject with no
  spillover. A student can read "complete" on one and not the other. The
  transcript generator uses its own arithmetic and is the one that matters,
  but the two should be made to agree or one deleted.
- **A19. Class credit is hardcoded at 0.5 with grade A** in two files. A
  full-year class cannot be 1.0 through the class path.

---

## 4. The student journey

A 13+ student logs in to `/dashboard`: current quests, weekly XP goal,
learning rhythm, next task per quest, diploma credit tracker, completed
quests. They browse `/quests`, enroll, do tasks, attach evidence, and request
credit. Credit requests go to the Optio review queue and land as XP in a
subject.

What is wrong or missing:

- **S1. No Academy identity.** Nothing in the student UI says "you are an
  Optio Academy student" or shows the WASC mark before the transcript. The
  dashboard credit tracker is the only diploma surface.
- **S2. No review expectation.** "Awaiting Review" has no timescale and no
  reviewer identity. Families were told licensed teachers review every piece
  of work; the UI should say who and roughly when.
- **S3. Copy drift on the credits page.** `CreditTrackerPage.jsx` says
  "complete quests to earn credits", "each badge earned awards credits" and
  "demonstrate expertise to colleges and employers". XP is earned on tasks,
  there are no badges in the credit model, and the brand guidelines forbid the
  future-outcome framing. Moot if A17 retires the page.

---

## 5. Hearthwood to Optio Academy

### What Hearthwood families have today

- 47 parents, 61 students, all org-managed under `hearthwood`.
- 24 students with an OEA pathway selection (`oea_enrollments`).
- 171 OEA credit rows: 150 in progress (each is a "course quest" the parent
  created), 21 complete (11 transfer, 5 earned elsewhere, 5 direct).
- Zero subject XP. Hearthwood's credits never touched `user_subject_xp`,
  which is what the Optio Academy transcript is built from.
- Pillars hidden. A getting-started video configured by the org admin.
- The `/hearthwood` program tab: pathway, credits, progress report,
  transcript, all keyed to the org slug in `web/src/programs/registry.jsx`.

### What moving an account to `optio-academy` does, by itself

Changing `users.organization_id` (the primitive is
`roster_import_service._adopt`, or `PUT /api/admin/users/<id>/organization`)
moves the account and nothing else:

- The `/hearthwood` tab disappears (registry is keyed by org slug). The OEA
  credit pages become unreachable.
- Pillars reappear (the flag is per org).
- The student has no subject XP, so their diploma reads zero credits.
- The parent links survive (`parent_student_links` and `managed_by_parent_id`
  are per user, not per org). The 22 managed profiles keep their parent.
- No household row exists, so SIS billing has nothing to bill. Households are
  created by the funnel, not by an org move.
- No `academy_enrollments` row, same as A1.

### The migration plan

The credit model changes, so this is a records conversion, not a data move.
Recommended order:

1. **Flip the Optio Academy org config first** (section 6, "flip now"), so the
   first migrated transcript already carries the WASC mark.
2. **Decide the credit conversion rule** (open decision D1 below). The
   straightforward rule: every *complete* OEA credit becomes a transfer-credit
   line on the Optio Academy transcript, one row per source school
   (Hearthwood for direct and earned-elsewhere, the original school for
   transfer). Each *in-progress* OEA course becomes an open quest with the
   evidence already attached; it earns XP from here on like any other quest.
3. **Move accounts in families, not one at a time.** Write a superadmin
   script that, per Hearthwood parent: moves the parent and every linked or
   managed child to `optio-academy`, creates the household, writes an
   `academy_enrollments` row per student (`parent_supported`, grade level
   from the OEA enrollment where present), converts complete OEA credits to
   `transfer_credits` under rule D1, and re-parents each in-progress course
   quest so it stays on the student's dashboard. Dry-run output first, then
   commit, the same shape as `roster_import.py`.
4. **Keep the old records readable.** Do not delete `oea_credits`. Leave the
   OEA transcript page reachable for superadmin by student id for a term.
5. **Tell the families what changed** in one email: your login is the same,
   your children are the same, the diploma tracker now shows credits by
   subject, here is where to upload prior work, here is the new getting
   started video.

### What Hearthwood has that Optio Academy should copy

- `hide_pillars: true`.
- A getting-started video slot on the family home
  (`feature_flags.oea_settings.help_video_url`, rendered by the OEA page). The
  family home should carry the same one-line "Watch the 4-minute tour" until
  the parent has opened it.
- Quarterly minimums as a rhythm ("3 logs, 3 artifacts, 1 summary per
  quarter"). Optio Academy has weekly XP goals instead, which are the right
  unit for the process-is-the-goal philosophy, but a parent moving over will
  ask where the quarterly checklist went. The compliance sweep is worth
  keeping as an admin alert, not a family-facing wall.

---

## 6. Findings, ranked

### Fixed on this branch

| # | Finding | Change |
|---|---|---|
| A9 | Parent 403 on the child's credit feedback thread | `backend/routes/credit_messages.py`: guardian branch in `_can_access`; a parent's reply notifies the reviewer. |
| A10 | Parent 403 on class handouts from the child's quest page | `backend/routes/sis/class_materials.py`: `?student_id=` on the by-quest read, gated on the family relationship, visible rows only. `web/src/components/discussion/ClassCurriculum.jsx` and `QuestDetail.jsx` pass the scoped child. |
| A11 | Family quests read truncated at 1,000 rows | `backend/routes/family_quests.py`: both unbounded reads go through `fetch_all_rows`. |
| A11a | Credit tracker on the child's dashboard ignored family scope | `web/src/components/diploma/DiplomaCreditTracker.jsx`: reads with the scoped child's id and refetches on a scope change. |
| A11b | `/credits` and `/transcript` were broken orphan pages | `web/src/App.jsx`: both redirect to `/overview`; the two pages and two components deleted. |

### Flip now (production config, no code)

These are writes to the `organizations` row for `optio-academy`
(`8ee22671-6e38-473c-a326-90ff86460310`). They are reversible and each one is
already supported by code. Confirm before running.

```sql
update organizations
set accreditation_source = 'optio',
    feature_flags = feature_flags
      || jsonb_build_object('hide_pillars', true)
      || jsonb_build_object('registration',
           (feature_flags->'registration')
           || '{"academy_enrollment": true, "academy_pathway": "parent_supported", "records_destination": true}'::jsonb)
      || jsonb_build_object('sis_settings',
           (feature_flags->'sis_settings')
           || '{"family_first_home": true,
                "goal_subjects": ["Language Arts","Math","Science","Social Studies","Fine Arts","PE","Electives"]}'::jsonb),
    updated_at = now()
where slug = 'optio-academy';
```

Then backfill an `academy_enrollments` row for the 13 current students
(`pathway = 'parent_supported'`, `status = 'active'`), and the same for every
migrated Hearthwood student.

The `icreate_registration` key on the same row is a stale copy of
`registration` and can be dropped.

### Build before the wave (in priority order)

1. **Bulk transfer-credit import** (A16). One CSV per family or one for the
   whole cohort: student email, subject, credits, course name, source school.
   Preview then commit. This is the admin bottleneck.
2. **Family migration script** (section 5, step 3). Dry run and commit.
3. **The official transcript, visible to the parent** (A11c).
4. **Diploma progress on the child card** (A6): credits earned of 24, and
   the subject furthest behind.
5. **Prior learning in the attention strip and on the done page** (A4, A7),
   plus a first-run checklist on the family home (A8a): add each child,
   upload prior work, open a child, pick a first quest, watch the tour.
6. **Let a parent turn a logged moment into credit** (A11d): one XP rule for
   both capture doors, and the Request XP / Add to quest controls in family
   scope.
7. **"Working as" banner in family scope** (A12).
8. **Reconcile the two caps and the two pillar maps** (A14, A15): one
   constant, one map, one test. Delete the `user_credit_summary` reads (A17).
9. **Review expectation on pending credit** (S2): "Optio reviews within 5
   school days" and the reviewer's name once assigned.
10. **Parent picker on `/register`** (A4a).

### Known and accepted for now

- Class credit hardcoded at 0.5 / grade A (A19). The Credit Partner plan
  proposes `quests.credit_value`; not needed for this cohort.
- Backend and web graduation arithmetic differ (A18). The transcript
  generator is the source of truth for anything official.

---

## 7. What the marketing page should say

The academy page already leads with the right mechanism ("credit is based on
evidence of learning, not hours in a chair") and the right proof (WASC, the
receipt, the Transfer Guarantee). What it is missing is the plain answer to
the question a parent arrives with: *what is this, and why is it better?*

The answer, in the order the core-direction doc prescribes (practical first,
philosophy second):

1. **What it is.** An accredited online private school where you teach and we
   make it official.
2. **Why it is better.** Because it is personalized. The requirements are the
   same as any high school's; how your kid meets them is built around your
   kid.
3. **How it works.** They pick the project, they do it and capture it, a
   licensed teacher makes it count.
4. **Proof.** WASC accreditation, the transcript row, the Transfer Guarantee.
5. **Then the philosophy.** The process is the goal.

The changes made to `marketing/src/pages/academy.astro` on this branch add a
short "What Optio Academy is" section under the hero that says exactly that,
in plain words, and tighten the hero subhead so "personalized" and "official"
both land in the first sentence. Nothing about pricing or the CTAs changed.

Two claims on the page that the product does not yet back up, left as they
are but flagged:

- "Licensed teachers review the evidence and award credit." In code, only a
  superadmin can finalize credit. True while the Head of School is the
  reviewer; it does not scale as written.
- "What you pay counts toward credits at $100 per credit." Nothing tracks
  dollars against credits. The file's own TODO says the mechanics are
  unconfirmed.

---

## 8. Open decisions

- **D1. Credit conversion rule for Hearthwood.** Do complete OEA credits
  convert one-for-one to transfer credits (1 course = 1 credit, per the OEA
  rule) or does Optio re-review the evidence? One-for-one is what the families
  were promised at Hearthwood and is the recommendation.
- **D2. In-progress Hearthwood courses.** Keep them as open quests that earn
  XP from here (recommended), or award partial credit at the move?
- **D3. Pathways.** Hearthwood offered three graduation pathways. Optio
  Academy has one 24-credit requirement table. Confirm that every migrated
  student is on the standard table; the OEA "traditional" pathway is closest
  to it.
- **D4. Grade level and school year.** `academy_enrollments` carries grade
  level and nothing carries a school year. Decide whether Optio Academy needs
  a school-year concept for transcripts (it does for a registrar) before the
  first transcript is sent.
- **D5. Who reviews.** If teacher support is sold as licensed-teacher review,
  advisors need a finalize path in the credit dashboard, or the copy changes.
