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
export const addLeadNote = (leadId, body) => api.post(`/api/admin/crm/leads/${leadId}/notes`, { body })

// Suppressions
export const listSuppressions = (params = {}) =>
  api.get('/api/admin/crm/suppressions' + query(params))
export const addSuppression = ({ email, reason = 'manual' }) =>
  api.post('/api/admin/crm/suppressions', { email, reason })
export const removeSuppression = (suppressionId) =>
  api.delete(`/api/admin/crm/suppressions/${suppressionId}`)

// Sweep
export const runSweep = () => api.post('/api/admin/crm/sweep/run', {})
