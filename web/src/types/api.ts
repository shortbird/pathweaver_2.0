/**
 * The shapes that cross the boundary between this app and the Flask backend.
 *
 * This is the "shared types" half of the API-boundary conversion. It is
 * deliberately small: it types the ENVELOPE the backend puts around every
 * response and the axios options this app adds, not the two hundred-odd
 * per-endpoint payloads. Those change with the product; the envelope is a
 * contract, and it is the part that has actually bitten.
 *
 * Every field below exists because something went wrong without it. The
 * comments say what.
 */

import 'axios'

/**
 * The nested error object the backend's error handler returns.
 *
 * `middleware/error_handler` answers a 4xx/5xx with `{error: {code, message,
 * request_id}}`. Hundreds of call sites in this app do
 * `toast.error(err.response?.data?.error || '...')`, which hands react-hot-toast
 * an OBJECT -- React then throws "Objects are not valid as a React child" and
 * the ErrorBoundary replaces the whole page. Treehouse kids hit it on task
 * completion. The response interceptor flattens `error` to a string and keeps
 * the original here on `error_detail`, which is why both fields exist and why
 * they have different types.
 */
export interface ApiErrorDetail {
  code?: string
  message?: string
  request_id?: string
}

/** The JSON body of a failed response, after the interceptor has normalised it. */
export interface ApiErrorBody {
  /**
   * A string by the time a CALLER sees it, because the response interceptor
   * flattens the nested object. The union is not hedging: the interceptor
   * itself, and the failure reporter beside it, run before and after that
   * flattening respectively and must both handle the raw shape. A type that
   * said `string` would be describing the guarantee rather than the value.
   */
  error?: string | ApiErrorDetail
  /** The original nested object, preserved when `error` was flattened. */
  error_detail?: ApiErrorDetail
  message?: string

  /**
   * Product holds, each answered by a redirect in the response interceptor.
   * They arrive as 403s and are NOT authorization failures -- a family that
   * has not signed yet is in a supported state, not a refused one. Reporting
   * them as errors is how the Sentry noise started.
   */
  code?: 'signature_required' | 'phone_verification_required' | string
  consent_required?: boolean
  consent_status?: string

  /**
   * Set on the 400 the backend returns when a cookie-authenticated mutating
   * request carries a missing or expired CSRF token. The interceptor fetches a
   * fresh token and retries once.
   */
  csrf_required?: boolean
}

/** `GET /api/auth/csrf-token`. */
export interface CsrfTokenResponse {
  csrf_token?: string
}

/** What `POST /api/auth/refresh` may return in the body.
 *
 * Both fields are optional ON PURPOSE. A cookie-capable browser gets its
 * tokens as httpOnly cookies and the body carries none -- that is SEC-03, and
 * a type that made them required would read as a promise the backend
 * deliberately does not keep. Only the Safari/iOS/Firefox header fallback
 * populates them.
 */
export interface RefreshResponse {
  access_token?: string
  refresh_token?: string
}

/** In-memory token storage. Never localStorage -- see docs/ADR-001-token-storage.md. */
export interface TokenStore {
  /** Purges any legacy token/user data left in localStorage or IndexedDB. */
  init: () => void
  setTokens: (access: string | null, refresh: string | null) => void
  getAccessToken: () => string | null
  getRefreshToken: () => string | null
  clearTokens: () => void
}

export interface CsrfTokenStore {
  get: () => string | null
  /** Resolves the current token, fetching one if it is missing or stale. */
  ensure: () => Promise<string | null>
  set: (token: string | null) => void
  clear: () => void
}

declare module 'axios' {
  /**
   * The per-request options this app adds. They are declared here rather than
   * cast at each use so that a typo is a compile error instead of a flag that
   * silently does nothing -- which, for `expect403`, would mean an expected
   * refusal quietly going back to being reported as a failure.
   */
  export interface AxiosRequestConfig {
    /**
     * "A 403 on this request is an answer, not a failure." Set by probes that
     * ask a question the backend may legitimately refuse -- the OEA diploma
     * widget asks whether a student has an OEA enrollment and falls back to
     * Optio credits when told no. Without it, every such probe is a Sentry
     * report. Lives on the request config, not on the endpoint: the same URL
     * read by the person it belongs to still deserves a report when it 403s.
     */
    expect403?: boolean
    /** Internal: this request has already been retried after a token refresh. */
    _retry?: boolean
    /** Internal: this request has already been retried with a fresh CSRF token. */
    _csrfRetry?: boolean
  }
}
