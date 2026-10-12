---
name: push
description: Release everything outstanding to production - commit every uncommitted change in the tree (other sessions' work included), push main, and watch the release workflow until Render serves the new commit. Use only when Tanner types "/push" or says to push everything to main.
---

# /push: ship the whole tree to production

Typing `/push` is Tanner saying two things at once:

1. **Yes, push to `main`.** This is the confirmation CLAUDE.md rule 2 asks for,
   so prefix the push with `OPTIO_HOOK_OVERRIDE=1`. It covers this release and
   the fix-forward commits needed to get this release green. It does not cover
   a later push in the same session.
2. **Ship everybody's work, not just yours.** This is the one deliberate
   exception to rule 4 ("commit only your own files"). Uncommitted changes from
   other sessions go out too.

The job is not finished at `git push`. It is finished when Render serves the
pushed commit, or when you hand back a failure you could not fix.

## 1. Read the tree

```
git fetch origin
git status --short
git log --oneline origin/main..main      # committed locally, not yet pushed
git log --oneline main..origin/main      # pushed by someone else; must be empty or merged
```

If `origin/main` has commits you lack, `git pull --ff-only` (or `git pull
--no-rebase` when the histories have diverged). Never reset, stash, restore or
clean: `.claude/hooks/guard_bash.py` refuses them, and the reason is the
2026-08-14 incident in CLAUDE.md.

## 2. Commit what is outstanding

Read every diff before you stage it (`git diff -- <path>`, and read each
untracked file). You are about to publish work you did not write.

- **Group by change, not by session.** One commit per coherent piece of work,
  in the house voice: a short subject naming the surface ("Messages: ...",
  "SIS attendance: ..."), then a body that says what changed and why. Infer the
  why from the diff, nearby comments and recent commits on the same files.
- **Stage by explicit path.** `git add -A`, `git add .` and `git commit -a` are
  refused by the hook, and that is correct even here.
- **Leave out what is not code.** Do not commit `.env*`, credentials, tokens,
  scratch files, screenshots, `*.log`, local databases, or one-off scripts
  sitting in the repo root. List what you left out in the hand-back.
- **Another session may still be typing.** Re-run `git status` right before
  each commit. A file that changed again since you read it gets re-read.
- **Migrations go first.** If any new file under `supabase/migrations/` is in
  the release, check prod (`list_migrations` on `vvfgxcykxjybtvpfzwyx`) for it
  before you push. A deploy that reads a column the database does not have
  yet is an outage. If it is not applied, stop and ask: migrations reach prod
  through `migrate-prod.yml`, by hand, on purpose.

## 3. Test before the push

Run the three full suites once, on the tree you are about to push:

```
cd backend && pytest -q
cd web && npm run test:run
cd mobile && npm run test:run
```

Zero failures is the bar. When a test fails in somebody else's change:

- fix it if the fix is plain and small, in its own commit;
- otherwise stop and tell Tanner which change fails and why. Do not skip,
  xfail or delete a test, and do not push a red tree hoping CI disagrees.

## 4. Push

```
OPTIO_HOOK_OVERRIDE=1 git push origin main
```

`.githooks/pre-push` runs pyflakes, ruff and mypy on the pushed commit. If it
refuses, fix what it reports, commit, push again. `--no-verify` is refused and
the override does not cover it.

## 5. Watch the release until it is live

Find the run for the pushed SHA and watch it in the background, so Tanner can
keep talking to you while it runs:

```
sha=$(git rev-parse HEAD)
gh run list --workflow=release.yml --commit "$sha" --json databaseId,status
gh run watch <id> --exit-status        # run_in_background: true
```

`release.yml` takes about 13-15 minutes: backend, web, mobile and integration
tests; then `deploy` triggers the two prod Render services; then `smoke` waits
for `api.optioeducation.com/api/health` to report the SHA; then the production
OTA publishes. A newer push cancels nothing (`cancel-in-progress: false`), but
a run that shows `cancelled` was superseded; watch the newest one.

When the run ends, confirm on Render with `get_deploys` that the SHA is `live`
on both prod services:

| Service | id |
|---|---|
| backend | `srv-d9sjl1f10e5c73a14610` |
| web | `srv-d9sjl2qjnfac739k091g` |

The prod cron (`crn-d9sjl4tbedkc73dmb010`) auto-deploys on push, ahead of the
gated backend. A commit that adds a cron call and its route makes the cron 404
until the backend is live; that clears itself.

**If the run fails:** `gh run view <id> --log-failed`, find the cause, fix it,
run the affected suite locally, commit, push again with the override, and
watch the new run. Release runs usually fail on mypy, a coverage floor, or a
test that passes only with `backend/.env` loaded (CI has no `.env`). Coverage
floors and ratchet ceilings move only as RATCHETS.md describes, never to make
a run pass. After two failed fix attempts on one cause, stop and report.

## 6. Hand back

Short, and in this order:

- the commits that shipped (SHA and subject), marking which were not yours;
- what you left uncommitted, and why;
- the release run result and the Render deploy ids, `live`;
- anything Tanner has to do now: a migration, a test to try in prod, a ticket
  the deploy sweep did not resolve.

The release workflow resolves fixed tickets and emails reporters by itself
(`deploy-sweep`). Do not do that by hand.
