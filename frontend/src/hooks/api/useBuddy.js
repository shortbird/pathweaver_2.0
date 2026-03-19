import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../../services/api'
import { queryKeys, mutationKeys } from '../../utils/queryKeys'
import toast from 'react-hot-toast'

/**
 * Hook for fetching the current user's buddy
 */
export const useBuddy = (userId, options = {}) => {
  return useQuery({
    queryKey: queryKeys.buddy.record(userId),
    queryFn: async () => {
      const response = await api.get('/api/buddy')
      return response.data.buddy
    },
    enabled: !!userId,
    staleTime: 30 * 1000,
    ...options,
  })
}

/**
 * Hook for creating a new buddy
 */
export const useCreateBuddy = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationKey: [mutationKeys.createBuddy],
    mutationFn: async (name) => {
      const response = await api.post('/api/buddy', { name })
      return response.data.buddy
    },
    onSuccess: (buddy) => {
      queryClient.setQueryData(queryKeys.buddy.record(buddy.user_id), buddy)
      queryClient.invalidateQueries({ queryKey: queryKeys.buddy.all })
      toast.success('Your buddy has hatched!')
    },
    onError: (error) => {
      toast.error(error.response?.data?.error || 'Failed to create buddy')
    },
  })
}

/**
 * Hook for feeding the buddy
 */
export const useFeedBuddy = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationKey: [mutationKeys.feedBuddy],
    mutationFn: async ({ foodId, newVitality, newBond }) => {
      const response = await api.post('/api/buddy/feed', {
        food_id: foodId,
        xp_cost: 0,
        new_vitality: newVitality,
        new_bond: newBond,
        last_interaction: new Date().toISOString(),
      })
      return response.data.buddy
    },
    onSuccess: (buddy) => {
      queryClient.setQueryData(queryKeys.buddy.record(buddy.user_id), buddy)
    },
    onError: (error) => {
      const msg = error.response?.data?.error || 'Failed to feed buddy'
      if (msg.includes('Daily feed limit')) {
        toast.error('Your buddy is full! Come back tomorrow.')
      } else {
        toast.error(msg)
      }
    },
  })
}

/**
 * Hook for tapping the buddy
 */
export const useTapBuddy = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationKey: [mutationKeys.tapBuddy],
    mutationFn: async ({ newBond }) => {
      const response = await api.post('/api/buddy/tap', {
        new_bond: newBond,
        last_interaction: new Date().toISOString(),
      })
      return response.data.buddy
    },
    onSuccess: (buddy) => {
      queryClient.setQueryData(queryKeys.buddy.record(buddy.user_id), buddy)
    },
    // Silent fail for taps - don't show error toasts
  })
}

/**
 * Hook for updating buddy state (stage evolution, etc.)
 */
export const useUpdateBuddy = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (updates) => {
      const response = await api.put('/api/buddy', updates)
      return response.data.buddy
    },
    onSuccess: (buddy) => {
      queryClient.setQueryData(queryKeys.buddy.record(buddy.user_id), buddy)
    },
  })
}
