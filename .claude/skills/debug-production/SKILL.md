---
name: debug-production
description: Take a production error from Sentry to a root cause, then to a failing test, then to a fix. Use when investigating a live error, a Sentry issue, a 500 in production, or a user report of something broken on the deployed app.
---

# From a production error to a fix

The loop this closes: Sentry has covered backend, web and mobile for months and
nothing in this repository connected an error to a change. The `sentry` MCP
server in `.mcp.json` is the input; the output is a test that fails before your
fix and passes after it.

## 1. Get the real error, not the symptom

Use the Sentry MCP server. If it is unreachable, the auth scheme is
`Sentry-Bearer`, not `Bearer` — that one wrong word made the server look dead
for weeks. See [docs/MCP_SETUP.md](../../../docs/MCP_SETUP.md).

Collect, in this order:

1. The exception type and the **top frame in our code**, not in a library.
2. The release. A stale bundle is not a regression — web events carry a Sentry
   release for exactly this reason.
3. How many users, and since when. An error that started at a deploy boundary
   is a different investigation from one that has always been there.
4. The breadcrumbs. For a 500, the request path and the role of the caller.

## 2. Recognise the shapes this codebase produces

Before theorising, check whether the error is one of the failure modes this
repository has shipped before. These account for most of them:

| What you see | What it usually is |
|---|---|
| 500 on a route, `NameError` / `UnboundLocalError` | A missing import on a path Python only reaches at runtime. `python -m pyflakes backend \| grep 'undefined name'` |
| 500 from PostgREST, table not found | A query against a dropped table. 33 such call sites are still in the app layers |
| A route enforcing a **stricter role** than its code says | Two blueprints registered the same rule; the first one wins. `app.url_map.bind('localhost').match('/api/x', method='PUT')` |
| A count that is wrong and gets *more* wrong as data grows | PostgREST's 1,000-row truncation. Check `source:db_truncation` in Sentry |
| An org admin told "Superadmin access required" | A role list missing a role, or the shadowed-route problem above |
| Works for one org, fails for another | `feature_flags.sis_enabled` — two surfaces, same job, different components |
| A parent seeing a child's account after logout | The acting-as cookie outliving its session |
| An error that only Safari or iOS users hit | Cookies blocked; the Authorization-header fallback |

## 3. Reproduce it in a test before you fix it

This is the step that gets skipped and the one that matters. Write the test
first, watch it fail with the same error, then fix it.

If you cannot reproduce it in a test, say so and explain why rather than fixing
blind. "I could not reproduce this, here is what I changed and what I think it
does" is an honest handoff. A silent guess is not.

For a bug that came from a specific past fix being undone, revert the fix in a
scratch copy and confirm your new test goes red. A test that passes with the
fix removed is not protecting anything.

## 4. Check the blast radius before you change anything

- Read [CLOSED_FINDINGS.md](../../../docs/remediation-2026-09/CLOSED_FINDINGS.md)
  if the code you are about to change is in auth, logging, CI guards or the
  ratchets. You may be about to reopen a closed finding.
- If the fix touches a ratcheted quantity, the ratchet will tell you. Do not
  raise a ceiling to make a symptom go away.
- If the root cause is in production **state** rather than in code — an env var,
  a Supabase policy, a GCS lifecycle rule, a Sentry monitor — no repository
  change fixes it. Write it up as a numbered step somebody can follow, and stop.

## 5. Ship it the ordinary way

Local verification, then the full suites, then the user's decision about `main`.
A production fix is not an exception to that; production is where the last one
came from.

## What to hand back

The Sentry issue, the root cause in one sentence, the test that now covers it,
and — separately — anything you found while looking that you did not fix.
