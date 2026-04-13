/**
 * Masquerade Service
 * Handles admin masquerade sessions (viewing platform as another user)
 *
 * Security: No tokens are persisted to localStorage. The masquerade JWT lives
 * in tokenStore (memory + httpOnly cookie). Only non-sensitive UI state
 * (target user display info, log id) is cached in localStorage so the banner
 * can render immediately on reload; the backend is the source of truth.
 */

import { tokenStore } from './api.js';
import logger from '../utils/logger';

const MASQUERADE_STORAGE_KEY = 'masquerade_state';

/**
 * Get current masquerade UI state from localStorage
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
    const currentRefreshToken = tokenStore.getRefreshToken();

    const response = await apiCall.post(`/api/admin/masquerade/${userId}`, {
      reason
    });

    const { masquerade_token, log_id, target_user } = response.data;

    // Swap the active token to the masquerade JWT. Preserve the admin refresh
    // token so /exit can mint a fresh admin access token server-side.
    await tokenStore.setTokens(masquerade_token, currentRefreshToken || '');

    const masqueradeState = {
      is_masquerading: true,
      admin_id: null,
      target_user: target_user,
      log_id: log_id,
      started_at: new Date().toISOString()
    };

    localStorage.setItem(MASQUERADE_STORAGE_KEY, JSON.stringify(masqueradeState));
    logger.debug('[Masquerade] Started masquerading as:', `${target_user.first_name || ''} ${target_user.last_name || ''}`.trim() || target_user.display_name || target_user.email);

    // Force full page reload to clear React Query cache
    const targetRole = target_user.role;
    const redirectPath = targetRole === 'parent' ? '/parent/dashboard' : '/dashboard';
    window.location.href = redirectPath;

    return {
      success: true,
      targetUser: target_user
    };
  } catch (error) {
    console.error('[Masquerade] Error starting masquerade:', error);
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
    const response = await apiCall.post('/api/admin/masquerade/exit', {});

    const { access_token, refresh_token, user: adminUser } = response.data;

    await tokenStore.setTokens(access_token, refresh_token);
    localStorage.removeItem(MASQUERADE_STORAGE_KEY);
    logger.debug('[Masquerade] Exited masquerade session, returned to admin identity');

    return {
      success: true,
      adminUser: adminUser
    };
  } catch (error) {
    console.error('[Masquerade] Error exiting masquerade:', error);
    // Backend says we're not masquerading server-side — local state is stale.
    // Clear it so the banner disappears and the user lands back as themselves.
    if (error.response?.status === 400) {
      localStorage.removeItem(MASQUERADE_STORAGE_KEY);
      logger.debug('[Masquerade] Cleared stale local masquerade state (no active server session)');
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
    localStorage.removeItem(MASQUERADE_STORAGE_KEY);
    logger.debug('[Masquerade] Cleared masquerade UI state');
  } catch (error) {
    console.error('[Masquerade] Error clearing masquerade data:', error);
  }
};
