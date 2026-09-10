# Phase 5 handoff — advisory prose replaced with mechanical enforcement

**Branch:** `tooling/remediation-2026-09-phase5` (off `main` at `ed055cac`)
**Date:** 2026-09-10
**Scope:** all six items of the brief, complete.

**No behaviour changed.** Every change is a hook, a test, a document or the
Sentry MCP entry. No application source file was edited. Bugs found on the way
are in [Bugs found, not fixed](#bugs-found-not-fixed) and in the register.

---

## Test results

| Suite | Before | After |
|---|---|---|
| Backend (`cd backend && pytest`) | 5,933 passed, 198 skipped, **0 failed** | 6,023 passed, 198 skipped, **0 failed** |
| Web (`cd web && npx vitest run`) | 343 files, 3,172 passed, **0 failed** | 347 files, 3,194 passed, **0 failed** |
| Mobile (`cd mobile && npx jest`) | 113 suites, 945 passed, 3 skipped, **0 failed** | unchanged |
| `web` `tsc --noEmit` | clean | clean |
| pyflakes undefined-name gate | clean | clean |
| `ruff check backend` | 4 errors, in two untracked files belonging to another session | unchanged — see [Not mine](#not-mine) |

Nothing was skipped, xfailed or deleted.

**Read the deltas carefully, because most of them are not mine.** This phase
added **57 backend tests** and **2 web tests**. The backend suite grew by 90 and
the web suite by 22; the difference is another session working in this tree
during the phase. Mine, by file:

| File | Tests |
|---|---|
| `backend/tests/unit/test_claude_hooks.py` | 46 |
| `backend/tests/unit/test_role_rules_are_enforced.py` | 4 |
| `backend/tests/unit/test_dropped_tables_are_not_queried.py` | 4 |
| `backend/tests/unit/test_config_access_ratchet.py` | 3 |
| `web/src/__tests__/csrfRequestBody.test.js` | 2 |

---

## What changed

| SHA | Commit |
|---|---|
| `08342fc0` | Reach Sentry from MCP: the header scheme was wrong, not the token |
| `301415da` | Make the rules refuse instead of advise: three repository hooks |
| `ea8e082d` | Ratchet the half of rule 9 that nothing was checking |
| `642ff3c0` | Fence the queries against tables production does not have |
| `9a18c3b0` | Enforce the two role rules CLAUDE.md could only ask for |
| `02ddee55` | Assert the CSRF body rule instead of describing it |
| `10874396` | Put every ratchet, guard and gate in one file |
| `bc2df918` | Fold the open findings into one ongoing register |
| `16983bac` | Cut CLAUDE.md from 656 lines to 210, rule by rule |
| `0014506f` | Four skills for the four things this repository does over and over |
| `4b40524e` | Complete the ratchet inventory against a second sweep |

---

## 1. The hooks

`.claude/settings.json` and `.claude/hooks/`, checked in, so every agent working
in this repository gets them. All three fail open: a hook that raises exits 1,
the work continues, and the failure is visible in the transcript.

### `guard_bash.py` — PreToolUse on Bash

Refuses, with no override:

- `git reset --hard`, `git checkout -- <path>`, `git checkout .`,
  `git restore <path>`, `git stash`, `git clean`
- `killall node`, `pkill node`
- `git add -A`, `git add .`, `git commit -a`
- an emoji in a commit message

Stops for confirmation, with an `OPTIO_HOOK_OVERRIDE=1` escape:

- `git push` to `main` (explicitly, or a bare push while `main` is checked out)
- any force-push

The override exists because a gate nobody can get past is a gate somebody
deletes. It leaves a mark in the transcript, which is the point — the same shape
as the `--yes` flag on the production repair scripts. The destructive-git family
has no override at all, because CLAUDE.md's rule 11 says off the table and the
2026-08-14 incident is why.

**Two false positives were found by the hook refusing its own commits**, and both
are now regression tests. A commit message that *describes* `git reset --hard`
is not a hard reset, so heredoc bodies and quoted `-m` arguments are stripped
before the command families are matched. The first version of that fix only
recognised a heredoc whose marker line ended at the newline, which is not how
anybody writes one — `<<'MSG' && git log ...` is.

### `fast_gate.py` — PostToolUse on Edit/Write/MultiEdit

| File type | What runs | Cost |
|---|---|---|
| `backend/**.py` | `ruff check` + pyflakes filtered to undefined names | ~0.1s |
| other `**.py` | pyflakes only | ~0.05s |
| `web/**`, `mobile/**` JS/TS | eslint, compared against the same file at HEAD | ~4s |
| `mobile/**.ts(x)` | `tsc --noEmit` over the mobile project | +~6s |

**The eslint check compares against HEAD rather than asserting zero.** The web
app has 292 pre-existing eslint errors (ratcheted by CI-03). A gate that fires on
almost every file is a gate the agent learns to ignore, so this one fires on an
*increase*: the same ratchet discipline the test suite uses, one file at a time.
The baseline copy is written next to the real file, because eslint resolves both
its config and its per-directory overrides from the file's path.

Verified by hand against a real violation, a real clean file, a file with three
pre-existing errors (allowed through), and a file outside the repository.

### `related_tests.py` — Stop

Maps the files the session touched to their tests and runs them. A backend module
maps to `test_*<stem>*.py`, falling back to a grep of the test tree; a component
maps to a colocated test, falling back to any test importing it by path. Capped
at 8 files per suite, and the message says when it sampled.

On failure it exits 2, which refuses the stop and hands the failures back. It
honours `stop_hook_active`, so it cannot loop. On success it clears the session's
touched-file list, so the same set is not re-run.

Measured: 5.2 seconds for a two-file session. The failure path was verified with
a deliberately failing test.

### They are tested

`backend/tests/unit/test_claude_hooks.py`, 46 cases, driving each hook as a
subprocess with real payloads. It covers what must be refused, **what must not
be refused** (ten ordinary commands, because half the value of a gate is what it
lets through), the override, a malformed event, and the two heredoc regressions.

This repository's own history is the argument for testing enforcement code:
`migrate-prod.yml`'s pending count returned 0 for any input from the day it was
written, and the schema baseline could not build a database. Both were committed
and described as working.

---

## 2. CLAUDE.md: 656 lines to 210

**160 of those 210 lines are non-blank.** The brief said "toward 150"; going
below meant deleting product context that nothing else records, so it stopped
here. The rule-by-rule conversion, which is the actual instruction, is complete.

### Every rule that left the prose, and where it went

| Rule | Now enforced by |
|---|---|
| 3 — no emojis | `guard_bash.py`, on commit messages |
| 5 — Optio brand colours | `web/src/__tests__/brandPalette.test.js` (already existed) |
| 6 — run tests before production | `ci.yml`, `release.yml` (already existed) |
| 7 — scope test runs | `related_tests.py`, the Stop hook |
| 8 — include superadmin in role checks | `test_role_rules_are_enforced.py` **(new)** |
| 9 — API keys via `Config` only | `test_no_raw_env_in_routes.py` (zero, existed) + `test_config_access_ratchet.py` **(new, 113)** |
| 11 — destructive git is off the table | `guard_bash.py`, no override |
| 12 — commit only your own work | `guard_bash.py`, on `git add -A` / `git commit -a` |
| Deleted tables (34 names) | `test_dropped_tables_are_not_queried.py` **(new)** |
| CSRF POST needs a body | `web/src/__tests__/csrfRequestBody.test.js` **(new)** |
| `users.is_org_admin` is derived | `test_role_rules_are_enforced.py` **(new)** |
| Adding an `OrgRole` needs a migration | `test_org_role_constraints.py` (already existed) |
| One Gemini model name | `test_single_model_source.py` (already existed) |
| One route, one owner | `test_no_duplicate_routes.py` (already existed) — the *recipe* for resolving a shadowed route stayed, because that is a debugging technique, not a rule |
| Coverage floors, ratchet ceilings, CI structure | `RATCHETS.md` |
| Repository pattern for new code | `test_new_routes_use_repositories.py` + CI-02 (already existed) |
| No tokens in web storage | `web/eslint.config.js` `no-restricted-syntax` + `lintRules.test.js` (already existed) |

Also deleted, for reasons other than a guard:

- **The 30-line Simplified Technical English block** — a verbatim copy of the
  user's global `~/.claude/CLAUDE.md`. Two copies of a style guide is one copy
  that will drift.
- **The local development command block** — `LOCAL_DEVELOPMENT.md` carries it,
  and carried it better.
- **The key API endpoint list** — discoverable, and it was already incomplete.
- **The troubleshooting table** — every row was either a test now or a link.

### What stayed, and why no test can take it

- **Rule 1, verify locally.** No test can confirm a person looked at
  localhost:3000.
- **Rule 2, ask before pushing to main.** A hook can stop the push; only the
  user can answer.
- **Rule 4, check the schema first.** A test cannot know the schema changed
  under you between sessions.
- **You are not the only agent in this tree**, with the 2026-08-14 postmortem.
  The hook refuses the commands; the prose is why, and the why is what stops
  somebody deleting the hook.
- **Product context**: the philosophy, the four surfaces and their naming, the
  course hierarchy, the two role populations, the SIS tiers, the architectural
  intent, the reference IDs.

**Two numbers in the deleted text were already wrong** — the web coverage floor
said 53 when it is 60, and the mobile thresholds were the pre-Phase-4 values.
That is the argument for the move in one line: prose about numbers goes stale
silently, and RATCHETS.md is checked against the code.

---

## 3. The four skills

`.claude/skills/`, one directory each:

- **ship-feature** — find every surface the change touches, verify the schema,
  write the gate with the route, test, verify locally, ask before `main`.
- **debug-production** — Sentry issue to root cause to failing test to fix, with
  a table of the seven failure shapes this codebase actually produces.
- **review-diff** — run the mechanical half, then read for what no test sees:
  org scoping, row limits, cross-surface duplication, silent partial failure.
- **scoped-refactor** — move bodies verbatim, run a scope pass, preserve what is
  keyed by name, prove the behaviour did not change.

They are written from this repository's postmortems rather than from general
advice. Four, not five: a fifth would be one nobody reads.

---

## 4. Sentry MCP

**The server was never broken and the token was never wrong. The auth scheme
was.** Sentry's endpoint wants `Authorization: Sentry-Bearer <token>`, and the
`sentry-optio` entry in `~/.claude.json` has been sending `Bearer <token>` since
roughly 2026-08. Every session reported `AUTH_HEADER_REJECTED / invalid_token`,
which reads exactly like an expired token, so the standing advice became "use
the Sentry REST API instead". Correct about the symptom, wrong about the cause,
for weeks.

Verified against the live endpoint with the same token twice:

```
Authorization: Bearer <token>          -> HTTP 401 invalid_token
Authorization: Sentry-Bearer <token>   -> HTTP 200, Sentry MCP 0.39.0
```

It is now in `.mcp.json`, so it loads for any checkout of this repository rather
than one person's machine. The broken user-scope entry is still in
`~/.claude.json` and should be removed — NEEDS TANNER item 11.

---

## 5. RATCHETS.md

Every mechanical control in one file: 16 counting ratchets with their ceilings,
the absolute guards grouped by what they protect, the five exemption structures
that are empty on purpose, the guards that do not run locally, the three
coverage floors, the three hooks, and the CI gates including the two that run
against production rather than against the repo.

Section 6 cross-references CLOSED_FINDINGS.md, which is the part the brief asked
for: every closed finding either names its guard or appears in a table of
deliberately-unguarded items with the reason.

**Result of that cross-reference:** seven findings that CLOSED_FINDINGS.md
listed as "closed but unguarded" have in fact been guarded since Phase 3 added
`test_closed_findings_stay_closed.py`. Those rows now name the test class. Nine
remain unguarded, and in every case the reason is the same: the state lives
outside this repository — a Render environment variable, the live Postgres
catalog, dashboard configuration.

**The inventory was built twice, independently**, because the first pass was
incomplete. The second found 115 controls where the first found 88, and three
numbers were wrong, including one in this phase's own first draft.

---

## 6. The register

`OPEN_FINDINGS.md` became `REGISTER.md` and is now the only living remediation
document. Everything open is in it: the two WONTFIX decisions awaiting
confirmation, the staging work that stops at local and E2E, nine carried-forward
gaps, and the bugs the phases found and did not fix — which until now existed
only inside five handoff documents nobody is going to read in order.

**The rule going forward:** the handoffs are historical records of what each
phase did, they are not updated, and nothing may be tracked only in one of them.
If an item in a handoff is still open, it is repeated in the register.

NEEDS TANNER is consolidated across all six phases and deduplicated. Items
completed in phases 1 through 4 are gone. Eleven remain.

---

## Bugs found, not fixed

Per the brief. All three are in the register with full detail.

1. **33 app-layer queries against tables that do not exist in production.**
   Eleven tables, verified absent from `information_schema` on 2026-09-10.
   `parent_connection_requests` (8 calls), `observer_requests` (5),
   `promo_codes` (4), `quest_tasks` (3), `task_merges` (3),
   `ai_generation_metrics` (3), `friendships` (2), `user_quest_deadlines` (2),
   and three more with one each. Plus nine in `backend/scripts/`.

   Each is either a 500 waiting for its route to be reached or dead code on a
   route nobody reaches. The observer and parent-connection clusters look like
   whole features removed at the database and left in the code. Ratcheted so the
   number cannot grow; repairing them is a bugfix pass of its own, and deleting
   a route is a behaviour change this phase does not make.

2. **Six writes to `users.is_org_admin`**, in `routes/admin/user_management.py`
   and `routes/admin/organization_users.py`. All six write the value the
   `sync_is_org_admin` trigger computes anyway, so they are redundant rather
   than wrong. Ratcheted. A second test now fails any payload that writes the
   flag *without* a role column, which is the genuinely dangerous shape: the
   trigger reverts it and the caller is told it succeeded.

3. **`mypy.ini` and `tests-backend.yml` disagree** about how many modules are
   exempted — the workflow comment says 296, the file has 292 with
   `ignore_errors` out of 302 named sections. Cosmetic, but it is the kind of
   drift that makes people stop trusting the comment.

---

## Not mine

Two untracked files from another session currently fail `ruff check backend`,
which is an enforcing CI step:

- `backend/tests/unit/test_cron_deploy_window.py` — three unused imports (F401)
- `backend/tests/unit/test_observer_feed_missing_user.py` — `pytest.raises(Exception)` (B017)

They are untracked and belong to whoever is working on the cron deploy window
and the observer feed. **Left alone deliberately** — CLAUDE.md forbids sweeping
in another session's work, and the fix is theirs to make. Worth knowing because
their commit will fail CI's ruff step until they do. Both would have been caught
at edit time by `fast_gate.py`, which is a fair illustration of what the hook is
for.

---

## What I could not do, and why

- **Measure the real backend coverage.** A local pytest run loads `backend/.env`
  and the CI runner does not; the two disagree by about 15 points. The floor is
  still 41 and is probably far too low. NEEDS TANNER item 7 — unchanged from
  Phase 4, and still the single cheapest ratchet improvement available.
- **Run the integration suite.** 133 tests including the RLS file are
  `requires_db` and need Docker, which this machine does not have. They run
  enforcing in CI.
- **Verify the hooks in a real Claude Code session end to end.** They were
  driven as subprocesses with the documented payload shapes and all 46 cases
  pass, and `guard_bash.py` demonstrably fired on my own commands during this
  phase. What is *not* proven is the harness contract itself — whether this
  build treats a PostToolUse exit 2 as feedback to the agent, and whether the
  Stop hook's exit 2 blocks the stop. Both scripts also write to stderr, which
  is visible either way, so the worst case is advisory rather than blocking.
  **The way to find out is to work for an hour with them on.**
- **Remove the stale `sentry-optio` entry.** It is in `~/.claude.json`, outside
  the repository. NEEDS TANNER item 11.

---

## NEEDS TANNER

Consolidated across all six phases in
[REGISTER.md](REGISTER.md#needs-tanner) — eleven numbered items, each runnable
by somebody who does not know this codebase. Read them there rather than here,
so there is one copy.

New in this phase:

### 11. Remove the stale `sentry-optio` MCP entry

Phase 5 added a working Sentry server to `.mcp.json`. The broken user-scope
entry is still in `~/.claude.json` and will keep failing at every session start,
next to the working one, which is confusing.

1. Run `claude mcp remove sentry-optio`, or delete the `sentry-optio` block from
   the `projects` section of `~/.claude.json`.
2. Confirm `SENTRY_AUTH_TOKEN` is still exported from `~/.zshrc`. The project
   entry reads it.
3. Start a session and check that `sentry` connects.

### And one decision that is now cheap

The register's item 7 (get the real backend coverage number) is two clicks in
GitHub Actions and would let the backend floor go from 41 to something that
actually protects the suite. It has been outstanding since Phase 4.

---

## Next

Nothing on this branch is pushed or merged. `main` is untouched.

If the hooks turn out to be too aggressive in daily use, the dial is
`.claude/settings.json` — removing one `matcher` block disables one hook without
touching the others, and every script fails open by design.
