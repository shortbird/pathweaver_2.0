## Summary

<!-- 1-3 bullets describing the change -->

## Test plan

<!-- How was this tested? -->

## Checklist

- [ ] Tests pass locally (`npm run test:run` for frontend; `pytest` for backend)
- [ ] No new `localStorage.setItem` for tokens or user objects (banned by ESLint rule)
- [ ] Any new `get_supabase_admin_client()` use is justified in a comment immediately above the call (see [ADR 002](backend/docs/adr/002-database-client-usage.md) and [H1_ADMIN_CLIENT_AUDIT.md](H1_ADMIN_CLIENT_AUDIT.md))
- [ ] Any new role-based route includes `superadmin` in the allowed roles list
- [ ] DB schema verified via Supabase MCP before adding queries
- [ ] No emojis added to code
