# Gryffin Learning Center — SIS Build Plan

**Created:** 2026-07-23 | **Contacts:** Kathryn "Katie" Bird (gryffinlearningcenter@gmail.com = org_admin, katienbird@gmail.com = parent)
**Source:** Katie's brain dump (relayed by Tanner, 2026-07-23) on how Gryffin wants to use Optio as their SIS.
**Predecessor:** [GRYFFIN_BUILD_PLAN.md](GRYFFIN_BUILD_PLAN.md) — the 2026-06 LMS-side plan (feature flags, scheduled publish, due dates, hub, announcements, roster groups). Most of that shipped. This plan covers the SIS layer, reusing the iCreate SIS where it fits.

**Guiding principle (unchanged):** build org-generically, gate per-org via `organizations.feature_flags`, never `slug === 'gryffin'` in feature logic. The iCreate SIS already follows this — nearly all of it keys on `feature_flags.sis_enabled` + org-scoped `sis_*` tables, so most of this plan is configuration, not code.

## BUILD STATUS — 2026-07-23: SHIPPED

The full build list below was implemented on 2026-07-23 (single autonomous build, migration `20260723_gryffin_sis_features.sql` applied to prod: 10 new tables). What shipped:

- **Goals** (`sis_student_goals`): parent page `/family/goals` (replaces Schedule Builder in the sidebar for goals-mode orgs), SIS review page `/goals`, funnel completion CTA + email, `post_registration_flow` config key.
- **Registration funnel**: per-student questions (`per_student: true` config), zero-fee finish, Gryffin question set (both Google Forms ported + medication schedule/scholarship additions), paperwork e-sign items, shareable link `/register/icreate/gryffin-family-2026`.
- **Teacher submissions inbox**: SIS `/submissions` — unified new-submissions queue across a teacher's classes, evidence rendering, CreditFeedbackThread comments, accept-and-advance, XP adjust control.
- **XP adjustment**: `PUT /api/sis/completions/<id>/xp` with `sis_xp_adjustments` audit, `user_skill_xp`/mastery resync.
- **Kiosk** (org-generic, `kiosk` flag, `org_kiosk_devices`): `/kiosk` standalone page — device token setup, tap-your-name grid, camera capture, standard evidence upload, auto sign-out; device provisioning card on SIS Settings.
- **Gradebook-lite** (`sis_assignment_templates` + `sis_student_assignments`): Gradebook tab on TeacherClassPage — sequences generator (Workbook 101-110 style), apply-to-students, inline score editing, averages, print.
- **Parent billing**: `/family/billing` (household balance, invoices, printable receipts + statements), staff Outstanding tab, payment reminder sweep (daily 15:00 UTC via cron_dispatch, 25-day dedupe, `sis_payment_reminders`).
- **Comms**: announcement email fan-out (Brevo transactional via email_service, dependent→parent routing), push already existed, archive page `/announcements` (+ sidebar), message templates (stored in `sis_settings.message_templates`, composer picker + save-as-template).
- **Information reports**: SIS `/reports` — Medications, Media release, generic question report; print + CSV.
- **Student records** (`sis_student_records` + `sis_student_materials`): Record + Materials tabs on StudentDetailModal, parent page `/family/students/:id` (profile, BOY/EOY, materials, per-class scores), "View record" on the parent dashboard.
- **Engagement alerts** (`sis_engagement_alerts`): daily sweep (13:00 UTC) for unfinished-when-next-released + 2-week inactivity; "Needs attention" card on TeacherDashboard.
- **Completed-quest archive**: collapsed "Completed (n)" accordion in the student class view.
- **Portfolio curation**: `in_portfolio` on completions, toggle on completed TaskWorkspace, "Portfolio Picks" on the diploma/portfolio page, curated list in portfolio payloads.
- **AI personalization**: student goals/direction/hobbies injected into task-suggestion prompts (cache-key aware; no-op when no data).
- **Org config applied in prod**: `kiosk` flag, `sis_settings` (goals mode, school year, subjects, assessment fields), full funnel config, brand colors in `branding_config`, parent registration link created.

Deferred/known gaps: SMS (decided against), teacher "provision kiosk" needs the token pasted on each iPad once, per-student answers from re-registration will orphan old kid ids on family back-edit (revalidated + restored), email fan-out sends a [COPY] per recipient to the support inbox (platform-wide email service behavior — revisit if newsletter volume grows).

## FINE-TUNING ROUND — 2026-07-23 (shipped, commits 34428995 + 7e1eb3c2)

Platform-wide SIS improvements from Gryffin tuning (all org-generic unless noted):

- **Per-org module hiding**: `feature_flags.sis_settings.hidden_modules` (array). Gryffin hides `onboarding, timesheets, forms, clp` (Billing kept — required by the $ account ask). Sidebar + route guard + teacher dashboard honor it; superadmin sees the SELECTED org's nav exactly (shared active-org store `sisOrgStore.js`, `useSisOrg().activeOrg`).
- **People consolidation**: Users/Staff/Families merged into one tabbed `/people` page (Everyone/Staff/Families, action buttons on the tab row via a portal slot); Directory is now teacher-only. Old `/users`,`/staff`,`/households` redirect to `/people?tab=`.
- **Class archiving completed**: backend restore endpoints (`POST /api/sis/classes/<id>/restore`, `POST /api/organizations/<org>/classes/<id>/restore`); SIS ClassesPage got a Show-archived toggle + Archived badge + Restore in the detail modal and the expanded table row; learning-app ClassList got a Restore button.
- **Registration funnel fee step**: dropped from the stepper + preview + flow for zero-fee orgs (`feeApplies` derived from config). Gryffin families never see it.
- **Goals**: "Preview family view" button on SIS `/goals` opens FamilyGoalsPage in a read-only preview modal (sample student, org subjects).
- **Registration page reorg**: funnel config + first-day-of-school + waitlisted age groups moved to Settings > "Registration & enrollment"; Registration page = enrollment operations queues only.
- **Billing redesigned record-only**: `/billing` is now a family/charge ledger (paid vs outstanding by month) + Add-charge + Record-payment modal (Zelle/scholarship/cash/check) + outstanding report + reminders + print. New `POST /api/sis/billing/charges`, `GET /api/sis/billing/ledger`. Discount rules/plans/installments/late-fees removed from UI (backend intact). iCreate unaffected (doesn't use this surface). Parent billing page + receipts unchanged.
- **Resources single source of truth**: registration paperwork docs auto-link to an `org_resources` row on save (reconcile endpoint); edits in the Resources tab flow to the form; deleting/unlinking a resource clears the stale inline snapshot.

**Current state (verified in prod 2026-07-23):**
- Org exists: slug `gryffin`, active, 14 users (1 org_admin after the login fix, 3 parents, 2 advisors, 7 students, plus Katie as parent).
- Flags already on: `sis_enabled`, `due_dates`, `scheduled_publish`. No `sis_settings` object yet, no registration funnel config.
- `branding_config.logo_url` holds a 355 KB base64 PNG (works, but consider re-uploading a smaller file or moving to storage — it rides along on every org read).
- Login fix applied 2026-07-23: `katienbird@gmail.com` org_role changed org_admin → parent; `gryffinlearningcenter@gmail.com` remains the sole org_admin (shared admin account, per Katie's request).

---

## Request-by-request mapping

Legend: **CONFIG** = works today, just configure/enable. **SMALL** = exists, needs a modest extension. **NEW** = net-new build.

### 1. Family/student registration — CONFIG + SMALL

Reuse the branded registration funnel (`backend/routes/icreate_registration.py` + `ICreateRegisterPage.jsx`). Despite the name, the entire question set, paperwork, fee, and branding are data-driven from `feature_flags.icreate_registration` on the org row — nothing behavioral is iCreate-specific.

- **Per-student forms:** the funnel already creates one account per kid and captures per-student details (emergency contacts, org questions, photo, DOB). Katie's K-6 vs 7-12 Google Forms map to org questions; if the two grade bands need different question sets, add a per-question `grade_band`/age condition to the question config (SMALL — the config schema already supports arbitrary questions).
- **Questions:** port the K-6 and 7-12 Google Form questions into the config (medications + times, media release, scholarship program paying, etc.). Katie explicitly wants the iCreate-style questions too.
- **Fee step:** disable Stripe (no `stripe_secret_key`) — Gryffin families pay by scholarship/Zelle. The funnel's manual/record-only fee path covers this, or omit the fee step entirely.
- **Re-registration at Back to School Night:** works as-is — the funnel attaches existing accounts rather than duplicating (iCreate round-3 fix).
- **Naming cleanup (recommended while wiring):** generalize the flag key `icreate_registration` → `sis_registration` (read both, write new) so we stop compounding the iCreate coupling. Same for the `icreate_registrations` table name — optional, lower priority.
- **Parent onboarding checklist:** a one-page "download the app / log in" handout is a docs task, not a build. Draft it with Katie for Back to School Night.

### 1b. Goal/direction setting after registration — NEW (medium, Gryffin's signature flow)

Where iCreate's funnel ends in the schedule builder, Gryffin's ends in **goal setting**. This is a per-org choice of post-registration step (config in the funnel: `schedule` | `goals` | `none`).

- **Direction (per student):** the long-term journey — trade school (hair school), college, etc. One free-text/select field plus narrative, set by parent with the kid.
- **Per-subject goals:** for each subject (math, history, science, LA, ...), "what does my kid want to achieve this year?" and "what long-term direction are they moving?" Subject list configurable per org in `sis_settings`.
- **Teacher review meeting:** goals are reviewed in a meeting with Gryffin teachers. Reuse the funnel's existing appointment step (`/appointment-done`) for scheduling; add a teacher-side review state on the goals (draft → submitted → reviewed) so staff can see which families still need meetings.
- **Data:** new `sis_student_goals` table (org_id, student_id, school_year, direction, per-subject entries JSONB or child rows, status, reviewed_by/at). Editable later from the parent portal and the SIS student record, not just at registration.
- **AI integration (the payoff):** class quests are shared, but task suggestions become individual. Feed the student's direction + subject goals (+ hobbies/interests from registration, see 8) into the existing AI task personalization path (`personalization_service` / quest personalization, which already supports challenge levels), so the AI proposes unique tasks per student within the shared class quest. This is prompt-context plumbing on an existing system, not a new AI feature.

### 2. Information reports (medications, media release, etc.) — NEW (small)

No report layer exists over registration answers today. Build an org-admin **Reports** section (SIS console) that queries registration/form answers across students:

- Canned reports: "students with medications + times", "media release approved / not approved", "scholarship payer", plus a generic "answers to question X" view.
- Print/CSV export.
- Backend: new endpoints in `routes/sis/reports.py` (file exists) reading funnel answers + `sis_form_submissions`. Frontend: new `pages/sis/ReportsPage.jsx` or extend the dashboard.
- Design note: make report definitions data-driven (question key → report) so the next org gets them free.

### 3. Tuition/expense tracking — CONFIG + SMALL

The record-only billing model is exactly what Katie describes ("do I just track in Optio that they have paid?" — yes).

- **Exists (CONFIG):** `sis_invoices` + line items, `sis_payment_records`, `sis_payment_plans`/`sis_installments` (monthly/semester/paid-up-front), discount rules, household billing view, `BillingPage.jsx`. "Paid at beginning of year" = full payment plan or a directive-style prepaid marker.
- **Outstanding invoices report (CONFIG/SMALL):** BillingPage lists invoices with status; add a print-friendly "outstanding only" view if the current filter isn't enough.
- **Automated payment reminders (NEW, small):** no dunning exists (only late-fee application). Build a monthly reminder job: for unpaid installments past day N, send a Brevo transactional email to the household's parents. Reuse the `sis_attendance_sweep` cron pattern (`POST /internal/...` + scheduled trigger). Template per org in `sis_settings`.
- **Payment through Optio:** possible later via the school's own Stripe key (same mechanism as the registration fee), but not needed now — do not build.
- **Parent-facing balance view (NEW, small):** parents currently have no billing surface — the household billing view is admin-side only. Katie today maintains a shared Google Sheet where each family can check their running balance (charges vs payments). Build a parent "Account" page: the household's invoices, payments, and current balance, read-only, backed by the same `sis_invoices`/`sis_payment_records` data (`routes/sis/parent.py` gains a `/billing` read). This replaces the sheet.
- **Printable receipts (NEW, small):** families on scholarship programs need a receipt to request reimbursement. Add a print-friendly receipt view per payment record (and a statement view per date range): school name/logo from `branding_config`, payer, student(s), line items, amount, date, payment method. Reachable from both the parent Account page and admin BillingPage.

### 4. Classes, teachers, quests — mostly CONFIG, two NEW pieces

- **Create classes, add students (CONFIG):** `org_classes` + `class_enrollments` + SIS ClassesPage / learning-app Classes tab. Already used by Gryffin.
- **Teachers enter quests in their classes (CONFIG):** class_advisors + teacher portal (`MyClassesPage`, `TeacherClassPage`) + `class_quests`. Teacher-scoped access shipped 2026-07-22.
- **Scheduled quest release (CONFIG — already built for Gryffin):** `class_quests.publish_at` (`scheduled_publish` flag, already on). Her life-skills sequence (digital literacy → communication → personal finance) is the exact use case; unfinished earlier quests remain visible alongside newly released ones, which is what she asked for.
- **Completed quests archived, not lost (SMALL):** verify how the student class view groups completed quests; if they stay inline, add a collapsed "Completed" section. UI-only change in the student class/quest list.
- **Teacher comments on individual quests (CONFIG/SMALL):** two-way feedback threads exist on completions (`credit_review_messages` + `CreditFeedbackThread`); observer comments exist. Confirm the thread surface reaches Gryffin's non-credit class quests; if it is credit-review-only today, mount the same thread component on ordinary task completions (the `feedback_threads` phase of the old plan — check what shipped).
- **Teacher XP adjustment (NEW, small):** no teacher-facing "change awarded XP" exists. Add an advisor/org_admin endpoint to adjust a completion's XP (delta on `user_quest_tasks.xp_value` completion award path + `user_skill_xp` correction + audit note). Keep it teacher-scoped via `class_scope`.
- **Attendance (CONFIG):** `sis_attendance` + AttendancePage + TeacherClassPage quick entry. For "school-wide during morning devotionals", create one all-school class (or take attendance on any one class per day) — no build. Attendance alerts/sweep already exist.
- **Unified submissions inbox (NEW — the flagship build of this plan):** teachers need one queue of "everything newly submitted by students in my classes" with next/prev flow (comment or accept, then jump to the next submission without navigating quests). Today review surfaces are fragmented (credit review, class review queue, bounty queue). Build a teacher-scoped submissions inbox: backend endpoint aggregating new `quest_task_completions` (+ evidence) across the teacher's `class_scope`, ordered oldest-first, with accept/comment actions inline; frontend page in the teacher portal reusing `SubmissionReviewCard`/`ItemDetail` patterns. Flag: `sis_enabled` (part of the SIS console).
- **Inactivity alerts (NEW, small):** notify the teacher when (a) a student hasn't completed quest N but quest N+1 has released, or (b) a student hasn't accessed a quest in 2 weeks. Reuse the `sis_attendance_sweep` cron pattern; write to notifications (and the alerts card). Not due dates — Katie explicitly doesn't want due-date pressure.

### 5. Family communication — CONFIG + SMALL/NEW

- **Audiences (CONFIG):** class group chats (roster-synced, auto-created on enrollment), org-wide announcements (`routes/announcements.py`, fans out as notifications to students/advisors/parents), DMs to individual parents. "Groups of classes" = create an ad-hoc group conversation with those rosters, or send the announcement to several classes (SMALL if multi-class targeting is missing from the announcements audience model).
- **Email/push on new school message (NEW):** today delivery is in-app + realtime only — no external fan-out, and a parent who doesn't open the app misses it. Build a notification fan-out layer: on announcement (and optionally on SIS family-messaging messages), send Brevo transactional email to parents; push notification for mobile-app parents (expo push service exists). **Decided 2026-07-23: no SMS** — in-app messaging + push notifications (email fan-out still recommended as the safety net for parents without the app).
- **Templates / bi-weekly newsletter (SMALL/NEW):** simplest v1 = saved message templates (title + rich body) stored in `sis_settings`, selectable when composing an announcement. For the Google-composed newsletter, pasting into the composer works today; a "send this Google Doc" integration is not worth building. Brevo email templates are an option if newsletters go email-first.
- **Communications archive (SMALL):** parents want to re-read past newsletters. `announcements` rows are already durable — add a parent-visible "News" page listing the org's past announcements (newest first, full body, search by title). Pairs naturally with the fan-out work: the email says "new announcement", the archive is the canonical copy.

### 6. Calendar — CONFIG

`sis_events` + CalendarPage + FamilyCalendarPage already do exactly this: private-to-Optio events with details, org-scoped, with a tokenized iCal feed if anyone still wants Google visibility. One-time import of their existing Google Calendar events is a data-entry task (or a quick script), not a feature.

### 7. Student access on shared devices — CONFIRMED, generalize kiosk + scan flow

Confirmed use case: **a class iPad; students tap their name, scan their paper assignment, and it attaches to a quest.** The base flow is the Treehouse kiosk (`routes/treehouse.py`: device provisioning, token-gated roster, passwordless student login), but it is slug-hardcoded (`TREEHOUSE_SLUG`, `treehouse_kiosk_devices`).

- Generalize: move kiosk endpoints to an org-generic module (`routes/sis/kiosk.py` or `routes/kiosk.py`), key on a `kiosk` feature flag, rename/generalize the device table (or add `organization_id` and keep it). Treehouse keeps working via the same generic path.
- **Scan step:** the kiosk is v1 web on the iPad, so "scan" = camera capture (`<input capture>` / getUserMedia) with multi-page support, attached as evidence to the selected quest/task. Keep it simpler than the v2 native ML Kit scanner — photo capture with a crop/confirm step is enough for paper worksheets. After upload, auto-return to the tap-your-name screen for the next student.
- **Do students need email? No (CONFIG):** dependents (`is_dependent`, `managed_by_parent_id`) exist without email; parents manage them, kiosk gives them on-site login, and `add-login`/`promote` upgrades them later. K-6 students should be created as dependents; 13+ can have real accounts.

### 8. Parent access — SMALL + NEW

- **Student record page (SMALL-M):** Katie's per-student Google Sheet (shared 2026-07-23) defines the target shape. Parents already see their student's work; the new piece is a structured, admin/teacher-editable student record surfaced read-only to the linked parent:
  - **Profile:** preferred name, birthday, grade, parent contact, hobbies/interests/favorites (these also feed the AI personalization in 1b), free-notes (allergies, social media permissions, carpools). Most of this arrives via registration answers; the record page is where staff view/edit it after.
  - **Beginning-of-year / end-of-year assessments:** paired BOY/EOY fields (e.g. "Math CLE Book", "LA CLE Book", "Addition Facts"), field set configurable per org in `sis_settings` so other orgs can define their own assessment keys.
  - Schema: `sis_student_profile`-style JSONB or a `sis_student_stats` table + UI on `StudentDetailModal` + parent view.
- **Curriculum materials tracking (NEW, small):** per-student checklist of curriculum items (e.g. "Math 400 LightUnit set", "Science") with **Paid** and **Received** checkboxes, editable by admin, visible to the parent. Ties into billing (a materials line item can appear on the household ledger). Small table: `sis_student_materials` (org, student, item, paid, received).
- **Assignment/score tracker — "gradebook lite" (NEW, medium):** the largest spreadsheet replacement. Katie tracks CLE workbook sequences per student: rows like "Workbook 101 Quiz 1 / Quiz 2 / corrections / Test", each with date scheduled, date completed, score, notes on missed concepts, and a computed current average. Options:
  - (a) Model each workbook unit as tasks under a class quest and bolt a `score` field + averages onto completions, or
  - (b) A dedicated SIS assignment-tracker table (org, student, class, assignment name, scheduled/completed dates, score, notes) with reusable per-class assignment templates ("Workbook NNN" pattern) so a sequence can be stamped out per student.
  - Recommendation: **(b)** — scores/averages are an SIS record-keeping concern and shouldn't contaminate the XP model ("The Process Is The Goal"); keep quests XP-based and let the tracker reference a quest/task optionally. Teacher edits from TeacherClassPage; parent sees scores on the student record.
- **Portfolio (CONFIG + NEW):** public/private portfolio pages exist (`routes/portfolio.py`, `user_portfolio_settings`). Missing: the per-item "include in portfolio" toggle for scholarship curation. Add an `in_portfolio` boolean on completions/evidence, a parent/student toggle on the work item, and a filtered portfolio view. Net-new but thin.

### 9. Accounts + branding — DONE / CONFIG

- Login fix applied (see Current state). Recommended usage confirmed to Katie: shared `gryffinlearningcenter@gmail.com` for admin, personal accounts for the parent view.
- **Family links:** Tarien Bird confirmed as Katie's child — `parent_student_links` row added 2026-07-23 (katienbird → tarienbird, approved/admin-verified). Still open: Kaiden Bird (platform student, no org, no email) — hers? And is garrisonbird5@gmail.com correctly in the **iCreate** org?
- **Branding:** logo already in `branding_config` (replace with a right-sized asset from the files she sent). Add her palette to `branding_config` colors: `#850028`, `#C07A55`, `#DAAC6C`, `#E2D2BD` — consumed by the registration funnel and kiosk. The core app keeps Optio brand colors.

---

## Build list (net-new / extensions), suggested order

| # | Item | Size | Notes |
|---|------|------|-------|
| 1 | Registration funnel config for Gryffin (questions from both Google Forms, paperwork, no Stripe) + grade-band question conditions | S-M | Mostly data entry; flag-key generalization recommended |
| 2 | Goal/direction setting flow (post-registration step, per-subject goals, teacher review + meeting) | M | Gryffin's signature flow; replaces the schedule step |
| 3 | AI task suggestions fed by goals + direction + interests (personalization plumbing) | S-M | Extends existing personalization_service |
| 4 | Teacher submissions inbox (all new submissions across my classes, next/prev review flow) | M | The single highest-leverage generic build |
| 5 | Kiosk generalization (`kiosk` flag) + tap-name → scan-assignment flow on class iPads | M | Confirmed hardware plan; web camera capture, multi-page |
| 6 | Assignment/score tracker "gradebook lite" (CLE workbook sequences, scores, averages, notes) | M | Replaces the per-student tracking sheets; keep separate from XP |
| 7 | Parent Account page (household balance) + printable receipts/statements | S-M | Replaces the balance Google Sheet; receipts for scholarship reimbursement |
| 8 | Announcement fan-out: Brevo email + push to parents (no SMS — decided) | S-M | Also fixes "parents miss messages" generally |
| 9 | Information reports (medications, media release, generic question report, print/CSV) | S | Over registration answers |
| 10 | Student record page (profile, BOY/EOY assessments) + curriculum materials paid/received tracking | S-M | From Katie's per-student sheet |
| 11 | Payment reminder sweep (unpaid installment → Brevo email) + outstanding-invoices print view | S | Reuses sweep pattern |
| 12 | Communications archive page (past announcements/newsletters, parent-visible) | S | Announcements data already durable |
| 13 | Quest inactivity alerts (unfinished-when-next-released, 2-week no-access) | S | Sweep pattern |
| 14 | Teacher XP adjustment on completions | S | With audit trail |
| 15 | Completed-quest archive section in student class view | S | Verify current behavior first |
| 16 | Portfolio curation flag + filtered view | S | |
| 17 | Message templates for announcements/newsletter | S | |

Items 4, 5, and 8 have the clearest cross-org value beyond Gryffin; the goal-setting flow (2-3) is also a strong candidate for other microschools — keep all fully generic.

## Decisions

- **Resolved 2026-07-23:** no SMS (in-app + push, email fan-out as safety net). Kiosk confirmed: class iPads, tap-name → scan paper assignment. Tarien = Katie's child (linked).
- **Still open (Tanner / Katie):**
  1. Flag-key generalization `icreate_registration` → `sis_registration`: do it now (recommended) or live with the name?
  2. Kaiden Bird (platform student, no org/email) — Katie's? Garrison Bird — correctly in iCreate?
  3. K-6 students as email-less dependents (recommended) — confirm Gryffin is comfortable with parent-managed accounts for the littles.
  4. Gradebook-lite modeling: standalone SIS tracker (recommended) vs scores on quest tasks.
  5. Subject list + assessment field set (BOY/EOY keys) for `sis_settings` — get Katie's definitive list.
