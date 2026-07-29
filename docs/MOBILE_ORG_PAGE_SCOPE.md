# Scope: Organization ("School") page for the mobile app (v2)

**Date**: 2026-07-29
**Goal**: Let org parents — iCreate first, other schools later — do school-specific
actions from the mobile app instead of having to log into the website.

---

## Headline

**This is ~90% a `frontend-v2/` job. The backend is already built.**

The entire parent-facing school API already exists at `/api/sis/parent/*`
(`backend/routes/sis/parent.py`, 28 endpoints + `parent_forms.py`), it uses
`@require_auth` (not the staff-gated `/api/sis` decorators), and it authorizes by
family relationship inside `sis_parent_service`. Two things make it mobile-ready today:

- `session_manager.get_effective_user_id()` reads `Authorization: Bearer` before
  cookies (`backend/utils/session_manager.py:654`), so v2's Bearer tokens work.
- `backend/middleware/csrf_protection.py:167` exempts any request carrying a
  Bearer header, so v2 POST/PUT/PATCH/DELETE work without CSRF plumbing.

**No backend auth, CSRF, or endpoint work is required for the core surfaces.**
The only backend changes proposed are small additive conveniences (see Phase 0).

Meanwhile `frontend-v2/` has **zero** references to `/api/sis` — this is greenfield
on the mobile side.

---

## What "school-specific actions" means today (v1 web)

The parent school nav is gated in `frontend/src/components/navigation/Sidebar.jsx:266`
by `sisEnabled && hasParentRelationships`, where `sisEnabled` comes from
`organization.feature_flags.sis_enabled`. That block is the definitive list:

| # | Surface | v1 page | LOC | Backend endpoints |
|---|---------|---------|-----|-------------------|
| 1 | **Schedule Builder** (default) | `ScheduleBuilderPage.jsx` | 1116 | `/classes`, `/students/:id/schedule`, `/students/:id/classes` (POST/DELETE), `/claim`, `/learning-day`, `/schedule-submission`, `/age-exception-requests`, `/photo` |
| 1b | **Goal Setting** (goals-mode orgs) | `FamilyGoalsPage.jsx` | 247 | goals endpoints |
| 2 | **Billing** | `FamilyBillingPage.jsx` | 369 | `/billing`, `/billing/receipts/:id`, `/billing/invoices/:id/checkout`, `/confirm-payment` |
| 3 | **Absences** | `AbsenceReportingPage.jsx` | 195 | `/absences` GET/POST/DELETE |
| 4 | **School Calendar** | `FamilyCalendarPage.jsx` | 220 | `/events` |
| 5 | **Resources** | `FamilyResourcesPage.jsx` | 83 | `/resources` |
| 6 | **Directory** | `FamilyDirectoryPage.jsx` | 159 | `/directory`, `/directory/opt-in` GET/PUT |
| 7 | **Portal** (school-assigned checklists) | `FamilyPortalPage.jsx` | 166 | `/onboarding`, `/onboarding/:id/items/:key`, `/onboarding/upload`, `/onboarding/doc-url` |
| 8 | **Requests** (records / meeting / at-home day) | `FamilyFormsPage.jsx` | 204 | `/forms` GET/POST |
| 9 | Student detail | `FamilyStudentPage.jsx` | 202 | `/students/:id/*`, `/courses` |
| — | Registration (annual) | `ICreateRegisterPage.jsx` | 1561 | `/registrations` flow, `/quote`, `/submit` |

**~2,961 LOC** of web page code for surfaces 1–9, **~4,522 LOC** including registration.
That is the upper bound of what would be re-expressed in React Native — but a
straight LOC port is the wrong estimate, because the mobile versions should be
narrower (see "What not to port").

Every one of these pages follows the same shape: call `/api/sis/parent/context`
first to get `{ orgs: [{ organization_id, organization_name, students[], scheduling_url }] }`,
then make org-scoped calls with `?organization_id=`. That consistency makes the
port mechanical.

---

## Who this serves (production data, queried 2026-07-29)

| Org | slug | sis_enabled | parents | students | advisors | notes |
|-----|------|-------------|---------|----------|----------|-------|
| **iCreate** | `icreate` | yes | **72** | 163 | 27 | no hidden modules, schedule-builder mode |
| Test-Org | `test` | yes | 7 | 45 | 1 | |
| Gryffin Learning Center | `gryffin` | yes | 5 | 7 | 1 | **goals-mode**, hides `onboarding`, `timesheets`, `forms`, `clp` |
| Horizon | `horizon` | yes | 0 | 2 | 0 | |

So the real audience today is **72 iCreate parents**, and Gryffin is the proof that
the per-org module config already has a second consumer. Build the page
**config-driven, not iCreate-hardcoded** — the config layer already exists.

---

## Gating: all the data is already on the wire

Two sources, both already returned by the backend:

1. **`/api/auth/me`** returns `organization` with
   `id, name, slug, branding_config, quest_visibility_policy, feature_flags`
   (`backend/routes/auth/login/core.py:113`). `feature_flags` carries
   `sis_enabled`, `sis_settings.hidden_modules`, `sis_settings.post_registration_flow`,
   `sis_settings.community_enabled`, `icreate_registration.*`.
   v2's `User` interface (`frontend-v2/src/stores/authStore.ts:20`) has
   `organization_id` and `org_role` but **not** `organization` — the payload is
   being discarded. Adding the field is a few lines.

2. **`/api/sis/parent/context`** returns the guardian's SIS orgs and their
   registerable students; **an empty `orgs` array is itself the gate**. This
   correctly covers org_admins and advisors who are also parents (v1 relies on the
   same `hasParentRelationships` idea).

**Recommendation**: gate the mobile School surface on `context.orgs.length > 0`,
and use `organization.feature_flags` for per-module visibility. That mirrors v1
exactly and needs no new endpoint.

---

## Where it lives in the mobile app (the one real design decision)

`frontend-v2/src/config/navigation.ts:56` defines the parent shell:

```ts
export const parentMobileTabOrder = ['family', 'feed', 'capture', 'bounties', 'messages'];
```

Five slots, all occupied, and `capture` is the center FAB. There is no free tab.
Three options:

| Option | How | Trade-off |
|--------|-----|-----------|
| **A. "School" hub screen** (recommended) | New stack route `app/(app)/school/index.tsx` — a card grid of enabled modules — reached from an entry point on the Family tab header and from Profile/Settings | Zero disruption to the tab bar; matches how `settings`, `approvals`, `notifications` already work; one extra tap |
| **B. Swap a tab for SIS parents only** | Conditionally replace `messages` or `bounties` with `school` when `context.orgs.length > 0` | Best discoverability; but the parent shell then differs between org and platform parents, and `_layout.tsx` role branching gets another axis |
| **C. Section inside the Family tab** | Add a "School" section to `(tabs)/family.tsx` | No new nav at all; but `family.tsx` is already a large multi-child dashboard and this buries 8 surfaces |

**Recommendation: A.** It is the lowest-risk shape, it is how the codebase already
handles secondary surfaces, and the hub screen doubles as the place where
`hidden_modules` visibly does its job. If iCreate parents report the entry point is
too buried after launch, promoting it to B is a small follow-up.

Expo Router is file-based, so `app/(app)/school/*.tsx` auto-registers — no route
table edit needed beyond `navigation.ts` if a nav item is added.

---

## What not to port

- **Registration** (`ICreateRegisterPage.jsx`, 1561 LOC) — a once-a-year, long-form,
  multi-student flow with paperwork signatures and per-student conditional questions.
  Open it in `expo-web-browser` against the existing web page. `expo-web-browser`
  and `expo-linking` are already dependencies. Revisit only if parents complain.
- **Anything staff-facing.** The SIS console (`frontend/src/sis/`, 34 pages) is
  org_admin/advisor territory and explicitly out of scope for a parent surface.
- **Schedule Builder's full grid UX** — port the *outcomes* (view schedule, add/drop a
  class, claim a waitlist spot, set learning day, submit), not the desktop drag-grid.

---

## Known risks

1. **Stripe Checkout on native.** `create_invoice_checkout`
   (`backend/services/sis_billing_service.py:861`) returns a hosted Stripe URL built
   from a `return_url`, on the *school's own* Stripe account. On mobile this needs
   `expo-web-browser` + a deep-link return, and the `?payment=return` /
   `?payment=canceled` handling has to move to a mobile route. **Separately, App
   Store review**: tuition for real-world schooling is normally outside the IAP
   requirement, but shipping a payment button in an iOS build is a review risk worth
   pricing in. Lowest-risk MVP: show balance, invoices, and receipts read-only on
   mobile, and hand off to web for the actual card payment.
2. **Schedule Builder is the hardest port** — 1116 LOC and the most interaction-heavy
   surface. It is also the highest-value one for iCreate (schedule-builder mode is
   their `post_registration_flow`). Budget for it accordingly and do it last.
3. **Document uploads.** Portal checklists accept `pdf/doc/docx/png/jpg/jpeg/webp`
   (`backend/routes/sis/parent.py:27`). v2 has `expo-image-picker` but **not**
   `expo-document-picker` — either add the dep or restrict mobile uploads to
   camera/photo (which covers most "photograph the form" cases).
4. **Signed URLs for private docs.** `/onboarding/doc-url` returns short-lived signed
   URLs from the private `family-documents` bucket. Verify native fetch/display of
   those (likely fine via `expo-web-browser`, but untested on this path).
5. **No date/calendar primitives in v2.** `frontend-v2/src/components/ui/` has 20
   primitives (Card, Button, BottomSheet, Input, Badge…) but no date picker, calendar
   grid, or table. Absences, Calendar, and Schedule Builder all need date input —
   this is shared groundwork worth building once in Phase 0/1.
6. **School announcements are a separate system.** v1's `FamilyMessagingPage` posts to
   `/api/announcements`; v2's `announcement_only` flag is a *group-chat setting*, not
   the same thing. Parents receiving school announcements on mobile is arguably the
   single highest-value item here (v2 already has `src/services/pushNotifications.ts`),
   but it is **net-new work, not a port**. Called out separately below.

---

## Proposed phasing

Estimates assume one engineer familiar with the codebase, and include Jest tests
(v2 is at 276 tests / 100% pass and CI-gated at 95%, so tests are not optional).

### Phase 0 — Foundation (2–3 days)
- Add `organization` (with `feature_flags`) to v2's `User` type + `authStore`.
- `src/hooks/useSisParent.ts` — wraps `/api/sis/parent/context`; provides the gate,
  the active-org selector, and the student selector. Every later phase depends on it.
- `src/config/sisModules.ts` — port of `frontend/src/pages/sis/sisModules.js`
  (`hidden_modules`, `post_registration_flow`, `community_enabled`). Keep the two in
  lockstep; consider extracting shared constants later.
- `app/(app)/school/index.tsx` — the School hub, rendering only enabled modules.
- Entry point from the Family tab header + Profile.
- Shared date-input primitive.

### Phase 1 — Read-only surfaces (3–4 days)
Calendar, Resources, Directory (+ opt-in toggle). Low risk, immediately useful,
and they prove the hub/gating end to end.

### Phase 2 — Light write surfaces (4–5 days)
Absences (report/cancel — likely the most-used mobile action), Portal checklists
(incl. upload), Requests/forms.

### Phase 3 — Billing (3–4 days)
Balance, invoices, receipts. Payment either deferred to web or built with
`expo-web-browser` + deep-link return — decide before starting, per risk 1.

### Phase 4 — Schedule Builder / Goal Setting (6–8 days)
Mobile-native rethink rather than a port. Goal Setting (Gryffin's mode) is much
smaller than Schedule Builder (iCreate's) — both are needed for the config-driven
promise to hold, but Goal Setting could ship first as the easier half.

### Phase 5 — Deferred
Registration (webview handoff). School announcements + push (see below).

**Total for Phases 0–4: roughly 4–5 weeks.**
**A useful first release (Phases 0–2) is about 2 weeks** and already removes most of
the day-to-day reasons an iCreate parent opens the website.

---

## Worth considering alongside this

**School announcements with push notifications.** Right now a parent has no way to
receive school communication on their phone. v2 already has the push
infrastructure (`src/services/pushNotifications.ts`, `useNotifications.ts`) and the
backend already has `/api/announcements` per org. Wiring school announcements into
mobile push is probably a smaller job than any single Phase 1–4 item and is plausibly
worth more to a parent than any of them — it is the thing a phone is *for*. It is not
part of "port the org page", so it is listed separately rather than folded into an
estimate.

---

## Open questions

1. **Entry point** — hub screen (A), tab swap (B), or Family-tab section (C)?
2. **Billing payments on mobile** — read-only, or full Stripe handoff with the App
   Store risk accepted?
3. **Scope of the first release** — Phases 0–2 as a shippable slice, or hold until
   Schedule Builder is in?
4. **Announcements + push** — fold in now, or track separately?
