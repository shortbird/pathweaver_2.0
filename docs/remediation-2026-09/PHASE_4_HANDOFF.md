# Phase 4 handoff — tests for the five thin files, and RLS

**Branch:** `test/remediation-2026-09-phase4` (off `main` at `9181e070`)
**Date:** 2026-09-10
**Scope:** all three items of the brief. Two are complete and verified. The third
— the RLS suite — is written, committed and **has never been executed**, because
this machine has no Docker. That is the single most important sentence in this
document; see [The RLS tests have not been run](#the-rls-tests-have-not-been-run).

**No behaviour changed.** Every source file is byte-identical to what it was at
the start of the phase; the only non-test edits are three CI workflow files and
`mobile/jest.config.js`, all of them coverage floors. Bugs found on the way are
in [Bugs found, not fixed](#bugs-found-not-fixed).

---

## Test results

| Suite | Before | After |
|---|---|---|
| Backend (`cd backend && pytest`) | 5,677 passed, 160 skipped, **0 failed** | 5,693 passed, 191 skipped, **0 failed** |
| Web (`cd web && npx vitest run`) | 330 files, 2,927 passed, **0 failed** | 334 files, 3,058 passed, **0 failed** |
| Mobile (`cd mobile && npx jest`) | 113 suites, 943 passed, 3 skipped, **0 failed** | 113 suites, 943 passed, 3 skipped, **0 failed** |
| `web` `tsc --noEmit` | clean | clean |
| `backend` pyflakes undefined-name gate | clean | clean |

Nothing was skipped, xfailed or deleted to get there. Read the deltas carefully,
because two of them are not mine:

- **Web +131 tests.** 113 of those are this phase's. The other ~18, and 2 of the
  4 new files, arrived from another session working in this tree during the
  phase (SIS class materials, a Gryffin page test).
- **Backend +16 passed / +31 skipped.** The 31 skips are this phase's RLS file,
  which is `requires_db` and skips without a local Supabase. The +16 passes are
  another session's.
- **Mobile unchanged.** This phase added no mobile tests.

### Coverage

| Suite | Metric | Before | After |
|---|---|---|---|
| Web | statements | 61.03% | **61.69%** |
| Web | branches | 52.94% | 53.41% |
| Web | functions | 54.93% | 55.47% |
| Web | lines | 62.96% | 63.65% |
| Mobile | stmt / br / line / fn | — | 37.94 / 30.67 / 39.35 / 30.01 |

Web was re-measured at **61.59%** with the other session's two in-flight test
files excluded, so the new floor holds on this branch's work alone.

---

## What changed

| SHA | Commit |
|---|---|
| `b30eb2a4` | Test the QuestDetail paths that have actually broken |
| `57b6b023` | Pin who owns a diploma, and that both public routes render one |
| `4131dfc9` | Test the family dashboard's two lists, its gate, and its deep link |
| `e297397f` | Test the sidebar's badge, its two exits, and its query-driven items |
| `e4b0d86c` | Test the student dashboard's identity, its split, and its Next Up rule |
| `9bf0da5c` | Exercise RLS against the database instead of around it |
| `a49c0026` | Ratchet the web and mobile coverage floors up to what we measure |
| `35000eff` | Test anonymous WRITE with an update, not an insert |

---

## Part 1 — the five files

The brief said to read each file's git log and cover the paths that have actually
broken, rather than to chase a coverage number. That turned out to matter: in all
five files the repair history clusters tightly, and the clusters were mostly
untested.

**Method.** For each test written against a historical bug, the fix was reverted
in the source, the test was run, and the revert was undone. A test that stays
green when its own fix is removed is a test that would not have caught the bug,
and there is no way to know which kind you have written without doing it. Every
mutation named below was confirmed to fail at least one test. Sources were
verified byte-identical afterwards with `git diff --quiet`.

### QuestDetail.jsx — 875 lines, 123 commits, 27.3% statements

Two clusters.

**Enrollment outcomes.** Six commits argue about which enrollment result should
launch the personalization wizard: "Course quest enrollment now skips
personalization wizard", then "Course quests without preset tasks now show
personalization wizard", then "Fix template tasks not loading on quest
enrollment", then "Fix duplicate template tasks on quest restart". Each fix was
invisible to the other branches, and both failure directions are silent — the
student either lands in a wizard they should not see, or enrolls into a quest
with no tasks. Now covered: all five outcome branches, the 409 restart offer,
the refusal message the backend supplies (a parent is told their school assigns
quests, rather than getting a button that appears to do nothing), and that a
click event never reaches the options payload, which `60368980` fixed once.

**Task removal.** `347e85b0` fixed the last-task case by having the backend
report `quest_now_empty` in the delete response instead of the page racing its
own refetch and reading an empty cache. Nothing kept it fixed, and the
optimistic update empties the cache on the way through, so a cache-reading
version passes a casual read of the diff. Both sides are now asserted.

Also: the "class" wording when ending a credit class, `INCOMPLETE_REQUIREMENTS`,
that the header's own confirmation is not asked twice, when the End button is
offered at all (LMS quests, mid-lesson returns), returning to a course lesson
including clearing the return key, and focus mode's Go Home — which exists
because the quest browser is hidden in kiosk mode and "Back to Quests" is a dead
end there.

Mutations confirmed caught: reverting `quest_now_empty` to the cache rule;
dropping `hasTemplateTasks` from the skip-wizard condition; dropping
`data.message` from the error message chain.

### DiplomaPage.jsx — 962 lines, 71 commits

**`isOwner`.** One boolean expression that decides the share bar, the FERPA
privacy toggle, the possessive in every sentence, and whose name the sidebar
carries. Four commits are about getting it right, one of which exists only to add
console logging to diagnose it. Wrong in the permissive direction, it offers a
stranger the privacy controls for a minor's portfolio. Six cases now pinned,
including acting-as.

**The two public routes.** `/portfolio/:slug` and `/public/diploma/:userId` are
the same page fed by the same payload and had two unpackers; the slug one set
only the student and the curated picks. Shared portfolios rendered with no
pillars, no credits and no evidence from February until `749f7ad6`. The fix was
one extractor, and nothing kept both routes on it. The same populated result is
now asserted for both, section by section.

Also: the share link is built for the acting-as child rather than the parent
(`ef73a3bd`); the sidebar gets the **student's** birthday, so a parent sees the
age view their child sees; consent is required before publishing and not before
un-publishing; and verified-vs-pending subject XP, including that a verified zero
stays zero rather than falling back through `??` to the unverified total.

Mutations confirmed caught: removing the `isPublicRoute` guard from `isOwner`;
reverting the slug route to its own unpacker.

### ParentDashboardPage.jsx — 522 lines, 98 commits

The largest untested thing was the overlap between the two responses. The
my-dependents RPC returns the **union** of true under-13 dependents and approved
`parent_student_links`, so every linked teenager comes back in both lists. The
page renders children and dependents as two tab lists, so the overlap has to be
stripped — and the second copy claims the teenager is a managed dependent, which
changes what the overview renders. One line of set arithmetic, no test, and
invisible in any screenshot of a one-child family.

Also: the selector's visibility rule, the Under 13 mark, `?settings=<tab>` (which
the account menu uses because a parent has no `/overview` of their own), who may
open the page at all (a dependent is redirected; an org admin or observer who is
also a parent gets in), acting as a child in both directions including that a
failed switch does not navigate anyway, and that adding a child refreshes the
auth user — `has_dependents` is what puts the Family link in the sidebar.

Mutations confirmed caught: removing the dedupe; removing the dependent redirect.

### Sidebar.jsx — 773 lines, 80 commits, 75.9% statements

`Sidebar.test.jsx` already covered which nav items each role gets, thoroughly.
Nothing covered the parts driven by something other than the role, so the new
file is `sidebarSignals.test.jsx` beside it.

The unread badge is the clearest case: the component has rendered `item.badge`
since it was written and nothing ever set one, so a message arrived, a
notification row was written, and the nav looked identical — reported by Gryffin
on 2026-08-27. It renders twice, once per sidebar width, which is the shape that
half-regresses. Then the two states where the person at the keyboard is not the
account on screen: acting-as and masquerade each need their exit reachable at
both widths (FU-05 is what a session outliving its exit costs), and the
masquerade exit routes by role because an org admin has no `/admin/users`.

Also the query-driven items (Courses and Classes appear in place rather than
being appended, so the menu does not reshuffle under the pointer) and the advisor
Teaching section, where a SIS org moves class work to the console but keeps the
verification queue.

Mutations confirmed caught: unsetting the badge; sending every masquerade exit to
`/admin/users`; dropping the advisor SIS carve-out.

### DashboardPage.jsx — 623 lines, 58 commits

Three pieces of logic under the sections, all three broken in production before.

**Who.** `effectiveUserId` and `displayName` each fall back from the acting-as
dependent to the logged-in user, and each was fixed in its own commit. The two
halves fail differently: the wrong id shows a parent their own quests believing
they are the child's; the wrong name greets the parent over the child's work.

**The split.** `active_quests` carries finished and unfinished work together — a
restarted quest has `is_active` true and a `completed_at` from last time — so the
page splits one array on two independent tests. Fixed twice. The 0-of-0 case is
covered: a quest picked up and not yet personalized is not a finished one.

**Next Up.** Two passes over one task per quest: one per pillar, then fill the
four slots from quests not yet used. The interesting cases are the ones a
screenshot never shows — a student with two maths quests and a civics one gets
the civics task, and a student whose quests are all one subject still gets a full
panel rather than a single suggestion.

Plus Saved for Later (a paused quest must not read as finished; Resume must
resume the row that was clicked), the five-minute new-account window, and
clearing `?sso_pending` so a bookmarked URL does not re-enter a finished
handshake.

Mutations confirmed caught: dropping either acting-as fallback; dropping the
status half of the completion test; dropping the pillar-variety pass.

---

## Part 2 — the RLS tests

`backend/tests/integration/test_rls_org_isolation.py`, 31 tests, plus two
fixtures in `backend/tests/conftest.py`.

### Why this was worth doing

There are **304** `CREATE POLICY` statements in `supabase/migrations/` and, before
this file, no test named for one. The 36 backend files that assert
cross-organization denial all do it at the Flask layer, against a route
decorator — and those decorators run on the **service-role client, which bypasses
RLS entirely**. Drop every policy in the schema tomorrow and all 36 still pass.

RLS answers for the paths Flask is not on: the anon key that ships to every
browser, and anything reaching the Data API directly. It is also the layer C1 and
C2 were about — a live Stripe secret and 718 rows of minors' consent flags, both
readable unauthenticated, neither caused by a route.

### How the fixture works, and the trap in it

`rls_client(user)` signs the user in through GoTrue on a **separate** anon client
and hands PostgREST that session token, which is what a browser session looks
like at the database layer. It must be a separate client: supabase-py stores the
session on whichever client performed the sign-in, so signing in on `db` would
silently demote the shared service-role client to `authenticated` for the rest of
the test. That is the same trap `supabase/config.toml` keeps
`enable_confirmations = true` to avoid on the registration path.

### Every denial is paired with a positive control

An empty result is what RLS returns when it denies you. It is also what PostgREST
returns when it rejects your token outright, when the table is empty, and when
the filter matched nothing. Four different worlds, one indistinguishable
assertion. So a test that asserts someone **cannot** read a row also asserts that
someone else **can** read that same row through the same fixture. Without the
pairing, a suite where authentication silently broke would be uniformly and
meaninglessly green — which, given that this file cannot be run here, is the
failure mode that mattered most to design against.

The first four tests exist only to prove the harness: service-role sees both
schools, a signed-in student sees exactly one row (accepted token **and** RLS
on), anon sees none, and anon cannot write.

### What is covered

Two partner schools, Northgate and Southvale, each with a student, parent,
advisor and org admin, plus a superadmin and a platform family.

| Table | The boundary asserted |
|---|---|
| `users` | Org admin scoped to their own school, for reads **and** writes. Student sees only themselves. Superadmin sees both. Parent sees the child they manage. |
| `announcements` | All four roles at a school, parametrised; a partner school's posts and a school-less platform user's view. |
| `user_quest_tasks` | Own only; own-school admin yes, partner-school admin no. |
| `quest_task_completions` | Own only for a student. **Any advisor sees everything — see the findings below.** |
| `user_quests` | Own only, no admin clause at all. |
| `learning_events` | Author only — not their school's admin, not an advisor. |
| `user_skill_xp` | Deny-all through the Data API. |
| `parent_student_links` | The two people named on the row, nobody else. |
| `quests` | Active quests anonymous-readable on purpose; retired ones not; org admin sees their own retired quests, not the partner school's; cross-org write blocked. |
| `organizations` | Active readable by anyone; deactivated visible only to its own admin and superadmin. |

### The RLS tests have not been run

**Read this before trusting any of the above.**

They are marked `requires_db`, so they run in `tests-integration.yml` against a
throwaway local Supabase stack and skip everywhere else. `pytest` collects all 31
and skips all 31 on this machine, which has no Docker and no `supabase` CLI.

I did not point them at staging. The brief allowed for it, but three things say
not to: `backend/tests/conftest.py::_assert_local` refuses any non-local host by
design (it fails closed, and inverting that guard would undo remediation work);
CLAUDE.md says never to point a test suite at a hosted Supabase, because it puts
a service-role key for a production clone in CI; and the fixtures **truncate
tables between tests**, which is not something to aim at a shared project. The
local stack is where the other 133 integration tests already run, and it is the
right target.

So: the file is committed, its logic is derived from the policy text in
`supabase/migrations/`, and every table, column and constraint it touches was
checked against the baseline SQL by hand. None of that is the same as having run
it. CLOSED_FINDINGS §1b is a list of artifacts that were committed, described as
working, and disagreed with only on first execution — `migrate-prod.yml`'s dead
pending count, a schema baseline that could not build a database. This file is in
that category until someone runs it. **NEEDS TANNER step 1.**

---

## Part 3 — the coverage floors

| Gate | Was | Now | Measured |
|---|---|---|---|
| Web (`ci.yml`, `release.yml`, `tests-web.yml` default) | 53 | **60** | 61.69% statements |
| Mobile statements (`jest.config.js`) | 31 | **36** | 37.94% |
| Mobile branches | 24 | **29** | 30.67% |
| Mobile lines | 32 | **38** | 39.35% |
| Mobile functions | 23 | **29** | 30.01% |
| Backend | 41 | **41 — unchanged** | see below |

Floors are `floor(measured) - 1`, which leaves about a point for flake. Both were
verified: the mobile suite was re-run with the new thresholds in place, and the
web gate's own `awk` was run over the captured coverage log (`61.69 → 61 ≥ 60`).

Two things found while in there, neither of them behaviour changes:

- **The web gate's number is not what it is called.** The step is named "line
  coverage" and the `awk` reads field 2 of v8's `All files` row, which is
  `% Stmts`. Lines measured 63.65% in the same run. Statements is the stricter of
  the two, so the gate is right and only its name is wrong — changing the column
  to match the label would be a real loosening. Said so in a comment instead.
- **The backend floor was deliberately not raised.** It measures 57% on this
  machine against a recorded CI measurement of 41.95%, and the gap is not
  explained: `backend/app_config.py` calls `load_dotenv` on `backend/.env`, which
  exists here with real credentials and does not exist in CI, so the local run is
  not the run CI does. Raising a gate to a number the gate's own environment has
  never produced is how every pull request turns red. **NEEDS TANNER step 2.**

---

## Bugs found, not fixed

> **Status, 2026-09-10.** Three of these four were fixed later the same day, on
> this branch, after the user asked for them. The entries below are left as
> written -- including the two that were understated, each now carrying its own
> correction -- because the record of what a phase found is worth more than a
> tidy one. What changed:
>
> | # | Finding | Now |
> |---|---|---|
> | 1 | Advisor completions have no org scope | **Still open.** The fix is an RLS policy change and the RLS suite has still never run, so it is sequenced behind that. |
> | 2 | `user_skill_xp` is RLS-on with zero policies | **Closed, no change.** Working as intended; deny-all is correct because every reader goes through the service-role client. Adding a policy would only widen access. Now documented in the catalog and asserted by a test. |
> | 3 | The FERPA notice never renders | **Fixed** in `10f2617e`. Bigger than written: the backend had never sent `public_consent_info` at all, so both halves needed fixing. 3 public portfolios affected. |
> | 4 | Dead `is_admin()` predicate | **Fixed** in `52136433`. Twelve policies, not one. Dead clauses deleted rather than repointed at `superadmin`, which would have been a grant of read access to private messages rather than a fix. |

Per rule 5, these are written down rather than changed. Ordered by how much they
would cost.

### 1. The completions policy has no organization scope

`admin_advisor_access_completions` on `quest_task_completions` is:

```sql
FOR ALL USING (private.is_superadmin((SELECT auth.uid()))
            OR private.is_advisor_user((SELECT auth.uid())))
```

(Corrected 2026-09-10 against production. This document first quoted the
`public.*` helpers, which is what the baseline file shows; `20260815060000`
later moved twelve policies onto `private.*` copies with identical bodies, and
this is one of them. The behaviour described is unchanged -- but read policies
off `pg_policies`, not off the baseline, because the baseline is not the last
word on any object a later migration touched.)

`is_advisor_user` resolves an effective role (`advisor`, `superadmin` or
`org_admin`) and never looks at an organization. So **a teacher at Southvale can
read — and, since it is `FOR ALL`, write — the evidence a Northgate student
submitted**, through the Data API. Completions carry `evidence_text`, which is
the student's actual work. Every comparable table scopes its staff clause by org;
`admin_full_access_user_quest_tasks`, two tables away, joins through to the task
owner's organization to do exactly that.

Mitigating, and the reason this is a finding rather than an incident: the product
reads completions through Flask on the service-role client, where
`@require_relationship_to` (SEC-10) does the scoping. This is the second layer,
and it is open.

The test `test_an_advisor_reads_completions_from_every_school` asserts the
current behaviour with a docstring saying what to do when it changes: if you
tighten the policy, that test fails, and it should be rewritten as an own-school
positive plus a partner-school denial, the way the `user_quest_tasks` test beside
it already is.

### 2. `user_skill_xp` is RLS-enabled with zero policies

Deny-all through the Data API — the exact shape FU-03 found on `bug_reports`,
where 356 rows read as an empty list with HTTP 200 and no error. Here it appears
to be deliberate (XP is written and read by Flask on the service-role client),
but nothing said so anywhere, so the next person to point a client at that table
gets an empty list and no explanation.
`test_the_xp_ledger_is_closed_to_the_data_api` now documents it and asserts all
three views of it. No change needed unless a Data API surface ever wants XP.

### 3. The FERPA public notice has never rendered anywhere

**Understated when first written. Corrected 2026-09-10.** The `isPublicRoute`
gap below is real, but it is the second of two reasons the banner is invisible,
and the smaller one. The first: `PublicNoticeBanner` is gated on
`diploma?.public_consent_info?.opted_in`, and **`public_consent_info` does not
exist anywhere in `backend/`** -- zero occurrences. `get_diploma_data()` returns
nine keys and that is not one of them, so the condition has been `undefined` on
every route since the component was written. `get_visibility_status()` computes
something similar for the owner view, under different key names, and never
reaches this payload.

So the banner is dead code on both public routes, and widening `isPublicRoute`
alone would change nothing. Making it work needs the backend to emit
`public_consent_info` (the data is there: `diplomas.public_consent_given`,
`public_consent_given_at` and `public_consent_given_by`) as well as the
frontend one-liner.

Scale, measured against production on 2026-09-10: 1,154 diplomas, of which **3
are public**. All three carry a consent date and two were consented by an
approver rather than the student. So this affects three live pages -- and those
three are precisely the ones where a disclosure notice is the point.

The original note follows.

### 3. The FERPA public notice never renders on `/portfolio/:slug`

`PublicNoticeBanner` is gated on `isPublicRoute`, which is
`window.location.pathname.startsWith('/public/')`. The slug route is
`/portfolio/:slug` — equally public, equally indexable, and the route the app
actually generates share links for — so a portfolio shared by slug carries no
public notice, while the same portfolio shared by user id does. I found this by
writing the test for the slug route and watching it time out.

I moved the test to `/public/diploma/:userId`, where the banner works, rather
than writing a test that blesses the current behaviour. The fix is one line
(widen `isPublicRoute` to cover `/portfolio/`), but it changes what a public page
displays, which is out of scope for a structural phase and is a product/legal
call, not mine. **NEEDS TANNER step 3.**

### 4. `superadmin_can_manage_organizations` matches nobody — and it is not alone

**Understated when first written. Corrected 2026-09-10, and fixed in
`52136433`.** The dead predicate is not one policy, it is **eleven**, plus this
one. `is_admin()` is called by policies on `account_deletion_log`, `diplomas`
(insert and update), `direct_messages`, `message_conversations`,
`parental_consent_log`, `student_access_logs`, `ai_generated_quests`,
`ai_generation_jobs`, `ai_seeds` and `site_settings`. Seven use it as a dead OR
arm; four as the sole clause, leaving those tables deny-all.

That mattered for the fix. Making the predicate live -- the obvious reading of
"fix the dead policy" -- would have granted platform staff RLS-level read of
private correspondence and COPPA consent records. The dead clauses were deleted
instead, and five tests now hold that decision in place. See the migration
header for the per-shape argument that no access changed.

The original note follows.

### 4. `superadmin_can_manage_organizations` matches nobody

```sql
USING (auth.uid() IN (SELECT id FROM users
                      WHERE role = 'admin' AND email = 'tannerbowman@gmail.com'))
```

`admin` is not a valid role in this system — CLAUDE.md lists it under "INVALID
roles (do NOT use)", and SEC-01 removed the last 11 references to it. No row can
satisfy both halves, so this policy is dead. It is harmless (`organizations_select`
and `is_superadmin` cover the real cases, and the tests confirm a superadmin can
read a deactivated org) and it also hardcodes a personal email in the schema,
which is what OPS-07 removed from the application code. Worth deleting in a
migration phase; not this one, since rule 7 puts `supabase/migrations/` off
limits here.

Two others in the same family: `is_admin()` and `is_current_user_admin()` both
test `role = 'admin'` and are therefore also permanently false. `diplomas`
grants INSERT and UPDATE via `is_admin()` and has no SELECT policy at all.
**Both functions are dropped in `52136433`** -- neither had any remaining
caller once the eleven policies were cleaned (no policy, no function body, no
view, no `rpc()` in either app, all checked against production).

---

## Follow-on work on this branch (2026-09-10)

Commits 10-12, after the phase brief was complete and the user asked for the
bugs to be fixed.

| SHA | Commit |
|---|---|
| `52136433` | Remove is_admin(), a predicate that has never returned true |
| `f4953d29` | Correct three things the Phase 4 handoff got wrong |
| `10f2617e` | Make the FERPA notice on a public portfolio actually render |

Test results after: backend **5,708 passed, 196 skipped, 0 failed**; web
**334 files, 3,061 passed, 0 failed**; pyflakes clean.

`supabase/migrations/20260910120000_remove_the_dead_admin_predicate.sql` is
**landed but NOT applied**. Rule 7 was waived for it explicitly. See NEEDS
TANNER step 4.

Three decisions worth carrying forward, because each was a fork where the
obvious move was the wrong one:

- **Dead code that guards something is not the same as dead code.** Repointing
  `is_admin()` at `superadmin` looks like fixing a typo and is actually a grant
  of RLS-level read over private correspondence and COPPA consent records. It
  was deleted instead, and five tests now fail if anyone makes that grant
  quietly.
- **Read policies off `pg_policies`, not off the baseline.** The baseline shows
  `public.*` helpers; `20260815060000` later moved twelve policies onto
  `private.*` copies. Both migrations are in the directory and replay in order,
  so there is no drift -- but reading only the baseline gets you the wrong
  answer about what is deployed, which is how this handoff shipped a wrong SQL
  snippet.
- **Two flags that look equivalent usually are not.** The FERPA notice is gated
  on publication AND consent, because production holds 5 consent records
  against 3 public portfolios: consent is a durable record, publication is a
  toggle, and a withdrawn portfolio is still readable by the family's connected
  viewers.

---

## What I could not do, and why

1. **Run the RLS tests.** No Docker, no `supabase` CLI on this machine, and
   staging is the wrong target for a suite whose fixtures truncate tables. See
   above. This is the one piece of the phase that is unverified.
2. **Raise the backend coverage floor.** The local number is measured in a
   different environment from CI's and I will not ratchet a gate on it.
3. **Fix anything in the findings list.** Rule 5.

## What I deliberately did not touch

- `supabase/migrations/` — rule 7, even though findings 1 and 4 live there.
- Any application source file. Verified: `git diff main..HEAD --stat` shows only
  test files, three workflow files and `mobile/jest.config.js`.
- Any of the other session's work in this tree. Several files were modified under
  me during the phase (`backend/routes/sis/class_materials.py`,
  `web/src/components/sis/SisSidebar.jsx`, `web/src/utils/queryKeys.js` and
  others, plus six new untracked files). None were staged. One mid-phase full web
  run reported 5 failures that no later run reproduced across seven clean runs
  including two under deliberate load — the timing lines up with those files being
  edited underneath the run, which is the likeliest explanation, but I could not
  reproduce it to confirm and the log was not kept.

---

## NEEDS TANNER

Numbered steps, no codebase knowledge assumed.

### 1. Run the RLS tests once, and tell me what happened

They have never executed. Either route works.

**The easy route — let CI do it.** Push this branch and open a pull request
against `main`. The `Integration Tests (reusable)` job boots a throwaway
Supabase stack and runs everything marked `requires_db`, including the 31 new
tests. Read that job's log. Then paste me either "31 passed" or the failures.

**The local route**, if you want them in front of you:

1. Install the tooling (one time, ~10 minutes):
   ```
   brew install colima docker supabase/tap/supabase
   colima start --cpu 4 --memory 8
   ```
2. From `~/pathweaver_2.0`:
   ```
   supabase start
   psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -v ON_ERROR_STOP=1 -f supabase/ci/grants.sql
   psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -v ON_ERROR_STOP=1 -f supabase/ci/test_helpers.sql
   eval "$(supabase status -o env | sed \
     -e 's/^API_URL=/export SUPABASE_URL=/' \
     -e 's/^SERVICE_ROLE_KEY=/export SUPABASE_SERVICE_ROLE_KEY=/' \
     -e 's/^ANON_KEY=/export SUPABASE_ANON_KEY=/')"
   ```
3. Run just the new file:
   ```
   cd backend && RUN_DB_INTEGRATION_TESTS=1 FLASK_ENV=testing \
     FLASK_SECRET_KEY=test-secret-key-for-ci-only \
     ../venv/bin/python -m pytest tests/integration/test_rls_org_isolation.py -v
   ```
4. When you are done: `supabase stop --no-backup`.

**What a failure means.** If the four tests at the top of the file (the ones
about the harness) fail, the fixture is wrong and nothing else in the file means
anything — send me those first. If a later test fails, either a policy differs
from what the migration text says, or a table has moved. Either is worth knowing;
neither is an emergency.

### 2. Get the real backend coverage number, then ratchet it

The backend floor is still 41 and is probably far too low, but I could not find
out from here.

1. Open the most recent `Backend Tests` job on GitHub Actions (any PR or any push
   to `main` will have one).
2. In the "Run tests with coverage" step, scroll to the `TOTAL` line at the
   bottom of the coverage table. Note the percentage.
3. Tell me that number and I will set the floor to one point under it in
   `.github/workflows/ci.yml` and `.github/workflows/release.yml` — both files,
   they must match.

Do **not** use the number from running pytest on your laptop. Your laptop loads
`backend/.env`; the CI runner does not, and the two disagree by about 15 points.

### 3. Decide whether a portfolio shared by slug needs the FERPA notice

Finding 3 above. `optioeducation.com/portfolio/emma-ruiz` and
`optioeducation.com/public/diploma/<uuid>` show the same student's page, and only
the second one carries the "this portfolio is public, with consent given on
<date>" banner. The slug URL is the prettier one and the one people share.

This is a one-line code change but it changes what a public page displays, so it
is your call, not mine. **Answer one question: should the banner appear on the
slug route too?** If yes, I will make the change and add the test that is
currently parked. If no, tell me why and I will write the reason into the code so
the next person does not re-open it.

### 4. Apply the is_admin() migration to production

`supabase/migrations/20260910120000_remove_the_dead_admin_predicate.sql` is
committed and has not been applied anywhere. It changes no access -- the
argument for that is in the file header, per policy shape -- but it is a schema
change and it is yours to run.

1. Do step 1 first. `supabase start` replays `supabase/migrations/`, so booting
   the local stack is also how this file gets its first execution. A syntax
   error fails the boot; you do not want to find that out against production.
2. Run `.github/workflows/migrate-prod.yml` in **`plan`** mode. Expect it to
   report exactly one pending migration. If it reports dozens, stop and read
   MIGRATION_RECONCILIATION.md -- the history drift is back.
3. Run it again in **`apply`** with the typed confirmation.
4. Sanity check afterwards, which should return no rows:
   ```sql
   SELECT tablename, policyname FROM pg_policies
   WHERE schemaname='public'
     AND (coalesce(qual,'')||' '||coalesce(with_check,'')) ~ '\mis_admin\(';
   ```

### 5. Nothing else

No credentials, dashboards or approvals were needed for the rest of the phase.
