import api from './api'

export const crmAPI = {
  // Campaigns
  getCampaigns: (params) => api.get('/api/admin/crm/campaigns', { params }),
  getCampaign: (id) => api.get(`/api/admin/crm/campaigns/${id}`),
  createCampaign: (data) => api.post('/api/admin/crm/campaigns', data),
  updateCampaign: (id, data) => api.put(`/api/admin/crm/campaigns/${id}`, data),
  deleteCampaign: (id) => api.delete(`/api/admin/crm/campaigns/${id}`),
  sendCampaign: (id, dryRun = false) => api.post(`/api/admin/crm/campaigns/${id}/send`, {}, { params: { dry_run: dryRun } }),
  previewCampaign: (id) => api.post(`/api/admin/crm/campaigns/${id}/preview`, {}),

  // Segments
  getSegments: () => api.get('/api/admin/crm/segments'),
  createSegment: (data) => api.post('/api/admin/crm/segments', data),
  updateSegment: (id, data) => api.put(`/api/admin/crm/segments/${id}`, data),
  deleteSegment: (id) => api.delete(`/api/admin/crm/segments/${id}`),
  previewSegment: (filterRules) => api.post('/api/admin/crm/segments/preview', { filter_rules: filterRules }),

  // Templates
  getTemplates: (includeYaml = true) => api.get('/api/admin/crm/templates', { params: { include_yaml: includeYaml } }),
  getTemplate: (key) => api.get(`/api/admin/crm/templates/${key}`),
  createTemplate: (data) => api.post('/api/admin/crm/templates', data),
  updateTemplate: (key, data) => api.put(`/api/admin/crm/templates/${key}`, data),
  deleteTemplate: (key) => api.delete(`/api/admin/crm/templates/${key}`),
  previewTemplate: (key, sampleData) => api.post(`/api/admin/crm/templates/${key}/preview`, { sample_data: sampleData }),
  syncTemplates: (keys) => api.post('/api/admin/crm/templates/sync', { template_keys: keys }),

  // Sequences
  getSequences: (isActive) => api.get('/api/admin/crm/sequences', { params: { is_active: isActive } }),
  getSequence: (id) => api.get(`/api/admin/crm/sequences/${id}`),
  createSequence: (data) => api.post('/api/admin/crm/sequences', data),
  updateSequence: (id, data) => api.put(`/api/admin/crm/sequences/${id}`, data),
  deleteSequence: (id) => api.delete(`/api/admin/crm/sequences/${id}`),
  activateSequence: (id) => api.post(`/api/admin/crm/sequences/${id}/activate`, {}),
  pauseSequence: (id) => api.post(`/api/admin/crm/sequences/${id}/pause`, {}),

  // Analytics
  getOverview: () => api.get('/api/admin/crm/analytics/overview'),
  getCampaignAnalytics: (id) => api.get(`/api/admin/crm/analytics/campaigns/${id}`)
}