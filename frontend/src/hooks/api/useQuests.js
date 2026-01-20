import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../../services/api'
import { queryKeys, mutationKeys } from '../../utils/queryKeys'
import toast from 'react-hot-toast'

/**
 * Hook for fetching quest list with filters
 */
export const useQuests = (filters = {}, options = {}) => {
  return useQuery({
    queryKey: queryKeys.quests.list(filters),
    queryFn: async () => {
      const params = new URLSearchParams(filters).toString()
      const response = await api.get(`/api/quests?${params}`)
      return response.data
    },
    ...options,
  })
}

/**
 * Hook for fetching quest details
 */
export const useQuestDetail = (questId, options = {}) => {
  return useQuery({
    queryKey: queryKeys.quests.detail(questId),
    queryFn: async () => {
      const response = await api.get(`/api/quests/${questId}`)
      return response.data.quest
    },
    enabled: !!questId,
    staleTime: 5 * 60 * 1000, // 5 minutes
    cacheTime: 10 * 60 * 1000, // 10 minutes
    ...options,
  })
}

/**
 * Hook for fetching user's active quests
 */
export const useActiveQuests = (userId, options = {}) => {
  return useQuery({
    queryKey: queryKeys.quests.active(userId),
    queryFn: async () => {
      const response = await api.get('/api/users/dashboard')
      return response.data.active_quests || []
    },
    enabled: !!userId,
    ...options,
  })
}

/**
 * Hook for fetching user's completed quests
 */
export const useCompletedQuests = (userId, options = {}) => {
  return useQuery({
    queryKey: queryKeys.quests.completed(userId),
    queryFn: async () => {
      const response = await api.get(`/api/users/${userId}/completed-quests`)
      return response.data
    },
    enabled: !!userId,
    ...options,
  })
}

/**
 * Hook for enrolling in a quest
 * Supports optional body parameters for quest restart scenarios
 */
export const useEnrollQuest = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationKey: [mutationKeys.enrollQuest],
    mutationFn: async ({ questId, options = {} }) => {
      const response = await api.post(`/api/quests/${questId}/enroll`, options)
      return response.data
    },
    onSuccess: (data, { questId }) => {
      // Invalidate quest detail to refresh enrollment status
      queryClient.invalidateQueries(queryKeys.quests.detail(questId))

      // Invalidate user dashboard and active quests
      queryClient.invalidateQueries(queryKeys.user.dashboard())
      queryClient.invalidateQueries(queryKeys.quests.all)

      // Only show success toast if not already shown by component
      if (!data.tasks_loaded) {
        toast.success('Successfully enrolled in quest!')
      }
    },
    onError: (error) => {
      // Don't show error toast for 409 (conflict) - let component handle it
      if (error.response?.status !== 409) {
        toast.error(error.response?.data?.error || 'Failed to enroll in quest')
      }
    },
  })
}

/**
 * Hook for completing a task
 */
export const useCompleteTask = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationKey: [mutationKeys.completeTask],
    mutationFn: async ({ taskId, evidence, userId }) => {
      const response = await api.post(`/api/tasks/${taskId}/complete`, evidence)
      return response.data
    },
    onSuccess: (data, variables) => {
      const userId = variables.userId

      // Invalidate all quest-related data (React Query will auto-refetch)
      queryKeys.invalidateQuests(queryClient, userId)

      // Also invalidate user dashboard to update active quests immediately
      if (userId) {
        queryClient.invalidateQueries(queryKeys.user.dashboard(userId))
      }

      toast.success('Task completed successfully!')
    },
    onError: (error) => {
      toast.error(error.response?.data?.error || 'Failed to complete task')
    },
  })
}

/**
 * Hook for abandoning a quest
 */
export const useAbandonQuest = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationKey: [mutationKeys.abandonQuest],
    mutationFn: async (questId) => {
      const response = await api.post(`/api/quests/${questId}/abandon`)
      return response.data
    },
    onSuccess: (data, questId) => {
      // Invalidate quest-related queries
      queryKeys.invalidateQuests(queryClient)

      toast.success('Quest abandoned')
    },
    onError: (error) => {
      toast.error(error.response?.data?.error || 'Failed to abandon quest')
    },
  })
}

/**
 * Hook for ending/finishing a quest
 */
export const useEndQuest = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationKey: [mutationKeys.endQuest],
    mutationFn: async (questId) => {
      const response = await api.post(`/api/quests/${questId}/end`, {})
      return response.data
    },
    onSuccess: (data, questId) => {
      // Invalidate quest-related queries
      queryKeys.invalidateQuests(queryClient)

      // Also invalidate user dashboard to remove quest from active quests immediately
      queryClient.invalidateQueries(queryKeys.user.dashboard())

      toast.success(data.message || 'Quest finished successfully!')
    },
    onError: (error) => {
      toast.error(error.response?.data?.error || 'Failed to finish quest')
    },
  })
}

/**
 * Hook for fetching quest tasks
 */
export const useQuestTasks = (questId, options = {}) => {
  return useQuery({
    queryKey: queryKeys.quests.tasks(questId),
    queryFn: async () => {
      const response = await api.get(`/api/quests/${questId}/tasks`)
      return response.data
    },
    enabled: !!questId,
    ...options,
  })
}

/**
 * Hook for getting quest progress
 */
export const useQuestProgress = (userId, questId, options = {}) => {
  return useQuery({
    queryKey: queryKeys.quests.progress(userId, questId),
    queryFn: async () => {
      const response = await api.get(`/api/quests/${questId}/progress`)
      return response.data
    },
    enabled: !!(userId && questId),
    ...options,
  })
}

/**
 * Hook for fetching quest engagement/rhythm metrics
 * Used for the GitHub-style activity calendar and rhythm indicator
 */
export const useQuestEngagement = (questId, options = {}) => {
  return useQuery({
    queryKey: ['quest-engagement', questId],
    queryFn: async () => {
      const response = await api.get(`/api/quests/${questId}/engagement`)
      return response.data.engagement
    },
    enabled: !!questId,
    staleTime: 60 * 1000, // 1 minute
    cacheTime: 5 * 60 * 1000, // 5 minutes
    ...options,
  })
}

/**
 * Hook for fetching global user engagement/rhythm metrics
 * Used on the dashboard for overall platform engagement
 */
export const useGlobalEngagement = (options = {}) => {
  return useQuery({
    queryKey: ['user-engagement'],
    queryFn: async () => {
      const response = await api.get('/api/users/me/engagement')
      return response.data.engagement
    },
    staleTime: 60 * 1000, // 1 minute
    cacheTime: 5 * 60 * 1000, // 5 minutes
    ...options,
  })
}

/**
 * Hook for fetching student engagement/rhythm metrics (for parent dashboard)
 * Allows parents to view their child's engagement data
 */
export const useStudentEngagement = (studentId, options = {}) => {
  return useQuery({
    queryKey: ['student-engagement', studentId],
    queryFn: async () => {
      const response = await api.get(`/api/parent/${studentId}/engagement`)
      return response.data.engagement
    },
    enabled: !!studentId,
    staleTime: 60 * 1000, // 1 minute
    cacheTime: 5 * 60 * 1000, // 5 minutes
    ...options,
  })
}