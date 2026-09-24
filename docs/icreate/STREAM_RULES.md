# Rules for the four build streams (iCreate 2026-09-23)

Plan: docs/icreate/TASKS_MESSAGING_QUESTS_PLAN_2026-09-23.md. The owner's
decisions and answers in it are final; do not reopen them.

## Where you work

| Stream | Worktree | Branch | Migration timestamps |
|---|---|---|---|
| tasks | /Users/optio/pw-ws-tasks | icreate/ws-tasks | 20260924100000 - 20260924105959 |
| messaging | /Users/optio/pw-ws-messaging | icreate/ws-messaging | 20260924110000 - 20260924115959 |
| questform | /Users/optio/pw-ws-questform | icreate/ws-questform | 20260924120000 - 20260924125959 |
| attendance | /Users/optio/pw-ws-attendance | icreate/ws-attendance | 20260924130000 - 20260924135959 |

- Edit and commit only inside your worktree, on your branch. Never touch
  /Users/optio/pathweaver_2.0, never switch branches, never push, never merge.
- node_modules in each worktree are symlinks to /Users/optio/pathweaver-icreate-tasks.
  If a tool refuses the symlink, copy that one directory instead.
- Python venv: /Users/optio/pathweaver_2.0/venv. Backend tests: `cd backend && /Users/optio/pathweaver_2.0/venv/bin/python -m pytest`.

## The database is production

`backend/.env` points at the PRODUCTION Supabase project (vvfgxcykxjybtvpfzwyx).

- Never apply a migration (no MCP apply_migration, no DDL through execute_sql).
- Never write data through the MCP. Read-only SELECTs to check the schema are
  required before you write a query (CLAUDE.md rule 3), and fine.
- Do not start, stop or restart dev servers on :3000, :5001 or :8081. Other
  sessions use them.

## Migrations

- New files in `supabase/migrations/` inside your timestamp range.
- Additive only: new tables, new nullable columns, widened CHECK constraints,
  new indexes. Production keeps running the old code until the release, so
  nothing may break it.
- A data conversion that old code cannot survive goes in its own file named
  `<timestamp>_release_<what>.sql`, run at release time. Your code must work
  both before and after it runs.
- New tables: RLS on. Data API grants are inherited; do not add GRANTs.

## How to build

- Read CLAUDE.md and `.claude/skills/ship-feature/SKILL.md` first and follow them:
  route gates from `utils/sis_roles.py`, `@require_relationship_to` for id
  routes, check `app.url_map` for duplicate rules, `fetch_all_rows` or
  `count='exact'` for anything that grows with an org, grep
  `shared/sisConcepts.json` before adding a concept.
- New code uses repositories (`backend/repositories/`).
- Write tests that fail without your change. While iterating run the affected
  files. Before your final commit run the full backend suite, `cd web && npm
  run test:run`, and `cd mobile && npm run test:run` if you touched mobile
  (mobile's npm test is watch mode; use test:run). Zero failures. Do not skip,
  xfail or delete a test to get there; if a test is truly wrong, say why in
  your report. Ratchet numbers that legitimately move are edited in
  docs/remediation-2026-09/RATCHETS.md and the ratchet test.
- Match the surrounding code: comment density, naming, the "why" comments that
  cite ticket ids.
- UI copy: plain words, no emojis, never the word "checklist", never "request"
  or "form" for the new task flow. The family page is called "To do".
- Commit in logical steps. Message style: one plain sentence describing the
  behaviour, like the recent `git log`; body explains why. End with
  `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`.
  No emojis.

## Your final report

- Commits (sha + subject).
- Migrations added, and which are `_release_` files.
- Test results with numbers for each suite you ran.
- What you could not verify, and what the owner should click at localhost to see it.
- Files you touched that another stream probably touches too.
- Anything you found and did not fix.
