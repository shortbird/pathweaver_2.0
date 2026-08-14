# SIS School Dashboard — Audit & Implementation Plan

**Date**: 2026-08-14 | **Status**: Implemented — see [What shipped](#what-shipped)

## 1. Audit of the current page

The admin "School Dashboard" ([SisDashboard.jsx](../frontend/src/pages/sis/SisDashboard.jsx),
backed by `GET /api/sis/dashboard` → `sis_service.get_dashboard`,
[sis_service.py:327](../backend/services/sis_service.py)) shows:

- 4 stat cards: total students, active last 7 days, families, enrolled
- Enrollment-status breakdown (enrolled / applicants / withdrawn / graduated / no status)
- Two links: View roster, Manage families

### Problems

1. **Nothing is actionable.** Every number is a static census. An admin opening the
   console cannot see what needs their attention today: open attendance alerts,
   unassigned requests, pending signatures, waitlisted families, overdue invoices,
   students awaiting tuition approval, new submissions. All of those queues exist in
   the backend already — the dashboard just doesn't ask.
2. **No "today" view.** The coordinator dashboard
   ([CoordinatorDashboard.jsx](../frontend/src/pages/sis/CoordinatorDashboard.jsx),
   `sis_coordinator_service.get_dashboard`) already computes today's schedule and an
   attendance board; the admin — who is a superset of the coordinator — sees none of it.
3. **No finance signal.** Overdue invoices (`sis_billing_service.outstanding_invoices`)
   and the tuition-approval queue (`sis_tuition_service.tuition_queue`) are the two
   things only an org_admin can act on, and neither is surfaced.
4. **No shortcuts.** Two text links vs. the dozen high-frequency actions the console
   supports (take attendance, add family, message families, send for signature,
   export roster, review submissions).
5. **Latent security footgun.** The route is `ADMIN_ROLES`, so a campus coordinator
   *can* call it even though the UI routes them elsewhere. Any finance data added to
   this payload must be gated server-side per caller, not hidden by the frontend.
6. **Module blindness.** Orgs can hide modules
   (`feature_flags.sis_settings.hidden_modules`, [sisModules.js](../frontend/src/pages/sis/sisModules.js));
   a redesigned dashboard must not show tiles for modules the org has turned off, and
   prior learning is opt-in (`prior_learning_enabled`, enforced server-side).

### What already exists (reuse, don't rebuild)

Every signal below is one existing service call away — no new tables, no new queues:

| Signal | Source | Notes |
|---|---|---|
| Open attendance alerts | `sis_attendance_service.open_alerts(org_id)` | Canonical "not accounted for" queue |
| Today's schedule + attendance board | `sis_coordinator_service` (`_today_org_schedule`, `board_from`) | Reuse wholesale |
| Staff requests: unassigned / overdue | `sis_forms_service.list_all(org_id)` | Filter `assigned_to IS NULL`, `due_date < today`, status != resolved |
| Registrations in flight | `sis_registration_service.list_registrations` | Status in draft / in_progress / submitted |
| Age-exception requests | `GET /api/sis/age-exception-requests` service | Pending holds |
| Enrollment waitlist | `sis_enrollment_waitlist_service.list_entries` | Count; offers expiring is a bonus |
| Pending signatures | `sis_onboarding_service.list_signature_batches(org_id, include_hr)` | Σ(total − signed); `include_hr` per caller role |
| Incomplete staff onboarding | `sis_onboarding_service.list_assignments(kind='checklist')` | `done_count < total_count` |
| New submissions | submissions route already returns `counts.new` | `quest_task_completions` without review |
| Prior learning queue | `sis_prior_learning_service.queue_counts` | Only when `prior_learning_enabled` |
| Students in no family | `sis_service.unassigned_students(org_id)` | Data-quality tile |
| Upcoming events | `GET /api/sis/events?from=&to=` service | Next 7 days, audience-filtered |
| Overdue invoices (finance) | `sis_billing_service.outstanding_invoices(org_id)` | Count + Σ `amount_due_cents`, `days_overdue > 0` |
| Tuition approvals (finance) | `sis_tuition_service.tuition_queue(org_id)` | Returns `count` already |

## 2. Target design

Three bands, most urgent first:

```
Good morning, <name> — <Org name>                    [org picker]

NEEDS ATTENTION (action tiles; a tile renders only when count > 0 and module visible)
[3 not accounted for] [5 unassigned requests] [2 overdue requests] [4 pending signatures]
[6 on waitlist] [2 registrations to review] [8 new submissions] [1 prior learning]
[2 students not in a family] [3 staff onboarding incomplete]
   — each tile: count, label, deep link to the queue page

TODAY / FINANCE (two columns)
- Today at a glance: next classes (from today_schedule), attendance mini-board
  (present / absent / late / excused+reported-out), "Open attendance" link
- Finance (org_admin + superadmin only, server-gated): overdue invoices count +
  amount outstanding, tuition approvals waiting, links to Billing / Tuition
- Upcoming events (next 7 days) with "Open calendar" link

SCHOOL SNAPSHOT (the current content, demoted and compacted)
- Total students · Active 7d · Families · enrollment status row
Quick actions: Take attendance · Add family · Message families ·
Send for signature · Export roster CSV
```

Empty state: when every action count is 0, show a single "All caught up" line —
the absence of tiles is itself the signal.

## 3. Implementation plan

### Phase 1 — Backend aggregation (new service module)

**New file `backend/services/sis_dashboard_service.py`** — keep `sis_service.py` from
growing; existing `get_dashboard` stays for back-compat until the frontend switches.

`get_admin_dashboard(org_id, caller_id) -> dict`:

- Determine caller tier once: `finance = caller in FINANCE_ROLES` (reuse
  `sis_service.caller_sees_pay` / role lookup), `hr = caller in HR_ROLES`.
  **A coordinator calling the endpoint gets no `finance` key at all** — omit, don't null.
- Sections, each wrapped in its own `try/except` (the pattern
  `sis_tasks_service.list_my_tasks` uses) so one failing source degrades to `null`
  rather than 500ing the whole dashboard:
  - `snapshot`: current `get_dashboard` payload (reuse the function)
  - `attention`: `{attendance_alerts, requests_unassigned, requests_overdue,
    signatures_pending, waitlist, registrations_open, age_exceptions,
    submissions_new, prior_learning_submitted, students_no_family,
    onboarding_incomplete}` — counts only, plus each tile's target path
  - `today`: `{schedule: [...next 5 meetings], attendance: board_from(...)}` —
    extract/reuse from `sis_coordinator_service` (refactor its private helpers into
    shared functions rather than importing privates)
  - `events`: next 7 days, capped at 5
  - `finance` (only when `finance`): `{overdue_count, overdue_cents, outstanding_cents,
    tuition_queue_count}`
  - `modules`: echo `feature_flags.sis_settings` (`hidden_modules`,
    `prior_learning_enabled`) so the frontend filters with the existing
    `getHiddenModules` — single source of truth stays in `sisModules.js`
- Query discipline: use `count='exact'` wherever only a number is needed
  (attendance alerts, waitlist, prior learning already does this). Never fetch rows
  to count them (CLAUDE.md rule 10). Skip a queue's queries entirely when its module
  is hidden — cheaper and avoids dead tiles.
- Prior learning: only queried when `prior_learning_enabled` (mirror the route gate).
- Signatures: `include_hr=hr` so HR-sensitive batches never count for non-HR callers.

**Route** ([routes/sis/__init__.py:56](../backend/routes/sis/__init__.py)): keep
`GET /api/sis/dashboard` + `ADMIN_ROLES`; pass `user_id` through to the service.
Old response keys remain at the top level or under `snapshot` — pick one and update
the frontend in the same change (no other consumers of this endpoint exist).

### Phase 2 — Frontend rebuild

**[SisDashboard.jsx](../frontend/src/pages/sis/SisDashboard.jsx)** (admin branch only;
teacher/coordinator branches untouched):

- `ActionTile` component: count + label + `Link`; renders nothing at count 0.
  Extract to `frontend/src/components/sis/dashboard/` if the file gets long.
- Tile→module mapping reuses `SIS_MODULE_BY_PATH` + `getHiddenModules(organization)`
  from `sisModules.js` (the org object is already available via `useSisOrg`).
- Finance card guarded by `canSeeFinance(user)` from `sisRole.js` **and** by the
  presence of `data.finance` (backend is the gate; frontend is chrome).
- Keep: header, `SisOrgPicker`, loading/error/no-org states, snapshot stats
  (compact row), enrollment-status card.
- Quick actions row: Take attendance (`/attendance`), Add family (`/people?tab=families`),
  Message families (`/messaging` — verify route), Send for signature
  (`/secure-documents` or task center), Export roster (`/api/sis/reports/roster.csv`).
- Brand colors: `optio-purple`/`optio-pink` only. Alert tiles follow the coordinator
  dashboard's red treatment for attendance; neutral for the rest.

### Phase 3 — Tests

Backend (`backend/tests/test_sis_admin_dashboard.py`):
- Coordinator caller receives **no** `finance` key (regression test for the leak).
- Non-HR caller's signature count excludes HR batches.
- `prior_learning_submitted` absent/zero when the org flag is off.
- One source raising → that section null, rest of payload intact, 200.
- Empty org → all-zero counts, no errors.

Frontend (`frontend/src/pages/sis/sisDashboard.test.jsx`):
- Tiles render with counts and hide at 0; "All caught up" empty state.
- Hidden module (e.g. `attendance` in `hidden_modules`) removes its tile.
- Finance card hidden without `data.finance`.
- Existing snapshot stats still render.

While iterating run only the touched files (`npx vitest run frontend/src/pages/sis/sisDashboard.test.jsx`,
`pytest backend/tests/test_sis_admin_dashboard.py`); full suites once before commit.

### Phase 4 — Verify and ship

1. Local verify at http://localhost:3000 as superadmin (org picker), then confirm an
   org_admin and a coordinator account see the right variants. User confirms before
   any commit (CLAUDE.md rule 1).
2. Commit only the files this work touches (parallel-agent rule), `develop` first.

## 4. Sequencing and effort

| Step | Scope | Est. |
|---|---|---|
| 1 | `sis_dashboard_service.py` + route change + coordinator-helper refactor | ~half day |
| 2 | Frontend rebuild of the admin branch | ~half day |
| 3 | Backend + frontend tests | ~2–3 h |
| 4 | Local verification, polish, ship to develop | ~1 h |

Phases 1–2 land together (the response shape changes). No migration, no new tables,
no cron. Perf: ~12–15 cheap queries per load, acceptable uncached; if it ever drags,
parallelize the section builders or add a short Redis TTL — explicitly out of scope now.

## What shipped

Built 2026-08-14. Files:

- [backend/services/sis_dashboard_service.py](../backend/services/sis_dashboard_service.py) — the aggregator
- [backend/routes/sis/__init__.py](../backend/routes/sis/__init__.py) — `GET /api/sis/dashboard` now delegates to it
- [backend/services/sis_tuition_service.py](../backend/services/sis_tuition_service.py) — added `pending_count()`
- [frontend/src/pages/sis/SisDashboard.jsx](../frontend/src/pages/sis/SisDashboard.jsx) — rebuilt admin branch
- [backend/tests/test_sis_admin_dashboard.py](../backend/tests/test_sis_admin_dashboard.py) (20 tests),
  [frontend/src/pages/sis/schoolDashboard.test.jsx](../frontend/src/pages/sis/schoolDashboard.test.jsx) (8 tests)

### Deviations from the plan, and why

**Submissions tile dropped.** The `counts.new` figure is computed inside the
submissions *route*, by pulling every completion for every org student × quest
and diffing against the review table — an unpaged read that is itself
truncation-prone past 1000 rows. Reproducing that for a tile would have been
both the slowest query on the page and a number that quietly goes wrong as a
school grows. It needs a cheaper count (ideally a Postgres aggregate) before it
belongs on a dashboard.

**In-flight registrations tile dropped.** `GET /api/sis/registrations` has no
frontend consumer — no console page lists them — so the tile would have been a
number with nowhere to click.

**A failed source omits its tile instead of reporting zero.** Every count
defaults to `None`, not `0`. A queue that reads "0 students unaccounted for"
because the query fell over is worse than one that says nothing, and the
frontend already renders nothing for an absent key.

**Sequential, not parallel — measured, not assumed.** The fan-out is ~15
independent queries and a thread pool did halve the wall clock (2.7s → 1.0s on
iCreate). It also broke: the admin client is created per request
(`g._admin_client`) and fans out onto a cold connection pool, losing one or more
sources to `[Errno 35] Resource temporarily unavailable` in **2 runs out of 5**
at 3–8 workers; sequential was 0 out of 5 across every trial. Combined with the
rule above, a lost source means a missing tile — so parallelism here buys 1.7s
by occasionally hiding that three students are unaccounted for. Making it
concurrent safely needs a client per worker thread, which is a change to
`database.py`, not to this feature. The reasoning is recorded in the service
docstring so the next person doesn't re-derive it.

**Tuition count made cheap rather than cached.** `tuition_queue()` prices every
pending student's schedule (1.47s for 135 students at iCreate) to produce a
number the dashboard needs one integer from. `pending_count()` answers the same
question from two id sets in 0.19s. No caching was added anywhere.

### Measured on real data (iCreate, 2026-08-14)

4 unassigned requests, 28 incomplete checklists, 3 age-exception requests, 135
students awaiting tuition, $1,865 outstanding, 2 classes meeting today, 3
upcoming events — none of which the old dashboard could show. Full payload in
2.7s from this laptop, the bulk of it round-trip latency that production, which
sits next to the database, does not pay.

## 5. Later candidates (out of scope)

- "Offers expiring soon" from the waitlist offer TTL.
- Org-wide "students with zero emergency contacts" (needs a new group-by query).
- Enrollment trend sparkline (needs snapshotting over time — new table).
- Upcoming withdrawals from `school_enrollments.end_date`.
- Configurable tiles per org (reuse `quick_links` pattern from coordinator dashboard).
- A cheap new-submissions count (needs the submissions route's scan reworked into
  a Postgres aggregate first — see Deviations).
- Concurrent section fetching, once `database.py` can hand a worker thread its
  own client.
