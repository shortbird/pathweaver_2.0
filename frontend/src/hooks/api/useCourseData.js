import { useQuery } from '@tanstack/react-query'
import api from '../../services/api'

/**
 * Hook for fetching course homepage data
 * Returns course details, quests with lessons, progress, and enrollment status
 */
export const useCourseHomepage = (courseId, options = {}) => {
  return useQuery({
    queryKey: ['course', 'homepage', courseId],
    queryFn: async () => {
      const response = await api.get(`/api/courses/${courseId}/homepage`)
      return response.data
    },
    enabled: !!courseId,
    staleTime: 2 * 60 * 1000, // 2 minutes
    cacheTime: 5 * 60 * 1000, // 5 minutes
    ...options,
  })
}

/**
 * Hook for fetching course details (basic info)
 */
export const useCourseDetail = (courseId, options = {}) => {
  return useQuery({
    queryKey: ['course', 'detail', courseId],
    queryFn: async () => {
      const response = await api.get(`/api/courses/${courseId}`)
      return response.data.course
    },
    enabled: !!courseId,
    staleTime: 5 * 60 * 1000,
    ...options,
  })
}

/**
 * Hook for fetching course list
 */
export const useCourses = (filters = {}, options = {}) => {
  return useQuery({
    queryKey: ['courses', 'list', filters],
    queryFn: async () => {
      const params = new URLSearchParams(filters).toString()
      const response = await api.get(`/api/courses?${params}`)
      return response.data
    },
    ...options,
  })
}
