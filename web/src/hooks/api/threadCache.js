/**
 * The three rules that keep a thread's message list honest while a send is
 * in flight. Shared by the DM and group hooks and by useMessagingRealtime;
 * the mobile app carries the same three (hooks/useMessages.ts,
 * hooks/useMessagingRealtime.ts).
 *
 * A send puts an optimistic bubble in the list at once and the saved row
 * arrives by two roads -- the send response, and the Realtime broadcast the
 * backend fires to the whole thread -- in either order. Meanwhile the poll
 * keeps landing. What used to happen (2026-09-15, web and mobile alike):
 *
 *   - The broadcast appended the saved row beside the optimistic bubble
 *     (different id), so the message showed TWICE until a refetch replaced
 *     the list.
 *   - A poll that was in flight when the send started landed after the
 *     bubble and replaced the list WITHOUT it. The message vanished until
 *     the next poll, and the sender sent it again.
 */

// A local row this young that the server's page does not have yet is one the
// page missed, not one that was removed. Older than this and absent, it is
// gone for a reason.
const RECENT_MS = 60000

const ageMs = (m) => Date.now() - new Date(m.created_at || 0).getTime()

/**
 * Merge a freshly fetched page over the list on screen. The page wins for
 * every row it carries; local rows it lacks survive only while they are
 * optimistic or younger than RECENT_MS.
 */
export const mergeThreadPage = (local, fresh) => {
  const page = fresh || []
  if (!local?.length) return page
  const seen = new Set(page.map((m) => m.id))
  const kept = local.filter((m) => !seen.has(m.id) && (m.isOptimistic || ageMs(m) < RECENT_MS))
  return kept.length ? [...page, ...kept] : page
}

/**
 * Apply a broadcast 'message' event. The sender's own optimistic bubble is
 * replaced in place when the broadcast beats the send response; anything
 * already present by id is left alone.
 */
export const appendRealtimeMessage = (messages, incoming) => {
  if (!incoming?.id) return messages
  if (messages.some((m) => m.id === incoming.id)) return messages
  const i = messages.findIndex((m) =>
    m.isOptimistic && m.sender_id === incoming.sender_id
      && (m.message_content || '') === (incoming.message_content || ''))
  if (i >= 0) {
    const next = [...messages]
    next[i] = { ...incoming, isOptimistic: false }
    return next
  }
  return [...messages, incoming]
}

/**
 * Apply a send response. The optimistic bubble becomes the saved row in
 * place; if the broadcast already delivered the row, the bubble is dropped;
 * if a stale poll already dropped the bubble, the row is appended so the
 * sender's message is on screen either way.
 */
export const settleOptimistic = (messages, optimisticId, saved) => {
  if (!messages) return messages
  if (saved?.id && messages.some((m) => m.id === saved.id)) {
    return messages.filter((m) => m.id !== optimisticId)
  }
  const i = messages.findIndex((m) => m.id === optimisticId)
  if (i >= 0) {
    const next = [...messages]
    next[i] = saved ? { ...next[i], ...saved, isOptimistic: false } : { ...next[i], isOptimistic: false }
    return next
  }
  return saved?.id ? [...messages, saved] : messages
}

/** The cache entry shape is { messages, ...rest }; patch just the list. */
export const patchThread = (old, fn) => (old?.messages ? { ...old, messages: fn(old.messages) } : old)
