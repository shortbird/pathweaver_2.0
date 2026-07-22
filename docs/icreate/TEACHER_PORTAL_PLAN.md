# iCreate Teacher Portal — Gap Analysis & Build Plan

**Date:** 2026-07-22. Source: iCreate's teacher/staff portal request (16 numbered feature
groups + their own phasing). This maps each request onto what the platform already has,
so we build the thin missing layer instead of a parallel system.

## Where teachers stand today

- A teacher is a `users` row with `role='org_managed'`, `org_role='advisor'`. The SIS
  Staff page (`frontend/src/pages/sis/StaffPage.jsx`) creates them with a set-password
  email (`sis_service.create_org_teacher`).
- iCreate's schedule import created ~20 **placeholder** teachers with synthetic
  `*@icreate-staff.placeholder.optioeducation.com` emails; 121 classes point at them via
  `org_classes.primary_instructor_id`. **Account linking (built 2026-07-22)** connects a
  placeholder to the teacher's real email: claim-in-place for new emails (same user id,
  set-password invite) or merge into an existing Optio account (instructor refs
  repointed, advisor role added, placeholder removed). `POST /api/sis/staff/<id>/link`,
  UI on the Staff page ("No login yet" badge → "Link their account").
- Advisors can already log into the SIS — but they get the **full org-admin surface**
  (billing, registration, all families). There is no teacher-scoped view. This is the
  single biggest gap vs. iCreate's request #1.

## Request-by-request status

| # | Request | Status | Existing code to reuse |
|---|---------|--------|------------------------|
| 1 | Teacher accounts & permissions | **Partial** | Staff page CRUD, advisor role. Missing: teacher-scoped permissions, extra role labels (sub, coordinator, contractor), employment fields |
| 2 | Teacher dashboard | **Missing** | `class_meetings` (today's schedule), attendance quick-entry, announcements, notifications — all queryable; just needs an advisor landing page |
| 3 | Class assignments & scheduling | **Mostly built** | `org_classes.primary_instructor_id`, `class_advisors`, `class_meetings`, WeeklyScheduleGrid, schedule sync + AI editor. Missing: non-class duties (lunch/recess/events), sub assignment |
| 4 | Time clock | **Missing** | Nothing. Phase 3 per iCreate's own priorities — defer |
| 5 | Timesheets / payroll export | **Missing** | Defer with #4 (they explicitly say export-only is fine, no payment processing) |
| 6 | Class rosters | **Mostly built** | `/api/sis/roster`, class enrollments, StudentDetailModal; parent contacts via households. Missing: teacher-facing per-class roster view scoped to their classes, print view |
| 7 | Health/allergy alerts | **Partial** | `users.allergies` / `users.medications` fields exist and are editable in SIS. Missing: alert icon on rosters + access logging (`student_access_logs` table exists) |
| 8 | Parent/student communication | **Built** | Messaging overhaul: roster-synced class groups, announcements-only mode, attachments, reactions, pins, admin visibility. Teachers are group admins of their class groups |
| 9 | Staff directory & team chat | **Mostly built** | Staff page = directory (photo, bio, roles); group conversations support staff chats. Missing: teacher-visible (read-only) directory, org-controlled staff groups |
| 10 | Knowledge base | **Partial** | `org_resources` + ResourcesPage (docs/links/files). Missing: categories/tags, required-read acknowledgment, versioning |
| 11 | Training courses | **Foundation exists** | Quests/courses + XP are exactly this; iCreate even suggests quests. Needs advisor enrollment support + completion reporting |
| 12 | Custom onboarding | **Missing** | New checklist tables. Sensitive docs (tax, background checks) should stay OUT of the SIS — recommend external storage, link status only |
| 13 | Forms & checklists | **Missing** | Generic form-submission engine (incident, supply, maintenance...). New tables + routing to admins. High priority per iCreate |
| 14 | Classroom/curriculum tools | **Mostly built** | Class quests, curriculum lessons, evidence uploads on the learning side |
| 15 | Notifications | **Mostly built** | `sis_notifications` → in-app + push (attendance alerts, class-start reminders already fire). New events just plug in |
| 16 | Admin reports | **Partial** | `sis_reports` + CSV exports exist for students/billing. Staff-side reports come with each staff feature |
| 19 | Security/privacy | **Partial** | RLS-locked SIS tables, role gates, `student_access_logs`. Teacher-scoping (below) is the main gap; payroll/tax docs deliberately out of scope |

## Recommended build order

**Phase A — Teacher classroom access (their Phase 1):**
1. ~~Account linking for placeholder teachers~~ — done.
2. **Teacher-scoped SIS** — decision needed: advisors currently see everything.
   Proposal: advisors get Dashboard / My Classes / Attendance / Calendar / Resources /
   Messaging only; billing, registration, families, staff-management, CLP become
   org_admin-only. Backend: same split on route gates + "my classes" filters
   (`primary_instructor_id` OR `class_advisors`). ⚠ Changes what existing advisor
   accounts (e.g. Kirsten Barksdale) can see — confirm with iCreate before shipping.
3. **Teacher dashboard** — today's meetings for my classes, one-tap attendance links,
   recent messages, announcements.
4. **Roster + safety alerts** — per-class teacher roster (student, preferred name, age,
   parent contacts, photo) with allergy/medical icon; log views to `student_access_logs`.

**Phase B — Staff operations:** knowledge-base upgrades (categories, required-read
acknowledgment), forms engine (incident/supply/maintenance with routing + status),
staff profile fields (position, employment status, emergency contact, active flag —
new `sis_staff_profiles` table rather than more `users` columns), teacher-visible
directory, onboarding checklists.

**Phase C — Time & payroll:** time clock, timesheets, approval, CSV export. All new
build; defer until A+B are live. No payment processing ever (their own recommendation).

**Explicitly deferred:** substitute marketplace/shift swap, translation, QuickBooks
payroll integration (note: `sis_quickbooks_sync_log` exists for billing, so an
integration seam is already there), XP-for-pay bonuses.
