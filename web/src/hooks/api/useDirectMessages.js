import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../../services/api'
import toast from 'react-hot-toast'
import { useAuth } from '../../contexts/AuthContext'
import { mergeThreadPage, settleOptimistic, patchThread } from './threadCache'

/**
 * Which threads the hooks read.
 *
 * Left out, they read the caller's own threads at /api/messages. `{ school:
 * true, orgId }` reads the org's shared "{School Name}" inbox at
 * /api/school-inbox instead: the same conversations table, read and answered
 * AS the school's inbox account, through routes gated on ADMIN_ROLES rather
 * than on being a participant. A superadmin names the org; everyone else is
 * locked to their own. The query keys carry the source, so the two lists
 * never share a cache entry, while a prefix invalidation (['conversations'])
 * still reaches both.
 *
 * Before this the school console had its own copy of every call here, polled
 * on its own timers, and had no Realtime at all.
 */
// The two roots are written out in full so backend/tests/
// test_client_api_paths_exist.py can see them as the routes they are: a
// bare prefix with the path interpolated straight after it scanned as a
// path nobody serves.
const CONVERSATIONS = {
  lms: '/api/messages/conversations',
  school: '/api/school-inbox/conversations',
}

/** The conversations endpoint for a source, plus `tail` ('' for the list,
 *  `/<id>`, `/<id>/send`, `/<id>/resolve`). */
export const sourcePath = (source, tail = '') => {
  if (!source?.school) return `${CONVERSATIONS.lms}${tail}`
  const url = `${CONVERSATIONS.school}${tail}`
  if (!source.orgId) return url
  const sep = url.includes('?') ? '&' : '?'
  return `${url}${sep}organization_id=${encodeURIComponent(source.orgId)}`
}
const sourceKey = (source) => (source?.school ? ['school', source.orgId || null] : [])
export const conversationsQueryKey = (userId, source) => ['conversations', userId, ...sourceKey(source)]
export const messagesQueryKey = (id, source) => ['conversation-messages', id, ...sourceKey(source)]

// Get all conversations for a user
export const useConversations = (userId, { source, ...options } = {}) => {
  return useQuery({
    queryKey: conversationsQueryKey(userId, source),
    queryFn: async () => {
      const response = await api.get(sourcePath(source))
      return response.data.data || response.data
    },
    enabled: !!userId,
    // The open thread updates over Realtime (useMessagingRealtime), so this
    // poll only has to catch traffic in threads that are NOT open. Every tick
    // re-runs the whole conversation list -- participants, unread recount,
    // avatar signing -- so it is deliberately slow, with focus refetch doing
    // the work of noticing you were away.
    refetchInterval: 120000,
    staleTime: 60000,
    refetchOnWindowFocus: true,
    ...options
  })
}

// Get messages for a specific conversation
export const useConversationMessages = (conversationId, userId, { source, ...options } = {}) => {
  const queryClient = useQueryClient()
  const key = messagesQueryKey(conversationId, source)
  return useQuery({
    queryKey: key,
    queryFn: async () => {
      const response = await api.get(sourcePath(source, `/${conversationId}`))
      const page = response.data.data || response.data
      // A poll that was in flight when a send started must not land on top
      // of the optimistic bubble and erase it -- see threadCache.
      const local = queryClient.getQueryData(key)?.messages
      return { ...page, messages: mergeThreadPage(local, page?.messages) }
    },
    enabled: !!conversationId && !!userId,
    // Realtime delivers messages for the open thread the moment they are sent;
    // this is the fallback for a dropped socket, not the delivery mechanism.
    refetchInterval: 60000,
    staleTime: 30000,
    refetchOnWindowFocus: true,
    ...options
  })
}

// Send a message (supports replies and attachments).
//
// `cacheId` is the id the open thread's message query is keyed on. On
// /messages that is the other user's id (contactToConversation), which is
// also the send target, so it can be left out. The school inbox keys its
// threads on the conversation row id and passes it explicitly.
export const useSendMessage = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ targetUserId, content, replyToMessageId, attachments, source }) => {
      const body = { content }
      if (replyToMessageId) body.reply_to_message_id = replyToMessageId
      // Durable pointers only -- never the signed display twin the upload
      // response also carries. The backend whitelists too; this keeps the
      // request honest.
      if (attachments?.length) {
        body.attachments = attachments.map(({ url, type, name, size }) => ({ url, type, name, size }))
      }
      const response = await api.post(sourcePath(source, `/${targetUserId}/send`), body)
      return response.data.data || response.data
    },
    // Optimistic update - show message immediately
    onMutate: async ({ targetUserId, content, currentUserId, attachments, replyToPreview, source, cacheId }) => {
      const key = messagesQueryKey(cacheId || targetUserId, source)
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: key })

      // Snapshot previous value
      const previousMessages = queryClient.getQueryData(key)

      // Optimistically update with new message
      const optimisticId = `temp-${Date.now()}`
      const optimisticMessage = {
        id: optimisticId,
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

      queryClient.setQueryData(key, (old) => {
        const messages = old?.messages || old || []
        return {
          ...old,
          messages: [...messages, optimisticMessage]
        }
      })

      // Return context for rollback
      return { previousMessages, key, optimisticId }
    },
    onSuccess: (data, variables, context) => {
      // The saved row replaces the bubble in place. No refetch of the
      // thread: the response IS the row, and the refetch was the window in
      // which the message showed twice (broadcast + bubble) or not at all.
      queryClient.setQueryData(context.key, (old) =>
        patchThread(old, (messages) => settleOptimistic(messages, context.optimisticId, data?.message)))

      // Invalidate conversations list to update last message preview
      queryClient.invalidateQueries({ queryKey: ['conversations'] })

      // Invalidate unread count
      queryClient.invalidateQueries({ queryKey: ['unread-count'] })
    },
    onError: (error, variables, context) => {
      const message = error.response?.data?.error || 'Failed to send message'
      toast.error(message)

      // Rollback optimistic update on error
      if (context?.previousMessages) {
        queryClient.setQueryData(context.key, context.previousMessages)
      }
    }
  })
}

// "This one is done" without sending anything: the thread comes off Needs a
// reply for THIS side only, and the other person sees nothing. Compared to
// last_message_at on read, so a newer message reopens it by itself.
export const useSetConversationResolved = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ conversationId, resolved, source }) => {
      const response = await api.post(
        sourcePath(source, `/${conversationId}/resolve`), { resolved })
      return response.data.data || response.data
    },
    onSuccess: (data, { conversationId, resolved, source, userId }) => {
      const at = data?.resolved_at ?? (resolved ? new Date().toISOString() : null)
      queryClient.setQueryData(conversationsQueryKey(userId, source), (old) => {
        if (!old?.conversations) return old
        return {
          ...old,
          conversations: old.conversations.map((c) =>
            c.id === conversationId ? { ...c, resolved_at: at } : c)
        }
      })
      toast.success(resolved ? 'Marked as handled' : 'Back in Needs a reply')
    },
    onError: (error) => {
      toast.error(error.response?.data?.error || 'Could not update the thread')
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

// Mark an entire conversation read in one request.
//
// Opening a thread reads all of it, so sending one PUT per unread message --
// each invalidating the conversation list on its way back -- meant a thread
// with twenty unread messages fired twenty writes and twenty refetches of the
// heaviest endpoint on the page while the user was reading it.
export const useMarkConversationAsRead = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (conversationId) => {
      const response = await api.post(`/api/messages/conversations/${conversationId}/read`, {})
      return response.data.data || response.data
    },
    onSuccess: (data) => {
      // Nothing changed hands if there was nothing unread; skip the refetch.
      if (!data?.marked_read) return
      queryClient.invalidateQueries({ queryKey: ['conversations'] })
      queryClient.invalidateQueries({ queryKey: ['unread-count'] })
    },
    onError: (error) => {
      // Non-fatal: the thread is on screen either way, and the next poll will
      // reconcile the badge. Not worth a toast.
      console.error('Failed to mark conversation as read:', error)
    }
  })
}

// Mark a single message as read. Prefer useMarkConversationAsRead when the
// whole thread is being opened.
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
