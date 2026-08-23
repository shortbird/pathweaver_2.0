# Module-gate enforcement runbook

**Status: NOT flipped.** The gate ships enforcement-ready but the environment
default is `log`. This is the procedure for the flip — the single riskiest
step of the blocks program (ARCHITECTURE_BLOCKS §6.1 P3). It is an ops
action, not a code change, and it cannot be rehearsed on a branch: it needs
production traffic in `log` mode first.

## How the gate behaves per mode

`MODULE_ENFORCEMENT` (env var, read directly — not a secret):

| Mode | Behavior |
|---|---|
| `off` | Gate does nothing. Kill switch. |
| `log` *(default)* | Would-be blocks logged (`[ModuleGate] would block …`) + Sentry event tagged `source:module_gate`, request passes through. |
| `enforce` | Disabled module answers 404 with a generic body. |

The gate never blocks what it cannot attribute: unauthenticated requests and
requests whose org cannot be resolved pass through to the route's own auth.
Superadmins get **no bypass** by design.

## Pre-flip checklist (in order)

1. **Deploy with `log` (the default) and soak ≥ 1 week of production traffic.**
   School-week traffic, not a weekend.
2. **Review every hit**: Sentry, filter `source:module_gate`. Each event
   carries path, method, org, and the denied module(s). For each distinct
   (path, org, module) triple decide which it is:
   - *Caller bug* — the frontend offers a door to a disabled module. Fix the
     chrome (nav/card/route gating) so the request stops being made.
   - *Map bug* — the route is tagged with the wrong module, or a module's
     legacy derivation is wrong for that org. Fix the registry/tag; re-run
     `backend/scripts/audit_module_parity.py` (diff vs
     `docs/blocks/PARITY_BASELINE_2026-08-22.json` must stay empty).
   - *True positive* — traffic that SHOULD be blocked (bookmark, crawler,
     stale tab). No action; note it.
3. **No flip while any hit is unexplained.** Zero mystery events for at least
   3 consecutive days.
4. **Check the exemptions are still right**: `pay.py` (token-auth invoice
   settlement) and `school.py` (module discovery) stay open; the deliberately
   ungated parent routes are listed in `routes/sis/parent.py`'s docstring and
   `test_module_coverage.py`.

## The flip (staged)

1. **Staff console first**: set `MODULE_ENFORCEMENT=enforce` on the **dev**
   backend (Render `srv-d9sjl22fngtc73ffenl0`), verify the SIS console per-org
   on the dev site, then set it on prod backend (`srv-d9sjl1f10e5c73a14610`).
   Render env-var change restarts the service — do it outside school hours.
2. **Watch a full school day** of Sentry (`gate_mode:enforce` tag) + support
   channels. A wrongly-blocked staff surface shows up as a 404 where a page
   used to be.
3. **Family surfaces a week later**: the family routes are tagged with the
   same gate, so there is no second env var — the staged part is the *review*:
   before the staff flip, family-path hits in the log review get priority
   scrutiny, because a blocked family route during an enrollment window is
   the worst failure this program can produce.

## Rollback

Set `MODULE_ENFORCEMENT=log` (or `off`). Takes effect on service restart.
No data migration is involved anywhere in this system; per-org rollback is
deleting that org's `feature_flags.modules` keys (the veneer defaults apply
again).

## Known-hot orgs to check by hand after the flip

- **iCreate** — the flagship SIS org; check registration, billing, attendance.
- **Optio Academy** — hides most SIS modules via `hidden_modules`; its family
  surface and crons historically touched endpoints nav never constrained,
  which is exactly what the log soak exists to catch.
- **Gryffin** — goals mode + hidden modules; check Goals and Submissions.
- **LMS-only orgs** — should see zero change: every LMS module is core or
  default-on, and no SIS blueprint was reachable for them anyway.
