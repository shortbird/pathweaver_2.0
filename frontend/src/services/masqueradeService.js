/**
 * Masquerade Service
 * Handles admin masquerade sessions (viewing platform as another user)
 */

import { tokenStore } from './api.js';
import logger from '../utils/logger';

const MASQUERADE_STORAGE_KEY = 'masquerade_state';
const ADMIN_TOKEN_STORAGE_KEY = 'original_admin_token';

/**
 * Get current masquerade state from localStorage
 */
export const getMasqueradeState = () => {
  try {
    const state = localStorage.getItem(MASQUERADE_STORAGE_KEY);
    return state ? JSON.parse(state) : null;
  } catch (error) {
    console.error('Error getting masquerade state:', error);
    return null;
  }
};

/**
 * Check if currently masquerading
 */
export const isMasquerading = () => {
  return getMasqueradeState() !== null;
};

/**
 * Start masquerade session
 * @param {string} userId - Target user ID to masquerade as
 * @param {string} reason - Optional reason for masquerade (for audit log)
 * @param {Function} apiCall - API function to call masquerade endpoint
 * @returns {Promise<{success: boolean, targetUser: object, error?: string}>}
 */
export const startMasquerade = async (userId, reason = '', apiCall) => {
  try {
    // Store current admin token before masquerading
    const currentToken = tokenStore.getAccessToken();
    const currentRefreshToken = tokenStore.getRefreshToken();

    if (currentToken) {
      localStorage.setItem(ADMIN_TOKEN_STORAGE_KEY, JSON.stringify({
        access_token: currentToken,
        refresh_token: currentRefreshToken
      }));
      logger.debug('[Masquerade] Backed up admin tokens before masquerading');
    }

    // Call masquerade API
    const response = await apiCall.post(`/api/admin/masquerade/${userId}`, {
      reason
    });

    const { masquerade_token, log_id, target_user } = response.data;

    // Store masquerade token using tokenStore, preserving refresh token for page refresh persistence
    // This matches the pattern used by ActingAsContext which works correctly
    const existingRefreshToken = tokenStore.getRefreshToken() || currentRefreshToken;
    await tokenStore.setTokens(masquerade_token, existingRefreshToken);
    logger.debug('[Masquerade] Masquerade token stored in tokenStore with refresh token');

    // Store masquerade state
    const masqueradeState = {
      is_masquerading: true,
      admin_id: null, // Will be determined by backend from token
      target_user: target_user,
      log_id: log_id,
      started_at: new Date().toISOString()
    };

    localStorage.setItem(MASQUERADE_STORAGE_KEY, JSON.stringify(masqueradeState));
    logger.debug('[Masquerade] Started masquerading as:', target_user.display_name || target_user.email);

    // CRITICAL FIX: Force full page reload to clear React Query cache
    // Without this, cached data from admin session shows instead of target user data
    // Redirect to dashboard based on target user's role
    const targetRole = target_user.role;
    const redirectPath = targetRole === 'parent' ? '/parent/dashboard' : '/dashboard';
    window.location.href = redirectPath;

    // This return won't be reached due to page redirect, but keep for type safety
    return {
      success: true,
      targetUser: target_user
    };
  } catch (error) {
    console.error('[Masquerade] Error starting masquerade:', error);

    // Restore original token if masquerade failed
    const originalTokens = localStorage.getItem(ADMIN_TOKEN_STORAGE_KEY);
    if (originalTokens) {
      const { access_token, refresh_token } = JSON.parse(originalTokens);
      await tokenStore.setTokens(access_token, refresh_token);
      localStorage.removeItem(ADMIN_TOKEN_STORAGE_KEY);
      logger.debug('[Masquerade] Restored admin tokens after failed masquerade attempt');
    }

    return {
      success: false,
      error: error.response?.data?.error || 'Failed to start masquerade session'
    };
  }
};

/**
 * Exit masquerade session and restore admin identity
 * @param {Function} apiCall - API function to call exit masquerade endpoint
 * @returns {Promise<{success: boolean, adminUser: object, error?: string}>}
 */
export const exitMasquerade = async (apiCall) => {
  try {
    // Call exit masquerade API
    const response = await apiCall.post('/api/admin/masquerade/exit', {});

    const { access_token, refresh_token, user: adminUser } = response.data;

    // Restore admin tokens using tokenStore
    await tokenStore.setTokens(access_token, refresh_token);
    logger.debug('[Masquerade] Admin tokens restored from backend response');

    // Clear masquerade state
    localStorage.removeItem(MASQUERADE_STORAGE_KEY);
    localStorage.removeItem(ADMIN_TOKEN_STORAGE_KEY);
    logger.debug('[Masquerade] Exited masquerade session, returned to admin identity');

    return {
      success: true,
      adminUser: adminUser
    };
  } catch (error) {
    console.error('[Masquerade] Error exiting masquerade:', error);

    // Fallback: Try to restore from stored admin token
    const originalTokens = localStorage.getItem(ADMIN_TOKEN_STORAGE_KEY);
    if (originalTokens) {
      const { access_token, refresh_token } = JSON.parse(originalTokens);
      await tokenStore.setTokens(access_token, refresh_token);
      localStorage.removeItem(MASQUERADE_STORAGE_KEY);
      localStorage.removeItem(ADMIN_TOKEN_STORAGE_KEY);
      logger.debug('[Masquerade] Restored admin tokens from backup after exit error');

      // Force page reload to refresh with admin token
      window.location.href = '/admin/users';
      return { success: true };
    }

    return {
      success: false,
      error: error.response?.data?.error || 'Failed to exit masquerade session'
    };
  }
};

/**
 * Check masquerade status with backend
 * @param {Function} apiCall - API function to call status endpoint
 * @returns {Promise<{is_masquerading: boolean, target_user?: object}>}
 */
export const checkMasqueradeStatus = async (apiCall) => {
  try {
    const response = await apiCall.get('/api/admin/masquerade/status');
    return response.data;
  } catch (error) {
    console.error('Error checking masquerade status:', error);
    return { is_masquerading: false };
  }
};

/**
 * Clear all masquerade data (for logout)
 */
export const clearMasqueradeData = () => {
  try {
    // Clear masquerade state
    localStorage.removeItem(MASQUERADE_STORAGE_KEY);
    localStorage.removeItem(ADMIN_TOKEN_STORAGE_KEY);

    // CRITICAL FIX: Also clear any active masquerade tokens from tokenStore
    // This prevents the masquerade token from being restored on page refresh
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');

    logger.debug('[Masquerade] Cleared masquerade data and tokens');

    // Verify cleanup
    const accessToken = localStorage.getItem('access_token');
    const refreshToken = localStorage.getItem('refresh_token');
    const masqueradeState = localStorage.getItem(MASQUERADE_STORAGE_KEY);
    const adminToken = localStorage.getItem(ADMIN_TOKEN_STORAGE_KEY);

    if (accessToken || refreshToken || masqueradeState || adminToken) {
      console.error('[Masquerade] CRITICAL: Tokens still exist after clearing!', {
        hasAccess: !!accessToken,
        hasRefresh: !!refreshToken,
        hasMasqueradeState: !!masqueradeState,
        hasAdminToken: !!adminToken
      });
    }
  } catch (error) {
    console.error('[Masquerade] Error clearing masquerade data:', error);
  }
};
