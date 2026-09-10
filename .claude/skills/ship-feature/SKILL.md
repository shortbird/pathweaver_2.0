---
name: ship-feature
description: Plan, implement, test and verify a feature across the platforms it touches (backend, web, mobile, SIS). Use when adding or changing product behaviour in this repository, especially when the change crosses more than one surface or touches roles, XP, or org scoping.
---

# Shipping a feature in this repository

The order below is not ceremony. Every step exists because skipping it has cost
this project something specific, and the cost is named.

## 1. Find every surface the change touches

Ask this before writing anything, because the answer changes the size of the job:

- **Web platform** (`web/`) and **mobile app** (`mobile/`) are permanent
  siblings, not versions. A change to shared behaviour usually needs both. A
  change to one is a deliberate decision to leave the other alone — say so.
- **SIS console** (`web/src/pages/sis/`) is a third surface with its own roles.
  An org with `feature_flags.sis_enabled` sees SIS components for the same job
  the web platform does differently. Fixing the wrong one ships nothing.
- **Backend** is the gate for all of them. Frontend role checks are chrome.

A rule that exists in two places is a rule that will diverge. Six such
divergences were found in one audit — pillar colours, HTML-entity decoding, XP
guide roles, an upload cap, role resolution, the subject vocabulary — and four
were live or one migration from live. If your change encodes a rule both apps
need, put it in `shared/` and add a conformance test per surface.

## 2. Verify the schema before you write the query

Table and column names here have changed more than once, and 33 calls in the
app layers still query tables that were dropped. Use the Supabase MCP against
`vvfgxcykxjybtvpfzwyx` and read the actual columns. Do not trust a doc, this
skill included.

Two traps worth knowing before you write a read:

- **Row limits.** PostgREST truncates at 1,000 rows silently. If the row count
  grows with the size of an org, use `count='exact'` or `fetch_all_rows()`.
- **`diploma_subjects` defaults to `['Electives']`.** Any task insert that omits
  the column silently credits the work as an elective.

## 3. Write the route with its gate, not after it

- `@require_role(...)` — include `superadmin`, or use a tuple from
  `utils/sis_roles.py`. A test enforces this; it will tell you.
- `@require_relationship_to(param, allow=(...))` on any route with an id in the
  path. 217 such routes are accounted for and the test knows which.
- Pick the client deliberately: `get_user_client()` enforces RLS,
  `get_supabase_admin_client()` bypasses it and needs a written justification at
  the call site.
- Raise rather than returning exception text in a 5xx. The error handler owns
  the response.
- Check the URL rule is not already registered by another blueprint. Flask does
  not warn, and the first registration wins — four production bugs so far.

## 4. Run the tests that belong to the change, then the suites

While iterating, run the affected files only. The Stop hook does this
automatically from the files you touched, so mostly you will see it happen.

Before you commit, run all three in full:

```
cd backend && pytest
cd web && npm run test:run
cd mobile && npm test
```

Zero failures. Do not skip, xfail or delete a test to get there. If a test is
genuinely wrong, say so explicitly and explain why — that is a legitimate
outcome and hiding it is not.

If you added behaviour, add a test that fails without your change. The way to
know you have one is to remove your fix and watch the test go red. A test that
stays green when its own fix is reverted would not have caught the bug, and
there is no way to tell the two apart by reading.

## 5. Verify locally, then ask

The user confirms the change works at http://localhost:3000 (or :8081 for
mobile). Passing tests are not verification. Only after that:

- Commit the files **you** touched. Several agents share this working tree.
- `git push origin develop` deploys dev and publishes the preview OTA.
- Production is a direct push to `main` with no PR gate. Ask first. A hook
  stops you so that asking is unavoidable.

## What to hand back

State plainly: what changed, which surfaces, what the tests said (numbers, not
"passing"), what you could not verify, and anything you found and did not fix.
A bug you noticed and left is only useful if you write it down where somebody
will read it.
