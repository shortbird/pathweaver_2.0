# Parity rebaseline, 2026-09-03

The gate baseline moves from `PARITY_BASELINE_2026-08-22.json` to
`PARITY_BASELINE_2026-09-03.json`, captured when `origin/main` was merged into
`blocks/backbone`.

**Why it had to move.** `scripts/audit_module_parity.py` reads the live
production `organizations` table, not the code. The branch sat from 2026-08-23
to 2026-09-03, and real config changed under it, so the Aug 22 file stopped
describing prod. It could no longer produce the empty diff the enforcement
runbook gates on — not because module resolution changed, but because the
schools did.

**Every difference, accounted for.** None is caused by the merge; all five are
production config or org lifecycle:

| Change | What it is |
|---|---|
| org `tea` gone | Org removed in prod since Aug 22 |
| org `disruption` added | Org created in prod since Aug 22 |
| `horizon.flat_gates` — `registration`, `icreate_registration` now true | Horizon turned the registration funnel on |
| `horizon.opt_ins.goals`, `horizon.sis.effective_modules` (+`goals`), `horizon.sis_settings_gates.post_registration_flow` → `'goals'` | Horizon switched to goals mode; the module list follows the flag, which is the evaluator working |
| `hearthwood` / `hearthwood-test` `unknown_top_level_keys` gains `hide_pillars` | Main shipped `feature_flags.hide_pillars` on 2026-08-25 (see below) |

**The one open item: `hide_pillars`.** It is a real flag with no module in
`backend/modules/registry.py`, so the parity script reports it as an
unrecognized top-level key. That is cosmetic today — the flag hides the five
pillars in the learning app's chrome; it gates no route and owns no surface, so
there is nothing for `module_guard` to enforce. Decide before the enforce flip
whether it earns a registry entry (making it a toggleable block, visible in the
Blocks panel) or an explicit entry on the script's known-keys list. Leaving it
as an unknown key means every future parity run carries two lines of noise, and
a noisy gate is one people stop reading.

**Verification.** The script is deterministic: two consecutive runs against
prod produced byte-identical output. Backend 4602 passed, web 2452 passed on
the merged tree.

**What this does not do.** It does not re-verify that the blocks backbone is
behaviour-neutral — the Aug 22 → P5 runs did that, and they are unchanged
history. It re-anchors the gate to today's prod so the runbook's "diff must
stay empty" step is meaningful again. The next run that shows anything is a
finding.
