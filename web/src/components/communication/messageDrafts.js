/**
 * Unsent message drafts, one per (signed-in user, thread), in localStorage.
 *
 * Ticket e6cc5fe5 (iCreate campus coordinator, SIS /inbox): "Can we make our
 * drafts save when we switch out of messages and then come back to it?" A
 * half-written reply was lost whenever the composer unmounted -- switching
 * threads, leaving the inbox, or reloading.
 *
 * - The key carries the signed-in user's id, so two accounts on one browser
 *   never see each other's drafts.
 * - Only text is kept. Attachments are uploads in flight and are not restored.
 * - An empty (or whitespace-only) draft is never stored; emptying the box
 *   removes the key.
 * - Every storage call is wrapped: private windows, blocked site data and a
 *   full quota all throw, and none of that may stop someone typing or sending.
 *
 * Web + SIS only (owner decision 2026-10-07); mobile is not in scope.
 */
const PREFIX = 'optio:message-draft'

/** The storage key for a thread, or null when either half is missing (then
 *  nothing is kept). `threadId` should name the thread's kind as well as its
 *  id, e.g. `dm:<id>`, `group:<id>`, `school:<org>:<id>`. */
export const messageDraftKey = (userId, threadId) =>
  userId && threadId ? `${PREFIX}:${userId}:${threadId}` : null

/** The SIS inbox's key for a 1:1 thread. Keyed on the signed-in person, not
 *  the school account they may answer as, so each coordinator replying as the
 *  school keeps their own draft; a thread not yet created is `new:<person>`. */
export const schoolInboxDraftKey = (userId, { schoolSide, orgId, thread }) =>
  messageDraftKey(userId, `${schoolSide ? `school:${orgId || ''}:` : ''}dm:${thread?.id || `new:${thread?.other_user?.id}`}`)

export const readDraft = (key) => {
  if (!key) return ''
  try {
    return window.localStorage.getItem(key) || ''
  } catch {
    return ''
  }
}

export const writeDraft = (key, text) => {
  if (!key) return
  try {
    if (text && text.trim()) window.localStorage.setItem(key, text)
    else window.localStorage.removeItem(key)
  } catch {
    // Storage blocked or full: the draft just is not kept.
  }
}

export const clearDraft = (key) => {
  if (!key) return
  try {
    window.localStorage.removeItem(key)
  } catch {
    // Nothing to do.
  }
}
