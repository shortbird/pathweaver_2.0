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

/**
 * The safety screen's tracker for the superadmin home: per surface, what was
 * screened, held and is still waiting on the sweep, plus the model's cost for
 * the window. One SQL function behind it; superadmin only.
 */
export const getScreenStats = (days = 7) =>
  api.get('/api/admin/moderation/screen-stats', { params: { days } }).then((r) => r.data)
