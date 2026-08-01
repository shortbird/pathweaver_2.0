# Portfolio & Evidence Privacy Audit

**Date**: 2026-07-31
**Scope**: Every path by which a student's portfolio, diploma, transcript, evidence, or learning moments can be read by someone other than the student.
**Policy being audited against (new decision)**: *everything is private by default, and parents have full control over who can see their kid's learning.*

---

## Verdict

The platform has a genuine private-by-default mechanism, but it only covers **one** of the seven surfaces that expose student work, and the control it offers belongs to the **student**, not the parent.

Three things are true today:

1. **Two endpoints publish a student's records to the open internet with no privacy check of any kind** — knowing a user's UUID is sufficient. One of them (`learning-events/public`) also ignores the per-item "confidential" flag that every other reader respects.
2. **A parent cannot make their child's portfolio private.** The only privacy write endpoint rejects any caller who is not the student. Parents can only approve or deny a request the *student* initiates; they cannot initiate, and they cannot revoke after approving.
3. **The privacy model is binary — private, or public to the entire world.** There is no "visible to these specific people" tier. A parent who wants grandma to see the portfolio has only one lever: publish it to everyone. The authorized-viewer path that would avoid this (observer portfolio view) is dead code that raises `TypeError` on every call.

The `showcase_consent` subsystem (marketing) is the exception and is well built: explicit tiered consent, recorded against a signed document, parent-visible, parent-revocable, with a history table and a take-down queue. **That is the model the rest of the platform should be rebuilt onto.**

---

## What already works

`backend/migrations/20260102_ferpa_private_by_default.sql` established the core:

- `diplomas.is_public` defaults to `FALSE` (new records only — pre-existing public rows were deliberately left public, see P6).
- Consent columns on `diplomas`: `public_consent_given`, `..._at`, `..._by`, `pending_parent_approval`, `parent_approval_denied`, `..._at`.
- `public_visibility_requests` table with RLS, one-pending-per-student unique index, and a 30-day cooldown after denial.
- Minors must route through a parent: `PUT /api/portfolio/user/<id>/privacy` creates an approval request instead of publishing (`backend/routes/portfolio.py:389-454`), and the parent responds via `/api/parental-consent/visibility-approval/<id>/respond`.
- The diploma read path enforces the gate: `portfolio_service.get_diploma_data` returns `{'error': ...}` unless the viewer is the owner (`backend/services/portfolio_service.py:1019`).
- Evidence reports (`evidence_report_configs`) carry `requires_parent_approval` and refuse to render while pending or denied (`backend/services/evidence_report_service.py:292-296`).
- Feed share tokens look public but are not: `/api/public/feed/<token>` resolves the token and *then* requires the caller to hold an observer/parent/advisor relationship to the student (`backend/routes/observer/sharing.py:196-208`). Good design.
- The observer feed and activity feed both filter `is_confidential=false` and `is_private=false` throughout.

---

## Findings

Ordered by severity. Severity reflects both the exposure and the distance from the new policy.

---

### P1 — Public transcript endpoint has no authentication and no privacy check

**`backend/routes/public.py:215`** — `GET /api/public/transcript/<user_id>`

No auth, no `is_public` check, no parent consent check. The only gate is "a `transcript_overrides` row exists for this user" — which an admin creates as part of generating a transcript, not as a publication decision.

Returns (lines 388-412): first name, last name, **date of birth**, enrollment date, organization name, every earned/class/transfer/planned credit, course names, and `transcript_url` links to uploaded transcript documents from prior schools.

The URL is handed out as a shareable link from the admin transcript generator (`frontend/src/pages/admin/TranscriptGeneratorPage.jsx:564`) and the route is unauthenticated by design (`frontend/src/services/api.js:310` explicitly whitelists `/public/transcript/` from the auth redirect). So this is intentional-but-unbounded: intended for "send this to a college", actually readable by anyone who has or guesses the UUID, forever, with no way for a parent to switch it off.

DOB plus full name plus school is a child-identity-theft payload, and it is the single most sensitive field on the endpoint.

**Required**: gate behind an explicit, revocable, parent-controlled grant (a signed short-lived token per recipient, like `evidence_report_configs.access_token` but with expiry), and drop `date_of_birth` from the payload unless the recipient specifically needs it.

---

### P2 — Public learning-events endpoint exposes every learning moment, including ones marked confidential

**`backend/routes/learning_events/evidence.py:251`** — `GET /api/users/<user_id>/learning-events/public`
**`backend/services/learning_events_service.py:677-701`**

```python
events_response = supabase.table('learning_events') \
    .select('*') \
    .eq('user_id', user_id) \
    .order('created_at', desc=True) \
    .limit(limit) \
    .execute()
```

No auth. No `is_public` check against `diplomas`. And critically **no `is_confidential` filter** — `select('*')` with only a `user_id` predicate. Every other reader of this table filters it (`backend/routes/observer/feed.py:294`, `backend/routes/observer/learning_moments.py:62`, `backend/routes/observer/activity.py:96`).

It then fetches all `learning_event_evidence_blocks` for each event (line 696), again unfiltered — so file URLs, photos, and descriptions of moments the student or parent explicitly marked private are returned to an anonymous caller.

This is worse than P1: the student *used the privacy control the product gave them*, and this endpoint ignores it.

Called from `frontend/src/pages/DiplomaPage.jsx:656` when viewing a diploma the caller doesn't own. Fixing it means gating on the same rule as the diploma itself.

**Required**: require the diploma gate to pass before returning anything, and filter `is_confidential=false` / `is_private=false` at minimum. Under the new policy this endpoint should not exist in unauthenticated form at all.

---

### P3 — Parents cannot set their child's privacy; they can only answer a question the child asks

**`backend/routes/portfolio.py:329-350`**

```python
if authenticated_user_id != user_id:
    return error_response(code='UNAUTHORIZED',
        message='Can only update your own privacy settings', status=403)
```

This is the only write path for portfolio visibility. Consequences under the new policy:

- A parent **cannot** make a public portfolio private. Not for a dependent, not for a linked 13+ student. If a parent changes their mind after approving, there is no endpoint that lets them undo it — `make_portfolio_private` is unreachable for them.
- A parent **cannot** proactively publish or configure visibility on behalf of a child who hasn't asked.
- The only workaround is masquerade / "act as dependent" (`effectiveUser` in `frontend/src/pages/DiplomaPage.jsx`), which works only for dependents (`is_dependent=true`), not for linked 13+ students, and is a superadmin-flavoured mechanism being used as a parenting tool.

The denial path is also asymmetric in the wrong direction: a denial imposes a 30-day cooldown on the child (`portfolio_service.py:866-883`), but an approval is permanent and unrevocable.

**Required**: a parent-scoped privacy endpoint authorized by the same relationship check already written for curation (`_can_curate_for`, `backend/routes/portfolio.py:144-190`), plus parent revocation of a previously granted consent.

---

### P4 — Any student with no date of birth on file is treated as an adult and can self-publish

**`backend/services/portfolio_service.py:612-641`**

```python
if user_data.get('is_dependent') is True:
    return True
dob = user_data.get('date_of_birth')
if not dob:
    return False   # <-- "no DOB" is read as "adult"
```

`date_of_birth` is **optional at registration** (`backend/routes/auth/registration.py:132`, comment: `# Optional`). `is_dependent` is set only by the dependent-creation flow (`backend/routes/dependents.py:583`). So a 14-year-old who self-registers with no DOB and no parent link:

- `check_is_minor` → `False`
- `PUT /privacy` takes the `NOT A MINOR - can consent directly` branch (`backend/routes/portfolio.py:465`)
- portfolio goes world-public immediately, no parent ever involved.

The same fail-open exists in SQL: `is_minor()` in the FERPA migration returns `FALSE` when `v_dob IS NULL`, with the comment "they would have given consent at registration."

**Required**: invert the default — unknown age means minor, means parent-gated. Under a policy where parents have full control, "we don't know how old this child is" must never resolve to "let them publish."

---

### P5 — Students can grant strangers full access to their feed with no parent approval

**`backend/routes/observer/student_invitations.py:24-84`** — `POST /api/observers/generate-link`

A student (any age, including a dependent minor) mints a link valid for 7 days. Anyone who opens it and registers becomes a linked observer with access to that student's activity feed, evidence blocks, and learning moments.

`backend/routes/observer/acceptance.py:115` (accept) **notifies** parents by email and in-app after the fact (lines 327-403) but does not require their approval. The rate limit is 10 links/hour.

This is the largest practical hole in "parents control who sees their kid's learning": the child holds an unlimited, self-service grant power over exactly that.

**Required**: for any minor (and, per P4, any student of unknown age), student-initiated observer links must land in a parent approval queue before the link becomes usable — or be removed in favour of parent-initiated invites only. The mobile app already has a parent-side invite flow (`frontend-v2/src/components/parent/InviteObserverSheet.tsx`) that could become the only path.

---

### P6 — Portfolio summary endpoint has no authorization check (IDOR)

**`backend/routes/portfolio.py:52-82`** — `GET /api/portfolio/user/<user_id>`

```python
@require_auth
def get_user_portfolio(auth_user_id: str, user_id: str):
    result = portfolio_service.get_portfolio_summary(user_id)
```

`auth_user_id` is never compared to `user_id`. Any authenticated user — any student on the platform — can read any other user's portfolio summary: name, portfolio slug, XP by pillar, quests completed, and the full **curated portfolio picks list including evidence text snippets** (`get_portfolio_summary` → `get_curated_completions`, `portfolio_service.py:941`).

The `is_public` flag is never consulted on this path.

Compounding it, the exception handler at lines 71-82 fabricates `'is_public': True` and a public portfolio URL when anything fails — as does `_create_diploma_with_slug`'s fallback (`portfolio_service.py:111-122`). Every hardcoded fallback in this file defaults to public, which is backwards for a private-by-default product.

**Required**: ownership-or-relationship check on the endpoint; change every fallback literal to `is_public: False`.

---

### P7 — Parent and advisor dashboards read a table that does not exist, and always report "private"

**`backend/routes/parent/child_overview.py:681`** and **`backend/routes/advisor/student_overview.py:523`**

```python
visibility_status = {'is_public': False, 'pending_parent_approval': False,
                     'parent_approval_denied': False}
try:
    visibility_response = supabase.table('user_portfolio_settings').select(...)
    ...
except Exception:
    logger.debug("intentional swallow", exc_info=True)
```

`user_portfolio_settings` **has no migration anywhere in the repository** — grep across `supabase/migrations/` and `backend/migrations/` returns nothing. The real table is `diplomas`. So the query always throws, the exception is always swallowed, and the hardcoded `is_public: False` default is always what the parent sees.

**A parent looking at their child's overview page is told the portfolio is private. It may be public.** This is the most directly misleading thing in the audit: the parent-facing privacy indicator is a constant, and it happens to be the reassuring value.

**Required**: point both call sites at `diplomas` (or better, at `PortfolioService.get_visibility_status`), and delete the swallow — a failure to read a privacy state must not silently render as "private."

---

### P8 — There is no way to show a private portfolio to an authorized person; the code that would has been broken since it was written

**`backend/routes/observer/portfolio.py:20-53`**

```python
@bp.route('/api/observers/student/<student_id>/portfolio', methods=['GET'])
@require_auth
@validate_uuid_param('student_id')
def get_student_portfolio_for_observer(student_id):
    ...
    from routes.portfolio import get_diploma_data
    portfolio_data = get_diploma_data(student_id)
```

Two independent fatal bugs:

1. `require_auth` calls `f(user_id, *args, **kwargs)` (`backend/utils/auth/decorators.py:108`). The function takes only `student_id`, and Flask also passes `student_id` as a keyword from the URL rule → `TypeError: got multiple values for argument 'student_id'` on every request.
2. `routes.portfolio` has no `get_diploma_data` — that name lives on `PortfolioService`. The import would raise `ImportError` if it were ever reached.

So the one endpoint designed to serve a portfolio to a verified observer has never worked.

The architectural consequence is the important part. `get_diploma_data` grants access only to the owner (`portfolio_service.py:1019`), so **a parent, advisor, or observer cannot view a private portfolio at all**. The advisor UI links to `/public/diploma/<studentId>` (`frontend/src/components/advisor/AdvisorStudentOverviewContent.jsx:56`), which 404s for every private student.

The product therefore pushes families toward the exact outcome the new policy forbids: to let *anyone* see the portfolio, you must let *everyone* see it.

**Required**: this is the central build item, not a bug fix. See "The missing tier" below.

---

### P9 — LTI evidence tokens never expire and escalate from one quest to the whole diploma

**`backend/services/lti_service.py:225-236`**, consumed at **`backend/routes/portfolio.py:104-113`**

`issue_evidence_token(user_id, quest_id)` mints an HMAC-signed token with `iat` but **no `exp`** — the docstring states this is deliberate ("gradebook links must keep working for late grading").

When that token is presented to `/api/portfolio/diploma/<user_id>?lti_token=...`, `get_diploma_data(..., lti_authorized=True)` **bypasses the privacy gate entirely and returns the full diploma** — every quest, all evidence, all XP — not just the quest the token was scoped to.

There is no revocation list. A token leaked out of a Canvas gradebook is permanent unauthenticated access to that student's entire portfolio, surviving the student or parent switching the portfolio to private.

**Required**: add an expiry (a semester, renewable), and scope the diploma response to `claims['qid']` so a quest token yields quest evidence. `/lti/evidence` already does the quest-scoped thing correctly — the diploma path is the one that over-delivers.

---

### P10 — Students can mint share links for their own posts without parent involvement

**`backend/routes/observer/sharing.py:76-158`**

`_check_student_access` returns `True` immediately when `user_id == student_id`, so a student can create a share token for their own completion or learning moment.

Severity is low because the *view* side is properly gated — `/api/public/feed/<token>` requires the caller to already hold a relationship (line 198), and a stranger gets a polite denial. The token is an invitation to an existing observer, not a public URL.

Still worth listing: under "parents control who sees this," a child minting share links is a parent-visibility gap even when the link is inert to strangers. Confidential completions are already blocked (line 102), but learning events are not checked for `is_confidential` on this path.

---

## The missing tier

Every finding above is a symptom of one structural gap: **visibility is a boolean.**

```
is_public = false  →  only the student
is_public = true   →  the entire internet, unauthenticated, permanently
```

The new policy needs three states, with the parent owning the transitions:

| State | Who sees it | Who controls it |
|-------|-------------|-----------------|
| Private (default) | student only | — |
| Shared | named people: parents, advisors, observers, a specific college, grandma | **parent** (student may request) |
| Public | anyone with the link | **parent**, explicit, revocable, expiring |

The middle row does not exist. Building it makes P1, P2, P8 and P9 tractable instead of a series of patches, because each of those endpoints becomes "check the grant" rather than "check a boolean or don't check at all."

The grant record should look like `showcase_consent` — the one subsystem in this codebase that already gets consent right:

- explicit per-capability flags rather than one switch (`repositories/showcase_repository.py:31`)
- recorded against a signed document with a date
- an audit trail table (`showcase_consent_history`)
- parent-visible and **parent-revocable** (`routes/showcase.py:309`, `source='parent_self_revoke'`)
- revocation drives a take-down queue for anything already published (`routes/showcase.py:166`)

---

## Recommended sequence

**Immediately (exposure, no product decisions needed)**

1. P2 — add the diploma gate + `is_confidential`/`is_private` filters to `learning-events/public`, or take the route out of service.
2. P1 — put `/api/public/transcript/<user_id>` behind a token; drop `date_of_birth`.
3. P6 — add the ownership check to `GET /api/portfolio/user/<user_id>`; flip every `is_public: True` fallback literal to `False`.
4. P7 — repoint the parent/advisor dashboards at `diplomas`; stop swallowing the error.

**Next (parent control)**

5. P3 — parent-scoped privacy write + revocation, authorized by `_can_curate_for`.
6. P4 — unknown age ⇒ minor, in both `check_is_minor` and the `is_minor()` SQL function.
7. P5 — route student-generated observer links through parent approval.

**Then (the tier)**

8. P8 — grant-based visibility; fix or delete `observer/portfolio.py`; give parents, advisors, and observers a real path to a private portfolio.
9. P9 — expire LTI evidence tokens; scope the diploma response to the token's quest.

**Data migration, once the model exists**

The 2026-01-02 migration deliberately left pre-existing public portfolios public ("This only affects NEW records"). Under the new policy those rows are legacy grants that no parent ever made. They need to be re-consented or reset to private — with notice to the affected families, not silently.

---

## Files touched by this audit

| File | Relevance |
|------|-----------|
| `backend/routes/portfolio.py` | privacy read/write endpoints, curation, IDOR (P3, P6) |
| `backend/services/portfolio_service.py` | diploma gate, minor check, consent writes (P4, P6) |
| `backend/routes/public.py` | unauthenticated transcript (P1) |
| `backend/routes/learning_events/evidence.py` | unauthenticated learning events (P2) |
| `backend/services/learning_events_service.py` | unfiltered query (P2) |
| `backend/routes/parental_consent/visibility.py` | parent approve/deny flow |
| `backend/routes/observer/student_invitations.py` | student-minted observer links (P5) |
| `backend/routes/observer/acceptance.py` | notify-only, no approval (P5) |
| `backend/routes/observer/portfolio.py` | broken authorized-viewer path (P8) |
| `backend/routes/observer/sharing.py` | share tokens — correctly gated (P10) |
| `backend/routes/parent/child_overview.py` | phantom table (P7) |
| `backend/routes/advisor/student_overview.py` | phantom table (P7) |
| `backend/services/lti_service.py` | non-expiring evidence tokens (P9) |
| `backend/repositories/showcase_repository.py` | the consent model to copy |
| `backend/migrations/20260102_ferpa_private_by_default.sql` | current baseline |
