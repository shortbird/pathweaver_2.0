import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../../services/api'
import toast from 'react-hot-toast'
import { useAuth } from '../../contexts/AuthContext'

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

// Send a message (supports replies and attachments)
export const useSendMessage = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ targetUserId, content, replyToMessageId, attachments }) => {
      const body = { content }
      if (replyToMessageId) body.reply_to_message_id = replyToMessageId
      if (attachments?.length) body.attachments = attachments
      const response = await api.post(`/api/messages/conversations/${targetUserId}/send`, body)
      return response.data.data || response.data
    },
    // Optimistic update - show message immediately
    onMutate: async ({ targetUserId, content, currentUserId, attachments, replyToPreview }) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: ['conversation-messages', targetUserId] })

      // Snapshot previous value
      const previousMessages = queryClient.getQueryData(['conversation-messages', targetUserId])

      // Optimistically update with new message
      const optimisticMessage = {
        id: `temp-${Date.now()}`, // Temporary ID
        sender_id: currentUserId,
        recipient_id: targetUserId,
        message_content: content,
        created_at: new Date().toISOString(),
        read_at: null,
        reactions: [],
        attachments: attachments || [],
        reply_to: replyToPreview || null,
        edited_at: null,
        is_deleted: false,
        isOptimistic: true // Flag to identify optimistic messages
      }

      queryClient.setQueryData(['conversation-messages', targetUserId], (old) => {
        const messages = old?.messages || old || []
        return {
          ...old,
          messages: [...messages, optimisticMessage]
        }
      })

      // Return context for rollback
      return { previousMessages, targetUserId }
    },
    onSuccess: (data, variables) => {
      // Invalidate conversations list to update last message preview
      queryClient.invalidateQueries({ queryKey: ['conversations'] })

      // Refetch messages to get server-side data (replaces optimistic message)
      queryClient.invalidateQueries({
        queryKey: ['conversation-messages', variables.targetUserId]
      })

      // Invalidate unread count
      queryClient.invalidateQueries({ queryKey: ['unread-count'] })
    },
    onError: (error, variables, context) => {
      const message = error.response?.data?.error || 'Failed to send message'
      toast.error(message)

      // Rollback optimistic update on error
      if (context?.previousMessages) {
        queryClient.setQueryData(
          ['conversation-messages', context.targetUserId],
          context.previousMessages
        )
      }
    }
  })
}

// Toggle a reaction on a DM. Backend returns { added, reactions } where
// reactions is the full up-to-date list for the message.
export const useToggleMessageReaction = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ messageId, emoji }) => {
      const response = await api.post(`/api/messages/${messageId}/reactions`, { emoji })
      return response.data.data || response.data
    },
    onSuccess: (data, { conversationId, messageId }) => {
      if (!data?.reactions) return
      queryClient.setQueryData(['conversation-messages', conversationId], (old) => {
        if (!old?.messages) return old
        return {
          ...old,
          messages: old.messages.map((m) =>
            m.id === messageId ? { ...m, reactions: data.reactions } : m
          )
        }
      })
    },
    onError: (error) => {
      toast.error(error.response?.data?.error || 'Failed to update reaction')
    }
  })
}

// Edit own DM
export const useEditMessage = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ messageId, content }) => {
      const response = await api.patch(`/api/messages/${messageId}`, { content })
      return response.data.data || response.data
    },
    onSuccess: (data, { conversationId, messageId, content }) => {
      queryClient.setQueryData(['conversation-messages', conversationId], (old) => {
        if (!old?.messages) return old
        return {
          ...old,
          messages: old.messages.map((m) =>
            m.id === messageId
              ? { ...m, message_content: content, edited_at: data?.edited_at || new Date().toISOString() }
              : m
          )
        }
      })
    },
    onError: (error) => {
      toast.error(error.response?.data?.error || 'Failed to edit message')
    }
  })
}

// Delete own DM (renders as a tombstone; superadmins keep the content)
export const useDeleteMessage = () => {
  const queryClient = useQueryClient()
  const { user } = useAuth()
  const revealDeleted = user?.role === 'superadmin'

  return useMutation({
    mutationFn: async ({ messageId }) => {
      const response = await api.delete(`/api/messages/${messageId}`)
      return response.data.data || response.data
    },
    onSuccess: (data, { conversationId, messageId }) => {
      queryClient.setQueryData(['conversation-messages', conversationId], (old) => {
        if (!old?.messages) return old
        return {
          ...old,
          messages: old.messages.map((m) =>
            m.id === messageId
              ? (revealDeleted
                  ? { ...m, is_deleted: true, deleted_visible_to_admin: true, reactions: [] }
                  : { ...m, is_deleted: true, message_content: '', attachments: [], reactions: [] })
              : m
          )
        }
      })
      queryClient.invalidateQueries({ queryKey: ['conversations'] })
    },
    onError: (error) => {
      toast.error(error.response?.data?.error || 'Failed to delete message')
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

// Get messaging contacts (advisors, students)
export const useMessagingContacts = (userId, options = {}) => {
  return useQuery({
    queryKey: ['messaging-contacts', userId],
    queryFn: async () => {
      const response = await api.get('/api/messages/contacts')
      return response.data.data || response.data
    },
    enabled: !!userId,
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
    refetchOnWindowFocus: false,
    ...options
  })
}
