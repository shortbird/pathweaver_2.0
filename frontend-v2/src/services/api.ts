/**
 * API Client - Axios instance with Bearer token auth.
 *
 * Uses Authorization headers only (no cookies).
 * Token refresh handled automatically on 401.
 */

import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios';
import { Platform } from 'react-native';
import { tokenStore } from './tokenStore';
import { postRefreshWithRetry } from './refreshRetry';

const API_URL = Platform.select({
  web: process.env.EXPO_PUBLIC_API_URL || 'http://localhost:5001',
  default: process.env.EXPO_PUBLIC_API_URL || 'http://192.168.86.20:5001',
});

export const api = axios.create({
  baseURL: API_URL,
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

  return config;
});

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
      await tokenStore.clearTokens();
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
};

export const groupAPI = {
  list: () => api.get('/api/groups'),
  get: (groupId: string) => api.get(`/api/groups/${groupId}`),
  create: (data: { name: string; description?: string; member_ids?: string[] }) =>
    api.post('/api/groups', data),
  update: (groupId: string, data: { name?: string; description?: string }) =>
    api.put(`/api/groups/${groupId}`, data),
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
