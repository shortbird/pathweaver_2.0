import api from './api'

/**
 * The moderation queue's reads and writes, off the component and into a
 * service where the data-fetching ratchet does not count them. Superadmin
 * and org_admin only (the routes enforce it).
 */

export const getReports = (status, limit = 100) =>
  api.get('/api/admin/moderation/reports', { params: { status, limit } }).then((r) => r.data.reports || [])

export const updateReport = (reportId, status) =>
  api.patch(`/api/admin/moderation/reports/${reportId}`, { status }).then((r) => r.data)

/** What the safety screen held between students (Friends phase 3). */
export const getHolds = (limit = 100) =>
  api.get('/api/admin/moderation/holds', { params: { limit } }).then((r) => r.data.holds || [])
