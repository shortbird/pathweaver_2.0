import axios from 'axios'

// ✅ INCOGNITO FIX: Detect if deployment is cross-origin
const isCrossOrigin = () => {
  const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:5000'
  const isRender = apiUrl.includes('onrender.com')
  return isRender
}

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:5000',
  headers: {
    'Content-Type': 'application/json',
  },
  // ✅ INCOGNITO FIX: Only send cookies in same-origin mode (localhost)
  // In cross-origin mode (Render), cookies are blocked in incognito anyway
  withCredentials: !isCrossOrigin(), // Only true for localhost
})

// ✅ INCOGNITO MODE FIX: Token storage in module scope (avoid circular dependency)
// This is a simple closure that authService can access
let tokenStorage = {
  accessToken: null,
  refreshToken: null
}

// Export token storage interface for authService
export const tokenStore = {
  setTokens: (access, refresh) => {
    tokenStorage.accessToken = access
    tokenStorage.refreshToken = refresh
  },
  getAccessToken: () => tokenStorage.accessToken,
  getRefreshToken: () => tokenStorage.refreshToken,
  clearTokens: () => {
    tokenStorage.accessToken = null
    tokenStorage.refreshToken = null
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
 * ✅ INCOGNITO MODE FIX (2025-01-24):
 * Dual authentication strategy for incognito mode compatibility:
 * 1. Authorization header with in-memory tokens (works in incognito)
 * 2. httpOnly cookies as fallback (works in normal mode)
 *
 * Adds CSRF token for state-changing requests.
 */
api.interceptors.request.use(
  (config) => {
    // ✅ INCOGNITO MODE FIX: Add Authorization header from token storage
    // No circular dependency since tokenStore is in same module
    const accessToken = tokenStore.getAccessToken()

    if (accessToken) {
      config.headers['Authorization'] = `Bearer ${accessToken}`
    }

    // Add CSRF token for state-changing requests
    if (['post', 'put', 'delete', 'patch'].includes(config.method?.toLowerCase())) {
      const csrfToken = getCsrfToken()
      if (csrfToken) {
        config.headers['X-CSRF-Token'] = csrfToken
      }
    }

    return config
  },
  (error) => {
    return Promise.reject(error)
  }
)

// Function to get CSRF token from meta tag or cookie
function getCsrfToken() {
  // First try to get from meta tag (if set by server)
  const metaTag = document.querySelector('meta[name="csrf-token"]')
  if (metaTag) {
    return metaTag.getAttribute('content')
  }

  // Fallback to reading from cookie (double-submit pattern)
  const cookies = document.cookie.split(';')
  for (let cookie of cookies) {
    const [name, value] = cookie.trim().split('=')
    if (name === 'csrf_token') {
      return decodeURIComponent(value)
    }
  }

  return null
}

/**
 * Response Interceptor - Token Refresh
 *
 * ✅ INCOGNITO MODE FIX (2025-01-24):
 * Dual authentication strategy for token refresh:
 * 1. Send refresh token in request body (works in incognito)
 * 2. Server also checks httpOnly cookies as fallback
 *
 * Updates in-memory tokens after successful refresh.
 */
let refreshPromise = null

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config

    // Handle 401 responses by attempting token refresh
    if (error.response?.status === 401 &&
        !originalRequest._retry &&
        !originalRequest.url?.includes('/auth/refresh')) {
      originalRequest._retry = true

      try {
        // Only one refresh at a time - all concurrent requests wait for same promise
        if (!refreshPromise) {
          refreshPromise = (async () => {
            try {
              // ✅ INCOGNITO MODE FIX: Get refresh token from storage and send in body
              const refreshToken = tokenStore.getRefreshToken()

              // Send refresh token in body for incognito mode compatibility
              // Server will also check cookies as fallback
              const response = await api.post('/api/auth/refresh', {
                refresh_token: refreshToken
              })

              if (response.status === 200) {
                // Update in-memory tokens with new tokens from response
                if (response.data.access_token && response.data.refresh_token) {
                  tokenStore.setTokens(
                    response.data.access_token,
                    response.data.refresh_token
                  )
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

        // Retry the original request (new tokens automatically added by request interceptor)
        return api(originalRequest)
      } catch (refreshError) {
        // Clear any user data on refresh failure
        tokenStore.clearTokens()
        localStorage.removeItem('user')

        // Only redirect to login if we're not already on auth pages or public pages
        const authPaths = ['/login', '/register', '/email-verification', '/', '/subscription/success', '/terms', '/privacy', '/academy-agreement', '/academy-handbook']
        const currentPath = window.location.pathname
        const isPublicDiploma = currentPath.startsWith('/public/diploma/') || currentPath.startsWith('/portfolio/')

        if (!authPaths.includes(currentPath) && !isPublicDiploma) {
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
  acceptFriendRequest: (friendshipId) => api.post(`/api/community/friends/accept/${friendshipId}`),

  // Decline incoming friend request
  declineFriendRequest: (friendshipId) => api.delete(`/api/community/friends/decline/${friendshipId}`),

  // Cancel sent friend request
  cancelFriendRequest: (friendshipId) => api.delete(`/api/community/friends/cancel/${friendshipId}`)
}

// Collaboration API removed in Phase 3 refactoring (January 2025)
// Team-up feature has been removed from the platform

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

  // Get recent completions with evidence (for Insights tab)
  getRecentCompletions: (studentId) => api.get(`/api/parent/completions/${studentId}`),

  // Upload evidence on behalf of student (requires student approval)
  uploadEvidence: (studentId, taskId, formData) =>
    api.post(`/api/parent/evidence/${studentId}`, formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    }),

  // Get AI tutor conversations for monitoring (Communications tab)
  getTutorConversations: (studentId) => api.get(`/api/tutor/parent/conversations/${studentId}`),

  // Get specific conversation messages
  getConversationMessages: (conversationId) => api.get(`/api/tutor/parent/conversations/${conversationId}/messages`),

  // Get safety reports for student
  getSafetyReports: (studentId) => api.get(`/api/tutor/parent/safety-reports/${studentId}`),

  // Get parent monitoring settings
  getSettings: (studentId) => api.get(`/api/tutor/parent/settings/${studentId}`),

  // Update parent monitoring settings
  updateSettings: (studentId, settings) => api.put(`/api/tutor/parent/settings/${studentId}`, settings),
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

export default api