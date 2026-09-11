# Remediation register

**The only living remediation document in this repository.** Everything open is
here. Everything closed is in [CLOSED_FINDINGS.md](CLOSED_FINDINGS.md) with its
guard named, or listed there as deliberately unguarded. Every mechanical control
is in [RATCHETS.md](RATCHETS.md).

The `PHASE_N_HANDOFF.md` files are historical records of what each phase did.
They are not to be updated, and nothing should be tracked only in one of them —
if an item in a handoff is still open, it is repeated below.

**Last reconciled: 2026-09-10 (post-phase audit).** The audit scored all six
phases against the tree and checked every outstanding item against live state —
the Render API, production Postgres, Sentry, GitHub Actions. Five NEEDS TANNER
items turned out to be already done and are closed below with the evidence; the
things nobody had written down anywhere are now §1 items.

**Status vocabulary.** `NEEDS-USER` — blocked on a decision, a credential or
dashboard access; do not attempt autonomously. `WONTFIX` — declined with
reasons, recorded so a future audit does not re-raise it as an unexamined gap.
`OPEN` — real work nobody is blocked on.

---

## 1. Open findings

| ID | Status | One line |
|---|---|---|
| [OPS-01b](#ops-01b--local-development-still-reads-production) | NEEDS-USER | `backend/.env` and dev's third-party keys still point at production |
| [SEC-18](#sec-18--csrf-exemption-list-stays-a-central-list) | WONTFIX | Confirm or reverse |
| [OPS-05](#ops-05--main-keeps-direct-push-with-no-branch-protection) | WONTFIX | Confirm or reverse |
| [BUG-1](#bug-1--eight-referenceerrors-in-the-web-app) | FIXED | All ten files fixed 2026-09-10. **Seven were dead code** — read the correction |
| [BUG-2](#bug-2--33-app-layer-queries-against-dropped-tables) | OPEN | 33 calls to tables production does not have |
| [BUG-3](#bug-3--rls-findings-from-the-integration-suite) | OPEN | Four findings, asserted in tests, not fixed |
| [BUG-4](#bug-4--questsquest_type-defaults-to-a-value-its-own-check-rejects) | OPEN | Every `INSERT` omitting the column fails |
| [BUG-5](#bug-5--subjectdistributioneditor-writes-keys-outside-the-enum) | OPEN | A live editor writes four subject keys nothing else recognises |
| [ORPH-1](#orph-1--sixteen-tables-no-application-code-reads) | NEEDS-USER | 14 of them hold rows; never decided |
| [CI-07](#ci-07--the-ota-publishes-when-the-deploy-does-not) | OPEN | Mobile can ship ahead of the API it calls |
| [GAP-1](#gap-1--the-carried-forward-gaps) | OPEN | Smaller gaps noted inside closed items |
| [GAP-2](#gap-2--the-handoff-leftovers-nothing-else-tracks) | NEEDS-USER | Nine items that lived only in a handoff |

### OPS-01b — local development still reads production

**Status: NEEDS-USER. The dev half is closed** (see CLOSED_FINDINGS §1b), **and
the E2E half turned out to be closed too.**

Staging project `kltoyqefmcgolbplplsa` exists, is seeded with synthetic data at
production scale, and all three dev Render services read it. A developer on dev
no longer sees real student records.

**Corrected 2026-09-10.** This entry used to say the E2E suite still points at
production. It does not: `mobile-e2e.yml` drives
`optio-dev-v2-frontend-x1dk.onrender.com` against `optio-dev-backend-5flj`, and
that backend has read staging since Phase 2 repointed it. The E2E suite was
never repointed *itself* — it moved when the service under it moved, which is
why the deferral was never revisited.

Still open:

- `backend/.env` (local development) points at production. Two refs, checked.
- Dev still carries production Brevo, Stripe and Gemini keys. Staging fixed the
  database and nothing else. **A prior incident, not a hypothetical: a test run
  once sent real emails to real families through the production Brevo key.**
  This is now the whole of OPS-01b that matters: the E2E suite writes to a
  staging database, but anything it triggers that sends email or charges a card
  still reaches the real provider.

Runbook: [STAGING_RUNBOOK.md](STAGING_RUNBOOK.md).

### SEC-18 — CSRF exemption list stays a central list

**Status: WONTFIX, presented for confirmation.**

`middleware/csrf_protection.py` holds ~30 exempt endpoint names in a central,
hand-edited list. Two production outages came from drift in it. The audit
suggested deriving exemptions from a route decorator instead.

Both outages were **drift, not the shape of the list** — three names that no
longer resolved (2026-07-21 login outage), and a new funnel route shipped
without an entry (2026-08-01). Neither is possible now:
`test_csrf_protection.py` imports the real app in a subprocess and fails on any
name resolving to nothing, and asserts the funnel and session-authenticated sets
in both directions.

On the merits a decorator is worse here. CSRF exemption is policy you want to
read in one place; the current list is thirty lines with a written reason per
cluster. Spread across thirty route files, "which endpoints skip CSRF" stops
having an answer anyone can read. Rewriting CSRF plumbing is also the wrong
thing to do without a browser: the failure mode is "a real user cannot log in",
which no unit test in this suite would have caught in either outage.

**Reopen if:** the list outgrows a screen, or per-route metadata appears for
some other purpose that this could ride on.

### OPS-05 — `main` keeps direct-push with no branch protection

**Status: WONTFIX, presented for confirmation.**

There is no branch protection rule on `main`, no required review, and nothing
preventing a force-push or a branch deletion.

Branch protection protects a branch from people who can push to it, and here
that is one person plus their agents. What it would add is a PR round-trip on
every change; the control it is usually wanted for — untested code cannot reach
production — is already enforced further down. Render auto-deploy is OFF for
both prod services, so the only thing that deploys prod is `release.yml`'s
`deploy` job, which needs backend, web and integration green.

**What is genuinely given up, and was accepted:** nothing stops a force-push or
a branch deletion, and there is no second pair of eyes before code is on `main`.
Phase 5 narrowed the first half: `guard_bash.py` now stops a force-push and a
push to `main` for confirmation. That is an agent-side gate, not a server-side
one — it protects against accident, not against intent.

**Reopen if:** the committer count ever rises above one.

### BUG-1 — eight ReferenceErrors in the web app

**Status: FIXED 2026-09-10** on branch `fix/web-reference-errors`, commit
`6b07e27f`. 43 errors across ten files; `npm run lint` errors 292 → 239, with
`ERROR_BASELINE` lowered in the same commit.

**And the severity in this entry was wrong.** It said "one of which throws on
every caller". `useScrollAnimation` has no callers. Resolving every relative
import in `web/src` by path shows that **seven of the ten files are imported by
nothing at all**: `animations.js`, `PhilosophyCard.jsx`, `ServiceInquiries.jsx`,
`ConversionPanel.jsx`, `DiplomaHeader.jsx`, `DiplomaStats.jsx` and
`SkillsBreakdown.jsx`. Not one of them is reachable from a route.

So **no user has ever hit any of these**. The three reachable files carried the
mild half of the list:

| File | Reached from | What it actually did |
|---|---|---|
| `SchoolPage.jsx` | the `/school` route | 9 duplicate `module` keys, each repeating its own value — nothing lost |
| `SkillsRadarChart.jsx` | `CompactSidebar`, `SkillsGrowth`, `ObserverWelcomePage` | `color: 'text-primary'` **in quotes** — no throw, an invalid CSS colour the browser drops |
| `AssignedWork.jsx` | `TaskCenterPage` | a sparse array used deliberately as a tuple; `[, 'items'][1]` is `'items'` |

That is worth keeping straight for two reasons. A future audit reading "eight
ReferenceErrors in the web app" would rank this above things that are actually
biting users. And it says something about the seven: a component that has been
broken since it was written, in a way that would throw on first render, is a
component nobody has ever rendered. **The follow-up worth doing is deleting
them, not celebrating the fix** — `PhilosophyCard.jsx` even carries its own
unused `PhilosophySection`, and `ConversionPanel.jsx` was neutered by the Phase
3 tier refactor and left in the tree.

Verified after the fix: `npm run build` clean; web suite 347 files / 3,194 tests
green; the app booting in a real browser with zero reference-type console errors
on every route tried. The two reachable components that have tests
(`SchoolPage`, `SkillsRadarChart`) render green in 8 test files between them;
`AssignedWork` has no test, and its change is an identity — both forms evaluate
to `'items'`.

The original entry follows.

Found by ESLint's first run (Phase 3), reported rather than fixed. Each is an
identifier read at runtime and never bound.

| File | Undefined | Effect |
|---|---|---|
| `web/src/utils/animations.js` | `React` (10 sites) | **No React import at all.** `useScrollAnimation` calls `React.useState`; every caller throws |
| `web/src/components/ui/PhilosophyCard.jsx` | `Heart`, `TrendingUp`, `Clock` | Icons referenced with no import |
| `web/src/components/admin/ServiceInquiries.jsx` | `Clock`, `Mail`, `CheckCircle` | Same |
| `web/src/components/demo/ConversionPanel.jsx` | `formatPrice` (3 sites) | Helper never imported or defined |
| `web/src/components/diploma/DiplomaHeader.jsx` | `text`, `primary` (3 pairs) | Destructured names not in scope |
| `web/src/components/diploma/DiplomaStats.jsx` | `text`, `primary` | Same |
| `web/src/components/diploma/SkillsBreakdown.jsx` | `text`, `primary`, `pillarInfo` | Same |
| `web/src/pages/SchoolPage.jsx` | — | **9 duplicate object keys `module`**; all but the last silently discarded |

Two lower-severity: a sparse array from a stray comma in
`web/src/components/sis/tasks/AssignedWork.jsx:194`, and
`window.location.href` assigned to itself in
`web/src/components/FixQuestCompletion.jsx:26` (may be a deliberate reload idiom).

To see them: `cd web && npx eslint src --rule '{"no-undef":"error"}' --format stylish | grep "is not defined"`.

### BUG-2 — 33 app-layer queries against dropped tables

Found in Phase 5. Eleven tables that are absent from the production catalog
(verified against `information_schema` on 2026-09-10) are still queried by app
code. Each call is either a 500 waiting for its route to be reached, or dead
code on a route nobody reaches — which of the two is a per-site question.

| Table | App-layer calls | Where |
|---|---|---|
| `parent_connection_requests` | 8 | `repositories/parent_repository.py` |
| `observer_requests` | 5 | `routes/observer_requests.py` |
| `promo_codes` | 4 | `routes/auth/registration.py`, `routes/auth/google_oauth.py` |
| `quest_tasks` | 3 | `routes/student_ai_assistance.py`, `services/credit_mapping_service.py` |
| `task_merges` | 3 | `routes/credit_dashboard/{merge,items}.py` |
| `ai_generation_metrics` | 3 | `services/ai_quest_review_service.py` |
| `friendships` | 2 | `repositories/user_repository.py` |
| `user_quest_deadlines` | 2 | `routes/parent/{quests_view,evidence_view}.py` |
| `task_merge_sources`, `ai_prompt_versions`, `quest_template_task_flags` | 1 each | — |

Nine more in `backend/scripts/`. Ratcheted by
`test_dropped_tables_are_not_queried.py`, which stops the number growing and
prints the list.

Worth doing as its own bugfix pass: for each site, decide whether the feature is
dead (delete the route) or the table was renamed (repoint it). The observer and
parent-connection clusters look like whole features that were removed at the
database and left in the code.

### BUG-3 — RLS findings from the integration suite

Found in Phase 4 by executing the RLS suite rather than reading the schema.
Asserted in tests, not fixed.

1. **No `users` row can be updated through the Data API**, including a user
   editing their own. `generate_slug_trigger` fires BEFORE INSERT OR UPDATE and
   is not `SECURITY DEFINER`. Not an incident — every application write to
   `users` goes through Flask on the service-role client — but it means RLS on
   that table is not what it appears to be. Three candidate fixes exist.
2. **The completions policy has no organization scope.**
3. **`user_skill_xp` is RLS-enabled with zero policies.**
4. **`diplomas` has INSERT and UPDATE policies and no SELECT policy at all.**

### BUG-4 — `quests.quest_type` defaults to a value its own CHECK rejects

Found by Phase 2's seed script inserting a quest without naming the column, and
recorded only in [SCHEMA_BUGS.md](SCHEMA_BUGS.md) until this audit. Re-verified
against production 2026-09-10:

```
column_default : 'custom'::quest_source
check_quest_type : CHECK (quest_type = ANY (ARRAY['optio','course','class']))
```

The default is a value of the wrong enum *and* outside the allowed set, so any
`INSERT INTO public.quests` that omits `quest_type` fails the constraint. Every
live write names the column, which is why nothing is broken today — the cost is
paid by the next person who writes an insert without one, and by the seed
script, which is where it surfaced.

Fixing it is a migration (rule 7: Phase 2's territory), and the decision inside
it is which of the three values the default should be.

### BUG-5 — `SubjectDistributionEditor` writes keys outside the enum

`web/src/.../SubjectDistributionEditor.jsx` uses the subject keys `english`,
`arts`, `physical_education` and `other`. None is in the `school_subject` enum.
It is live — TeacherVerificationPage → VerificationModal — so whatever
distribution a teacher saves there is keyed on values nothing else in the system
recognises.

Found in Phase 2 (shared) while removing the transcript vocabulary copies, and
never investigated, because it is a data-shape question rather than a
duplication one. Wants someone to read what consumes the distribution before
deciding whether to remap the keys or the reader.

### ORPH-1 — sixteen tables no application code reads

**Status: NEEDS-USER.** The original phase plan listed "deciding what happens to
the 16 orphan Supabase tables that still hold live rows" as the user's call. No
phase picked it up and no document in this repository named the tables, so the
list was recomputed on 2026-09-10: 242 tables in `public`, cross-referenced
against `backend/` (excluding tests and scripts), `web/src`, `mobile/` and
`shared/`.

Sixteen are referenced by no application code. Fourteen hold rows:

| Rows | Table | Likely story |
|---|---|---|
| 718 | `portfolio_visibility_reset_20260801` | The C2 incident's evidence table. Per-student minor-status and consent flags |
| 87 | `sis_schedule_submissions` | — |
| 84 | `class_discussion_posts` | The discussion board the student chat replaced on 2026-08-31 |
| 15 | `email_templates` | — |
| 13 | `promo_interest` | — |
| 12 | `consultation_requests` | — |
| 4 | `automation_sequences` | — |
| 4 | `tutor_tier_limits` | — |
| 2 | `portfolio_visibility_reset_20260802` | The second reset's evidence table |
| 2 | `security_warnings_documentation` | — |
| 1 each | `ai_seeds`, `buddies`, `docs_search_misses`, `lms_sessions` | — |

Two are empty: `curriculum_settings`, `tutorial_verification_log`.

Each wants one of three answers: export and drop, keep deliberately (the two
`portfolio_visibility_reset_*` tables are incident evidence and are probably in
that class), or repoint code that should have been reading it.

**One caveat on the method.** "Unreferenced" here means no string match in
application code. A table read only by a SQL function, a view or a dashboard
query would look the same. Check before dropping anything.

### CI-07 — the OTA publishes when the deploy does not

Found on 2026-09-10 by watching it happen twice in one evening.

In `release.yml` the two shipping jobs have different prerequisites:

| Job | `needs` |
|---|---|
| `Deploy prod (web + backend)` | `[backend, web, integration]` |
| `Publish production OTA` | `[backend, web, mobile]` |

The OTA does not wait for `integration`, and neither job waits for the other. So
a run where the integration suite fails **skips the backend and web deploy and
publishes the mobile bundle anyway**. That is what happened on runs
`34546961454` and `34548012063`: the mobile app ran new JavaScript against an
API roughly 17 minutes older than it, until the next green run caught the
backend up.

Nothing came of it this time — Sentry recorded no new issue on either project,
and it was one in the morning. The exposure is real regardless: the new bundle
called routes the deployed backend did not have yet, and a 404 from a route that
exists on `main` is among the harder things to diagnose from a mobile crash
report.

It is the same shape as the cron service auto-deploying ahead of the CI-gated
backend, and the fix is the same one line: give the OTA job the `integration`
dependency the deploy already has, or make it `needs: [deploy]` outright so the
API is never behind the client. The second is stricter and probably right —
there is no version of "the app is updated but the server is not" anybody wants.

**Not changed here**, because it is a release-pipeline change and this session
was already pushing to `main` repeatedly; it wants its own commit and a green
run that proves the ordering, not a rider on a deploy.

### GAP-1 — the carried-forward gaps

Recorded because they were noted inside closed items and would otherwise
evaporate.

- **SEC-17: an upper bound is not a lockfile.** Reproducible-to-the-hash needs
  `pip-compile` against Python 3.11; the dev machine runs 3.13, so a lock
  generated locally would pin resolutions the deploy cannot use. It wants doing
  in CI.
- **SEC-05: the PII scrubber does not reach `exc_info`.** A formatted traceback
  goes to Sentry unmasked, and Supabase auth errors quote the email that failed.
- **SEC-12: the OAuth provider is locked, not finished.** A consent screen and a
  scoped, non-session token type are both absent. The trap the flag exists for:
  the obvious response to a 500 here is to apply the missing migration, and that
  single step arms it.
- **QF-06: the 4GB build heap is unexplained.** Not obviously about the PDF
  libraries. Wants a measurement pass of its own.
- **The repo root `package.json` declares three unused dependencies** and a
  `playwright test` script with no config. Nothing audits it in CI — see NEEDS
  TANNER item 8.
- **`npm run lint:fix` would clear ~205 unused-import errors** across ~200 files.
  Not run, because the brief was to ratchet rather than to fix. See NEEDS TANNER
  item 7.
- **AUDIT.md M1–M6 and L3–L5 were never triaged.** Among them: `M1` a
  possibly-inverted guard letting `POST /api/tasks/<id>/finalize` grant diploma
  credit repeatedly, `M2` no authorization on the caller-supplied upload context
  in `/api/uploads/finalize`, `M3` inert device-fingerprint token binding, `M5` a
  TOCTOU on diploma credit approval. **These are unverified claims from
  2026-08-01, not confirmed live bugs** — several neighbouring findings turned
  out narrower than written once checked. They want a triage pass.
- ~~**AUDIT.md H1 — student evidence media in public storage buckets.**~~
  **Checked 2026-09-10 and moved to CLOSED_FINDINGS §2**, with the caveat that
  the bucket flag is what was verified, not the per-object policies.
- **`docs/archive/legacy-migrations/` was deleted** with 89 legacy `.sql` files,
  several of which are the only written record of a schema decision. Recoverable
  with `git log --diff-filter=D -- 'docs/archive/legacy-migrations/*'`. See
  NEEDS TANNER item 10.

### GAP-2 — the handoff leftovers nothing else tracks

**Status: NEEDS-USER.** Found by the post-phase audit: these were written in a
`PHASE_N_HANDOFF.md` and never carried into this register, which is the exact
failure mode the header warns about. None is urgent; all are decisions.

1. **The 25 stale documents in [STALE_DOCS.md](STALE_DOCS.md) §2 are all still
   present.** Phase 0 deliberately listed rather than deleted them, and the
   decision was never made. Two want reading rather than deciding:
   `EVIDENCE_ATTACH_IOS_2026-07-30.md` still says *"Status: not fixed.
   Instrumented so the next report identifies the cause"* — two reports from one
   student in July 2026, and if nobody read the instrumentation that is an open
   bug, not a stale doc; and `SIS_ARCHITECTURE_DISCOVERY.md` holds the only
   written record of who processes SIS payments, cited from
   `sis_billing_service.py`. (`ICREATE_ORIENTATION_FOLLOWUP.md` can come off the
   list — the helper it worried about shipped on 2026-08-18, recorded directly
   above the stale line.)
2. **Three env docs are wrong or incomplete.** `docs/ENVIRONMENT_VARIABLES.md:32`
   says `FLASK_SECRET_KEY` is the JWT signing key, which SEC-14 made false, and
   the file never mentions `JWT_SECRET_KEY`. None of the three documents
   `ORG_SECRETS_ENCRYPTION_KEY`, `PLATFORM_STAFF_EMAILS` or
   `OAUTH_PROVIDER_ENABLED`, all live `Config` keys. CLAUDE.md designates
   `backend/docs/ENV_KEYS_REFERENCE.md`, so that is where they belong.
3. **`mobile/app/(lti)/` and `mobile/src/components/lti/`** (10 files) are
   unreachable from any live route since the LTI cutover was cancelled. They
   typecheck and their tests pass, so keeping them is defensible; the cost is
   that the next reader believes they serve Canvas teachers. **The web app has
   the same problem and worse** — see BUG-1 for seven web components that no
   route reaches, several of which could never have rendered at all. A deletion
   pass over both is one decision, not two.
4. **`mobile/MOBILE_LAUNCH_READINESS.md`** is a 61-row parity comparison from
   March 2026, never re-verified. Either stale-list it or re-run it.
5. **Renaming the three Render services** that still say v1/v2 or "frontend" is
   optional and carries a trap: the dev `.onrender.com` hostnames are hard-coded
   in `token_delivery.py` and `app_config.py`, so a slug change breaks dev login.
   Full recipe in PHASE_1_HANDOFF §3.
6. **`20260824_admin_platform_metrics_daily.sql` still carries an 8-digit
   stamp.** The migration is live, recorded as `20260824233745`. Renaming the
   file makes the directory honest but reads as a new file to Perch's staging,
   so it is only safe pushed straight to `main`.
7. **Seven display fallbacks still render `'Arts & Creativity'`** — a pillar name
   the product retired in 2025 — when a task has no pillar
   (`routes/quest/completion.py` ×4, `services/portfolio_service.py` ×3). These
   are response values, not writes.
8. **A third subject vocabulary** lives in
   `prompts/components.SCHOOL_SUBJECT_DISPLAY_NAMES`: picker names for most
   subjects, transcript names for `pe` and `cte`. Possibly deliberate — the long
   form may read better to a model — but nothing says so.
9. **The `production` GitHub environment has no required reviewers**, by the
   user's choice during Phase 2. Recorded here so it reads as decided rather
   than forgotten: the typed `APPLY TO PRODUCTION` string is the only gate on a
   migration apply.

---

## 2. What closed during phases 0 through 5

Each moved into [CLOSED_FINDINGS.md](CLOSED_FINDINGS.md) with a guard named, or
is listed there as unguarded with the reason. Summarised here so the register
shows the whole arc.

| Phase | Closed | Guard |
|---|---|---|
| 0 | The 3,964-line plan replaced by CLOSED/OPEN; 45 stale docs identified | `TestDocsDoNotRotBack` |
| 1 | `frontend/` → `web/`, `frontend-v2/` → `mobile/`; the v1/v2 naming | Render dashboards updated 2026-09-09; build commands match |
| 2 | OPS-03 migration history reconciled; `db push` ran end to end | `migrate-prod.yml` `max_pending`; [MIGRATION_RECONCILIATION.md](MIGRATION_RECONCILIATION.md) |
| 2 | OPS-01 (dev half) staging project built and dev repointed | Env vars on the three dev services |
| 2 (shared) | The mis-keyed `user_skill_xp` rows; the transcript vocabulary's eight copies | CHECK constraint `20260909205019`; `@shared/credits` conformance tests |
| 3 | CI-03 eslint stood up; TypeScript at the API boundary; import cycles; react-query; npm audit at the root of both apps; OPS-09 line endings | `eslintRatchet`, `apiBoundaryIsTypeScript`, `importCycles`, `lintRules`, `audit-gate.mjs`, `test_line_endings_stay_lf` |
| 3 | The seven "closed but unguarded" findings that could be guarded | `test_closed_findings_stay_closed.py` (19 tests) |
| 4 | RLS exercised against a real database; five untested high-churn files; coverage floors raised to measured | `tests/integration/test_rls_org_isolation.py`; `ci.yml`/`release.yml`; `mobile/jest.config.js` |
| 5 | Rules 3, 5, 6, 7, 8, 9, 11, 12, the CSRF body rule, the dropped-table list and the `is_org_admin` rule left prose and became hooks or tests | [RATCHETS.md](RATCHETS.md) §1, §2, §4 |
| 5 | Sentry MCP reachable — the auth scheme was `Sentry-Bearer`, not `Bearer` | `.mcp.json`; [docs/MCP_SETUP.md](../MCP_SETUP.md). **Incomplete** — see NEEDS TANNER 11 |
| audit | The FERPA public notice, which had never rendered on either public route | `backend/tests/test_public_consent_notice.py` |
| audit | AUDIT.md H1 — the evidence buckets are private | Bucket flags read from production; see CLOSED_FINDINGS §2 |
| audit | The backend coverage floor, 41 against a real 58 | `coverage-floor: 57` in `ci.yml` and `release.yml` |

---

## NEEDS TANNER

Numbered steps a person can follow without knowing the codebase. Nothing below
can be done from inside the repository. Items completed in earlier phases have
been removed; what remains is everything still outstanding as of 2026-09-10.

The numbering is stable — a closed item keeps its number and says what closed
it, so a reply that says "doing 4 and 6" still means the same thing next week.

### 1. ~~Confirm two published secrets are dead~~ — DONE 2026-09-10

**Both are dead.** Read live from the Render API rather than inferred from a
hash: neither backend's `FLASK_SECRET_KEY` begins with the published prefix
(`46e9163d` on prod, `3609553095` on dev). The values were compared in a script
that printed only the boolean, so the current keys did not pass through a
transcript.

The original instructions follow, because the last clause still stands.

`docs/SESSION_PERSISTENCE.md` (deleted, but **still in git history**) contained
two literal 64-hex secrets with instructions to set them as `FLASK_SECRET_KEY`:

- dev backend `srv-d9sjl22fngtc73ffenl0` → `3609553095e956d8…`
- prod backend `srv-d9sjl1f10e5c73a14610` → `46e9163dbe647c89…`

1. Open the Render dashboard for the **prod** backend → Environment.
2. If `FLASK_SECRET_KEY` starts with `46e9163d`, generate a new one
   (`openssl rand -hex 32`) and replace it.
3. Repeat for the **dev** backend, checking for `3609553095`.
4. **Still true regardless of rotation:** deleting the file does not remove the
   values from git history. If either was ever live, it is disclosed.
5. `FLASK_SECRET_KEY` is **not** `JWT_SECRET_KEY`. Do not touch the latter here.

### 2. Do not remove `FLASK_SECRET_KEY_OLD` before 2027-03-02

1. Leave it set on the prod backend until that date.
2. Why 180 days and not 31: LTI SpeedGrader evidence tokens run 180 days, are
   stateless (nothing to re-issue, no record of who holds one), and prod LTI is
   in daily use. Dropping the previous key at day 31 would kill roughly five
   months of live Canvas gradebook links with nothing to retry.
3. Cost of keeping it: it is verify-only. No code signs with it.

### 3. ~~Confirm the org-secrets encryption key reaches the app~~ — DONE 2026-09-10

**It reaches the app.** The query below, run against production:

| Name | State | Count |
|---|---|---|
| `stripe_secret_key` | encrypted | 2 |
| `calendar_feed_token_family` | encrypted | 2 |
| `calendar_feed_token` | encrypted | 1 |
| `calendar_feed_token` | PLAINTEXT | 2 |

Five of seven rows are ciphertext, which can only have been written by a process
holding the key — so the env var is live and the lazy re-encryption is working.
**Both live Stripe secret keys are encrypted**, which was the point of SEC-16.
The two remaining plaintext rows are calendar feed tokens that have not been
read since the key was set; they will convert on their next read.

**One live rule survives this:** do not remove `ORG_SECRETS_ENCRYPTION_KEY`. Five
rows are now unreadable without it, and the failure is closed — a read returns
`None`, which the callers surface as "card payment is not set up for this
school".

Dev has no key set. That is correct and deliberate: dev reads staging, whose
secrets are synthetic.

The original instructions follow.

1. Run against production:
   ```sql
   select name,
          case when value like 'enc:v1:%' then 'encrypted' else 'PLAINTEXT' end as state,
          count(*)
   from organization_secrets group by 1,2;
   ```
2. All 7 rows still `PLAINTEXT` means the key is not reaching the app. Redeploy
   the backend and re-check.
3. Do **not** remove the key once rows are encrypted — that makes them
   unreadable, fail-closed.

### 4. Two Render dashboard edits (OPS-02) — both still outstanding

Re-checked 2026-09-10: the build commands are unchanged on both backends, and
`curl -sI https://www.optioeducation.com` still returns only
`x-content-type-options`. `app.optioeducation.com` returns the full suite
including `strict-transport-security: max-age=31536000; includeSubDomains;
preload`, so the contrast is exactly as described below.

1. **ffmpeg.** Both backends' live build command is
   `pip install -r requirements.txt`; `render.yaml` claimed an apt-get step.
   Nothing crashes — `services/video_processing_service.py` probes at startup
   and degrades — so server-side video probing and thumbnail generation are
   simply **off** in production, and have been silently. Fix: edit the build
   command on both backend services to install ffmpeg first.
2. **Security headers on the apex.** `app.optioeducation.com` returns the full
   suite. `www.optioeducation.com` is served by `optio-marketing` and returns
   only `x-content-type-options`, so the apex makes no HSTS claim — which is
   exactly what an HSTS preload submission is judged on. Fix: add the header
   suite to the `optio-marketing` service.

### 5. Two leftovers from deleting the advisor daily summary — mostly DONE

Checked 2026-09-10:

1. **The Sentry monitor exists but is `disabled`**, so it will not alert on a
   missed check-in. Nothing is broken by leaving it; deleting it is tidying.
   Sentry → Crons → `advisor-daily-summary` (project `optio-backend`).
2. ~~`ADVISOR_SUMMARY_EMAIL_ALLOWLIST` on the prod backend~~ — **gone already.**
   Not present in the prod backend's 53 environment variables.
3. Informational: the Render cron *service* is still named
   `daily-advisor-summary`. It runs `cron_dispatch.py` and is unaffected.

### 6. Walk the acting-as loop once in a browser

The code is done and 11 unit tests cover every transition individually. Nothing
proves the whole loop, and that is the shape of bug this code produces.

1. Sign in as a parent with a dependent.
2. Enter the child's account ("act as").
3. **Reload the page.** You should still be the child.
4. Press exit. You should be the parent again.
5. Sign out, then back in. You should be the parent, not the child.
6. The failure to watch for: a cookie that outlives the session that set it
   leaves a parent inside their child's account with the exit already pressed.

### 7. ~~Get the real backend coverage number, then ratchet it~~ — DONE 2026-09-10

**58%.** Read from the `Backend Tests` job of release run `34540674305` (the
green run on `main`, 2026-09-10): `TOTAL 136201 57265 58%`. The floor was 41, so
17 points of real coverage were unprotected.

`coverage-floor` is now **57** in both `ci.yml` and `release.yml`. One point of
slack, per the rule in [RATCHETS.md](RATCHETS.md) — enough to absorb a normal
commit, not enough to hide a regression.

It never needed a person: `gh run view <id> --log` reaches the same line the
web UI shows. The item sat here since Phase 4 because two sessions each recorded
that it could not be measured *locally*, which was true and not the same thing.

### 8. Two small decisions

1. **`npm run lint:fix`** clears ~205 unused-import errors across ~200 files.
   If you want it run, say so; `ERROR_BASELINE` in `eslintRatchet.test.js` drops
   to whatever `npm run lint` then reports, in its own commit. Still 292.
2. **Audit the repo-root `package.json` in CI?** It had three high advisories,
   including one where jws improperly verifies HMAC signatures. They are fixed,
   but nothing stops them coming back. The cost is a second `npm ci` on every
   web CI run for a package that ships nothing. Its three declared dependencies
   are still imported by nothing; `playwright.config.js` does now exist at the
   root, so the `test` script is no longer pointing at a missing config.
3. ~~**Should the FERPA public notice render on `/portfolio/:slug`?**~~
   **Answered and shipped**, commit `10f2617e`: `isPublicRoute` is now
   `Boolean(slug) || pathname.startsWith('/public/')`, and the backend emits the
   `public_consent_info` payload the banner reads — which was the larger half of
   the bug, since the key had never existed in `backend/` at all and the banner
   was dead on *both* routes. `test_public_consent_notice.py` covers it.

### 9. Confirm or reverse two WONTFIX decisions

Both are presented, not re-argued. Reply keep or reverse.

1. **SEC-18** — the CSRF exemption list stays central rather than becoming a
   per-route decorator.
2. **OPS-05** — `main` keeps direct-push with no branch protection.

### 10. Decide about the deleted legacy migrations

Deleting `docs/archive/` took 89 legacy `.sql` files with it. Several are the
only written record of a schema decision, and one
(`20251226_create_oauth2_infrastructure.sql`) is what SEC-12's code comment
points at when explaining why the OAuth tables do not exist.

1. If you want them back as files, say so and they are restored to a path of
   your choosing.
2. If not, no action. The code comments already say the files are in history
   rather than naming a path that no longer exists.

### 11. Make the Sentry MCP connection work — two steps, not one

Phase 5 added a working Sentry server to `.mcp.json`. **It still did not connect
in a session on 2026-09-10**, and the stale entry is only half the reason.

1. Run `claude mcp remove sentry-optio` (or delete the `sentry-optio` block
   from the `projects` section of `~/.claude.json`). It sends `Bearer` where the
   endpoint wants `Sentry-Bearer`, so it 401s at every session start next to
   the working one.
2. **Run `launchctl setenv SENTRY_AUTH_TOKEN "$SENTRY_AUTH_TOKEN"` from a real
   terminal.** This is the step nobody wrote down. `~/.zshrc` exports the token
   to shells; a VS Code launched from the Dock or Finder does not read
   `~/.zshrc`, so `${SENTRY_AUTH_TOKEN}` in `.mcp.json` resolves to nothing and
   the server fails for a second, unrelated reason. This is the identical fault
   that broke the Supabase MCP for weeks — see NEEDS TANNER 1 in
   [PHASE_2_HANDOFF.md](PHASE_2_HANDOFF.md), and note that
   `launchctl getenv SUPABASE_PAT` returns a value today while
   `launchctl getenv SENTRY_AUTH_TOKEN` returns nothing.
3. Fully quit VS Code (`Cmd-Q`) and reopen it. `launchctl setenv` does not
   survive a reboot; starting VS Code with `code .` from a terminal is the
   alternative that needs no setup.
4. Check that `sentry` connects. The auth scheme is `Sentry-Bearer`; that one
   word was what was wrong for weeks, and the launcher environment is what was
   wrong after it was fixed.

Until this is done, `debug-production` cannot reach Sentry through MCP. The REST
API fallback still works — the recipe is in `docs/MCP_SETUP.md`, and note that
the REST API takes plain `Bearer`, which is exactly why the difference went
unnoticed.
