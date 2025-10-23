import axios from 'axios'

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:5000',
  headers: {
    'Content-Type': 'application/json',
  },
  withCredentials: true, // Enable sending cookies with requests
})

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
 * Sprint 2 - Task 4.2: Authentication Standardization (2025-01-22)
 * Only adds CSRF token for state-changing requests.
 * Authentication handled exclusively via httpOnly cookies (automatic, XSS-protected).
 * Removed localStorage token management to prevent XSS attacks.
 */
api.interceptors.request.use(
  (config) => {
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
 * Sprint 2 - Task 4.2: Authentication Standardization (2025-01-22)
 * Simplified token refresh using httpOnly cookies only.
 * Server handles token refresh automatically via cookies.
 * Removed localStorage token management to prevent XSS attacks.
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
              // Server handles refresh via httpOnly cookies automatically
              const response = await api.post('/api/auth/refresh', {})

              if (response.status === 200) {
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

        // Retry the original request (cookies automatically included)
        return api(originalRequest)
      } catch (refreshError) {
        // Clear any user data on refresh failure
        localStorage.removeItem('user')

        // Only redirect to login if we're not already on auth pages or public pages
        const authPaths = ['/login', '/register', '/email-verification', '/', '/subscription/success']
        const currentPath = window.location.pathname
        const isPublicDiploma = currentPath.startsWith('/diploma/') || currentPath.startsWith('/portfolio/')

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

export default api