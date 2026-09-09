import axios from 'axios'
import type { AxiosError, AxiosRequestConfig } from 'axios'
import { shouldUseAuthHeaders } from '../utils/browserDetection'
import logger from '../utils/logger'
import { captureException } from './sentry'
import { postRefreshWithRetry, isUnrecoverableAuthFailure } from './sessionRecovery'
import type {
  ApiErrorBody, CsrfTokenResponse, CsrfTokenStore, RefreshResponse, TokenStore,
} from '../types/api'

/**
 * A JSON request body, as the endpoint helpers below take it.
 *
 * Deliberately NOT a per-endpoint type. This module is the boundary, and the
 * boundary's contract is the envelope (types/api.ts) plus which arguments each
 * endpoint takes -- not the shape of two hundred payloads that change with the
 * product. Typing those here would mean a second copy of the backend's
 * serializers, maintained by hand, in a codebase whose 273k lines of JSX do not
 * typecheck anyway. See tsconfig.json.
 */
type JsonBody = Record<string, unknown>

/** Query-string parameters, before URLSearchParams stringifies them. */
type QueryParams = Record<string, string | number | boolean | undefined | null>

/**
 * A refresh failure that means the SESSION is over, not that the request
 * failed. sessionRecovery reads this flag to decide between a retry and a
 * logout, so it is a real part of the contract rather than an ad-hoc property.
 */
interface SessionOverError extends Error {
  __sessionOver?: boolean
}

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:5000',
  headers: {
    'Content-Type': 'application/json',
  },
  // Always send cookies for httpOnly authentication.
  // Backend sets httpOnly cookies with SameSite=None and Secure=true for cross-origin support.
  withCredentials: true,
})

// In-memory-only token storage (C2, April 2026).
// Access token lives in memory for synchronous use by the request interceptor.
// Refresh token is held in the httpOnly cookie; the in-memory copy is only used
// as a Safari/iOS/Firefox fallback within the current tab's lifetime.
// On page reload everything is discarded; the response interceptor will
// re-hydrate via /api/auth/refresh using the httpOnly refresh cookie.
let accessToken: string | null = null
let refreshToken: string | null = null

// One-time migration: purge any legacy token/user data from localStorage/IndexedDB.
const purgeLegacyPersistence = () => {
  try {
    localStorage.removeItem('access_token')
    localStorage.removeItem('refresh_token')
    localStorage.removeItem('app_access_token')
    localStorage.removeItem('app_refresh_token')
    localStorage.removeItem('user')
    localStorage.removeItem('session_encryption_key')
    sessionStorage.removeItem('session_encryption_key')
    if (typeof indexedDB !== 'undefined') {
      indexedDB.deleteDatabase('optio_secure_storage')
    }
  } catch (_) {
    // Non-fatal; old data will expire on its own.
  }
}

export const tokenStore: TokenStore = {
  init: () => {
    purgeLegacyPersistence()
  },

  setTokens: (access: string | null, refresh: string | null) => {
    accessToken = access
    refreshToken = refresh
    logger.debug('[TokenStore] Tokens stored in memory')
  },

  getAccessToken: () => accessToken,
  getRefreshToken: () => refreshToken,

  clearTokens: () => {
    accessToken = null
    refreshToken = null
    purgeLegacyPersistence()
  }
}

// Helper function to get auth headers for fetch requests (backward compatibility)
export const getAuthHeaders = () => {
  const headers = {
    'Content-Type': 'application/json',
  }
  return headers
}

/**
 * Request Interceptor
 *
 * ✅ HYBRID AUTHENTICATION (January 2025): httpOnly cookies + token storage
 * - If tokens exist in memory (SPARK SSO): Add Authorization header
 * - Otherwise: Use httpOnly cookies (regular login)
 * - CSRF token added for state-changing requests
 */
api.interceptors.request.use(
  async (config) => {
    // ✅ HYBRID AUTH: Use Authorization header if tokens available (SSO flow)
    // Otherwise rely on httpOnly cookies (regular login)
    const token = tokenStore.getAccessToken()
    if (token) {
      config.headers['Authorization'] = `Bearer ${token}`
    }

    // Add CSRF token for state-changing requests
    if (['post', 'put', 'delete', 'patch'].includes(config.method?.toLowerCase() ?? '')) {
      // The bootstrap fetch is kicked off unawaited when authService loads, so
      // any mutating request firing early in page load — the acting-as token
      // re-mint on mount, most of all — used to race it and go out with no
      // header at all. The backend rejected those and reported every one to
      // Sentry (OPTIO-BACKEND-3); the response interceptor's retry then
      // recovered them, so it cost a round trip and a warning rather than a
      // user-visible failure. Awaiting the same in-flight fetch closes the
      // race for every call site at once. Bearer-authenticated requests skip
      // it: the backend exempts them from CSRF entirely.
      const csrfToken = token ? getCsrfToken() : await ensureCsrfToken()
      if (csrfToken) {
        config.headers['X-CSRF-Token'] = csrfToken
      }
    }

    // ✅ FILE UPLOAD FIX: Don't override Content-Type for FormData
    // Let Axios automatically set multipart/form-data with boundary
    if (config.data instanceof FormData) {
      delete config.headers['Content-Type']
    }

    return config
  },
  (error) => {
    return Promise.reject(error)
  }
)

// ✅ SECURITY FIX (P1-SEC-3): httpOnly CSRF token pattern
// - CSRF token stored in memory (not cookies)
// - Token fetched from API and sent in headers
// - Flask-WTF validates against httpOnly session cookie
let csrfToken: string | null = null
let csrfTokenIssuedAt = 0

// The backend expires a CSRF token after WTF_CSRF_TIME_LIMIT (1 hour,
// middleware/csrf_protection.py). Retire ours ten minutes early so a mutating
// request never carries a token the server is about to refuse. Without this the
// token was fetched once at app load and only replaced after a rejection, so
// every long-lived tab paid one 400 + refetch + retry per hour — invisible to
// the user thanks to the response interceptor below, but a steady stream of
// escalating CSRF-expired reports off the SIS class editor, which the front
// office keeps open all day (OPTIO-BACKEND-6J, 2026-08-18).
const CSRF_TOKEN_MAX_AGE_MS = 50 * 60 * 1000

function csrfTokenIsStale() {
  return Date.now() - csrfTokenIssuedAt >= CSRF_TOKEN_MAX_AGE_MS
}

// Function to get CSRF token from memory
function getCsrfToken(): string | null {
  return csrfToken
}

// Function to set CSRF token in memory (called after fetching from API)
function setCsrfToken(token: string | null) {
  csrfToken = token
  csrfTokenIssuedAt = token ? Date.now() : 0
}

// One shared bootstrap fetch, so a burst of early mutating requests costs a
// single /csrf-token round trip instead of one each.
let csrfBootstrap: Promise<string | null> | null = null

function ensureCsrfToken(): Promise<string | null> {
  if (csrfToken && !csrfTokenIsStale()) return Promise.resolve(csrfToken)
  if (!csrfBootstrap) {
    csrfBootstrap = api.get<CsrfTokenResponse>('/api/auth/csrf-token')
      .then(({ data }) => {
        if (data?.csrf_token) {
          setCsrfToken(data.csrf_token)
        }
        return csrfToken
      })
      // Fall back to whatever we already hold rather than null: when the
      // pre-emptive refetch above is the thing that failed, sending the aging
      // token still usually works, and the response interceptor recovers it if
      // it does not. Before the token had an age this was always null anyway.
      .catch(() => csrfToken)
      .finally(() => { csrfBootstrap = null })
  }
  return csrfBootstrap
}

// Export CSRF token management
export const csrfTokenStore: CsrfTokenStore = {
  get: getCsrfToken,
  ensure: ensureCsrfToken,
  set: setCsrfToken,
  clear: () => setCsrfToken(null)
}

/**
 * Response Interceptor - Token Refresh
 *
 * CRITICAL FIX (December 2025): Proper Safari/iOS/Firefox token refresh
 * - For browsers using Authorization headers (Safari/iOS/Firefox): send refresh_token in body AND store new tokens
 * - For other browsers: use httpOnly cookies (sent automatically)
 * - This fixes the bug where Safari/iOS/Firefox users get logged out when their access token expires
 */
let refreshPromise: Promise<unknown> | null = null

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config

    // Normalize v1-style nested error payloads ({error: {code, message, ...}})
    // to a plain string. Hundreds of call sites do
    // `toast.error(err.response?.data?.error || '...')`; handing react-hot-toast
    // an OBJECT makes React throw "Objects are not valid as a React child",
    // which replaces the whole page with the ErrorBoundary (seen by Treehouse
    // kids on task completion). The original object stays on `error_detail`.
    const nestedError = error.response?.data?.error
    if (nestedError && typeof nestedError === 'object' && !Array.isArray(nestedError)) {
      error.response.data.error_detail = nestedError
      error.response.data.error =
        nestedError.message || nestedError.code || 'Something went wrong'
    }

    // The school requires a signature before this family may use the platform
    // (backend/middleware/signature_gate.py). The router gate catches this on
    // navigation; this catches the case where the hold ARRIVES mid-session —
    // otherwise the family sits in an app whose every call has quietly started
    // failing, with nothing telling them why.
    if (error.response?.status === 403
        && error.response?.data?.code === 'signature_required') {
      const here = window.location?.pathname
      if (here && here !== '/family/required-documents') {
        window.location.assign('/family/required-documents')
      }
      return Promise.reject(error)
    }

    // Same shape for the phone-verification hold
    // (backend/middleware/phone_verification_gate.py). Both surfaces route
    // /verify-phone, so the assign stays on whichever host the 403 hit.
    if (error.response?.status === 403
        && error.response?.data?.code === 'phone_verification_required') {
      const here = window.location?.pathname
      if (here && here !== '/verify-phone') {
        window.location.assign('/verify-phone')
      }
      return Promise.reject(error)
    }

    // Handle 403 responses with consent_required flag for COPPA compliance
    // This triggers the ConsentBlockedOverlay component
    if (error.response?.status === 403 && error.response?.data?.consent_required) {
      // Emit a custom event that App.jsx can listen to
      window.dispatchEvent(new CustomEvent('consent-required', {
        detail: {
          consentStatus: error.response.data.consent_status,
          message: error.response.data.message
        }
      }))
      // Don't retry, just reject with the consent error
      return Promise.reject(error)
    }

    // CSRF auto-recovery (July 2026): the backend rejects cookie-authenticated
    // mutating requests whose CSRF token is missing or expired with a 400 +
    // csrf_required flag. Our in-memory token is fetched once at app load and
    // expires server-side after 1 hour, so a long-lived tab — or a request that
    // races the initial fetch, e.g. auto-verifying a Stripe payment right after
    // the redirect back — would otherwise fail with a user-visible CSRF error.
    // Fetch a fresh token and retry the request once.
    if (error.response?.status === 400 && error.response?.data?.csrf_required) {
      if (!originalRequest._csrfRetry) {
        originalRequest._csrfRetry = true
        try {
          const { data } = await api.get('/api/auth/csrf-token')
          if (data?.csrf_token) {
            csrfTokenStore.set(data.csrf_token)
            // Request interceptor re-attaches the fresh X-CSRF-Token header.
            return api(originalRequest)
          }
        } catch (csrfError) {
          logger.warn('[API] CSRF token refresh failed', csrfError)
        }
      } else {
        // A fresh token was rejected too — this is real breakage (or an
        // attack), not expiry. Surface it to Sentry; users only see a toast.
        captureException(
          new Error(`CSRF rejection not recovered: ${originalRequest.method?.toUpperCase()} ${originalRequest.url}`)
        )
      }
      return Promise.reject(error)
    }

    // Handle 401 responses by attempting token refresh
    // BUT: Don't refresh on login failures - those are genuine wrong credentials
    // FIXED (February 2026): Always attempt refresh on 401, even when in-memory tokens are absent.
    // Chrome users rely on httpOnly cookies, and IndexedDB token restore can fail. The backend
    // will determine if valid refresh_token cookies exist. For truly unauthenticated users,
    // the refresh will fail and redirect to login (same result, one extra fast request).
    // LTI 1.3 endpoints (/lti/token, /lti/deep-link/*) live in their own
    // auth domain — auth comes from a one-time code or a fresh Bearer
    // token, not from the Optio session/refresh cookie. A 401 here means
    // the LTI handshake failed; running the refresh-and-redirect dance
    // would just bounce the iframe to /login.
    const isLtiRequest = originalRequest.url?.startsWith('/lti/')

    if (error.response?.status === 401 &&
        !originalRequest._retry &&
        !isLtiRequest &&
        !originalRequest.url?.includes('/auth/refresh') &&
        !originalRequest.url?.includes('/auth/login')) {
      originalRequest._retry = true

      try {
        // Only one refresh at a time - all concurrent requests wait for same promise
        if (!refreshPromise) {
          refreshPromise = (async () => {
            try {
              // CRITICAL FIX: For Safari/iOS/Firefox, send refresh_token in request body
              // These browsers block cross-site cookies, so we must use Authorization headers
              const requestBody: { refresh_token?: string; auth_mode?: string } = {}
              const useAuthHeaders = shouldUseAuthHeaders()

              if (useAuthHeaders) {
                const currentRefreshToken = tokenStore.getRefreshToken()
                if (currentRefreshToken) {
                  requestBody.refresh_token = currentRefreshToken
                  logger.debug('[API] Sending refresh_token in body for Safari/iOS/Firefox')
                }
              } else {
                // Tell the backend we authenticate by cookie, so it withholds the
                // new tokens from the response body instead of handing this tab a
                // readable 30-day refresh token it will never use.
                //
                // The backend decides this for itself as well (from the User-Agent
                // and Origin) and does not need us — a flag that could GRANT a
                // credential would be worth forging. This one can only take one
                // away, which is why it is safe to send and safe to ignore.
                requestBody.auth_mode = 'cookie'
              }

              // One jittered retry on a transient failure (cold Render worker,
              // network blip). A 4xx still fails fast — see sessionRecovery.js.
              const response = await postRefreshWithRetry(requestBody, {
                post: (path: string, b: JsonBody) => api.post<RefreshResponse>(path, b),
              })

              if (response.status === 200) {
                // Tokens come back in the body only for clients that cannot use
                // cookies (Safari/iOS/Firefox, and the mobile app). For everyone
                // else the response carries no tokens at all and the refreshed
                // httpOnly cookies on the same response are the whole session —
                // an empty body here is success, not a failure to parse.
                if (response.data.access_token && response.data.refresh_token) {
                  tokenStore.setTokens(response.data.access_token, response.data.refresh_token)
                  logger.debug('[API] New tokens stored after refresh')
                }

                return true // Refresh successful
              }
              // A non-200 with no thrown error means we got a response but no
              // usable session out of it. Nothing to retry — end the session.
              const noSession: SessionOverError = new Error('Token refresh failed')
              noSession.__sessionOver = true
              throw noSession
            } finally {
              // Clear promise after refresh completes (success or failure)
              refreshPromise = null
            }
          })()
        }

        // Wait for the single refresh to complete
        await refreshPromise

        // Retry the original request (new tokens automatically sent via cookies or Authorization header)
        return api(originalRequest)
      } catch (refreshError) {
        // Only tear the session down when the refresh genuinely failed because
        // the credentials are gone — a 401/403 from /api/auth/refresh.
        //
        // A network error, a timeout, a 5xx (Render cold start) or a 429 (the
        // per-IP refresh throttle) says nothing about whether the refresh
        // cookie is still valid, and it usually is: it lives 30 days while the
        // access cookie lives 15 minutes, so every return visit after a break
        // arrives here. Clearing tokens and redirecting on those is what made
        // users report "it logged me out when I closed the app". Leave the
        // session alone and let the next request recover.
        if (!isUnrecoverableAuthFailure(refreshError)) {
          logger.warn('[API] Token refresh failed transiently — keeping session', refreshError)
          return Promise.reject(refreshError)
        }

        // Tokens are cleared by the backend response and from in-memory storage.
        tokenStore.clearTokens()

        // Only redirect to login if we're not already on auth pages or public pages
        const authPaths = ['/login', '/register', '/email-verification', '/forgot-password', '/reset-password', '/staff/welcome', '/', '/terms', '/privacy', '/academy-agreement', '/academy-handbook', '/services', '/catalog', '/how-it-works', '/poe', '/auth/callback']
        const currentPath = window.location.pathname
        const isPublicDiploma = currentPath.startsWith('/public/diploma/') || currentPath.startsWith('/portfolio/')
        const isConsultationPage = currentPath === '/consultation'
        const isDemoPage = currentPath === '/demo'
        const isQuestsPage = currentPath.startsWith('/quests') || currentPath.startsWith('/badges')
        const isJoinPage = currentPath.startsWith('/join/')
        const isPublicCoursePage = currentPath.startsWith('/course/')
        const isObserverAcceptPage = currentPath.startsWith('/observer/accept/')
        const isPublicReportPage = currentPath.startsWith('/report/')
        const isSharedPage = currentPath.startsWith('/shared/')
        const isInvitationPage = currentPath.startsWith('/invitation/')
        const isDocsPage = currentPath.startsWith('/docs')
        const isPublicTranscript = currentPath.startsWith('/public/transcript/')
        const isPromoPage = currentPath.startsWith('/for-students')
        const isMarketingPage = currentPath === '/philosophy' || currentPath === '/for-families' || currentPath === '/for-schools' || currentPath === '/classes' || currentPath === '/how-it-works'
        // Canvas LTI iframe pages — a refresh failure here should never
        // navigate to /login; the iframe lives in someone else's chrome.
        const isLtiPage = currentPath.startsWith('/lti-')
        // The kiosks (/kiosk for any org, /treehouse-kiosk for the Treehouse
        // program) are public, token-gated shared-device pages. Every page load
        // runs /api/auth/me, and a fresh iPad has no session, so the refresh
        // fails on the very first visit — before an admin has even pasted the
        // device code. That, and the 401 right after a student logs out to hand
        // off the device, must keep us on the kiosk, not bounce to /login.
        // (/kiosk was missing from this list until 2026-09-07 and could not be
        // set up at all: a cold load went straight to /login.)
        const isKiosk = currentPath === '/kiosk' || currentPath.startsWith('/kiosk/')
          || currentPath.startsWith('/treehouse-kiosk')
        // Org login pages (/login/<slug>) are themselves login pages — a 401
        // from the background session check must not bounce a school's
        // students off their branded login onto the main /login.
        const isOrgLoginPage = currentPath.startsWith('/login/')
        // Family registration funnel (/enroll/<code>, legacy
        // /register/icreate/<code>) — public entry links shared with
        // anonymous families; the app-load session check 401s for them by
        // design and must not eat the link with a bounce to /login.
        const isRegistrationFunnel = currentPath.startsWith('/enroll/') || currentPath.startsWith('/register/icreate/')
        // POE pilot pages. authPaths lists '/poe' as an exact match, which left
        // the deeper ones (/poe/showcase, the key-gated summary sent to POE
        // leadership) bouncing anonymous visitors to /login on the app-load
        // session check — the link looked broken to exactly the people it was
        // sent to. Prefix-match the whole area.
        const isPoePage = currentPath === '/poe' || currentPath.startsWith('/poe/')

        if (!authPaths.includes(currentPath) && !isPublicDiploma && !isConsultationPage && !isDemoPage && !isQuestsPage && !isJoinPage && !isPublicCoursePage && !isObserverAcceptPage && !isPublicReportPage && !isSharedPage && !isInvitationPage && !isDocsPage && !isPublicTranscript && !isPromoPage && !isMarketingPage && !isLtiPage && !isKiosk && !isOrgLoginPage && !isRegistrationFunnel && !isPoePage) {
          window.location.href = '/login'
        }

        return Promise.reject(refreshError)
      }
    }

    reportApiFailure(error)
    return Promise.reject(error)
  }
)

// ─── Loud API-failure reporting (July 2026) ─────────────────────────────────
// Callers catch rejected API promises and show a toast, so breakage was
// invisible to Sentry (only unhandled JS exceptions were captured) — the
// 2026-07-21 CSRF outage produced zero alerts. Report server-side failure
// classes that indicate a REGRESSION, not user error:
//   - any 5xx
//   - 403 (authorization) — role-gated UI means legit users rarely see these;
//     a burst = an over-tightened authz check (skips COPPA consent_required,
//     which is an expected product state handled above)
//   - 405 (method not allowed) — always a routing/deploy regression
// Deliberately NOT reported: 400/404/409/422 (user/validation flows), 401
// (session expiry is normal; the refresh interceptor handles it), 429 (rate
// limits working as intended), and network errors (offline users are noise).
// A caller that PROBES an endpoint — one where "you may not read this" is a
// legitimate answer it already handles, not a regression — opts its own request
// out with `expect403: true` in the axios config. Keep that on the request, not
// on the endpoint: the same URL read by the person it belongs to still deserves
// a report when it 403s.
// One report per method+endpoint+status per page load, 20 max, ids collapsed
// so Sentry groups by endpoint shape.
const reportedApiFailures = new Set()

// Switching which account the tab is authenticated as (parent -> child act-as,
// and back) installs the new token and THEN navigates. `window.location.href`
// is asynchronous: the page keeps running for a few hundred ms while the next
// document loads, so every parent-scoped query still in flight re-fires with
// the CHILD's token and is correctly refused. Those 403s are the authz layer
// working, not an over-tightened check, but they were being reported as
// regressions — one act-as tap produced three (Sentry OPTIO-WEB-C / -Q / -P:
// my-dependents, parent/completions, sis/parent/forms, all within 57ms of the
// act-as call). Callers mark the switch so the window is exempt; it lapses on
// its own, so a switch that never navigates re-arms reporting instead of
// silencing the tab for good.
const SESSION_SWITCH_QUIET_MS = 10_000
let sessionSwitchAt = 0
export const beginSessionSwitch = () => { sessionSwitchAt = Date.now() }
const inSessionSwitch = () => Date.now() - sessionSwitchAt < SESSION_SWITCH_QUIET_MS

const REPORTABLE = (error: AxiosError<ApiErrorBody>) => {
  const s = error.response?.status
  if (!s) return false
  if (s >= 500) return true
  if (s === 403 && !error.response?.data?.consent_required
      // The phone-verification hold is an expected product state (handled
      // above): every held adult's open tab 403s until they verify.
      && error.response?.data?.code !== 'phone_verification_required'
      // Both suppressions, added on two branches for two reasons.
      && !inSessionSwitch()
      // A probe that treats the refusal as its answer (see above).
      && !error.config?.expect403) return true
  return s === 405
}

function reportApiFailure(error: AxiosError<ApiErrorBody>) {
  try {
    if (!REPORTABLE(error)) return
    const method = (error.config?.method || 'get').toUpperCase()
    const status = error.response!.status
    const endpoint = (error.config?.url || 'unknown')
      .split('?')[0]
      .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, ':id')
      .replace(/\/\d+(\/|$)/g, '/:id$1')
    // `error` is a string once the response interceptor has flattened it, and
    // the nested object before that. reportApiFailure runs on both paths.
    const body = error.response?.data
    const nested = typeof body?.error === 'object' && body.error !== null
      ? body.error : undefined
    const key = `${status}:${method}:${endpoint}`
    if (reportedApiFailures.has(key) || reportedApiFailures.size >= 20) return
    reportedApiFailures.add(key)
    captureException(new Error(`API ${status}: ${method} ${endpoint}`), {
      status,
      endpoint,
      method,
      error_code: body?.error_detail?.code || nested?.code,
      server_message: typeof body?.error === 'string' ? body.error : nested?.message,
      request_id: body?.error_detail?.request_id,
    })
  } catch {
    // Reporting must never break the caller's error handling.
  }
}

// friendsAPI removed (March 2026 - Feature pruning)
// Collaboration API removed in Phase 3 refactoring (January 2025)

// Observer API methods (extended family portfolio access)
export const observerAPI = {
  // Get list of linked observers for current student
  getMyObservers: () => api.get('/api/observers/my-observers'),

  // Generate shareable invite link (student-initiated, link-based)
  generateInviteLink: () =>
    api.post('/api/observers/generate-link', {}),

  // Accept an observer invitation (creates observer-student link)
  acceptInvitation: (invitationCode: string, data = {}) =>
    api.post(`/api/observers/accept/${invitationCode}`, data),

  // Get my sent invitations
  getMyInvitations: () => api.get('/api/observers/my-invitations'),

  // Cancel pending invitation
  cancelInvitation: (invitationId: string) => api.delete(`/api/observers/invitations/${invitationId}/cancel`),

  // Parent endpoints - create shareable invite link for their child
  parentCreateInvite: (studentId: string, relationship: string) =>
    api.post('/api/observers/parent-invite', { student_id: studentId, relationship }),

  getParentInvitations: (studentId: string) =>
    api.get(`/api/observers/parent-invitations/${studentId}`),

  getObserversForStudent: (studentId: string) =>
    api.get(`/api/observers/student/${studentId}/observers`),

  // Remove observer from student (parent action)
  removeObserverFromStudent: (studentId: string, linkId: string) =>
    api.delete(`/api/observers/student/${studentId}/observers/${linkId}`),

  // Remove observer (student action - removes own observer link)
  removeMyObserver: (linkId: string) =>
    api.delete(`/api/observers/${linkId}/remove`),

  // Feed endpoints
  getFeed: (params: QueryParams = {}) => {
    const queryParams = new URLSearchParams();
    if (params.studentId) queryParams.append('student_id', String(params.studentId));
    if (params.limit) queryParams.append('limit', String(params.limit));
    if (params.cursor) queryParams.append('cursor', String(params.cursor));
    const queryString = queryParams.toString();
    return api.get(`/api/observers/feed${queryString ? `?${queryString}` : ''}`);
  },

  getMyStudents: () => api.get('/api/observers/my-students'),

  // Record feed item views
  recordViews: (items: unknown[]) =>
    api.post('/api/observers/feed/record-views', { items }),

  // Get viewers for a feed item
  getViewers: (targetType: string, targetId: string) =>
    api.get(`/api/observers/views/${targetType}/${targetId}`),

  // Comments on specific completions
  getCompletionComments: (completionId: string) =>
    api.get(`/api/observers/completions/${completionId}/comments`),

  // Comments on learning events (moments)
  getLearningEventComments: (learningEventId: string) =>
    api.get(`/api/observers/learning-events/${learningEventId}/comments`),

  postComment: (studentId: string, completionId: string, commentText: string, questId = null) =>
    api.post('/api/observers/comments', {
      student_id: studentId,
      task_completion_id: completionId,
      quest_id: questId,
      comment_text: commentText
    }),

  // Post comment on learning event (moment)
  postLearningEventComment: (studentId: string, learningEventId: string, commentText: string) =>
    api.post('/api/observers/comments', {
      student_id: studentId,
      learning_event_id: learningEventId,
      comment_text: commentText
    }),

  deleteComment: (commentId: string) =>
    api.delete(`/api/observers/comments/${commentId}`),

  // Share a feed item (generates a public link for other observers)
  shareFeedItem: ({ completion_id, learning_event_id }: JsonBody) =>
    api.post('/api/observers/feed/share', { completion_id, learning_event_id }),

  // Student-facing: get all feedback on my work
  getMyFeedback: (studentId: string) =>
    api.get(`/api/observers/student/${studentId}/comments`),

  // Student-facing: toggle feed item visibility for observers
  toggleFeedItemVisibility: ({ completion_id, learning_event_id, hidden }: JsonBody) =>
    api.post('/api/observers/feed-item/toggle-visibility', { completion_id, learning_event_id, hidden }),

  // One student's activity feed. The student's own Feed page moved to
  // /api/connections/feed (own work + connected peers'); this stays for the
  // parent/observer case, where the question really is "show me THIS child".
  getStudentActivityFeed: (studentId: string, params: QueryParams = {}) => {
    const queryParams = new URLSearchParams();
    if (params.limit) queryParams.append('limit', String(params.limit));
    if (params.cursor) queryParams.append('cursor', String(params.cursor));
    const queryString = queryParams.toString();
    return api.get(`/api/observers/student/${studentId}/activity${queryString ? `?${queryString}` : ''}`);
  },

  // Family observer endpoints (parent manages observers across all children)
  familyInvite: (studentIds: string[], relationship = 'other') =>
    api.post('/api/observers/family-invite', { student_ids: studentIds, relationship }),

  getFamilyObservers: () =>
    api.get('/api/observers/family-observers'),

  toggleChildAccess: (observerId: string, studentId: string, enabled: boolean) =>
    api.post(`/api/observers/family-observers/${observerId}/toggle-child`, {
      student_id: studentId,
      enabled
    }),

  removeFamilyObserver: (observerId: string) =>
    api.delete(`/api/observers/family-observers/${observerId}`)
}

// LMS Integration API methods
export const lmsAPI = {
  // Get list of supported LMS platforms
  getPlatforms: () => api.get('/api/lms/platforms'),

  // Get integration status for current user
  getIntegrationStatus: () => api.get('/api/lms/integration/status'),

  // Sync roster from OneRoster CSV (admin only)
  syncRoster: (file: File, platform: string) => {
    const formData = new FormData()
    formData.append('roster_csv', file)
    formData.append('lms_platform', platform)

    return api.post('/api/lms/sync/roster', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    })
  },

  // Sync assignments from LMS (admin only)
  syncAssignments: (assignments: unknown[], platform: string) =>
    api.post('/api/lms/sync/assignments', { assignments, lms_platform: platform }),

  // Get grade sync status (admin only)
  getGradeSyncStatus: () => api.get('/api/lms/grade-sync/status'),
}

// Parent Dashboard API methods
export const parentAPI = {
  // Get list of linked students (children)
  getMyChildren: () => api.get('/api/parents/my-children'),

  // Get dashboard data for a specific student
  getDashboard: (studentId: string) => api.get(`/api/parent/dashboard/${studentId}`),

  // Get calendar data for a specific student
  getCalendar: (studentId: string) => api.get(`/api/parent/calendar/${studentId}`),

  // Get progress/XP breakdown by pillar for a student
  getProgress: (studentId: string) => api.get(`/api/parent/progress/${studentId}`),

  // Get learning insights and analytics for a student
  getInsights: (studentId: string) => api.get(`/api/parent/insights/${studentId}`),

  // Get task details with evidence (for Calendar tab task detail modal)
  getTaskDetails: (studentId: string, taskId: string) => api.get(`/api/parent/task/${studentId}/${taskId}`),

  // Get quest details with student's personalized tasks (read-only)
  getQuestView: (studentId: string, questId: string) => api.get(`/api/parent/quest/${studentId}/${questId}`),

  // Get all completed quests for a student
  getCompletedQuests: (studentId: string) => api.get(`/api/parent/completed-quests/${studentId}`),

  // Get recent completions with evidence (for Insights tab)
  getRecentCompletions: (studentId: string) => api.get(`/api/parent/completions/${studentId}`),

  // Upload evidence on behalf of student (parent/advisor, no task completion)
  // Uses helper evidence endpoint - adds evidence blocks without completing the task
  // Expects JSON: { student_id, task_id, block_type, content }
  uploadEvidence: (data: JsonBody) =>
    api.post('/api/evidence/helper/upload-for-student', data),

  // Upload a file (image/document) and get back the URL
  // Used by parent evidence upload to first upload file, then create evidence block
  uploadFile: (formData: FormData) =>
    api.post('/api/uploads/evidence', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    }),

  // Get AI tutor conversations for monitoring (Communications tab)
  getTutorConversations: (studentId: string) => api.get(`/api/parent/communications/${studentId}`),

  // Get specific conversation messages
  getConversationMessages: (conversationId: string) => api.get(`/api/tutor/parent/conversations/${conversationId}/messages`),

  // Get safety reports for student
  getSafetyReports: (studentId: string) => api.get(`/api/tutor/parent/safety-reports/${studentId}`),

  // Get parent monitoring settings
  getSettings: (studentId: string) => api.get(`/api/tutor/parent/settings/${studentId}`),

  // Update parent monitoring settings
  updateSettings: (studentId: string, settings: JsonBody) => api.put(`/api/tutor/parent/settings/${studentId}`, settings),

  // NEW: Submit connection requests for multiple children (January 2025 Redesign)
  submitConnectionRequests: (children: unknown[]) => api.post('/api/parents/submit-connection-requests', { children }),

  // NEW: Get parent's submitted connection requests with status (January 2025 Redesign)
  getMyConnectionRequests: () => api.get('/api/parents/my-connection-requests'),

  // Family Settings - Co-Parents management
  getFamilyParents: () => api.get('/api/parents/family-parents'),
  promoteObserver: (observerId: string) => api.post('/api/parents/promote-observer', { observer_id: observerId }),

  // Parent task management for dependents (under-13 managed accounts)
  createTaskForDependent: (questId: string, data: JsonBody) =>
    api.post(`/api/family/quests/${questId}/tasks`, data),
  uncompleteTaskForDependent: (questId: string, taskId: string, data: JsonBody) =>
    api.post(`/api/family/quests/${questId}/tasks/${taskId}/uncomplete`, data),

}

// Admin Parent Connections API methods (January 2025 Redesign)
export const adminParentConnectionsAPI = {
  // Get all connection requests with filters
  getConnectionRequests: (filters: QueryParams = {}) => {
    const params = new URLSearchParams();
    if (filters.status) params.append('status', String(filters.status));
    if (filters.parent_id) params.append('parent_id', String(filters.parent_id));
    if (filters.start_date) params.append('start_date', String(filters.start_date));
    if (filters.end_date) params.append('end_date', String(filters.end_date));
    if (filters.page) params.append('page', String(filters.page));
    if (filters.limit) params.append('limit', String(filters.limit));
    return api.get(`/api/admin/parent-connections/requests?${params.toString()}`);
  },

  // Approve a connection request
  approveConnectionRequest: (requestId: string, adminNotes = '') =>
    api.post(`/api/admin/parent-connections/requests/${requestId}/approve`, { admin_notes: adminNotes }),

  // Reject a connection request
  rejectConnectionRequest: (requestId: string, adminNotes: string) =>
    api.post(`/api/admin/parent-connections/requests/${requestId}/reject`, { admin_notes: adminNotes }),

  // Get all active parent-student links
  getActiveLinks: (filters: QueryParams = {}) => {
    const params = new URLSearchParams();
    if (filters.parent_id) params.append('parent_id', String(filters.parent_id));
    if (filters.student_id) params.append('student_id', String(filters.student_id));
    if (filters.admin_verified !== undefined) params.append('admin_verified', String(filters.admin_verified));
    if (filters.page) params.append('page', String(filters.page));
    if (filters.limit) params.append('limit', String(filters.limit));
    return api.get(`/api/admin/parent-connections/links?${params.toString()}`);
  },

  // Disconnect a parent-student link
  disconnectLink: (linkId: string) => api.delete(`/api/admin/parent-connections/links/${linkId}`),

  // Manually create a parent-student link
  createManualLink: (parentUserId: string, studentUserId: string, adminNotes = '') =>
    api.post('/api/admin/parent-connections/manual-link', {
      parent_user_id: parentUserId,
      student_user_id: studentUserId,
      admin_notes: adminNotes,
    }),

  // Get all users by role (for dropdown selections)
  getAllUsers: (filters: QueryParams = {}) => {
    const params = new URLSearchParams();
    if (filters.role) params.append('role', String(filters.role));
    if (filters.search) params.append('search', String(filters.search));
    if (filters.page) params.append('page', String(filters.page));
    if (filters.per_page) params.append('per_page', String(filters.per_page));
    return api.get(`/api/admin/users?${params.toString()}`);
  },
}

/**
 * Quest Lifecycle API
 * Handles pick up/set down workflow (January 2025)
 */
export const questLifecycleAPI = {
  // Pick up a quest (start or resume)
  pickUpQuest: (questId: string) => api.post(`/api/quests/${questId}/pickup`, {}),

  // Set down a quest with optional reflection
  setDownQuest: (questId: string, reflectionData: JsonBody) => api.post(`/api/quests/${questId}/setdown`, reflectionData || {}),

  // Get quest pickup history
  getPickupHistory: (questId: string) => api.get(`/api/quests/${questId}/pickup-history`),

  // Get random reflection prompts
  getReflectionPrompts: (category = null, limit = 5) => {
    const params = new URLSearchParams({ limit: limit.toString() });
    if (category) params.append('category', category);
    return api.get(`/api/reflection-prompts?${params.toString()}`);
  },
}

// Advisor Check-in API
export const checkinAPI = {
  // Create a new check-in
  createCheckin: (data: JsonBody) => api.post('/api/advisor/checkins', data),

  // Get all check-ins for the current advisor
  getAdvisorCheckins: (limit = 100) => api.get('/api/advisor/checkins', { params: { limit } }),

  // Get all check-ins for a specific student
  getStudentCheckins: (studentId: string) => api.get(`/api/advisor/students/${studentId}/checkins`),

  // Get pre-populated data for check-in form (active quests, last check-in info)
  getCheckinData: (studentId: string) => api.get(`/api/advisor/students/${studentId}/checkin-data`),

  // Get a specific check-in by ID
  getCheckinById: (checkinId: string) => api.get(`/api/advisor/checkins/${checkinId}`),

  // Get check-in analytics for advisor
  getAnalytics: () => api.get('/api/advisor/checkins/analytics'),

  // End a student's quest during check-in
  endStudentQuest: (studentId: string, questId: string) => api.post(`/api/advisor/students/${studentId}/quests/${questId}/end`, {}),

  // Generate parent recap email from meeting notes (AI)
  generateEmail: (studentId: string, meetingNotes: string) => api.post('/api/advisor/checkins/generate-email', {
    student_id: studentId,
    meeting_notes: meetingNotes
  }),

  // Send the reviewed parent recap email (set test: true to send to advisor's own email)
  sendEmail: (data: JsonBody) => api.post('/api/advisor/checkins/send-email', data),

  // Admin endpoints
  getAllCheckins: (page = 1, limit = 50) => api.get('/api/admin/checkins', { params: { page, limit } }),
  getAdminAnalytics: () => api.get('/api/admin/checkins/analytics'),
}

// Advisor Dashboard API
export const advisorAPI = {
  // Get caseload engagement summary with per-student rhythm
  getCaseloadSummary: () => api.get('/api/advisor/caseload-summary'),

  // Learning moments
  createLearningMoment: (studentId: string, data: JsonBody) =>
    api.post(`/api/advisor/students/${studentId}/learning-moments`, data),

  uploadMomentMedia: (studentId: string, formData: FormData) =>
    api.post(`/api/advisor/students/${studentId}/learning-moments/upload`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    }),

  getStudentLearningMoments: (studentId: string, params = {}) =>
    api.get(`/api/advisor/students/${studentId}/learning-moments`, { params }),

  updateLearningMoment: (studentId: string, momentId: string, data: JsonBody) =>
    api.put(`/api/advisor/students/${studentId}/learning-moments/${momentId}`, data),

  deleteLearningMoment: (studentId: string, momentId: string) =>
    api.delete(`/api/advisor/students/${studentId}/learning-moments/${momentId}`),
}

// Evidence Management API (student-facing)
export const evidenceAPI = {
  // Delete an evidence block and its storage files
  deleteBlock: (blockId: string) => api.delete(`/api/evidence/blocks/${blockId}/delete`),
}

// Helper Evidence API (Advisors/Parents uploading evidence for students)
export const helperEvidenceAPI = {
  // Upload evidence block for a student (advisor or parent)
  uploadForStudent: (data: JsonBody) => api.post('/api/evidence/helper/upload-for-student', data),

  // Get student's active tasks (for evidence upload)
  getStudentTasks: (studentId: string) => api.get(`/api/evidence/helper/student-tasks/${studentId}`),

  // Remove an evidence block the caller previously uploaded
  deleteBlock: (blockId: string) => api.delete(`/api/evidence/helper/blocks/${blockId}`),
}

/**
 * Task Steps API
 * AI-powered task step breakdowns for neurodivergent-supportive learning
 */
export const taskStepsAPI = {
  // Generate AI-powered steps for a task
  generateSteps: (taskId: string, granularity = 'quick') =>
    api.post(`/api/tasks/${taskId}/steps/generate`, { granularity }),

  // Get all steps for a task (including nested sub-steps)
  getSteps: (taskId: string) => api.get(`/api/tasks/${taskId}/steps`),

  // Toggle a step's completion status
  toggleStep: (taskId: string, stepId: string) => api.put(`/api/tasks/${taskId}/steps/${stepId}/toggle`, {}),

  // Drill down into a step (for "I'm stuck" feature)
  drillDown: (taskId: string, stepId: string) => api.post(`/api/tasks/${taskId}/steps/${stepId}/drill-down`, {}),

  // Delete all steps for a task
  deleteSteps: (taskId: string) => api.delete(`/api/tasks/${taskId}/steps`),
}

/**
 * Transfer Credits API (Admin)
 * Import external transcript credits toward diploma
 * Supports multiple source institutions per student
 */
export const transferCreditsAPI = {
  // Get all transfer credits for a student (returns array)
  get: (userId: string) => api.get(`/api/admin/transfer-credits/${userId}`),

  // Save transfer credits (create or update by school name, or update by ID if provided)
  save: (userId: string, data: JsonBody) => api.post(`/api/admin/transfer-credits/${userId}`, data),

  // Upload transcript file (transferCreditId is optional - if not provided, creates a new record)
  uploadTranscript: (userId: string, file: File, transferCreditId = null) => {
    const formData = new FormData()
    formData.append('file', file)
    if (transferCreditId) {
      formData.append('transfer_credit_id', transferCreditId)
    }
    return api.post(`/api/admin/transfer-credits/${userId}/transcript`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
  },

  // Delete a specific transfer credit by ID
  deleteOne: (userId: string, transferCreditId: string) => api.delete(`/api/admin/transfer-credits/${userId}/${transferCreditId}`),

  // Delete ALL transfer credits for a student
  deleteAll: (userId: string) => api.delete(`/api/admin/transfer-credits/${userId}`),
}

// Hearthwood Academy (OEA) diploma program. Backs the /hearthwood tab.
// Reads (pathways, enrollments, credits) work for the managing parent and,
// for self-targeting routes, the student viewing their own diploma. Writes
// are parent-only (enforced server-side in backend/routes/oea.py).
export const oeaAPI = {
  // The three fixed diploma pathway definitions for the selection UX.
  pathways: () => api.get('/api/oea/pathways'),

  // All enrollments managed by the acting parent.
  enrollments: () => api.get('/api/oea/enrollments'),

  // One student's current enrollment (or null). Self-readable.
  studentEnrollment: (studentId: string) => api.get(`/api/oea/enrollments/${studentId}`),

  // Select or change a student's diploma pathway (parent only).
  selectPathway: (studentId: string, pathwayKey: string) =>
    api.post('/api/oea/enrollments', { student_id: studentId, pathway_key: pathwayKey }),

  // Credits + computed pathway progress + GPA for a student. Self-readable.
  // `config` carries per-call axios options — the diploma probe passes
  // expect403 so its expected refusal is not reported as a failure.
  credits: (studentId: string, config: AxiosRequestConfig) => api.get(`/api/oea/students/${studentId}/credits`, config),

  // Add a course credit to a pathway requirement slot (parent only).
  addCredit: (studentId: string, body: JsonBody) => api.post(`/api/oea/students/${studentId}/credits`, body),

  // Update a credit: rename / mark complete / grade / honors weighting (parent only).
  updateCredit: (creditId: string, body: JsonBody) => api.patch(`/api/oea/credits/${creditId}`, body),

  // Delete a credit (parent only).
  deleteCredit: (creditId: string) => api.delete(`/api/oea/credits/${creditId}`),

  // Ensure a credit has a linked student quest (creates one if missing); returns quest_id.
  ensureCreditQuest: (creditId: string) => api.post(`/api/oea/credits/${creditId}/quest`, {}),

  // Course quests left on the dashboard by a credit deleted before the delete
  // cleaned up after itself (parent only). Empty for anyone who never hit it.
  unlinkedCourseQuests: (studentId: string) =>
    api.get(`/api/oea/students/${studentId}/course-quests/unlinked`),

  // Remove one of those leftovers (parent only).
  removeCourseQuest: (studentId: string, questId: string) =>
    api.delete(`/api/oea/students/${studentId}/course-quests/${questId}`),

  // Raise/clear a student's transfer + non-direct credit caps (Hearthwood admin only).
  setCaps: (studentId: string, body: JsonBody) => api.patch(`/api/oea/enrollments/${studentId}/caps`, body),

  // Grade periods for a course (quarter/semester/annual grades + summaries).
  creditPeriods: (creditId: string) => api.get(`/api/oea/credits/${creditId}/periods`),
  saveCreditPeriod: (creditId: string, body: JsonBody) => api.put(`/api/oea/credits/${creditId}/periods`, body),

  // OEA-branded transcript data (credits, grades, GPA, notations).
  transcript: (studentId: string) => api.get(`/api/oea/students/${studentId}/transcript`),

  // Quarterly progress report (report card) for a term (1-4).
  progressReport: (studentId: string, term: JsonBody) =>
    api.get(`/api/oea/students/${studentId}/progress-report`, { params: { term } }),

  // Record that the parent opened the getting-started video. The video is an
  // external link, so this is a click, not playback — fire and forget, never
  // block or fail the navigation on it.
  markHelpVideoOpened: () => api.post('/api/oea/help-video/opened', {}),

  // Per-parent open status for the org's video (org admin / coordinator).
  helpVideoViews: () => api.get('/api/oea/help-video/views'),
}

// ── The Treehouse program API ────────────────────────────────────────────────
// Program-specific tab gated server-side by org slug 'treehouse'. Student-facing
// reads + signals, facilitator queues/showcase/balance, and kiosk login.
export const treehouseAPI = {
  // Lightweight profile to gate UI (membership, facilitator/admin, simplified-littles).
  me: () => api.get('/api/treehouse/me'),
  // Student home payload (most-recent active quest + next task, counts).
  home: () => api.get('/api/treehouse/home'),
  // Visual quest/badge browse grouped by pillar/category.
  quests: () => api.get('/api/treehouse/quests'),
  // Littles "More ideas": a few AI task suggestions in the same vein as the
  // quest's current task list (added via the standard add-manual-tasks call).
  questMoreIdeas: (questId: string) => api.post(`/api/treehouse/quests/${questId}/more-ideas`, {}),

  // Student raises a help/proud signal. type: 'help' | 'proud'.
  createSignal: (body: JsonBody) => api.post('/api/treehouse/signals', body),
  // Facilitator: open signal queue (optionally scoped to one cohort).
  signals: (cohortId: string) => api.get('/api/treehouse/signals', { params: cohortId ? { cohort_id: cohortId } : {} }),
  resolveSignal: (signalId: string) => api.post(`/api/treehouse/signals/${signalId}/resolve`, {}),

  // Facilitator: roster, pin queue, spendable-XP balance (cohort-scoped).
  students: (cohortId: string) => api.get('/api/treehouse/students', { params: cohortId ? { cohort_id: cohortId } : {} }),
  pins: (cohortId: string) => api.get('/api/treehouse/pins', { params: cohortId ? { cohort_id: cohortId } : {} }),
  markPins: (items: unknown[], status: JsonBody) => api.post('/api/treehouse/pins/mark', { items, status }),
  balance: (studentId: string) => api.get(`/api/treehouse/students/${studentId}/balance`),
  adjustBalance: (studentId: string, amount: number) => api.post(`/api/treehouse/students/${studentId}/balance/adjust`, { amount }),

  // Cohorts (A1): list + manage facilitator assignment + enrollment + ui_mode.
  cohorts: () => api.get('/api/treehouse/cohorts'),
  createCohort: (body: JsonBody) => api.post('/api/treehouse/cohorts', body),
  updateCohort: (classId: string, body: JsonBody) => api.patch(`/api/treehouse/cohorts/${classId}`, body),
  deleteCohort: (classId: string) => api.delete(`/api/treehouse/cohorts/${classId}`),
  duplicateCohort: (classId: string) => api.post(`/api/treehouse/cohorts/${classId}/duplicate`, {}),
  assignCohortAdvisor: (classId: string, advisorId: string) => api.post(`/api/treehouse/cohorts/${classId}/advisors`, { advisor_id: advisorId }),
  removeCohortAdvisor: (classId: string, advisorId: string) => api.delete(`/api/treehouse/cohorts/${classId}/advisors/${advisorId}`),
  enrollCohortStudents: (classId: string, studentIds: string[]) => api.post(`/api/treehouse/cohorts/${classId}/students`, { student_ids: studentIds }),
  withdrawCohortStudent: (classId: string, studentId: string) => api.delete(`/api/treehouse/cohorts/${classId}/students/${studentId}`),
  facilitators: () => api.get('/api/treehouse/facilitators'),

  // Facilitator phone capture (G1): one photo+caption → tag one or many students.
  capture: (body: JsonBody) => api.post('/api/treehouse/capture', body),
  // Photos go up first; /capture stores the pointers this returns. It used to
  // post to /api/evidence, which has no handler — every capture with a photo
  // 404'd as "Could not save capture".
  captureUpload: (formData: FormData) => api.post('/api/treehouse/capture/upload', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  }),

  // Showcase events. scope: 'upcoming' | 'past' | 'all'.
  showcaseEvents: (scope: string) => api.get('/api/treehouse/showcase/events', { params: scope ? { scope } : {} }),
  createShowcase: (body: JsonBody) => api.post('/api/treehouse/showcase/events', body),
  updateShowcase: (eventId: string, body: JsonBody) => api.patch(`/api/treehouse/showcase/events/${eventId}`, body),
  showcaseRoster: (eventId: string) => api.get(`/api/treehouse/showcase/events/${eventId}/roster`),
  joinShowcase: (eventId: string, body: JsonBody) => api.post(`/api/treehouse/showcase/events/${eventId}/join`, body),

  // Kiosk (facilitator provisioning; the login endpoints are unauthenticated + token-gated).
  createKioskDevice: (label: JsonBody) => api.post('/api/treehouse/kiosk/devices', { label }),
  kioskRoster: (deviceToken: string) => api.post('/api/treehouse/kiosk/roster', { device_token: deviceToken }),
  kioskLogin: (deviceToken: string, studentId: string) => api.post('/api/treehouse/kiosk/login', { device_token: deviceToken, student_id: studentId }),
}

export default api