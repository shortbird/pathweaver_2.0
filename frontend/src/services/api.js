import axios from 'axios'
import { secureTokenStore } from './secureTokenStore'
import { shouldUseAuthHeaders } from '../utils/browserDetection'
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

  // Restore tokens from storage (for page refresh persistence)
  // Used for Safari/iOS cross-origin fallback when cookies don't work
  // With same-site deployment (api.optioeducation.com), httpOnly cookies work and this is just a fallback
  restoreTokens: async () => {
    // Try IndexedDB (encrypted storage for Safari/iOS fallback)
    try {
      const storedAccess = await secureTokenStore.getAccessToken()
      const storedRefresh = await secureTokenStore.getRefreshToken()

      if (storedAccess) {
        accessToken = storedAccess
        refreshToken = storedRefresh
        logger.debug('[TokenStore] Tokens restored from IndexedDB')
        return true
      }
    } catch (error) {
      console.error('[TokenStore] Failed to restore tokens from IndexedDB:', error)
    }

    return false
  },

  // Store tokens in memory and IndexedDB (for Safari/iOS cross-origin fallback)
  // With same-site deployment, httpOnly cookies are primary - this is just a fallback
  setTokens: async (access, refresh) => {
    // Store in memory for synchronous access
    accessToken = access
    refreshToken = refresh

    // Store in encrypted IndexedDB for Safari/iOS fallback
    try {
      await secureTokenStore.setTokens(access, refresh)
      logger.debug('[TokenStore] Tokens stored in memory and IndexedDB')
    } catch (error) {
      console.error('[TokenStore] Failed to store tokens in IndexedDB:', error)
    }
  },

  // Get access token from memory (synchronous for request interceptor)
  getAccessToken: () => accessToken,

  // Get refresh token from memory (synchronous for request interceptor)
  getRefreshToken: () => refreshToken,

  // Clear tokens from memory and IndexedDB
  clearTokens: async () => {
    // Clear from memory
    accessToken = null
    refreshToken = null

    // Clear from encrypted IndexedDB
    try {
      await secureTokenStore.clearTokens()
      logger.debug('[TokenStore] Tokens cleared from memory and IndexedDB')
    } catch (error) {
      console.error('[TokenStore] Failed to clear tokens from IndexedDB:', error)
    }

    // Migration cleanup: Remove any old localStorage tokens
    try {
      localStorage.removeItem('access_token')
      localStorage.removeItem('refresh_token')
      localStorage.removeItem('app_access_token')
      localStorage.removeItem('app_refresh_token')
    } catch (error) {
      // Ignore errors
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
 * CRITICAL FIX (December 2025): Proper Safari/iOS/Firefox token refresh
 * - For browsers using Authorization headers (Safari/iOS/Firefox): send refresh_token in body AND store new tokens
 * - For other browsers: use httpOnly cookies (sent automatically)
 * - This fixes the bug where Safari/iOS/Firefox users get logged out when their access token expires
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
    // FIXED (February 2026): Always attempt refresh on 401, even when in-memory tokens are absent.
    // Chrome users rely on httpOnly cookies, and IndexedDB token restore can fail. The backend
    // will determine if valid refresh_token cookies exist. For truly unauthenticated users,
    // the refresh will fail and redirect to login (same result, one extra fast request).
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
              // CRITICAL FIX: For Safari/iOS/Firefox, send refresh_token in request body
              // These browsers block cross-site cookies, so we must use Authorization headers
              const requestBody = {}
              const useAuthHeaders = shouldUseAuthHeaders()

              if (useAuthHeaders) {
                const currentRefreshToken = tokenStore.getRefreshToken()
                if (currentRefreshToken) {
                  requestBody.refresh_token = currentRefreshToken
                  logger.debug('[API] Sending refresh_token in body for Safari/iOS/Firefox')
                }
              }

              const response = await api.post('/api/auth/refresh', requestBody)

              if (response.status === 200) {
                // CRITICAL FIX (January 2025): Always update in-memory tokens after refresh
                // Previously only updated for Safari/iOS/Firefox, but Chrome users also have
                // tokens in memory from login. Without this, expired tokens cause infinite 401 loops.
                // Backend returns access_token and refresh_token in response body for all browsers.
                if (response.data.access_token && response.data.refresh_token) {
                  await tokenStore.setTokens(response.data.access_token, response.data.refresh_token)
                  logger.debug('[API] New tokens stored after refresh')
                }

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

        // Retry the original request (new tokens automatically sent via cookies or Authorization header)
        return api(originalRequest)
      } catch (refreshError) {
        // Clear user data on refresh failure (tokens cleared by backend)
        localStorage.removeItem('user')

        // Also clear tokens from tokenStore for Safari/iOS/Firefox users
        await tokenStore.clearTokens()

        // Only redirect to login if we're not already on auth pages or public pages
        const authPaths = ['/login', '/register', '/email-verification', '/forgot-password', '/reset-password', '/', '/terms', '/privacy', '/academy-agreement', '/academy-handbook', '/services']
        const currentPath = window.location.pathname
        const isPublicDiploma = currentPath.startsWith('/public/diploma/') || currentPath.startsWith('/portfolio/')
        const isPromoPage = currentPath.startsWith('/promo/') || currentPath === '/promo'
        const isConsultationPage = currentPath === '/consultation'
        const isDemoPage = currentPath === '/demo'
        const isQuestsPage = currentPath.startsWith('/quests') || currentPath.startsWith('/badges')
        const isJoinPage = currentPath.startsWith('/join/')

        if (!authPaths.includes(currentPath) && !isPublicDiploma && !isPromoPage && !isConsultationPage && !isDemoPage && !isQuestsPage && !isJoinPage) {
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

  // Send invitation to observer (student-initiated)
  sendInvitation: (observerEmail, observerName, relationship) =>
    api.post('/api/observers/invite', { observer_email: observerEmail, observer_name: observerName, relationship }),

  // Accept an observer invitation (creates observer-student link)
  acceptInvitation: (invitationCode, data = {}) =>
    api.post(`/api/observers/accept/${invitationCode}`, data),

  // Get my sent invitations
  getMyInvitations: () => api.get('/api/observers/my-invitations'),

  // Cancel pending invitation
  cancelInvitation: (invitationId) => api.delete(`/api/observers/invitations/${invitationId}/cancel`),

  // Parent endpoints - create shareable invite link for their child
  parentCreateInvite: (studentId, relationship) =>
    api.post('/api/observers/parent-invite', { student_id: studentId, relationship }),

  getParentInvitations: (studentId) =>
    api.get(`/api/observers/parent-invitations/${studentId}`),

  getObserversForStudent: (studentId) =>
    api.get(`/api/observers/student/${studentId}/observers`),

  // Remove observer from student (parent action)
  removeObserverFromStudent: (studentId, linkId) =>
    api.delete(`/api/observers/student/${studentId}/observers/${linkId}`),

  // Feed endpoints
  getFeed: (params = {}) => {
    const queryParams = new URLSearchParams();
    if (params.studentId) queryParams.append('student_id', params.studentId);
    if (params.limit) queryParams.append('limit', params.limit);
    if (params.cursor) queryParams.append('cursor', params.cursor);
    const queryString = queryParams.toString();
    return api.get(`/api/observers/feed${queryString ? `?${queryString}` : ''}`);
  },

  getMyStudents: () => api.get('/api/observers/my-students'),

  // Likes
  toggleLike: (completionId) =>
    api.post(`/api/observers/completions/${completionId}/like`, {}),

  // Comments on specific completions
  getCompletionComments: (completionId) =>
    api.get(`/api/observers/completions/${completionId}/comments`),

  postComment: (studentId, completionId, commentText, questId = null) =>
    api.post('/api/observers/comments', {
      student_id: studentId,
      task_completion_id: completionId,
      quest_id: questId,
      comment_text: commentText
    }),

  deleteComment: (commentId) =>
    api.delete(`/api/observers/comments/${commentId}`),

  // Student-facing: get all feedback on my work
  getMyFeedback: (studentId) =>
    api.get(`/api/observers/student/${studentId}/comments`),

  // Student-facing: get my activity feed (same format as observer feed)
  getMyActivityFeed: (studentId, params = {}) => {
    const queryParams = new URLSearchParams();
    if (params.limit) queryParams.append('limit', params.limit);
    if (params.cursor) queryParams.append('cursor', params.cursor);
    const queryString = queryParams.toString();
    return api.get(`/api/observers/student/${studentId}/activity${queryString ? `?${queryString}` : ''}`);
  },

  // Family observer endpoints (parent manages observers across all children)
  familyInvite: (studentIds, relationship = 'other') =>
    api.post('/api/observers/family-invite', { student_ids: studentIds, relationship }),

  getFamilyObservers: () =>
    api.get('/api/observers/family-observers'),

  toggleChildAccess: (observerId, studentId, enabled) =>
    api.post(`/api/observers/family-observers/${observerId}/toggle-child`, {
      student_id: studentId,
      enabled
    }),

  removeFamilyObserver: (observerId) =>
    api.delete(`/api/observers/family-observers/${observerId}`)
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

  // Upload evidence on behalf of student (parent/advisor, no task completion)
  // Uses helper evidence endpoint - adds evidence blocks without completing the task
  // Expects JSON: { student_id, task_id, block_type, content }
  uploadEvidence: (data) =>
    api.post('/api/evidence/helper/upload-for-student', data),

  // Upload a file (image/document) and get back the URL
  // Used by parent evidence upload to first upload file, then create evidence block
  uploadFile: (formData) =>
    api.post('/api/uploads/evidence', formData, {
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

  // Family Settings - Co-Parents management
  getFamilyParents: () => api.get('/api/parents/family-parents'),
  inviteParent: (data) => api.post('/api/parents/invite-parent', data),
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

/**
 * Task Steps API
 * AI-powered task step breakdowns for neurodivergent-supportive learning
 */
export const taskStepsAPI = {
  // Generate AI-powered steps for a task
  generateSteps: (taskId, granularity = 'quick') =>
    api.post(`/api/tasks/${taskId}/steps/generate`, { granularity }),

  // Get all steps for a task (including nested sub-steps)
  getSteps: (taskId) => api.get(`/api/tasks/${taskId}/steps`),

  // Toggle a step's completion status
  toggleStep: (taskId, stepId) => api.put(`/api/tasks/${taskId}/steps/${stepId}/toggle`, {}),

  // Drill down into a step (for "I'm stuck" feature)
  drillDown: (taskId, stepId) => api.post(`/api/tasks/${taskId}/steps/${stepId}/drill-down`, {}),

  // Delete all steps for a task
  deleteSteps: (taskId) => api.delete(`/api/tasks/${taskId}/steps`),
}

/**
 * Transfer Credits API (Admin)
 * Import external transcript credits toward diploma
 * Supports multiple source institutions per student
 */
export const transferCreditsAPI = {
  // Get all transfer credits for a student (returns array)
  get: (userId) => api.get(`/api/admin/transfer-credits/${userId}`),

  // Save transfer credits (create or update by school name, or update by ID if provided)
  save: (userId, data) => api.post(`/api/admin/transfer-credits/${userId}`, data),

  // Upload transcript file (transferCreditId is optional - if not provided, creates a new record)
  uploadTranscript: (userId, file, transferCreditId = null) => {
    const formData = new FormData()
    formData.append('file', file)
    if (transferCreditId) {
      formData.append('transfer_credit_id', transferCreditId)
    }
    return api.post(`/api/admin/transfer-credits/${userId}/transcript`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
  },

  // Delete a specific transfer credit by ID
  deleteOne: (userId, transferCreditId) => api.delete(`/api/admin/transfer-credits/${userId}/${transferCreditId}`),

  // Delete ALL transfer credits for a student
  deleteAll: (userId) => api.delete(`/api/admin/transfer-credits/${userId}`),
}

export default api