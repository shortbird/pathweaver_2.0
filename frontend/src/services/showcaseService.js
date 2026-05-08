import api from './api'

// ─── Marketer / showcase queue ────────────────────────────────────────────────

export const fetchQueue = async ({ page = 1, limit = 30, status, pillar, hasImage } = {}) => {
  const params = { page, limit }
  if (status) params.status = status
  if (pillar) params.pillar = pillar
  if (hasImage === true) params.has_image = '1'
  if (hasImage === false) params.has_image = '0'
  const { data } = await api.get('/api/showcase/queue', { params })
  return data
}

export const fetchEvidenceDetail = async (evidenceId) => {
  const { data } = await api.get(`/api/showcase/evidence/${evidenceId}`)
  return data
}

export const updateEvidenceStatus = async (evidenceId, body) => {
  const { data } = await api.patch(`/api/showcase/evidence/${evidenceId}/status`, body)
  return data
}

export const recordPost = async (evidenceId, { platform, postUrl, captionUsed, notes }) => {
  const { data } = await api.post(`/api/showcase/evidence/${evidenceId}/post`, {
    platform,
    post_url: postUrl,
    caption_used: captionUsed,
    notes,
  })
  return data
}

export const updatePost = async (postId, body) => {
  const { data } = await api.patch(`/api/showcase/posts/${postId}`, body)
  return data
}

export const fetchPendingTakedowns = async () => {
  const { data } = await api.get('/api/showcase/takedowns')
  return data
}

// ─── AI assist ────────────────────────────────────────────────────────────────

export const generateCaptions = async (evidenceId) => {
  const { data } = await api.post(`/api/showcase/evidence/${evidenceId}/ai/captions`, {})
  return data
}

export const generateAltText = async (evidenceId) => {
  const { data } = await api.post(`/api/showcase/evidence/${evidenceId}/ai/alt-text`, {})
  return data
}

export const generateQuotePull = async (evidenceId) => {
  const { data } = await api.post(`/api/showcase/evidence/${evidenceId}/ai/quote-pull`, {})
  return data
}

// ─── Family-dashboard view ────────────────────────────────────────────────────

export const fetchStudentPosts = async (studentId) => {
  const { data } = await api.get(`/api/showcase/student/${studentId}/posts`)
  return data
}

export const parentRevokeConsent = async (studentId, reason) => {
  const { data } = await api.post(`/api/showcase/student/${studentId}/revoke`, { reason })
  return data
}

// ─── Admin consent panel ──────────────────────────────────────────────────────

export const fetchConsentList = async ({ page = 1, limit = 50, search, activeOnly } = {}) => {
  const params = { page, limit }
  if (search) params.search = search
  if (activeOnly) params.active_only = '1'
  const { data } = await api.get('/api/admin/showcase/consent', { params })
  return data
}

export const fetchConsentDetail = async (studentId) => {
  const { data } = await api.get(`/api/admin/showcase/consent/${studentId}`)
  return data
}

export const upsertConsent = async (studentId, fields) => {
  const { data } = await api.put(`/api/admin/showcase/consent/${studentId}`, fields)
  return data
}

export const adminRevokeConsent = async (studentId, reason) => {
  const { data } = await api.post(`/api/admin/showcase/consent/${studentId}/revoke`, { reason })
  return data
}

export const setShowcasePermission = async (targetUserId, canView) => {
  const { data } = await api.post(`/api/admin/showcase/permission/${targetUserId}`, {
    can_view_showcase: canView,
  })
  return data
}
