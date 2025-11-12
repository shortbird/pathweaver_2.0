import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../../services/api'
import toast from 'react-hot-toast'

// Get all conversations for a user
export const useConversations = (userId, options = {}) => {
  return useQuery({
    queryKey: ['conversations', userId],
    queryFn: async () => {
      const response = await api.get('/api/messages/conversations')
      return response.data.data || response.data
    },
    enabled: !!userId,
    refetchInterval: 30000, // Refetch every 30 seconds (reduced from 10s)
    staleTime: 20000, // Consider data fresh for 20 seconds
    refetchOnWindowFocus: true, // Refetch when user returns to tab
    ...options
  })
}

// Get messages for a specific conversation
export const useConversationMessages = (conversationId, userId, options = {}) => {
  return useQuery({
    queryKey: ['conversation-messages', conversationId],
    queryFn: async () => {
      const response = await api.get(`/api/messages/conversations/${conversationId}`)
      return response.data.data || response.data
    },
    enabled: !!conversationId && !!userId,
    refetchInterval: 15000, // Refetch every 15 seconds (reduced from 5s)
    staleTime: 10000, // Consider data fresh for 10 seconds
    refetchOnWindowFocus: true, // Refetch when user returns to tab
    ...options
  })
}

// Send a message
export const useSendMessage = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ targetUserId, content }) => {
      const response = await api.post(`/api/messages/conversations/${targetUserId}/send`, {
        content
      })
      return response.data.data || response.data
    },
    onSuccess: (data, variables) => {
      // Invalidate conversations list to update last message preview
      queryClient.invalidateQueries({ queryKey: ['conversations'] })

      // Invalidate messages for this conversation
      queryClient.invalidateQueries({
        queryKey: ['conversation-messages', data.conversation_id]
      })

      // Invalidate unread count
      queryClient.invalidateQueries({ queryKey: ['unread-count'] })
    },
    onError: (error) => {
      const message = error.response?.data?.error || 'Failed to send message'
      toast.error(message)
    }
  })
}

// Mark message as read
export const useMarkAsRead = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (messageId) => {
      const response = await api.put(`/api/messages/${messageId}/read`, {})
      return response.data.data || response.data
    },
    onSuccess: () => {
      // Invalidate conversations to update unread counts
      queryClient.invalidateQueries({ queryKey: ['conversations'] })

      // Invalidate unread count
      queryClient.invalidateQueries({ queryKey: ['unread-count'] })
    },
    onError: (error) => {
      console.error('Failed to mark message as read:', error)
    }
  })
}

// Get unread count for badge
export const useUnreadCount = (userId, options = {}) => {
  return useQuery({
    queryKey: ['unread-count', userId],
    queryFn: async () => {
      const response = await api.get('/api/messages/unread-count')
      return response.data.data || response.data
    },
    enabled: !!userId,
    refetchInterval: 15000, // Refetch every 15 seconds
    staleTime: 10000,
    ...options
  })
}

// Check if user can message another user
export const useCanMessage = (targetUserId, options = {}) => {
  return useQuery({
    queryKey: ['can-message', targetUserId],
    queryFn: async () => {
      const response = await api.get(`/api/messages/can-message/${targetUserId}`)
      return response.data.data || response.data
    },
    enabled: !!targetUserId,
    staleTime: 60000, // Cache for 1 minute
    ...options
  })
}
