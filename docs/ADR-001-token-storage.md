# ADR-001: Token Storage Model

**Status**: Accepted
**Date**: 2026-04-13
**Context**: A5 (Audit Implementation Plan)

## Decision

Three different token-storage strategies, one per client surface. The right answer is platform-specific, not codebase-wide.

| Surface                  | Access token              | Refresh token              | Persistence across reload                          |
| ------------------------ | ------------------------- | -------------------------- | -------------------------------------------------- |
| `frontend/` (v1, web)    | httpOnly cookie           | httpOnly cookie            | Cookie survives reload; refresh interceptor renews |
| `frontend-v2/` (web)     | In-memory only            | httpOnly refresh cookie    | Cookie sent cross-origin via `withCredentials`; access token re-minted on boot via `/api/auth/refresh` |
| `frontend-v2/` (native)  | `expo-secure-store` (Bearer header) | `expo-secure-store`        | SecureStore (encrypted keychain/keystore) survives app launches |

## Why three strategies?

Each surface has different threat models and platform constraints.

### v1 web — cookies only
- Pure browser app on `optioeducation.com`. Same-site to `api.optioeducation.com` in prod, so httpOnly cookies work first-party; nothing in the JS heap to steal via XSS.
- Safari/iOS in some configurations strips third-party cookies — `shouldUseAuthHeaders()` flips the client to send the access token via `Authorization` header instead. Token still never lands in `localStorage` (C2 enforced this with an ESLint ban).
- Trade-off: CSRF protection required (Flask-WTF, mandatory in prod per C4). Acceptable cost since the alternative (Authorization headers everywhere) loses defense-in-depth on CSRF.

### v2 web — hybrid (memory access + httpOnly refresh cookie)
- Universal Expo app where the same `tokenStore` interface has to work on web *and* native. On web, dropping persistent localStorage matches v1's XSS posture (H2 fix).
- On reload, memory is empty — `authStore.loadUser` calls `POST /api/auth/refresh` with `withCredentials: true`; backend reads the cookie, returns a fresh access token, and we stash it in memory. No cookie-only access token because every API call uses `Authorization: Bearer <token>` (cleaner than dual-mode auth on the request side).
- Trade-off: requires `withCredentials` on the axios instance (only on web; gated by `Platform.OS`). Backend already supports cookie-based refresh — `session_manager.refresh_session` falls back to `request.cookies.get('refresh_token')` when no token override is provided.

### v2 native — SecureStore + Bearer header
- Mobile apps don't have httpOnly cookies in any meaningful sense. Persistent encrypted storage *is* the secure path; SecureStore wraps Keychain (iOS) and EncryptedSharedPreferences/Keystore (Android).
- Bearer headers fit the mobile model (single auth concept across third-party API integrations).
- No CSRF concern — there's no cross-origin browser context.

## What we explicitly rejected

1. **localStorage tokens anywhere.** Every persistent storage write of `access_token`/`refresh_token` is XSS-stealable. ESLint bans these key names in `frontend/`; v1 + v2 web both passed `pip-audit`-equivalent verification.
2. **Cookie-only on v2 web.** Would require mixing cookie auth and Bearer auth in the same axios instance, plus per-route CSRF middleware. Hybrid is cleaner.
3. **httpOnly cookies on native.** Not actually possible — React Native fetch/axios don't have a true cookie jar; trying to fake it would lose the SecureStore encryption guarantee.
4. **One global token model.** Was the original v2 design. It forced a least-common-denominator that was either insecure on web (localStorage) or unworkable on native (cookies).

## Consequences

- Three code paths to maintain. Mitigated by the `tokenStore` abstraction in v2 — callers don't see the platform difference; only `tokenStore.ts` does.
- Backend has to support both Bearer-header auth (v2 native + v2 web post-refresh + v1 Safari fallback) and cookie auth (v1 default). Already in place via `session_manager` reading both sources.
- Refresh failure on v2 web leaves the user logged out on next reload, even if their refresh cookie was technically still valid (e.g., transient network error during boot). Acceptable trade-off — the user can log in again; the alternative (silent retry-loops) hides real auth issues.
- New surfaces (e.g., a CLI client) need an explicit storage decision. This ADR is the reference.

## References

- C2 (audit): removed access/refresh tokens from v1 localStorage.
- H2 (audit): removed access/refresh tokens from v2 web localStorage; added cookie-driven refresh on boot.
- [backend/utils/session_manager.py](../backend/utils/session_manager.py) — token issue/verify/refresh.
- [frontend-v2/src/services/tokenStore.ts](../frontend-v2/src/services/tokenStore.ts) — platform-aware abstraction.
- [frontend/src/services/api.js](../frontend/src/services/api.js) — v1 axios with Safari header fallback.
