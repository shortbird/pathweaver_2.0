/**
 * API Client - Axios instance with Bearer token auth.
 *
 * Uses Authorization headers only (no cookies).
 * Token refresh handled automatically on 401.
 */

import axios, { AxiosError, AxiosResponse, InternalAxiosRequestConfig } from 'axios';
import { Platform } from 'react-native';
import { tokenStore } from './tokenStore';
import { postRefreshWithRetry } from './refreshRetry';
import { recordApiCall } from './diagnostics';
import { captureException, captureMessage } from './sentry';

// In dev (no EXPO_PUBLIC_API_URL set), web hits localhost and native hits a
// platform-appropriate host loopback / LAN IP:
//   - Web              → http://localhost:5001 (browser on the dev machine)
//   - iOS simulator    → LAN IP (sim shares the host's network)
//   - Android emulator → 10.0.2.2:5001 (Android emulator can't see the host's
//     LAN IP from inside the VM; 10.0.2.2 is the magic alias that points back
//     to the host loopback)
//   - Physical device  → set EXPO_PUBLIC_API_URL explicitly (or override LAN IP)
//
// In production builds, EAS injects EXPO_PUBLIC_API_URL=https://api.optioeducation.com.
// If the env var is missing in a native production build we fall back to prod rather
// than a dev URL, so a bad build can't accidentally target a developer's laptop.
const isDev = (typeof __DEV__ !== 'undefined' && __DEV__);
const DEV_LAN_IP = 'http://192.168.86.10:5001';
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

// Track refresh state to prevent concurrent refreshes
let isRefreshing = false;
let refreshQueue: Array<{
  resolve: (token: string) => void;
  reject: (error: unknown) => void;
}> = [];

function processQueue(error: unknown, token: string | null) {
  refreshQueue.forEach(({ resolve, reject }) => {
    if (error) reject(error);
    else if (token) resolve(token);
  });
  refreshQueue = [];
}

/**
 * Refresh the access token using the in-memory/SecureStore refresh token (native)
 * or the httpOnly refresh cookie (web), update tokenStore, and return the new
 * access token — or null if the refresh failed.
 *
 * Shared so non-axios callers can recover from a 401 the same way the response
 * interceptor does. The in-app bug reporter posts via raw `fetch` (axios mangles
 * RN multipart), which means it bypasses the 401-refresh interceptor below; it
 * uses this helper to refresh-and-retry instead.
 */
export async function refreshAccessToken(): Promise<string | null> {
  try {
    const refreshToken = tokenStore.getRefreshToken();
    // Web relies on the httpOnly cookie (sent via withCredentials); native must
    // have a refresh token in SecureStore.
    if (!refreshToken && Platform.OS !== 'web') {
      return null;
    }
    const body = refreshToken ? { refresh_token: refreshToken } : {};
    const { data } = await postRefreshWithRetry(body, {
      post: (path, b) => api.post(path, b),
    });
    const newAccess = data.access_token;
    const newRefresh = data.refresh_token;
    await tokenStore.setTokens(newAccess, newRefresh);
    return newAccess;
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
const SILENCED_API_STATUSES = new Set([401, 403, 404]);

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
function reportApiError(error: AxiosError, status: number | null) {
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
    return Promise.reject(error);
  }
);

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

    if (isRefreshing) {
      // Queue this request until refresh completes
      return new Promise((resolve, reject) => {
        refreshQueue.push({
          resolve: (token: string) => {
            originalRequest.headers.Authorization = `Bearer ${token}`;
            resolve(api(originalRequest));
          },
          reject,
        });
      });
    }

    originalRequest._retry = true;
    isRefreshing = true;

    try {
      const refreshToken = tokenStore.getRefreshToken();
      // Web has no in-memory refresh token after reload — backend reads it from the
      // httpOnly cookie sent via withCredentials. Native must have it in SecureStore.
      if (!refreshToken && Platform.OS !== 'web') {
        throw new Error('No refresh token');
      }

      // E4: single jittered retry on transient refresh failure (network blip,
      // 502 from Render cold start). A second 4xx still fails fast.
      const body = refreshToken ? { refresh_token: refreshToken } : {};
      const { data } = await postRefreshWithRetry(body, {
        post: (path, b) => api.post(path, b),
      });

      const newAccess = data.access_token;
      const newRefresh = data.refresh_token;
      await tokenStore.setTokens(newAccess, newRefresh);

      processQueue(null, newAccess);

      originalRequest.headers.Authorization = `Bearer ${newAccess}`;
      return api(originalRequest);
    } catch (refreshError) {
      processQueue(refreshError, null);
      // Tear down the session only when the refresh genuinely failed because the
      // credentials are invalid/expired — never on a transient/recoverable error.
      // This is what stops a flaky 401 (e.g. from the notifications screen) from
      // logging the user out.
      if (isUnrecoverableAuthFailure(refreshError)) {
        await tokenStore.clearTokens();
      }
      return Promise.reject(refreshError);
    } finally {
      isRefreshing = false;
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

// OEA Diploma Plan (OpenEd Academy partner integration).
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
  uploadEvidence: (formData: FormData) =>
    api.post('/api/uploads/evidence', formData),
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

export const messageAPI = {
  conversations: () => api.get('/api/messages/conversations'),
  messages: (conversationId: string, limit = 50, offset = 0) =>
    api.get(`/api/messages/conversations/${conversationId}`, { params: { limit, offset } }),
  send: (targetUserId: string, content: string) =>
    api.post(`/api/messages/conversations/${targetUserId}/send`, { content }),
  markRead: (messageId: string) =>
    api.put(`/api/messages/${messageId}/read`, {}),
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
  sendMessage: (groupId: string, content: string) =>
    api.post(`/api/groups/${groupId}/messages`, { content }),
  markRead: (groupId: string) =>
    api.post(`/api/groups/${groupId}/read`, {}),
  availableMembers: (groupId: string) =>
    api.get(`/api/groups/${groupId}/available-members`),
};

export default api;
