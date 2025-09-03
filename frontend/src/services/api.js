import axios from 'axios'

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:5000/api',
  headers: {
    'Content-Type': 'application/json',
  },
})

// Helper function to get auth headers for fetch requests
export const getAuthHeaders = () => {
  const token = localStorage.getItem('access_token')
  const headers = {
    'Content-Type': 'application/json',
  }
  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }
  return headers
}

api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('access_token')
    if (token) {
      config.headers.Authorization = `Bearer ${token}`
    }
    return config
  },
  (error) => {
    return Promise.reject(error)
  }
)

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config
    
    // Don't retry refresh if the failing request is already a refresh attempt
    if (error.response?.status === 401 && 
        !originalRequest._retry && 
        !originalRequest.url?.includes('/api/auth/refresh')) {
      originalRequest._retry = true
      
      try {
        const refresh_token = localStorage.getItem('refresh_token')
        
        // Only attempt refresh if we have a refresh token
        if (!refresh_token) {
          throw new Error('No refresh token available')
        }
        
        const response = await api.post('/api/auth/refresh', { refresh_token })
        const { session } = response.data
        
        localStorage.setItem('access_token', session.access_token)
        localStorage.setItem('refresh_token', session.refresh_token)
        
        api.defaults.headers.common['Authorization'] = `Bearer ${session.access_token}`
        originalRequest.headers.Authorization = `Bearer ${session.access_token}`
        
        return api(originalRequest)
      } catch (refreshError) {
        // Clear auth data
        localStorage.removeItem('access_token')
        localStorage.removeItem('refresh_token')
        localStorage.removeItem('user')
        
        // Only redirect to login if we're not already on auth pages
        const authPaths = ['/login', '/register', '/email-verification', '/']
        const currentPath = window.location.pathname
        if (!authPaths.includes(currentPath)) {
          window.location.href = '/login'
        }
        
        return Promise.reject(refreshError)
      }
    }
    
    return Promise.reject(error)
  }
)

export default api