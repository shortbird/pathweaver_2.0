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
      const response = await api.get(`/api/quests/${questId}?t=${Date.now()}`)
      return response.data.quest
    },
    enabled: !!questId,
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
 */
export const useEnrollQuest = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationKey: [mutationKeys.enrollQuest],
    mutationFn: async (questId) => {
      const response = await api.post(`/api/quests/${questId}/enroll`, {})
      return response.data
    },
    onSuccess: (data, questId) => {
      // Invalidate quest detail to refresh enrollment status
      queryClient.invalidateQueries(queryKeys.quests.detail(questId))

      // Invalidate user dashboard and active quests
      queryClient.invalidateQueries(queryKeys.user.dashboard())
      queryClient.invalidateQueries(queryKeys.quests.all)

      toast.success('Successfully enrolled in quest!')
    },
    onError: (error) => {
      toast.error(error.response?.data?.error || 'Failed to enroll in quest')
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