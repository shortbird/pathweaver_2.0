# MCP Setup & Troubleshooting

One-time setup and troubleshooting reference for the MCP servers this project uses.
The per-session facts an agent actually needs mid-task (Supabase project IDs, Render
service IDs) stay in CLAUDE.md — this file is everything else.

## General

MCP servers extend Claude Code with external service integrations. Configuration is
stored in `~/.claude.json` (user-level) or project-level in the same file under
`projects`. NOT `~/.claude/settings.json`.

**Check MCP status:**
```bash
claude mcp list
```

## Supabase MCP

**Add Supabase MCP (user scope - applies to all projects):**
```bash
claude mcp add -s user supabase -- npx -y @supabase/mcp-server-supabase@latest --access-token <TOKEN> --project-ref vvfgxcykxjybtvpfzwyx
```

**Add to specific project only:**
```bash
claude mcp add -s local supabase -- npx -y @supabase/mcp-server-supabase@latest --access-token <TOKEN> --project-ref vvfgxcykxjybtvpfzwyx
```

**Remove an MCP server:**
```bash
claude mcp remove supabase
```

**To update the access token:**
1. Go to https://supabase.com/dashboard/account/tokens
2. Generate a new Personal Access Token (PAT)
3. Remove old server: `claude mcp remove supabase`
4. Re-add with new token using command above
5. Restart Claude Code

### How the connection is provided (differs by where Claude Code runs)

- **Local Claude Code (Mac):** PAT-based MCP servers. A project-scoped
  [.mcp.json](../.mcp.json) defines `supabase-pathweaver` (http type, pinned to
  `vvfgxcykxjybtvpfzwyx`) authenticated with `Authorization: Bearer ${SUPABASE_PAT}`.
  `SUPABASE_PAT` is exported from `~/.zshrc` (account-level Supabase PAT). Other
  projects (chamberlin, praxis) are additional PAT-based servers in `~/.claude.json`.
  This PAT/header style supports many projects at once.
- **Mobile app / remote Claude Code:** local files (`~/.zshrc`, `~/.claude.json`,
  and possibly even repo `.mcp.json`) are NOT present, and the Claude Connectors
  UI is **OAuth-only** — it does NOT accept a pasted PAT or custom Authorization
  header (`static_bearer` unsupported; query-param creds prohibited). Use the
  account-level **Supabase OAuth connector**, authorized to the **Optio** org and
  left **unpinned** (don't scope it to one project). Unpinned, it reaches all
  three Optio-org projects via `project_id`. Projects in OTHER orgs (e.g.
  `dub` / `1077`) are NOT reachable from the mobile app — OAuth is one-org-only
  and the app won't take a PAT. Those remain local-Claude-Code-only.

## Render MCP

**Package:** [`@niyogi/render-mcp`](https://www.npmjs.com/package/@niyogi/render-mcp) —
community Render MCP server (there is no official `@render` or `@anthropic-ai`
package on npm).

Two-step setup — the MCP server reads its API key from `~/.render-mcp/config.json`,
not from a CLI flag:

```bash
# 1. Store the API key in the MCP server's config file
npx -y @niyogi/render-mcp configure --api-key <RENDER_API_KEY>

# 2. Register the server with Claude Code (user scope)
claude mcp add -s user render -- npx -y @niyogi/render-mcp start
```

Verify with `claude mcp list` — should show `render: ... - ✓ Connected`. Restart
Claude Code so the new tools load into the session.

**Not working:** `@anthropic-ai/mcp-server-render` — 404 on npm. The
`claude mcp add ... --api-key ...` pattern also fails because `-y` is parsed by the
Claude CLI; hence the `configure` step above.

**Manual deploy via API:**
```bash
curl -X POST "https://api.render.com/v1/services/<SERVICE_ID>/deploys" \
  -H "Authorization: Bearer <RENDER_API_KEY>" \
  -H "Content-Type: application/json" \
  -d '{"clearCache": "do_not_clear"}'
```

## PostHog MCP

```bash
claude mcp add -s user posthog -- npx -y mcp-remote@latest https://mcp.posthog.com/mcp --header "Authorization:Bearer <POSTHOG_PERSONAL_API_KEY>"
```

**Authentication:** Requires a PostHog Personal API key (`phx_...`). Generate one at
https://app.posthog.com/settings/user-api-keys?preset=mcp_server

**Available tools:** Analytics queries, feature flags, experiments, error tracking,
annotations, project management.

**EU Cloud:** If using EU Cloud, use `mcp-eu.posthog.com` instead of `mcp.posthog.com`.

## Stripe MCP

Official hosted server at `https://mcp.stripe.com` — no npm package, no local process.

```bash
claude mcp add -s user --transport http stripe https://mcp.stripe.com/
```

Then authenticate with OAuth: run `/mcp` in an interactive session, pick `stripe`,
and approve the consent page in the browser. OAuth is per-user and per-environment
(live vs sandbox), so authorize against the environment you actually want.

Verify with `list_available_accounts_or_orgs` — it returns the account name and
`livemode`, which is the only way to be sure you authorized the right one:
`{"stripe_context":"acct_1SmHUjGhMwqwwj8J","livemode":true,"name":"Optio"}`.

**Do NOT put a Stripe key in the repo's [.mcp.json](../.mcp.json)** — that file is
committed. Header-auth servers belong in `~/.claude.json` (user scope) with a
literal value; `${VAR}` interpolation does not resolve under the VSCode extension,
which snapshots the shell env (this is why `brevo` stores a literal token).

### Which account you are talking to

There are two unrelated Stripe accounts in this system:

| Account | Key lives in | Covers |
|---|---|---|
| Optio platform | `STRIPE_SECRET_KEY` (Render env) | Platform subscriptions, registration funnel checkout |
| Per-org (currently iCreate only) | `organization_secrets.stripe_secret_key`, an `rk_live_` | That school's tuition, fees, invoices |

The OAuth session above is the **Optio platform** account. To reach an org's
account instead, register a second server with that org's restricted key:

```bash
claude mcp add -s user --transport http stripe-<org> https://mcp.stripe.com/ \
  --header 'Authorization: Bearer rk_live_...'
```

These are separate accounts, not Stripe Connect — there is no `Stripe-Account`
header in play, and a platform-account query will not see an org's payments.

### Safety

OAuth inherits your full dashboard permissions. The live server exposes 11 tools;
the entire write surface is the single tool `stripe_api_write`, which can reach any
`POST`/`DELETE` API method — refunds, voided invoices, cancelled subscriptions —
against **live** money. (Stripe's docs list per-action tools like `create_refund`;
those are not what the server actually serves as of 2026-08-31.) Mitigations:

- Never allowlist `stripe_api_write` in permissions; let it prompt every time.
  Reads go through a separate `stripe_api_read`, so allowlisting reads is safe.
- Restrict server-wide access at https://dashboard.stripe.com/settings/mcp
  (configured separately for live and sandbox).
- Revoke a session at https://dashboard.stripe.com/settings/user under **OAuth sessions**.
- For read-only work, prefer a restricted key with read scopes over OAuth.

Stripe's docs also warn about prompt injection when Stripe MCP is combined with
other servers — relevant here, since this session also has DB and email tools.

## Troubleshooting

| Issue | Solution |
|-------|----------|
| `claude mcp list` shows nothing | Config in wrong file - use `claude mcp add` command |
| MCP not loading after restart | Check `~/.claude.json` has correct `mcpServers` section |
| Auth errors | Regenerate token and re-add server |
| npx not found | Ensure Node.js is in PATH |
| Tools not available in session | Restart Claude Code after adding MCP server |
