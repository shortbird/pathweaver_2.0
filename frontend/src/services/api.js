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
    
    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true
      
      try {
        const refresh_token = localStorage.getItem('refresh_token')
        const response = await api.post('/auth/refresh', { refresh_token })
        const { session } = response.data
        
        localStorage.setItem('access_token', session.access_token)
        localStorage.setItem('refresh_token', session.refresh_token)
        
        api.defaults.headers.common['Authorization'] = `Bearer ${session.access_token}`
        originalRequest.headers.Authorization = `Bearer ${session.access_token}`
        
        return api(originalRequest)
      } catch (refreshError) {
        localStorage.removeItem('access_token')
        localStorage.removeItem('refresh_token')
        localStorage.removeItem('user')
        window.location.href = '/login'
        return Promise.reject(refreshError)
      }
    }
    
    return Promise.reject(error)
  }
)

export default api