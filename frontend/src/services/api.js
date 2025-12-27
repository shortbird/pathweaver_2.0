import axios from 'axios'
import { secureTokenStore } from './secureTokenStore'
import logger from '../utils/logger'

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:5000',
  headers: {
    'Content-Type': 'application/json',
  },
  // ✅ SECURITY FIX: Always send cookies for httpOnly authentication
  // Backend sets httpOnly cookies with SameSite=None and Secure=true for cross-origin support
  withCredentials: true,
})

// ✅ P0 SECURITY FIX (December 2024): Encrypted IndexedDB token storage
// - Replaced localStorage (XSS vulnerable) with encrypted IndexedDB
// - In-memory cache for synchronous access (fast)
// - IndexedDB for persistence across page refreshes (secure)
// - Safari/iOS compatible while maintaining security

// In-memory token storage (synchronous access for request interceptor)
let accessToken = null
let refreshToken = null

// Export token storage interface
export const tokenStore = {
  // Initialize secure token store (call once on app load)
  init: async () => {
    try {
      await secureTokenStore.init()
      logger.debug('[TokenStore] Secure token store initialized')
    } catch (error) {
      console.error('[TokenStore] Failed to initialize secure token store:', error)
    }
  },

  // Restore tokens from encrypted IndexedDB (for page refresh persistence)
  restoreTokens: async () => {
    try {
      const storedAccess = await secureTokenStore.getAccessToken()
      const storedRefresh = await secureTokenStore.getRefreshToken()

      if (storedAccess && storedRefresh) {
        accessToken = storedAccess
        refreshToken = storedRefresh
        logger.debug('[TokenStore] Tokens restored from encrypted IndexedDB')
        return true
      }
    } catch (error) {
      console.error('[TokenStore] Failed to restore tokens:', error)
    }
    return false
  },

  // Store tokens in memory and encrypted IndexedDB (for Safari/iOS compatibility)
  setTokens: async (access, refresh) => {
    // Store in memory for synchronous access
    accessToken = access
    refreshToken = refresh

    // Also store in encrypted IndexedDB for page refresh persistence
    try {
      await secureTokenStore.setTokens(access, refresh)
      logger.debug('[TokenStore] Tokens stored in memory and encrypted IndexedDB')
    } catch (error) {
      console.error('[TokenStore] Failed to store tokens in encrypted IndexedDB:', error)
    }
  },

  // Get access token from memory (synchronous for request interceptor)
  getAccessToken: () => accessToken,

  // Get refresh token from memory (synchronous for request interceptor)
  getRefreshToken: () => refreshToken,

  // Clear tokens from memory and encrypted IndexedDB
  clearTokens: async () => {
    // Clear from memory
    accessToken = null
    refreshToken = null

    // Clear from encrypted IndexedDB
    try {
      await secureTokenStore.clearTokens()
      logger.debug('[TokenStore] Tokens cleared from memory and encrypted IndexedDB')
    } catch (error) {
      console.error('[TokenStore] Failed to clear tokens from encrypted IndexedDB:', error)
    }

    // MIGRATION CLEANUP: Remove any old localStorage tokens
    try {
      localStorage.removeItem('access_token')
      localStorage.removeItem('refresh_token')
    } catch (error) {
      // Ignore errors - tokens may not exist in localStorage
    }
  }
}

// Helper function to get auth headers for fetch requests (backward compatibility)
export const getAuthHeaders = () => {
  const headers = {
    'Content-Type': 'application/json',
  }
  return headers
}

/**
 * Request Interceptor
 *
 * ✅ HYBRID AUTHENTICATION (January 2025): httpOnly cookies + token storage
 * - If tokens exist in memory (SPARK SSO): Add Authorization header
 * - Otherwise: Use httpOnly cookies (regular login)
 * - CSRF token added for state-changing requests
 */
api.interceptors.request.use(
  (config) => {
    // ✅ HYBRID AUTH: Use Authorization header if tokens available (SSO flow)
    // Otherwise rely on httpOnly cookies (regular login)
    const token = tokenStore.getAccessToken()
    if (token) {
      config.headers['Authorization'] = `Bearer ${token}`
    }

    // Add CSRF token for state-changing requests
    if (['post', 'put', 'delete', 'patch'].includes(config.method?.toLowerCase())) {
      const csrfToken = getCsrfToken()
      if (csrfToken) {
        config.headers['X-CSRF-Token'] = csrfToken
      }
    }

    // ✅ FILE UPLOAD FIX: Don't override Content-Type for FormData
    // Let Axios automatically set multipart/form-data with boundary
    if (config.data instanceof FormData) {
      delete config.headers['Content-Type']
    }

    return config
  },
  (error) => {
    return Promise.reject(error)
  }
)

// ✅ SECURITY FIX (P1-SEC-3): httpOnly CSRF token pattern
// - CSRF token stored in memory (not cookies)
// - Token fetched from API and sent in headers
// - Flask-WTF validates against httpOnly session cookie
let csrfToken = null

// Function to get CSRF token from memory
function getCsrfToken() {
  return csrfToken
}

// Function to set CSRF token in memory (called after fetching from API)
function setCsrfToken(token) {
  csrfToken = token
}

// Export CSRF token management
export const csrfTokenStore = {
  get: getCsrfToken,
  set: setCsrfToken,
  clear: () => { csrfToken = null }
}

/**
 * Response Interceptor - Token Refresh
 *
 * ✅ SECURITY FIX (January 2025): httpOnly cookies ONLY
 * - Token refresh handled via httpOnly cookies (no tokens in request/response)
 * - Backend automatically rotates tokens in cookies
 * - Frontend just retries failed requests after refresh
 */
let refreshPromise = null

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config

    // Handle 403 responses with consent_required flag for COPPA compliance
    // This triggers the ConsentBlockedOverlay component
    if (error.response?.status === 403 && error.response?.data?.consent_required) {
      // Emit a custom event that App.jsx can listen to
      window.dispatchEvent(new CustomEvent('consent-required', {
        detail: {
          consentStatus: error.response.data.consent_status,
          message: error.response.data.message
        }
      }))
      // Don't retry, just reject with the consent error
      return Promise.reject(error)
    }

    // Handle 401 responses by attempting token refresh
    // BUT: Don't refresh on login failures - those are genuine wrong credentials
    if (error.response?.status === 401 &&
        !originalRequest._retry &&
        !originalRequest.url?.includes('/auth/refresh') &&
        !originalRequest.url?.includes('/auth/login')) {
      originalRequest._retry = true

      try {
        // Only one refresh at a time - all concurrent requests wait for same promise
        if (!refreshPromise) {
          refreshPromise = (async () => {
            try {
              // ✅ SECURITY: httpOnly cookies sent automatically (withCredentials: true)
              // No tokens in request body - backend reads refresh token from cookie
              const response = await api.post('/api/auth/refresh', {})

              if (response.status === 200) {
                // Backend automatically sets new tokens in httpOnly cookies
                // No token handling needed in frontend
                return true // Refresh successful
              }
              throw new Error('Token refresh failed')
            } finally {
              // Clear promise after refresh completes (success or failure)
              refreshPromise = null
            }
          })()
        }

        // Wait for the single refresh to complete
        await refreshPromise

        // Retry the original request (new tokens automatically sent via cookies)
        return api(originalRequest)
      } catch (refreshError) {
        // Clear user data on refresh failure (tokens cleared by backend)
        localStorage.removeItem('user')

        // Only redirect to login if we're not already on auth pages or public pages
        const authPaths = ['/login', '/register', '/email-verification', '/forgot-password', '/reset-password', '/', '/terms', '/privacy', '/academy-agreement', '/academy-handbook', '/services']
        const currentPath = window.location.pathname
        const isPublicDiploma = currentPath.startsWith('/public/diploma/') || currentPath.startsWith('/portfolio/')
        const isPromoPage = currentPath.startsWith('/promo/') || currentPath === '/promo'
        const isConsultationPage = currentPath === '/consultation'
        const isDemoPage = currentPath === '/demo'
        const isQuestsPage = currentPath.startsWith('/quests') || currentPath.startsWith('/badges')

        if (!authPaths.includes(currentPath) && !isPublicDiploma && !isPromoPage && !isConsultationPage && !isDemoPage && !isQuestsPage) {
          window.location.href = '/login'
        }

        return Promise.reject(refreshError)
      }
    }

    return Promise.reject(error)
  }
)

// Friend management API methods
export const friendsAPI = {
  // Get all friends data including sent/received requests
  getFriends: () => api.get('/api/community/friends'),

  // Get friends' recent activity for activity feed
  getFriendsActivity: () => api.get('/api/community/friends/activity'),

  // Send friend request by email
  sendFriendRequest: (email) => api.post('/api/community/friends/request', { email }),

  // Accept incoming friend request
  acceptFriendRequest: (friendshipId) => api.post(`/api/community/friends/accept/${friendshipId}`, {}),

  // Decline incoming friend request
  declineFriendRequest: (friendshipId) => api.delete(`/api/community/friends/decline/${friendshipId}`),

  // Cancel sent friend request
  cancelFriendRequest: (friendshipId) => api.delete(`/api/community/friends/cancel/${friendshipId}`)
}

// Collaboration API removed in Phase 3 refactoring (January 2025)
// Team-up feature has been removed from the platform

// Observer API methods (extended family portfolio access)
export const observerAPI = {
  // Get list of linked observers for current student
  getMyObservers: () => api.get('/api/observers/my-observers'),

  // Send invitation to observer
  sendInvitation: (observerEmail, observerName, relationship) =>
    api.post('/api/observers/invite', { observer_email: observerEmail, observer_name: observerName, relationship }),

  // Get my sent invitations
  getMyInvitations: () => api.get('/api/observers/my-invitations'),

  // Cancel pending invitation
  cancelInvitation: (invitationId) => api.delete(`/api/observers/invitations/${invitationId}/cancel`)
}

// LMS Integration API methods
export const lmsAPI = {
  // Get list of supported LMS platforms
  getPlatforms: () => api.get('/api/lms/platforms'),

  // Get integration status for current user
  getIntegrationStatus: () => api.get('/api/lms/integration/status'),

  // Sync roster from OneRoster CSV (admin only)
  syncRoster: (file, platform) => {
    const formData = new FormData()
    formData.append('roster_csv', file)
    formData.append('lms_platform', platform)

    return api.post('/api/lms/sync/roster', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    })
  },

  // Sync assignments from LMS (admin only)
  syncAssignments: (assignments, platform) =>
    api.post('/api/lms/sync/assignments', { assignments, lms_platform: platform }),

  // Get grade sync status (admin only)
  getGradeSyncStatus: () => api.get('/api/lms/grade-sync/status'),
}

// Parent Dashboard API methods
export const parentAPI = {
  // Get list of linked students (children)
  getMyChildren: () => api.get('/api/parents/my-children'),

  // Get dashboard data for a specific student
  getDashboard: (studentId) => api.get(`/api/parent/dashboard/${studentId}`),

  // Get calendar data for a specific student
  getCalendar: (studentId) => api.get(`/api/parent/calendar/${studentId}`),

  // Get progress/XP breakdown by pillar for a student
  getProgress: (studentId) => api.get(`/api/parent/progress/${studentId}`),

  // Get learning insights and analytics for a student
  getInsights: (studentId) => api.get(`/api/parent/insights/${studentId}`),

  // Get task details with evidence (for Calendar tab task detail modal)
  getTaskDetails: (studentId, taskId) => api.get(`/api/parent/task/${studentId}/${taskId}`),

  // Get quest details with student's personalized tasks (read-only)
  getQuestView: (studentId, questId) => api.get(`/api/parent/quest/${studentId}/${questId}`),

  // Get all completed quests for a student
  getCompletedQuests: (studentId) => api.get(`/api/parent/completed-quests/${studentId}`),

  // Get recent completions with evidence (for Insights tab)
  getRecentCompletions: (studentId) => api.get(`/api/parent/completions/${studentId}`),

  // Upload evidence on behalf of student (parent-only, no task completion)
  uploadEvidence: (formData) =>
    api.post('/api/parent/evidence/upload', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    }),

  // Get AI tutor conversations for monitoring (Communications tab)
  getTutorConversations: (studentId) => api.get(`/api/parent/communications/${studentId}`),

  // Get specific conversation messages
  getConversationMessages: (conversationId) => api.get(`/api/tutor/parent/conversations/${conversationId}/messages`),

  // Get safety reports for student
  getSafetyReports: (studentId) => api.get(`/api/tutor/parent/safety-reports/${studentId}`),

  // Get parent monitoring settings
  getSettings: (studentId) => api.get(`/api/tutor/parent/settings/${studentId}`),

  // Update parent monitoring settings
  updateSettings: (studentId, settings) => api.put(`/api/tutor/parent/settings/${studentId}`, settings),

  // NEW: Submit connection requests for multiple children (January 2025 Redesign)
  submitConnectionRequests: (children) => api.post('/api/parents/submit-connection-requests', { children }),

  // NEW: Get parent's submitted connection requests with status (January 2025 Redesign)
  getMyConnectionRequests: () => api.get('/api/parents/my-connection-requests'),
}

// Admin Parent Connections API methods (January 2025 Redesign)
export const adminParentConnectionsAPI = {
  // Get all connection requests with filters
  getConnectionRequests: (filters = {}) => {
    const params = new URLSearchParams();
    if (filters.status) params.append('status', filters.status);
    if (filters.parent_id) params.append('parent_id', filters.parent_id);
    if (filters.start_date) params.append('start_date', filters.start_date);
    if (filters.end_date) params.append('end_date', filters.end_date);
    if (filters.page) params.append('page', filters.page);
    if (filters.limit) params.append('limit', filters.limit);
    return api.get(`/api/admin/parent-connections/requests?${params.toString()}`);
  },

  // Approve a connection request
  approveConnectionRequest: (requestId, adminNotes = '') =>
    api.post(`/api/admin/parent-connections/requests/${requestId}/approve`, { admin_notes: adminNotes }),

  // Reject a connection request
  rejectConnectionRequest: (requestId, adminNotes) =>
    api.post(`/api/admin/parent-connections/requests/${requestId}/reject`, { admin_notes: adminNotes }),

  // Get all active parent-student links
  getActiveLinks: (filters = {}) => {
    const params = new URLSearchParams();
    if (filters.parent_id) params.append('parent_id', filters.parent_id);
    if (filters.student_id) params.append('student_id', filters.student_id);
    if (filters.admin_verified !== undefined) params.append('admin_verified', filters.admin_verified);
    if (filters.page) params.append('page', filters.page);
    if (filters.limit) params.append('limit', filters.limit);
    return api.get(`/api/admin/parent-connections/links?${params.toString()}`);
  },

  // Disconnect a parent-student link
  disconnectLink: (linkId) => api.delete(`/api/admin/parent-connections/links/${linkId}`),

  // Manually create a parent-student link
  createManualLink: (parentUserId, studentUserId, adminNotes = '') =>
    api.post('/api/admin/parent-connections/manual-link', {
      parent_user_id: parentUserId,
      student_user_id: studentUserId,
      admin_notes: adminNotes,
    }),

  // Get all users by role (for dropdown selections)
  getAllUsers: (filters = {}) => {
    const params = new URLSearchParams();
    if (filters.role) params.append('role', filters.role);
    if (filters.search) params.append('search', filters.search);
    if (filters.page) params.append('page', filters.page);
    if (filters.per_page) params.append('per_page', filters.per_page);
    return api.get(`/api/admin/users?${params.toString()}`);
  },
}

/**
 * Quest Lifecycle API
 * Handles pick up/set down workflow (January 2025)
 */
export const questLifecycleAPI = {
  // Pick up a quest (start or resume)
  pickUpQuest: (questId) => api.post(`/api/quests/${questId}/pickup`, {}),

  // Set down a quest with optional reflection
  setDownQuest: (questId, reflectionData) => api.post(`/api/quests/${questId}/setdown`, reflectionData || {}),

  // Get quest pickup history
  getPickupHistory: (questId) => api.get(`/api/quests/${questId}/pickup-history`),

  // Get random reflection prompts
  getReflectionPrompts: (category = null, limit = 5) => {
    const params = new URLSearchParams({ limit: limit.toString() });
    if (category) params.append('category', category);
    return api.get(`/api/reflection-prompts?${params.toString()}`);
  },
}

/**
 * Badge Claiming API
 * Handles badge claiming workflow (January 2025)
 */
export const badgeClaimingAPI = {
  // Claim a badge that's available
  claimBadge: (badgeId) => api.post(`/api/badges/${badgeId}/claim`, {}),

  // Get badges ready to claim (for notification banner)
  getClaimableBadges: () => api.get('/api/badges/claimable'),

  // Get all claimed badges
  getClaimedBadges: () => api.get('/api/badges/claimed'),

  // Get detailed badge progress (OnFire vs Optio breakdown)
  getBadgeProgress: (badgeId) => api.get(`/api/badges/${badgeId}/progress`),

  // Mark claim notification as sent (prevent duplicates)
  markNotificationSent: (badgeId) => api.post(`/api/badges/${badgeId}/mark-notification-sent`, {}),
}

// Advisor Check-in API
export const checkinAPI = {
  // Create a new check-in
  createCheckin: (data) => api.post('/api/advisor/checkins', data),

  // Get all check-ins for the current advisor
  getAdvisorCheckins: (limit = 100) => api.get('/api/advisor/checkins', { params: { limit } }),

  // Get all check-ins for a specific student
  getStudentCheckins: (studentId) => api.get(`/api/advisor/students/${studentId}/checkins`),

  // Get pre-populated data for check-in form (active quests, last check-in info)
  getCheckinData: (studentId) => api.get(`/api/advisor/students/${studentId}/checkin-data`),

  // Get a specific check-in by ID
  getCheckinById: (checkinId) => api.get(`/api/advisor/checkins/${checkinId}`),

  // Get check-in analytics for advisor
  getAnalytics: () => api.get('/api/advisor/checkins/analytics'),

  // Admin endpoints
  getAllCheckins: (page = 1, limit = 50) => api.get('/api/admin/checkins', { params: { page, limit } }),
  getAdminAnalytics: () => api.get('/api/admin/checkins/analytics'),
}

// Helper Evidence API (Advisors/Parents uploading evidence for students)
export const helperEvidenceAPI = {
  // Upload evidence block for a student (advisor or parent)
  uploadForStudent: (data) => api.post('/api/evidence/helper/upload-for-student', data),

  // Get student's active tasks (for evidence upload)
  getStudentTasks: (studentId) => api.get(`/api/evidence/helper/student-tasks/${studentId}`),
}

export default api