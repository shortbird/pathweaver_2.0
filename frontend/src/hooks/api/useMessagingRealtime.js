/**
 * Real-time messaging hook.
 *
 * Subscribes to the open conversation's Supabase Realtime Broadcast topic
 * (`dm:{conversation_id}` or `group:{group_id}`) and applies incoming events
 * directly to the react-query cache (setQueryData) so the thread updates
 * instantly without refetching. The existing polling on the message queries
 * remains as a fallback.
 *
 * Backend events:
 *   'message'   payload = full enriched message
 *   'reactions' { message_id, reactions }
 *   'edited'    { message_id, content, edited_at }
 *   'deleted'   { message_id }
 *   'pinned'    { pinned_message_id }          (groups only)
 *   'settings'  { announcement_only }          (groups only)
 */

import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../services/supabaseClient'

// Broadcast reaction payloads are shared across users, so they can't carry a
// per-user `reacted` flag reliably. Preserve the local user's own `reacted`
// state per emoji when applying a broadcast update.
const mergeReactions = (existing = [], incoming = []) =>
  incoming.map((r) => {
    const prev = existing.find((e) => e.emoji === r.emoji)
    return { ...r, reacted: typeof r.reacted === 'boolean' ? r.reacted : (prev?.reacted || false) }
  })

/**
 * @param {object} params
 * @param {'dm'|'group'} params.kind - Conversation type (topic prefix)
 * @param {string} params.id - Conversation/group id
 * @param {boolean} [params.enabled=true]
 */
export const useMessagingRealtime = ({ kind, id, enabled = true }) => {
  const queryClient = useQueryClient()

  useEffect(() => {
    if (!enabled || !kind || !id) return undefined

    const topic = `${kind}:${id}`
    const messagesKey = kind === 'group' ? ['group-messages', id] : ['conversation-messages', id]

    const updateMessages = (updater) => {
      queryClient.setQueryData(messagesKey, (old) => {
        if (!old?.messages) return old
        return { ...old, messages: updater(old.messages) }
      })
    }

    // The group-details cache may be shaped { group: {...} } or the group itself.
    const updateGroup = (patch) => {
      queryClient.setQueryData(['group', id], (old) => {
        if (!old) return old
        if (old.group) return { ...old, group: { ...old.group, ...patch } }
        return { ...old, ...patch }
      })
    }

    const channel = supabase
      .channel(topic)
      .on('broadcast', { event: 'message' }, ({ payload }) => {
        if (!payload?.id) return
        updateMessages((messages) =>
          messages.some((m) => m.id === payload.id) ? messages : [...messages, payload]
        )
      })
      .on('broadcast', { event: 'reactions' }, ({ payload }) => {
        if (!payload?.message_id) return
        updateMessages((messages) =>
          messages.map((m) =>
            m.id === payload.message_id
              ? { ...m, reactions: mergeReactions(m.reactions, payload.reactions || []) }
              : m
          )
        )
      })
      .on('broadcast', { event: 'edited' }, ({ payload }) => {
        if (!payload?.message_id) return
        updateMessages((messages) =>
          messages.map((m) =>
            m.id === payload.message_id
              ? { ...m, message_content: payload.content, edited_at: payload.edited_at }
              : m
          )
        )
      })
      .on('broadcast', { event: 'deleted' }, ({ payload }) => {
        if (!payload?.message_id) return
        updateMessages((messages) =>
          messages.map((m) =>
            m.id === payload.message_id
              ? { ...m, is_deleted: true, message_content: '', attachments: [], reactions: [] }
              : m
          )
        )
      })
      .on('broadcast', { event: 'pinned' }, ({ payload }) => {
        if (kind !== 'group') return
        const pinnedId = payload?.pinned_message_id || null
        if (!pinnedId) {
          updateGroup({ pinned_message: null })
          return
        }
        // Build the pinned preview from the loaded thread if we have it;
        // otherwise fall back to a refetch of the group details.
        const cached = queryClient.getQueryData(messagesKey)
        const msg = cached?.messages?.find((m) => m.id === pinnedId)
        if (msg) {
          updateGroup({
            pinned_message: {
              id: msg.id,
              sender: msg.sender,
              message_content: msg.message_content,
              created_at: msg.created_at
            }
          })
        } else {
          queryClient.invalidateQueries({ queryKey: ['group', id] })
        }
      })
      .on('broadcast', { event: 'settings' }, ({ payload }) => {
        if (kind !== 'group') return
        if (typeof payload?.announcement_only === 'boolean') {
          updateGroup({ announcement_only: payload.announcement_only })
        }
      })
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [kind, id, enabled, queryClient])
}

export default useMessagingRealtime
