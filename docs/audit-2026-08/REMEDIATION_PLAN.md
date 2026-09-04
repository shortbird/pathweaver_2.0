# Audit Remediation Plan — 2026-08-31

Source: third-party-style technical audit of 2026-08-31 (four specialist reviews:
security, backend architecture, frontends, testing/ops). Full report:
https://claude.ai/code/artifact/65c96cc7-21fc-48a5-8dd7-ac63abdb1c7f

Branch: `audit/remediation-2026-08`. Worktree: `.claude/worktrees/audit-remediation`
— this work stays isolated from the shared tree at `~/pathweaver_2.0`, where other
agents hold uncommitted work.

History: Phase 0 (SEC-01..SEC-08) and the SEC-14 prerequisites landed on `main` in
merge `f3de2bc6`, after which the branch and worktree were deleted. Both were
recreated on 2026-09-03 from `origin/main` @ `5535cd90` to continue with Phase 1.
If the worktree is missing again at session start, recreate it the same way:
`git worktree add -b audit/remediation-2026-08 .claude/worktrees/audit-remediation origin/main`.

Shipped so far:
- 2026-09-03, merge `f3de2bc6`: Phase 0 (SEC-01..SEC-08) + SEC-14 prerequisites.
- 2026-09-03, later the same day: SEC-10 steps (a) and (c)'s parent cluster
  landed on `main` directly (`4dc501fe`, `89560e28`) — including the gate bug
  fixed below, which is why it reached production.
- 2026-09-03, this branch merged to `main` on the user's instruction: FU-01..FU-04,
  the SEC-10(a) fix, SEC-10(b)'s widened census, and SEC-10(c) for dependents,
  transcript_generator, SIS students and SIS staff. Verified before pushing —
  ruff clean, mypy clean (1030 files), pyflakes clean, backend 4810 passed /
  160 skipped / 0 failed, web v1 2474 passed / 281 files. The v2 mobile suite
  was NOT run locally (no `frontend-v2/node_modules` in this worktree); no v2
  source changed on this branch, and CI runs it on the push.

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
9. **Frontend tooling note:** `frontend/node_modules` is installed in this
   worktree; `frontend-v2/` is NOT, so the mobile jest suite cannot run here
   without an `npm install` first. `mypy` is likewise not in the shared venv by
   default — `pip install mypy types-requests` (done 2026-09-03).
10. **Never assert a migration's state from a neighbouring object.** Nothing
    in the pipeline applies `supabase/migrations/` (OPS-03), so "is this live?"
    is always a question for the database, not the repo. Check the objects that
    migration actually changes — a file can deliberately skip one function and
    fix four others. See "Migrations: what is actually applied to production".
11. **Security fixes must fail closed.** When in doubt between breaking a caller
    and widening access, break the caller and note it in the Log.
12. **When editing auth/authz code** (SEC items): read the whole function and its
    call sites first; sample tests exist under `backend/tests/` for most of it.
    New routes' role lists always include `superadmin` (CLAUDE.md rule 8).
13. **Statuses:** `TODO`, `IN PROGRESS`, `DONE`, `WONTFIX(reason)`,
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

### SEC-10 — No structural ownership enforcement on ~138 id-parameter routes `[DONE]`
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
DONE 2026-09-03: 217 id-bearing routes accounted for — 172 declare
`@require_relationship_to`, 26 are superadmin-verified, 19 are allowlisted with
a written reason (and most of those would be WRONG to migrate; see the last Log
entry). The guard runs in CI and fails on any new id-bearing route that neither
declares a policy nor is listed.
Log:
- 2026-08-31: Plan created.
- 2026-09-03: (a) and (b) done, (c) started — 1 module of 52 migrated.

  VERIFIED FIRST, and the finding is narrower than "138 routes unprotected".
  Censused the live url_map: 187 rules take a person-id path param (user_id,
  student_id, target_user_id, child_id, dependent_id) across 56 modules, not
  138. Then checked each for a gate at the route AND one hop into
  services/utils/repositories. Twelve had neither; eleven of those are
  @require_admin, which is superadmin-only (so there is no other org to leak
  to), and the twelfth
  (GET /api/sis/classes/<id>/students/<id>/progress) proves class-moderator
  rights via `_authorize` and then requires an active class_enrollments row.
  So: ZERO routes are missing a check. The audit's own framing was right —
  the checks are correct and the enforcement of their existence is what does
  not exist. Nothing here is a live vulnerability; do not report it as one.

  (a) `utils/auth/relationships.py` — `@require_relationship_to(param,
  allow=(...))`. The predicates are NOT new: it composes the ones
  utils/portfolio_access already owns (is_parent_of, is_advisor_of,
  is_observer_of, teaches_student, is_peer_of) plus `self` and an `org_staff`
  that delegates to org_scope.caller_can_access_user — re-deriving them would
  recreate the four-divergent-copies bug that module was written to end.
  `allow` is required (a default would be a policy nobody chose), unknown
  relationship names raise at decoration time (the SEC-01 lesson), and every
  failure mode denies: no target, empty target, unknown caller, failed staff
  lookup, and a predicate that raises. It authorizes the masquerade target,
  like the rest of the family. It does NOT inject user_id, so it is meant to
  stack under @require_auth — noted in test_no_stacked_auth_decorators so
  nobody adds it to that regex and bans the pattern.

  (b) `tests/unit/test_id_routes_declare_relationship.py`. A route passes by
  declaring the decorator, by being superadmin-only, or by an allowlist entry
  naming where its check lives. The superadmin tier is VERIFIED, not trusted:
  require_admin/require_superadmin/require_admin_identity now set
  `_superadmin_only`, so loosening a route to a narrower decorator drops the
  marker and the route lands back in the failing set. Three companion tests
  keep the allowlist honest — no stale entries, no placeholder reasons, and
  no entry left behind after a route migrates. Confirmed it has teeth by
  registering a probe route and watching it fail. 21 superadmin-verified +
  166 allowlisted = 187, fully accounted.

  WHAT THE ALLOWLIST IS AND IS NOT: per module, the gate mechanism was read
  and named (verify_parent_access, verify_advisor_access,
  caller_can_access_user, _can_register, _student_in_org, _authorize,
  can_view_portfolio, org-scoped SIS queries, ...). It is NOT a line-by-line
  proof that each of the 166 enforces the right relationship for its payload.
  The test says so in its docstring. Migrating an entry to the decorator is
  what converts it into an enforced claim.

  (c) First module migrated: `routes/parent/quests_view.py` (3 read routes) ->
  `allow=('parent', 'observer')`, which is exactly what verify_parent_access
  grants with allow_observer=True. The inner call stays as the precise check;
  the decorator is the structural outer gate, so the migration cannot narrow
  access for anyone who works today. Allowlist is now 163.
  Remaining after the parent cluster, in descending size: dependents (12),
  admin/transcript_generator (10), sis/__init__ (8), sis/parent (8),
  advisor/learning_moments (7), portfolio (7), oea (6), admin/transfer_credits
  (5), then a long tail of 1-4.

  Also fixed here: the new module's `from middleware.error_handler import ...`
  tripped test_import_layers (utils -> middleware, baseline 12 -> 13). Did not
  raise the baseline — that file says not to. The exceptions now come through
  the sibling utils/auth/decorators, which already carries that edge, so the
  coupling stays in one file and the eventual fix is one site, not a set.

  Tests: 4713 passed, 160 skipped, 0 failed (full backend suite, CI env).
  pyflakes undefined-name gate clean.
- 2026-09-03: (c) continues — the whole `routes/parent/*` cluster migrated, 34
  routes across 8 modules. Allowlist 163 -> 129; declared 3 -> 37.

  The mapping is verify_parent_access's own allow_observer split, made
  declarative: read paths get `allow=('parent', 'observer')` (15 routes), write
  and private-message paths get `allow=('parent',)` (22 routes) — the IDOR-H4/H5
  distinction, which was previously a keyword argument buried in the body.

  EQUIVALENCE CHECKED AGAINST PRODUCTION, not assumed. The decorator is an
  OUTER gate over a helper that still runs, so it may not be narrower than
  verify_parent_access anywhere. Three places where it is wider on paper:
    - is_parent_of accepts parent_student_links status in ('approved','active'),
      verify_parent_access only 'approved'. Prod has 131 links, ALL 'approved' —
      no divergence exists.
    - is_parent_of matches managed_by_parent_id without also requiring
      is_dependent. Prod: 238 rows carry managed_by_parent_id and every one has
      is_dependent = true, so no divergence. promote_dependent_to_independent
      clears BOTH fields together, which is why.
    - platform staff qualify by designated email as well as superadmin role.
      Deliberate, and matches can_view_portfolio.
  So on real data the two gates are exactly equivalent today.

  PERF, found while doing this: _is_platform_staff ran FIRST, spending a users
  lookup on every request to answer a question that is False for the parents and
  teachers who are essentially all of this traffic. It is an OR, so order cannot
  change the answer — only the cost. Moved to the deny path: a caller who
  matched a declared relationship never pays for it now.

  TEST PATTERN, which will recur across the remaining 129. Two gates means two
  grants, and 14 tests failed because they satisfied only the inner one. Fixed
  two ways, both of which keep the tests' intent:
    - Full-stack tests through the Flask client (test_signed_upload_routes):
      patch `utils.portfolio_access.is_parent_of` alongside the existing
      verify_parent_access patch. The gate genuinely applies there.
    - Tests that call the view directly through `__wrapped__` to bypass auth
      (test_parent_child_name): unwrap the whole stack in a loop instead of one
      layer. They deliberately test view logic rather than gates, and the gate
      has its own tests.

  ANSWERED, same day: the user said collapse. Done in the next commit — the
  decorator is now the ONLY gate on all 37 migrated parent routes. See below.

  Tests: 4713 passed, 160 skipped, 0 failed. pyflakes clean.
- 2026-09-03: COLLAPSED to one gate on the user's instruction. All 37 inner
  verify_parent_access calls removed from routes/parent/*; @require_relationship_to
  is now the only thing standing between a caller and another family's child.

  Checked before removing, not after: every one of the 37 call sites is inside a
  function that carries the decorator, and the decorator's allow set matches the
  call's allow_observer on every one (a script asserted the pairing rather than
  eyeballing it). Re-asserted afterwards that zero id-bearing routes in
  routes/parent/ are left ungated. Removal was scoped by AST to functions with
  the decorator, so a route that had not been migrated could not lose its check.

  verify_parent_access itself STAYS. Nine call sites outside routes/parent/ still
  use it — routes/observer/activity.py, routes/quest/enrollment.py and
  routes/learning_events/crud.py — and routes/helper_evidence.py has its own
  same-named function with a different signature, which is worth knowing before
  anyone greps for callers and concludes it is dead.

  Stale comments fixed rather than left lying: child_profile's module docstring
  and, more importantly, its admin-client justification, which said
  "verify_parent_access below is the gate" and pointed at a line that no longer
  exists. An admin-client justification that names the wrong gate is worse than
  none — it reads as reviewed.

  Tests reworked, not just repaired. test_parent_child_name's two gate tests
  asserted against a helper that no longer runs on that route, so they now test
  the real thing: one reads the declaration off the route
  (allow == ('parent',), i.e. observers excluded), and two drive the actual
  decorator with is_parent_of stubbed True and False, proving it lets a guardian
  through and refuses everyone else BEFORE the view runs. That is strictly
  stronger than the mock-call assertion it replaces.

  Tests: 4714 passed, 160 skipped, 0 failed. pyflakes clean.
- 2026-09-03: (c) continues — `routes/dependents.py` migrated, 12 routes.
  Declared 37 -> 49, allowlist 129 -> 117, superadmin tier unchanged at 21;
  49 + 21 + 117 = 187, still fully accounted.

  All twelve declare `allow=('parent',)`. No observer read tier here, unlike
  routes/parent/*: none of these is a read-only view of schoolwork. The mildest
  is a profile read carrying the child's date of birth; the rest rename the
  child, replace their avatar, DELETE the account, promote them to an adult
  login, change AI permissions, or mint an act-as token that browses as them.

  NOT COLLAPSED, and this is the part that differs from the parent cluster —
  where the decorator replaced verify_parent_access outright because the two
  were exactly equivalent on production data. Here they are NOT equivalent.
  These routes gate on `users.managed_by_parent_id == caller`; the decorator's
  `parent` predicate is `is_parent_of`, which ALSO accepts an approved
  `parent_student_links` row. Measured, not assumed: of the 131 approved links
  in prod, 129 point at a student whose managed_by_parent_id is somebody else.
  Collapsing would have handed those 129 real pairs delete, promote and act-as
  over a teen who is not their dependent. So the decorator is the outer
  structural gate and the managed_by_parent_id checks stay as the precise one.
  Recorded in the allowlist comment and in the new test's docstring, because
  "the last cluster collapsed, so this one should" is the obvious wrong move
  for the next session.

  Safe in the other direction, which is what actually had to be checked: the
  decorator can only be a superset of the in-view check, since `is_parent_of`
  matches managed_by_parent_id too. Nobody who works today is denied. Superadmin
  is unchanged as well — `verify_parent_role` lets a superadmin past the role
  check but `get_dependent(id, caller)` then refuses them, and it still does.

  Route inventory verified one at a time rather than trusting the allowlist's
  one-line reason, which said "managed_by_parent_id" for all twelve and was
  wrong for three: resend_student_invite gates on an approved
  parent_student_links row, and toggle_child_ai_access /
  update_child_ai_features accept either mechanism. `is_parent_of` covers all
  three shapes.

  Tests: the pattern from the parent cluster recurred exactly as predicted.
    - tests/test_dependent_add_login.py called the view through
      `__wrapped__.__wrapped__`, a hardcoded depth that broke when the stack
      grew to three. Now unwraps in a loop, with a comment saying why the
      number must not come back.
    - tests/test_add_child.py drives the real Flask client, so the gate genuinely
      applies: `_post` now patches `utils.portfolio_access.is_parent_of`
      alongside the existing grants. Its stranger test kept its meaning and
      gained a sibling — `test_the_relationship_gate_refuses_before_the_view_runs`
      sets the in-view lookup to ALLOW and the relationship to deny, so a 403
      proves the refusal came from the decorator.
    - New: tests/unit/test_dependents_relationship_gate.py pins the declaration
      of all twelve (param and allow set) off the registered app rather than the
      source text, and fails if the module gains an id-bearing route that nobody
      has decided a policy for.

  ruff clean, mypy clean, pyflakes clean.
  Tests: 4753 passed, 160 skipped, 0 failed.

  Remaining clusters after this one, descending: admin/transcript_generator
  (10), sis/__init__ (8), sis/parent (8), advisor/learning_moments (7),
  portfolio (7), oea (6), admin/transfer_credits (5), then a tail of 1-4.
- 2026-09-03: (c) continues — `routes/admin/transcript_generator.py` migrated
  AND collapsed, 10 routes. Declared 49 -> 59, allowlist 117 -> 107,
  superadmin 21. 59 + 21 + 107 = 187.

  All ten declare `allow=('org_staff',)` on `user_id`, and the ten inline
  `caller_can_access_user(...)` blocks are gone. Collapsing was right here and
  wrong for dependents, for a reason worth keeping straight: `org_staff` calls
  the SAME `caller_can_access_user`, with the same admin client and the same
  caller id — `require_school_admin` resolves its caller through
  `authorizing_user_id()`, exactly as the decorator does. That is an identity,
  not a superset. The decorator's extra platform-staff grant adds nobody:
  `caller_can_access_user` already returns True for superadmin, and the only
  other address in OPTIO_STAFF_EMAILS belongs to an org 'parent' (checked in
  prod) whom `require_school_admin` refuses long before the gate.

  What the move buys beyond the declaration: `/send` now refuses FIRST. Its
  inline check sat after school-name, recipient-email, base64, PDF-magic-byte
  and 15MB size validation, so a caller with no business near the student could
  distinguish those errors from one another and push a 15MB base64 decode,
  before being told no. `test_the_refusal_comes_before_the_payload_is_even_looked_at`
  pins that: an empty body is 400 for an in-org admin and 403 for an out-of-org
  one, so the order cannot silently slip back.

  These routes had NO tests — the full suite stayed green through both the
  migration and the collapse, which is not reassurance. New
  tests/unit/test_transcript_org_scope_gate.py: the declaration of all ten
  (param and allow, read off the registered app), an accounted-for check so an
  eleventh route cannot slip in, and the two behavioral tests above driven
  through the real Flask client.

  IDOR-C1's provenance moved with the code rather than being deleted with the
  comments: the module docstring now records what the gate is, that it is the
  IDOR-C1 fix, and that `update_course_names` keeps its inline check because it
  takes a transfer-credit id and resolves the student from the row.

  ruff clean, mypy clean. Tests: 4766 passed, 160 skipped, 0 failed.

  Remaining clusters, descending: sis/__init__ (8), sis/parent (8),
  advisor/learning_moments (7), portfolio (7), oea (6),
  admin/transfer_credits (5), then a tail of 1-4.
- 2026-09-03: BUG IN (a), FIXED. The decorator was swallowing exceptions raised
  by the VIEW and answering 403. Found by accident while writing a test for the
  sis cluster; it had been live on every migrated route since (a) landed
  earlier the same day, and by the time it surfaced 59 routes were behind it.

  The allow branch returned `f(*args, **kwargs)` from INSIDE the predicate
  loop's `try`, so the `except Exception` written for "a predicate that blows
  up is not an allow" also caught everything the view raised. Three
  consequences, none of which looks like this bug from a report:
    - the caller was told "Not authorized to access this student" about a
      student they were authorized for;
    - middleware/error_handler never saw the exception, so a view's deliberate
      404 or 400 never reached the client;
    - Sentry got nothing, because the handler logged and continued.
  And it hid itself: the platform-staff branch returns OUTSIDE any try, so a
  superadmin reproducing a user's report saw the real error while the user saw
  a 403.

  Fix: the loop only sets a flag; the view is called after the gate has
  finished. Staff is still evaluated lazily (`not allowed and not
  _is_platform_staff(...)` short-circuits), so the ordering work from the
  parent cluster is preserved.

  Four tests in test_require_relationship_to.py: an ordinary exception
  propagates, an AuthorizationError from the view keeps its own message (the
  nastiest shape — same status code, wrong reason, trail pointing at the wrong
  module), the staff path propagates too so the two branches cannot drift, and
  a denial still stops the view from running. The first two FAIL against the
  pre-fix decorator; verified by restoring it and watching them go red.

  SHIPPED to prod 2026-09-03 on the user's instruction, in the merge of this
  branch into `main`. It was not branch-local: `origin/main` @ `89560e28`
  carried it and release `e4df8fef` deployed it at 20:54 UTC the same day, so
  the 37 collapsed parent routes ran it in production for roughly two hours.
  Measured exposure while it was live: 30 of the 37 catch their own exceptions
  and never reached the gate's handler; the 7 that do not are
  analytics_insights.get_student_progress and .get_learning_insights,
  child_overview.get_child_overview, dashboard_overview.get_parent_dashboard,
  evidence_view.get_task_details and .get_recent_completions, and
  quests_view.get_student_calendar. For those, an error inside the view reached
  the parent as a 403 and reached neither middleware/error_handler nor Sentry —
  so there is no Sentry trail from that window to go back and read, which is
  itself the reason to treat "the gate swallowed it" as a whole bug class
  rather than one incident.
- 2026-09-03: (c) continues — the eight student routes in `routes/sis/__init__.py`
  migrated. Declared 59 -> 67, allowlist 107 -> 99, superadmin 21. 187 accounted.

  `allow=('org_staff',)` on `student_id`: profile read and edit, class list,
  enrollment change, message to guardians, and the three emergency-contact
  routes, which carry a minor's contact names, phone numbers and pickup
  authorization. `@require_role(*ADMIN_ROLES)` answers "is this caller
  front-office staff"; the decorator answers "of THIS student's school". One
  decorator per question.

  NOT collapsed, for a third distinct reason — worth recording, since all three
  clusters so far have needed a different answer:
    - routes/parent/*: collapsed, the two gates were exactly equivalent.
    - routes/dependents.py: kept, the decorator is strictly WIDER than
      managed_by_parent_id on real data (129 link-only pairs).
    - routes/sis/*: kept, because `org_id` is a parameter of the WORK and not
      only of the check. `_org_or_error` resolves it, every sis_service query
      filters on it, and for a superadmin it is the `org` they asked for rather
      than one derived from the student. Deleting the check would take the
      queries' scope with it.

  Denial direction verified: a non-superadmin's `resolve_org_id` returns their
  own `users.organization_id` and `student_in_org` compares the student's, which
  is exactly what `caller_can_access_user` compares; a superadmin passes the
  decorator outright. Nobody who works today is refused.

  New tests/unit/test_sis_student_org_gate.py: the declaration of all eight, an
  accounted-for check, and two behavioral cases through the real client where
  everything downstream is stubbed IDENTICALLY, so the only difference between
  the 403 and the 200 is the relationship answer. Note the 403: the in-view
  filter used to produce a 404, which reads the same as "no such student" — the
  refusal is now about the caller rather than the record.

  A GAP IN THE GUARD, found while doing this and NOT yet fixed: `ID_PARAMS`
  covers user_id, student_id, target_user_id, child_id and dependent_id, so the
  census of 187 misses roughly 30 more routes that name a person under another
  parameter — `staff_id` (10 SIS staff routes), `target_id` (sis people/users),
  `advisor_id`, `observer_id`, `parent_id` (COPPA consent approve/reject),
  `member_user_id`, `admin_id`, `subject_id`, `blocked_id`. The guard's own
  docstring says to add the name rather than special-case a route. Doing so
  puts ~30 unreviewed routes into the failing set, each needing the same
  read-and-name pass, so it is its own item rather than a footnote here. It is
  the highest-value SEC-10 work left: the audit's point was that nothing fails
  when a new route forgets a check, and a guard blind to 14% of the surface
  only partly answers that.
- 2026-09-03: (b) WIDENED — the blind spot above is closed. The census goes
  from 187 routes to 217; the guard now covers 30 routes it could not see.
  Declared 67, superadmin-verified 26, allowlisted 124.

  `ID_PARAMS` gains staff_id, target_id, advisor_id, observer_id, parent_id,
  member_user_id, admin_id, subject_id, blocked_id. What was invisible: the
  entire SIS staff surface (10 routes, including set-roles and delete), SIS
  people and users (5), advisor assignment (4), family observer management (2),
  COPPA consent approve/reject, the admin audit logs, advisor notes, and
  unblock. Six of the 30 were already superadmin-verified and two already
  allowlisted via a second parameter; the other 26 were read one at a time and
  named, to the same standard as the original 166.

  ONE ROUTE MOVED INSTEAD OF BEING LISTED. `observer.get_feed_item_viewers`
  took `<target_id>`, which holds a completion or a learning event, never a
  person. It is `<feed_item_id>` now. The alternative was teaching the guard
  that `target_id` sometimes names a person and sometimes does not, and a
  naming convention the guard cannot trust is not a convention. URL shape is
  unchanged, so both frontends are unaffected — they build the path and never
  see the parameter name.

  A PATTERN ABSENT FROM THE ORIGINAL 166, named in the allowlist so nobody
  "finishes the migration" by breaking it: in eight of these the person in the
  URL is the ROW SELECTOR, not the authorization subject. "Remove advisor A
  from class C" is authorized by rights over C; A only says which membership
  row to delete. Same for removing a family observer (scoped to the caller's
  own children) and unblocking (scoped to blocker_id = caller). Migrating one
  of those to @require_relationship_to would be actively wrong — there is no
  caller-to-A relationship to require, and inventing one would either refuse
  legitimate admins or grant a permission nobody meant to grant.

  One more distinction recorded rather than smoothed over:
  `admin_audit_logs.get_admin_activity` has no gate at all — it has a SCOPE.
  `org_scope` is None for a superadmin and the caller's own org otherwise, and
  the query filters on it, so another org's admin gets an empty list rather
  than a refusal. Its sibling `get_admin_statistics` does gate, with
  caller_can_access_user. Both are IDOR-H7 fixes and they are not the same
  mechanism.

  ruff clean, mypy clean. Tests: 4781 passed, 160 skipped, 0 failed.
- 2026-09-03: (c) continues — the 10 SIS STAFF routes the widening had just
  made visible are migrated, in the commit straight after the one that revealed
  them. Declared 67 -> 77, allowlist 124 -> 114, superadmin 26. 217 accounted.

  `allow=('org_staff',)` on `staff_id`: edit the profile, set which roles they
  hold, upload their photo, archive or delete them, restore them, re-send the
  invite that claims their login, and the two employment-profile routes that
  carry pay (already redacted per-field for coordinators by
  sis_staff_service.PAY_FIELDS — the decorator adds tenancy, not a pay tier).
  In-view org checks kept, same reason as the student routes.

  CHECKED BEFORE ADDING THE GATE, because `org_staff` would otherwise have been
  a silent lockout on the two routes that exist for exactly these people:
  archiving a staff member does not clear `users.organization_id` (it flips
  `sis_staff_profiles.is_active`), and placeholder staff rows carry an
  organization_id too. So restore_staff and link_staff still resolve.

  tests/unit/test_sis_student_org_gate.py -> test_sis_org_gates.py, now
  covering both sets: declarations for all 18, an accounted-for check per set,
  and the two behavioral cases through the real client.

  Tests: 4792 passed, 160 skipped, 0 failed. ruff clean, mypy clean.
- 2026-09-03: (c) continues — the ADVISOR surface, 15 routes across five
  modules (advisor/learning_moments 7, advisor/main 3, advisor_checkins 3,
  advisor/student_overview 1, helper_evidence 1). Declared 77 -> 92, allowlist
  114 -> 99.

  NOT collapsed. Every inner check here additionally requires the caller and
  the student to be in the SAME ORGANIZATION, which the `advisor` predicate
  does not test, and several are the union of an org check and an assignment
  check rather than either alone. The declaration is therefore the union of
  what each view grants — an outer gate, never a narrower one.

  Three allow sets, because a uniform one would have lied about two routes:
    - `('advisor', 'org_staff')` on 13 of the 15.
    - `('org_staff',)` on advisor.assign_student. Assigning IS what creates the
      advisor relationship, so requiring one first would deny every legitimate
      call — the failure mode you only find by reading the view rather than
      pattern-matching the module.
    - `('advisor', 'parent')` on helper_evidence.get_student_tasks_for_evidence,
      which serves parents as well. Its LOCAL verify_advisor_access — not the
      shared function of the same name in routes/advisor/student_overview.py —
      requires an assignment even for an org_admin, so declaring org_staff would
      have described a permission the view does not grant. The allowlist had
      grouped it with the shared helper; that grouping was wrong.

  Test fallout, the same shape as every cluster so far: test_signed_upload_routes'
  mock_advisor_admin fixture patched only the in-view verify_advisor_access, so
  two happy-path tests were refused at the door by a 403 that looks exactly like
  the thing they are not testing. It now grants both gates and says why.

  ruff clean, mypy clean. Tests: 4810 passed, 160 skipped, 0 failed.
- 2026-09-03: (c) continues — `routes/sis/parent.py`, 8 routes. Declared
  92 -> 100, allowlist 99 -> 91. This one needed a NEW RELATIONSHIP first.

  These routes authorize through `sis_parent_service.registerable_students`,
  which resolves a family THREE ways: `household_members` rows,
  `users.managed_by_parent_id`, and approved `parent_student_links`.
  `is_parent_of` knows the last two. The first is how the SIS registration
  funnel builds a family, and for a microschool it is nearly every family — so
  declaring `('parent',)` would have been NARROWER than the view and refused
  those guardians at the door. Worth stating plainly because the pull is real:
  when the vocabulary does not fit, extend the vocabulary; do not round the
  declaration to the nearest existing word.

  So: `utils/portfolio_access.is_household_guardian` (caller holds a guardian
  `household_members` row in a household where the student holds a 'student'
  row), registered as `household_guardian`. It deliberately does NOT re-check
  that the org has SIS enabled, as registerable_students does — "are these two
  family" does not stop being true because a school turned a module off, and
  the module gate is a separate question with its own answer. Declared set:
  `('parent', 'household_guardian')`. Not collapsed; `_can_register` also scopes
  to the requested org.

  ONE DEFINITION OF GUARDIAN, while I was here. The tuple `('guardian', 'other')`
  existed twice — `sis_parent_service.GUARDIAN_RELATIONSHIPS` and
  `sis_waitlist_service._GUARDIAN_RELATIONSHIPS`, the second carrying a comment
  admitting it was a copy. utils/ needs it too and may not import services/
  (test_import_layers), so it moved to `config/constants`, which all three
  layers may read, and both services now import it. A third copy in utils would
  have been exactly the divergence portfolio_access was written to end.

  Ratchet raised deliberately: `test_direct_db_calls_do_not_grow` BASELINES
  ['utils'] 128 -> 130 for the new predicate's two reads. utils/portfolio_access
  is the module whose entire job is answering cross-user questions against the
  database — every predicate beside it is two such reads — and utils/ may not
  import repositories/ anyway. Reason recorded in the file.

  Tests reworked, not just repaired: TestParentClaimRoute's three cases now go
  through a `_post` helper that grants the relationship by default, so each is
  about the SERVICE's decision; `test_claim_not_authorized` in particular would
  otherwise have kept passing on a 403 from the wrong gate even if the service
  check were deleted. A fourth case stubs the service to SUCCEED and denies the
  relationship, so a 200 would prove the request got through on nothing but a
  student id in the URL.

  ruff clean, mypy clean. Tests: 4811 passed, 160 skipped, 0 failed.
- 2026-09-03: (c) continues — PORTFOLIO (6) and OBSERVER (7). Declared
  100 -> 113, allowlist 91 -> 78.

  Portfolio splits by the question asked, not by the module:
    - `get_user_portfolio` declares can_view_portfolio's seven grants —
      `('self','parent','advisor','teacher','observer','peer','org_staff')`.
    - visibility-status, privacy and the three transcript-share routes declare
      `('self','parent','advisor','org_staff')`, matching can_manage_privacy,
      which is deliberately narrower: a class teacher reads a portfolio but does
      not get to publish it.
  Not collapsed — can_manage_privacy also refuses a MINOR acting on their own
  portfolio, and no relationship can express "self, if adult".

  TWO PORTFOLIO ROUTES STAY, and the reason generalizes: `get_public_diploma_by_user_id`
  and `learning_events.get_public_learning_events` carry no @require_auth at
  all. They answer anonymous callers from the portfolio's own privacy setting
  (plus, for the diploma, a signed LTI evidence token). @require_relationship_to
  demands an authenticated caller, so decorating either would 403 every
  legitimate anonymous visitor. A route with no caller is not a route with an
  unchecked caller — the allowlist now says so in those words.

  Observer needed four different allow sets across seven routes, because the
  views admit different callers: `('self','parent','observer')` for the activity
  feed, `('self','observer')` for comments (its own docstring says exactly
  that), `('observer',)` for learning moments and portfolio, and
  `('self','parent')` for the three parent_management routes, which are about
  MANAGING a child's observers. A uniform set would have overstated three of
  them.

  Test fallout worth recording, because it is a seam future migrations will hit:
  test_ferpa_access_logging stubbed the session with
  `get_effective_user_id` only. @require_auth reads that; the relationship
  decorator resolves the caller through `authorizing_user_id()`, which reads
  `get_actual_admin_id()`. So six FERPA tests 401'd. Fixed by stubbing the
  SESSION rather than the gate, which keeps the gate itself under test, and by
  keying `is_observer_of` off the same `has_link` flag the in-view mock uses —
  so the refusal test still refuses, now at the door.

  ruff clean, mypy clean. Tests: 4811 passed, 160 skipped, 0 failed.
- 2026-09-03: (c) continues — `routes/admin/transfer_credits.py`, 5 routes,
  migrated AND collapsed. Declared 113 -> 118, allowlist 78 -> 73.

  Identical shape to transcript_generator: `@require_school_admin` plus an
  inline `caller_can_access_user` in every handler, added as the IDOR-C2 fix.
  `org_staff` calls that same function with the same admin client and the same
  caller id, so collapsing is an identity rather than a widening — the same
  argument, verified the same way.

  `get_transfer_credits` also declares `discloses='transfer_credits'`, so a
  staff member reading another student's external transcript record now writes
  a FERPA disclosure row (SEC-15). The four write routes do not: a write is not
  a disclosure of a record.

  THE GUARD EARNED ITS KEEP HERE. I migrated the five routes and forgot to
  remove their allowlist entries; `test_migrating_a_route_removes_its_allowlist_entry`
  failed the build. Without it the entries would have sat there claiming an
  inline check that no longer exists, which is the exact failure mode SEC-13
  found in the admin-client comments — a justification that names the wrong
  gate reads as reviewed.

  ruff clean, mypy clean. Tests: 4858 passed, 160 skipped, 0 failed.
- 2026-09-03: (c) continues — `routes/oea.py`, 6 routes. Declared 118 -> 124,
  allowlist 73 -> 67.

  THREE allow sets, because the module has two gates that mean different things
  and one of them has an explicit prohibition in it:
    - `('self', 'parent')` on the four reads. `_verify_manages_student` takes
      `allow_self=True` on exactly those, so an OEA student can see their own
      diploma; the declaration preserves that split rather than flattening it.
    - `('parent',)` on `add_student_credit`, which never passes `allow_self` —
      a student may read their record and not write to it.
    - `('org_staff',)` on `set_credit_caps`, and only there. Its helper's
      docstring says outright that PARENTS CANNOT raise their own student's
      limits, so declaring `parent` on that route would have inverted the rule
      the endpoint exists to enforce. This is the case where copying the
      module's dominant pattern would have been a security bug rather than a
      style slip.

  Not collapsed: both helpers also resolve the student's ORG, which no
  relationship answers.

  Test fallout, the familiar shape: 17 blocks in test_oea_routes.py stubbed
  `_verify_manages_student` alone and were refused at the door. All now grant
  `is_parent_of` alongside it, with a comment saying why.

  ruff clean, mypy clean. Tests: 4858 passed, 160 skipped, 0 failed.
- 2026-09-03: (c) continues — three more clusters, 11 routes.
  Declared 124 -> 135, allowlist 67 -> 56.

  `routes/xp_goals.py` (4): declares
  `('self','parent','advisor','teacher','observer','org_staff')` — exactly
  `can_view_goal`, which is `can_view_portfolio(allow_peers=False)`. The
  ABSENCE of `peer` is the declaration's whole content, and it is now written
  where a reviewer sees it: peer connections were sold to families as "see each
  other's work", and a personal weekly XP target is not work.

  `routes/sis/student_records.py` (4): three staff routes declare
  `('org_staff',)`, and `parent_student_record` — the parent-facing mirror of
  the same record — declares `('parent',)`, because `_is_my_student` is a family
  check and not an org one. Two of them carry
  `discloses='student_record'` (SEC-15); the writes do not.

  `routes/treehouse.py` (3): the wallet-balance read, the manual balance
  adjustment and the cohort withdrawal declare `('org_staff',)`, matching
  `_context`'s facilitator-in-this-org check. `remove_cohort_advisor` stays
  allowlisted — it is one of the row-selector cases, gated on rights over the
  COHORT.

  ruff clean, mypy clean. Tests: 4858 passed, 160 skipped, 0 failed.

- 2026-09-03: (c) continues — SIS attendance (2) and CLP (2).
  Declared 135 -> 139, allowlist 56 -> 52. Both declare `('org_staff',)`,
  matching `_org_or_error`'s caller-resolved org; the two reads carry
  `discloses='attendance'` / `'clp'`.

  test_sis_attendance's `staff()` context manager now grants the relationship
  too, with a `same_org_as_student` parameter so a future test can deny it —
  the in-view org scoping it already stubbed is the SECOND gate now, not the
  only one.

- 2026-09-03: (c) continues — admin student-task management (4), SIS tuition
  (3), SIS class quests (2). Declared 139 -> 148, allowlist 52 -> 43.

  `admin/student_task_management` declares `('advisor', 'org_staff')`, the union
  of what `_can_manage_student_tasks` grants (superadmin any, org_admin
  same-org, advisor with an active assignment). `sis/tuition` declares
  `('org_staff',)`. `sis/class_quests` declares `('teacher', 'org_staff')` —
  `teaches_student` is exactly the "teaches a class this student is actively
  enrolled in" relationship those two routes gate on through `_authorize` plus
  an active `class_enrollments` row.

  Two more test-seam repairs of the shapes already seen: another `staff()`
  context manager that granted only the in-view org check, and
  `test_class_student_reminder`'s `getattr(view, '__wrapped__', view)` — a
  single-layer unwrap that landed on the relationship gate instead of the view
  once the stack grew. Both now unwrap or grant completely, with the reason
  written down.

- 2026-09-03: (c) continues — the rest of the SIS surface, 8 routes across
  four modules (sis/__init__ people+users+household, catalog, goals,
  prior_learning). Declared 148 -> 156, allowlist 43 -> 35.

  Seven declare `('org_staff',)`. `sis_goals.save_goals` declares `('parent',)`
  — it is the family-facing goal form, gated by `_is_my_student`, and giving it
  org_staff would have handed the school write access to a form the family
  fills in.

- 2026-09-03: (c) continues — seven admin/org-scoped routes across five modules
  (user_management 3, organization_management, org_connections, audit_logs,
  school_inbox). Declared 156 -> 163, allowlist 35 -> 28.

  Six declare `('org_staff',)`. `get_user_quest_enrollments` declares
  `('advisor', 'org_staff')` — it is `@require_advisor`, so an assigned advisor
  reaches it without being org staff.

  One more single-layer `__wrapped__` repaired, in
  test_admin_update_user_profile_scoping. That is the fourth of that shape this
  session; the pattern is now written down in three test files.

  SESSION TOTAL for (c): declared 37 -> 172 of 217, allowlist 166 -> 19.

- 2026-09-03: (c) FINISHED, in the sense that matters: every route that SHOULD
  declare a relationship now does. The last batch was 9 routes —
  classes/students (2), xp_reconciliation (2), credit_dashboard,
  org_member_status, credits.get_transcript, and direct_messages' two
  child-conversation reads.

  `credits.get_transcript` declares all seven relationships, matching
  `can_view_portfolio` exactly, plus `discloses='transcript'`.
  `classes/students` declares `('teacher','org_staff')`.

  THE 19 THAT REMAIN ARE NOT A BACKLOG. Each has a written reason and most
  would be WRONG to migrate:
    - **9 row-selector routes** — removing an advisor from a class or cohort,
      the four org_connections advisor pairs, removing a family observer,
      toggling their access, unblocking. The person in the URL is which ROW to
      change; authorization is over the class, the org, or the caller's own
      children. Declaring a relationship to that person would either refuse
      legitimate admins or invent a permission.
    - **3 unauthenticated by design** — the public transcript, the public
      diploma, public learning events. They answer anonymous callers from the
      portfolio's own privacy setting. A route with no caller is not a route
      with an unchecked caller.
    - **2 that are a SCOPE, not a gate** — `admin_audit_logs.get_admin_activity`
      filters results by the caller's org, and `advisor_notes.get_subject_notes`
      returns only the caller's own notes. Another org's admin gets an empty
      list rather than a refusal, which is a different (and fine) design.
    - **2 direct-message routes.** The clearest case of the vocabulary having
      limits: `can_message_user` is DIRECTIONAL and role-shaped — anyone may
      message a superadmin or their own org admin, and advisor<->student works
      both ways. Every predicate here is "caller is X to target", so
      `is_advisor_of(student, advisor)` is False and declaring `('advisor',)`
      would refuse a student messaging their own advisor. A messaging
      permission is not a relationship.
    - **masquerade.start_masquerade**, which has its own reason, and
      `group_messages.remove_member` / `parental_consent.check_consent_status`,
      both gated on something other than the caller's relationship to the id.

  So the honest end state is: 172 declared, 26 superadmin-verified, 19
  deliberately allowlisted with reasons, 217 accounted for. The audit's finding
  — "nothing fails when a new route forgets a check" — is closed: a new
  id-bearing route now fails the build unless somebody decides its policy.

### SEC-11 — 123 handlers return raw exception text in 500 bodies `[DONE]`
Pattern: `except Exception as e: return jsonify({'error': f'...{str(e)}'}), 500`
(e.g. `routes/advisor_checkins.py:85,137,159,198,242,266`). The centralized
fail-closed handler already exists (`middleware/error_handler.py`). Fix: let these
propagate (or re-raise as typed errors); add a guard test banning `str(e)`
interpolation into 5xx responses under broad excepts. Distinguish the ~176 benign
4xx ValidationError returns — leave those.
Accept: guard test green and enforcing; no 500 body carries exception text.
Log:
- 2026-08-31: Plan created.
- 2026-09-03: DONE. 242 sites, not 123 — the plan's number came from grepping a
  literal, an AST sweep finds the f-string and concat forms too.
  240 returned 500 and now `raise`, letting middleware/error_handler answer:
  fixed "An internal error occurred" in production, full detail in development,
  keyed off Config.FLASK_ENV and failing CLOSED on an unknown env, plus
  capture_exception so Sentry groups by stack rather than by timestamp. Every
  hand-built 500 was routing around all of that. Logging lines above the return
  were kept.
  The other 2 returned 503 from AI health checks, where the status is right and
  only the text leaked; those keep 503 and say "The AI service is not reachable
  right now" instead of whatever the exception said.

  ONE THING I GOT WRONG AND HAD TO UNDO. After converting, 70 handlers were left
  as `except X: raise`, which looks like a no-op. I deleted the 58 whose try had
  another handler — and five registration tests went red. A bare-raise handler
  placed BEFORE a broader one is not a no-op: `except ValidationError: raise`
  ahead of `except Exception:` is what stops the broad catch from swallowing
  validation errors, and removing it rerouted them into a 500. Restored the
  files from HEAD, re-ran the conversion (deterministic), and re-did the cleanup
  under the correct rule: delete only when the handler is LAST, so nothing after
  it could have caught the exception instead. That is 3 handlers, not 58.
  (It also surfaced a live latent bug it hit on the way through: registration.py
  reads Config in a branch where the name is only imported locally further down,
  so that path raises UnboundLocalError. Left alone — it is unreachable again
  now — but it wants its own item.)

  Guard: tests/unit/test_no_exception_text_in_5xx.py. 4xx is deliberately NOT
  banned — `except ValueError as e: return jsonify({'error': str(e)}), 400` is
  how a validation message reaches the caller who asked for it. The line is the
  status code.
  The guard's own first version globbed 'backend/**' from a root that already
  WAS backend/, scanned zero files and passed unconditionally. Caught only
  because the planted offender failed to trip it. It now carries a floor
  assertion for exactly that failure, as SEC-13's does.
  Tests: 4718 passed, 0 failed. ruff clean, mypy clean.
- 2026-09-03: The registration.py `Config` note above is now FU-01, and its
  "unreachable again now" read was wrong — see that item. Fixed there.

### SEC-12 — OAuth provider mints full-privilege session tokens, scope decorative `[DONE]`
`routes/auth/oauth.py:302,372` issue first-party session tokens; no consent UI;
scope enforced nowhere. Interim fix (autonomous): gate `/oauth/authorize` and
client registration behind a Config flag, default OFF, so the surface is closed
until scoped tokens + consent exist. Full fix (separate decision): scoped token
type + consent screen.
Accept: flag off by default; existing tests updated; full-fix scoped as follow-up.
Log:
- 2026-08-31: Plan created.
- 2026-09-03: Verified, and the finding is BOTH worse and less urgent than
  written. Fixed with the interim flag, which turns out to cost nothing.

  The surface does not work AT ALL in production. Its endpoints read
  `public.oauth_clients`, `oauth_authorization_codes` and
  `oauth_access_tokens`; none of those tables exists — checked the live
  database, where the only oauth-named tables anywhere are Supabase's own
  `auth.*` internals. `backend/migrations/20251226_create_oauth2_infrastructure.sql`
  creates them and was never applied (QB-05's legacy migration directory, and
  OPS-03's missing apply step). Every endpoint raises 42P01 on first contact
  with the database, so nothing can be using it and closing it breaks nobody.
  The audit's "mints full-privilege session tokens" was never realised: it
  mints 500s.

  Less urgent, then — but the trap is sharper than the finding describes. The
  one change a well-meaning person makes on seeing a 500 here is to apply the
  missing migration, and that single step converts a dead endpoint into "any
  registered client gets a full-privilege session token for any user who clicks
  a link, with no consent prompt and `scope` enforced nowhere". The risk is not
  today's state; it is how short the path from here to a real vulnerability is.

  So: `Config.OAUTH_PROVIDER_ENABLED`, default false, and the blueprint is NOT
  REGISTERED unless it is set. Absent beats broken — a 404 says "no such
  endpoint", which is true, where a 500 invites exactly the fix that would arm
  it. Both the flag's comment and the guard test say plainly that this is a
  lock with a note on it, not a toggle waiting to be flipped.

  Guard: tests/unit/test_oauth_provider_disabled.py — default off, no provider
  rule registered, each path answers 404 rather than 500, and Google sign-in
  still works. That last one matters: signing in TO Optio with Google or Apple
  is OAuth in the other direction, lives in different modules, and does not
  read this flag.

  STILL TODO, now developable behind the flag: a consent screen and a scoped,
  non-session token type. Both are product decisions rather than autonomous
  work.

  ruff clean, mypy clean. Tests: 4818 passed, 160 skipped, 0 failed.

### SEC-13 — Re-arm the admin-client justification gate `[DONE]`
`test_admin_client_justified` is deselected from CI; ~93 construction sites (audit
counts varied 93–195; measure first) lack the required justification comment.
Fix: add honest justification comments site-by-site (verifying each use is
legitimately admin — flag any that should be user-scoped as new SEC items), then
re-enable the test in `tests-backend.yml`.
Accept: test enforcing in CI; zero unjustified sites; suspicious sites logged.
Log:
- 2026-08-31: Plan created.
- 2026-09-03: DONE — but it was not the one-line change it looked like, and the
  reason matters more than the fix.

  The test PASSED on first run, which looked like the annotation work had
  already been finished by someone. It had not. The test matched lines
  textually and skipped any line without an `=`, on the stated reasoning that
  "only assignments are real call sites". They are not:

      return get_supabase_admin_client()                          # _admin() factory
      get_supabase_admin_client().table('users').select('role')   # inline
      if not caller_can_access_course(get_supabase_admin_client(), ...)

  AST census: 1070 real call sites, not the ~195 the plan estimated. 965 are
  assignments and every one was annotated — which is exactly why the test was
  green. The other 105 were invisible to it, and 85 of those had no
  justification. The gate reported success over precisely the population nobody
  had audited. Re-arming it as-was would have made that permanent and called it
  enforcement.

  Rewrote it on AST, so a call is a call however it is written. Two subtleties
  found by getting them wrong first:
    - Scanning only the contiguous comment block above the statement punished
      the most careful justifications — utils/portfolio_access.py explains its
      bypass in five lines, so the marker sat outside a 3-line window and the
      file read as unjustified.
    - Scanning only a fixed window punished the common shape where one line of
      setup sits between the reason and the call (routes/helper_evidence.py,
      utils/token_authority.py).
  The rule is now the union of both, and neither shape false-positives.

  Then wrote the 84 missing justifications, authored per module rather than
  stamped: each says WHY RLS must be bypassed and WHERE authorization actually
  happens. Every one was a legitimate bypass — SIS services acting for a whole
  school, messaging spanning both sides of a conversation, pre-session
  registration and public embeds with no caller at all, org_scope helpers that
  take a caller-supplied admin client by design, and pre-authorization reads of
  the caller's own role. Nothing here should have been user-scoped, so no new
  SEC items came out of it.

  Added test_the_scan_still_finds_call_sites — a guard on the guard. Every
  previous weakening of this test was invisible because it kept passing; a
  floor of 500 (against ~1070 real) catches "the scan broke", not churn.

  Deselect removed from tests-backend.yml, so it gates PR and release again.
  Verified with both shapes the old gate missed: a bare `return` and an inline
  `.table()` chain each fail the build now.
  Tests: 4716 passed, 160 skipped, 0 failed. pyflakes clean.

### SEC-14 — Verify the RLS backstop: does prod `JWT_SECRET_KEY` match Supabase? `[DONE]`
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
- 2026-09-03: CUTOVER DONE by the user, and VERIFIED end to end. RLS is real in
  production for the first time.
  Evidence, the same two probes that proved it broken, now inverted:
  (1) Runbook step 3: logged into prod as the OpenEd demo parent and called
      GET /api/users/transcript — the get_user_client() path that has never
      worked. 200 with data. Its first statement is
      `.table('users').select('*').eq('id', user_id).single()`, and .single()
      raises on zero rows, so this is positive proof the token verified AND the
      own-row policy matched, not a quiet empty result.
  (2) PostgREST probed directly in get_user_client's exact shape (apikey = anon
      key, Authorization = app JWT): 200, returning the caller's own row. The
      identical request returned 401 PGRST301 earlier the same day. Control:
      the same token with a corrupted signature still returns 401 PGRST301, so
      the 200 is a real signature check passing, not a gate that stopped
      running.
  Also confirmed live: prod is on 5535cd90, which contains SEC-14a and SEC-14b;
  a freshly minted access token carries `"role": "authenticated"` (SEC-14b is
  in effect, so the 16 policies written TO authenticated can now match).
  Sentry, last 24h on optio-backend: zero PGRST301, zero JWT signature
  failures, zero LTI errors. The only two open issues are unrelated —
  OPTIO-BACKEND-7A is 4 refresh-reuse warnings spread over a week (not the
  hundreds of verification failures a missing previous key would produce), and
  OPTIO-BACKEND-7Q is the row-truncation canary firing on
  announcement_recipients, which is its own bug and wants its own item.
  FLASK_SECRET_KEY_OLD: could not be read from here (the Render MCP writes env
  vars but cannot read them, and there is no logs tool), so the user was asked
  to check the dashboard. They CONFIRMED it is set — 2026-09-03. Step 1 of the
  runbook was done, the previous-key fallback is live, and pre-rotation tokens
  (including the 180-day LTI evidence tokens) still verify. The rotation is
  complete and correctly ordered; all that remains is not removing the old key
  before 2027-03-02.
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
    4. Remove FLASK_SECRET_KEY_OLD only after 2027-03-02 — 180 days, NOT the
       ~31 this step used to say. Corrected 2026-09-03; the old number was
       wrong and following it would have caused the exact outage SEC-14a was
       written to prevent. 31 days came from REFRESH_TOKEN_EXPIRY_DAYS=30, but
       the refresh token is not the longest-lived thing signed with that key:
       lti_service.EVIDENCE_TOKEN_TTL is 180 days, the tokens are STATELESS
       (nothing to re-issue and no record of who holds one), and prod LTI is in
       ACTIVE daily use — a launch landed at 18:39 UTC on cutover day. So
       SpeedGrader links minted right up to the rotation stay valid until
       2027-03-02, and dropping the previous key at day 31 would kill ~5 months
       of live Canvas gradebook links with nothing to retry.
       Cost of keeping it: FLASK_SECRET_KEY_OLD is verify-only — no code signs
       with it — so the exposure is an old key that can still validate old
       tokens, not a second live signing key.
  Rollback is symmetric: put the old value back in JWT_SECRET_KEY. Any token
  minted during the window verifies under either key.

### SEC-15 — FERPA disclosure logging covers only observer/advisor reads `[DONE]`
`utils/access_logger.py` is written to from only ~5 route modules. Extend to
parent dashboards, SIS staff student-record reads (`routes/sis/student_records.py`),
transcripts, and admin student views. Prefer a helper/decorator over 30 hand
inserts.
Accept: every student-record read path writes `student_access_logs`; test.
Log:
- 2026-08-31: Plan created.
- 2026-09-03: Done as a decorator argument, not thirty hand inserts — the plan
  asked for a helper and SEC-10 had just built the right place to put it.

  `@require_relationship_to(..., discloses='transcript')`. The gate is the only
  place that already knows all four things a disclosure record needs: who
  asked, whose record it was, which route, and — the part a hand-written insert
  usually gets wrong — WHICH RELATIONSHIP let them in. That last one is the
  difference between "a parent read their child's file" and "an org admin read
  a student's file", and a report that cannot tell them apart is not a
  disclosure report. `DISCLOSURE_PURPOSE` maps each relationship to its FERPA
  purpose; the platform-staff branch logs `admin_review`.

  Applied to 18 read routes: the whole transcript surface including
  `send_transcript_to_school` (a disclosure to a third-party registrar, which
  is the most FERPA-relevant event in the codebase and logged nothing before),
  SIS student profile / schedule / emergency contacts, the portfolio read,
  advisor progress and quests and check-ins, dependent progress reports, the
  helper-evidence task list, and the SIS family schedule.

  FOUR DELIBERATE NON-BEHAVIOURS, each tested:
    - `self` is never logged. A student reading their own record is not a
      disclosure, and logging it would bury the ones that matter.
    - A DENIED caller is not logged. Nothing was disclosed; an access log that
      records attempts as accesses cannot answer "who saw this".
    - Opt-in, not automatic. A write route is not a disclosure of a record, and
      turning it on for all 113 declared routes would drown the log in
      non-events — and add a write to every request on the hottest read paths.
    - Logging failure never breaks the read. A compliance log that can take the
      feature down with it gets deleted the first time it misfires, and then
      there is no log at all.

  The six existing hand-written call sites are LEFT ALONE and deliberately not
  given `discloses` — they record a `fields` list the decorator cannot know,
  and double-logging one read as two disclosures would be worse than either.

  ruff clean, mypy clean. Tests: 4825 passed, 160 skipped, 0 failed.

### SEC-16 — Org Stripe keys stored application-readable in plaintext `[NEEDS-USER(set ORG_SECRETS_ENCRYPTION_KEY in prod to switch it on)]`
`utils/org_secrets.py:104-128`. Add envelope encryption (Fernet via a Config key)
with a lazy re-encrypt migration path. Key provisioning itself is NEEDS-USER
(prod env var); code + tests are autonomous with a dev key.
Accept: values encrypted at rest; old plaintext rows migrated on read; tests.
Log:
- 2026-08-31: Plan created.
- 2026-09-03: Code DONE and shipped inert. Production still stores plaintext
  until the key is set, which is the one step that needs the user.

  Confirmed first: 7 rows in `organization_secrets`, all plaintext, including 2
  live Stripe secret keys and 5 calendar feed tokens.

  Fernet envelope with an `enc:v1:` prefix, keyed on
  `Config.ORG_SECRETS_ENCRYPTION_KEY`. THE KEY BEING UNSET IS A SUPPORTED
  STATE and is what prod runs right now: values are read and written in the
  clear, exactly as before. That is the whole reason this could ship without a
  coordinated deploy — encryption that starts writing ciphertext the moment it
  lands would have taken card payment down for a school.

  Setting the key encrypts writes and lazily re-encrypts each row as it is
  read, so the migration needs no backfill script and has no window in which a
  row is unreadable.

  Failure modes, each deliberate and tested:
    - Encrypted row, no key: return None, not the ciphertext. Handing
      `enc:v1:...` back would send it to Stripe as an API key and produce an
      unreadable failure a long way from the cause; None routes into the "card
      payment is not set up for this school" path the callers already have.
    - Wrong key: same, None rather than garbage.
    - MALFORMED key: raise. A typo in the env var must not read as "no key
      configured" — falling back to plaintext there would write cleartext
      secrets to a database the operator believes is encrypted, which is the
      one outcome worse than not turning it on.
    - Failed lazy upgrade: still return the secret. The read is the caller's
      business; the upgrade is ours.

  Framing, so nobody over-reads it: this is defence in depth, not the primary
  control. `organization_secrets` is already unreachable through PostgREST (RLS
  on, no policies, grants revoked). What the key adds is protection when
  something reads the TABLE rather than the API — a backup, a support query, a
  leaked service-role key.

  Ratchet raised 130 -> 131 (utils) for the lazy re-encrypt, reason in the file.

  TO SWITCH IT ON (user, one step, reversible):
    1. `python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"`
    2. Set `ORG_SECRETS_ENCRYPTION_KEY` on the prod backend
       (srv-d9sjl1f10e5c73a14610) and redeploy.
    3. Nothing else. The 7 rows encrypt themselves as they are next read.
  Rotation is NOT yet supported — one key, no key id in the envelope. The
  `enc:v1:` prefix is what makes adding one later possible. Removing the key
  after rows are encrypted makes them unreadable (fail-closed), so treat it the
  way FLASK_SECRET_KEY_OLD is treated in SEC-14.

  ruff clean, mypy clean. Tests: 4834 passed, 160 skipped, 0 failed.

### SEC-17 — 27 unbounded backend deps, no lockfile `[DONE(bounds + guard; a real lock is still open)]`
`backend/requirements.txt`. Fix: introduce a compiled lock/constraints file
(pip-compile), point CI installs at it, and document how Render's build uses it
(root requirements.txt is what Render installs — keep it, add constraints).
Upper-bound the risky unbounded specs (`supabase`, `stripe`, `lxml`, `pillow`,
`PyMuPDF`, `bleach`, `openai`).
Accept: reproducible install in CI; pip-audit still green.
Log:
- 2026-08-31: Plan created.
- 2026-09-03: Bounded the DEPLOYED manifest and fenced it. A compiled lock is
  NOT done — see the honest limit at the end.

  Verified where the risk actually is first, and the finding needed correcting.
  The 27 unbounded specs are in `backend/requirements.txt`, which **nothing
  installs**: Render installs the ROOT `requirements.txt` (render.yaml rootDir
  "" ), CI installs the root file, and pip-audit audits the root file. So those
  27 do not reach production at all. The root file had 8 unbounded specs, and
  those are the ones that could move under a deploy.

  All 8 now carry an upper bound at the next major above what the deploy
  already resolves — sentry-sdk<3, pywebpush<3, posthog<8, Pillow<13,
  pillow-heif<2, pdfplumber<1, python-docx<2, PyMuPDF<2. Checked each against
  the current release on PyPI so the bound is a ceiling, not a downgrade, and
  confirmed the file still resolves. Nothing moves today.

  WHY THIS MATTERS MORE THAN IT LOOKS: Render resolves at BUILD time and there
  is no lockfile, so an unbounded spec is a major-version upgrade that happens
  on a deploy nobody connected to it, and production is where it first runs.

  The stale manifest keeps its divergence but stops being a trap: a header now
  says NOT INSTALLED BY ANYTHING and names the failure (AUDIT.md L1 — a
  developer following CLAUDE.md's setup path installs a set CI never audits and
  prod never runs). On this machine that is not hypothetical: it resolved
  openai 2.36, stripe 15.1 and supabase 2.30 against prod's 1.101, 9.12 and
  2.18. Kept rather than deleted only because deleting a file two years of docs
  point at is its own surprise; a test asserts the header stays.

  Guard: tests/unit/test_requirements_are_bounded.py, with an EMPTY allowlist
  so the first future exception has to be argued for rather than inherited.

  STILL OPEN, and the test says so rather than implying otherwise: an upper
  bound is not a lockfile. The blast radius of an unattended resolve is now a
  minor rather than a major, which is the difference between a bump and an
  outage — but reproducible-to-the-hash needs `pip-compile` against Python
  3.11, and this machine runs 3.13, so a lock generated here would pin
  resolutions the deploy cannot use. That wants doing in CI.

  ruff clean, mypy clean. Tests: 4843 passed, 160 skipped, 0 failed.

### SEC-18 — CSRF exemption list is a hand-edited name list `[WONTFIX(drift already fenced; a decorator would scatter the policy)]` (low)
`middleware/csrf_protection.py:72-145`, ~30 exempt endpoints, two prior outages
from drift. Consider deriving exemptions from a route decorator/metadata instead
of a central list. Design is otherwise sound (constant-time opaque tokens).
Log:
- 2026-08-31: Plan created.
- 2026-09-03: WONTFIX, with the failure mode checked rather than assumed.

  Both prior outages were DRIFT, not the shape of the list: the 2026-07-21
  login outage was three names that no longer resolved (`auth.login` where the
  blueprint is `auth_login`), and the 2026-08-01 one was a new funnel route
  shipped without an entry. Neither is possible now, and neither would be fixed
  by this item — `tests/test_csrf_protection.py` already carries
  `test_every_exempt_name_matches_a_real_endpoint` (imports the REAL app in a
  subprocess and fails on any name resolving to nothing),
  `test_all_icreate_funnel_endpoints_are_exempt`, and its inverse for the
  session-authenticated ones. All ten run in CI; verified not deselected.

  So what remains of the item is the refactor, and on the merits a decorator is
  WORSE here. CSRF exemption is a policy you want to read in ONE place: the
  current list is thirty lines with a written reason per cluster — what
  authenticates the caller instead, and why that is sufficient. Spread across
  thirty route files, no reviewer sees the whole exemption surface at once, and
  "which endpoints skip CSRF" stops having an answer you can read. The audit
  itself called the design otherwise sound.

  Rewriting CSRF plumbing is also the wrong thing to do without a browser: the
  failure mode is "a real user cannot log in", which no unit test in this suite
  would have caught in either outage — the guards catch the NAMES, not the
  enforcement path.

  Reopen if the list outgrows a screen, or if per-route metadata appears for
  some other purpose that this could ride on.

---

## Phase 2 — CI enforcement (cheapest durable wins)

### CI-01 — No linter or type-checker runs in CI `[DONE]`
`mypy.ini` exists (permissive, with per-module strict overrides) but nothing runs
it. Fix: add ruff (curated ruleset: F, E9, B, S110/S112 for silent excepts) and
mypy steps to `tests-backend.yml`, enforcing. Fix or noqa existing violations to
get to green — do not lower the config to pass.
Accept: both steps enforcing in the reusable workflow (gates PR and release).
Log:
- 2026-08-31: Plan created.
- 2026-09-03: DONE, both halves enforcing in tests-backend.yml.
  RUFF: ruff.toml at the repo root, ruleset F/E9/B/S110/S112 — narrow for the
  same reason the pyflakes step is narrow (a gate you argue with gets switched
  off). 1364 findings -> 0. 977 by --fix, 299 by hand, details in the two
  commits. Enforcing from its first run rather than starting advisory.
  MYPY: it had never worked, and could not have. mypy.ini's `exclude` regex
  closes on a `)` at column 0; an unindented continuation line ends the value,
  so everything below it was unparseable and EVERY per-module setting was dead
  — including the two `disallow_untyped_defs` overrides added in Dec 2025 for
  "new, well-typed modules", neither of which satisfied them. And services/ was
  the only package directory without __init__.py, so mypy resolved one module
  under two names and refused to check at all. Both fixed; base_service and
  base_repository annotated so their strict flags are true for the first time.
  With the config working, the first honest run is 7738 errors in 296 of 1019
  modules (4022 union-attr). Those 296 are exempted by name, the list only
  shrinks, and mypy enforces on the ~720 already-clean modules.
  I found the exclude bug by disbelieving my own work: the baseline I generated
  had no effect at all, which is not how a config behaves unless it is not being
  read.

### CI-02 — Stop the layering bleed: ratchet direct DB calls in `routes/` `[DONE]`
~2,317 `.table(` calls in routes today. Add a guard test that counts direct
Supabase table calls per layer and fails on *increase* over a checked-in baseline
(ratchet down as migrations happen). This fences the repository-pattern debt
without funding the full migration (see QB-06).
Accept: ratchet test enforcing; baseline file committed.
Log:
- 2026-08-31: Plan created.
- 2026-09-03: `tests/unit/test_direct_db_calls_do_not_grow.py`. Per-LAYER
  baselines rather than one total, because the layers mean different things: a
  `.table(...)` in routes/ or services/ is the violation, in repositories/ it is
  the design. Measured 2026-09-03: routes 2339, services 1779, repositories 406,
  utils 128, jobs 7, middleware 3, modules 1 (4663 total — the plan's ~2317 was
  routes/ alone).
  It asks nobody to migrate anything; it asks that the number stop climbing
  while QB-06 is open. Verified with a planted route: "grew from 2339 to 2340",
  build red. Carries a floor assertion so a broken scan cannot pass as a clean
  codebase.

### CI-03 — `no-console` is configured but not enforced; 33 console.logs live `[DONE(rules enforced in vitest; standing up eslint itself deferred, reason below)]`
Run eslint in `tests-web.yml` (enforcing), remove the 33 `console.log` calls in
`frontend/src` (route through the logger/Sentry where they carry signal).
Accept: eslint step enforcing; zero console.log in v1 src.
Log:
- 2026-08-31: Plan created.
- 2026-09-03: Both rules now enforced, and the second one is the reason this
  mattered more than the console noise.

  The finding understated it. `package.json`'s `eslintConfig` carries TWO rules,
  and NEITHER has ever run: `no-console`, and a `no-restricted-syntax` rule
  banning `localStorage.setItem` of auth-token keys — the C2 security control
  from ADR-001, which is what keeps tokens in memory plus httpOnly cookies. A
  security rule that is configured and unenforced is worse than one nobody
  wrote down, because it reads as covered.

  Why it never ran: eslint is not a devDependency, there is no `lint` script,
  and the config `extends: ["react-app"]` — a Create React App preset, in a
  project that is Vite.

  Enforced in VITEST instead, which CI already gates on:
  `frontend/src/__tests__/lintRules.test.js`. Zero console.log in src, the
  token-storage ban with its own detector test, and a floor assertion so the
  scan cannot pass by globbing nothing. `console.warn`/`console.error` stay
  allowed and a test says so — banning them would push people back to
  console.log.

  The 34 calls, handled by what they were rather than in bulk:
    - 11 deleted as scaffolding (InterestTracksList's "Clicked suggestion:",
      the wizard's per-render `[Wizard] State:` dump).
    - 21 demoted to `logger.debug`, which is already development-only, where
      the line carried real flow signal (AuthCallback's invitation handling,
      the observer feed's retry path, authService's token-source booleans).
    - 2 left in `utils/logger.js`, allowlisted with a reason: the logger IS the
      console wrapper.

  DEFERRED, honestly: standing up eslint itself. It is not a five-minute job —
  the CRA preset has to be replaced with a flat config, the react/hooks plugins
  added, and the first run triaged, which is not autonomous work. The two rules
  the project had actually chosen are enforced today, which is the value the
  item was for.

  Web suite: 282 files, 2479 tests, all passing.

### CI-04 — No dependabot/renovate `[DONE]`
Add `.github/dependabot.yml`: pip (root requirements), npm (frontend,
frontend-v2), github-actions. Weekly, grouped minor/patch.
Accept: config merged; first PRs triaged by user later.
Log:
- 2026-08-31: Plan created.
- 2026-09-03: `.github/dependabot.yml` added — pip (root AND backend), npm
  (frontend, frontend-v2), github-actions. Weekly, minor/patch grouped into one
  PR per ecosystem so the thing does not open a dozen a week and teach everyone
  to ignore it; majors come individually because those need reading.
  Both requirements.txt files are watched deliberately: Render installs the ROOT
  one (the DEP-H1 lesson, where pip-audit was pointed at the wrong file), and a
  new backend dep has to be added to both.

### CI-05 — Integration tests and E2E do not hold the deploy `[NEEDS-USER]`
`release.yml` deploy is `needs: [backend, web]` only — documented as intentional.
Ask the user whether the 128 enforcing integration tests should now gate deploy.
Log:
- 2026-08-31: Plan created. Question queued for user.

### CI-06 — Ban raw `print()` in app code (408 today) `[DONE]`
Guard test (or ruff T201 with per-file ignores for scripts/) after QB-03 converts
existing calls.
Accept: enforcing after QB-03; scripts/ exempt.
Log:
- 2026-08-31: Plan created.
- 2026-09-03: `tests/unit/test_no_raw_print_in_app_code.py`, enforcing now
  that QB-03 has cleared the app-code calls. Exemptions are by file with a
  written reason rather than a blanket directory rule, so adding one is a
  visible decision. Verified with a planted print: build red. Carries the same
  floor assertion as the other guards.

---

## Phase 3 — Documentation truth reconciliation

### DOC-01 — `REPOSITORY_MIGRATION_STATUS.md` claims complete at ~9% adherence `[DONE]`
Rewrite to state measured reality (counts from the audit; re-measure), the
fencing strategy (CI-02), and what "done" now means.
Log:
- 2026-08-31: Plan created.
- 2026-09-03: The doc led with "✅ MIGRATION COMPLETE (December 18, 2025)" and
  "Final Pattern Adherence: 25.4%" — a figure built from 4 migrated files plus 32
  that use a service layer, counted as though a service layer were the same
  thing. Replaced the summary with counts taken from the tree: 267 route files,
  32 touching a repository at all, 196 making direct `.table(...)` calls, and 26
  doing both — so the pattern is present in a file far more often than it owns
  that file's data access. Also records that the debt is FENCED by CI-02 rather
  than fixed, and that QB-06 is the open decision. The per-file history below
  the summary is kept; it was accurate about those files, and it was the
  headline above it that was not.

### DOC-02 — Integration-test status drift in three artifacts `[DONE]`
`ci.yml` comment ("44 tests… quarantined"), `backend/pytest.ini` marker doc
("do not currently pass"), `backend/tests/conftest.py` skip reason — all describe
the pre-port state; `backend/tests/integration/README.md` says 128 enforcing.
Run the suite, confirm which is true, fix the stale three.
Log:
- 2026-08-31: Plan created.
- 2026-09-03: Five artifacts, not three — and every one was stale in the
  OPPOSITE direction from what the plan assumed. The plan expected the docs to
  overstate; they understate.
  Ground truth, from the CI run of 2026-09-02 (ci.yml on develop, job
  "integration / Backend integration (local Supabase)"): `133 passed, 4382
  deselected`, conclusion success. The suite is GREEN and ENFORCING.
  What each said:
    - ci.yml: "44 tests as of 2026-08-13… the other eight files are quarantined
      with an explicit skip marker". Ten files exist; only test_curriculum.py
      has skips, and those are three pure-function cases needing no database.
    - README.md: "All eight files are ported. 128 integration tests" — ten and
      133. Its own table already listed ten rows.
    - pytest.ini and conftest.py: "these tests do not currently pass against any
      database". They pass on every PR.
    - CLAUDE.md: "Integration tests are advisory and red on purpose… cannot pass
      yet". The most harmful of the five: an engineer reading it would dismiss a
      real integration failure as expected.
  All five corrected against the CI numbers.
  Also removed the dead advisory branch in tests-integration.yml, on its own
  instruction ("delete the branch and the input once the port is done"). The
  `enforcing` input defaulted to true and no caller ever passed it, so the
  advisory path had never once executed — the suite has gated every PR since its
  first run, while three documents said it could not pass.

### DOC-03 — `LOCAL_DEVELOPMENT.md` does not exist but is linked `[DONE]`
CLAUDE.md links it twice. Either create it (extract the inline section) or fix
the links.
Log:
- 2026-08-31: Plan created.
- 2026-09-03: Created it rather than removing the links — the content was
  worth having in one place. It carries the CLAUDE.md quick-reference plus what
  is only learned by hitting it: the backend runs with no reloader so backend
  edits need a kill-and-relaunch, the exact env the backend suite needs (missing
  vars look like broken code), Node 25 breaking v1 vitest, the CRLF trap, and
  the Android/iOS API-URL routing.
  While verifying, swept every markdown link in CLAUDE.md: two more were broken,
  pointing at migrations the 2026-08-13 baseline squash moved to
  supabase/migrations-archive/. Relinked. CLAUDE.md now has zero broken links.

### DOC-04 — CLAUDE.md self-contradicts on commit scope `[DONE]`
Rule 12 overrides the "stage ALL outstanding changes" instruction, but the
superseded bold text still stands at the Git Configuration section. Remove or
rewrite the stale instruction so the file gives one answer.
Log:
- 2026-08-31: Plan created.
- 2026-09-03: The Git Configuration section said "always stage and commit ALL
  outstanding changes… Never selectively unstage files — push everything", which
  Critical Rule 12 flatly contradicts. Rule 12 is the correct one and the old
  text is actively dangerous now that several agents share this checkout: `git
  add -A` sweeps someone else's half-finished work into your commit. Rewrote the
  section to agree with Rule 12 and say why it changed, and dropped Rule 12's
  "overrides…" clause, which now referred to text that no longer exists.

### DOC-05 — ~20 planning/audit docs clutter the repo root `[DONE]` (low)
Move to `docs/` (or `docs/archive/`), updating inbound links (CLAUDE.md references
AUDIT_IMPLEMENTATION_PLAN.md).
Log:
- 2026-08-31: Plan created.
- 2026-09-03: 16 files moved; the root is down to four .md files —
  README, CLAUDE.md, core_philosophy.md and LOCAL_DEVELOPMENT.md, all four of
  which CLAUDE.md links or is.

  Sorted by whether they are still true, not by age:
    - `docs/archive/` (8): AUDIT.md, AUDIT_IMPLEMENTATION_PLAN.md,
      H1_ADMIN_CLIENT_AUDIT.md, BUG_TRIAGE_PLAN_2026-06-06.md,
      TASK_DIFFICULTY_IMPLEMENTATION_PLAN.md, MOBILE_APP_LAUNCH_PLAN.md,
      OPTIO_COURSE_PATH_PITCH.md, POE_Fine_Arts_Credit_Proposal.md. A README
      there says what each one was and that the code wins on any disagreement —
      the point of an archive is that a reader knows not to act on it.
    - `docs/` (5): OPTIO_BRAND_GUIDELINES, COLOR_REFERENCE, command_reference,
      course_overview, POE_LAUNCH_PLAN. POE is live (the 2026 pilot), so it is
      NOT archive.
    - `docs/play-store/` (3): the three release-time Play Store docs, which are
      operational rather than historical.

  Seven inbound markdown links checked and fixed. One was ALREADY BROKEN and
  the move repaired it: frontend/src/config/COLOR_MIGRATION_GUIDE.md pointed at
  `../../docs/COLOR_REFERENCE.md`, which did not exist until now.

  LEFT ALONE deliberately: ~20 code comments citing `AUDIT.md` by name ("AUDIT.md
  C1"). They are prose citations, not links; the finding ids still grep; and
  rewriting twenty comments in files other sessions are actively editing costs
  more than it buys. The archive README says so.

  CLAUDE.md's Extended Documentation index gains the three new locations, so the
  moves are discoverable from the file everyone reads first.

  Backend suite 4843 passed / 160 skipped / 0 failed (docs moves touch no code,
  but two guard tests read file paths).

---

## Phase 4 — Backend quality

### QB-01 — Delete dead `exceptions.py` (549 lines, zero importers) `[DONE]`
Verify zero imports repo-wide, then delete; the live hierarchy is
`middleware/error_handler.py`.
Log:
- 2026-08-31: Plan created.
- 2026-09-03: Verified dead before deleting — no importer, and no dynamic or
  string reference either (the only `import exceptions` in the tree was inside
  the file itself). It was a second, parallel exception hierarchy: 20+ classes
  led by OptioException, while every live raise site uses
  middleware/error_handler.AppError and its subclasses. Deleted.
  Also fixed the collateral: tests/unit/test_import_layers.py's docstring listed
  `exceptions` as an allowed import target on all four layers, which documents a
  module that no longer exists.
  Tests: 4714 passed, 0 failed.

### QB-02 — Consolidate duplicated micro-helpers `[DONE(now/_now_iso merged; _admin deliberately left alone)]`
46 copies of `_admin()`, 22 of `_org_or_error`, ~25 of `_now/_now_iso`, plus
`_display_name`/`_parse_ts` variants. Move canonical versions to `utils/`,
migrate call sites mechanically.
Log:
- 2026-08-31: Plan created.
- 2026-09-03: Did the one that was hiding a bug; deliberately did NOT do the
  one the item leads with.

  `_now_iso` / `_now`: 35 copies, and they had DIVERGED. Thirty-two returned an
  aware UTC timestamp; three returned a naive one via `datetime.utcnow()` —
  routes/sis/goals.py, services/messaging_extras_service.py,
  services/sis_community_service.py. That is not a style complaint:
  `datetime.utcnow()` is deprecated from 3.12 and returns a datetime that
  claims UTC while being naive, so comparing one against an aware timestamp
  raises TypeError. The bug lands as a crash in whichever path first mixes a
  goal's timestamp with anything else's, a long way from the module that made
  it. Now one definition in `utils/timestamps.py`, aliased at each site
  (`from utils.timestamps import now_iso as _now_iso`) so no call site changed.
  33 modules; ruff removed the imports that fell dead.

  `_admin()`: 96 copies, and merging them would be ACTIVELY HARMFUL. Each one
  sits under a per-module justification comment — "# admin client justified:
  ..." — which is the SEC-13 control that `test_admin_client_justified`
  enforces. One shared `admin()` would collapse 96 recorded decisions into a
  single site with a single comment, and the question that gate exists to ask
  ("why does THIS module bypass RLS?") would no longer have a per-module
  answer. The duplication IS the audit trail. Left alone, reason recorded here
  so the next reader does not "finish" the item.

  `_org_or_error` (22 copies): not merged either, and for a smaller reason —
  SEC-10 has been moving what those helpers guard into
  `@require_relationship_to`, so consolidating them now would be refactoring
  code that is being replaced.

  Guards: `tests/unit/test_one_definition_of_now.py`. A module-level `_now`/
  `_now_iso` outside utils/timestamps fails the build. And a RATCHET, not a
  ban, on `datetime.utcnow()` — 449 calls remain, converting them is separate
  work with its own risk (a naive timestamp lands in a `timestamptz` column
  correctly today, so this is latent rather than broken), but the number must
  not climb, because 3.12 deprecated the call and each new one is another site
  to fix when it is removed. A companion test fails if the count falls far
  enough below the baseline that the ratchet has stopped ratcheting.

  ruff clean, mypy clean. Tests: 4847 passed, 160 skipped, 0 failed.

### QB-03 — Replace 408 raw `print()` calls with the logger `[DONE]`
Routes/services only (scripts/ exempt). Preserve message content; pick levels
sensibly (errors in except blocks -> logger.error). Then arm CI-06.
Log:
- 2026-08-31: Plan created.
- 2026-09-03: 114 in app code today, not 408 (the plan's figure counted
  scripts/ and tests/). Converted 64; the rest are legitimately exempt.
  The reason this mattered more than tidiness: services/direct_message_service
  held 34 prints tracing message-permission decisions, each putting TWO user
  UUIDs on stdout — where utils/log_scrubber, installed by SEC-05 to stop
  exactly that, never saw them. print() also skips the JSON formatter, the
  correlation id, the level filter and Sentry's logging integration.
  Levels chosen from the message: error/exception/traceback/fail -> logger.error,
  everything else -> logger.debug. `file=sys.stderr, flush=True` dropped as
  print-only plumbing, which left `sys` unused in four modules (ruff caught it).
  Left alone, deliberately: CLI entry points (jobs/*trigger*, cron_dispatch,
  generate_spec, api_spec_generator, the log_scrubber demo) where stdout IS the
  interface, and app_config.py's two import-time warnings, which the file
  already documents as unavoidable — a real circular dependency, no logger
  yet.

### QB-04 — Decompose the top god route files `[DONE(all three split; the exemption list is empty — but see the verification note)]`
`registration_funnel.py` (2,143 — payments+OTP+provisioning in the route layer),
`admin/organization_management.py` (1,950), `evidence_documents.py` (1,716),
`admin/curriculum_upload.py` (1,400), `admin/user_management.py` (1,389).
Extract business logic to services; routes keep HTTP concerns. One file per
sub-batch, full related-test run each.
Log:
- 2026-08-31: Plan created.
- 2026-09-03: ONE FILE SPLIT — `evidence_documents.py`, 1,718 -> 1,252 lines.
  It is now UNDER the 1,400-line cap, so its exemption in
  `test_route_file_sizes.py` is DELETED rather than lowered. Two exemptions
  left (registration_funnel, admin/organization_management).

  The six file-upload routes moved to `routes/evidence_uploads.py` (505 lines,
  under the cap and so not exempt). That block was chosen because it is
  genuinely separable: it uses NONE of the module's shared helpers —
  `process_evidence_completion`, `update_document_blocks`,
  `check_quest_completion` and the storage-deletion helpers all stay behind.
  Pure code move, no logic change.

  THE PART THAT WOULD HAVE BEEN EASY TO GET WRONG: the routes stay on the SAME
  blueprint, registered through `register_routes(bp)` the way routes/observer/*
  does. A Flask endpoint name is `blueprint.view_function`, and
  `middleware/csrf_protection` plus several tests resolve routes BY NAME — a
  second blueprint would have silently renamed all twelve endpoints. Verified
  after the move that the same 12 `evidence_documents.*` names are registered.

  One test fixture needed both module paths: the moved routes resolve
  `get_supabase_admin_client` from their own module now, while the document
  routes the same file covers still resolve it from `evidence_documents`.

  NOT DONE: the other four. `registration_funnel.py` (2,148) is the biggest and
  is the live iCreate payment path with an outage history; splitting it is
  worth doing but wants a browser on the funnel afterwards, not just a green
  suite.

  The new module inherits `ignore_errors = True` from its parent's mypy.ini
  section, so the move is exactly gate-neutral. That exemption is TEMPORARY and
  the next commit deletes it: 173 of 247 route modules are already mypy-clean,
  so the exemption is the minority holdout, not the convention, and a split that
  grew the debt list would be a step backwards.

- 2026-09-03: THE INHERITED MYPY EXEMPTION IS GONE. `routes.evidence_uploads`
  is now type-clean and its `mypy.ini` section is deleted, one commit after it
  was added. 74 of 247 route modules carry `ignore_errors = True`; the split
  had briefly made it 75.

  All 83 errors were one shape — Supabase `.execute().data` is typed as a JSON
  union, so `row['col']` and `row.get(...)` are errors on it. Five bindings
  fixed the lot:
  - `block = block_response.data` x3 -> `cast(dict[str, Any], ...)`. This also
    silently fixed `current_content = block.get('content')` downstream, which
    was ~40 of the 83 on its own.
  - `task_check.data[0]['user_id']` x3 -> same cast.
  - `response_data = {` x4 -> `response_data: dict[str, Any] = {`. Inferred
    from the literal it was `dict[str, int | str | None]`, so the later
    `response_data['duration_seconds'] = <float>` did not fit.

  No logic changed; `cast` is erased at runtime and the annotations are on
  bindings only. Worth knowing for the other 74: this is not 74 files of real
  bugs, it is one missing type on the Supabase client repeated everywhere.
  Typing `.data` once at the client boundary would retire most of the list.

- 2026-09-03: SECOND FILE SPLIT — `admin/organization_management.py`,
  1,554 -> 891 lines, and its exemption is deleted too. **One exemption left**
  in `test_route_file_sizes.py`: `registration_funnel.py`.

  The seam is membership vs. the organization record. Moved to
  `admin/organization_users.py` (655 lines): add/remove/bulk-remove members,
  create-username student accounts, reset password. Stayed: the org row, its
  settings and secrets, quest/course grants, analytics, student progress.

  A THIRD file came out of it, and this one was forced rather than chosen.
  `admin/bulk_import.py` was importing `USERNAME_PATTERN` and
  `generate_simple_password` *from another route module* — so the split had to
  either keep that layering violation or fix it. Those plus
  `validate_simple_password` and the kid-friendly word list now live in
  `utils/org_student_credentials.py` (58 lines), which both route modules
  import. This matters beyond tidiness: the generator and the validator have to
  agree, and a password one route mints must be one the other accepts.

  UNLIKE the evidence_documents split, this one uses a SEPARATE blueprint at
  the same `url_prefix`. That is this file's own established pattern —
  `organization_courses`, `org_modules` and `org_member_status` all came out of
  it that way — and it is safe here only because nothing resolves these five
  routes by endpoint name (checked across the backend first). Where a name IS
  load-bearing, use `register_routes(bp)` on the same blueprint instead.

  THE CHECK THAT ACTUALLY PROVES IT: the `/api/admin/organizations` URL map was
  dumped before and after. 55 rules both times, every path and method
  byte-identical, and exactly five endpoint names changed
  `organization_management.* -> organization_users.*`. Route splits break URLs
  silently; a green test suite does not notice a rule that stopped existing.

  Left alone on purpose: `_ensure_shared_household` hardcodes
  `('guardian', 'other')` where `config.constants.GUARDIAN_RELATIONSHIPS`
  exists. That is a fourth copy of the constant this plan already
  de-duplicated three times, but folding it in belongs in its own commit, not
  in a code move.

  ruff clean, mypy clean (1036 files), pyflakes clean. Tests: 4858 passed.

- 2026-09-03: THE GUARDIAN TUPLE, FINISHED AND FENCED. The previous entry left
  `('guardian', 'other')` inline in the moved code; going to fix that one copy
  turned up FIVE, not one:
  `routes/admin/organization_users.py`, `services/sis_service.py`,
  `services/sis_attendance_sweep_service.py`, and
  `services/sis_billing_service.py` twice. All now import
  `config.constants.GUARDIAN_RELATIONSHIPS`. With the two named constants this
  plan merged earlier, that is seven copies down to one.

  This is worth more than the tidiness it looks like. `'other'` is the member
  that drifts: the registration funnel writes it for a guardian who is not the
  parent — a grandparent, an aunt — and a copy that omits it locks those
  families out of their own children's records ON THAT SCREEN ONLY. Partial,
  per-surface, and unreproducible from the ticket.

  `tests/unit/test_one_definition_of_guardian.py` fences it: zero inline
  copies, matched against whitespace-normalised source so quoting cannot
  smuggle one past, plus the usual companions — the detector is shown to match
  what a developer would actually type, the scan is shown to see real files,
  and a separate test asserts the constant still contains `'other'`. Verified
  by planting a copy in `utils/` and watching it go red, then removing it.

  ruff clean, mypy clean (1037 files), pyflakes clean. Tests: 4862 passed.

- 2026-09-03: REGISTRATION FUNNEL, STAGE 1 OF 3 — helpers out to services/.
  `routes/registration_funnel.py` 2,149 -> 1,790. Still over the cap; the
  exemption stays until stage 3.

  This is the last exempted file and the risky one: it is the live iCreate
  payment funnel. What makes it *safe enough to attempt* is that the failure
  mode which caused the 2026-07-21 outage is already fenced. Every funnel
  endpoint is CSRF-exempt BY ENDPOINT NAME
  (`middleware/csrf_protection.CSRF_EXEMPT_ENDPOINTS`), and two existing tests
  check that set against the live URL map —
  `test_all_icreate_funnel_endpoints_are_exempt` and
  `test_every_exempt_name_matches_a_real_endpoint`. A split that renamed an
  endpoint would fail both. So the later stages must keep the routes on the
  SAME blueprint via `register_routes(bp)`, never a new one.

  Stage 1 moves no routes at all, only helpers, into two service modules:
  `services/registration_funnel_support.py` (session, invite/registration
  lookup, access_token check, org Stripe key, prepaid directive) and
  `services/registration_accounts_service.py` (parent/student/dependent
  creation, existing-account matching, the email OTP). Both are imported back
  under their original private names, the pattern
  `services/registration_identity_service.py` already established here.

  WHY services/ AND NOT A SIBLING ROUTE MODULE: stages 2 and 3 split the
  handlers across several route modules, and every one of them needs these
  helpers. A helper living in one route module and imported by another is an
  import cycle the moment anything imports the child first — and it fails at
  boot, on the deploy, not in the test that imported the parent.

  Three test files needed the moved helpers patched at their NEW address
  (`services.registration_funnel_support._admin` and friends). The old patch
  target still exists as a re-export, so patching it binds a name nothing
  reads; the tests failed loudly by building a real Supabase client rather
  than passing on a stale mock, which is the good version of this bug.

  THE RATCHET THIS BROKE, AND WHY THE FIX IS BETTER THAN A BUMP:
  `test_direct_db_calls_do_not_grow` said "never raise routes/ or services/".
  Moving a helper down a layer raises services/ while lowering routes/ by the
  same amount — which is the direction the repository pattern wants, and the
  old rule called it a violation. It now also asserts the COMBINED
  routes/+services/ total never grows, so a lateral move passes and a genuinely
  new `.table(...)` above repositories/ still fails. Verified the move lost
  nothing: 59 calls in the original file, 59 across the three files after.

  ruff clean, mypy clean (1039 files; `dateutil` needed an
  `ignore_missing_imports` section, the same treatment supabase and flask_cors
  already have), pyflakes clean. Tests: 4864 passed.

- 2026-09-03: REGISTRATION FUNNEL, STAGES 2 AND 3 — routes split, and
  **`EXEMPTIONS` in `test_route_file_sizes.py` is now EMPTY**, for the first
  time since the cap was added.

      routes/registration_funnel.py   2,149 -> 1,258
      routes/registration_entry.py      new -> 282   (/start /verify
                                                      /resend-code /login
                                                      /attach)
      routes/registration_payments.py   new -> 373   (checkout, the Stripe
                                                      return, the two fee
                                                      recorders)

  Both new modules attach to the EXISTING `registration` blueprint through
  `register_routes(bp)`. Neither creates a blueprint of its own, and that is
  the whole safety argument: the funnel's CSRF exemption list is keyed on
  endpoint names like `registration.create_checkout`, so a second blueprint
  would have renamed them out of the set and 403'd every parent who reached the
  payment step already signed in — which is precisely the 2026-07-21 outage.

  PROOF, not inference: the `registration.*` URL map was dumped before stage 2
  and after stage 3 and the two files are IDENTICAL — 20 rules, same paths,
  same methods, same endpoint names. Nothing moved.

  Seven test files needed their patch targets repointed at the module each
  handler now lives in. Every one of them failed LOUDLY (a real Supabase client,
  "Invalid URL") rather than passing on a mock nothing consulted, which is the
  good version of this failure. `test_registration_fk_hints.py` also pinned the
  path of the file holding the `users!registrations_parent_user_id_fkey` embed
  hint; it now globs `routes/registration_*.py`, so it follows /start instead of
  failing for the one reason it does not care about.

  **STILL WANTS A BROWSER BEFORE IT SHIPS.** The suite covers this well — about
  130 tests across 14 files, including checkout, prepaid directives,
  multi-session confirm-payment, and the passwordless/existing-account doors —
  and the URL map is proven unchanged. But nothing here exercises a real Stripe
  redirect, and this is a live revenue path for three orgs. Run one registration
  end to end on dev before this goes to `main`.

  ruff clean, mypy clean (1041 files), pyflakes clean. Tests: 4864 passed.

  ruff clean, mypy clean, pyflakes clean. Tests: 4858 passed.

### QB-05 — Three migration directories with ambiguous authority `[DONE]`
`supabase/migrations/` is current; `backend/migrations/` (80 files, 4 naming
conventions) and root `migrations/` (8 files) are legacy. Archive the legacy two
with READMEs stating provenance; note the 8-digit naming outlier
(`20260824_admin_platform_metrics_daily.sql`).
Log:
- 2026-08-31: Plan created.
- 2026-09-03: Archived both legacy directories, and found something bigger than
  the naming outlier while checking the live one.

  `backend/migrations/` (80 files, four naming conventions) and root
  `migrations/` (8) are now `docs/archive/legacy-migrations/`, with a README
  giving provenance and saying why they are kept rather than deleted: several
  are the only written record of a schema decision, and one
  (`20251226_create_oauth2_infrastructure.sql`) is what SEC-12's comment points
  at when explaining why the OAuth tables do not exist.

  Two runner scripts DELETED rather than moved:
  `backend/scripts/apply_ai_review_migration.py` and `run_ai_jobs_migration.py`
  apply migrations that create `ai_quest_review_queue`, `ai_generation_metrics`,
  `ai_prompt_versions` and `quality_action_logs` — every one of which CLAUDE.md
  lists under "Deleted Tables (Don't Query)". A script whose only effect is to
  recreate a dropped table is worse than no script.

  THE REAL FINDING, which the item only glimpsed as "the 8-digit naming
  outlier". Diffed all 64 files in `supabase/migrations/` against
  `supabase_migrations.schema_migrations`:
    - **56 of 64 carry a version stamp that differs from the recorded one.**
      Not one outlier — the norm. Hand-application timestamps the history row at
      apply time while the filename was written earlier, so they drift by
      hours.
    - 3 files appear in no history row: the baseline, plus
      `20260825120000_hearthwood_hide_pillars` and
      `20260827150000_announcement_board_link`.

  Checked those two against production rather than assuming: the
  `announcements.source_announcement_id` column exists and both Hearthwood orgs
  carry `hide_pillars: true`. They were applied by hand and never recorded — so
  nothing is MISSING from production, the HISTORY is incomplete.

  Consequence, now written at the top of `supabase/migrations/README.md`:
  `supabase db push` would attempt ~59 already-applied migrations. Many are
  `IF NOT EXISTS`-guarded; not all are. Do not run it against prod until the
  history is reconciled.

  DELIBERATELY NOT RENAMED. A rename changes nothing in the database, and
  tooling that diffs by filename would read 56 renames as 56 NEW migrations —
  trading a quiet inconsistency for a loud one, on the exact path that reaches
  production. Reconciling means writing history rows, which is a change to
  production state and belongs with OPS-03's decision rather than ahead of it.

  Tests: 4843 passed, 160 skipped, 0 failed.

### QB-06 — Repository-pattern endgame decision `[NEEDS-USER]`
Full migration is 1-2 engineers x 2-3 quarters; fencing (CI-02 + require repos
for new code) is ~2 weeks. Recommend fencing. User to confirm before anyone
funds the full migration.
Log:
- 2026-08-31: Plan created. Question queued for user.

---

## Phase 5 — Frontend quality

### QF-01 — Extract shared logic between v1 and v2 `[TODO(deduplicated within v2; the cross-app move needs metro-resolver work)]`
70% endpoint overlap, ~12 reimplemented component/hook pairs, ~8-10k LOC doubled;
`shared/` holds only legal copy. Extract platform-agnostic hooks, services, and
API contracts into `shared/` (start: pillars, richText, API types, useQuests /
useBounties / useNotifications logic).
Log:
- 2026-08-31: Plan created.
- 2026-09-03: Started where the item says to start — pillars — and found the
  duplication is worse WITHIN v2 than between the apps. Fixed that half; the
  cross-app move is blocked on plumbing worth describing rather than guessing
  at.

  Four definitions of the same five pillars:
    1. `frontend/src/config/pillars.js` (v1) — full config.
    2. `frontend-v2/src/config/pillars.ts` — full config.
    3. `frontend-v2/src/hooks/useQuestDetail.ts` — key/label array.
    4. `frontend-v2/src/components/engagement/PillarRadar.tsx` — key/label/colour
       array with the colours HARDCODED AS HEX.

  3 and 4 now derive from 2. And that fixes something QF-07 tripped over:
  PillarRadar's `#2469D1`, `#AF56E5` and `#FF9028` were the values the audit
  called "off-palette". They are the pillar colours. A shared list with a second
  copy is exactly how a brand colour ends up looking like drift.

  One thing deliberately kept local: PillarRadar's "Comm" and "Well". It is a
  radar chart, and the config's full labels overlap their neighbouring spokes.
  An abbreviation for a cramped axis is a property of that chart, not of the
  pillar — so it is a lookup beside the derivation rather than a fifth
  definition.

  WHY THE CROSS-APP MOVE IS NOT DONE: `shared/` is reachable today only through
  the `@legal` alias, which is hardcoded to `shared/legal` in three places — v1's
  vite alias, v2's tsconfig path, and a `resolveRequest` hook in
  `frontend-v2/metro.config.js` that exists because Metro parses `@legal/...` as
  a scoped package name and never matches an `extraNodeModules` key. Adding
  `shared/pillars` means generalising that hook to an `@shared` alias, and a
  Metro resolver change breaks in ways only a device or simulator shows. That is
  the first task for whoever picks this up, and it is one task, not a mystery.

  Mobile suite 97 files / 718 passed; tsc clean.

### QF-02 — Decompose top god components `[TODO(fenced; decomposition still open and still needs a browser)]`
Start with `pages/courses/CourseHomepage.jsx` (1,653 lines, 5 components, 28
useState) and `pages/sis/ClassesPage.jsx` (41 useState, 36 direct api calls).
Then the next 8 by size. Behavior-preserving; tests before refactor where thin.
Log:
- 2026-08-31: Plan created.
- 2026-09-03: FENCED, not decomposed — and the fence had to know about far more
  files than the item names.

  Measured: 733 `.jsx` files, **fifteen over 1,000 lines**, thirty-one over 800.
  The item names two. A cap that only knew about those two would have failed on
  day one against thirteen files nobody was asked to touch, so
  `frontend/src/__tests__/componentSize.test.js` caps new files at 1,000 lines
  and carries eighteen exemptions at measured size plus headroom.

  It mirrors the backend's `test_route_file_sizes.py`, which has been in place
  since Q1 and demonstrably works — it caught `dependents.py` crossing 1,400
  lines earlier today, on a comment. The frontend had no equivalent.

  Two properties worth keeping: an exemption may be REMOVED when a file is split
  but never raised, and a third test fails if an exemption names a file that no
  longer exists — a stale entry is a cap nobody is under, and the next file to
  take that path would inherit a limit granted to something else. That test
  earned its place immediately: `pages/sis/FamiliesPage.jsx` was in my first
  draft of the list and does not exist.

  DECOMPOSITION IS STILL OPEN, and the item stays TODO for it. Splitting a
  1,650-line page is behaviour-preserving work whose verification is "the page
  still does what it did", which needs a browser. What the fence buys meanwhile
  is that the sixteenth file cannot join them quietly. Why size is worth fencing
  in a component at all: state count scales with it, and a page with 41
  `useState` has more possible states than anyone can hold in their head — so
  its bugs arrive as "sometimes the save button stays disabled", unreproducible
  and untestable until the thing is split.

  Web suite 2496 passing.

### QF-03 — Finish one data-fetching paradigm in v1 `[TODO(ratchet in place; migration itself still open)]`
29 react-query files vs 108 hand-rolled pages. Ratchet: new/touched pages use
`hooks/api/`; migrate the highest-churn pages first. Not a big-bang rewrite.
Log:
- 2026-08-31: Plan created.
- 2026-09-03: The ratchet the item asks for is in place. Migration is not, and
  the item stays open for it.

  Re-measured across 174 pages: **12 use `hooks/api/` or react-query, 108 call
  `api.*` directly with no hook.** (The audit's "29 react-query files" counts
  the hooks themselves plus components; at PAGE level it is 12.)

  `frontend/src/__tests__/dataFetchingParadigm.test.js` fences the hand-rolled
  count at 108. Nobody has to migrate anything to keep it green — but a page
  REWRITTEN in the old style turns it red, which is exactly the "new/touched
  pages use hooks/api" rule the item states, enforced instead of documented.

  A fourth test asserts `hooks/api/` still exists and is non-trivial: the
  ratchet's failure message names a destination, and if that directory were
  ever removed the message would be telling people to migrate into nothing.

  Recorded the cost in the test, so it reads as more than consistency: the
  hand-rolled style has no request dedupe (two components mounting the same
  page fetch twice), no cache (a back-navigation refetches everything), no
  shared retry, and reinvents loading and error state every time — which is
  also how QF-05's silent-empty-section pattern spreads.

  Web suite green.

### QF-04 — v2: dead react-query dep + 6 hand-rolled polling loops `[DONE]`
`@tanstack/react-query` has zero imports while `useMessages.ts` runs setInterval
polls at 15-30s (battery + backend load). Either adopt react-query with sensible
refetch intervals/backoff for messaging, or drop the dep and centralize polling
with visibility-aware backoff. Decide in-item; log the choice.
Log:
- 2026-08-31: Plan created.
- 2026-09-03: DECISION — dropped the dependency, centralised the loops. Half
  the finding was already stale, which changed what was worth doing.

  `@tanstack/react-query`: zero imports, confirmed, removed from package.json
  and the lockfile. Adopting it would have meant rewriting five working hooks
  to gain a cache nothing else in the app uses; the other hooks
  (useFeed, useNotifications, useSchool) are all bespoke useState too, so
  react-query would have been a second paradigm rather than the paradigm.
  useSchool's comment saying "react-query is not wired up" now says it was
  dropped, so the next reader does not go looking for it.

  THE STALE HALF: the five `setInterval` loops were ALREADY visibility-aware —
  every one was gated on `useAppActive`, so a backgrounded app has never
  polled. "Battery + backend load" from unconditional polling is not what the
  code did.

  What was actually missing is BACKOFF. A conversation endpoint that started
  failing was retried every 15 seconds forever, on phones, on cellular — the
  shape that turns one server problem into a self-inflicted load spike. New
  `usePolling(task, ms, {enabled})` doubles the interval on each consecutive
  failure to a ceiling of 10x and resets on the first success.

  For backoff to mean anything the fetchers had to STOP SWALLOWING SILENTLY.
  They still catch — a failed background poll must not surface as an unhandled
  rejection — but they now return true/false, and `usePolling` reads a `false`
  resolution as a failure. That is the smallest change that makes the loop able
  to tell "nothing new" from "the server is down", and it is a piece of QF-05's
  silent-partial-failure pattern paid off in passing.

  One subtlety the tests pin: the task ref is held in a `useRef` so a new
  inline arrow on every render does not tear down and rebuild the interval,
  which would reset its phase and poll far more often than asked.

  Mobile suite 96 files / 715 passed; tsc clean.

### QF-05 — Silent partial-failure pattern `[DONE]`
`DiplomaPage.jsx:366-411` and elsewhere: parallel fetches whose failures go to
console.error, leaving silently empty sections. Add a section-level error state +
retry affordance; sweep for the pattern.
Log:
- 2026-08-31: Plan created.
- 2026-09-03: Swept first, and "and elsewhere" turned out to be nowhere — ALL
  13 swallow-to-console handlers are in DiplomaPage.jsx. That is what made a
  real fix tractable instead of a codebase-wide sweep.

  The bug, precisely: five sections are fetched independently so one failure
  cannot blank the others, which is right. What was wrong is the next line —
  each rejection went to `console.error` and the section rendered EMPTY,
  indistinguishable from "this student has none of these yet". A parent looking
  at a diploma with no transfer credits could not tell whether the credits were
  missing or the request was.

  A second defect underneath it, easy to miss: the per-call
  `.catch(err => console.error(...))` also CONVERTED every rejection into a
  fulfilled promise, so the surrounding `Promise.allSettled` saw five successes.
  Nothing downstream could have discovered which section failed even if it had
  wanted to. Those catches are gone — `allSettled` already isolates the calls,
  which is the whole reason it is there.

  `reportSectionFailures(results, labels)` now names the failed sections in one
  toast: "Could not load: transfer credits. Everything else is up to date."

  A TOAST, NOT AN INLINE BANNER, deliberately. This page is a masonry gallery
  plus a sidebar; there is no honest place to put five per-section error states
  without redesigning the layout, and redesigning a layout is not something to
  do without looking at it. The toast is an existing app-wide primitive, needs
  no layout work, and delivers the thing that was actually missing: the user
  finding out. The phrasing matters too — without "everything else is up to
  date" the message reads as "the diploma is broken", and a parent has no way
  to know the credits they CAN see are current.

  Five tests, including two that read the page source: that no
  `.catch(err => console.error` shape survives, and that every `allSettled`
  block has a matching report call.

  Web suite 2505 passing.

### QF-06 — Bundle weight `[DONE(html2pdf deferred; two of the three claims were already false)]` (low)
Three PDF libraries (html2pdf.js, pdf-lib, react-pdf) -> consolidate; lazy-load
the 10MB OpenCV WASM behind the document-scanner route. Build currently needs a
4GB heap.
Log:
- 2026-08-31: Plan created.
- 2026-09-03: Checked each claim before acting, and TWO OF THE THREE were
  already false.

  - **OpenCV is already lazy.** `workers/documentScanner.worker.js` does
    `await import('@techstark/opencv-js')` inside `ensureLoaded()`, in a web
    worker. Nothing to do.
  - **pdf-lib is already lazy** — `await import('pdf-lib')` inside
    `services/documentScanner.js`.
  - **html2pdf was NOT.** Three pages imported it at module scope
    (PublicTranscriptPage, PublicEvidenceReport, admin/TranscriptGeneratorPage)
    and used it only in a Download handler. It pulls in html2canvas and jsPDF,
    so every visitor to a public transcript downloaded the PDF machinery
    whether or not they ever clicked Download. Now loaded on demand.

  "CONSOLIDATE THE THREE PDF LIBRARIES" — declined, with a reason. They are not
  three ways of doing one thing:
    - `html2pdf.js` renders existing DOM to a PDF (transcript export),
    - `pdf-lib` ASSEMBLES a PDF programmatically (the document scanner's output),
    - `react-pdf` VIEWS a PDF in the page (evidence and journal previews).
  Replacing all three with one would mean writing the missing capabilities by
  hand. The weight problem was never the count; it was that one of them was
  eager.

  The 4GB build heap is unaddressed and is not obviously about these — worth a
  measurement pass of its own rather than a guess.

  Web suite 2505 passing.

### QF-07 — Styling drift `[DONE(ratcheted; the 293 not converted)]` (low)
v1: ~40 genuinely off-palette hex values (plus ~160 brand colors written as hex —
mechanical swap); v2: 241 hex vs 208 token usages, off-palette `#af56e5`,
`#2469d1`, `#ff9028`. Use brand tokens (`optio-purple`/`optio-pink`).
Log:
- 2026-08-31: Plan created.
- 2026-09-03: Measured properly, corrected the finding, and ratcheted rather
  than converted.

  v1 has 493 hex literals in `src/`. Split against what
  `tailwind.config.js` actually defines:
    - **200 are brand colours written as hex** — a mechanical swap to the token.
    - **293 are off-palette**, across 88 distinct values. Mostly Tailwind's own
      greys spelled out (`#e5e7eb` ×27, `#6b7280` ×20, `#9ca3af` ×10) plus
      one-off pinks, greens and blues that drifted in.

  A CORRECTION: the item lists `#af56e5` and `#2469d1` as off-palette. They are
  not — both are DEFINED in tailwind.config.js, as `pillar-art` and
  `pillar-stem`. They belong in the 200 bucket, not the 293. Which matters,
  because "off-palette" invites deleting a colour where the right fix is naming
  it.

  `frontend/src/__tests__/brandPalette.test.js` reads the sanctioned palette out
  of the config (so it cannot drift from the design system) and ratchets the
  off-palette count at 293, with the usual companion test against a baseline
  that has stopped meaning anything, plus a guard that the config is being read
  at all — an empty palette would make every hex look off-palette and turn the
  ratchet into noise.

  NOT CONVERTED, deliberately: every one of the 293 is a visual change to a real
  screen, and the whole point of a brand palette is that somebody looks at the
  result. A ratchet stops the drift; a person fixes it.

  Web suite green.

### QF-08 — A11y: tooling installed but unused; 36 div-onClick `[DONE(tooling wired; div-onClick ratcheted, not converted)]` (low)
Wire vitest-axe smoke tests on the top pages or remove the dead deps; convert
div onClick to buttons/keyboard handlers.
Log:
- 2026-08-31: Plan created.
- 2026-09-03: Wired the tooling rather than removing it, and ratcheted the
  clickable divs rather than converting them.

  `vitest-axe`, `jest-axe` and `axe-core` had been devDependencies with ZERO
  imports. `frontend/src/components/ui/__tests__/a11y.test.jsx` now runs axe
  over ten shared primitives (Alert, Button, Button disabled, Card, EmptyState,
  Input, RolePill, Skeleton, Spinner, StatusBadge). All ten pass clean.

  SCOPE CHOSEN DELIBERATELY: the primitives, not "the top pages" the item
  suggests. A page here drags in AuthContext, the router and a dozen API calls,
  so a page-level axe test is mostly a mocking exercise that goes red for
  reasons unrelated to accessibility. These components render on nearly every
  page, so a violation in one is a violation everywhere — the leverage is
  better and it needs no mocking. The test says out loud that axe catches maybe
  a third of real problems and nothing about whether a screen-reader user can
  make sense of the thing; passing is not a claim that the app is accessible.

  THE COUNT IS 142, NOT 36, and the difference is real rather than drift: a
  single-line grep only sees `<div onClick=` when both sit on one line, and
  most JSX spreads attributes over several. Ratcheted at 142 rather than
  converted — each conversion is a behavioural change to a real screen, and
  doing 142 of them blind is how a modal's close button stops working.

  Web suite 283 files / 2490 tests, all passing.

### QF-09 — v2 TypeScript widening: 390 explicit `any` `[DONE(ratcheted at the real count, 580)]` (low)
Ratchet down: count-based guard or eslint rule warn->error per directory.
Log:
- 2026-08-31: Plan created.
- 2026-09-03: Ratchet added — and the count is 580, not 390. Measured across
  `src/` and `app/`, excluding tests and comment lines, 110 files carry at least
  one.

  `frontend-v2/src/__tests__/typeWidening.test.ts` fences it at 580 with the
  same shape the backend uses for its repository debt: may shrink, never grow,
  plus a companion test that fails if the real count drops far enough below the
  baseline that the ratchet has stopped ratcheting. Converting 580 is not asked
  for and is not funded; what is asked for is that the number stop climbing.

  Why this is worth fencing rather than shrugging at: every `any` is a place the
  compiler was told to stop checking, and this app reads snake_case JSON into
  camelCase components. `as any` is precisely how a renamed API field ships as
  `undefined` and renders as a blank card instead of failing to compile.

  Chose the count guard over the eslint rule the item also offers, for the same
  reason CI-03 landed in vitest: v2 has no eslint wired up either, so the rule
  would be another thing configured and never run.

  Mobile suite 97 files / 718 passed; tsc clean.

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

### OPS-02 — `render.yaml` is not in effect; live config is dashboard-only `[DONE(reconciled; re-adopting Blueprint sync stays NEEDS-USER)]`
First step is autonomous and read-only: pull live service config via the Render
API/MCP and rewrite `render.yaml` to match reality (documented as such). Whether
to re-adopt Blueprint sync is then NEEDS-USER.
Log:
- 2026-08-31: Plan created.
- 2026-09-03: Reconciled against the live Render API, and the reconciliation
  turned up three things worth more than the file rewrite itself.

  **1. www.optioeducation.com is not the service anyone thought.** It is served
  by `optio-marketing` (static, rootDir `marketing`, created 2026-09-01) — a
  service that was MISSING FROM render.yaml entirely while serving the apex.
  Verified by response headers, not by assumption: www's `last-modified`
  (18:23:30) matches optio-marketing exactly, and app.optioeducation.com's
  (22:34:20) matches optio-prod-frontend. www redirects /login to app.

  **2. Neither backend installs ffmpeg.** The live build command on both is
  `pip install -r requirements.txt`; render.yaml claimed
  `apt-get install -y ffmpeg && ...`. Nothing crashes —
  `services/video_processing_service.py` probes for ffmpeg at startup and
  degrades — so server-side video probing and thumbnail generation are simply
  OFF in production, and have been, silently. Fixing it is a dashboard edit,
  not a file edit.

  **3. The security headers ARE live, on the host that matters.**
  app.optioeducation.com returns HSTS, frame-ancestors, Permissions-Policy, the
  full suite. So the 2026-08-15 header work was not wasted, which the audit's
  "not in effect" framing left open. But www returns ONLY
  `x-content-type-options` — the apex makes no HSTS claim at all, which is
  precisely what an HSTS preload submission for optioeducation.com is judged
  on. Lower severity (static marketing site, no auth, no user data), still a
  real gap.

  render.yaml now opens with a header naming which service serves which
  hostname and listing those three divergences; the two missing services
  (`optio-marketing`, `optio-dev-v2-frontend`) are added; and the v1 static
  sites' `rootDir`/`staticPublishPath` are corrected to the live values (repo
  root + `frontend/dist`, not `frontend` + `./dist` — a different thing that
  looks similar). Valid YAML, 7 services.

  STILL NEEDS-USER, unchanged: whether to re-adopt Blueprint sync. And two
  dashboard edits nobody can make from here — adding ffmpeg to the backend
  build commands, and adding the header suite to optio-marketing.

### OPS-03 — Nothing applies `supabase/migrations/` to production `[NEEDS-USER]`
Migrations reach prod by hand (MCP/dashboard) — the exposure-audit workflow exists
because of exactly this. Proposal: a gated `supabase db push` step in release.yml
(or a manual-approval workflow). Prod risk -> user decision.
Log:
- 2026-08-31: Plan created. Question queued for user.

### OPS-04 — Storage objects (student evidence) have no backups `[NEEDS-USER(create 4 secrets + 1 var, then run it once by hand)]`
`backup-db.yml` covers Postgres only and says so. Write a storage-backup workflow
(rclone/supabase storage API to encrypted archive); wiring its secret into CI is
NEEDS-USER, the workflow + docs are autonomous.
Log:
- 2026-08-31: Plan created.
- 2026-09-03: Workflow and docs written. It has NEVER RUN and cannot until the
  credentials exist — that half is the user's, as the item anticipated.

  Measured what is actually at stake first: 3,463 objects, ~7.8 GB across 20
  buckets, of which `quest-evidence` is 5.7 GB over 2,167 objects. That is
  student work submitted as proof of learning — the one class of data on this
  platform that cannot be regenerated, re-derived, or asked for again. Losing it
  is not a restore problem, it is a "the evidence for a transcript no longer
  exists" problem.

  `.github/workflows/backup-storage.yml`: weekly (Sundays 09:00 UTC, an hour
  after the DB dump so they never contend), `rclone sync` (incremental),
  client-side encrypted with rclone's `crypt` backend, into the same GCS bucket
  the DB dumps use under a `storage/` prefix. Reuses the existing WIF setup, so
  no new cloud configuration.

  TWO SHAPE DECISIONS, both departures from backup-db.yml and both deliberate:
    - Weekly, not nightly. 7.8 GB re-uploaded every night is waste; evidence is
      append-mostly, so a normal week moves megabytes. The cost is a 7-day RPO
      for files against 24h for rows, which is acceptable because a file that
      existed a week ago still exists in Supabase unless something DELETED it —
      and deletion is what the retention rule protects against.
    - `rclone crypt`, not `gpg --symmetric`. The DB dump is one file. 3,463
      files are not: tarring them to encrypt would discard incrementality and
      re-upload everything every run. `crypt` encrypts each object and its name
      client-side while keeping the sync incremental, preserving the property
      the DB job cares about (the bucket only ever holds ciphertext).

  THREE GUARDS AGAINST THE BACKUP JOB ITSELF, because "the sync deleted
  everything" turns a backup into a liability:
    - A floor check refuses to sync if the source lists under 1,000 objects.
      Credentials that authenticate but see nothing would otherwise faithfully
      mirror emptiness over the only off-site copy.
    - `--max-delete 100` aborts with nothing deleted.
    - Retention stays a bucket lifecycle rule, not a workflow step — same
      reasoning backup-db.yml gives for the same choice.

  And every run pulls one object back THROUGH the decryption layer. Client-side
  encryption fails silently; nobody finds a wrong key until they need the data.

  TO TURN IT ON (user):
    1. Supabase dashboard -> Project Settings -> Storage -> S3 Access Keys ->
       new key. Store as `BACKUP_SUPABASE_S3_ACCESS_KEY_ID` /
       `BACKUP_SUPABASE_S3_SECRET_ACCESS_KEY`.
    2. `openssl rand -base64 32` twice ->
       `BACKUP_STORAGE_CRYPT_PASSWORD` / `BACKUP_STORAGE_CRYPT_SALT`. **Store
       these outside GitHub too**, with BACKUP_GPG_PASSPHRASE — losing them
       makes every backed-up byte permanently unreadable, and there is no second
       copy.
    3. Repository variable `BACKUP_SUPABASE_PROJECT_REF` = `vvfgxcykxjybtvpfzwyx`.
    4. Run it once by hand and watch it. The first sync moves all 7.8 GB.
  Full setup and restore instructions are in backend/docs/BACKUP_RESTORE.md,
  and backup-db.yml's "that gap is still open" note now points at it.

### OPS-05 — No branch protection / PR gate on `main` `[NEEDS-USER]`
Direct-push-to-main is the documented workflow. Changing it is a workflow
decision for the user, not a code fix.
Log:
- 2026-08-31: Plan created. Question queued for user.

### OPS-06 — `marketing/` site + `marketingUrl.js` exist only untracked `[DONE(resolved by the owning session)]`
They sit uncommitted in the main working tree and belong to another in-flight
session. Do NOT commit someone else's work from here (CLAUDE.md rule 12). Ask the
user to have the owning session commit them.
Log:
- 2026-08-31: Plan created. Question queued for user.
- 2026-09-03: RESOLVED — somebody committed them. `origin/main` carries 63
  files under `marketing/` and `frontend/src/utils/marketingUrl.js`. Found
  while reconciling OPS-02: Render's `optio-marketing` service builds
  `rootDir: marketing` from `main`, which it could not do if the directory were
  still untracked. Nothing to ask.

### OPS-07 — Superadmin identity hardcoded in ≥4 source files `[DONE]`
`utils/platform_staff.py:18`, `utils/auth/decorators.py:561`, `swagger_config.py`,
`api_spec_generator.py` name a personal email. Move to `Config`
(e.g. `SUPERADMIN_EMAILS`), default preserving current behavior.
Log:
- 2026-08-31: Plan created.
- 2026-09-03: Five sites, not four, and they were not all the same KIND of
  problem — which is why they did not all get the same fix.

  An access decision, moved to config:
    - `utils/platform_staff.OPTIO_STAFF_EMAILS` -> `Config.PLATFORM_STAFF_EMAILS`
      (comma-separated env var, default unchanged so nobody's access moved).
      Read at CALL time, not import time: import-time capture freezes whatever
      the environment held when the first module imported it, which in a test
      run is whatever the previous test left behind.
    - `routes/direct_messages.SUPPORT_EMAIL`, the "Optio Support" DM alias,
      which resolves a real account by email. NOT switched to
      `Config.SUPPORT_EMAIL` — that is support@optioeducation.com, an inbox with
      no Optio ACCOUNT behind it, so routing student support DMs there would
      address a user id that does not exist. It reads the staff list instead.

  Simply wrong, and fixed rather than parameterised:
    - `swagger_config.py` and `api_spec_generator.py` published a personal
      Gmail as the API's public support contact. Now `Config.SUPPORT_EMAIL`.

  A docstring:
    - `utils/auth/decorators.py` said "Only tannerbowman@gmail.com should have
      this role". Now points at `Config.SUPERADMIN_EMAIL` — a docstring naming
      a person goes stale silently.

  NOT covered, deliberately, and the guard test says so: `backend/scripts/`.
  Nineteen one-off operational scripts look this account up by email. That is
  OPS-08 and it wants a `--user-email` argument, not a config constant — a
  script hardcoding whose data to repair is a different bug from an application
  hardcoding who is staff.

  Guard: tests/unit/test_no_hardcoded_superadmin_identity.py — no personal
  email in application code, the default list is unchanged (moving a list to
  config must not quietly change who is on it), the check reads config at call
  time, and the superadmin ROLE still qualifies even with the list emptied.

  ruff clean, mypy clean. Tests: 4856 passed, 160 skipped, 0 failed.

### OPS-08 — ~70 hand-run prod-repair scripts, 19 keyed to one personal account `[DONE]`
`backend/scripts/`. Parameterize the hardcoded email lookups (`--user-email`
arg), add a `backend/scripts/README.md` runbook (what each does, safety class,
dry-run flags).
Log:
- 2026-08-31: Plan created.
- 2026-09-03: 21 scripts parameterised (the count was 20 by email plus one that
  printed it), and a runbook covering all 71.

  Measured the part that matters: of the 21 hardcoded to one personal account,
  **eight WRITE to production**. That is the actual risk — a script that
  hardcodes whose data it repairs is one copy-paste from repairing the wrong
  person's, and it gives no signal when the account it names is not the one you
  meant. It just succeeds, against somebody else.

  `scripts/_target_user.py`: `--user-email` is REQUIRED and has no default. A
  default would put the old behaviour back with extra steps. The eight mutating
  scripts additionally require `--yes`; the read-only ones deliberately do NOT,
  because a confirmation prompt on a harmless script is how people learn to
  pass `--yes` without reading.

  Runbook in `backend/scripts/README.md`, generated by reading every file
  rather than by guessing: 71 scripts, **37 of which write to the database**,
  each classified read-only / WRITES (dry-run) / WRITES, with its flags and its
  docstring. Plus four rules, of which the one that will matter most is the
  last: names like `check_feb15_task.py`, `find_avian_task.py` and
  `add_wellness_75.py` were written for a single past incident and kept. They
  still RUN. That is not the same as still being correct.

  Two scripts needed hand-fixing after the mechanical pass — their lookup sat
  inside an indented block, so the substitution broke indentation. Caught by
  `compileall`, which is why it ran.

  ruff clean, mypy clean, 4856 passed.

### OPS-09 — 907 CRLF files, no `.gitattributes` `[NEEDS-USER]`
Normalization touches ~900 files and rewrites blame; must land at a quiet moment
coordinated with all in-flight branches. Prepare the `.gitattributes` +
`git add --renormalize` recipe; user schedules it.
Log:
- 2026-08-31: Plan created. Question queued for user.

---

## Phase 7 — Hygiene (low)

### HYG-01 — Committed junk `[DONE]`
`frontend/test-output.txt` (226KB), `.debug-sessions/`, tracked `__pycache__`
under scripts dirs, dead Windows tooling (`*.ps1`, `*.bat` from the pre-macOS
era — verify unreferenced first).
Log:
- 2026-08-31: Plan created.
- 2026-09-03: Nine files untracked or deleted, and `.gitignore` extended so the
  first two cannot come back.

  Untracked but LEFT ON DISK (they are somebody's local state, not mine to
  delete): `frontend/test-output.txt` — 226KB of a vitest run from a machine
  nobody has — and `.debug-sessions/`, a local scratchpad. Both are now
  gitignored with a comment saying why.

  DELETED: the six Windows scripts — `check_bundle.ps1`, `check_privacy.ps1`,
  `poll_build.ps1`, `restart_v2.ps1`, `setup-local.bat`, `start-local.bat`.
  The item said to verify they were unreferenced first, so I did: zero
  references from any doc, workflow, package.json or source file. They are also
  actively misleading — `restart_v2.ps1` calls `Get-NetTCPConnection`, and
  development moved to macOS long enough ago that CLAUDE.md's own local-setup
  section is written in `lsof`.

  NOT FOUND, so nothing to do: the tracked `__pycache__` the item mentions.
  `git ls-files | grep __pycache__` returns zero — already handled.

  Backend 4856 passed; web 2479 passed.

### HYG-02 — `verify/` — 20 tracked hash-named .mjs scripts `[NEEDS-USER]`
Per-ticket client-verification scripts; unclear if still wanted. Ask before
deleting.
Log:
- 2026-08-31: Plan created. Question queued for user.

### HYG-03 — pip-audit CVE suppressions re-review `[DONE]` (low)
Three carried ignores (flask-cors, pyjwt, pytest) — re-check whether fixed
versions now exist; drop stale suppressions.
Log:
- 2026-08-31: Plan created.
- 2026-09-03: Re-ran the audit with the ignores REMOVED, which is the only way
  to find out. None of the three survived. `pip-audit` now runs with no
  suppressions at all.

  - PYSEC-2024-271 (flask-cors) and PYSEC-2025-183 (pyjwt): **no longer
    reported**. The ignores were silencing nothing, which is the worst state
    for a suppression to be in — it reads as a known accepted risk while
    actually being dead configuration, and the next person to review it spends
    their time on a finding that no longer exists.
  - PYSEC-2026-1845 (pytest 8.3.4): still real. FIXED rather than re-ignored,
    by bumping to 9.0.3. The original reason for ignoring it — "a major bump,
    and pytest is test-only" — had quietly stopped applying: the local venv has
    been running the whole suite on 9.0.3 for a while, so the bump was already
    observed rather than hoped for. Verified 9.0.3 installs cleanly beside
    pytest-cov 7.1.0, pytest-flask and pytest-mock in a throwaway venv.

  Dropped two unused test dependencies while there: `pytest-flask` (conftest
  defines its own `client` fixture; nothing uses `live_server` or
  `client_class`) and `pytest-mock` (zero tests reference `mocker`). The
  evidence is that the local venv has never had either installed and runs the
  full suite.

  The workflow comment now says to add an ignore back only with a dated reason
  AND a re-check date — an ignore nobody revisits is a vulnerability with a
  comment on it.

  `pip-audit --strict` clean with no ignores. Backend 4856 passed.

---

## Phase 8 — Follow-ups found while doing the remediation

Not from the 2026-08-31 audit. Each was found by a session working an item above,
recorded in that item's Log, and left alone at the time to keep one item to one
commit. They are tracked here so they do not evaporate.

### FU-01 — `registration.py` reads `Config` from a scope that may not be bound `[DONE]`
Found by SEC-11. `routes/auth/registration.py` imported `Config` inside
`register()` and read it from that function's `except Exception` handler. A
function-local import makes the name local for the whole function, so any path
raising before the import reached the handler unbound.
Accept: import hoisted; guard test bans the shape.
Log:
- 2026-09-03: Verified still live. `register()` is one try spanning lines
  119-570; the import sat at line 195 and the handler read `Config.FLASK_ENV`
  at 568. Reachable: the handler's known-error branches all `raise`, so any
  early exception whose message matched none of them fell through to that line
  and raised UnboundLocalError instead — the caller gets a 500 from the wrong
  place and Sentry groups on the UnboundLocalError, losing the real cause. The
  earlier note that it was "unreachable again now" was wrong; the reachable
  window is every unexpected failure in the ~75 lines of validation before the
  import.
  Fix: hoisted `from app_config import Config` to module scope, which is what
  password.py, token_delivery.py, google_oauth.py and login/security.py already
  do. Guard: tests/unit/test_lazy_import_not_used_in_handler.py — a function-
  local import in a try body, read from that try's handler or finally. Proven
  against the real pre-fix file (it reports Config, 195, 568), and it correctly
  passes password.py's two handlers that import `traceback` for themselves and
  an `else:` branch, which is guaranteed-bound.
  NOT guarded, deliberately: ordinary assignments made in a try and read from
  its handler. Safety there depends on where the first raising statement is,
  which needs flow analysis. Measured anyway — 11 sites — and triaged each:
  all bind before anything can raise, except
  services/student_ai_assistant_service.py which guards with
  `if 'response_text' in locals()`. The test's docstring says so.
  ruff/mypy clean; 4733 passed, 160 skipped, 0 failed.

### FU-02 — `public.get_human_quest_performance` reads two dropped tables `[DONE]`
The function body references `quest_ratings` and `quest_tasks_archived`, neither
of which exists any more, so it cannot run. Decide between deleting it and
rewriting it against the current schema — check for callers (backend, RPC from
either frontend, Supabase dashboard saved queries) before either.
Log:
- 2026-09-03: Carried in from a prior session's notes. Not yet verified.
- 2026-09-03: Verified against the live DB and DROPPED —
  `supabase/migrations/20260903210000_drop_dead_get_human_quest_performance.sql`.
  APPLIED TO PROD the same day on the user's instruction, and verified: the
  function is gone from `pg_proc`. (An earlier line here said it was waiting
  alongside 20260903200000 — which was itself already applied. See the
  Migrations section near the end of this file.)

  Confirmed broken: `quest_ratings` and `quest_tasks_archived` are both absent
  from pg_class, so the body raises 42P01 on every call. It also still carries
  the empty-search_path defect that 20260903200000 fixed for the rest of that
  batch and deliberately skipped here — qualifying the names would have swapped
  one 42P01 for another.

  Rewrite was considered and rejected, not skipped for effort: two of the four
  columns it returns (avg_rating, avg_engagement_score) are computed FROM the
  dropped tables. There is no rating source in the schema any more and no
  per-quest task table to divide by, so a rewrite would be a new metric nobody
  asked for rather than a repair.

  Verified dead four ways before dropping: no caller in the repo (its one
  caller, services/ai_performance_analytics_service.py, was deleted with the
  `ai_*` metrics tables); no other function in public or private names it
  (pg_proc.prosrc scan); no pg_cron job names it (cron.job is empty); and
  EXECUTE is granted to postgres and service_role only, never anon or
  authenticated, so PostgREST never exposed it.

  No guard test: whether a function's tables exist is a property of the live
  catalog, which no offline test can see. The `requires_db` suite could hold one
  eventually; not worth inventing here for a single dead function.

  Doc debt closed with it: `backend/docs/RPC_SECURITY_AUDIT.md` (Dec 2025) leads
  with "CRITICAL ACTION REQUIRED" over this function and lists two more
  findings. Re-checked all three — the injection was fixed in place back in
  20260112, and the other two (`add_user_skill_xp`, `bypass_friendship_update`)
  are moot because both calling files were deleted and `friendships` was dropped
  in the March 2026 audit. Every file:line link in it now points at a file that
  no longer exists. Added a dated HISTORICAL banner saying so rather than
  rewriting 662 lines: a stale P0 that reads as live is what gets actioned by
  the next person who opens it.

### FU-03 — `public.bug_reports` is deny-all RLS with 356 rows `[DONE]`
Found by SEC-14. RLS is on with zero policies, so the superadmin triage
endpoints return an empty list rather than the reports. Route-level gating is
already superadmin-only, so the honest fix is to give `BugReportRepository` the
admin client (with the justification comment SEC-13's gate requires), not to add
a policy that widens reach.
Log:
- 2026-09-03: Carried in from SEC-14's Log. Not yet verified against the current
  repository code.
- 2026-09-03: Verified and FIXED in code — no migration, no new policy.

  Confirmed against prod: `bug_reports` has `relrowsecurity = true` and 0 rows
  in pg_policies, holding 356 reports. The mechanism is
  `BugReportRepository(user_id=user_id)` at routes/bug_reports.py — passing
  user_id makes BaseRepository derive a user-scoped client from the request's
  Supabase token, and against a table with no policies that reads nothing.
  What the superadmin saw was HTTP 200, `count: 0`, no error and no log line:
  indistinguishable from "no reports yet".

  Fix: the three triage routes (GET list, GET one, PATCH) now build the repo
  with `client=_triage_client()`, one helper carrying the justification the
  SEC-13 gate requires. Authorization is unchanged and was never RLS —
  `@require_role('superadmin')` at the route is what gates these, and RLS was
  only ever able to silence them.

  A policy was considered and rejected. Reports carry reporter email, role and
  a diagnostics blob; nothing but the Flask backend reads this table (both
  frontends use the Supabase client for OAuth only), so a policy would open a
  PostgREST path to that data that no caller needs.

  CENSUSED THE CLASS rather than assuming this was the only one. Nine
  `Repository(user_id=...)` constructions exist in backend/; three are these,
  and the other live ones are quest/listing.py (`quests`, 4 policies) and
  admin_audit_service.py (`admin_audit_logs`, 2 policies). Checked every one
  against pg_policies: `bug_reports` is the ONLY user-client repository whose
  table is deny-all. So the blast radius is this table and these three routes.

  Guard, two parts, because the existing tests could not have caught this —
  they patch BugReportRepository wholesale, so how it is constructed is
  invisible to them. (1) a test that asserts the list route builds the repo
  with the admin client and no user_id; (2) a static scan banning
  `BugReportRepository(user_id=...)` anywhere in backend/. Proven to have teeth
  by planting a call site and watching it fail.

  NOT changed: `create_bug_report`'s `BugReportRepository()` (no args) already
  gets the admin client and works. It does make BaseRepository log "Using admin
  client for bug_reports repository. Ensure this is intentional" on every
  submission, which is a misleading WARNING but not this item's bug.

  ruff clean, mypy clean, 4735 passed / 160 skipped / 0 failed.

### FU-04 — `[DIPLOMA]` and `[DEBUG]` traces log at WARNING in hot paths `[DONE]`
Trace-level breadcrumbs emitted at WARNING, which is the level Sentry and the
Render log filters treat as "someone should look". Drop them to DEBUG, or delete
the ones that were scaffolding.
Log:
- 2026-09-03: Carried in from a prior session's notes. Not yet verified.
- 2026-09-03: Verified and DELETED — 11 lines, which is wider than the WARNING
  six the note named. Deleting beat demoting: an f-string argument is built
  before the logger sees it, so `logger.debug(f"...")` on a hot path still pays
  for a message nobody reads.

    - routes/quest/listing.py x2, WARNING. The quest listing is the app's
      busiest read and both lines fired on every request, one of them carrying
      a raw user_id.
    - routes/parent/child_overview.py x7 — four `[DIPLOMA]` at WARNING, three
      `[DEBUG]` at INFO, one of those inside a per-task loop. The worst is not
      the level: `[DIPLOMA] Raw query result: {completed_tasks_subjects.data}`
      logged the raw PostgREST rows of a student's completed tasks, at WARNING,
      on the parent dashboard's main read. Student record data into the logs
      and on to Sentry. The PII filter from SEC-05 masks emails; it has no way
      to know a list of task rows is a student record.
    - routes/auth/registration.py x3, ERROR. One exception logged across three
      records, all tagged `[DEBUG]`, under a comment claiming it logged
      "without exposing sensitive data" while the third line printed
      `auth_error.args`. Now one line.

  FOUND WHILE DOING IT, and it constrains SEC-05: the PII scrubber does NOT
  reach `exc_info`. `_scrub_record_extras` skips every standard LogRecord
  attribute and `exc_info` is one, so a formatted traceback goes out unmasked.
  That is why registration's replacement keeps the exception in the MESSAGE
  (scrubbed) instead of switching to `exc_info=True` — Supabase auth errors
  quote the email that failed. Worth its own item if anyone wants tracebacks
  scrubbed too.

  ORIGIN, checked rather than assumed: `git log -S` puts these in commits from
  2025-12-27 and 2026-01-29. They are hand-written scaffolding, NOT fallout
  from QB-03's print-to-logger conversion — that script explicitly skipped any
  print containing 'DEBUG'.

  Guard: tests/unit/test_no_debug_tagged_logs.py bans a `[DEBUG]`-tagged log
  message at any level across routes/services/repositories/utils/jobs/
  middleware. The rule is the TAG, not the level, because the tag is the
  decidable part — module tags like `[REGISTRATION]` and `[BugReport]` are the
  house convention and are explicitly tested as allowed. Proven to have teeth
  with a planted call site.

  PROCESS NOTE FOR THE NEXT SESSION (cost 10 minutes here): child_overview.py
  and quest/listing.py are CRLF files, and editing them through Python's
  default text mode silently rewrote both to LF — an 1800-line diff hiding an
  8-line change. Read/write `'rb'`/`'wb'`, or check `grep -c $'\r$'` against
  HEAD before staging. Normalizing line endings is OPS-09's scheduled job, not
  a side effect of an unrelated commit.

  ruff clean, mypy clean, 4739 passed / 160 skipped / 0 failed.

### FU-05 — Acting-as tokens are body-only, so SEC-03's gate cannot apply `[NEEDS-USER(half fixed; the other half needs a browser)]`
Found by SEC-03. Parent -> dependent acting-as (`routes/dependents.py`
`/<id>/act-as`, `/stop-acting-as`) has no cookie of its own: the token is
returned in the body to every client and replayed as a Bearer. Masquerade was
fixed by routing through `token_delivery`; this one cannot be until it has a
cookie the way masquerade does. Allowlisted in `test_token_delivery.py` with
that reason.
Log:
- 2026-09-03: Carried in from SEC-03's Log.
- 2026-09-03: The finding is TWO endpoints, not one, and they are not the same
  problem. Half is fixed; half genuinely needs a browser.

  FIXED — `/stop-acting-as`. It was returning the PARENT'S OWN access token and
  30-day refresh token in the body to every caller, and setting no cookies at
  all. That is exactly the defect SEC-03 fixed on masquerade's `/exit`, in the
  endpoint next door, and it has nothing to do with the missing acting-as
  cookie: de-escalation hands somebody back their own cookie-anchored session.
  It now goes through `refresh_body_tokens()` and calls `set_auth_cookies()`.
  Cookie-capable browsers get cookies and an empty body; Safari/iOS and the
  mobile app still get tokens, because gating them would log the parent out
  rather than harden anything.

  The web client needed the matching change — `ActingAsContext.clearActingAs`
  called `tokenStore.setTokens(access_token, ...)` unconditionally, so with an
  empty body it would have wiped the in-memory token with `undefined`. It now
  stores only what was actually sent and clears otherwise.

  NOT FIXED — `/act-as` itself. That one really does need the cookie: the
  acting-as token is read ONLY from `Authorization: Bearer` (session_manager
  reads a `masquerade_token` cookie but has no equivalent for acting-as), so
  gating the body would delete the feature. The change is: set an
  `acting_as_token` cookie on `/act-as`, teach `get_effective_user_id` and
  `get_actual_admin_id` to read it beside `masquerade_token`, clear it on
  `/stop-acting-as`, and drop the web client's reliance on the body copy.

  WHY THAT HALF IS NOT AUTONOMOUS: it moves identity resolution, which is the
  path SEC-08 was written about, and its failure mode is "a parent is stuck
  inside — or locked out of — their child's account". No unit test in this
  suite would catch a stale cookie that survives `/stop-acting-as`; that needs
  someone clicking through it. Doing it blind is the same class of mistake as
  the phone-verification hold that had to be flag-disabled for three weeks.

  SEVERITY NOTE, so this is not over-read: the remaining exposure is smaller
  than masquerade's was. The acting-as token grants the DEPENDENT'S authority
  to a parent who already controls that account outright, so there is no
  escalation — it is a credential living in JS memory that should be in an
  httpOnly cookie. The design around it is already careful: 24h access token,
  a 30-day ceiling on the chain, and `iat0` pinning so refreshes cannot extend
  a grant indefinitely.

  ruff clean, mypy clean. Backend 4858 passed; web 2479 passed.

---

## Migrations: what is actually applied to production

Read this before claiming a migration in `supabase/migrations/` is or is not
live. Nothing in the release pipeline applies them (OPS-03), so the only way to
know is to look — either `list_migrations` on the Supabase MCP, or the object
itself in `pg_proc` / `information_schema`.

| File | Applied to prod | How |
|---|---|---|
| `20260903200000_qualify_tables_in_empty_search_path_functions.sql` | YES, 2026-09-03 20:25 UTC | applied by hand before this session looked; recorded as version `20260903202528` |
| `20260903210000_drop_dead_get_human_quest_performance.sql` | YES, 2026-09-03 | applied this session via `apply_migration`, verified with `pg_proc` (0 rows) and a live call to `get_user_organization` returning data |

A MISTAKE WORTH NOT REPEATING: this session reported the first file as
unapplied. The evidence used was `get_human_quest_performance` still carrying
unqualified table names in prod — which is the one function that migration
DELIBERATELY DOES NOT TOUCH, and says so in a comment block at the bottom.
Generalising from the excluded case to the whole file was the error. The four
functions it does fix (`get_user_organization`, `add_user_skill_xp`,
`log_observer_access`, `verify_parent_student_access`) all had the corrected
bodies in prod the whole time. Check the objects a migration actually changes,
not a neighbour.

VERSION DRIFT, harmless but worth knowing: the applied version stamps
(`20260903202528`, and whatever the drop was recorded as) do not match the
filenames, because both went in through `apply_migration` rather than a file
push. A future `supabase db push` will therefore see both filenames as
unapplied and re-run them. Both are idempotent — `CREATE OR REPLACE` and
`DROP ... IF EXISTS` — so that is safe, just noisy.

---

## Open questions for the user (rolling)

ANSWERED 2026-09-03 (user: "run migrations and push to prod"):

- ~~SEC-10(a) is a live production bug~~ — SHIPPED. See the SEC-10 Log.
- ~~Two migrations written and not applied~~ — both live in prod. One of the
  two was already applied before I looked; see the Migrations note below.

Still open:

- SEC-14: DONE, verified, and `FLASK_SECRET_KEY_OLD` confirmed set by the user
  on 2026-09-03. One dated action remains: do NOT remove FLASK_SECRET_KEY_OLD
  before 2027-03-02 — LTI evidence tokens run 180 days and are stateless.
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
