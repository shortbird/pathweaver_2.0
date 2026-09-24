/**
 * CRM admin API - every CRM admin endpoint path literal lives here.
 *
 * Paths mirror docs/CRM_REPLACEMENT_PLAN.md "API contract (canonical)"
 * exactly; backend/tests/test_client_api_paths_exist.py checks each literal
 * against the Flask url_map, so keep them as quoted template literals.
 *
 * CSRF rule: every POST sends a body object, even when there is nothing to
 * say - a bodyless POST fails the Content-Type check server-side.
 */
import api from '../../../services/api'

const query = (params = {}) => {
  const qs = new URLSearchParams()
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '' || value === 'all') return
    qs.set(key, value)
  })
  const s = qs.toString()
  return s ? `?${s}` : ''
}

// Overview
export const getOverview = () => api.get('/api/admin/crm/overview')

// Funnels
export const listFunnels = () => api.get('/api/admin/crm/funnels')
export const createFunnel = (data) => api.post('/api/admin/crm/funnels', { ...data })
export const getFunnel = (funnelId) => api.get(`/api/admin/crm/funnels/${funnelId}`)
export const updateFunnel = (funnelId, data) => api.put(`/api/admin/crm/funnels/${funnelId}`, { ...data })
export const deleteFunnel = (funnelId) => api.delete(`/api/admin/crm/funnels/${funnelId}`)
export const setFunnelStatus = (funnelId, status) =>
  api.post(`/api/admin/crm/funnels/${funnelId}/status`, { status })

// Steps
export const createStep = (funnelId, data = {}) =>
  api.post(`/api/admin/crm/funnels/${funnelId}/steps`, { ...data })
export const reorderSteps = (funnelId, stepIds) =>
  api.post(`/api/admin/crm/funnels/${funnelId}/steps/reorder`, { step_ids: stepIds })
export const updateStep = (stepId, data) => api.put(`/api/admin/crm/steps/${stepId}`, { ...data })
export const deleteStep = (stepId) => api.delete(`/api/admin/crm/steps/${stepId}`)
export const testSendStep = (stepId, draft = {}) =>
  api.post(`/api/admin/crm/steps/${stepId}/test-send`, { ...draft })

// Leads
export const listLeads = (params = {}) => api.get('/api/admin/crm/leads' + query(params))
export const createLead = (data) => api.post('/api/admin/crm/leads', { ...data })
export const getLead = (leadId) => api.get(`/api/admin/crm/leads/${leadId}`)
export const convertLead = (leadId) => api.post(`/api/admin/crm/leads/${leadId}/convert`, {})
export const exitLead = (leadId) => api.post(`/api/admin/crm/leads/${leadId}/exit`, {})
export const moveLead = (leadId, { funnel_id, step_order }) =>
  api.post(`/api/admin/crm/leads/${leadId}/move`, { funnel_id, step_order })
export const addLeadNote = (leadId, body, metOn = null, docUrl = '') =>
  api.post(`/api/admin/crm/leads/${leadId}/notes`, {
    body, met_on: metOn, ...(docUrl ? { doc_url: docUrl } : {}),
  })
export const deleteLeadNote = (leadId, noteId) =>
  api.delete(`/api/admin/crm/leads/${leadId}/notes/${noteId}`)
export const refreshLeadNoteDoc = (leadId, noteId) =>
  api.post(`/api/admin/crm/leads/${leadId}/notes/${noteId}/doc/refresh`, {})

// People - notes about any Optio user, not only leads. The person search
// reuses the admin user list.
export const searchPeople = (search) =>
  api.get('/api/admin/users' + query({ search, per_page: 20 }))
export const createPerson = (data) => api.post('/api/admin/crm/people', { ...data })
export const listRecentPersonNotes = () => api.get('/api/admin/crm/person-notes')
export const getPerson = (personId) => api.get(`/api/admin/crm/people/${personId}`)
// A note can attach the Google Doc the meeting notes live in; the backend
// copies its text onto the note. doc_url is sent only when there is one, and
// on an edit an empty string detaches the doc.
export const addPersonNote = (personId, { body, met_on, doc_url }) =>
  api.post(`/api/admin/crm/people/${personId}/notes`, {
    body, met_on, ...(doc_url ? { doc_url } : {}),
  })
export const updatePersonNote = (noteId, { body, met_on, doc_url }) =>
  api.put(`/api/admin/crm/person-notes/${noteId}`, {
    body, met_on, ...(doc_url !== undefined ? { doc_url } : {}),
  })
export const refreshPersonNoteDoc = (noteId) =>
  api.post(`/api/admin/crm/person-notes/${noteId}/doc/refresh`, {})
export const getGoogleDocsReader = () => api.get('/api/admin/crm/google-docs')
export const deletePersonNote = (noteId) => api.delete(`/api/admin/crm/person-notes/${noteId}`)

// Suppressions
export const listSuppressions = (params = {}) =>
  api.get('/api/admin/crm/suppressions' + query(params))
export const addSuppression = ({ email, reason = 'manual' }) =>
  api.post('/api/admin/crm/suppressions', { email, reason })
export const removeSuppression = (suppressionId) =>
  api.delete(`/api/admin/crm/suppressions/${suppressionId}`)

// Sweep
export const runSweep = () => api.post('/api/admin/crm/sweep/run', {})
