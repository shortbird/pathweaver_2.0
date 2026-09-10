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

## Sentry MCP

Configured in the repo's `.mcp.json`, so it loads for anyone who opens this project.
Reads the production error stream for backend, web and mobile, which is the input
half of the `debug-production` skill.

```json
"sentry": {
  "type": "http",
  "url": "https://mcp.sentry.dev/mcp",
  "headers": { "Authorization": "Sentry-Bearer ${SENTRY_AUTH_TOKEN}" }
}
```

**The auth scheme is `Sentry-Bearer`, not `Bearer`.** This is the whole reason the
server was unreachable for weeks. A user-scope entry named `sentry-optio` had been
sitting in `~/.claude.json` since roughly 2026-08 sending `Bearer <sntryu_...>`, and
every session reported `AUTH_HEADER_REJECTED / invalid_token`. That reads exactly
like an expired or wrong token, so the standing advice became "use the Sentry REST
API instead, the MCP server does not work" -- advice that was correct about the
symptom and wrong about the cause. The token was fine the entire time. Verified
2026-09-10 by sending the same `initialize` request twice with the same token:

    Authorization: Bearer <token>          -> HTTP 401 invalid_token
    Authorization: Sentry-Bearer <token>   -> HTTP 200, Sentry MCP 0.39.0

`SENTRY_AUTH_TOKEN` is exported from `~/.zshrc` (a `sntryu_` user token). Nothing
in the repo holds the value.

If the server still fails to connect, check for a stale `sentry-optio` entry in
`~/.claude.json` first -- a user-scope server with a broken header will keep
failing next to the working project-scope one, and the two are easy to confuse in
the startup output.

## Troubleshooting

| Issue | Solution |
|-------|----------|
| `claude mcp list` shows nothing | Config in wrong file - use `claude mcp add` command |
| MCP not loading after restart | Check `~/.claude.json` has correct `mcpServers` section |
| Auth errors | Regenerate token and re-add server. For Sentry, check the scheme is `Sentry-Bearer` before blaming the token |
| npx not found | Ensure Node.js is in PATH |
| Tools not available in session | Restart Claude Code after adding MCP server |
