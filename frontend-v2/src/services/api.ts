/**
 * API Client - Axios instance with Bearer token auth.
 *
 * Uses Authorization headers only (no cookies).
 * Token refresh handled automatically on 401.
 */

import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios';
import { Platform } from 'react-native';
import { tokenStore } from './tokenStore';

const API_URL = Platform.select({
  web: process.env.EXPO_PUBLIC_API_URL || 'http://localhost:5001',
  default: process.env.EXPO_PUBLIC_API_URL || 'http://192.168.86.20:5001',
});

export const api = axios.create({
  baseURL: API_URL,
  headers: { 'Content-Type': 'application/json' },
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
      if (!refreshToken) throw new Error('No refresh token');

      const { data } = await api.post('/api/auth/refresh', {
        refresh_token: refreshToken,
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
  register: (data: { email: string; password: string; first_name: string; last_name: string }) =>
    api.post('/api/auth/register', data),
  me: () => api.get('/api/auth/me'),
  refresh: (refreshToken: string) =>
    api.post('/api/auth/refresh', { refresh_token: refreshToken }),
  logout: () => api.post('/api/auth/logout', {}),
  forgotPassword: (email: string) =>
    api.post('/api/auth/forgot-password', { email }),
  resetPassword: (token: string, password: string) =>
    api.post('/api/auth/reset-password', { token, password }),
};

export const questAPI = {
  list: () => api.get('/api/quests'),
  get: (id: string) => api.get(`/api/quests/${id}`),
  start: (id: string) => api.post(`/api/quests/${id}/start`, {}),
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

export default api;
