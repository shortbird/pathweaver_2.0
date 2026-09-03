# Audit Remediation Plan — 2026-08-31

Source: third-party-style technical audit of 2026-08-31 (four specialist reviews:
security, backend architecture, frontends, testing/ops). Full report:
https://claude.ai/code/artifact/65c96cc7-21fc-48a5-8dd7-ac63abdb1c7f

Branch: `audit/remediation-2026-08` (based on main @ 8f4863ce).
Worktree: `.claude/worktrees/audit-remediation` — this work stays isolated from the
shared tree at `~/pathweaver_2.0`, where other agents hold uncommitted work.

## Working protocol (instructions to the agent running this plan)

1. **Session start:** re-read this file. Pick the highest-priority item that is
   `TODO` and not `NEEDS-USER`/`BLOCKED`. Priority order: phase order below, then
   item order within a phase. Skipping ahead is fine when an item is blocked.
2. **Verify before fixing.** Findings date from 2026-08-31 and the tree moves fast.
   Confirm the cited evidence still exists (file:line may have drifted). If a
   finding is already fixed or wrong, mark it `WONTFIX` with evidence — do not
   "fix" what isn't broken.
3. **One item, one commit** (or one coherent sub-batch for large items). Commit
   message starts with the item ID, e.g. `SEC-01: require_role('admin') routes
   fail closed by name, not by accident`. End commit messages with the standard
   Co-Authored-By line.
4. **Update this file in the same commit** as the fix: flip the status and append
   a dated line to the item's Log. Log lines are `- 2026-MM-DD: <what was done /
   found / decided, and by which session if known>`. Never delete Log history.
5. **Tests:** run the affected test files while iterating (`npx vitest run <files>`,
   `python -m pytest <files>` with the venv at `~/pathweaver_2.0/venv`). Add or
   extend a test with every behavioral fix — prefer a guard test that makes the
   whole bug class impossible (this codebase's house style). Run the relevant
   full backend/web suite before any push.
6. **Never push, merge, or touch `develop`/`main` without the user saying so.**
   Autonomous mode means: fix, test, commit, log — on this branch only.
7. **`NEEDS-USER` items:** do not attempt them. Collect the open questions and put
   them in front of the user at the end of a working session.
8. **Do not modify the main working tree** at `~/pathweaver_2.0` — other agents
   work there. Everything happens in this worktree.
9. **Frontend tooling note:** this worktree has no `node_modules`. Before the first
   frontend item, run `npm install` in `frontend/` (and `frontend-v2/` if needed)
   inside the worktree.
10. **Security fixes must fail closed.** When in doubt between breaking a caller
    and widening access, break the caller and note it in the Log.
11. **When editing auth/authz code** (SEC items): read the whole function and its
    call sites first; sample tests exist under `backend/tests/` for most of it.
    New routes' role lists always include `superadmin` (CLAUDE.md rule 8).
12. **Statuses:** `TODO`, `IN PROGRESS`, `DONE`, `WONTFIX(reason)`,
    `BLOCKED(what it waits on)`, `NEEDS-USER(the question)`.

---

## Phase 0 — Quick, safe security fixes

### SEC-01 — `@require_role('admin')` names a role that does not exist `[DONE]`
Routes fail closed today but silently become a privilege grant if `'admin'` ever
appears in a role column. Evidence: `routes/admin/task_flags.py:21,51,79,112`,
`routes/parental_consent/admin_review.py:67,124,205` (includes COPPA consent
approve/reject). Fix: replace with the correct decorator (superadmin-only was the
effective behavior — keep it explicit); add an import-time guard so `require_role`
rejects role names not in `VALID_ROLES`, plus a unit test.
Accept: no `require_role` call with an invalid role can register; tests pass.
Log:
- 2026-08-31: Plan created.
- 2026-08-31: Verified. Found 11 sites, not 7: the audit's list plus 4x
  `require_role('advisor', 'admin')` in advisor_notes.py (dead 'admin' term).
  task_flags + admin_review -> @require_superadmin (preserves effective
  behavior; broadening consent review to org admins would be a product
  decision — flag if wanted). advisor_notes -> ('advisor', 'superadmin').
  require_role now raises ValueError at decoration time for any role not in
  VALID_ROLES | VALID_ORG_ROLES (also catches the un-unpacked-tuple mistake).
  New guard: tests/unit/test_require_role_names_are_real.py (behavior + static
  sweep of routes/). Checked the audit's implied 51-route un-unpacked-tuple
  bug: false alarm — those matches were justification comments, all real
  decorators unpack correctly. 117 related tests + new guards pass.

### SEC-02 — Unauthenticated `/api/auth/cookie-debug` discloses config `[DONE]`
`routes/auth/login/diagnostics.py:142-291` leaks FLASK_ENV, cookie config,
FRONTEND_URL, remote_addr. Fix: require superadmin (or delete the endpoint if
unused — grep frontend for callers first).
Accept: endpoint 401/403s anonymously or is gone; test added.
Log:
- 2026-08-31: Plan created.
- 2026-09-03: Confirmed live and unauthenticated. Deleted the endpoint rather
  than gating it: its one frontend caller (`testCookieSupport` in
  browserDetection.js) was imported by AuthContext.jsx and never invoked, so
  nothing called it; and superadmin-gating a pre-auth diagnostic makes it
  useless for the Safari case it exists for. `/api/auth/token-health` already
  answers "is my auth reaching the server, over which transport" for both
  transports with no config in the response. Removed the route plus its two
  helpers (diagnostics.py 315 -> 88 lines), the dead frontend function and its
  import/mock, and updated ADR-004 Rule 5 (marked superseded) and
  P2-ARCH-1-AUTH-REFACTORING.md. Guard: renamed
  tests/unit/test_no_test_config_route.py ->
  test_no_config_disclosure_routes.py, parametrized over retired
  config-disclosure routes (/test-config and /api/auth/cookie-debug both 404),
  plus an assertion that token-health's anonymous body carries no config keys.
  Tests: backend auth/route guards 34 passed 1 skipped; web
  browserDetection + AuthContext 50 passed.

### SEC-03 — Masquerade tokens returned in JSON body unconditionally `[DONE]`
`routes/admin/masquerade.py:97-98` returns both impersonation tokens in the body
even for cookie-capable browsers; login gates this behind
`token_delivery.needs_header_auth()`. Fix: apply the same gate.
Accept: cookie-capable clients get cookies only; header-auth fallback still works;
masquerade tests pass.
Log:
- 2026-08-31: Plan created.
- 2026-09-03: Confirmed, and `/exit` was worse than the start endpoint the
  finding named: it returned the admin's OWN access + 30-day refresh token in
  the body to everyone. Both now go through token_delivery — a new
  `masquerade_body_tokens()` for the start endpoint's field names, and the
  existing `refresh_body_tokens()` for /exit. Cookie-capable v1 browsers lose
  nothing: start sets the httpOnly masquerade_token cookie that
  get_effective_user_id() reads, /exit calls set_auth_cookies(), and v1 does a
  full page reload after both, so the in-memory copy was discarded a moment
  later anyway. Safari/iOS/Firefox and the mobile app still get both tokens
  (v2's web target too, via its Origin).
  Client: masqueradeService.js only calls setTokens when the body carried a
  token, and on exit clears memory otherwise — a leftover masquerade JWT would
  keep going out as a Bearer and outrank the admin cookies just set
  (get_effective_user_id prefers the header). v2's actingAsStore is unchanged:
  it always qualifies for header auth.
  Guard: test_token_delivery.py's bypass scan covered only routes/auth/, which
  is exactly why masquerade.py drifted — it now walks all of routes/ and checks
  four credential field names, with a reasoned allowlist for the three genuine
  token-issuing endpoints, plus a test that the allowlist entries still exist.
  Tests: token_delivery + masquerade + security-audit regressions 51 passed;
  import layers/route registration/CSRF 29 passed; web masquerade/api/sidebar/
  role-switcher 50 passed.
  FOLLOW-UP (new finding, not in the audit): acting-as (parent -> dependent,
  routes/dependents.py `/`<id>`/act-as` and `/stop-acting-as`) has no cookie of
  its own — the token is body-only and replayed as a Bearer, so the same gate
  cannot be applied without first giving it a cookie the way masquerade has
  one. Allowlisted with that reason. Worth its own item.

### SEC-04 — `.env.example` ships the production Supabase project ref `[DONE]`
Replace `https://vvfgxcykxjybtvpfzwyx.supabase.co` (and related refs) in tracked
`.env.example` files with placeholders.
Accept: no tracked example file names the prod project.
Log:
- 2026-08-31: Plan created.
- 2026-08-31: Fixed backend/.env.example:14 and frontend/.env.example:11 ->
  `your-project-ref` placeholder. Other tracked refs (workflows, email
  templates with public storage asset URLs, docs) are operational, left alone.

### SEC-05 — PII log scrubber exists but is not installed `[DONE]`
`utils/log_scrubber.py` (mask_email/mask_pii) is never attached as a logging
filter; 34 statements log raw parent/student emails (e.g.
`routes/registration_funnel.py:377,577`, `routes/contact.py:118,135,150,164`).
Fix: install a `logging.Filter` in `utils/logger.py` that scrubs email patterns
from records; keep the explicit `mask_email` call sites; add a test that a logged
raw email comes out masked.
Accept: filter active on all app loggers incl. root handlers Sentry sees; test.
Log:
- 2026-08-31: Plan created.
- 2026-09-03: Installed, but NOT as a logging.Filter — a handler filter cannot
  meet this item's own acceptance criterion. sentry_sdk 2.67's
  LoggingIntegration patches `logging.Logger.callHandlers` and reads the record
  there, outside every handler's filter chain, so an address masked at our
  console handler would still have shipped to Sentry in full. Two hooks instead,
  both in utils/logger.py behind `install_pii_scrubbing()` (idempotent, called
  from setup_logging() before the handlers are attached):
  the LogRecord factory scrubs `msg` and `args`, and a Logger.makeRecord wrapper
  scrubs `extra=` (which is merged onto the record after the factory returns —
  that is where utils/access_logger.py's FERPA context and the route decorators
  put theirs, nested dicts and lists included).
  Scope: emails and JWTs, via a new `scrub_log_text()` in log_scrubber.py.
  UUIDs are deliberately NOT scrubbed platform-wide — every quest, class and
  org id is a UUID and masking them would cost the logs their join key while
  adding no privacy the email masking does not already give; `mask_pii()` keeps
  the stricter behavior for callers that want it, and both now share one set of
  compiled patterns. Args are scrubbed individually rather than folded into the
  message so %-templates stay templates and Sentry grouping survives.
  The 34 raw-email call sites need no edit and were left alone.
  Tests: tests/unit/test_log_pii_scrubbing.py, 12 cases — including one that
  stands where Sentry stands (patching callHandlers) and asserts the record is
  already masked when it arrives. Full backend suite: 4285 passed, 160 skipped.
  Not covered, worth its own item: exception text. `logger.error(...,
  exc_info=True)` formats the traceback downstream of both hooks, so an email
  inside an exception message still reaches Sentry.

### SEC-06 — `daily_advisor_summary` may still be hard-routed to one inbox `[DONE]`
`backend/jobs/daily_advisor_summary.py:71` carries `# TESTING MODE: Only send to
tannerbowman@gmail.com` on a production cron job. Investigate whether the
restriction is live; if so this is a silent product bug (advisors get no
summaries). Fix or document.
Accept: job's recipient logic matches intent; comment reflects reality.
Log:
- 2026-08-31: Plan created.
- 2026-08-31: Confirmed live: the job runs daily via the consolidated prod
  cron and filtered every advisor except the hardcoded inbox — a deliberate
  soft-launch gate implemented as a personal email in code. Moved the gate to
  `Config.ADVISOR_SUMMARY_EMAIL_ALLOWLIST` (comma-separated emails, `*` = all;
  default preserves the pilot cohort exactly). Extracted testable
  `filter_to_rollout()`; new tests in tests/unit/test_advisor_summary_rollout.py
  (6 pass). Documented in ENV_KEYS_REFERENCE.md. Quirk noted: the
  `advisor_ids` job path builds dicts without emails, so a cohort allowlist
  filters them all out — unchanged behavior, revisit if that path matters.
  USER DECISION QUEUED: set `ADVISOR_SUMMARY_EMAIL_ALLOWLIST='*'` in prod when
  ready to roll summaries out to every advisor.

### SEC-07 — Legacy `verify_token()` accepts refresh tokens as access tokens `[DONE]`
`utils/auth/token_utils.py:33` accepts `type in ['access','refresh']` and skips
session/device checks; used at `routes/public.py:131`,
`routes/quest/listing.py:51,380`. Fix: restrict to `type == 'access'` (check the
three call sites for legitimate refresh use first — none expected on read paths).
Accept: refresh token no longer authenticates those paths; tests cover both types.
Log:
- 2026-08-31: Plan created.
- 2026-09-03: Confirmed at all three call sites; none passes a refresh token on
  purpose (each tries session_manager.get_effective_user_id() first and only
  falls back to the Bearer). Fixed by DELETING the second implementation rather
  than editing its accept-list: verify_token()'s custom-JWT branch now calls
  session_manager.verify_access_token(), which is where every other caller's
  verification already lives. That closes the type hole and picks up two things
  the hand-rolled decode never had — the session-timeout check and the
  previous-key fallback during a secret rotation. The Supabase fallback below it
  is unchanged.
  Sharpest instance was routes/public.py:131, where the result decides whether
  an UNPUBLISHED course is shown to its creator or a superadmin.
  Tests: tests/unit/test_verify_token_access_only.py, 10 cases — access
  accepted; refresh rejected; all four impersonation token types rejected as a
  parametrized class so a seventh token type cannot quietly become a seventh way
  through; plus a shape guard that `jwt.decode` never returns to that function.
  Full backend suite: 4295 passed, 160 skipped.
  Noted in passing: `generate_token()` and `refresh_token()` in the same module
  are dead AND broken — generate_token() mints a payload with no `type`, so a
  token it issues cannot pass verify_token() at all. Candidates for QB-01.

### SEC-08 — Admin decorators accept cookie fallback after a rejected Bearer `[DONE]`
`get_effective_user_id` (session_manager.py:864-868) refuses cookie fallback on a
bad Bearer; `get_current_user_id` (:772-829) falls through to cookies, and
`authorizing_user_id()` (utils/auth/decorators.py:86) — used by require_admin /
require_superadmin / require_org_admin / require_org_front_office /
require_school_admin — takes the permissive path. Same request, two answers, in
the accepting direction. Fix: unify on the strict semantics; audit callers for
breakage (Safari header-auth flows).
Accept: a request with an invalid Bearer + valid cookies is rejected consistently;
auth test suite green.
Log:
- 2026-08-31: Plan created.
- 2026-09-03: Confirmed and unified on the strict semantics.
  `get_current_user_id()` now returns None when a Bearer was sent and verifies
  as nothing, exactly as `get_effective_user_id()` already did;
  `get_actual_admin_id()` inherits it, and with it every decorator that
  authorizes through `authorizing_user_id()` (require_admin, require_superadmin,
  require_org_admin, require_org_front_office, require_school_admin,
  require_real_identity, require_admin_identity).
  Worst case this closes: an EXPIRED masquerade token. Masquerade JWTs live one
  hour and the admin's own access_token cookie outlives them, so when the
  masquerade died mid-session the admin silently got their own authority back
  on every admin route while the banner still said they were inside the
  target's account.
  Caller audit found two that genuinely must survive a dead Bearer, and they
  are de-escalations, not grants: `/api/auth/logout` (an expired access token is
  the normal way to arrive, and a logout that cannot name the caller writes no
  last_logout_at and revokes no refresh families -- the session outlives the
  logout that reported success) and `/api/dependents/stop-acting-as` (acting-as
  tokens expire at 24h; the parent still needs the way out). Both now call a
  named `session_manager.get_deescalation_user_id()`, which tries every
  credential the request carries and is documented as usable only where the
  outcome can exclusively REMOVE access. A test pins its call sites to exactly
  those two files.
  Checked and unaffected: /api/auth/refresh resolves through refresh_session(),
  not these; password.py's self-check sits inside @require_auth already;
  require_auth_cookie has no callers; every Authorization header any client
  sends is an app-issued JWT (no client puts a Supabase token there), so no
  caller loses a session it used to have.
  Tests: tests/unit/test_auth_resolvers_fail_closed.py, 10 cases -- including
  one that asserts the three resolvers agree across a matrix of credential
  mixes, so two answers to "who is calling" fails whichever way round it
  happens. Full backend suite: 4305 passed, 160 skipped.

---

## Phase 1 — High-severity security

### SEC-10 — No structural ownership enforcement on ~138 id-parameter routes `[TODO]`
Audit sampled a dozen high-risk handlers and all had correct hand-written checks,
but nothing fails when a new route forgets one. Fix in three steps:
(a) build a relationship-checking decorator (e.g. `@require_relationship_to
('student_id')`) on top of the existing helpers (`caller_can_access_user`,
`parent.registerable_students`, `_student_in_org`, `goals.can_view_goal`);
(b) add a guard test (house style, like `test_no_duplicate_routes`) that fails on
any route with a user/student id path param and neither the decorator nor an
allowlisted inline check;
(c) migrate routes module-by-module (parent/, observer/, sis/, dependents,
admin/) in sub-batches with a Log line each.
Accept: guard test enforcing in CI config; migrated modules listed in Log.
Log:
- 2026-08-31: Plan created.

### SEC-11 — 123 handlers return raw exception text in 500 bodies `[TODO]`
Pattern: `except Exception as e: return jsonify({'error': f'...{str(e)}'}), 500`
(e.g. `routes/advisor_checkins.py:85,137,159,198,242,266`). The centralized
fail-closed handler already exists (`middleware/error_handler.py`). Fix: let these
propagate (or re-raise as typed errors); add a guard test banning `str(e)`
interpolation into 5xx responses under broad excepts. Distinguish the ~176 benign
4xx ValidationError returns — leave those.
Accept: guard test green and enforcing; no 500 body carries exception text.
Log:
- 2026-08-31: Plan created.

### SEC-12 — OAuth provider mints full-privilege session tokens, scope decorative `[TODO]`
`routes/auth/oauth.py:302,372` issue first-party session tokens; no consent UI;
scope enforced nowhere. Interim fix (autonomous): gate `/oauth/authorize` and
client registration behind a Config flag, default OFF, so the surface is closed
until scoped tokens + consent exist. Full fix (separate decision): scoped token
type + consent screen.
Accept: flag off by default; existing tests updated; full-fix scoped as follow-up.
Log:
- 2026-08-31: Plan created.

### SEC-13 — Re-arm the admin-client justification gate `[TODO]`
`test_admin_client_justified` is deselected from CI; ~93 construction sites (audit
counts varied 93–195; measure first) lack the required justification comment.
Fix: add honest justification comments site-by-site (verifying each use is
legitimately admin — flag any that should be user-scoped as new SEC items), then
re-enable the test in `tests-backend.yml`.
Accept: test enforcing in CI; zero unjustified sites; suspicious sites logged.
Log:
- 2026-08-31: Plan created.

### SEC-14 — Verify the RLS backstop: does prod `JWT_SECRET_KEY` match Supabase? `[NEEDS-USER(answered: NO. Which remediation — rotate the secret, or drop the RLS pretense?)]`
`app_config.py:302` falls back to the Flask secret; if prod's value is not the
Supabase JWT secret, the 28 "RLS-enforced" paths run as `anon`. Needs a prod env
read (Render dashboard/API) and a Supabase JWT-secret comparison — user should run
or authorize this check. Outcome decides whether RLS is a degraded backstop or no
backstop.
Log:
- 2026-08-31: Plan created. Question queued for user.
- 2026-09-03: ANSWERED, with the user's authorization to read prod env. The
  secrets DO NOT match, and the consequence is not "degraded RLS" — it is no
  RLS at all.
  Evidence, two independent proofs:
  (1) Prod `JWT_SECRET_KEY` IS set (64 chars, sha256 259794b5..., distinct from
      FLASK_SECRET_KEY e8535ea2...), so the `or SECRET_KEY` fallback is not
      what is wrong. But the Supabase anon key is itself a JWT the project
      signed with its own JWT secret, and neither prod value verifies it.
  (2) Probed prod PostgREST with a token minted exactly the way
      session_manager.generate_access_token() does, sent exactly the way
      database.get_user_client() sends it (apikey = anon key, Authorization =
      app JWT). Response:
        401 PGRST301 "None of the keys was able to decode the JWT"
      The same request with the anon key as bearer returns 200. So every query
      through get_user_client() fails outright in production.
  Why nobody noticed — and why Sentry holds zero PGRST301 in 90 days: almost
  every RLS call site is dead code. Census of the 7 real ones:
    - repositories/base_repository.py:115 — live, but only 5 construction sites
      pass user_id. QuestRepository(user_id=...) in quest/listing.py is
      DECORATIVE (get_quests_for_user builds its own admin client) and
      observer_audit_service passes user_id=None. Only BugReportRepository
      (superadmin triage GET/PATCH) actually reaches self.client, and no client
      calls those endpoints.
    - services/quest_lifecycle_service.py:27 — backs 10 registered routes
      (pickup/setdown/archive/enrollment/quest-invitations). No caller in v1 or
      v2 for any of them.
    - routes/users/transcript.py:41 — GET /api/users/transcript, no caller.
    - routes/evidence_documents.py:1444,1656 — the service methods exist
      (completeTask, deleteBlockFile) but no component calls them; the live
      editor path is saveDocument -> PUT /documents/<id>, on the admin client.
    - routes/observer/student_invitations.py:119 and
      routes/observer_requests.py:118 — no caller; observer_requests' table is
      on CLAUDE.md's dropped list anyway.
    - utils/database_policy.py:41 — no importers, and it calls
      get_user_client(user_id) with a UUID, which that function explicitly
      rejects. Dead and broken.
  Confirmed while here: the app's tokens carry `sub` (prod's auth.uid() reads
  exactly that claim — checked against pg_proc) but no `role` claim, so even
  with a matching secret they would evaluate as `anon`. 265 of 302 public
  policies are `TO public` and would still apply; 16 policies across 7 tables
  are `authenticated`-only and would silently never match (transfer_credits,
  contact_submissions, task_feedback, feed_item_views, direct_messages,
  message_conversations, user_subject_xp, ai_usage_logs).
  DECISION NEEDED — two remediations pointing opposite ways:
  (A) Make it real. Set prod JWT_SECRET_KEY to the Supabase JWT secret, move
      the current value to FLASK_SECRET_KEY_OLD so live sessions survive the
      cutover, and add `"role": "authenticated"` to the payload. The caveat
      that stops this being a safe default: it switches on 265 RLS policies
      that have never once executed against production traffic. They want
      reviewing before, not after.
  (B) Stop pretending. get_user_client() advertises enforcement it has never
      delivered; move the 7 call sites to the admin client with explicit
      ownership checks and let SEC-10 be the actual control. No prod change, no
      session churn, and new code stops trusting a backstop that is not there.
  Either way SEC-10 stops being defense-in-depth and becomes load-bearing.
- 2026-09-03: User chose (A) — make RLS real — and asked for a regression audit
  before the cutover. Audit done; two prerequisites found and shipped
  (SEC-14a, SEC-14b). Remaining step is the prod env change, which is the
  user's.

  BLOCKER FOUND AND FIXED (SEC-14a, commit 9fd8b1ba). Three app-signed token
  types verify outside session_manager and had no previous-key fallback, so the
  rotation would have voided them instantly: LTI OIDC state (10 min), Google TOS
  acceptance (15 min), and LTI SpeedGrader evidence tokens — 180 days, stateless,
  and prod has 2 live LTI registrations with 435 pending launches. Teachers
  would have hit dead links in a live gradebook with no way to reissue. All
  three now go through utils/jwt_keys.decode_app_jwt (current key, then
  FLASK_SECRET_KEY_OLD), with a guard test against new hand-rolled decodes.
  Also fixed there: google_oauth captured the signing key in a module constant
  at import, freezing whichever value the process started with.

  SECOND PREREQUISITE (SEC-14b, commit 5abfccb8). Tokens carried `sub` but no
  `role`, so PostgREST would have run them as `anon` even after the rotation and
  the 16 policies written TO authenticated would silently never match. Added
  `role: authenticated` to the access, masquerade and acting-as tokens (the
  three that can reach postgrest.auth()). Inert until the rotation.

  DATABASE AUDIT — what starts being enforced. Verified against prod:
    - All 237 public tables have RLS ENABLED. No table is exposed by grants
      alone.
    - No policy grants more to `authenticated` than `anon` already has. Every
      wide-open policy (qual `true`, or `is_published`/`is_visible`/`is_active`)
      is TO public, so it is already reachable with the anon key that ships in
      the frontend bundle. The rotation exposes nothing new.
    - Write-side broad policies are only `is_admin()` or already-anon INSERTs
      (contact form, promo interest). `public.is_admin()` checks
      `role = 'admin'` — a role CLAUDE.md lists as invalid and that no user has
      — so those policies are dead, fail-closed. Same class as SEC-01.
    - `private.is_superadmin / is_org_admin_user / is_advisor_user /
      get_user_org_id` are all SECURITY DEFINER with pinned search_path, so the
      users policies that call them cannot recurse. This was the biggest latent
      risk in switching RLS on and it is clear.
    - Own-row policies on users, user_quests, user_quest_tasks,
      quest_task_completions, evidence documents and observer_invitations are
      correctly keyed on auth.uid().
    - PostgREST here does not enforce an audience: the anon key itself carries
      no `aud` claim and is accepted, so our tokens do not need one.
  KNOWN BEHAVIOR CHANGE, not a regression: 117 tables have RLS on and NO
  policies (deny-all), `bug_reports` among them. Its triage endpoints go from
  erroring to returning an empty list — quieter, still broken. They are
  superadmin-gated at the route, so the honest fix is to give
  BugReportRepository the admin client. Worth its own item; 356 rows exist.

  CUTOVER RUNBOOK (user runs steps 1-2; both are Render env changes on
  srv-d9sjl1f10e5c73a14610):
    1. Set FLASK_SECRET_KEY_OLD = the CURRENT value of JWT_SECRET_KEY
       (sha256 259794b5...). Do this FIRST and deploy, so the previous-key
       fallback is live before the key moves.
    2. Set JWT_SECRET_KEY = the Supabase JWT secret (Dashboard -> Project
       Settings -> API -> JWT Settings -> JWT Secret). Deploy.
       Do NOT touch FLASK_SECRET_KEY — sis_pay_links signs with that one and it
       is unrelated.
    3. Verify: GET /api/users/transcript as a logged-in user returns data
       instead of erroring. Watch Sentry for PGRST301 (expect none).
    4. After ~31 days (REFRESH_TOKEN_EXPIRY_DAYS=30), remove
       FLASK_SECRET_KEY_OLD to finish the rotation.
  Rollback is symmetric: put the old value back in JWT_SECRET_KEY. Any token
  minted during the window verifies under either key.

### SEC-15 — FERPA disclosure logging covers only observer/advisor reads `[TODO]`
`utils/access_logger.py` is written to from only ~5 route modules. Extend to
parent dashboards, SIS staff student-record reads (`routes/sis/student_records.py`),
transcripts, and admin student views. Prefer a helper/decorator over 30 hand
inserts.
Accept: every student-record read path writes `student_access_logs`; test.
Log:
- 2026-08-31: Plan created.

### SEC-16 — Org Stripe keys stored application-readable in plaintext `[TODO]`
`utils/org_secrets.py:104-128`. Add envelope encryption (Fernet via a Config key)
with a lazy re-encrypt migration path. Key provisioning itself is NEEDS-USER
(prod env var); code + tests are autonomous with a dev key.
Accept: values encrypted at rest; old plaintext rows migrated on read; tests.
Log:
- 2026-08-31: Plan created.

### SEC-17 — 27 unbounded backend deps, no lockfile `[TODO]`
`backend/requirements.txt`. Fix: introduce a compiled lock/constraints file
(pip-compile), point CI installs at it, and document how Render's build uses it
(root requirements.txt is what Render installs — keep it, add constraints).
Upper-bound the risky unbounded specs (`supabase`, `stripe`, `lxml`, `pillow`,
`PyMuPDF`, `bleach`, `openai`).
Accept: reproducible install in CI; pip-audit still green.
Log:
- 2026-08-31: Plan created.

### SEC-18 — CSRF exemption list is a hand-edited name list `[TODO]` (low)
`middleware/csrf_protection.py:72-145`, ~30 exempt endpoints, two prior outages
from drift. Consider deriving exemptions from a route decorator/metadata instead
of a central list. Design is otherwise sound (constant-time opaque tokens).
Log:
- 2026-08-31: Plan created.

---

## Phase 2 — CI enforcement (cheapest durable wins)

### CI-01 — No linter or type-checker runs in CI `[TODO]`
`mypy.ini` exists (permissive, with per-module strict overrides) but nothing runs
it. Fix: add ruff (curated ruleset: F, E9, B, S110/S112 for silent excepts) and
mypy steps to `tests-backend.yml`, enforcing. Fix or noqa existing violations to
get to green — do not lower the config to pass.
Accept: both steps enforcing in the reusable workflow (gates PR and release).
Log:
- 2026-08-31: Plan created.

### CI-02 — Stop the layering bleed: ratchet direct DB calls in `routes/` `[TODO]`
~2,317 `.table(` calls in routes today. Add a guard test that counts direct
Supabase table calls per layer and fails on *increase* over a checked-in baseline
(ratchet down as migrations happen). This fences the repository-pattern debt
without funding the full migration (see QB-06).
Accept: ratchet test enforcing; baseline file committed.
Log:
- 2026-08-31: Plan created.

### CI-03 — `no-console` is configured but not enforced; 33 console.logs live `[TODO]`
Run eslint in `tests-web.yml` (enforcing), remove the 33 `console.log` calls in
`frontend/src` (route through the logger/Sentry where they carry signal).
Accept: eslint step enforcing; zero console.log in v1 src.
Log:
- 2026-08-31: Plan created.

### CI-04 — No dependabot/renovate `[TODO]`
Add `.github/dependabot.yml`: pip (root requirements), npm (frontend,
frontend-v2), github-actions. Weekly, grouped minor/patch.
Accept: config merged; first PRs triaged by user later.
Log:
- 2026-08-31: Plan created.

### CI-05 — Integration tests and E2E do not hold the deploy `[NEEDS-USER]`
`release.yml` deploy is `needs: [backend, web]` only — documented as intentional.
Ask the user whether the 128 enforcing integration tests should now gate deploy.
Log:
- 2026-08-31: Plan created. Question queued for user.

### CI-06 — Ban raw `print()` in app code (408 today) `[TODO]`
Guard test (or ruff T201 with per-file ignores for scripts/) after QB-03 converts
existing calls.
Accept: enforcing after QB-03; scripts/ exempt.
Log:
- 2026-08-31: Plan created.

---

## Phase 3 — Documentation truth reconciliation

### DOC-01 — `REPOSITORY_MIGRATION_STATUS.md` claims complete at ~9% adherence `[TODO]`
Rewrite to state measured reality (counts from the audit; re-measure), the
fencing strategy (CI-02), and what "done" now means.
Log:
- 2026-08-31: Plan created.

### DOC-02 — Integration-test status drift in three artifacts `[TODO]`
`ci.yml` comment ("44 tests… quarantined"), `backend/pytest.ini` marker doc
("do not currently pass"), `backend/tests/conftest.py` skip reason — all describe
the pre-port state; `backend/tests/integration/README.md` says 128 enforcing.
Run the suite, confirm which is true, fix the stale three.
Log:
- 2026-08-31: Plan created.

### DOC-03 — `LOCAL_DEVELOPMENT.md` does not exist but is linked `[TODO]`
CLAUDE.md links it twice. Either create it (extract the inline section) or fix
the links.
Log:
- 2026-08-31: Plan created.

### DOC-04 — CLAUDE.md self-contradicts on commit scope `[TODO]`
Rule 12 overrides the "stage ALL outstanding changes" instruction, but the
superseded bold text still stands at the Git Configuration section. Remove or
rewrite the stale instruction so the file gives one answer.
Log:
- 2026-08-31: Plan created.

### DOC-05 — ~20 planning/audit docs clutter the repo root `[TODO]` (low)
Move to `docs/` (or `docs/archive/`), updating inbound links (CLAUDE.md references
AUDIT_IMPLEMENTATION_PLAN.md).
Log:
- 2026-08-31: Plan created.

---

## Phase 4 — Backend quality

### QB-01 — Delete dead `exceptions.py` (549 lines, zero importers) `[TODO]`
Verify zero imports repo-wide, then delete; the live hierarchy is
`middleware/error_handler.py`.
Log:
- 2026-08-31: Plan created.

### QB-02 — Consolidate duplicated micro-helpers `[TODO]`
46 copies of `_admin()`, 22 of `_org_or_error`, ~25 of `_now/_now_iso`, plus
`_display_name`/`_parse_ts` variants. Move canonical versions to `utils/`,
migrate call sites mechanically.
Log:
- 2026-08-31: Plan created.

### QB-03 — Replace 408 raw `print()` calls with the logger `[TODO]`
Routes/services only (scripts/ exempt). Preserve message content; pick levels
sensibly (errors in except blocks -> logger.error). Then arm CI-06.
Log:
- 2026-08-31: Plan created.

### QB-04 — Decompose the top god route files `[TODO]`
`registration_funnel.py` (2,143 — payments+OTP+provisioning in the route layer),
`admin/organization_management.py` (1,950), `evidence_documents.py` (1,716),
`admin/curriculum_upload.py` (1,400), `admin/user_management.py` (1,389).
Extract business logic to services; routes keep HTTP concerns. One file per
sub-batch, full related-test run each.
Log:
- 2026-08-31: Plan created.

### QB-05 — Three migration directories with ambiguous authority `[TODO]`
`supabase/migrations/` is current; `backend/migrations/` (80 files, 4 naming
conventions) and root `migrations/` (8 files) are legacy. Archive the legacy two
with READMEs stating provenance; note the 8-digit naming outlier
(`20260824_admin_platform_metrics_daily.sql`).
Log:
- 2026-08-31: Plan created.

### QB-06 — Repository-pattern endgame decision `[NEEDS-USER]`
Full migration is 1-2 engineers x 2-3 quarters; fencing (CI-02 + require repos
for new code) is ~2 weeks. Recommend fencing. User to confirm before anyone
funds the full migration.
Log:
- 2026-08-31: Plan created. Question queued for user.

---

## Phase 5 — Frontend quality

### QF-01 — Extract shared logic between v1 and v2 `[TODO]`
70% endpoint overlap, ~12 reimplemented component/hook pairs, ~8-10k LOC doubled;
`shared/` holds only legal copy. Extract platform-agnostic hooks, services, and
API contracts into `shared/` (start: pillars, richText, API types, useQuests /
useBounties / useNotifications logic).
Log:
- 2026-08-31: Plan created.

### QF-02 — Decompose top god components `[TODO]`
Start with `pages/courses/CourseHomepage.jsx` (1,653 lines, 5 components, 28
useState) and `pages/sis/ClassesPage.jsx` (41 useState, 36 direct api calls).
Then the next 8 by size. Behavior-preserving; tests before refactor where thin.
Log:
- 2026-08-31: Plan created.

### QF-03 — Finish one data-fetching paradigm in v1 `[TODO]`
29 react-query files vs 108 hand-rolled pages. Ratchet: new/touched pages use
`hooks/api/`; migrate the highest-churn pages first. Not a big-bang rewrite.
Log:
- 2026-08-31: Plan created.

### QF-04 — v2: dead react-query dep + 6 hand-rolled polling loops `[TODO]`
`@tanstack/react-query` has zero imports while `useMessages.ts` runs setInterval
polls at 15-30s (battery + backend load). Either adopt react-query with sensible
refetch intervals/backoff for messaging, or drop the dep and centralize polling
with visibility-aware backoff. Decide in-item; log the choice.
Log:
- 2026-08-31: Plan created.

### QF-05 — Silent partial-failure pattern `[TODO]`
`DiplomaPage.jsx:366-411` and elsewhere: parallel fetches whose failures go to
console.error, leaving silently empty sections. Add a section-level error state +
retry affordance; sweep for the pattern.
Log:
- 2026-08-31: Plan created.

### QF-06 — Bundle weight `[TODO]` (low)
Three PDF libraries (html2pdf.js, pdf-lib, react-pdf) -> consolidate; lazy-load
the 10MB OpenCV WASM behind the document-scanner route. Build currently needs a
4GB heap.
Log:
- 2026-08-31: Plan created.

### QF-07 — Styling drift `[TODO]` (low)
v1: ~40 genuinely off-palette hex values (plus ~160 brand colors written as hex —
mechanical swap); v2: 241 hex vs 208 token usages, off-palette `#af56e5`,
`#2469d1`, `#ff9028`. Use brand tokens (`optio-purple`/`optio-pink`).
Log:
- 2026-08-31: Plan created.

### QF-08 — A11y: tooling installed but unused; 36 div-onClick `[TODO]` (low)
Wire vitest-axe smoke tests on the top pages or remove the dead deps; convert
div onClick to buttons/keyboard handlers.
Log:
- 2026-08-31: Plan created.

### QF-09 — v2 TypeScript widening: 390 explicit `any` `[TODO]` (low)
Ratchet down: count-based guard or eslint rule warn->error per directory.
Log:
- 2026-08-31: Plan created.

---

## Phase 6 — Ops / infrastructure

### OPS-01 — No staging database: dev, local, and E2E all hit prod `[NEEDS-USER]`
The audit's top structural risk (FERPA/COPPA exposure; migrations unrehearsable;
prior incident: test run sent real emails via prod Brevo key). Needs a funded
decision: provision a staging Supabase project + seed pipeline, repoint dev
Render services and local `.env`s. Autonomous prep possible once approved:
seed.sql extension, env plumbing, docs.
Log:
- 2026-08-31: Plan created. Question queued for user.

### OPS-02 — `render.yaml` is not in effect; live config is dashboard-only `[TODO]`
First step is autonomous and read-only: pull live service config via the Render
API/MCP and rewrite `render.yaml` to match reality (documented as such). Whether
to re-adopt Blueprint sync is then NEEDS-USER.
Log:
- 2026-08-31: Plan created.

### OPS-03 — Nothing applies `supabase/migrations/` to production `[NEEDS-USER]`
Migrations reach prod by hand (MCP/dashboard) — the exposure-audit workflow exists
because of exactly this. Proposal: a gated `supabase db push` step in release.yml
(or a manual-approval workflow). Prod risk -> user decision.
Log:
- 2026-08-31: Plan created. Question queued for user.

### OPS-04 — Storage objects (student evidence) have no backups `[TODO]`
`backup-db.yml` covers Postgres only and says so. Write a storage-backup workflow
(rclone/supabase storage API to encrypted archive); wiring its secret into CI is
NEEDS-USER, the workflow + docs are autonomous.
Log:
- 2026-08-31: Plan created.

### OPS-05 — No branch protection / PR gate on `main` `[NEEDS-USER]`
Direct-push-to-main is the documented workflow. Changing it is a workflow
decision for the user, not a code fix.
Log:
- 2026-08-31: Plan created. Question queued for user.

### OPS-06 — `marketing/` site + `marketingUrl.js` exist only untracked `[NEEDS-USER]`
They sit uncommitted in the main working tree and belong to another in-flight
session. Do NOT commit someone else's work from here (CLAUDE.md rule 12). Ask the
user to have the owning session commit them.
Log:
- 2026-08-31: Plan created. Question queued for user.

### OPS-07 — Superadmin identity hardcoded in ≥4 source files `[TODO]`
`utils/platform_staff.py:18`, `utils/auth/decorators.py:561`, `swagger_config.py`,
`api_spec_generator.py` name a personal email. Move to `Config`
(e.g. `SUPERADMIN_EMAILS`), default preserving current behavior.
Log:
- 2026-08-31: Plan created.

### OPS-08 — ~70 hand-run prod-repair scripts, 19 keyed to one personal account `[TODO]`
`backend/scripts/`. Parameterize the hardcoded email lookups (`--user-email`
arg), add a `backend/scripts/README.md` runbook (what each does, safety class,
dry-run flags).
Log:
- 2026-08-31: Plan created.

### OPS-09 — 907 CRLF files, no `.gitattributes` `[NEEDS-USER]`
Normalization touches ~900 files and rewrites blame; must land at a quiet moment
coordinated with all in-flight branches. Prepare the `.gitattributes` +
`git add --renormalize` recipe; user schedules it.
Log:
- 2026-08-31: Plan created. Question queued for user.

---

## Phase 7 — Hygiene (low)

### HYG-01 — Committed junk `[TODO]`
`frontend/test-output.txt` (226KB), `.debug-sessions/`, tracked `__pycache__`
under scripts dirs, dead Windows tooling (`*.ps1`, `*.bat` from the pre-macOS
era — verify unreferenced first).
Log:
- 2026-08-31: Plan created.

### HYG-02 — `verify/` — 20 tracked hash-named .mjs scripts `[NEEDS-USER]`
Per-ticket client-verification scripts; unclear if still wanted. Ask before
deleting.
Log:
- 2026-08-31: Plan created. Question queued for user.

### HYG-03 — pip-audit CVE suppressions re-review `[TODO]` (low)
Three carried ignores (flask-cors, pyjwt, pytest) — re-check whether fixed
versions now exist; drop stale suppressions.
Log:
- 2026-08-31: Plan created.

---

## Open questions for the user (rolling)

- SEC-14: authorize the prod `JWT_SECRET_KEY` vs Supabase JWT secret comparison.
- OPS-01: fund/approve a staging Supabase project (the single highest-impact fix).
- OPS-03: approve a gated migration-apply step in the release pipeline.
- OPS-05: keep direct-push-to-main, or add a PR gate now that CI is solid?
- OPS-06: have the owning session commit `marketing/` + `marketingUrl.js`.
- OPS-09: schedule the CRLF normalization window.
- CI-05: should integration tests gate the prod deploy?
- QB-06: fence the repository pattern (recommended) or fund the full migration?
- HYG-02: keep or delete the `verify/` scripts?
- SEC-06: advisor daily summaries are still pilot-only (one inbox). Set
  `ADVISOR_SUMMARY_EMAIL_ALLOWLIST='*'` in prod to roll out to all advisors.
