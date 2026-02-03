import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { friendsAPI } from '../../services/api'
import { queryKeys, mutationKeys } from '../../utils/queryKeys'
import toast from 'react-hot-toast'
import logger from '../../utils/logger'

/**
 * Hook for fetching friends data
 */
export const useFriends = (userId, options = {}) => {
  return useQuery({
    queryKey: queryKeys.social.friends(userId),
    queryFn: async () => {
      try {
        logger.debug('[USE_FRIENDS] Fetching friends for userId:', userId)
        const response = await friendsAPI.getFriends()
        logger.debug('[USE_FRIENDS] API response:', response)
        return response.data
      } catch (error) {
        logger.error('[USE_FRIENDS] Error fetching friends:', error)
        logger.error('[USE_FRIENDS] Error response:', error.response)
        throw error
      }
    },
    enabled: !!userId,
    ...options,
  })
}

/**
 * Hook for fetching friends' activity feed
 */
export const useFriendsActivity = (userId, options = {}) => {
  return useQuery({
    queryKey: queryKeys.social.activity(userId),
    queryFn: async () => {
      const response = await friendsAPI.getFriendsActivity()
      return response.data
    },
    enabled: !!userId,
    staleTime: 60000, // Consider data fresh for 1 minute
    ...options,
  })
}

/**
 * Hook for sending friend request
 */
export const useSendFriendRequest = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationKey: [mutationKeys.sendFriendRequest],
    mutationFn: async (email) => {
      const response = await friendsAPI.sendFriendRequest(email)
      return response.data
    },
    onSuccess: (data, email) => {
      // Invalidate friends queries to refresh the lists
      queryClient.invalidateQueries(queryKeys.social.all)

      toast.success('Friend request sent!')
    },
    onError: (error) => {
      toast.error(error.response?.data?.error || 'Failed to send friend request')
    },
  })
}

/**
 * Hook for accepting friend request
 */
export const useAcceptFriendRequest = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationKey: [mutationKeys.acceptFriendRequest],
    mutationFn: async (friendshipId) => {
      const response = await friendsAPI.acceptFriendRequest(friendshipId)
      return response.data
    },
    onSuccess: () => {
      // Invalidate friends queries
      queryClient.invalidateQueries(queryKeys.social.all)

      toast.success('Friend request accepted!')
    },
    onError: (error) => {
      toast.error(error.response?.data?.error || 'Failed to accept friend request')
    },
  })
}

/**
 * Hook for declining friend request
 */
export const useDeclineFriendRequest = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationKey: [mutationKeys.declineFriendRequest],
    mutationFn: async (friendshipId) => {
      const response = await friendsAPI.declineFriendRequest(friendshipId)
      return response.data
    },
    onSuccess: () => {
      // Invalidate friends queries
      queryClient.invalidateQueries(queryKeys.social.all)

      toast.success('Friend request declined')
    },
    onError: (error) => {
      toast.error(error.response?.data?.error || 'Failed to decline friend request')
    },
  })
}

/**
 * Hook for canceling sent friend request
 */
export const useCancelFriendRequest = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (friendshipId) => {
      const response = await friendsAPI.cancelFriendRequest(friendshipId)
      return response.data
    },
    onSuccess: () => {
      // Invalidate friends queries
      queryClient.invalidateQueries(queryKeys.social.all)

      toast.success('Friend request cancelled')
    },
    onError: (error) => {
      toast.error(error.response?.data?.error || 'Failed to cancel friend request')
    },
  })
}

// Collaboration hooks removed in Phase 3 refactoring (January 2025)
// Team-up feature has been removed from the platform