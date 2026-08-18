# Open items from iCreate family orientation — 2026-08-18

Everything below was found while iCreate ran family orientation with dozens of
families in the building on the mobile app. The urgent work shipped that day
(see "Already resolved" at the bottom for what not to re-investigate). What
remains is written down here rather than fixed, because fixing it mid-event was
either unnecessary or actively unsafe.

Ordered by priority within each section.

---

## 1. Broken in production, not yet fixed

### 1.1 `/api/observers/invite` does not exist, and two clients call it

**Impact: high — a button that cannot ever work.**

The route is not registered anywhere in the app. `app.url_map` has
`/api/observers/generate-link`, `/api/observers/parent-invite` and
`/api/observers/family-invite`, but no `/api/observers/invite`. Two clients
POST to it:

- [frontend/src/services/api.js:446](../frontend/src/services/api.js#L446)
- [frontend-v2/app/(app)/(tabs)/profile.tsx:120](../frontend-v2/app/(app)/(tabs)/profile.tsx#L120)

Both must be 404ing. It is documented as real in `API_DOCUMENTATION.md` and
`api_specs/complete_api_spec.yml`, which is probably how it survived. Decide
whether the endpoint should exist or the callers should point at
`generate-link` / `parent-invite`, then delete the stale spec entries.

There are unit tests asserting the *client* calls this path
(`src/hooks/__tests__/useObserver.test.ts`), which pass against a mocked `api`
and therefore prove nothing about the server. Worth noting as a test-design
lesson: mocking the transport hides a missing route.

### 1.2 Per-user rate limiting silently falls back to IP

**Impact: high — it is why one shared bucket locked out a building.**

`init_task_signed_upload` is declared `@rate_limit(..., per_user=True)`, but the
denial that hit during orientation was keyed
`identifier=172.68.3.193:evidence_documents.init_task_signed_upload` — an IP,
not a user. `_resolve_rate_limit_user_id()` returned `None` and the limiter took
the IP path.

The IP itself was fixed the same day (`TRUSTED_PROXY_HOPS` 1 → 2, so buckets are
now per client rather than per Cloudflare edge). **The root cause was not**:
per-user keying should have meant the IP path was never reached. Find out why
`session_manager.get_effective_user_id()` returns `None` on a Bearer-authenticated
mobile upload. Note `rate_limit` is applied *above* `require_auth`, so it runs
before authentication — it parses the token itself, and that parse is what is
failing.

Add the identifier to the Sentry context in `_report_rate_limit_exceeded` while
you are in there. Its absence is why the IP keying had to be dug out of Render
logs instead of being visible in the issue.

### 1.3 `student_access_logs` check-constraint violation

**Impact: medium — FERPA-adjacent audit logging is failing.**

Sentry **OPTIO-BACKEND-6K**, culprit `parent_child_overview.get_child_overview`:

```
new row for relation "student_access_logs" violates check constraint
"valid_accessor_role"
```

The access log is being written with an accessor role the constraint rejects, so
those accesses are going unrecorded. Almost certainly the same root cause as the
two role bugs fixed on the day: an `org_managed` value reaching a column that
expects a resolved role. Check what `valid_accessor_role` permits against what
the logger passes.

### 1.4 Staff-only class fields are served to students

**Impact: medium — data exposure, pre-existing.**

`/api/classes/student/classes` returns `org_classes(*)`, which includes
`internal_notes`, `price_cents`, `supply_budget_per_student` and
`assistant_instructor_ids`. The SIS catalog has a filter for exactly this
(`sis_catalog_service.STAFF_ONLY_FIELDS` / `_for_audience`) — this endpoint just
does not use it.

Not introduced by the schedule work, and deliberately left alone during the
event because narrowing the select could break other consumers. Route it
through the same audience filter the SIS catalog uses.

### 1.5 CSRF token expiry on the SIS console

**Impact: low — staff annoyance, no family affected.**

Sentry **OPTIO-BACKEND-6J**, 17 events, culprit `sis_catalog.update_class`.
`level: info`. An admin leaves the SIS open in a tab, the CSRF token ages out,
and the next save is rejected. Mobile uses Bearer tokens and has no CSRF, so no
family is touched.

Fix is client-side: refresh the CSRF token before a mutation, or retry once on
`csrf_reason: expired` instead of surfacing the failure.

### 1.6 Lower-volume Sentry issues, triaged but unfixed

| Issue | Culprit | Note |
|---|---|---|
| **OPTIO-BACKEND-6T** | `evidence_documents.finalize_task_signed_upload` | `409 Duplicate` from video processing — a re-finalize of an already-processed upload. Should be idempotent. |
| **OPTIO-BACKEND-6M** | `evidence_documents.init_task_signed_upload` | `RemoteProtocolError: Server disconnected` — stale pooled socket. Already has `with_connection_retry`; confirm it covers this path. |
| **OPTIO-BACKEND-6N** | `auth_login.refresh_token` | "Refresh token reuse detected; token family revoked". Low volume and expected under token churn, but worth confirming it is not a mobile refresh race. |
| **OPTIO-BACKEND-6Q** | — | `Worker sent SIGTERM`. This was the deliberate restart during scaling. Resolve it. |

---

## 2. Written but deliberately not shipped

### 2.1 Auto-resync of training-quest task edits

**Status: helper written, uncommitted, untested, wiring removed before deploy.**

`resync_enrollments_to_template()` is in
[backend/utils/template_tasks.py](../backend/utils/template_tasks.py) as an
uncommitted working-tree change. It was wired into
`update_training_quest` and then removed before the deploy, because it performs
bulk deletes and inserts across every enrollment on each save and has no tests.
Shipping that into a live event was the wrong trade.

**The underlying problem is real and still present:** saving a training quest
changes only what *future* enrollees receive. Task lists are copied per user at
enrollment time (`assign_quest_to_users`), so an admin editing an orientation
quest reaches nobody who already holds it. On the day, an edit at 15:59 left all
152 families on the previous copy, and it was corrected by a one-off script.

Before wiring it up:

- **Do not delete rows to recreate them.** `quest_task_completions.user_quest_task_id`
  and `user_task_evidence_documents.task_id` are both `ON DELETE CASCADE`, so a
  delete destroys awarded XP and uploaded evidence. The one-off script that ran
  successfully **updated rows in place** for exactly this reason — an UPDATE
  cannot cascade, so a race can at worst retitle a task somebody just completed.
- Rows carrying work must be skipped entirely, and the template task matching
  their title must not be written over the top of them.
- Surplus rows are the only safe deletes, and each needs re-checking for work
  immediately before removal.
- Tests should cover: a completion surviving, a draft evidence upload surviving,
  and a task completed *during* the run surviving.

The working script is a good starting point — it is in the session scratchpad,
and its approach is described above.

### 2.2 No "promote to parent" step in the mobile app

**Impact: medium — the documented way to add a co-parent cannot be finished on a phone.**

Adding a second parent is: invite as observer → **Family Settings → "Make a
parent"**. That second step exists only on web
([FamilySettingsModal.jsx:187](../frontend/src/components/parent/FamilySettingsModal.jsx#L187)
→ `POST /api/parents/promote-observer`). Mobile has the observer invite but no
promote, so a parent starting on their phone gets stuck halfway.

Families at an in-person orientation are on phones. Worth adding.

---

## 3. iCreate data quality

None of these are code bugs. All need somebody at the school to act, or a
decision from us.

### 3.1 Lauren Bezzant is not attached to the organisation

`laurenebv@gmail.com`, `role='parent'`, **`organization_id = NULL`**. She
registered but her account never joined iCreate, so she has no family portal, no
school page, and no orientation quest. The "Bezzant Family" household
(1404 Jordan Ave, Provo) exists with no members.

**This is the one with a person waiting on the other end.**

### 3.2 Five students have no date of birth

Age-gated quests exclude a student whose DOB is unknown — deliberately, so a
quest for teenagers never lands on a six-year-old. These five were therefore
skipped by the 12–18 orientation quest and may well be in range:

| Student | Contact |
|---|---|
| Garrison Bird | garrisonbird5@gmail.com |
| Emmitt Funk | emmittfunk@gmail.com |
| Chloe Woellhaf | chloereadsbooks100@gmail.com |
| Cami Christensen | username `camichr` |
| Demo Student | `demo.student.ddd985` — test account, ignore |

### 3.3 Nine parent accounts belong to no household

83 of 92 parent accounts are linked to a household. The other nine:

- **Duplicate accounts** — Sarie Larson's duplicate was deleted on the day.
  **Stephanie Davis still has two** (`davis.steph85@gmail.com`, dormant since
  7/22, no household; `young.stephanie2@gmail.com`, active, in Davis Family).
  Not merged, because both are email-confirmed and both have signed in — it
  needs a human to confirm they are the same person.
- **Erin Swenson** (`erin4collins@gmail.com`) — Swenson Family exists with Bobby
  Swenson only. Likely the second guardian, never linked. Left alone on request.
- **Ali Oliver, Gerlinda Garlic, Melanie Adams** — no matching household.
  Melanie registered the morning of the event.
- **Three test accounts** — `tannerbowman+ic@`, `tanner+ict@`, Molly Tester.

### 3.4 Households with no linked accounts

**Do not delete these.** Two are matched to `sis_family_directives` with
`fee_prepaid = true` — they are real prepaid families whose accounts were never
linked, and deleting the household throws away the fee match.

| Household | Address | Evidence |
|---|---|---|
| Smith Family | 154 E Zinfandel Ln, Vineyard | directive → `amy.bang.smith@gmail.com`, **prepaid** |
| Larson Family | 1052 S 1350 E, Spanish Fork | directive → `larsonchristie72@gmail.com`, **prepaid** |
| Bezzant Family | 1404 Jordan Ave, Provo | see 3.1 |

Also: **duplicate household names** — 3 × "Larson Family" and 2 × "Davis
Family". These are *different families at different addresses*, not duplicates,
except where they pair with the duplicate accounts in 3.3.

### 3.5 Test data in the production org

"person Family" — address `asd`, phone `1234567890`, members "faketeacher
person" and "none none". Safe to delete; nothing references it.

### 3.6 A class with no room recorded

"Elementary Microschool (Monday)" has no `location` on the class and none on its
meeting, so the schedule shows its time without a room. Every other class in the
sample resolved a room. Someone at the school just needs to fill it in — it
appears in the app immediately, with no release.

---

## 4. Infrastructure and hygiene

### 4.1 Rotate two exposed credentials

Both were pasted into or printed in an assistant session transcript on
2026-08-18:

- **Expo access token** (account `optio-ed`, Admin scope) — rotate at
  <https://expo.dev/settings/access-tokens>
- **Render API key** — it was echoed to stdout while checking whether it was
  set. Rotate it.

Neither was written to disk.

### 4.2 Dead rate-limit config

`DISABLE_RATE_LIMIT` is set on the prod service (`false`) and
`RATE_LIMIT_ENABLED` is defined in `app_config.py`, but **nothing in the
codebase reads either one**. Anyone reaching for them as an emergency switch
mid-incident will find they do nothing. Either wire them up or delete them —
misleading config is worse than none.

### 4.3 Render sizing is now well above baseline

Scaled during the event to handle the load:

| | Before | Now |
|---|---|---|
| Plan | Starter (0.5 CPU / 512 MB) | **Pro (2 CPU / 4 GB)** |
| Instances | 1 | **2** |
| Gunicorn | 2 workers × 2 threads | **4 × 8** |

Roughly $85/instance/month versus $7. Memory was never the constraint — it sat
at 260–300 MB of 512 MB while CPU pinned at the 0.5 cap.

Suggested: drop to **Standard (1 CPU) × 2** after the event and watch the CPU
graph, rather than going straight back to Starter. Keep two instances
regardless — the second one is what removed the last 502s, because
`max_requests=1000` recycles workers and a single instance has nothing to serve
during the recycle.

A plan change needs a full **deploy**, not a restart — Render keeps the running
instance on the old hardware until it redeploys.

### 4.4 OTA sourcemaps were not uploaded

Three production OTAs shipped on 2026-08-18 without sourcemaps, so Sentry stack
traces from them are minified. `SENTRY_AUTH_TOKEN` exists in the EAS production
environment but not in the local shell, and `npm run ota:production` chains
`export && sourcemaps && update` with `&&` — so the missing token would have
failed the *upload* and silently skipped the *publish*. Worth decoupling those
steps so a telemetry failure can never block a release.

---

## Already resolved on the day — do not re-investigate

| | Resolution |
|---|---|
| Server overload, 502s, 9–17s responses | CPU pinned at the Starter cap. Scaled to Pro × 2. 100% success, 0.36s avg. |
| Upload rate-limit lockout | `TRUSTED_PROXY_HOPS` 1 → 2. Buckets were keyed to a Cloudflare edge IP, so everyone shared one. Verified: real client IPs now in logs, zero CF IPs. |
| Task titles truncated in mobile | `numberOfLines` clamped to 1 even when expanded; iCreate titles run to 158 chars. Now unclamped when open. |
| "Complete task" silently doing nothing | The 400 explaining that evidence is required was swallowed by a bare `catch {}`. Now stated before the tap and surfaced after. |
| Completed tasks frozen | Evidence is now addable and removable after completion; re-saves post `completed`, not `draft`. |
| No class schedule or room numbers | Added to the school page for guardians and students. Rooms fall back to the class `location` — meetings almost never carry one. |
| School page a wall of text | All sections collapsed by default via the shared `SchoolSection`. |
| Training progress totals too low | Sentry OPTIO-BACKEND-5T — unpaged read truncating at 1000 of 2398 rows. All reads paged. |
| Coordinator blocked from enrolling her children | Sentry OPTIO-BACKEND-6P — role check read one column. |
| Org parents blocked from observer management | Same bug, 7 copies across `observer/family.py` and `parent_management.py`. |
| Observer→parent promotion broken for org families | 3 failures including a write of `role='parent'` onto an org member, which the DB accepts and which corrupts the row quietly. |
| 152 families on a stale task list | Resynced in place. Completions 126 → 133, evidence 164 → 169, zero orphans — families were submitting throughout and nothing was lost. |
| Duplicate Sarie Larson account | Deleted; never signed in, never confirmed, no records. |
