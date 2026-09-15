import api from './api'

/**
 * Friends (peer connections) -- the client's one map of /api/connections.
 *
 * Every read takes an optional `studentId`: with it the request is made ABOUT
 * that student through student scope, which is how a parent works a
 * dependent's friends from the family dashboard. Without it the caller is the
 * student. The rules live on the server (backend/services/peer_policy_service
 * and peer_connection_service); this module decides nothing.
 */

const unwrap = (res) => res.data?.data ?? res.data ?? {}
const scoped = (studentId) => (studentId ? { student_id: studentId } : {})

export const getEligibility = (studentId) =>
  api.get('/api/connections/eligibility', { params: scoped(studentId) }).then(unwrap)

export const getConnections = (studentId) =>
  api.get('/api/connections', { params: scoped(studentId) }).then(unwrap)

export const getSuggestions = (studentId) =>
  api.get('/api/connections/suggestions', { params: scoped(studentId) }).then(unwrap)

export const issueCode = (studentId) =>
  api.post('/api/connections/code', { ...scoped(studentId) }).then(unwrap)

/** By another student's code, or by naming a classmate. `source` is
 *  'classmates' | 'school' for a peer_id, 'link' for a code that arrived by
 *  invite link, 'parent' for a parent naming a child from the school directory. */
export const requestFriend = ({ code, peerId, source, studentId }) => {
  const body = { ...scoped(studentId) }
  if (code) body.code = String(code).trim().toUpperCase()
  if (peerId) body.peer_id = peerId
  if (source) body.source = source
  return api.post('/api/connections/request', body).then(unwrap)
}

export const respond = (connectionId, accept, studentId) =>
  api.post(`/api/connections/${connectionId}/respond`, { accept, ...scoped(studentId) }).then(unwrap)

export const revoke = (connectionId, studentId) =>
  api.post(`/api/connections/${connectionId}/revoke`, { ...scoped(studentId) }).then(unwrap)

export const submitDob = (dateOfBirth) =>
  api.post('/api/connections/age-check', { date_of_birth: dateOfBirth }).then(unwrap)

/** The invite link a code travels in. app., not www: www 404s any SPA route
 *  missing from its redirect list. */
export const inviteLinkFor = (code) => `https://app.optioeducation.com/f/${code}`

/** The code inside an invite link, or the raw code. */
export const codeFrom = (value) => {
  const v = String(value || '').trim()
  const m = v.match(/\/f\/([A-Z2-9]{8})\b/i)
  if (m) return m[1].toUpperCase()
  return /^[A-Z2-9]{8}$/i.test(v) ? v.toUpperCase() : null
}

// -- reactions and peer comments --------------------------------------------

/** The palette, in display order. Mirrors REACTIONS in
 *  backend/services/peer_connection_service.py. */
export const REACTIONS = [
  { key: 'proud', label: 'Proud of you', emoji: '🌟' },
  { key: 'inspired', label: 'This inspires me', emoji: '💡' },
  { key: 'curious', label: 'Tell me more', emoji: '🤔' },
  { key: 'keep_going', label: 'Keep going', emoji: '💪' },
  { key: 'thanks', label: 'Thanks for sharing', emoji: '🙏' },
]

const target = ({ completionId, learningEventId }) => ({
  task_completion_id: completionId || null,
  learning_event_id: learningEventId || null,
})

export const setReaction = ({ studentId, completionId, learningEventId }, reaction) =>
  api.post('/api/connections/reactions', { student_id: studentId, reaction, ...target({ completionId, learningEventId }) })

export const clearReaction = ({ completionId, learningEventId }) => {
  const params = completionId ? { task_completion_id: completionId } : { learning_event_id: learningEventId }
  return api.delete('/api/connections/reactions', { params })
}

export const getPeerComments = ({ studentId, completionId, learningEventId }) => {
  const params = { student_id: studentId }
  if (completionId) params.task_completion_id = completionId
  else if (learningEventId) params.learning_event_id = learningEventId
  return api.get('/api/connections/comments', { params }).then((r) => unwrap(r).comments || [])
}

export const postPeerComment = ({ studentId, completionId, learningEventId }, text) =>
  api.post('/api/connections/comments', { student_id: studentId, text, ...target({ completionId, learningEventId }) }).then(unwrap)

export const deletePeerComment = (commentId) =>
  api.delete(`/api/connections/comments/${commentId}`)

// -- the parent's side --------------------------------------------------------

export const getChildPolicy = (childId) =>
  api.get(`/api/connections/children/${childId}/policy`).then(unwrap)

export const setChildPolicy = (childId, patch) =>
  api.put(`/api/connections/children/${childId}/policy`, patch).then(unwrap)

export const getChildFriendsCount = (childId) =>
  api.get(`/api/connections/children/${childId}/friends-count`).then((r) => unwrap(r).active || 0)

export const getChildActivity = (childId, days = 30) =>
  api.get(`/api/connections/children/${childId}/activity`, { params: { days } }).then(unwrap)
