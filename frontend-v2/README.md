# Optio Frontend V2

Universal Expo app (web + iOS + Android). Will replace the v1 Vite frontend page-by-page.

## Local development

Start the dev server:

```bash
# Web
npx expo start --web

# Mobile (dev client)
npx expo start --dev-client
```

See the project `CLAUDE.md` for detailed start commands with log capture.

## A4 — v1/v2 parity checklist

Until v1 is retired, every cross-cutting change must land in both frontends.
When opening a PR, if you change any of the below, apply it in **both**
[`frontend/`](../frontend/) and `frontend-v2/`:

- [ ] **Brand colors** — `optio-purple` / `optio-pink`, never `purple-600`/`pink-600`.
- [ ] **Auth rules** — session handling, token refresh, logout. v1 uses httpOnly cookies; v2 web uses cookies+Bearer, v2 native uses Bearer only (see [ADR-001](../docs/ADR-001-token-storage.md)).
- [ ] **API client behavior** — error handling, 401 retry, Content-Type defaults. v2 also has a jittered-retry for refresh ([E4](../C:/Users/tanne/.claude/plans/tender-bubbling-teacup.md)).
- [ ] **Role gating** — always include `superadmin` in allowed-roles lists (CLAUDE.md rule 7).
- [ ] **Sanitization** — every `dangerouslySetInnerHTML` must route through `sanitizeHtml()` (v1) or `sanitizeLessonHtml()`/DOMPurify (v2). Lint tests enforce this in both projects.
- [ ] **Copy / terminology** — quest vs project, pillar display names, etc.
- [ ] **Navigation** — new routes should exist on the corresponding v2 surface unless the route is web-only (admin/course-builder).

See [AUDIT_IMPLEMENTATION_PLAN.md](../AUDIT_IMPLEMENTATION_PLAN.md) for the broader backlog.
