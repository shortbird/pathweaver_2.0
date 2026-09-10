# Phase 0 handoff — retire the August 2026 audit remediation plan

**Branch:** `docs/remediation-2026-09-phase0` (4 commits) — **shipped to `main`
2026-09-09**, carried up underneath Phase 1, which branched from this one. The
status line here said "not merged, not pushed" until then.
**Date:** 2026-09-08
**Scope:** documentation and references only. **No behaviour changed.**

---

## What changed

| SHA | Commit |
|---|---|
| `36b60619` | Replace the 3,964-line remediation plan with two files agents can read |
| `a03a919e` | Delete the 2026-08 audit plan and `docs/archive`, and repoint what cited them |
| `cd742a3e` | Delete five superseded docs, one of which was publishing secret keys |
| `64ab6d72` | List the stale docs rather than guessing which ones you still want |

116 files changed, 716 insertions, 17,807 deletions.

### `36b60619` — the two replacement files

- **`docs/remediation-2026-09/CLOSED_FINDINGS.md`** (173 lines, target was under
  400). One line per closed finding: what it was, how it was fixed, and the
  guard. Split into **§1 Closed and guarded** (36 findings with a test, lint
  rule or ratchet) and **§2 Closed but unguarded** (21 findings with nothing
  behind them — the ones that can regress silently, which is why they are
  separated). **§3** preserves the 2026-08-01 audit's C/H/M/L finding IDs.
- **`docs/remediation-2026-09/REGISTER.md`**. The open items restated in
  full, plus a NEEDS TANNER section of nine numbered procedures.

### `a03a919e` — deletions and reference repointing

Deleted `docs/audit-2026-08/` (3,964 lines) and `docs/archive/` (98 files,
12,479 lines). Four inbound path links repointed; three citations fixed that
were **already broken before this branch** (details below).

The ~20 prose citations of `AUDIT.md C1` in backend code are deliberately **not**
rewritten — they are finding IDs, not paths, they still grep, and the IDs now
resolve in CLOSED_FINDINGS §3.

### `cd742a3e` — five superseded docs deleted

`ADMIN_CLIENT_USAGE.md`, `ADMIN_CLIENT_USAGE_AUDIT.md`,
`AUTHENTICATION_ANALYSIS.md`, `SESSION_PERSISTENCE.md`, `SIS_MVP.md`.
Each had an authoritative successor and no inbound reference (`SIS_MVP.md` had
one, which was updated). Evidence per file in `STALE_DOCS.md` §1.

### `64ab6d72` — `docs/remediation-2026-09/STALE_DOCS.md`

45 stale files listed with evidence, grouped by why. **Nothing on that list was
deleted.** Counts: `docs/` went 235 files / 80,735 lines → 133 / 63,496.
Markdown alone: 109 files / 29,606 lines → 90 / 21,613.

---

## Test results

Run in full on all three surfaces, before any change and again after the last
commit. **Identical both times, zero failures.**

| Suite | Before | After |
|---|---|---|
| Backend (`pytest`) | 5,528 passed, 160 skipped, 0 failed | 5,528 passed, 160 skipped, 0 failed |
| Web v1 (`vitest run`) | 322 files, 2,829 passed, 0 failed | 322 files, 2,829 passed, 0 failed |
| Mobile v2 (`npm run test:run`) | 113 suites, 932 passed, 3 skipped, 0 failed | 113 suites, 932 passed, 3 skipped, 0 failed |

Also run: `pyflakes` on both edited Python files (clean), and a link check
asserting every markdown link in `CLAUDE.md` and the three new docs resolves.

> **One thing to know about the mobile suite.** `npm test` in `mobile` is
> `jest --watchAll`, which never exits — it is not usable non-interactively.
> The correct command is `npm run test:run` (`jest --ci --forceExit`). The
> instruction for this phase said `npm test`; that would hang forever.

---

## Verification of the 56 findings marked DONE

The instruction was to verify rather than trust. Method:

1. Confirmed every guard file named in the plan exists — 47 paths checked.
2. **Ran the suites**, so every guard test listed is passing today, not merely
   present.
3. Read ratchet and exemption state directly: `EXEMPTIONS` in
   `test_route_file_sizes.py` and `EXEMPT` in `componentSize.test.js` are both
   empty, as claimed.
4. Greped for each point fix in the code: `install_pii_scrubbing`,
   `get_deescalation_user_id`, `POSTGREST_ROLE = 'authenticated'`, `enc:v1:`,
   `masquerade_body_tokens`, `GUARDIAN_RELATIONSHIPS`, `OAUTH_PROVIDER_ENABLED`,
   the deleted `backend/exceptions.py`, the deleted `verify/`, the absent
   `cookie-debug` route, placeholder-only `.env.example` files, `deploy:
   needs: [backend, web, integration]`, no pip-audit suppressions, no
   `@tanstack` in v2, lazy `html2pdf`.
5. Measured what could be measured: 1,133 admin-client call sites, 176
   `@require_relationship_to` declarations, 38 `discloses=` routes.

**No DONE finding failed verification.** Nothing is being silently reopened.

### One status correction: OPS-09 is closed, not blocked

The plan carried OPS-09 (CRLF renormalization) as `BLOCKED`. It is **done** —
commit `5638a977`, 2026-09-08, 879 files, landed hours after the plan's last
update. Verified independently rather than from the commit message: **0 CRLF
blobs across 3,664 tracked text files**, and `.git-blame-ignore-revs` carries
the SHA. So there are 57 closed findings and 4 open, not 56 and 5.

Worth knowing: `git ls-files | xargs file` still reports ~868 CRLF files. That
is the **working tree**, not the repository — those files keep their CRLF bytes
on disk until re-checked-out, and `text=auto` normalizes them on read, which is
why `git status` is clean. The repository content is LF. A related consequence:
the CRLF editing trap recorded in CLAUDE.md no longer applies, which this
branch confirmed — Python rewrites of eight files produced 2–29 line diffs, not
whole-file rewrites.

### Three citations that were already broken before this branch

Found while updating references; each is a comment-only fix.

1. `backend/app_config.py` and `backend/tests/unit/test_oauth_provider_disabled.py`
   both name `backend/migrations/20251226_create_oauth2_infrastructure.sql` — a
   path QB-05 archived on 2026-09-03 without updating the two comments pointing
   at it.
2. `backend/routes/quest/detail.py:211` cited "AUDIT_IMPLEMENTATION_PLAN.md Q2".
   There is no Q2. It was H3, and H3 says the **opposite** of a retirement plan:
   the `quest_tasks` response key is deliberately kept because four v1
   components read it.
3. `mobile/src/__tests__/pillarPalette.test.ts`'s docblock still explained
   why civics and wellness disagreed between web and mobile and sent the reader
   to the plan's Open Questions. That was resolved 2026-09-04; the assertions
   below it already pin the agreement. Prose only.

---

## What I could not do, and why

- **Confirm anything that lives outside the repository.** Render environment
  variables, Supabase policy state, GCS lifecycle rules and Sentry monitors
  cannot be read from here (the Render MCP writes env vars but cannot read
  them). Everything in that category is in NEEDS TANNER.
- **Verify AUDIT.md H1** — student evidence media in public storage buckets.
  It was marked "Open — not in the requested scope" in 2026-08-01 and never
  revisited. Checking it needs a live bucket probe. **Recorded as unknown, not
  as open or closed.** This is the largest unverified item on the board.
- **Triage AUDIT.md M1–M6 and L3–L5.** Never triaged by anyone; out of scope
  then and out of scope for a documentation phase now. Their IDs survive in
  CLOSED_FINDINGS §3 and their substance is summarised in the register.
- **Delete more of `docs/`.** The instruction was to delete only what I was
  sure about. 45 files are stale and listed rather than removed; deleting them
  would free roughly a further 12,000 lines but each needs a judgement I do not
  have — whether `blocks/` is live work on a branch, whether the Gryffin and
  OEA plans are still referenced in conversations, whether the iCreate delivery
  logs matter to that client relationship.

### Bugs found, not fixed (structural pass — ground rule 5)

1. **`docs/ENVIRONMENT_VARIABLES.md:32`** says `FLASK_SECRET_KEY` is the JWT
   signing key. SEC-14 made that false. It does not mention `JWT_SECRET_KEY`.
2. **None of the three overlapping env docs** documents
   `ORG_SECRETS_ENCRYPTION_KEY`, `PLATFORM_STAFF_EMAILS` or
   `OAUTH_PROVIDER_ENABLED`, all live `Config` keys. `ENV_KEYS_REFERENCE.md` is
   the one CLAUDE.md designates, so that is where they belong.
3. **`CLAUDE.md`'s Git Configuration section** describes `release.yml`'s deploy
   job as `needs: [backend, web]`. CI-05 changed it to
   `[backend, web, integration]` on 2026-09-04. Left alone because CLAUDE.md is
   edited by several sessions and this is not my phase's file; it is a one-line
   fix.
4. **`docs/EVIDENCE_ATTACH_IOS_2026-07-30.md`** is headed "Status: not fixed.
   Instrumented so the next report identifies the cause." Two reports from one
   student, 18 days apart, July 2026. If nobody read the instrumentation this
   is an open bug, not a stale doc.
5. **`docs/ICREATE_ORIENTATION_FOLLOWUP.md:320`** — "helper written,
   uncommitted, untested, wiring removed before deploy." Unresolved as written.

---

## NEEDS TANNER

Nine items, all with numbered steps, live in
[REGISTER.md](REGISTER.md#needs-tanner). Summarised here so nothing
is missed:

1. **A deleted doc published two 64-hex secret keys.** `SESSION_PERSISTENCE.md`
   told the reader to set them as `FLASK_SECRET_KEY` on the named dev and prod
   Render services. Their SHA-256 values do not match the prod hashes recorded
   from a live read on 2026-09-03, so they look rotated out — but that is
   inference from a secondhand record, and deleting the file does not remove
   them from git history. **Check the two Render services and confirm.**
2. **Do not remove `FLASK_SECRET_KEY_OLD` before 2027-03-02.** LTI evidence
   tokens run 180 days and are stateless.
3. **Confirm `ORG_SECRETS_ENCRYPTION_KEY` is reaching the app** — one SQL query;
   all 7 rows still plaintext means it is not.
4. **Two Render dashboard edits (OPS-02):** neither backend installs ffmpeg, so
   video probing is silently off in production; and `www.optioeducation.com`
   returns no HSTS.
5. **Two leftovers from deleting the advisor daily summary:** a Sentry cron
   monitor that will start alerting "missed", and a dead env var.
6. **Walk the acting-as loop once in a browser (FU-05)** — enter, reload, leave,
   sign out, sign back in.
7. **Confirm or reverse two WONTFIX decisions:** SEC-18 (CSRF exemption list)
   and OPS-05 (no branch protection on `main`). Both are presented with their
   original reasoning, not re-argued.
8. **Approve or decline OPS-01 (staging database) and OPS-03 (migration apply
   pipeline).** OPS-03 has a further ordering constraint: the migration history
   must be reconciled before the first `apply`, or `db push` will attempt ~59
   already-applied migrations, not all of which are `IF NOT EXISTS`-guarded.
9. **Decide about `docs/archive/legacy-migrations/`.** Deleting `docs/archive/`
   took 89 legacy `.sql` files with it. QB-05 had deliberately kept them as the
   only written record of several schema decisions. They are recoverable with
   `git log --diff-filter=D -- 'docs/archive/legacy-migrations/*'`. Say the word
   and they come back to a path of your choosing.

Plus the decision this phase deliberately deferred: **which of the 45 stale docs
to delete**, in `STALE_DOCS.md` §2.

---

## Next phase

Per the phase plan, Phase 2 owns `supabase/migrations/` (OPS-01, OPS-03) and
Phase 4 owned OPS-09 — which is already done, so Phase 4 loses its item.

Nothing on this branch is pushed or merged. `main` is untouched.
