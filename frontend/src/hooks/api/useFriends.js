import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { friendsAPI, collaborationAPI } from '../../services/api'
import { queryKeys, mutationKeys } from '../../utils/queryKeys'
import toast from 'react-hot-toast'

/**
 * Hook for fetching friends data
 */
export const useFriends = (userId, options = {}) => {
  return useQuery({
    queryKey: queryKeys.social.friends(userId),
    queryFn: async () => {
      const response = await friendsAPI.getFriends()
      return response.data
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

/**
 * Hook for fetching collaboration invitations
 */
export const useCollaborations = (userId, options = {}) => {
  return useQuery({
    queryKey: queryKeys.social.collaborations(userId),
    queryFn: async () => {
      const response = await collaborationAPI.getInvites()
      return response.data
    },
    enabled: !!userId,
    ...options,
  })
}

/**
 * Hook for fetching quest-specific collaborations
 */
export const useQuestCollaborations = (questId, options = {}) => {
  return useQuery({
    queryKey: queryKeys.social.questCollaborations(questId),
    queryFn: async () => {
      const response = await collaborationAPI.getQuestCollaborations(questId)
      return response.data
    },
    enabled: !!questId,
    ...options,
  })
}

/**
 * Hook for sending collaboration invitation
 */
export const useSendCollaboration = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationKey: [mutationKeys.sendCollaboration],
    mutationFn: async ({ questId, friendId }) => {
      const response = await collaborationAPI.sendInvite(questId, friendId)
      return response.data
    },
    onSuccess: (data, variables) => {
      // Invalidate collaboration queries
      queryKeys.invalidateSocial(queryClient)
      queryClient.invalidateQueries(
        queryKeys.social.questCollaborations(variables.questId)
      )

      toast.success('Team-up invitation sent!')
    },
    onError: (error) => {
      toast.error(error.response?.data?.error || 'Failed to send team-up invitation')
    },
  })
}

/**
 * Hook for accepting collaboration invitation
 */
export const useAcceptCollaboration = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationKey: [mutationKeys.acceptCollaboration],
    mutationFn: async (inviteId) => {
      const response = await collaborationAPI.acceptInvite(inviteId)
      return response.data
    },
    onSuccess: () => {
      // Invalidate collaboration queries
      queryKeys.invalidateSocial(queryClient)

      toast.success('Team-up invitation accepted!')
    },
    onError: (error) => {
      toast.error(error.response?.data?.error || 'Failed to accept team-up invitation')
    },
  })
}

/**
 * Hook for declining collaboration invitation
 */
export const useDeclineCollaboration = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (inviteId) => {
      const response = await collaborationAPI.declineInvite(inviteId)
      return response.data
    },
    onSuccess: () => {
      // Invalidate collaboration queries
      queryKeys.invalidateSocial(queryClient)

      toast.success('Team-up invitation declined')
    },
    onError: (error) => {
      toast.error(error.response?.data?.error || 'Failed to decline team-up invitation')
    },
  })
}