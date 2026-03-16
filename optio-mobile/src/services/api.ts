/**
 * API Client - Axios instance configured for Optio backend.
 *
 * Uses token-based auth (stored in expo-secure-store).
 * Matches web frontend patterns (interceptors, error handling).
 */

import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios';
import * as SecureStore from 'expo-secure-store';

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

// Request interceptor: attach auth token
api.interceptors.request.use(
  async (config: InternalAxiosRequestConfig) => {
    const token = await SecureStore.getItemAsync('access_token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
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
      const refreshToken = await SecureStore.getItemAsync('refresh_token');
      if (refreshToken) {
        try {
          const refreshResponse = await axios.post(`${API_BASE_URL}/api/auth/refresh`, {}, {
            headers: { Authorization: `Bearer ${refreshToken}` },
          });

          const { access_token, refresh_token } = refreshResponse.data;
          await SecureStore.setItemAsync('access_token', access_token);
          if (refresh_token) {
            await SecureStore.setItemAsync('refresh_token', refresh_token);
          }

          // Retry original request
          if (error.config) {
            error.config.headers.Authorization = `Bearer ${access_token}`;
            return api(error.config);
          }
        } catch {
          // Refresh failed - force logout
          await SecureStore.deleteItemAsync('access_token');
          await SecureStore.deleteItemAsync('refresh_token');
        }
      }
    }
    return Promise.reject(error);
  },
);

export default api;
export { API_BASE_URL };
