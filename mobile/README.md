# Optio Mobile App

Universal Expo app (iOS + Android, plus a dev-only web target).

The mobile app and the [web app](../web/) are **permanent platform siblings**,
not successive versions. This file used to say "Will replace the v1 Vite
frontend page-by-page"; that is not the plan. Web users stay on the web app
indefinitely. The two directories were `frontend-v2/` and `frontend/` until
2026-09-08.

## Local development

Start the dev server:

```bash
# Web preview (dev only — users are never sent here)
npx expo start --web

# Native (dev client)
npx expo start --dev-client
```

See the project `CLAUDE.md` for detailed start commands with log capture.

## Cross-surface parity checklist

Both apps ship forever, so a cross-cutting change has to land in both of them —
this list is not a migration checklist, it is the standing cost of two surfaces.
When opening a PR, if you change any of the below, apply it in **both**
[`web/`](../web/) and `mobile/`:

- [ ] **Brand colors** — `optio-purple` / `optio-pink`, never `purple-600`/`pink-600`.
- [ ] **Auth rules** — session handling, token refresh, logout. Web uses httpOnly cookies; the mobile web target uses cookies+Bearer, and native uses Bearer only (see [ADR-001](../docs/ADR-001-token-storage.md)).
- [ ] **API client behavior** — error handling, 401 retry, Content-Type defaults. Mobile also has a jittered retry for refresh (E4).
- [ ] **Role gating** — always include `superadmin` in allowed-roles lists (CLAUDE.md rule 8).
- [ ] **Sanitization** — every `dangerouslySetInnerHTML` must route through `sanitizeHtml()` (web) or `sanitizeLessonHtml()`/DOMPurify (mobile). Lint tests enforce this in both projects.
- [ ] **Copy / terminology** — quest vs project, pillar display names, etc.
- [ ] **Navigation** — new routes should exist on the corresponding mobile surface unless the route is web-only (admin/course-builder).

See [REGISTER.md](../docs/remediation-2026-09/REGISTER.md) for the broader backlog.
