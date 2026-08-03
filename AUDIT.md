# External Security & Correctness Audit — Optio Platform (pathweaver_2.0)

**Date:** 2026-08-01
**Auditor:** External review. No prior involvement with this codebase.
**Commit audited:** `40362bb` ("Make student work private by default, with parents holding the controls")
**Verification:** Findings were checked against the **live production database and API**
(`vvfgxcykxjybtvpfzwyx`) using a Supabase management token supplied by the owner, plus the
project's own public anon key. Claims marked *Verified live* were reproduced against
production. All probes were read-only; no writes, deletes, or destructive tests were run.

---

## 1. Summary

The application-layer security of this codebase is, on the whole, better than average: the
Flask backend does not rely on PostgREST RLS, it re-derives authorization server-side on
essentially every route, CSRF is genuinely enforced on cookie-authenticated mutations, tokens
are never persisted to `localStorage`, and the recent private-by-default portfolio work is
carefully reasoned and correctly fails closed. I confirmed that the sensitive core tables
(`users`, `quest_task_completions`, `learning_events`, `households`, `sis_invoices`,
`parent_student_links`, `advisor_notes`, `bug_reports`) return **zero rows** to the public anon
key — RLS is doing its job there.

That makes the exceptions more dangerous, not less, because the system is trusted as if it were
uniformly locked down. **Three critical data-exposure holes are live right now.** A live Stripe
**secret** key belonging to a paying customer organization is readable by anyone on the internet
with no login at all, because it is stored in a JSONB column on a table whose RLS policy filters
*rows* but cannot filter *columns*. A 718-row table containing per-student minor-status and
consent flags has RLS disabled entirely and is granted `SELECT`/`DELETE`/`TRUNCATE` to the
anonymous role. And every piece of student evidence — 1,574 objects including photos and videos
of minors — sits in public storage buckets served to unauthenticated `GET` requests, which
silently defeats the private-by-default portfolio work at the file layer.

None of these require an exploit chain or unusual sequence; each is a single HTTP request. I
would not put real student data on this system until findings C1–C3 and H1 are closed, and I
would treat the exposed Stripe key as already compromised and rotate it.

---

## 2. Findings

### CRITICAL

---

#### C1. A live Stripe secret key is readable by anyone on the internet, unauthenticated

**Location:**
- Policy `organizations_select` on `public.organizations` (live in prod; **not present in any
  migration in this repo** — see L2)
- Secret written: `backend/routes/admin/organization_management.py:233-240`
- Secret read: `backend/routes/icreate_registration.py:577-578`,
  `backend/services/sis_billing_service.py:844`,
  `backend/services/sis_enrollment_waitlist_service.py:621`

**Description.** Per-organization Stripe **secret** keys (`sk_live_…` / `rk_live_…`, validated
by the regex at `organization_management.py:238`) are stored in the JSONB column
`organizations.feature_flags` under `icreate_registration.stripe_secret_key`. The live RLS
policy on `organizations` is:

```
organizations_select  FOR SELECT  TO public
USING ( is_active = true
        OR (is_org_admin_user(auth.uid()) AND id = <caller's org>)
        OR is_superadmin(auth.uid()) )
```

Postgres RLS is **row-level only — it cannot restrict columns.** Every active organization row
is therefore returned to the anonymous role in full, `feature_flags` included. The anon key is
public by design and ships in the deployed JS bundle (`frontend/src/services/supabaseClient.js:9`).

**Concrete failure mode.** An unauthenticated attacker who reads the anon key out of the
production bundle issues:

```
GET /rest/v1/organizations?select=feature_flags&id=eq.<org>
apikey: <anon key from the JS bundle>
```

and receives the organization's full config blob including its Stripe secret key.

*Verified live:* this request returns 1 row for the **iCreate** organization (296 users) with
`feature_flags` populated and the `icreate_registration` group containing a credential-shaped
field. I did not retrieve or record the key value.

**Who gets hurt.** iCreate. A Stripe secret key authorizes the full Stripe API on that account:
reading every customer record, name, email, and payment history; issuing arbitrary charges and
refunds; and creating/modifying payment intents. The families paying registration fees through
that funnel are the ultimate victims. The same mechanism exposes Gryffin Learning Center's
`sis_settings.calendar_feed_token`, which is the *sole* credential protecting that school's
`/calendar/<org_id>.ics` feed (`backend/routes/sis/events.py:252-270`).

**Severity: Critical.** Exploitable now, unauthenticated, single request.

> Treat the iCreate Stripe key as compromised: rotate it in Stripe first, then move it out of
> `feature_flags` into a column or table that is never exposed to the Data API.

---

#### C2. `portfolio_visibility_reset_20260801` — RLS disabled, 718 rows of minor/consent data readable and deletable by anyone

**Location:** `backend/migrations/20260801_private_by_default_parent_control.sql:210-218`
(`CREATE TABLE` with no `ENABLE ROW LEVEL SECURITY`)

> **Correction (2026-08-01, post-remediation):** the first version of this report
> said this table was "not present in any migration file in this repo." That was
> wrong — it is created by the migration cited above, in `backend/migrations/`
> rather than `supabase/migrations/`. The error came from checking only the
> `supabase/migrations/` tree. The static guard added during remediation
> (`backend/tests/test_secret_exposure_guard.py`) found the real source
> immediately. The exposure itself, and its severity, are unchanged.

**Description.** The table has `relrowsecurity = false` and holds grants
`SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER` for the `anon` role — inherited
from the blanket `ALTER DEFAULT PRIVILEGES … GRANT ALL ON TABLES TO anon, authenticated`
established by `supabase/migrations/20260527_restore_default_data_api_grants.sql:22-23`. That
migration's own comment states "RLS remains the actual access control" — which is exactly the
assumption this table breaks. Columns: `user_id`, `portfolio_slug`, `was_public`, `had_consent`,
`was_minor`, `reset_at`, `notified_at`.

**Concrete failure mode.** With the public anon key and no login:

```
GET /rest/v1/portfolio_visibility_reset_20260801?select=*
→ HTTP 200, content-range: 0-717/718
```

*Verified live:* returned all 718 rows, e.g.
`{"user_id":"082b5da5-…","portfolio_slug":"alice-johnson-1","was_public":true,"had_consent":false,"was_minor":true}`.

**Who gets hurt.** 718 students. The disclosure is a per-child roster of *which named students
are minors*, *which had no consent on file*, and the stable `portfolio_slug` that maps each
child to their portfolio URL — the precise dataset the 2026-08-01 privacy work was created to
protect. Worse, the same grants allow `DELETE`/`TRUNCATE`: an anonymous request can destroy the
only record of what each family's visibility setting was before the reset, eliminating both the
rollback path and the compliance evidence that the reset happened.

*Corroborated by Supabase's own linter:* `rls_disabled_in_public` (ERROR).

**Severity: Critical.** Exploitable now, unauthenticated, and destructive.

---

#### C3. `GET /api/auth/me` hands the organization's full secret config to every member, including students

**Location:** `backend/routes/auth/login/core.py:113-119` (selection),
`backend/routes/auth/login/core.py:159` (`return jsonify(response_data)`)

**Description.** `/me` selects `feature_flags` as part of the organization payload and attaches
it verbatim to the response:

```python
org_data = admin_client.table('organizations')\
    .select('id, name, slug, branding_config, quest_visibility_policy, feature_flags')\
    …
response_data['organization'] = org_data.data
```

No field is stripped. This is a **second, independent** path to the C1 secret — fixing the RLS
policy does not fix this one, and vice versa. It runs on the service-role client, so RLS is
bypassed entirely.

**Concrete failure mode.** Any of iCreate's 296 users — a 12-year-old student, a parent, a
revoked observer — logs in, opens DevTools → Network → `/api/auth/me`, and reads the school's
Stripe secret key out of the JSON response. No tooling, no exploit, no privilege escalation.

**Who gets hurt.** Same as C1. The blast radius is larger in one respect: it needs only a valid
login, and every member of every org with anything secret in `feature_flags` is a potential
leaker (or victim of a leak, if their session is captured).

**Severity: Critical.** Exploitable now by any authenticated org member.

---

### HIGH

---

#### H1. All student evidence media is in public storage buckets, served to unauthenticated requests

**Location:** `backend/services/media_upload_service.py:365-366`, `:502-503`, `:672-673`,
`:332`, `:786` (all use `get_public_url`); bucket flags in `storage.buckets`

**Description.** *Verified live:* the following buckets have `public = true`:
`quest-evidence` (**1,574 objects**), `user-uploads` (346), `user-photos` (243),
`org-documents` (10), plus `family-images`, `staff-photos`, `curriculum`, `class-images` and
others. Only `bug-reports` and `docs-screenshots` are private. Every evidence URL the platform
hands out is a permanent, unexpiring `/storage/v1/object/public/…` link.

The codebase clearly knows how to do this correctly — `backend/routes/sis/secure_documents.py:29`
uses a private `sis-secure-documents` bucket with 3600-second signed URLs
(`secure_documents.py:229-230`), and `bug-reports` is explicitly created with `public=false`
(`supabase/migrations/20260601_create_bug_reports.sql:55-63`). Evidence simply did not get the
same treatment.

**Concrete failure mode.** *Verified live:* an unauthenticated `GET` on a
`quest-evidence` object URL — no `apikey` header, no cookie, no token — returns **HTTP 200**.

The result is that `utils/portfolio_access.py` gates the *metadata* while the *media itself* is
ungated. An observer whose link was revoked, a parent who lost access, a school that left the
platform, or anyone who received a shared link, a forwarded email, a browser-history export, or
a Referer header retains permanent, unrevocable access to that child's photos, videos and
documents. Flipping a portfolio to private does not — and cannot — take the files down.

**Who gets hurt.** Every student who has ever submitted evidence. This is a FERPA/COPPA exposure
of minors' images and schoolwork, and it directly contradicts the guarantee the 2026-08-01
privacy work makes to families.

**Severity: High.** Requires possession of a URL, but URLs leak by design (they are shared with
observers and embedded in emails), and the exposure is permanent and unrevocable.

---

#### H2. Masquerade and acting-as sessions are immortal and survive logout

**Location:** `backend/utils/session_manager.py:768-798` (`_refresh_impersonation_session`),
`backend/routes/auth/login/tokens.py:60-83` (logout-replay check),
`backend/utils/session_manager.py:165-196` (`is_session_expired`)

**Description.** Three independent controls that bound a normal session all fail to bind an
impersonation session:

1. **Logout does not revoke it.** `refresh_session` returns a 4-tuple whose last element is
   `token_issued_at`. For a normal refresh this is the *original* token's `iat`
   (`session_manager.py:826-832`), so `tokens.py:77`'s `token_issued_at < last_logout_at`
   check works. For an impersonation refresh, `_refresh_impersonation_session` returns
   `datetime.now(timezone.utc)` (`session_manager.py:785`, `:796`). The comparison then reads
   "is *now* before the logout timestamp" — always false. The logout check silently never fires.
2. **The absolute session timeout never trips.** Each refresh mints a new token with a fresh
   `iat` (`:783`, `:794`), and `is_session_expired` measures age from `iat`. The clock resets
   on every refresh, indefinitely.
3. **Authorization is never re-checked.** `_refresh_impersonation_session` re-mints a masquerade
   token from `admin_id` and `masquerade_as` with no lookup confirming the admin is still a
   superadmin — nor, for acting-as, that the parent still manages that dependent.

Both refresh tokens are returned in the response body
(`backend/routes/admin/masquerade.py:90-92`; `backend/routes/dependents.py:860-867`).

**Concrete failure mode.** A superadmin masquerades as a student once. The
`masquerade_refresh_token` in that response is a permanent, unrevocable credential for that
student's account: it can be refreshed forever, logging out does not kill it, the 30-day session
ceiling never applies, and removing the admin's superadmin role does not stop it. The same holds
for a parent's acting-as token after a custody change or a revoked parent-student link.

**Who gets hurt.** Any student who has ever been masqueraded as or acted-as. A departing
administrator, or anyone who captures one of these tokens, keeps indefinite full access to that
child's account with no way for the platform to cut it off short of rotating `JWT_SECRET_KEY`
for every user.

**Severity: High.**

---

#### H4. Student evidence is readable over the public anon key, under the pre-2026-08-01 privacy rule

**Found during remediation, not in the original pass.** The first sweep spot-checked 16
hand-picked tables and found them correctly locked. The exposure scan added as part of the fix
(`scripts/audit_db_exposure.py`) probes *all 210* tables with the real anon key, and immediately
surfaced this. Recording it here because it says something about the original method: manual
table selection is exactly the kind of sampling that misses things.

**Location:** live RLS policies `evidence_document_blocks_select`,
`user_task_evidence_documents_select`, `user_skill_xp_select`, `diplomas_select`
(none of them defined in any migration in this repo — see L2)

**Description.** All four policies gate on `diplomas.is_public = true`:

```
user_task_evidence_documents_select:
  user_id = auth.uid()
  OR (status = 'completed' AND EXISTS (SELECT 1 FROM diplomas
                                       WHERE diplomas.user_id = ... AND is_public = true))
```

That is the privacy model as it existed *before* 2026-08-01. The private-by-default work moved
the real decision into `backend/utils/portfolio_access.py`, where `can_view_portfolio` requires a
consent record, treats unknown age as minor, and gives parents revocation. The RLS policies were
never updated to match, so the Data API still answers the old, weaker question — and it answers
it for unauthenticated callers.

**Concrete failure mode.** *Verified live* with the public anon key, no login:

| table | rows returned to `anon` | of total |
|---|---|---|
| `evidence_document_blocks` | 239 | 1,545 |
| `user_task_evidence_documents` | 211 | 1,121 |
| `user_skill_xp` | 38 | 1,881 |
| `diplomas` | 4 | 731 |

`evidence_document_blocks` includes the `content` column — the student's actual submitted work.
`diplomas` exposes `portfolio_slug`, `public_consent_given`, and `pending_parent_approval`.

**Who gets hurt.** Today, the 4 students whose diplomas are still `is_public = true` after the
reset — their evidence content is world-readable with no consent check. Structurally, every
student: anything that sets `is_public` (a bug, a legacy row, a future "share" feature, a
restore from the C2 backup table) republishes their work to the internet through a path that
`can_view_portfolio` never sees. The application and the database disagree about who may read
student work, and the database is the one facing the internet.

**Severity: High.** Fix proposed but **not applied**:
`supabase/migrations/PROPOSED_20260802_revoke_data_api_on_student_work.sql` (prefixed so
`supabase db push` ignores it until adopted).

**Investigation result — nothing depends on this access.** Three independent checks:

1. **No client code queries these tables.** Both Supabase clients are built for OAuth only with
   `persistSession: false` (`frontend/src/services/supabaseClient.js:17-26`,
   `frontend-v2/src/services/supabaseClient.ts:11-19`). Grepping both frontends for these table
   names returns only comments.
2. **Realtime cannot depend on them.** The `supabase_realtime` publication is *empty* — zero
   tables published (verified live).
3. **Every product read goes through Flask on the service-role client**, which bypasses RLS.
   The public portfolio is `routes/portfolio.py:21` → `PortfolioService`, whose constructor
   defaults to `get_supabase_admin_client()` (`services/portfolio_service.py:29`).

The corollary is the strongest part: the `user_id = auth.uid()` branches are dead too. The app
issues its own HS256 tokens and never gives the browser a Supabase JWT for data access, so
`auth.uid()` is NULL on every Data API request. The **only** branch of these five policies that
can ever evaluate true is the `is_public` one — which is the exposure itself. The entire policy
set is vestigial: it protects a client-side data path that does not exist.

So the proposed fix is to drop the policies and revoke the grants, matching what
`organization_secrets` and `portfolio_visibility_reset_20260801` already do. The one thing the
repo cannot answer, and the team must: whether any third party (an embed, a partner, a school
dashboard) has been pointed at these tables with the anon key. If so, give it a Flask endpoint
first.

`bounties` (leaks `allowed_student_ids`, `moderation_notes`) and `curriculum_attachments`
(leaks `file_url` for rows with `is_deleted = true`) are the same defect and are noted at the
foot of that migration as separate decisions. Both were taken on 2026-08-03 — see **H6** below.

---

#### H3. `sis_billing_audit` — RLS disabled, anonymously writable audit trail

**Location:** `public.sis_billing_audit`, created by
`supabase/migrations/20260727_billing_processing_fee.sql` with no `ENABLE ROW LEVEL SECURITY`

**Description.** *Verified live:* `relrowsecurity = false`, 0 policies, and grants
`SELECT, INSERT, UPDATE, DELETE, TRUNCATE` to `anon` (again inherited from the blanket default
privileges). Columns: `organization_id`, `invoice_id`, `actor_user_id`, `action`, `detail`
(jsonb), `created_at`. The table is currently empty.

**Concrete failure mode.** Once billing audit rows start being written, anyone with the public
anon key can read every organization's billing action history, insert forged entries attributing
actions to arbitrary `actor_user_id`s, or `TRUNCATE` the table to erase the trail of a real
billing dispute. A financial audit log that any anonymous party can rewrite provides negative
assurance — it is worse than having none, because it will be relied upon.

*Corroborated by Supabase's linter:* `rls_disabled_in_public` (ERROR).

**Severity: High.** Currently zero rows, which is the only thing keeping it out of Critical.

---

### MEDIUM

---

#### M1. `POST /api/tasks/<id>/finalize` grants diploma credit repeatedly; the guard is inverted

**Location:** `backend/routes/tasks/completion.py:403-414` (guard), `:442-476` (XP grant),
`:479-482` (status write)

**Description.** The state guard is written backwards:

```python
if completion_data['diploma_status'] not in ('ready_for_credit', 'approved'):
    if completion_data['diploma_status'] in ('finalized', 'approved'):
        return ALREADY_FINALIZED
    return NOT_READY
```

`'approved'` appears in *both* the allow-list and the already-finalized list. Because the outer
condition passes for `'approved'`, the inner `ALREADY_FINALIZED` branch is unreachable for it.
The handler then adds `subject_xp` to `user_subject_xp.xp_amount` (`:454-464`) and writes
`diploma_status = 'approved'` (`:480`) — putting the row right back into the accepted state.
There is no idempotency decorator on this route (unlike `/complete` at `:31`).

**Concrete failure mode.** A student whose completion sits in `'ready_for_credit'` or
`'approved'` calls the endpoint N times and receives N × the subject XP toward their diploma
credits, self-service, with no reviewer involvement. `user_subject_xp` drives the transcript at
2000 XP per credit (`backend/routes/admin/poe.py:21`), so this inflates the academic record
backing an accredited transcript.

**Reachability.** *Verified live:* the current distribution of `quest_task_completions.diploma_status`
is `none` (798), `finalized` (450), `grow_this` (29), `pending_org_approval` (18) — **no rows in
either accepting state**. No code path in the current codebase writes `'ready_for_credit'`
(the only remaining references are the two migration `CHECK` constraints and this guard), and
`'approved'` is written *only by this handler itself*. The endpoint is therefore live but
currently unreachable dead code — a loaded gun rather than a fired one. It arms itself the moment
any row reaches either state, including via a data fix or a reviewer-flow change.

**Severity: Medium** (would be Critical if reachable).

---

#### M2. `/api/uploads/finalize` performs no authorization on the caller-supplied upload context

**Location:** `backend/routes/uploads.py:196-234`;
invariant documented at `backend/services/media_upload_service.py:541-566`

**Description.** `finalize_upload` defends itself by checking that `context_id` appears in
`storage_path`, and its comment states the reason this is sufficient:

> "The route handler has already authorized the caller for this context_id (task ownership,
> verify_parent_access, verify_advisor_access, event ownership, etc.), so tying the path to
> context_id is what prevents a client from finalizing someone else's upload."

The `/uploads/finalize` route does no such thing. It takes `storage_path`, `bucket`,
`context_type` and `context_id` straight from the JSON body (`uploads.py:205-212`) behind a bare
`@require_auth`, with `context_id` defaulting to `'generic'`. Because the caller controls *both*
`context_id` and `storage_path`, the service's path check is trivially satisfiable — pass any
segment of the target path as `context_id`.

**Concrete failure mode.** An authenticated user submits an arbitrary `bucket` +
`storage_path` and receives back that object's URL, size, content type, and media metadata, plus
triggers server-side video post-processing on it. The documented authorization invariant is
simply not upheld by this caller.

**Mitigating factor.** The evidence buckets are already public (H1), so the returned URL grants
nothing the URL-holder did not already have — this finding becomes materially worse the moment
H1 is fixed by making those buckets private. Fix them together.

**Severity: Medium.**

---

#### M3. Device-fingerprint token binding is inert

**Location:** `backend/utils/session_manager.py:132-163`

**Description.** `_check_device_fingerprint` computes the fingerprint, compares it, logs a
warning on mismatch, and then `return True` on every path (`:161`, `:163`). Tokens embed a `dfp`
claim (`:205`, `:218`) and every verifier calls the check (`:298`, `:313`, `:332`, `:347`), so
the mechanism looks active in code review and in the token payload.

**Concrete failure mode.** A stolen access or refresh token replays successfully from any device
or user agent. The risk is not the missing control itself — it is documented as "Phase 1: log
only" — but that the surrounding code describes it as "Device fingerprint for token binding"
(`:205`), which invites a reviewer to credit the system with a defense it does not have.

**Severity: Medium** (accurately: a Low-impact gap with a Medium-impact chance of being
mis-assessed as present).

---

#### M4. A family of RLS policies references role `'admin'`, which is not a valid role in this system

**Location:** `supabase/migrations/20250919_security_fixes.sql:17-19`, `:28-30`, `:45-55`;
`backend/migrations/20260112_fix_rls_performance_part3.sql:508-509`; and ~15 live policies
including `admin_masquerade_log."Admins can view all masquerade logs"`,
`advisor_student_assignments."Admins can manage advisor assignments"`,
`course_quest_tasks."Only admins can manage course tasks"`,
`ai_quest_review_queue.admin_all_access`

**Description.** `CLAUDE.md` states `admin` is an INVALID role; the six valid roles are
`superadmin`, `org_admin`, `advisor`, `parent`, `student`, `observer`. These policies test
`users.role = 'admin'`, which no row satisfies. *Verified live:* the deployed
`superadmin_can_manage_organizations` policy is
`auth.uid() IN (SELECT id FROM users WHERE role = 'admin' AND email = 'tannerbowman@gmail.com')`
— it can never match, since that account's role is `superadmin`.

**Concrete failure mode.** These policies fail **closed**, so nothing is over-exposed; the
practical effect is that the stated intent ("admins can view the masquerade log") is not
implemented at the database layer. The real risk is the inverse of a security bug: a reader
auditing `pg_policies` sees plausible admin-access rules and concludes the RLS layer is
meaningfully enforcing role separation, when in fact roughly a dozen of those rules are inert
and the only thing actually enforcing anything is the Flask layer.

**Severity: Medium** (correctness/assurance, not exposure).

---

#### M5. TOCTOU on diploma credit approval

**Location:** `backend/routes/credit_dashboard/org_admin_actions.py:82-87` (state read) →
`:174-186` (XP finalize + status write)

**Description.** The handler reads `diploma_status`, validates it is `pending_org_approval`, then
several statements later calls `finalize_subject_xp` and updates the row. There is no
conditional update, row lock, or unique guard tying the write to the state that was read.

**Concrete failure mode.** Two reviewers (or one reviewer double-clicking, a common pattern on a
slow AI-backed review screen) issue concurrent approvals. Both read `pending_org_approval`, both
pass the guard, and both call `finalize_subject_xp` — the student receives double subject XP
toward their diploma credits.

**Note:** the analogous risk on task completion is *not* present. `quest_task_completions`
carries `UNIQUE (user_id, task_id)` (*verified live*), so the check-then-insert at
`backend/routes/tasks/completion.py:107-215` fails at the database on a concurrent duplicate
rather than double-awarding. That constraint is load-bearing and is not declared in any
migration in this repo (see L2).

**Severity: Medium.**

---

#### M6. Production Postgres has outstanding security patches

**Location:** production database instance

**Description.** *Verified live* via Supabase's security advisor: the project runs
`supabase-postgres-17.4.1.074`, flagged `vulnerable_postgres_version` — "has outstanding security
patches available."

**Concrete failure mode.** Depends on the specific CVEs in the pending patch set; unassessable
from here. Applying it is a dashboard-side upgrade.

**Severity: Medium.**

---

### LOW

---

#### L1. Two dependency manifests have diverged; one is documented but unused

**Location:** `requirements.txt` vs `backend/requirements.txt`

**Description.** `render.yaml:35-40` deploys the **root** manifest, and
`.github/workflows/release.yml:45-59` audits the root manifest (with a comment explaining this
was deliberately fixed). `backend/requirements.txt` is now installed by nobody, yet it still
exists and diverges materially: root pins `PyYAML==6.0.1`, `beautifulsoup4==4.12.3`,
`bleach==6.4.0`, `flasgger==0.9.7.1`, `google-generativeai==0.8.5`; backend uses `>=` floors for
all five and omits `Pillow`, `WTForms`, and `StrEnum` entirely.

**Failure mode.** A developer following the `CLAUDE.md` local-setup path installs the stale
file and gets a resolved dependency set that CI never audits and prod never runs — divergent
local behaviour, and a false sense that `pip-audit` covers what is installed. No user impact.

**Severity: Low.**

---

#### L2. The migration history cannot reproduce the deployed schema

**Location:** `supabase/migrations/` (104 files), `backend/migrations/` (74), `migrations/` (6)

**Description.** Three migration directories with no ordering relationship, no ledger, and no
applied-state tracking. Concretely, production contains objects that no file in this repo
creates:

- The `organizations_select` policy (the subject of **C1**) — no migration defines it.
- The `quest_task_completions_user_id_task_id_key` unique constraint — load-bearing for M5,
  declared nowhere.
- `portfolio_visibility_reset_20260801` (**C2**) — 718 rows, created out-of-band.
- RLS is enabled in production on `user_quest_tasks`, `quest_personalization_sessions`, and
  `ai_task_cache`, but no migration in this repo enables it (they were created by
  `backend/migrations/personalized_quests_migration.py`, a Python script).

**Failure mode.** Rebuilding this database from the repo — for disaster recovery, for a Supabase
branch, or for a new environment — produces a schema that is *less secure* than production in at
least three places, and a code review of the migrations cannot tell you what is actually
enforced. This is the root cause of C1 and C2 being invisible to anyone reading only the repo.

**Severity: Low** on its own; it is the reason two Critical findings went unnoticed.

---

#### L3. Blanket default privileges grant `anon` full DML on every future table

**Location:** `supabase/migrations/20260527_restore_default_data_api_grants.sql:22-23`

**Description.** `ALTER DEFAULT PRIVILEGES … GRANT ALL ON TABLES TO anon, authenticated` means
every table created in `public` from then on is `SELECT`/`INSERT`/`UPDATE`/`DELETE`/`TRUNCATE`-able
by the anonymous role unless someone remembers to enable RLS. The migration's rationale (avoiding
per-table `GRANT` boilerplate) is reasonable; the failure mode is that forgetting one
`ENABLE ROW LEVEL SECURITY` line is now a full public read/write hole rather than a 404. C2 and
H3 are both instances of exactly this.

**Failure mode.** Amplifies the severity of any future missed RLS statement from "invisible" to
"world-writable." `GRANT SELECT, INSERT, UPDATE, DELETE` (dropping `TRUNCATE`/`REFERENCES`/`TRIGGER`)
plus a CI check asserting `relrowsecurity` on every `public` table would remove the class.

**Severity: Low** (as a standing hazard).

---

#### L4. 55 silently swallowed exceptions

**Location:** 55 `except …: pass|continue` sites outside tests/scripts. Representative:
`backend/utils/auth/decorators.py:70` (masquerade identity resolution),
`backend/routes/learning_events/attach.py:255,267,278`,
`backend/routes/evidence_documents.py:1352,1360,1369`,
`backend/services/sis_attendance_sweep_service.py:130,140`,
`backend/routes/sis/secure_documents.py:100,142`

**Description.** Many are legitimately defensive (telemetry, Sentry, cache warmers) and
appropriately commented. A subset swallow failures on paths with user-visible consequences —
notably `decorators.py:70`, where a failure to resolve the actual admin identity during
masquerade silently degrades to the masquerade *target*'s privileges, and the three
`attach.py` sites, which drop notification-fanout failures.

**Failure mode.** Failures in these paths are invisible in monitoring; the UI reports success.
No single instance rises above hygiene.

**Severity: Low.**

---

#### L5. Files past the point of safe editing

**Location:** `backend/routes/icreate_registration.py` (2,067 lines),
`backend/services/interest_tracks_service.py` (1,930),
`backend/routes/admin/organization_management.py` (1,709),
`backend/routes/evidence_documents.py` (1,654), `backend/services/base_ai_service.py` (1,595)

**Description.** Nine backend files exceed 1,200 lines; the backend totals ~227k lines across 728
Python files. `icreate_registration.py` in particular carries the payment-verification logic,
the OTP gate, the funnel state machine, and the file-upload path in one module.

**Failure mode.** No user impact today. It is worth noting that C1's secret-handling
(`organization_management.py:233-240`) and the payment path that consumes it
(`icreate_registration.py:577`) live in two of the five largest files in the codebase — the size
is plausibly why the exposure went unnoticed.

**Severity: Low.**

---

## 2b. Remediation status

Fixes for C1, C2 and C3 were written after the report above and live on the same branch. Nothing
has been applied to the production database yet — the migration and the code that reads from the
new table must deploy together, or the iCreate card-payment step breaks.

| Finding | Status | Where |
|---|---|---|
| **C1** Stripe key readable by anon | Fixed, not yet deployed | Secrets moved to `organization_secrets` (RLS on, no policies, grants revoked) by `supabase/migrations/20260801_org_secrets_and_rls_gaps.sql`; column-level `GRANT` on `organizations` stops anon seeing `feature_flags` at all; reads go through `backend/utils/org_secrets.py` |
| **C2** `portfolio_visibility_reset_20260801` | **APPLIED to production 2026-08-01** | RLS + `REVOKE` applied live (anon now gets `42501 permission denied`; all 718 rows intact for the backend). Also added to the migration that creates it, `backend/migrations/20260801_private_by_default_parent_control.sql`, so a rebuild is secure |
| **C3** `/me` leaks `feature_flags` | Fixed, not yet deployed | `backend/routes/auth/login/core.py` strips known credentials; the durable guarantee is that the column no longer holds any |
| **H3** `sis_billing_audit` | **APPLIED to production 2026-08-01** | Same one-line defect as C2, applied in the same statement; also added to `supabase/migrations/20260727_billing_processing_fee.sql` |
| **H4** Student evidence via stale RLS | **APPLIED to production 2026-08-02** | `supabase/migrations/20260802_revoke_data_api_on_student_work.sql`. The five policies are dropped, RLS is forced, anon/authenticated grants revoked. `scripts/audit_db_exposure.py` went from 7 findings to 2 — the 493 rows of student evidence content dropped out; `bounties` and `curriculum_attachments` remain, deliberately, as separate product calls. Rollback captured pre-apply in `ROLLBACK_20260802_revoke_data_api_on_student_work.sql` |
| **H5** Reset accepted a minor's self-consent | **APPLIED to production 2026-08-02** | `supabase/migrations/20260802_reprivatize_self_consented_minors.sql`. Two portfolios re-privatized, recorded in `portfolio_visibility_reset_20260802`; trigger `trg_publication_consent_provenance` installed on `diplomas`. See below |
| **H6** `bounties` + `curriculum_attachments` anon-readable | **Migration written 2026-08-03, NOT yet applied** | `supabase/migrations/20260803_revoke_data_api_on_bounties_and_attachments.sql`, rollback alongside it. These are the two the H4 migration deferred as separate product calls. Until it is applied the daily scan keeps failing on them. See below |
| H1, H2, M1–M6, L1–L5 | Open | Not in the requested scope |

#### H5. The 2026-08-01 reset checked that consent existed, not who gave it

Found 2026-08-02 while verifying H4, and separate from it. The reset recorded in
`portfolio_visibility_reset_20260801` flipped 718 public diplomas private in one statement; all 718
carry `had_consent = false`, so the rule was "public without consent → private" and anyone holding a
consent record was spared. It never asked **who** consented.

`utils/portfolio_access.py::can_manage_privacy` does ask: a student may publish their own work only
if `is_minor()` is false, and `is_minor()` treats a missing `date_of_birth` as a minor by design. So a
minor who ticked the box themselves under the pre-2026-08-01 model produced a consent record the
reset honoured and that the application would refuse to create today.

Of the four diplomas still `is_public` on 2026-08-02:

| user | role | age | consent given by | |
|---|---|---|---|---|
| `5c608928` | org student | 17 | `005602a3`, a linked parent | legitimate |
| `9b716f2b` | platform student | unknown | themselves | **exposed on self-consent** |
| `aa0f3d00` | org student | unknown | themselves | **exposed on self-consent** |
| `ad8e119c` | superadmin | unknown | themselves | exempt — `can_manage_privacy` grants superadmin unconditionally |

Across all diplomas, 4 of the 6 consent records are self-granted.

H4 and H5 need each other. H4's migration stops the anon key reading these tables but does not touch
`is_public`, so on its own the two portfolios stay public to every code path that still trusts the
flag — and several do, e.g. `backend/routes/learning_events/evidence.py:278`.

The fix re-privatizes by predicate rather than by UUID (so it stays correct between review and apply,
and re-running is a no-op), records what it changed in `portfolio_visibility_reset_20260802`, and adds
a `before insert or update` trigger on `diplomas` that refuses publication when the recorded consenter
is the student themselves and that student is a minor. The guard has to be a trigger: every product
write goes through Flask on the service-role client, which bypasses RLS entirely, so RLS cannot
enforce this.

**Deploy order.** Ship the backend code first (it tolerates both storage locations on read),
then apply `20260801_org_secrets_and_rls_gaps.sql`. Applying the migration against the old
backend removes the Stripe key from `feature_flags` before anything knows to look in
`organization_secrets`, which breaks the iCreate payment step for the 296-user org.

**Rotate regardless.** The iCreate Stripe key was readable unauthenticated for an unknown
period. Moving it does not un-disclose it.

#### H6. `bounties` and `curriculum_attachments` — the two the H4 migration deferred

Surfaced 2026-08-03 by the scheduled `DB Exposure Audit` run
([run 30828120642](https://github.com/shortbird/pathweaver_2.0/actions/runs/30828120642)), which
failed on exactly the two tables `20260802_revoke_data_api_on_student_work.sql` left at its foot
as "same remedy, separate decision". Re-verified live on 2026-08-03; both still hold.

**`bounties` — 17 of 17 rows anon-readable.** The policy `Anyone can view active bounties` is
`USING (status = 'active' OR poster_id = auth.uid())`, and every row is active. The important
detail is *which* column it keys on: the product's privacy control is `visibility`
(`public` | `organization` | `family`), and the policy never mentions it. **15 of the 17 rows are
`visibility='family'`** — a parent's bounty aimed at named children through `allowed_student_ids`
— and all 15 are readable by anyone on the internet holding the anon key, along with
`moderation_notes`, `cohort_class_id` and `sponsored_reward`.

This one is easy to wave through, because a bounty *can* legitimately be public to the whole
platform. But platform-public and internet-public are different things. Platform-public is
enforced in Python for logged-in users — `BountyService.list_bounties` filters on `visibility`,
and `_can_student_see` re-checks it so a direct link cannot bypass the list — and none of that
runs on a PostgREST request.

**`curriculum_attachments` — 21 of 21 rows anon-readable.** `curriculum_attachments_org_isolation`
is `USING (organization_id IS NULL OR organization_id IN (<caller's org>))` and every row has a
NULL `organization_id`, so the first branch publishes the whole table and the policy's name
describes something it does not do. What leaks is `file_url` for org curriculum uploads. (The
soft-delete concern noted on 2026-08-02 is latent, not live: `is_deleted` is true on zero rows,
and the policy does not test it, so a soft-deleted file would stay readable.)

**Nothing depends on the anon access.** Same four checks that cleared H4, re-run for these two:
no `.from('bounties')` or `.from('curriculum_attachments')` in either frontend; the
`supabase_realtime` publication is still empty; every backend read is on the service-role client
(`BountyService` builds `BountyRepository()` with no `user_id`, so `BaseRepository` falls back to
`get_supabase_admin_client()`, and every endpoint in `routes/curriculum/attachments.py` calls it
directly); and all 15 routes in `routes/bounties.py` are `@require_role`'d, including the
student-facing list. As with H4, every other branch of these policies is keyed on `auth.uid()`,
which is NULL on every Data API request — so the only branches that can evaluate true are the
exposures themselves.

**Fix:** `supabase/migrations/20260803_revoke_data_api_on_bounties_and_attachments.sql` drops the
anon/authenticated policies, forces RLS, and revokes the grants — matching what H4 did. The
`Service role full access on bounties` policy is left in place. Rollback captured pre-apply in
`ROLLBACK_20260803_...`. **Not yet applied to production**; applying it needs a Supabase PAT, and
the daily scan keeps failing until it is. Verify after applying with
`python scripts/audit_db_exposure.py` (expect zero findings) and by loading the bounty board and a
quest's curriculum tab.

### Preventing and detecting the next one

Both halves of the failure are now covered, because each half was invisible to the other:

- **Static, enforcing on every push** — `backend/tests/test_secret_exposure_guard.py` (42 tests),
  wired into `release.yml` as its own step. It fails the build if a migration creates a table
  without enabling RLS, if any code reads a credential out of `feature_flags`, if `/me` stops
  stripping, or if the org-update route stops diverting secrets. This runs as a *separate* step
  because the existing backend pytest job ends in `|| true` — every test in it is advisory, which
  is worth knowing independently of this audit.
- **A rejection at the write path** — `secret_shaped_keys()` refuses to store any newly-added
  credential-shaped key in `feature_flags`, naming the offending field. The original mistake was
  not choosing a bad column; it was that nothing objected.
- **Live, scheduled** — `scripts/audit_db_exposure.py` + `.github/workflows/db-exposure-audit.yml`
  run daily against production and open a `security` issue on failure. This is the half that
  matters most: C1 and C2 both entered through the dashboard/SQL editor, so no repo-based check
  could ever have seen them. Its strongest check is empirical — it asks PostgREST, with the real
  public anon key, what every table actually returns, and that is what found H4.

The scan currently **exits non-zero** on the open findings above. That is intended: a green
check that was made green by allowlisting real exposures is worse than no check.

It has since done its job unprompted: the scheduled run on 2026-08-03 failed on H6, which is
what surfaced the `bounties` exposure below.

---

## 3. What I could not verify

- **That the C1/C2/C3 fixes work against production.** They are verified by 42 static tests and
  a full-suite regression diff (zero new failures vs. the base commit), but the migration has not
  been applied and the code has not run against the live database. In particular the iCreate
  card-payment path is covered only by its existing unit tests with the new accessors stubbed.
- **Whether the exposed Stripe key is live or test.** The validation regex at
  `organization_management.py:238` accepts both `sk_`/`rk_` with no live/test discrimination, and
  the error copy tells admins to paste `sk_live_`. I deliberately did not retrieve the key value,
  so I confirmed only that a credential-shaped field is present and anon-readable. **Assume live
  and rotate.**
- **Whether C1/C2 have already been exploited.** Assessing that requires Supabase Data API access
  logs, which are not reachable from here. Given that both are trivially discoverable by
  automated scanners pointed at a public anon key, I would not assume they have not been.
- **Runtime behaviour of the impersonation refresh loop (H2).** I traced it statically through
  `_refresh_impersonation_session` → `tokens.py`; I did not mint tokens against a running server
  to confirm end-to-end. The code path is unambiguous but untested by me.
- **Redis presence in production.** `middleware/idempotency.py:34-58` and the rate limiter both
  fall back to per-process in-memory storage when `REDIS_URL` is unset. Under Render's multi-worker
  gunicorn, that fallback makes both idempotency and rate limiting per-worker rather than global.
  I could not determine whether `REDIS_URL` is set in prod. If it is not, M1/M5-style duplicate
  submissions and the rate limits protecting the OTP and login endpoints are substantially weaker
  than they appear.
- **Frontend test coverage claims.** `CLAUDE.md` cites 353 v1 tests at ~43% CI line coverage and
  276 v2 tests. I did not execute either suite; the coverage gate in
  `.github/workflows/release.yml:102-117` exists and is wired to fail the build, but I did not
  verify the floor it enforces matches the documented one.
- **Whether any legacy `quest_task_completions` row could re-enter `ready_for_credit`** (M1
  reachability). I confirmed none exist today; I could not rule out a data-repair script or an
  unreleased reviewer flow reintroducing the state.
- **LTI 1.3 launch signature verification** (`backend/routes/lti/`). Read only briefly; the
  JWKS/`PyJWKClient` approach looked structurally correct but I did not audit nonce replay or
  `aud`/`iss` binding in depth.
- **Email, push (VAPID), and webhook delivery paths.** Not assessed.

---

## 4. Method

**Read in full:** `backend/utils/auth/decorators.py`, `backend/utils/session_manager.py`,
`backend/utils/portfolio_access.py`, `backend/middleware/csrf_protection.py`,
`backend/middleware/idempotency.py`, `backend/routes/admin/masquerade.py`,
`backend/routes/tasks/completion.py`, `backend/routes/auth/login/tokens.py`,
`supabase/migrations/20260527_restore_default_data_api_grants.sql`.

**Read in relevant part:** `backend/routes/auth/login/core.py`, `.../settings.py`,
`backend/routes/portfolio.py`, `backend/routes/public.py`, `backend/routes/uploads.py`,
`backend/routes/icreate_registration.py` (payment/config paths),
`backend/routes/admin/organization_management.py`, `backend/routes/credit_dashboard/org_admin_actions.py`,
`backend/routes/tasks/credit.py`, `backend/routes/sis/events.py`, `.../secure_documents.py`,
`backend/routes/embed.py`, `backend/routes/dependents.py`, `backend/routes/announcements.py`,
`backend/routes/admin/ai_jobs.py`, `backend/routes/quest/listing.py`,
`backend/services/media_upload_service.py`, `backend/services/portfolio_service.py`,
`backend/middleware/error_handler.py`, `backend/middleware/rate_limiter.py`,
`backend/utils/storage_url.py`, `frontend/src/services/api.js`,
`frontend/src/services/supabaseClient.js`, `frontend/src/components/PrivateRoute.jsx`,
`frontend-v2/src/services/tokenStore.ts`, `frontend-v2/src/services/api.ts`,
`frontend-v2/src/services/supabaseClient.ts`, `render.yaml`,
`.github/workflows/release.yml`, `requirements.txt`, `backend/requirements.txt`,
`frontend/package.json`, both `.env.example` files.

**Analyzed programmatically:** all 184 SQL migrations across the three directories (CREATE TABLE
vs `ENABLE ROW LEVEL SECURITY` vs `CREATE POLICY` coverage); a decorator sweep over every Flask
route in `backend/` (120 routes without an auth decorator were enumerated and each triaged —
all but the intentionally public ones perform inline checks, which I spot-verified in
`quest/listing.py:410-430`, `admin/ai_jobs.py:261-296`, and `auth/login/settings.py:36-120`);
a swallowed-exception sweep; a file-size census.

**Verified against production** (read-only): `pg_class.relrowsecurity` and `pg_policies` for all
210 public tables; `information_schema.role_table_grants` for the `anon` role;
`storage.buckets.public` and `storage.objects` counts; `quest_task_completions` constraints and
`diploma_status` distribution; `organizations.feature_flags` credential presence (boolean only);
Supabase security advisor (101 lints, 2 ERROR). Reproduced C1, C2, and H1 as unauthenticated or
anon-key HTTP requests against the live API, and confirmed 16 sensitive tables correctly return
zero rows to `anon`.

**Not examined:** `frontend/src/pages/**` and `frontend/src/components/**` beyond the auth and
portfolio surfaces (953 files); `frontend-v2/app/**` screens; `backend/tests/**`;
`backend/scripts/**` and `backend/services/curriculum/**`; the AI/quest-generation services
(`quest_ai_service.py`, `course_generation_service.py`, `base_ai_service.py`) beyond confirming
they hold no credentials; `backend/routes/lti/**` in depth; the design-system, mockups, docs, and
`.claude/` workspace directories.

**Read-only discipline:** no files were modified, no writes were issued to the database or
storage, and the supplied management token was used only within the shell — it appears in no
file, no commit, and no log in this repository.
