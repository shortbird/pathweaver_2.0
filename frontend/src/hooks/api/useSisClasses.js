import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback } from 'react'

import api from '../../services/api'
import { withOrg } from '../../pages/sis/useSisOrg'
import { queryKeys } from '../../utils/queryKeys'

/**
 * The SIS class catalog (QF-03).
 *
 * ClassesPage is the highest-churn page in the console -- 44 commits in six
 * months, more than twice the next one -- and it fetched by hand: one
 * `Promise.all` of seven requests feeding ten `useState`s, plus two more GETs
 * for the advisory double-booking checks. Every write path then called
 * `load()` again, so saving one class refetched the whole catalog, and every
 * return to the page from a roster or a report refetched it a second time with
 * nothing cached in between.
 *
 * The advisory double-booking checks are a SEPARATE query, in
 * ./useSisScheduleConflicts -- they are re-run after any save that can touch a
 * teacher or a room, and re-running the catalog's five requests to answer "is
 * this class double-booked now" would be worse than the hand-rolled version
 * this replaces.
 *
 * Both key on orgId, not just the URL. A superadmin switches orgs inside one
 * session, and a cache keyed only by path would hand them the previous org's
 * classes.
 */

// Optio courses a partner can enroll families into: published, public,
// project-based enrichment (not the org's own, not credit-bearing, not a
// college/dual-credit course code like "HIST 1301").
const COURSE_CODE_RE = /^[A-Za-z]{2,8}\s\d{3,4}\b/
const isSelectableCourse = (course, orgId) =>
  course.status === 'published' &&
  course.visibility === 'public' &&
  course.organization_id !== orgId &&
  !course.credit_subject &&
  !COURSE_CODE_RE.test((course.title || '').trim())

const EMPTY = { data: {} }

/**
 * The catalog: the org's classes, the Optio courses it can enroll into, its
 * staff, per-course settings, and the school-day blocks and rooms the editor
 * offers.
 *
 * `isAdmin` is a real access decision, not an optimisation. Staff and
 * course-settings are ADMIN_ROLES-gated and this page is open to teachers, so
 * asking as a teacher fired two guaranteed 403s on every load (Sentry
 * OPTIO-WEB-4/5). Neither answer is used outside the admin-only editor.
 */
export const useSisClassCatalog = (orgId, { showArchived = false, isAdmin = false } = {}) => useQuery({
  queryKey: queryKeys.sis.classCatalog(orgId, { showArchived, isAdmin }),
  queryFn: async () => {
    const [cls, crs, stf, ct, sched] = await Promise.all([
      api.get(withOrg(`/api/sis/classes${showArchived ? '?include_archived=true' : ''}`, orgId)),
      api.get('/api/courses?filter=all').catch(() => EMPTY),
      isAdmin ? api.get(withOrg('/api/sis/staff', orgId)).catch(() => EMPTY) : Promise.resolve(EMPTY),
      isAdmin ? api.get(withOrg('/api/sis/course-settings', orgId)).catch(() => EMPTY) : Promise.resolve(EMPTY),
      // Deliberately NOT /api/admin/organizations/:id: that endpoint is
      // org_admin-gated, so a campus coordinator got a 403 here and the editor
      // silently degraded to a free-text classroom box and raw time inputs -- a
      // bug only they could see, since a masquerading superadmin is authorized
      // as themselves.
      api.get(withOrg('/api/sis/schedule-settings', orgId)).catch(() => EMPTY),
    ])
    const courseSettings = {}
    for (const row of ct.data?.course_settings || []) courseSettings[row.course_id] = row
    return {
      classes: cls.data?.classes || [],
      courses: (crs.data?.courses || []).filter((c) => isSelectableCourse(c, orgId)),
      staff: stf.data?.staff || [],
      courseSettings,
      courseTuition: ct.data?.optio_course_tuition_cents ?? null,
      timeBlocks: sched.data?.time_blocks || [],
      rooms: sched.data?.rooms || [],
    }
  },
  enabled: !!orgId,
  // Staff edit this constantly during a scheduling session, and every write
  // path here refetches explicitly anyway.
  staleTime: 30 * 1000,
})

/**
 * Write one class into the cached catalog without a round trip.
 *
 * Used by the registration toggle, which is optimistic on purpose: a refetch
 * would blank the table and collapse whichever row or modal was open.
 */
export const useCatalogPatch = (orgId, { showArchived = false, isAdmin = false } = {}) => {
  const qc = useQueryClient()
  const key = queryKeys.sis.classCatalog(orgId, { showArchived, isAdmin })
  return useCallback((classId, patch) => {
    qc.setQueryData(key, (old) => (old ? {
      ...old,
      classes: old.classes.map((c) => (c.id === classId ? { ...c, ...patch } : c)),
    } : old))
  }, [qc, JSON.stringify(key)])   // eslint-disable-line react-hooks/exhaustive-deps
}

/**
 * The page's write surface. Plain functions rather than `useMutation`: none of
 * these needs react-query's pending/error state -- the page already reports
 * both through toasts -- and several are composites (create a class, then its
 * meetings, then its image) that a mutation would only wrap.
 *
 * What they buy is that ClassesPage no longer calls `api` at all: every
 * endpoint this page touches is named in one file.
 */
export const sisClassApi = {
  create: (body) => api.post('/api/sis/classes', body),
  update: (classId, body) => api.patch(`/api/sis/classes/${classId}`, body),
  archive: (classId, orgId) => api.delete(`/api/sis/classes/${classId}?organization_id=${orgId}`),
  restore: (classId, orgId) => api.post(`/api/sis/classes/${classId}/restore?organization_id=${orgId}`, {}),
  offerNextSeat: (classId, orgId) =>
    api.post(`/api/sis/classes/${classId}/waitlist/offer-next`, { organization_id: orgId }),
  addMeeting: (classId, meeting) => api.post(`/api/sis/classes/${classId}/meetings`, meeting),
  deleteMeeting: (classId, meetingId, orgId) =>
    api.delete(`/api/sis/classes/${classId}/meetings/${meetingId}?organization_id=${orgId}`),
  uploadImage: (classId, orgId, imageFile) => {
    const form = new FormData()
    form.append('file', imageFile)
    return api.post(`/api/sis/classes/${classId}/image?organization_id=${orgId}`, form)
  },
}

export default useSisClassCatalog
