# Gryffin Learning Center — SIS Build Plan

**Created:** 2026-07-23 | **Contacts:** Kathryn "Katie" Bird (gryffinlearningcenter@gmail.com = org_admin, katienbird@gmail.com = parent)
**Source:** Katie's brain dump (relayed by Tanner, 2026-07-23) on how Gryffin wants to use Optio as their SIS.
**Predecessor:** [GRYFFIN_BUILD_PLAN.md](GRYFFIN_BUILD_PLAN.md) — the 2026-06 LMS-side plan (feature flags, scheduled publish, due dates, hub, announcements, roster groups). Most of that shipped. This plan covers the SIS layer, reusing the iCreate SIS where it fits.

**Guiding principle (unchanged):** build org-generically, gate per-org via `organizations.feature_flags`, never `slug === 'gryffin'` in feature logic. The iCreate SIS already follows this — nearly all of it keys on `feature_flags.sis_enabled` + org-scoped `sis_*` tables, so most of this plan is configuration, not code.

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
- **Email/text/push on new school message (NEW):** today delivery is in-app + realtime only — no external fan-out, and a parent who doesn't open the app misses it. Build a notification fan-out layer: on announcement (and optionally on SIS family-messaging messages), send Brevo transactional email to parents; push notification for mobile-app parents (expo push service exists). SMS via Brevo transactional SMS is possible but has per-message cost — recommend email + push first, add SMS only if Gryffin insists (decision for Tanner: SMS costs).
- **Templates / bi-weekly newsletter (SMALL/NEW):** simplest v1 = saved message templates (title + rich body) stored in `sis_settings`, selectable when composing an announcement. For the Google-composed newsletter, pasting into the composer works today; a "send this Google Doc" integration is not worth building. Brevo email templates are an option if newsletters go email-first.

### 6. Calendar — CONFIG

`sis_events` + CalendarPage + FamilyCalendarPage already do exactly this: private-to-Optio events with details, org-scoped, with a tokenized iCal feed if anyone still wants Google visibility. One-time import of their existing Google Calendar events is a data-entry task (or a quick script), not a feature.

### 7. Student access on shared devices — SMALL (generalize kiosk)

The "click their name, take a picture, attach to a quest" flow is the Treehouse kiosk (`routes/treehouse.py`: device provisioning, token-gated roster, passwordless student login). It works but is slug-hardcoded (`TREEHOUSE_SLUG`, `treehouse_kiosk_devices`).

- Generalize: move kiosk endpoints to an org-generic module (`routes/sis/kiosk.py` or `routes/kiosk.py`), key on a `kiosk` feature flag, rename/generalize the device table (or add `organization_id` and keep it). Treehouse keeps working via the same generic path.
- **Do students need email? No (CONFIG):** dependents (`is_dependent`, `managed_by_parent_id`) exist without email; parents manage them, kiosk gives them on-site login, and `add-login`/`promote` upgrades them later. K-6 students should be created as dependents; 13+ can have real accounts.

### 8. Parent access — SMALL + NEW

- **Student information page (SMALL):** parents already see their student's work (parent portal). The new piece is admin-entered "beginning of year statistics" updated over time — add a per-student assessments/notes section (org-visible fields on the SIS student record, surfaced read-only to the linked parent). Small schema addition (e.g. `sis_student_stats` or a JSONB on the SIS student profile) + UI on `StudentDetailModal` + parent view.
- **Portfolio (CONFIG + NEW):** public/private portfolio pages exist (`routes/portfolio.py`, `user_portfolio_settings`). Missing: the per-item "include in portfolio" toggle for scholarship curation. Add an `in_portfolio` boolean on completions/evidence, a parent/student toggle on the work item, and a filtered portfolio view. Net-new but thin.

### 9. Accounts + branding — DONE / CONFIG

- Login fix applied (see Current state). Recommended usage confirmed to Katie: shared `gryffinlearningcenter@gmail.com` for admin, personal accounts for the parent view.
- **Open questions for Katie:** which students are her children? Her parent account is linked only to garrisonbird5@gmail.com — who is in the **iCreate** org, not Gryffin (possibly wrong org, possibly genuinely attends iCreate). Tarien Bird (Gryffin student) and Kaiden Bird (platform student, no org, no email) are not linked to her. Fix links once she confirms.
- **Branding:** logo already in `branding_config` (replace with a right-sized asset from the files she sent). Add her palette to `branding_config` colors: `#850028`, `#C07A55`, `#DAAC6C`, `#E2D2BD` — consumed by the registration funnel and kiosk. The core app keeps Optio brand colors.

---

## Build list (net-new / extensions), suggested order

| # | Item | Size | Notes |
|---|------|------|-------|
| 1 | Registration funnel config for Gryffin (questions from both Google Forms, paperwork, no Stripe) + grade-band question conditions | S-M | Mostly data entry; flag-key generalization recommended |
| 2 | Teacher submissions inbox (all new submissions across my classes, next/prev review flow) | M | The single highest-leverage new build |
| 3 | Information reports (medications, media release, generic question report, print/CSV) | S | Over registration answers |
| 4 | Announcement fan-out: Brevo email + push to parents (SMS deferred) | S-M | Also fixes "parents miss messages" generally |
| 5 | Payment reminder sweep (unpaid installment → Brevo email) + outstanding-invoices print view | S | Reuses sweep pattern |
| 6 | Kiosk generalization off the Treehouse slug (`kiosk` flag) | S-M | Needed for on-site shared-device uploads |
| 7 | Quest inactivity alerts (unfinished-when-next-released, 2-week no-access) | S | Sweep pattern |
| 8 | Teacher XP adjustment on completions | S | With audit trail |
| 9 | Completed-quest archive section in student class view | S | Verify current behavior first |
| 10 | Portfolio curation flag + filtered view | S | |
| 11 | Student info page stats (admin-entered, parent-visible) | S | |
| 12 | Message templates for announcements/newsletter | S | |

Items 2, 4, and 6 are the ones with cross-org value beyond Gryffin; keep them fully generic.

## Decisions needed (Tanner / Katie)

1. SMS notifications: real SMS (per-message cost via Brevo) or email + app push only?
2. Flag-key generalization `icreate_registration` → `sis_registration`: do it now (recommended) or live with the name?
3. Which Bird children belong to Katie, and is Garrison correctly in iCreate?
4. K-6 students as email-less dependents (recommended) — confirm Gryffin is comfortable with parent-managed accounts for the littles.
5. Kiosk hardware plan (shared tablets on site?) — affects priority of item 6.
