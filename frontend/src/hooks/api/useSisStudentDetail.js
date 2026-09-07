import { useQuery } from '@tanstack/react-query'

import api from '../../services/api'
import { queryKeys } from '../../utils/queryKeys'

/**
 * What the SIS student drawer reads and writes (QF-03).
 *
 * StudentDetailModal is seven panels behind a tab strip, and each one fetched
 * for itself: 23 hand-rolled call sites across one file. Two of those fetches
 * were duplicates of each other, which is the concrete thing this migration
 * fixes rather than merely tidies:
 *
 *   * `/students/:id/emergency-contacts` was fetched by the "Who to call" strip
 *     at the top of the Profile tab AND again by the editable Contacts section
 *     directly below it. Both are on screen at once, so opening a student made
 *     the same request twice, every time.
 *   * `/students/:id/record` was fetched by the Record tab and again by the
 *     Materials tab -- one response carrying both answers, asked for twice.
 *
 * Sharing a query key is what removes them: react-query dedupes in-flight
 * requests and serves the second reader from cache. Adding contacts or
 * materials still updates the list immediately, through the query cache rather
 * than through each panel's own `useState`.
 */

export const useStudentContacts = (studentId) => useQuery({
  queryKey: queryKeys.sis.studentContacts(studentId),
  queryFn: async () => {
    const r = await api.get(`/api/sis/students/${studentId}/emergency-contacts`)
    return r.data?.contacts || []
  },
  enabled: !!studentId,
  staleTime: 60 * 1000,
})

/**
 * One response, two panels. `/record` carries the profile, the assessment
 * grid, the school's assessment field list, and the curriculum materials; the
 * Record tab reads the first three and the Materials tab the last.
 */
export const useStudentRecord = (studentId, orgId) => useQuery({
  queryKey: queryKeys.sis.studentRecord(studentId, orgId),
  queryFn: async () => {
    const r = await api.get(`/api/sis/students/${studentId}/record?organization_id=${orgId}`)
    return {
      profile: r.data?.record?.profile || {},
      assessments: r.data?.record?.assessments || {},
      fields: r.data?.assessment_fields || [],
      materials: r.data?.materials || [],
    }
  },
  enabled: !!studentId && !!orgId,
  staleTime: 60 * 1000,
})

export const useStudentClasses = (studentId, orgId) => useQuery({
  queryKey: queryKeys.sis.studentClasses(studentId, orgId),
  queryFn: async () => {
    const r = await api.get(`/api/sis/students/${studentId}/classes?organization_id=${orgId}`)
    return r.data?.classes || []
  },
  enabled: !!studentId && !!orgId,
  staleTime: 30 * 1000,
})

/** Every class in the org, for the "add to a class" picker. */
export const useOrgClassList = (orgId) => useQuery({
  queryKey: queryKeys.sis.orgClassList(orgId),
  queryFn: async () => {
    const r = await api.get(`/api/sis/classes?organization_id=${orgId}`)
    return r.data?.classes || []
  },
  enabled: !!orgId,
  staleTime: 60 * 1000,
})

export const useOrgHouseholds = (orgId) => useQuery({
  queryKey: queryKeys.sis.householdList(orgId),
  queryFn: async () => {
    const r = await api.get(`/api/sis/households?organization_id=${orgId}`)
    return r.data?.households || []
  },
  enabled: !!orgId,
  staleTime: 60 * 1000,
})

/** The drawer's write surface, so no panel calls `api` directly. */
export const sisStudentApi = {
  updateStudent: (studentId, body) => api.patch(`/api/sis/students/${studentId}`, body),
  updateRoles: (studentId, roles, orgId) =>
    api.patch(`/api/sis/users/${studentId}/role`, { roles, organization_id: orgId }),
  updateEnrollment: (studentId, body) => api.patch(`/api/sis/enrollments/${studentId}`, body),
  resetPassword: (orgId, studentId) =>
    api.post(`/api/admin/organizations/${orgId}/users/${studentId}/reset-password`, {}),
  removeFromOrg: (orgId, studentId) =>
    api.post(`/api/admin/organizations/${orgId}/users/remove`, { user_id: studentId }),
  addToHousehold: (householdId, studentId, orgId) =>
    api.post(`/api/sis/households/${householdId}/members`, {
      user_id: studentId, relationship: 'student', organization_id: orgId,
    }),
  copyContactsFromFamily: (studentId) =>
    api.post(`/api/sis/students/${studentId}/emergency-contacts/copy-from-family`, {}),
  addContact: (studentId, contact, orgId) =>
    api.post(`/api/sis/students/${studentId}/emergency-contacts`, { ...contact, organization_id: orgId }),
  removeContact: (contactId) => api.delete(`/api/sis/emergency-contacts/${contactId}`),
  enroll: (classId, studentId, force) =>
    api.post(`/api/sis/classes/${classId}/enrollments`, { student_user_id: studentId, force }),
  drop: (classId, studentId, orgId) =>
    api.delete(`/api/sis/classes/${classId}/enrollments/${studentId}?organization_id=${orgId}`),
  message: (studentId, subject, body, orgId) =>
    api.post(`/api/sis/students/${studentId}/message`, { subject, body, organization_id: orgId }),
  saveRecord: (studentId, profile, assessments, orgId) =>
    api.put(`/api/sis/students/${studentId}/record`, { profile, assessments, organization_id: orgId }),
  addMaterial: (studentId, item, orgId) =>
    api.post(`/api/sis/students/${studentId}/materials`, {
      item_name: item.item_name, notes: item.notes || undefined, organization_id: orgId,
    }),
  updateMaterial: (materialId, changes, orgId) =>
    api.patch(`/api/sis/materials/${materialId}`, { ...changes, organization_id: orgId }),
  removeMaterial: (materialId, orgId) =>
    api.delete(`/api/sis/materials/${materialId}?organization_id=${orgId}`),
}

export default useStudentRecord
