# Scope: school features for org parents in the mobile app (v2)

**Date**: 2026-07-29
**Goal**: Give org parents (iCreate first) the school actions that actually belong on
a phone — communication, their kids' schedule/classes, absence excusal — and hand off
to web for everything else.

> Supersedes the earlier full-port scope. The full inventory of v1 parent surfaces is
> retained at the bottom for reference, but the plan is now a thin slice.

---

## Five findings that should shape the plan

### 1. The backend is already built and already mobile-ready

`/api/sis/parent/*` (`backend/routes/sis/parent.py`, 28 endpoints) is the complete
parent-facing school API. It uses `@require_auth`, not the staff-gated SIS decorators.
Two things make it usable from v2 today:

- `session_manager.get_effective_user_id()` reads `Authorization: Bearer` before
  cookies (`backend/utils/session_manager.py:654`).
- `backend/middleware/csrf_protection.py:167` exempts Bearer requests from CSRF.

`/api/auth/me` already returns `organization` with `feature_flags`
(`backend/routes/auth/login/core.py:113`) — v2's `User` type just discards it.
`/api/sis/parent/context` returns the guardian's SIS orgs + students; an empty
`orgs` array is a ready-made gate. **No new endpoints needed for this slice.**

### 2. Push notifications already reach parents — the plumbing works

`'announcement'` is in `MOBILE_PUSH_NOTIFICATION_TYPES`
(`backend/services/notification_service.py:24`), and `sis_notifications.py:17` sets
`SIS_NOTIFICATION_TYPE = 'announcement'`, so **every SIS event already fires an Expo
push**. v2 has the receiving end (`src/services/pushNotifications.ts`,
`useNotifications.ts`, `app/(app)/notifications.tsx`).

Communication is therefore **not a build — it's a repair job.** See finding 3.

### 3. …but every SIS notification dead-ends on mobile

iCreate's SIS notifications over the last 3 weeks (prod, queried 2026-07-29):

| Title | Count | `link` | Audience | Resolves on mobile? |
|-------|-------|--------|----------|---------------------|
| Take attendance | 315 | `/attendance` | staff | no |
| Schedule submitted for approval | 129 | `/registration` | staff | no |
| Onboarding checklist assigned | 18 | `/onboarding` | **parent** | no |
| A seat opened up | 11 | *(null)* | **parent** | no |
| New class assignment | 7 | `/my-classes` | staff | no |
| Absence reported | 4 | `/attendance` | staff | no |
| Schedule needs changes | 4 | `/schedule-builder` | **parent** | no |

Every one of those `link` values is a **SIS console path**. None appear in
`deepLinkRouter.ts`'s `REMAP` or `WEB_ONLY_PREFIXES`, so per its safety contract they
all fall back to the generic notifications list. **A parent gets pushed "A seat opened
up", taps it, and lands on a list.**

Two more problems in the same area:

- **The type is overloaded.** "Take attendance" is typed `announcement`, so v2's
  notifications screen renders it with announcement styling (`notifications.tsx:68`),
  and there's no way to offer per-type push preferences or to filter staff pings out
  of a parent's feed.
- **The durable row is silently failing.** All 488 iCreate `announcement` notifications
  have `metadata.announcement_id = null` and the `announcements` table has **0 rows**
  for iCreate — because SIS notifications never write one. Any mobile "announcements
  inbox" built on that table would be empty.

### 4. iCreate has never sent a broadcast announcement

Zero rows in `announcements` for iCreate. The 488 are all system events. So a
family-announcements inbox would be building for a channel the school **doesn't
currently use** — they presumably communicate by email/text today. Worth asking them
before building it, rather than assuming.

### 5. The real bottleneck is adoption, not features

Device-token coverage (prod, 2026-07-29):

| Org | role | users | with device token |
|-----|------|-------|-------------------|
| iCreate | **parent** | **72** | **3** |
| iCreate | student | 163 | 3 |
| iCreate | advisor | 27 | 1 |
| Gryffin | parent | 5 | 0 |

**3 of 72 iCreate parents have the app.** Every notification improvement above is
currently reaching three people. This argues strongly for the thin slice — build the
smallest set of things that make the app worth installing, ship it with a deliberate
"install the app" push to iCreate families, then let usage tell you what to build next.

---

## Recommended scope

### Phase 1 — Fix the notification loop (2–3 days) — *do this first*

Highest value per day of work in the whole plan, and it improves the experience for
users who already have the app.

- **Split the notification type.** `sis_notifications.py:17` should emit distinct types
  (`sis_absence`, `sis_schedule`, `sis_waitlist`, `sis_checklist`, …) instead of
  overloading `announcement`. Add them to `MOBILE_PUSH_NOTIFICATION_TYPES` and the
  `notifications.type` CHECK constraint. Unblocks per-type styling and preferences.
- **Add SIS paths to `deepLinkRouter.ts`** so pushes land somewhere real: parent-facing
  links to the new mobile screens below, staff-facing links to `view-on-web.tsx` (which
  already exists and takes a `path` + `label`).
- **Give "A seat opened up" a link at all** — it currently has none.
- Filter staff-typed notifications out of the parent feed.

**Also worth fixing while in here**: the "Take attendance" push fires 315 times in 3
weeks at 27 advisors. If advisors adopt the app, that's a notification-fatigue problem
waiting to happen — it should probably be a digest, not a per-event push.

### Phase 2 — Absence excusal (2–3 days)

Smallest real surface (v1 page is 195 LOC, 3 endpoints: `GET`/`POST`/`DELETE`
`/api/sis/parent/absences`), and the best phone fit — "kid's sick at 7am" is not a
laptop moment. Staff notification on report is already wired
(`sis_planned_absence_service.py:179`).

Needs a date-picker primitive — v2's `src/components/ui/` has 20 primitives but no
date input. Build it here; Phase 3 reuses it.

*Honest caveat*: only **2** absences have ever been recorded, both in July. That's
plausibly because it's buried on the web and the school year hasn't started — but it
means the feature is cheap insurance for the fall, not a proven pain point. Worth one
question to iCreate before building.

### Phase 3 — Schedule + classes inside the existing child view (3–4 days)

**Don't build a new page.** `app/(app)/parent/child/[studentId].tsx` is already a
228-line stack of cards (Learning Activity, Pillar Breakdown, Journal Topics, Subject
Credits, Activity). Add **"School Schedule"** and **"Classes"** cards there. That *is*
the interweaving with the parent quest view.

`GET /api/sis/parent/students/:id/schedule` returns exactly what's needed: enrolled
classes with meetings, live waitlist entries, at-home Optio courses, and a flag for
whether self-service changes are still open — use that flag as the read-only/edit switch.

**Read-only, with one exception**: include **waitlist claim**
(`POST /students/:id/classes/:id/claim`). It's time-sensitive, it's the natural
destination for the "A seat opened up" push from Phase 1, and it makes that whole loop
work end to end. Add/drop, learning day, age exceptions, and schedule submission stay
on web.

### Explicitly out of scope — hand off to web

`view-on-web.tsx` already implements the handoff (path + label → browser). Point these
at it: Schedule Builder edits, registration (`ICreateRegisterPage.jsx` is 1561 LOC of
annual long-form), billing/payments, the family directory, resources, and the whole
staff SIS console.

**Billing is worth one exception to consider**: a single "outstanding balance" line on
the child card is nearly free from `GET /api/sis/parent/billing` and is the kind of
thing parents check on a phone. Payment itself should stay on web — `create_invoice_checkout`
(`sis_billing_service.py:861`) returns a hosted Stripe URL on the school's own account,
and shipping a tuition payment button in an iOS build is an App Store review risk
that isn't worth taking for this slice.

**No "School hub" screen yet.** With three surfaces — notifications, absences, and a
card inside a screen that already exists — there's nothing to hub. Two entry points
suffice: absences from the Family tab, schedule inside the child view. Revisit if this
grows past four surfaces.

---

## Total: roughly 7–10 days

Versus 4–5 weeks for the full port. And Phase 1 alone is arguably worth shipping on its
own, since it improves things for existing users without adding any new surface.

---

## Other ideas worth considering

1. **Ship an install campaign with it.** 3/72 parents is the constraint. A slice this
   size lives or dies on whether iCreate families actually install the app — the
   feature work and the distribution work should ship together.
2. **Ask iCreate what they currently do by email/text.** They've sent zero broadcast
   announcements through Optio but clearly communicate somehow. Whatever that channel
   is, it's the real "communication" feature request, and it may be a smaller build
   than anything above.
3. **Advisors are 27 users with 1 device token.** "Take attendance" is the highest-volume
   notification in the system. A tiny advisor attendance surface on mobile might be a
   bigger operational win for iCreate than anything parent-facing — worth asking.
4. **Per-type notification preferences.** Phase 1's type split makes this possible;
   `src/components/profile/NotificationPreferences.tsx` already exists to extend.
5. **Keep it config-driven, not iCreate-hardcoded.** Gryffin (5 parents) runs goals-mode
   with 4 hidden modules — the per-org config in
   `frontend/src/pages/sis/sisModules.js` already has a second consumer. Port that
   logic rather than branching on the iCreate slug.

---

## Open questions

1. Absence excusal — confirm with iCreate it's a real pain point before building (2
   recorded uses)?
2. Announcements — is there an off-platform channel they'd want to move into Optio?
3. Waitlist claim on mobile — in, or keep all schedule writes on web?
4. Billing balance as a read-only line — in or out?
5. Advisor attendance on mobile — worth scoping separately?

---

## Appendix: full v1 parent surface inventory

Gated in `frontend/src/components/navigation/Sidebar.jsx:266` by
`sisEnabled && hasParentRelationships`. Retained for reference; most of this is
intentionally *not* in the recommended scope.

| Surface | v1 page | LOC | Endpoints |
|---------|---------|-----|-----------|
| Schedule Builder | `ScheduleBuilderPage.jsx` | 1116 | `/classes`, `/students/:id/schedule`, `/students/:id/classes`, `/claim`, `/learning-day`, `/schedule-submission`, `/age-exception-requests`, `/photo` |
| Goal Setting (goals-mode orgs) | `FamilyGoalsPage.jsx` | 247 | goals endpoints |
| Billing | `FamilyBillingPage.jsx` | 369 | `/billing`, `/billing/receipts/:id`, `/checkout`, `/confirm-payment` |
| Absences | `AbsenceReportingPage.jsx` | 195 | `/absences` GET/POST/DELETE |
| School Calendar | `FamilyCalendarPage.jsx` | 220 | `/events` |
| Resources | `FamilyResourcesPage.jsx` | 83 | `/resources` |
| Directory | `FamilyDirectoryPage.jsx` | 159 | `/directory`, `/directory/opt-in` |
| Portal (checklists) | `FamilyPortalPage.jsx` | 166 | `/onboarding`, `/onboarding/upload`, `/onboarding/doc-url` |
| Requests | `FamilyFormsPage.jsx` | 204 | `/forms` GET/POST |
| Student detail | `FamilyStudentPage.jsx` | 202 | `/students/:id/*`, `/courses` |
| Registration | `ICreateRegisterPage.jsx` | 1561 | `/registrations` flow, `/quote`, `/submit` |

**Orgs with `sis_enabled`** (prod, 2026-07-29): iCreate (72 parents / 163 students),
Test-Org (7/45), Gryffin (5/7, goals-mode, hides `onboarding`/`timesheets`/`forms`/`clp`),
Horizon (0/2).
