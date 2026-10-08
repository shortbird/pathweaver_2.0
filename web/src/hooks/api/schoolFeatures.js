import api from '../../services/api'

/**
 * The school's feature list (GET/PUT /api/school-features) and "Ask Optio"
 * (POST /api/school-features/request), for the Settings Features card. The
 * rules live in backend/services/school_features_service.py. A superadmin
 * names the console's selected org; an org admin's own org is the default.
 */

const unwrap = (res) => res.data?.data ?? res.data ?? {}
const params = (orgId) => (orgId ? { organization_id: orgId } : {})

export const getSchoolFeatures = (orgId) =>
  api.get('/api/school-features', { params: params(orgId) }).then(unwrap)

export const setSchoolFeatures = (orgId, changes) =>
  api.put('/api/school-features', changes, { params: params(orgId) }).then(unwrap)

/** A feature only Optio turns on: files one ticket per school and feature. */
export const requestSchoolFeature = (orgId, key) =>
  api.post('/api/school-features/request', { key }, { params: params(orgId) }).then(unwrap)
