import { useQuery } from '@tanstack/react-query'
import api from '../../services/api'
import { queryKeys } from '../../utils/queryKeys'

/**
 * Hook for fetching course homepage data
 * Returns course details, quests with lessons, progress, and enrollment status
 */
export const useCourseHomepage = (courseId, options = {}) => {
  return useQuery({
    queryKey: queryKeys.courses.homepage(courseId),
    queryFn: async () => {
      const response = await api.get(`/api/courses/${courseId}/homepage`)
      return response.data
    },
    enabled: !!courseId,
    staleTime: 30 * 1000, // 30 seconds - shorter for better XP updates
    gcTime: 5 * 60 * 1000, // 5 minutes (renamed from cacheTime in v5)
    ...options,
  })
}

/**
 * Hook for fetching course details (basic info)
 */
export const useCourseDetail = (courseId, options = {}) => {
  return useQuery({
    queryKey: queryKeys.courses.detail(courseId),
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
    queryKey: queryKeys.courses.list(filters),
    queryFn: async () => {
      const params = new URLSearchParams(filters).toString()
      const response = await api.get(`/api/courses?${params}`)
      return response.data
    },
    ...options,
  })
}
