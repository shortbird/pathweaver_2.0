---
name: review-diff
description: Review a diff against this repository's ratchets and architectural rules before it is committed or pushed. Use when asked to review changes, check a branch, or sanity-check work before shipping.
---

# Reviewing a diff here

Most of what a reviewer used to check by eye is now a test. So the job splits in
two: confirm the mechanical half actually ran, then spend your attention on the
half no test can see.

## 1. Run the mechanical half

```
git diff --stat main...HEAD          # what is actually in the change
cd backend && pytest -q
cd web && npm run test:run
cd mobile && npm test
ruff check backend
python -m pyflakes backend | grep 'undefined name'
```

A failure in a ratchet test is not an obstacle to route around. Every ceiling in
[RATCHETS.md](../../../docs/remediation-2026-09/RATCHETS.md) was measured, and
raising one to make a build pass converts a fence into a record of when somebody
gave up. If a ceiling genuinely must move, it moves in its own commit with the
reason written in the commit message and in the test file.

Two specific things to check rather than assume:

- **Did the diff edit a test to make it pass?** `git diff main...HEAD -- '*test*'`.
  Skips, xfails and deleted assertions are the failure this repository cares
  about most.
- **Did an exemption list grow?** `EXEMPTIONS` in `test_route_file_sizes.py` and
  `EXEMPT` in `componentSize.test.js` are both empty and should stay empty. The
  allowlists that do have entries carry a written reason per entry.

## 2. Read for the things no test sees

In rough order of how often they matter here:

**Auth and scope.** Does every new route with an id in its path declare
`@require_relationship_to`? Does every role list include `superadmin` or come
from `sis_roles.py`? Is a new admin-client call justified at the site? Does a
new SIS field carrying pay information appear in `PAY_FIELDS`?

**Org scoping.** Does a query that should be limited to one organisation say so?
This is the bug class that looks fine in every test written with one org's data.

**Row limits.** Any read whose row count grows with the size of an org needs
`count='exact'` or `fetch_all_rows()`. A `len(...)` over `.execute().data` is
the shape to look for.

**Duplication across surfaces.** If the diff adds a rule to the web app that the
mobile app also needs, it belongs in `shared/` with a conformance test per
surface. A client-side copy of a server-side rule that nothing checks is how six
findings in one audit happened.

**Silent partial failure.** A `Promise.allSettled` where every call has its own
`.catch(err => console.error(...))` reports five successes and renders empty
sections. Look for per-call catches that convert a rejection into a fulfilled
promise.

**Error bodies.** A 5xx must not carry exception text. Raise and let the error
handler answer.

**Behaviour hidden in a refactor.** A commit that says it moves code should move
code. `git diff -M --stat` and a look at the parts that are not pure moves.

## 3. Read the commit messages

This repository's commit messages carry the postmortem — why a rule exists, what
broke, what was tried and rejected. A message that only says what changed loses
the half that stops the next person undoing it. Ask for the reason if it is
missing; it is much cheaper to write now than to reconstruct later.

Also check: no emojis, and the message describes the change rather than the
process of making it.

## 4. Say what you found, in order of consequence

Lead with anything that would reach a user. Separate "this is wrong" from "I
would have done this differently" — the second is worth saying once and not
worth arguing. If you found a bug outside the diff, write it down separately
rather than folding it into the review of the change in front of you.
