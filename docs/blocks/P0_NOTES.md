# Blocks P0 — pre-flight notes (2026-08-22)

Phase 0 of [ARCHITECTURE_BLOCKS.md](../ARCHITECTURE_BLOCKS.md) §6.1.

## Status

- **PRs #92 and #94: both merged 2026-08-22** (waitlist auto-drop, onboarding
  template duplicate/reorder). Nothing in flight for this refactor to rebase over.
- **Parity baseline captured**: [PARITY_BASELINE_2026-08-22.json](PARITY_BASELINE_2026-08-22.json)
  — 18 active orgs, every legacy gate answered, via
  `backend/scripts/audit_module_parity.py`. Re-run the script before and after
  every phase merge; the diff must be empty except where the phase's changelog
  explicitly claims a change. Runs read-only; output contains no raw
  `feature_flags` values.

## Findings the baseline surfaced immediately

1. **Undocumented flag** — resolved: `hearthwood` / `hearthwood-test` carry a
   top-level `oea_enabled` key with exactly one reader,
   `backend/services/oea_compliance_sweep_service.py` ("orgs running the diploma
   program"), which also falls back to a `hearthwood` slug-prefix check. For P1:
   registry `credits`-family legacy source. For P4: the slug fallback joins the
   de-hardcoding list.
2. **The registration funnel config is not uniformly in `feature_flags`.**
   `icreate` and `gryffin` both run live funnels yet have falsy
   `registration`/`icreate_registration` flags; only `optio-academy` and the
   hearthwood orgs carry the config in flags. The per-slug defaults presumably
   live in `routes/icreate_registration.py`'s `_org_config`. P1's
   `modules.registration` gate must not key on the config dict's presence.
3. SIS orgs today: `icreate` (all modules, community on), `optio-academy`
   (12 of 14 hidden — the org most exposed by the P3 enforcement flip),
   `gryffin` (goals-mode, kiosk), `horizon`, `test`.

## File-ownership discipline (shared tree)

This branch (`blocks/backbone`) lives in its own worktree at
`~/pathweaver-blocks`; the shared tree at `~/pathweaver_2.0` stays on whatever
branch the other agents are using and is never switched by this effort. Wide
touches (the P1 gating lines across `routes/sis/*.py`) land as short
per-blueprint commits, skipping any file that carries someone else's
uncommitted changes in the shared tree. Backlog-hot files P1 avoids entirely:
`catalog.py`, `sis_waitlist_service.py`, `sis_onboarding_service.py`,
`sis_reports_service.py`, `ClassesPage.jsx`, `quest_drafts.py`.
