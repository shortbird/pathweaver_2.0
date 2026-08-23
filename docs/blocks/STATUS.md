# Blocks program status

Branch: `blocks/backbone` (worktree `~/pathweaver-blocks`). Nothing on `main`.
North star: [../ARCHITECTURE_BLOCKS.md](../ARCHITECTURE_BLOCKS.md).
Updated: 2026-08-23.

| Phase | Status | Notes |
|---|---|---|
| P0 pre-flight | **Done** | Parity script + baseline (`PARITY_BASELINE_2026-08-22.json`); drift findings in `P0_NOTES.md` |
| P1 backbone | **Done** | Registry (35 modules), evaluator, log-only gate on ~30 blueprints, effective_modules on org payloads, chrome adoption, Blocks panel |
| P2 LMS core | **Done** | Staff class creation + auto-advisor, class invite links, caseload = assignments ∪ rosters, Teaching sidebar section, org-scoped account disable, Progress tab |
| P3 enforcement + family + settings | **Code done; flip pending** | parent/staff routes tagged per module, school-context `modules`, family card gating, ONE settings registry for both surfaces, Blocks panel v2. The enforce flip is an ops action needing a production log soak — `ENFORCEMENT_RUNBOOK.md` |
| P4 de-hardcoding | **Code done; 4 prod flag writes + key scrub pending** | Flag-first with hardcode fallbacks; retirement steps in `P4_NOTES.md` |
| P5 cleanup | **Done** | routes/classes tuples → sis_roles tiers (+coordinator), class_scope guard test, dead org tabs + Teacher Panel shell removed, OrgStudentProgress mounted (P2). Roster-engine convergence satisfied by the landed multi-class engine; `sis_service.py` split stays deferred (ratchet) |

## Verification at P5 close

- Backend: 3,773 passed (unit + non-integration).
- Frontend: 2,097 passed across 237 files.
- Parity: empty diff vs the 2026-08-22 baseline after every phase.
- `MODULE_ENFORCEMENT` default remains `log` — no enforcement change shipped.

## What deploy day needs (in order)

1. Merge `blocks/backbone` → `main` (after ~2026-09-01 per the iCreate freeze,
   on Tanner's say-so), push, watch `Release (main)`.
2. Run the parity script against prod once live; diff must stay empty.
3. The four P4 flag writes + registration key scrub (`P4_NOTES.md`).
4. Log soak ≥1 week, then the staged enforce flip (`ENFORCEMENT_RUNBOOK.md`).
