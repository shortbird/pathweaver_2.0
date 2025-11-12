/**
 * Masquerade Service
 * Handles admin masquerade sessions (viewing platform as another user)
 */

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
    const currentToken = localStorage.getItem('app_access_token');
    const currentRefreshToken = localStorage.getItem('app_refresh_token');

    if (currentToken) {
      localStorage.setItem(ADMIN_TOKEN_STORAGE_KEY, JSON.stringify({
        access_token: currentToken,
        refresh_token: currentRefreshToken
      }));
    }

    // Call masquerade API
    const response = await apiCall.post(`/api/admin/masquerade/${userId}`, {
      reason
    });

    const { masquerade_token, log_id, target_user } = response.data;

    // Store masquerade token
    localStorage.setItem('app_access_token', masquerade_token);

    // Store masquerade state
    const masqueradeState = {
      is_masquerading: true,
      admin_id: null, // Will be determined by backend from token
      target_user: target_user,
      log_id: log_id,
      started_at: new Date().toISOString()
    };

    localStorage.setItem(MASQUERADE_STORAGE_KEY, JSON.stringify(masqueradeState));

    return {
      success: true,
      targetUser: target_user
    };
  } catch (error) {
    console.error('Error starting masquerade:', error);

    // Restore original token if masquerade failed
    const originalTokens = localStorage.getItem(ADMIN_TOKEN_STORAGE_KEY);
    if (originalTokens) {
      const { access_token, refresh_token } = JSON.parse(originalTokens);
      localStorage.setItem('app_access_token', access_token);
      if (refresh_token) {
        localStorage.setItem('app_refresh_token', refresh_token);
      }
      localStorage.removeItem(ADMIN_TOKEN_STORAGE_KEY);
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

    // Restore admin tokens
    localStorage.setItem('app_access_token', access_token);
    if (refresh_token) {
      localStorage.setItem('app_refresh_token', refresh_token);
    }

    // Clear masquerade state
    localStorage.removeItem(MASQUERADE_STORAGE_KEY);
    localStorage.removeItem(ADMIN_TOKEN_STORAGE_KEY);

    return {
      success: true,
      adminUser: adminUser
    };
  } catch (error) {
    console.error('Error exiting masquerade:', error);

    // Fallback: Try to restore from stored admin token
    const originalTokens = localStorage.getItem(ADMIN_TOKEN_STORAGE_KEY);
    if (originalTokens) {
      const { access_token, refresh_token } = JSON.parse(originalTokens);
      localStorage.setItem('app_access_token', access_token);
      if (refresh_token) {
        localStorage.setItem('app_refresh_token', refresh_token);
      }
      localStorage.removeItem(MASQUERADE_STORAGE_KEY);
      localStorage.removeItem(ADMIN_TOKEN_STORAGE_KEY);

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
  localStorage.removeItem(MASQUERADE_STORAGE_KEY);
  localStorage.removeItem(ADMIN_TOKEN_STORAGE_KEY);
};
