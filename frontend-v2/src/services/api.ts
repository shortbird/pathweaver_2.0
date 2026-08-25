/**
 * API Client - Axios instance with Bearer token auth.
 *
 * Uses Authorization headers only (no cookies).
 * Token refresh handled automatically on 401.
 */

import axios, { AxiosError, AxiosResponse, InternalAxiosRequestConfig } from 'axios';
import { Platform } from 'react-native';
import Constants from 'expo-constants';
import { tokenStore } from './tokenStore';
import { postRefreshWithRetry } from './refreshRetry';
import { recordApiCall } from './diagnostics';
import { captureException, captureMessage } from './sentry';

// In dev (no EXPO_PUBLIC_API_URL set), web hits localhost and native hits a
// platform-appropriate host loopback / LAN IP:
//   - Web              → http://localhost:5001 (browser on the dev machine)
//   - iOS sim / device → the Metro bundler's host (the dev machine's LAN IP,
//     read from Constants.expoConfig.hostUri so it works on any dev machine)
//   - Android emulator → 10.0.2.2:5001 (Android emulator can't see the host's
//     LAN IP from inside the VM; 10.0.2.2 is the magic alias that points back
//     to the host loopback)
//   - Physical device  → set EXPO_PUBLIC_API_URL explicitly (or Metro's hostUri)
//
// In production builds, EAS injects EXPO_PUBLIC_API_URL=https://api.optioeducation.com.
// If the env var is missing in a native production build we fall back to prod rather
// than a dev URL, so a bad build can't accidentally target a developer's laptop.
const isDev = (typeof __DEV__ !== 'undefined' && __DEV__);
// hostUri looks like "192.168.68.53:8081" — same machine serves Metro and Flask.
const metroHost = Constants.expoConfig?.hostUri?.split(':')[0];
const DEV_LAN_IP = metroHost ? `http://${metroHost}:5001` : 'http://localhost:5001';
const ANDROID_EMULATOR_HOST = 'http://10.0.2.2:5001';
const PROD_API = 'https://api.optioeducation.com';
const NATIVE_FALLBACK = isDev
  ? (Platform.OS === 'android' ? ANDROID_EMULATOR_HOST : DEV_LAN_IP)
  : PROD_API;
const API_URL = Platform.select({
  web: process.env.EXPO_PUBLIC_API_URL || (isDev ? 'http://localhost:5001' : PROD_API),
  default: process.env.EXPO_PUBLIC_API_URL || NATIVE_FALLBACK,
});

export const api = axios.create({
  baseURL: API_URL,
  timeout: 15000,
  headers: { 'Content-Type': 'application/json' },
  // Web: send the httpOnly refresh cookie cross-origin so /api/auth/refresh works
  // after a hard reload (the access token only lives in memory). No-op on native.
  withCredentials: Platform.OS === 'web',
});

// One refresh in flight at a time, for the whole app.
//
// The backend rotates the refresh token on every use and treats a second
// presentation of an already-rotated token as a replay: it revokes the entire
// token family, which silently ends every session on that chain (Sentry
// OPTIO-BACKEND-6N, seen on iOS). It forgives a 30s grace window
// (REPLAY_GRACE_SECONDS in backend/utils/refresh_families.py), so a two-way race
// usually survives — but a third refresh landing in the meantime rotates the
// chain past the loser's token and the family dies.
//
// So every caller must join the same refresh rather than start its own. That
// means the 401 interceptor below AND the raw-`fetch` upload paths (axios mangles
// RN multipart, so those bypass the interceptor and call refreshAccessToken
// directly), which previously refreshed on their own with no shared state.
let refreshInFlight: Promise<string> | null = null;

/** Refresh the access token, or join the refresh already running. */
function refreshOnce(): Promise<string> {
  if (refreshInFlight) return refreshInFlight;

  refreshInFlight = (async () => {
    const refreshToken = tokenStore.getRefreshToken();
    // Web has no in-memory refresh token after a reload — the backend reads it
    // from the httpOnly cookie sent via withCredentials. Native must have it in
    // SecureStore; without it the session is simply gone.
    if (!refreshToken && Platform.OS !== 'web') {
      throw new Error('No refresh token');
    }

    // E4: single jittered retry on transient refresh failure (network blip,
    // 502 from Render cold start). A second 4xx still fails fast.
    const body = refreshToken ? { refresh_token: refreshToken } : {};
    const { data } = await postRefreshWithRetry(body, {
      post: (path, b) => api.post(path, b),
    });

    await tokenStore.setTokens(data.access_token, data.refresh_token);
    return data.access_token as string;
  })();

  // Free the slot once settled so the next 401 starts a fresh refresh. The
  // caught copy keeps a failed refresh from surfacing as an unhandled rejection;
  // every caller still sees the rejection on the promise it awaited.
  //
  // This side-channel is also the ONE place a genuinely dead session is torn
  // down, so it runs once per refresh no matter how many callers joined: clear
  // the tokens and tell the auth store (via listener — this module must not
  // import the store). Without the notify, the store kept isAuthenticated=true
  // after the tokens were wiped and the app sat on dead screens where every
  // request 401'd until the user force-closed it.
  const settled = refreshInFlight;
  settled
    .catch(async (err) => {
      if (isUnrecoverableAuthFailure(err)) {
        await tokenStore.clearTokens();
        notifySessionExpired();
      }
    })
    .then(() => {
      if (refreshInFlight === settled) refreshInFlight = null;
    });

  return refreshInFlight;
}

/**
 * Refresh the access token using the in-memory/SecureStore refresh token (native)
 * or the httpOnly refresh cookie (web), update tokenStore, and return the new
 * access token — or null if the refresh failed.
 *
 * Shared so non-axios callers can recover from a 401 the same way the response
 * interceptor does. The in-app bug reporter and the media uploads post via raw
 * `fetch` (axios mangles RN multipart), which means they bypass the 401-refresh
 * interceptor below; they use this helper to refresh-and-retry instead.
 */
export async function refreshAccessToken(): Promise<string | null> {
  try {
    return await refreshOnce();
  } catch {
    return null;
  }
}

// Request interceptor: attach Bearer token
api.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const token = tokenStore.getAccessToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }

  // Let axios set Content-Type for FormData
  if (config.data instanceof FormData) {
    delete config.headers['Content-Type'];
  }

  // Stamp start time so the diagnostics interceptor can measure duration.
  (config as InternalAxiosRequestConfig & { _startTime?: number })._startTime = Date.now();

  return config;
});

// Transient-failure retry: ONE retry on a brief backend-unavailability blip
// (network error / timeout / 502 / 503 / 504) for idempotent requests only.
// These come from short worker-restart / memory-spike windows on the 512MB
// prod instance — not a real client error — so a single short-delayed retry
// usually recovers silently. Registered BEFORE the diagnostics/reportApiError
// interceptor below so a recovered request never reaches Sentry (keeps the
// 5xx/network blips out of the error stream too). Only GET/HEAD are retried;
// POST/PUT/PATCH/DELETE are never auto-repeated (could double-write).
const RETRIABLE_STATUSES = new Set([502, 503, 504]);
const IDEMPOTENT_METHODS = new Set(['get', 'head']);

export function isRetriableTransient(error: AxiosError): boolean {
  if (axios.isCancel(error)) return false;
  const method = (error.config?.method || 'get').toLowerCase();
  if (!IDEMPOTENT_METHODS.has(method)) return false;
  const status = error.response?.status;
  // No response → network error or timeout (request never completed). Retriable.
  if (status === undefined) return true;
  return RETRIABLE_STATUSES.has(status);
}

api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const cfg = error.config as
      | (InternalAxiosRequestConfig & { _transientRetried?: boolean })
      | undefined;
    if (!cfg || cfg._transientRetried || !isRetriableTransient(error)) {
      return Promise.reject(error);
    }
    cfg._transientRetried = true;
    // Brief backoff so a worker mid-restart has a moment to come back up.
    await new Promise((resolve) => setTimeout(resolve, 600));
    return api(cfg);
  },
);

// Diagnostics interceptor: record recent API calls (metadata only, never bodies)
// for the in-app bug reporter. Runs before the refresh interceptor below.
function logApiCall(config: InternalAxiosRequestConfig | undefined, status: number | null) {
  if (!config) return;
  const start = (config as InternalAxiosRequestConfig & { _startTime?: number })._startTime;
  recordApiCall({
    method: (config.method || 'get').toUpperCase(),
    url: config.url || '',
    status,
    ms: start ? Date.now() - start : 0,
  });
}
// Statuses that are an expected, already-handled part of normal operation —
// reporting them just buries real crashes in noise:
//   401 → session churn, handled by the refresh interceptor below
//   403 → a permission the UI already guards (e.g. a non-parent hitting a
//         parent-only endpoint; the caller catches it and shows the right state)
//   404 → a missing optional resource (the caller treats it as "none")
// All three were the bulk of the Sentry noise (NODE-7 etc). Genuine contract
// bugs (400/405/409/422) and 5xx/network errors are still reported.
export const SILENCED_API_STATUSES = new Set([401, 403, 404]);

/**
 * Collapse a request path into a stable fingerprint key by replacing volatile
 * id segments (UUIDs, numeric ids) with ':id'. Without this, 5xx errors group
 * by Axios's shared native constructor frame — so every endpoint's 500s pile
 * into one meaningless "construct(native)" issue (the NODE-9 symptom). Grouping
 * by `METHOD /api/learning-events/:id` instead gives one actionable issue each.
 */
export function fingerprintPath(url?: string): string {
  if (!url) return 'unknown';
  return url
    .split('?')[0]
    .replace(/\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '/:id')
    .replace(/\/\d+/g, '/:id');
}

/**
 * Centrally report failed requests to Sentry so every API error is captured
 * automatically — no per-callsite `captureException` needed. This is the one
 * place all requests funnel through.
 *
 * - Expected/handled statuses (see SILENCED_API_STATUSES) and canceled
 *   requests are skipped — they're normal control flow, not defects.
 * - Network errors (no response) and 5xx are real exceptions → captureException,
 *   fingerprinted by endpoint so each failing route is its own issue.
 * - Other 4xx (400/405/409/422 — contract/validation bugs) are surfaced at
 *   `warning` level so they're visible without drowning out genuine crashes.
 */
export function reportApiError(error: AxiosError, status: number | null) {
  if (axios.isCancel(error)) return;
  if (status !== null && SILENCED_API_STATUSES.has(status)) return;
  const cfg = error.config;
  const method = cfg?.method?.toUpperCase();
  const extra = {
    method,
    url: cfg?.url,
    status,
    responseData: error.response?.data,
    message: error.message,
  };
  if (status === null || status >= 500) {
    captureException(error, {
      extra,
      // Group by endpoint, not by Axios's shared native error frame.
      fingerprint: ['api-error', method ?? 'UNKNOWN', fingerprintPath(cfg?.url), String(status ?? 'network')],
    });
  } else {
    // Fingerprint per endpoint+status (like the 5xx branch) so 4xx warnings
    // don't all collapse into one meaningless "captureMessage" bucket (NODE-7).
    captureMessage(`API ${status} ${method} ${fingerprintPath(cfg?.url)}`, {
      level: 'warning',
      extra,
      fingerprint: ['api-warning', method ?? 'UNKNOWN', fingerprintPath(cfg?.url), String(status)],
    });
  }
}

api.interceptors.response.use(
  (response: AxiosResponse) => {
    logApiCall(response.config, response.status);
    return response;
  },
  (error: AxiosError) => {
    const status = error.response?.status ?? null;
    logApiCall(error.config, status);
    reportApiError(error, status);
    const holdCode = (error.response?.data as { code?: string } | undefined)?.code;
    if (status === 403 && holdCode === 'phone_verification_required') {
      notifyPhoneVerificationRequired();
    }
    if (status === 403 && holdCode === 'signature_required') {
      notifySignatureRequired();
    }
    return Promise.reject(error);
  }
);

// ── The phone-verification hold ──────────────────────────────────────────────
// An org can require its adults to verify a phone number by SMS before using
// Optio, enforced in Flask middleware, so a held adult 403s on everything but
// /api/auth/*. That reads here as every screen failing at once, and 403 is a
// SILENCED_API_STATUS, so it is silent in Sentry too. The interceptor above
// spots the marker and PhoneVerificationHost puts a screen in front of it.
// Listeners, not a store, because this must not import the store into the API
// client (the store imports this module).
type PhoneHoldListener = () => void;
const phoneHoldListeners = new Set<PhoneHoldListener>();

function notifyPhoneVerificationRequired(): void {
  phoneHoldListeners.forEach((fn) => {
    try {
      fn();
    } catch {
      // A listener that throws must not swallow the original API error.
    }
  });
}

/** Subscribe to "this account is held for phone verification". Returns an
 *  unsubscribe, so it drops straight into a useEffect. */
export function onPhoneVerificationRequired(fn: PhoneHoldListener): () => void {
  phoneHoldListeners.add(fn);
  return () => {
    phoneHoldListeners.delete(fn);
  };
}

// ── The paperwork (signature) hold ───────────────────────────────────────────
// A school can send a family a document marked REQUIRED; until the guardian
// signs it they 403 with `signature_required` on everything except /api/auth/*
// and the signing flow (backend/middleware/signature_gate.py). Signing only
// exists on the web app, so PaperworkHost puts a screen in front of the app
// pointing them there. Same listener shape as the phone hold above, for the
// same import-cycle reason.
const signatureHoldListeners = new Set<PhoneHoldListener>();

function notifySignatureRequired(): void {
  signatureHoldListeners.forEach((fn) => {
    try {
      fn();
    } catch {
      // A listener that throws must not swallow the original API error.
    }
  });
}

/** Subscribe to "this account is held for unsigned required paperwork".
 *  Returns an unsubscribe, so it drops straight into a useEffect. */
export function onSignatureRequired(fn: PhoneHoldListener): () => void {
  signatureHoldListeners.add(fn);
  return () => {
    signatureHoldListeners.delete(fn);
  };
}

// ── Session expiry ───────────────────────────────────────────────────────────
// Fired (once per failed refresh, from refreshOnce's settle handler) when the
// backend has genuinely ended the session — revoked token family, expired
// refresh token. Listeners, not a store import, for the same reason as the
// phone-verification hold above: the auth store imports this module.
type SessionExpiredListener = () => void;
const sessionExpiredListeners = new Set<SessionExpiredListener>();

function notifySessionExpired(): void {
  sessionExpiredListeners.forEach((fn) => {
    try {
      fn();
    } catch {
      // A listener that throws must not stop the rest of the teardown.
    }
  });
}

/** Subscribe to "this session is dead and the tokens are gone". Returns an
 *  unsubscribe. The auth store uses this to flip to logged-out state so the
 *  auth gate redirects to login instead of leaving a frozen app. */
export function onSessionExpired(fn: SessionExpiredListener): () => void {
  sessionExpiredListeners.add(fn);
  return () => {
    sessionExpiredListeners.delete(fn);
  };
}

/**
 * Decide whether a failed token refresh should tear down the session.
 *
 * Only a *genuine* auth failure should log the user out:
 *   - the backend rejected /api/auth/refresh with 401/403 (refresh token
 *     invalid/expired), or
 *   - there was no refresh token to send at all (native session is gone).
 *
 * Everything else is recoverable and must NOT clear tokens: a network error
 * (no response), a timeout, or a 5xx (e.g. a Render cold start). Without this
 * guard a single 401 on a non-critical screen — tapping the notifications bell —
 * paired with a transient refresh hiccup would clear the tokens and bounce a
 * perfectly valid session to login. Leave the tokens in place so the next
 * request can recover.
 */
function isUnrecoverableAuthFailure(error: unknown): boolean {
  if (error instanceof Error && error.message === 'No refresh token') {
    return true;
  }
  const status = (error as AxiosError)?.response?.status;
  return status === 401 || status === 403;
}

// Response interceptor: auto-refresh on 401
api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as InternalAxiosRequestConfig & { _retry?: boolean };

    if (error.response?.status !== 401 || originalRequest._retry) {
      return Promise.reject(error);
    }

    // Don't retry refresh/login endpoints
    const url = originalRequest.url || '';
    if (url.includes('/auth/refresh') || url.includes('/auth/login')) {
      return Promise.reject(error);
    }

    originalRequest._retry = true;

    try {
      // Joins the refresh already running, if there is one, so a burst of 401s
      // costs one rotation rather than one per request.
      const newAccess = await refreshOnce();

      originalRequest.headers.Authorization = `Bearer ${newAccess}`;
      return api(originalRequest);
    } catch (refreshError) {
      // Session teardown (clear tokens + notify the auth store) happens once,
      // in refreshOnce's settle handler, and only when the refresh genuinely
      // failed because the credentials are invalid/expired — never on a
      // transient/recoverable error. This is what stops a flaky 401 (e.g. from
      // the notifications screen) from logging the user out.
      return Promise.reject(refreshError);
    }
  }
);

// ── API method collections ──

export const authAPI = {
  login: (email: string, password: string) =>
    api.post('/api/auth/login', { email, password }),
  register: (data: Record<string, unknown>) =>
    api.post('/api/auth/register', data),
  // Mobile email-confirmation OTP: user types the 6-digit code from the signup
  // email instead of opening the web link. Returns app tokens on success.
  verifyEmailOtp: (email: string, token: string) =>
    api.post('/api/auth/verify-email-otp', { email, token }),
  resendVerification: (email: string) =>
    api.post('/api/auth/resend-verification', { email }),
  me: () => api.get('/api/auth/me'),
  refresh: (refreshToken: string) =>
    api.post('/api/auth/refresh', { refresh_token: refreshToken }),
  logout: () => api.post('/api/auth/logout', {}),
  forgotPassword: (email: string) =>
    api.post('/api/auth/forgot-password', { email }),
  resetPassword: (token: string, newPassword: string) =>
    api.post('/api/auth/reset-password', { token, new_password: newPassword }),
  loginWithUsername: (slug: string, username: string, password: string) =>
    api.post(`/api/auth/login/org/${slug}`, { username, password }),
};

// OEA Diploma Plan (legacy internal name — the diploma program now run by Hearthwood Academy).
export const oeaAPI = {
  // The three fixed diploma pathway definitions for the selection UX.
  pathways: () => api.get('/api/oea/pathways'),
  // All enrollments managed by the acting parent.
  enrollments: () => api.get('/api/oea/enrollments'),
  // One student's current enrollment (or null).
  studentEnrollment: (studentId: string) =>
    api.get(`/api/oea/enrollments/${studentId}`),
  // Select or change a student's diploma pathway.
  selectPathway: (studentId: string, pathwayKey: string) =>
    api.post('/api/oea/enrollments', { student_id: studentId, pathway_key: pathwayKey }),
  // Credits + computed pathway progress + GPA for a student.
  credits: (studentId: string) =>
    api.get(`/api/oea/students/${studentId}/credits`),
  // Add a course credit to a pathway requirement slot.
  addCredit: (studentId: string, body: Record<string, unknown>) =>
    api.post(`/api/oea/students/${studentId}/credits`, body),
  // Update a credit (rename / mark complete / grade / honors weighting).
  updateCredit: (creditId: string, body: Record<string, unknown>) =>
    api.patch(`/api/oea/credits/${creditId}`, body),
  deleteCredit: (creditId: string) =>
    api.delete(`/api/oea/credits/${creditId}`),
  // Evidence attached to a credit (text / link / file blocks).
  creditEvidence: (creditId: string) =>
    api.get(`/api/oea/credits/${creditId}/evidence`),
  addCreditEvidence: (creditId: string, body: Record<string, unknown>) =>
    api.post(`/api/oea/credits/${creditId}/evidence`, body),
  deleteCreditEvidence: (evidenceId: string) =>
    api.delete(`/api/oea/evidence/${evidenceId}`),
  // Upload a file and get back its stored URL (shared evidence upload endpoint).
  uploadEvidenceFile: (formData: FormData) =>
    api.post('/api/uploads/evidence', formData),
  // Ensure a credit has a linked student quest (creates one if missing); returns quest_id.
  ensureCreditQuest: (creditId: string) =>
    api.post(`/api/oea/credits/${creditId}/quest`, {}),
  // Record that the parent opened the getting-started video. External link, so
  // this is a click and not playback — fire and forget.
  markHelpVideoOpened: () => api.post('/api/oea/help-video/opened', {}),
};

export const questAPI = {
  list: () => api.get('/api/quests'),
  get: (id: string) => api.get(`/api/quests/${id}`),
  start: (id: string) => api.post(`/api/quests/${id}/enroll`, {}),
  tasks: (questId: string) => api.get(`/api/quests/${questId}/tasks`),
};

export const taskAPI = {
  complete: (id: string, data?: Record<string, unknown>) =>
    api.post(`/api/tasks/${id}/complete`, data || {}),
  create: (data: Record<string, unknown>) =>
    api.post('/api/tasks', data),
  delete: (id: string) => api.delete(`/api/tasks/${id}`),
};

export const userAPI = {
  profile: () => api.get('/api/users/profile'),
  updateProfile: (data: Record<string, unknown>) =>
    api.put('/api/users/profile', data),
  xp: () => api.get('/api/users/xp'),
  badges: () => api.get('/api/users/badges'),
};

export const bountyAPI = {
  list: (params?: Record<string, string>) =>
    api.get('/api/bounties', { params }),
  get: (id: string) =>
    api.get(`/api/bounties/${id}`),
  create: (data: Record<string, unknown>) =>
    api.post('/api/bounties', data),
  update: (id: string, data: Record<string, unknown>) =>
    api.put(`/api/bounties/${id}`, data),
  delete: (id: string) =>
    api.delete(`/api/bounties/${id}`),
  claim: (id: string) =>
    api.post(`/api/bounties/${id}/claim`, {}),
  abandon: (bountyId: string, claimId: string) =>
    api.delete(`/api/bounties/${bountyId}/claims/${claimId}`),
  myClaims: () =>
    api.get('/api/bounties/my-claims'),
  myPosted: () =>
    api.get('/api/bounties/my-posted'),
  toggleDeliverable: (bountyId: string, claimId: string, data: Record<string, unknown>) =>
    api.put(`/api/bounties/${bountyId}/claims/${claimId}/deliverables`, data),
  turnIn: (bountyId: string, claimId: string) =>
    api.post(`/api/bounties/${bountyId}/claims/${claimId}/turn-in`, {}),
  deleteEvidence: (bountyId: string, claimId: string, deliverableId: string, index: number) =>
    api.delete(`/api/bounties/${bountyId}/claims/${claimId}/evidence/${deliverableId}/${index}`),
  review: (bountyId: string, claimId: string, data: { decision: string; feedback?: string }) =>
    api.post(`/api/bounties/${bountyId}/review/${claimId}`, data),
  // AI drafting outlives the 15s global axios timeout (multi-second Gemini
  // call) — same override the quest task generator uses.
  aiDraft: (data: { prompt: string; child_id?: string | null; child_context?: string; reward_hint?: string }) =>
    api.post('/api/bounties/ai-draft', data, { timeout: 90000 }),
};

export interface BugReportContext {
  message: string;
  steps?: string;
  sentry_event_id?: string | null;
  [key: string]: unknown;
}

export const bugReportAPI = {
  /**
   * Submit a bug report. `context` is the diagnostics blob + user message;
   * `screenshot` is an optional native file ({ uri, name, type }).
   */
  submit: async (context: BugReportContext, screenshot?: { uri: string; name: string; type: string } | null) => {
    // Build a fresh FormData per attempt: RN consumes the multipart body when it
    // sends, so a retry needs its own instance.
    const buildForm = () => {
      const form = new FormData();
      form.append('context', JSON.stringify(context));
      if (screenshot) {
        // React Native FormData accepts the { uri, name, type } file shape.
        form.append('screenshot', screenshot as unknown as Blob);
      }
      return form;
    };
    // NOTE: deliberately NOT axios. On React Native, posting FormData through
    // axios fails at the transport layer with ERR_NETWORK ("Network Error",
    // no status) — the request never leaves the device. RN's own fetch handles
    // multipart boundaries correctly (the same reason signedUpload uses XHR).
    // We attach the Bearer token manually and let fetch set Content-Type.
    const doFetch = (token: string | null) =>
      fetch(`${API_URL}/api/bug-reports`, {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        body: buildForm(),
        credentials: Platform.OS === 'web' ? 'include' : 'omit',
      });

    let res = await doFetch(tokenStore.getAccessToken());

    // This raw-fetch path bypasses the axios 401-refresh interceptor, so handle
    // refresh here. The iOS failure mode (Sentry NODE-B): the in-memory access
    // token expired while the app sat in the foreground, the report 401'd, and
    // with no refresh-and-retry the user just saw "Could not send". Refresh once
    // and retry before giving up.
    if (res.status === 401) {
      const refreshed = await refreshAccessToken();
      if (refreshed) {
        res = await doFetch(refreshed);
      }
    }

    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      const err = new Error(`Bug report failed (${res.status}) ${detail}`.trim()) as Error & {
        response?: { status: number };
      };
      err.response = { status: res.status };
      throw err;
    }
    return res.json().catch(() => ({}));
  },
};

/**
 * Upload a profile picture for a child (dependent or linked student).
 *
 * Deliberately uses raw fetch, not axios: on React Native, posting FormData
 * through axios fails at the transport layer with ERR_NETWORK (the request
 * never leaves the device) — the same reason bugReportAPI.submit and
 * signedUpload avoid axios for multipart. We attach the Bearer token manually,
 * let fetch set the multipart Content-Type/boundary, and refresh-and-retry once
 * on 401 (this path bypasses the axios 401 interceptor).
 */
export async function uploadChildAvatar(
  childId: string,
  file: { uri: string; name: string; type: string },
): Promise<{ avatar_url?: string }> {
  // Fresh FormData per attempt — RN consumes the multipart body on send, so a
  // retry needs its own instance.
  const doFetch = (token: string | null) => {
    const form = new FormData();
    form.append('avatar', file as unknown as Blob);
    return fetch(`${API_URL}/api/parent/child/${childId}/avatar`, {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      body: form,
      credentials: Platform.OS === 'web' ? 'include' : 'omit',
    });
  };

  let res = await doFetch(tokenStore.getAccessToken());
  if (res.status === 401) {
    const refreshed = await refreshAccessToken();
    if (refreshed) res = await doFetch(refreshed);
  }

  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    const err = new Error(`Avatar upload failed (${res.status}) ${detail}`.trim()) as Error & {
      response?: { status: number; data?: any };
    };
    err.response = { status: res.status };
    try { err.response.data = JSON.parse(detail); } catch { /* non-JSON body */ }
    throw err;
  }
  return res.json().catch(() => ({}));
}

/** Attachment metadata returned by POST /api/messages/attachments and stored
 *  on messages. `type` drives rendering (image thumbnail vs tappable chip). */
export interface MessageAttachment {
  url: string;
  type: 'image' | 'video' | 'audio' | 'file';
  name: string;
  size: number;
}

export interface SendMessageExtras {
  reply_to_message_id?: string;
  attachments?: MessageAttachment[];
}

export const messageAPI = {
  conversations: () => api.get('/api/messages/conversations'),
  messages: (conversationId: string, limit = 50, offset = 0) =>
    api.get(`/api/messages/conversations/${conversationId}`, { params: { limit, offset } }),
  send: (targetUserId: string, content: string, extras: SendMessageExtras = {}) =>
    api.post(`/api/messages/conversations/${targetUserId}/send`, { content, ...extras }),
  // Messaging overhaul: reactions, edit, delete (soft) on DMs.
  toggleReaction: (messageId: string, emoji: string) =>
    api.post(`/api/messages/${messageId}/reactions`, { emoji }),
  editMessage: (messageId: string, content: string) =>
    api.patch(`/api/messages/${messageId}`, { content }),
  deleteMessage: (messageId: string) =>
    api.delete(`/api/messages/${messageId}`),
  markRead: (messageId: string) =>
    api.put(`/api/messages/${messageId}/read`, {}),
  // Superadmin only: hand a support-thread message off to the sender's school inbox.
  forwardToSchool: (messageId: string) =>
    api.post(`/api/messages/${messageId}/forward-to-school`, {}),
  unreadCount: () => api.get('/api/messages/unread-count'),
  contacts: () => api.get('/api/messages/contacts'),
  canMessage: (targetUserId: string) =>
    api.get(`/api/messages/can-message/${targetUserId}`),
  // Parent (or superadmin) read-only access to a child's message history.
  children: () => api.get('/api/messages/children'),
  childConversations: (childId: string) =>
    api.get(`/api/messages/children/${childId}/conversations`),
  childConversationMessages: (childId: string, conversationId: string) =>
    api.get(`/api/messages/children/${childId}/conversations/${conversationId}`),
};

export const groupAPI = {
  list: () => api.get('/api/groups'),
  get: (groupId: string) => api.get(`/api/groups/${groupId}`),
  create: (data: { name: string; description?: string; member_ids?: string[] }) =>
    api.post('/api/groups', data),
  update: (groupId: string, data: { name?: string; description?: string }) =>
    api.put(`/api/groups/${groupId}`, data),
  delete: (groupId: string) =>
    api.delete(`/api/groups/${groupId}`),
  addMember: (groupId: string, userId: string) =>
    api.post(`/api/groups/${groupId}/members`, { user_id: userId }),
  removeMember: (groupId: string, userId: string) =>
    api.delete(`/api/groups/${groupId}/members/${userId}`),
  leave: (groupId: string) =>
    api.post(`/api/groups/${groupId}/leave`, {}),
  messages: (groupId: string, limit = 50, offset = 0) =>
    api.get(`/api/groups/${groupId}/messages`, { params: { limit, offset } }),
  sendMessage: (groupId: string, content: string, extras: SendMessageExtras = {}) =>
    api.post(`/api/groups/${groupId}/messages`, { content, ...extras }),
  // Messaging overhaul: reactions, edit/delete, pin, announcement-only.
  toggleReaction: (groupId: string, messageId: string, emoji: string) =>
    api.post(`/api/groups/${groupId}/messages/${messageId}/reactions`, { emoji }),
  editMessage: (groupId: string, messageId: string, content: string) =>
    api.patch(`/api/groups/${groupId}/messages/${messageId}`, { content }),
  deleteMessage: (groupId: string, messageId: string) =>
    api.delete(`/api/groups/${groupId}/messages/${messageId}`),
  pin: (groupId: string, messageId: string | null) =>
    api.post(`/api/groups/${groupId}/pin`, { message_id: messageId }),
  updateSettings: (groupId: string, settings: { announcement_only: boolean }) =>
    api.patch(`/api/groups/${groupId}/settings`, settings),
  markRead: (groupId: string) =>
    api.post(`/api/groups/${groupId}/read`, {}),
  availableMembers: (groupId: string) =>
    api.get(`/api/groups/${groupId}/available-members`),
};

/**
 * Upload a message attachment (photo/video from the library) to
 * POST /api/messages/attachments and get back `{url, type, name, size}` for
 * inclusion in a send call.
 *
 * Same raw-fetch pattern as uploadChildAvatar: axios mangles RN multipart
 * bodies, so we attach the Bearer token manually, let fetch set the multipart
 * boundary, and refresh-and-retry once on 401.
 */
export async function uploadMessageAttachment(
  file: { uri: string; name: string; type: string },
): Promise<MessageAttachment> {
  // Fresh FormData per attempt — RN consumes the multipart body on send.
  const buildForm = async () => {
    const form = new FormData();
    if (Platform.OS === 'web') {
      // Web (dev/preview): the picker returns a blob/data URL, not a file path.
      const blob = await (await fetch(file.uri)).blob();
      form.append('file', blob, file.name);
    } else {
      // React Native FormData accepts the { uri, name, type } file shape.
      form.append('file', file as unknown as Blob);
    }
    return form;
  };
  const doFetch = async (token: string | null) =>
    fetch(`${API_URL}/api/messages/attachments`, {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      body: await buildForm(),
      credentials: Platform.OS === 'web' ? 'include' : 'omit',
    });

  let res = await doFetch(tokenStore.getAccessToken());
  if (res.status === 401) {
    const refreshed = await refreshAccessToken();
    if (refreshed) res = await doFetch(refreshed);
  }

  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(
      body?.error || body?.message || `Attachment upload failed (${res.status})`,
    ) as Error & { response?: { status: number; data?: any } };
    err.response = { status: res.status, data: body };
    throw err;
  }
  const d = body?.data || body;
  return d.attachment as MessageAttachment;
}

export default api;
