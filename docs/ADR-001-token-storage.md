# ADR-001: Token Storage Model

**Status**: Accepted
**Date**: 2026-04-13
**Amended**: 2026-08-15 (token delivery is now server-gated; refresh tokens rotate)
**Context**: A5 (Audit Implementation Plan)

## Decision

Three different token-storage strategies, one per client surface. The right answer is platform-specific, not codebase-wide.

| Surface                  | Access token              | Refresh token              | Persistence across reload                          |
| ------------------------ | ------------------------- | -------------------------- | -------------------------------------------------- |
| `frontend/` (v1, web)    | httpOnly cookie           | httpOnly cookie            | Cookie survives reload; refresh interceptor renews |
| `frontend/` (v1, Safari/iOS/Firefox) | In-memory + `Authorization` header | In-memory (tab lifetime) | Nothing survives reload; re-login |
| `frontend-v2/` (web)     | In-memory only            | httpOnly refresh cookie    | Cookie sent cross-origin via `withCredentials`; access token re-minted on boot via `/api/auth/refresh` |
| `frontend-v2/` (native)  | `expo-secure-store` (Bearer header) | `expo-secure-store`        | SecureStore (encrypted keychain/keystore) survives app launches |

**The server decides which row a caller is in.** Until 2026-08-15 every
login-shaped endpoint returned `app_access_token` and `app_refresh_token` in the
JSON body to *everyone*, and `/api/auth/refresh` returned a fresh 30-day refresh
token to anything holding the cookie. Row 1 was therefore aspirational: the
tokens were in the JS heap on Chrome too. The decision now lives in
[backend/routes/auth/token_delivery.py](../backend/routes/auth/token_delivery.py)
and is made from the User-Agent and Origin, server-side. A client may send
`auth_mode: "cookie"` to be given *less*; nothing a client sends can get it
*more*, because a flag that grants a credential is a flag worth forging.

## Why three strategies?

Each surface has different threat models and platform constraints.

### v1 web — cookies only

- Pure browser app on `optioeducation.com`. Same-site to `api.optioeducation.com` in prod, so httpOnly cookies work first-party.
- On a cookie-capable browser the login response body carries **no tokens at all**, so there is nothing in the JS heap for an XSS payload to steal, and nothing for it to obtain by POSTing `/api/auth/refresh` either. That endpoint answers to the refresh cookie, which is exactly why returning the new refresh token in its body was the sharpest edge of the old model: a script needed no credential of its own, only a fetch.
- Safari/iOS in some configurations strips third-party cookies, and Firefox's ETP does the same — those browsers genuinely cannot authenticate any way but the `Authorization` header, so they still receive both tokens. `shouldUseAuthHeaders()` draws the same line client-side; the backend's `_blocks_our_cookies()` must stay in step with it, and `test_token_delivery.py` fails if they drift.
- For those browsers the tokens live in module memory for the tab's lifetime only. Never `localStorage` (C2 enforced this with an ESLint ban).
- Trade-off: CSRF protection required (Flask-WTF, mandatory in prod per C4). Acceptable cost since the alternative (Authorization headers everywhere) loses defense-in-depth on CSRF. The gate triggers on `access_token`, `refresh_token` **or** `masquerade_token` — the last was added 2026-08-15, having been missed even though `get_current_user_id()` authenticates from it alone.

### v2 web — hybrid (memory access + httpOnly refresh cookie)

- Universal Expo app where the same `tokenStore` interface has to work on web *and* native. On web, dropping persistent localStorage matches v1's XSS posture (H2 fix).
- On reload, memory is empty — `authStore.loadUser` calls `POST /api/auth/refresh` with `withCredentials: true`; backend reads the cookie, returns a fresh access token, and we stash it in memory.
- Told apart from v1 by its `Origin` (`localhost:8081` in dev, the v2 Render service otherwise), which is how it keeps receiving body tokens while v1 stops.

### v2 native — SecureStore + Bearer header

- Mobile apps don't have httpOnly cookies in any meaningful sense. Persistent encrypted storage *is* the secure path; SecureStore wraps Keychain (iOS) and EncryptedSharedPreferences/Keystore (Android).
- Recognised server-side by having no `Mozilla/` product token in its User-Agent (okhttp on Android, CFNetwork/Darwin on iOS) — it has no cookie jar at all, so it always receives both tokens.
- No CSRF concern — there's no cross-origin browser context.

## Refresh tokens are single-use (2026-08-15)

Rotation is orthogonal to storage, and it is what limits the damage when storage fails anyway — a device backup, a shoulder-surfed devtools panel, an XSS on a Safari session that legitimately holds tokens.

- Every refresh token carries `fam` (the chain) and `jti` (this token). [`refresh_token_families`](../supabase/migrations/20260815030000_refresh_token_families.sql) records the one `jti` a family will accept next.
- Presenting the current `jti` rotates it. Presenting any **other** `jti` of the family means a token that was already spent is being replayed: the whole family is revoked, both parties are logged out, and it is reported to Sentry as `security_event: refresh_token_reuse`. Logging out the victim too is deliberate — once one credential is in two hands there is no way to tell the holder from the thief, and leaving the live session running leaves the thief running half the time.
- A superseded `jti` is accepted without penalty for 30 seconds after rotation, because two tabs refreshing at once present the same token twice and that is not an attack.
- Family rows are created on a chain's **first refresh**, not at login: it keeps the login path free of a write, and the first refresh is the first moment "current" and "spent" can differ.
- Revocation is not a second mechanism. `users.last_logout_at` is still the platform's revocation stamp; logout, password change and password reset now write both, so the two cannot disagree.
- **Grandfathering, time-boxed.** Tokens minted before this shipped carry no `fam`/`jti` and are accepted once, then upgraded into a family. They cannot outlive `REFRESH_TOKEN_EXPIRY_DAYS` (30) from deploy, so after **2026-09-30** that branch should be deleted and a missing `fam` should read as what it then is — a forgery.

## What we explicitly rejected

1. **localStorage tokens anywhere.** Every persistent storage write of `access_token`/`refresh_token` is XSS-stealable. ESLint bans these key names in `frontend/`.
2. **Trusting the client's `shouldUseAuthHeaders()` to decide delivery.** The client knows things the server doesn't (a cookie test in this tab), so it may *decline* tokens. It may not request them: an XSS payload can set any flag the app can.
3. **Cookie-only on v2 web.** Would require mixing cookie auth and Bearer auth in the same axios instance, plus per-route CSRF middleware. Hybrid is cleaner.
4. **httpOnly cookies on native.** Not actually possible — React Native fetch/axios don't have a true cookie jar; trying to fake it would lose the SecureStore encryption guarantee.
5. **One global token model.** Was the original v2 design. It forced a least-common-denominator that was either insecure on web (localStorage) or unworkable on native (cookies).
6. **A denylist of individual refresh tokens.** Unbounded, and it answers the wrong question. A family with one live `jti` gives revocation *and* reuse detection from one row.

## Consequences

- Three code paths to maintain. Mitigated by the `tokenStore` abstraction in v2 — callers don't see the platform difference; only `tokenStore.ts` does.
- Backend has to support both Bearer-header auth (v2 native + v2 web post-refresh + v1 Safari fallback) and cookie auth (v1 default). Already in place via `session_manager` reading both sources.
- **The browser-detection split is duplicated** between `browserDetection.js` and `token_delivery.py`. If they drift, a browser asks for header auth and finds no token, i.e. it cannot stay signed in. `test_token_delivery.py` asserts the client's three predicates are still the three the server mirrors.
- Refresh failure on v2 web leaves the user logged out on next reload, even if their refresh cookie was technically still valid. Acceptable trade-off — the user can log in again.
- Reuse detection **fails open** on a database error: a Supabase blip must not sign out the platform. It is a layer on top of `last_logout_at`, not underneath it.
- New surfaces (e.g. a CLI client) need an explicit storage decision *and* an entry in `token_delivery.py`, or they will be classified as a cookie-capable browser and receive nothing.

## References

- C2 (audit): removed access/refresh tokens from v1 localStorage.
- H2 (audit): removed access/refresh tokens from v2 web localStorage; added cookie-driven refresh on boot.
- [backend/utils/session_manager.py](../backend/utils/session_manager.py) — token issue/verify/refresh.
- [backend/utils/refresh_families.py](../backend/utils/refresh_families.py) — rotation and reuse detection.
- [backend/routes/auth/token_delivery.py](../backend/routes/auth/token_delivery.py) — who receives body tokens.
- [frontend-v2/src/services/tokenStore.ts](../frontend-v2/src/services/tokenStore.ts) — platform-aware abstraction.
- [frontend/src/services/api.js](../frontend/src/services/api.js) — v1 axios with Safari header fallback.
