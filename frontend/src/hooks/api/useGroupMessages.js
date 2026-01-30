import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../../services/api'
import toast from 'react-hot-toast'

// Get all groups for the current user
export const useGroups = (userId, options = {}) => {
  return useQuery({
    queryKey: ['groups', userId],
    queryFn: async () => {
      const response = await api.get('/api/groups')
      return response.data.data || response.data
    },
    enabled: !!userId,
    refetchInterval: 30000, // Refetch every 30 seconds
    staleTime: 20000,
    refetchOnWindowFocus: true,
    ...options
  })
}

// Get group details with members
export const useGroup = (groupId, options = {}) => {
  return useQuery({
    queryKey: ['group', groupId],
    queryFn: async () => {
      const response = await api.get(`/api/groups/${groupId}`)
      return response.data.data || response.data
    },
    enabled: !!groupId,
    staleTime: 60000, // Cache for 1 minute
    ...options
  })
}

// Get messages for a group
export const useGroupMessages = (groupId, userId, options = {}) => {
  return useQuery({
    queryKey: ['group-messages', groupId],
    queryFn: async () => {
      const response = await api.get(`/api/groups/${groupId}/messages`)
      return response.data.data || response.data
    },
    enabled: !!groupId && !!userId,
    refetchInterval: 15000, // Refetch every 15 seconds
    staleTime: 10000,
    refetchOnWindowFocus: true,
    ...options
  })
}

// Create a new group
export const useCreateGroup = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ name, description, memberIds }) => {
      const response = await api.post('/api/groups', {
        name,
        description,
        member_ids: memberIds
      })
      return response.data.data || response.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['groups'] })
      toast.success('Group created successfully')
    },
    onError: (error) => {
      const message = error.response?.data?.error || 'Failed to create group'
      toast.error(message)
    }
  })
}

// Update group details
export const useUpdateGroup = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ groupId, name, description }) => {
      const response = await api.put(`/api/groups/${groupId}`, {
        name,
        description
      })
      return response.data.data || response.data
    },
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['group', variables.groupId] })
      queryClient.invalidateQueries({ queryKey: ['groups'] })
      toast.success('Group updated successfully')
    },
    onError: (error) => {
      const message = error.response?.data?.error || 'Failed to update group'
      toast.error(message)
    }
  })
}

// Add member to group
export const useAddMember = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ groupId, userId }) => {
      const response = await api.post(`/api/groups/${groupId}/members`, {
        user_id: userId
      })
      return response.data.data || response.data
    },
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['group', variables.groupId] })
      toast.success('Member added successfully')
    },
    onError: (error) => {
      const message = error.response?.data?.error || 'Failed to add member'
      toast.error(message)
    }
  })
}

// Remove member from group
export const useRemoveMember = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ groupId, userId }) => {
      const response = await api.delete(`/api/groups/${groupId}/members/${userId}`)
      return response.data.data || response.data
    },
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['group', variables.groupId] })
      toast.success('Member removed successfully')
    },
    onError: (error) => {
      const message = error.response?.data?.error || 'Failed to remove member'
      toast.error(message)
    }
  })
}

// Leave group
export const useLeaveGroup = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (groupId) => {
      const response = await api.post(`/api/groups/${groupId}/leave`, {})
      return response.data.data || response.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['groups'] })
      toast.success('Left group successfully')
    },
    onError: (error) => {
      const message = error.response?.data?.error || 'Failed to leave group'
      toast.error(message)
    }
  })
}

// Send message to group
export const useSendGroupMessage = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ groupId, content, currentUserId }) => {
      const response = await api.post(`/api/groups/${groupId}/messages`, {
        content
      })
      return response.data.data || response.data
    },
    // Optimistic update - show message immediately
    onMutate: async ({ groupId, content, currentUserId }) => {
      await queryClient.cancelQueries({ queryKey: ['group-messages', groupId] })

      const previousMessages = queryClient.getQueryData(['group-messages', groupId])

      const optimisticMessage = {
        id: `temp-${Date.now()}`,
        group_id: groupId,
        sender_id: currentUserId,
        message_content: content,
        created_at: new Date().toISOString(),
        is_deleted: false,
        isOptimistic: true,
        sender: {
          id: currentUserId,
          display_name: 'You'
        }
      }

      queryClient.setQueryData(['group-messages', groupId], (old) => {
        const messages = old?.messages || old || []
        return {
          ...old,
          messages: [...messages, optimisticMessage]
        }
      })

      return { previousMessages, groupId }
    },
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['groups'] })
      queryClient.invalidateQueries({ queryKey: ['group-messages', variables.groupId] })
    },
    onError: (error, variables, context) => {
      const message = error.response?.data?.error || 'Failed to send message'
      toast.error(message)

      if (context?.previousMessages) {
        queryClient.setQueryData(
          ['group-messages', context.groupId],
          context.previousMessages
        )
      }
    }
  })
}

// Mark group as read
export const useMarkGroupAsRead = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (groupId) => {
      const response = await api.post(`/api/groups/${groupId}/read`, {})
      return response.data.data || response.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['groups'] })
    },
    onError: (error) => {
      console.error('Failed to mark group as read:', error)
    }
  })
}

// Get available members to add
export const useAvailableMembers = (groupId, options = {}) => {
  return useQuery({
    queryKey: ['available-members', groupId],
    queryFn: async () => {
      const response = await api.get(`/api/groups/${groupId}/available-members`)
      return response.data.data || response.data
    },
    enabled: !!groupId,
    staleTime: 30000,
    ...options
  })
}
