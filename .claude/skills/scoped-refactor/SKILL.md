---
name: scoped-refactor
description: Refactor one module using its tests as the safety net, changing structure without changing behaviour. Use when splitting a large file, extracting a duplicated rule, moving code between layers, or consolidating copies of the same logic.
---

# Refactoring one module without changing what it does

This repository has done a lot of this: three route files over 1,700 lines
split, fifteen components over 1,000 lines split into thirty-one, thirty-five
copies of `_now()` collapsed into one. The method below is what those runs
converged on, including the parts that were learned by getting them wrong.

## 1. Establish the safety net first, and measure it

Find the tests that cover the module and run them. Write down the number.

```
cd backend && pytest tests/path/to/test_thing.py -q
cd web && npx vitest run src/path/to/Thing.test.jsx
```

If coverage is thin, **write the tests before you move anything.** A refactor
with no test underneath it is a rewrite with extra steps. Target the paths that
have actually broken before: `git log --follow -- <file>` and read the fix
commits. In every one of the five files covered in Phase 4, the repair history
clustered tightly, and the clusters were the untested part.

Prove each new test would have caught its bug: revert the fix in the source,
watch the test fail, put the fix back. A test that stays green without its own
fix is not a safety net.

## 2. Move bodies verbatim

Cut and paste. Do not tidy on the way — a refactor that also improves something
produces a diff nobody can review, and the improvement hides the mistake.

After a scripted or bulk move, run a scope check. Moving a function out of a
module silently drops the module-level names it closed over, and that failure
appears at runtime, not at import. On the last such run a babel scope pass
caught six real mistakes that read fine in review.

For Python, `python -m pyflakes <files> | grep 'undefined name'` is the same
check and costs nothing.

## 3. Preserve the things that are keyed by name

The traps that have actually bitten here:

- **Blueprint identity.** `registration_funnel` was split in three stages onto
  the *same* blueprint via `register_routes(bp)`, because CSRF exemptions are
  keyed by endpoint name and a second blueprint would have reproduced the
  2026-07-21 login outage. Splitting a route file? Dump the URL map before and
  after and prove it is byte-identical.
- **Two blueprints, one rule.** Flask does not warn. The first registration wins
  and the second becomes dead code carrying a different auth decorator.
- **Import cycles.** ES modules hand the module that loads second a
  partially-initialised copy of the first. A cycle that "works" today breaks
  when a line moves.
- **Re-exports.** If anything imports from the old path, keep the old path
  re-exporting, or fix every caller in the same commit. Not one and then the
  other.

## 4. Extract a rule, not a shape

When consolidating duplicates, the question is whether the two copies mean the
same thing, not whether they look the same. Two SIS path lists that looked
identical meant different things; merging them would have been a bug. The mobile
bounties hook is a read-only subset of the web app's CRUD surface, and merging
those was declined for the same reason.

The successful extractions were rules with a single correct answer — pillar
colours, role resolution, the subject vocabulary, an upload cap — and each got a
conformance test per surface so the copies cannot drift again.

## 5. Prove the behaviour did not change

- The tests you wrote in step 1 pass, at the same count.
- `git diff --stat` matches what you said you did. A "pure move" that touches
  logic is not a pure move.
- For a file move, `git diff -M` should show renames, not rewrites.
- If a ratchet moved, understand why. A pure split does not change the number of
  call sites — that is exactly why `dataFetchingParadigm.test.js` counts call
  sites and not files. If a count changed, something other than structure did.

## 6. Commit it as a refactor

One commit per logical move, with the reason in the message. If you found a bug
while moving code, do not fix it in the same commit — write it down and fix it
separately, so the behaviour change is reviewable on its own.
