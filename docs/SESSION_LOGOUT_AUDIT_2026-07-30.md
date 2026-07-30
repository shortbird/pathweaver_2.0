# "I get logged out every time I open the app" — session audit, 2026-07-30

Source report — `bug_reports.ec53f9ef-304a-477f-823b-85705fe22211`, filed
2026-07-30 18:10 UTC by `katechr2@gmail.com` (advisor, iCreate), relaying a
parent:

> One parent was wondering if there was an easier way to stay logged in on the
> Optio app. She said she gets logged out everytime she opens the app.

It is second-hand and names no platform. The `platform: web-sis` field describes
where Kate filed it from, not where the parent was. Reports do arrive from every
surface — 152 android, 23 ios, 104 web-sis all-time — so this audit covered all
three rather than guessing.

**The session lifetime is not the problem.** Refresh tokens last 30 days and the
`SESSION_TIMEOUT_HOURS` cap matches at 720h. What was broken is the *client*
error handling: three separate paths threw a still-valid session away when a
request failed for a reason that had nothing to do with authentication.

---

## Why "closing the app" is the trigger

The access token lives **15 minutes**; the refresh token lives **30 days**. So
any return visit after even a short break necessarily starts with a 401 on the
first request, and the entire session then rests on a single
`POST /api/auth/refresh`.

That makes the refresh path's error handling the whole ballgame — and it was
treating "I couldn't reach the backend" as "your session is over". Reopening the
app is also exactly when the backend is most likely to be cold: the first
request of the day is the one that wakes a spun-down Render worker.

## The three defects

### 1. v1 web — any failed refresh logged the user out (primary)

`frontend/src/services/api.js`. The 401 interceptor's catch ran
`tokenStore.clearTokens()` and `window.location.href = '/login'` on **every**
refresh failure. A 502 from a cold worker, a timeout, a dropped connection, or a
429 from the per-IP refresh throttle all discarded a refresh cookie the backend
would still have accepted for weeks. There was also no retry on the refresh POST
— one attempt, and the session was gone.

v2 fixed this in April (`isUnrecoverableAuthFailure` + `postRefreshWithRetry`,
audit items E4/E5). **v1 never got the port**, and v1 is the production web app.

Fix: `frontend/src/services/sessionRecovery.js` — one jittered retry on
network/5xx, and only a 401/403 from `/api/auth/refresh` ends the session.

### 2. v1 web — the boot session check had the same flaw

`frontend/src/contexts/AuthContext.jsx`. `checkSession()` calls `/api/auth/me` on
every page load and cleared tokens in its catch regardless of cause. Worse for
*perception*: `PrivateRoute` redirects to `/login` the instant `isAuthenticated`
goes false, so a transient boot failure looked exactly like a logout even when
the cookies were fine.

Fix: retry `/me` once after 600ms on a non-auth failure, and never clear cookies
unless the backend actually answered 401/403. A genuinely logged-out user still
reaches `/login` on the first response, with no added delay.

### 3. v2 native — an unreadable keychain destroyed the session permanently

`frontend-v2/src/services/tokenStore.ts` + `src/stores/authStore.ts`. Two
compounding problems:

- `SecureStore.getItemAsync` was called with no options, so the keychain item
  defaulted to `WHEN_UNLOCKED`. A process started while the device is locked —
  a push notification is enough — **cannot read it at all**.
- If that read threw, it propagated into `loadUser`'s catch, where
  `extractApiError` maps a plain `Error` to
  `isAuthError=false, isNetworkError=false`. The condition there was
  `if (parsed.isAuthError || !parsed.isNetworkError)` — so `false || true` —
  and it called `clearTokens()`. One transient keychain hiccup wiped SecureStore
  and logged the user out **for good**.

Fix: write with `AFTER_FIRST_UNLOCK`; report `'unavailable'` (distinct from
`'empty'`) instead of throwing; retry once; and narrow the clear condition to
`parsed.isAuthError` alone, so only the backend can end a session.

### 4. Backend — a guard against the config that would cause this server-side

`verify_refresh_token()` runs `is_session_expired()` against the token's `iat`.
If `SESSION_TIMEOUT_HOURS` is ever set below `REFRESH_TOKEN_EXPIRY_DAYS * 24`,
refresh tokens get rejected while their own `exp` and the cookie `Max-Age` still
say they are good — a silent early-logout machine. The shipped defaults line up
(720h == 30d), but they are `os.getenv` defaults, and the session timeout was
only bumped 24h → 30d recently.

`session_manager.py` now logs a loud `ERROR` at boot if the two disagree.

> **Still to verify manually:** whether prod's Render env still carries a stale
> `SESSION_TIMEOUT_HOURS=24` from before that bump. If it does, it alone logs
> every user out daily and no client fix helps. The new startup log makes it
> visible in the Render logs on the next deploy — check there first.

---

## What was already correct (checked, not assumed)

- Refresh token TTL (30d) and the cookie `Max-Age` derived from it.
- `/api/auth/refresh` is CSRF-exempt, so a stale CSRF token can't block it.
- The refresh throttle is 300/5min per IP — already re-tuned for school NATs.
- Device fingerprinting (`dfp`) is log-only; it rejects nothing.
- `authService.checkTokenHealth()` already fails *open*.
- v2's route ErrorBoundary and notification-tap handling already avoid
  bouncing to login.
- Cookie `SameSite`/domain handling for `www.` + `api.optioeducation.com`
  (same-site → `Lax`, not partitioned).

## Known remaining trap (not fixed — dead code)

`authService.refreshSession()` (`frontend/src/services/authService.js:456`) has
the original defect: its catch clears tokens on any error. It has **no live
callers**, so it was left alone rather than changed blind — but anyone wiring it
up would reintroduce the bug.

## Tests

- `frontend/src/services/sessionRecovery.test.js` — 16 tests on the two helpers.
- `frontend/src/services/api.refreshLogout.test.js` — 8 interceptor-level tests.
  Verified these **fail on the pre-fix code** (4 of 8) and pass after; the 4
  genuine-logout tests pass on both, confirming that behaviour is unchanged.
- `frontend-v2/src/services/__tests__/tokenStore.unavailable.test.ts` — keychain
  failure is distinguishable from an empty store, and never clears.
- `frontend-v2/src/stores/__tests__/authStore.test.ts` — added 5xx, local-throw,
  and unreadable-keychain cases.

Full suites green: v1 943 passed, v2 455 passed / 3 skipped.

The backend change could not be exercised here — this container's `cryptography`
build is broken, so `import jwt` fails and the backend suite won't run. The file
compiles and the guard's arithmetic was checked against the shipped defaults and
a stale `SESSION_TIMEOUT_HOURS=24`.

## How to confirm with a user

The parent should now stay signed in across app closes. The specific case that
used to break and now shouldn't: open the app first thing in the morning, when
the backend has been idle overnight. Previously that was the single most likely
moment to be bounced to the login screen.
