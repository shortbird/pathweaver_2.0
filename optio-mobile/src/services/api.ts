/**
 * API Client - Axios instance configured for Optio backend.
 *
 * Uses token-based auth (stored in expo-secure-store).
 * Matches web frontend patterns (interceptors, error handling).
 */

import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios';
import { storage } from '../utils/storage';

const API_BASE_URL = __DEV__
  ? 'http://localhost:5001'  // Local dev
  : 'https://optio-dev-backend.onrender.com';  // Dev server

const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 15000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor: attach auth token + handle FormData
api.interceptors.request.use(
  async (config: InternalAxiosRequestConfig) => {
    const token = await storage.getItem('access_token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    // Let React Native set Content-Type with boundary for FormData
    if (config.data instanceof FormData) {
      delete config.headers['Content-Type'];
    }
    return config;
  },
  (error: AxiosError) => Promise.reject(error),
);

// Response interceptor: handle 401 (token expired)
api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    if (error.response?.status === 401) {
      // Try to refresh token
      const refreshToken = await storage.getItem('refresh_token');
      if (refreshToken) {
        try {
          const refreshResponse = await axios.post(
            `${API_BASE_URL}/api/auth/refresh`,
            { refresh_token: refreshToken },
            { headers: { 'Content-Type': 'application/json' } },
          );

          const { access_token, refresh_token } = refreshResponse.data;
          await storage.setItem('access_token', access_token);
          if (refresh_token) {
            await storage.setItem('refresh_token', refresh_token);
          }

          // Retry original request
          if (error.config) {
            error.config.headers.Authorization = `Bearer ${access_token}`;
            return api(error.config);
          }
        } catch {
          // Refresh failed - force logout
          await storage.deleteItem('access_token');
          await storage.deleteItem('refresh_token');
        }
      }
    }
    return Promise.reject(error);
  },
);

export default api;
export { API_BASE_URL };
