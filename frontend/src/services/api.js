import axios from 'axios'

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:5000',
  headers: {
    'Content-Type': 'application/json',
  },
  withCredentials: true, // Enable sending cookies with requests
})

// Helper function to get auth headers for fetch requests (backward compatibility)
// Note: This is now primarily for backward compatibility - cookies are preferred
export const getAuthHeaders = () => {
  const headers = {
    'Content-Type': 'application/json',
  }
  return headers
}

// Add Authorization header from localStorage as fallback for incognito mode
api.interceptors.request.use(
  (config) => {
    // Add CSRF token for state-changing requests
    if (['post', 'put', 'delete', 'patch'].includes(config.method?.toLowerCase())) {
      const csrfToken = getCsrfToken()
      if (csrfToken) {
        config.headers['X-CSRF-Token'] = csrfToken
      }
    }

    // Fallback to localStorage tokens for incognito mode
    // (cookies with SameSite=None are blocked in incognito on cross-site requests)
    const accessToken = localStorage.getItem('access_token')
    if (accessToken) {
      config.headers.Authorization = `Bearer ${accessToken}`
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
        // Try to refresh using localStorage tokens as fallback for incognito mode
        const refreshToken = localStorage.getItem('refresh_token')
        const payload = refreshToken ? { refresh_token: refreshToken } : {}

        const response = await api.post('/api/auth/refresh', payload)

        // If refresh succeeds, update localStorage tokens if provided
        if (response.status === 200 && response.data.session) {
          if (response.data.session.access_token) {
            localStorage.setItem('access_token', response.data.session.access_token)
          }
          if (response.data.session.refresh_token) {
            localStorage.setItem('refresh_token', response.data.session.refresh_token)
          }
          return api(originalRequest)
        }
      } catch (refreshError) {
        // Clear localStorage tokens on refresh failure
        localStorage.removeItem('access_token')
        localStorage.removeItem('refresh_token')
        localStorage.removeItem('user')

        // Only redirect to login if we're not already on auth pages, subscription success, or public pages
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

export default api