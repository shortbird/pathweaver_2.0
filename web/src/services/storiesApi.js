import api from './api'

/**
 * Thin wrappers over the superadmin stories endpoints (backend/routes/stories/).
 *
 * Every call resolves to the payload inside the API v1 envelope
 * (`{ data: {...} }`), so a component reads `res.story` rather than
 * `res.data.data.story`. Errors are left as axios errors; use `errorDetails`
 * to read the v1 `error.details` object: a 409 on publish carries
 * `existing_story_id`, a 400 on publish-from-review carries `blockers`.
 */
const unwrap = (res) => {
  const body = res?.data
  return body && typeof body === 'object' && 'data' in body ? body.data : body
}

/** The `details` object of an API v1 error, or an empty object. */
export const errorDetails = (err) => {
  const body = err?.response?.data
  // api.ts flattens a v1 error to a string and parks the object on
  // error_detail; a raw body (tests, a bypassed interceptor) still nests it.
  const nested = body?.error_detail || (typeof body?.error === 'object' ? body.error : null)
  return nested?.details || body?.details || body || {}
}

export const storiesApi = {
  /** POST /api/admin/stories/publish -> 202 { story } (status generating). */
  start: ({ sourceType, sourceId, mode = 'auto' }) =>
    api.post('/api/admin/stories/publish', {
      source_type: sourceType, source_id: sourceId, mode,
    }).then(unwrap),

  /** What the grader panel needs before it offers a Publish button. */
  eligibility: (completionId) =>
    api.get(`/api/admin/stories/eligibility/${completionId}`)
      .then(unwrap)
      .then((d) => (d && typeof d === 'object' && d.eligibility) ? d.eligibility : d),

  list: (status) =>
    api.get('/api/admin/stories', { params: status ? { status } : {} }).then(unwrap),

  get: (storyId) =>
    api.get(`/api/admin/stories/${storyId}`).then(unwrap),

  update: (storyId, body) =>
    api.put(`/api/admin/stories/${storyId}`, body).then(unwrap),

  regenerate: (storyId) =>
    api.post(`/api/admin/stories/${storyId}/regenerate`, {}).then(unwrap),

  publish: (storyId) =>
    api.post(`/api/admin/stories/${storyId}/publish`, {}).then(unwrap),

  unpublish: (storyId) =>
    api.post(`/api/admin/stories/${storyId}/unpublish`, {}).then(unwrap),

  consentFor: (studentUserId) =>
    api.get(`/api/admin/stories/consents/${studentUserId}`).then(unwrap),

  recordConsent: ({ studentUserId, scope, source, sourceRef, notes }) =>
    api.post('/api/admin/stories/consents', {
      student_user_id: studentUserId,
      scope,
      source,
      source_ref: sourceRef,
      notes,
    }).then(unwrap),

  revokeConsent: (consentId) =>
    api.post(`/api/admin/stories/consents/${consentId}/revoke`, {}).then(unwrap),
}

export default storiesApi
