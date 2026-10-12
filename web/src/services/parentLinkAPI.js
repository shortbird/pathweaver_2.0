import api from './api'

/**
 * Parent link requests -- the client's map of /api/parent-link-requests.
 *
 * A platform student names a parent email, the parent accepts from the
 * emailed link, and a superadmin approves. The rules live in
 * backend/services/parent_link_request_service.py; this module decides nothing.
 */

const unwrap = (res) => res.data?.data ?? res.data ?? {}

export const errorText = (err, fallback) => err?.response?.data?.error || fallback

export const getMine = () => api.get('/api/parent-link-requests/mine').then(unwrap)

export const sendRequest = (parentEmail) =>
  api.post('/api/parent-link-requests', { parent_email: parentEmail }).then(unwrap)

export const cancelRequest = () => api.delete('/api/parent-link-requests/mine').then(unwrap)

export const previewInvite = (token) =>
  api.get(`/api/parent-link-requests/invite/${encodeURIComponent(token)}`).then(unwrap)

export const acceptInvite = (token) =>
  api.post(`/api/parent-link-requests/invite/${encodeURIComponent(token)}/accept`, {}).then(unwrap)

export const adminList = () => api.get('/api/admin/parent-link-requests').then(unwrap)

export const adminDecide = (requestId, approve) =>
  api.post(`/api/admin/parent-link-requests/${requestId}/decide`, { approve }).then(unwrap)
