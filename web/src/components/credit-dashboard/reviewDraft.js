/**
 * A reviewer's half-written note, kept while they step out to the student's
 * profile and handed back when the grader reopens the same item.
 *
 * Keyed by completion, so a note can only ever come back on the work it was
 * written about. Session storage: it outlives the navigation, not the tab.
 * Read without removing, because React's dev-mode double effect would
 * otherwise take the draft on the first run and find nothing on the second;
 * the first edit clears it instead (clearDraft, from the decision hook).
 * Every access is guarded: storage can be blocked, and a lost draft is a
 * nuisance, not a failure.
 */
const key = (completionId) => `creditReviewDraft:${completionId}`

export function stashDraft(completionId, text) {
  if (!completionId) return
  try {
    if (text && text.trim()) sessionStorage.setItem(key(completionId), text)
    else sessionStorage.removeItem(key(completionId))
  } catch {
    // Storage blocked: the draft is simply not kept.
  }
}

export function readDraft(completionId) {
  if (!completionId) return ''
  try {
    return sessionStorage.getItem(key(completionId)) || ''
  } catch {
    return ''
  }
}

export function clearDraft(completionId) {
  if (!completionId) return
  try {
    sessionStorage.removeItem(key(completionId))
  } catch {
    // Nothing was kept, so there is nothing to clear.
  }
}
