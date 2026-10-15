import { useQuery } from '@tanstack/react-query'

import api from '../../services/api'
import { queryKeys } from '../../utils/queryKeys'

/**
 * What the People page writes, and the one read that is not the roster.
 *
 * The roster itself is useSisRoster; families are useSisHouseholds. These are
 * the actions the page's row menu and banners take -- removing a person,
 * merging a placeholder card into the account it was invited to, resending
 * an invite, creating a family -- gathered here so no part of the page calls
 * `api` directly (QF-03).
 */

/** What an account is attached to, before it is archived or deleted. */
export const useRemovalPreview = (orgId, personId) => useQuery({
  queryKey: [...queryKeys.sis.all, 'removal-preview', orgId, personId],
  queryFn: async () => {
    const r = await api.get(`/api/sis/people/${personId}/removal-preview?organization_id=${orgId}`)
    return r.data
  },
  enabled: Boolean(orgId && personId),
  staleTime: 0,
  retry: false,
})

export const sisPeopleApi = {
  remove: (orgId, personId, mode) =>
    api.delete(`/api/sis/people/${personId}?organization_id=${orgId}&mode=${mode}`),
  mergePlaceholder: (orgId, placeholderId, email) =>
    api.post(`/api/sis/staff/${placeholderId}/link`, { email, organization_id: orgId }),
  // Anyone at the school who has never signed in: staff get the staff invite,
  // students and parents the set-your-password email (2026-10-06).
  resendInvite: (orgId, personId) =>
    api.post(`/api/sis/people/${personId}/resend-invite`, { organization_id: orgId }),
  createHousehold: (orgId, name) =>
    api.post('/api/sis/households', { name, organization_id: orgId }),
  // The add wizard's "A family": the household, its parents and its children
  // in one request (routes/sis/people_add.py).
  createFamily: (orgId, body) =>
    api.post('/api/sis/families', { ...body, organization_id: orgId }),
  // A student who signs in with a username and a generated password, no email.
  createUsernameStudent: (orgId, body) =>
    api.post(`/api/admin/organizations/${orgId}/users/create-username`, { ...body, org_role: 'student' }),
  // "Ask to connect": a request to an existing platform account to join the
  // school, accepted by its owner or a minor's parent (ticket af8469aa).
  sendConnectRequest: (orgId, body) =>
    api.post('/api/sis/connect-requests', { ...body, organization_id: orgId }),
  // "Set up sign-in" for many profiles a parent manages (ticket cd61587c).
  bulkSetupSignIn: (orgId, userIds) =>
    api.post(`/api/admin/organizations/${orgId}/users/bulk-setup-sign-in`, { user_ids: userIds }),

  // ── Moved from the web organization console (2026-10-15) ──
  // Every org is an SIS org now, so what /organization did lives here. The
  // endpoints are the console's own (routes/admin/*); only the callers moved.

  // Many username students from a pasted list of names (bulk_import.py).
  bulkCreateUsernames: (orgId, students) =>
    api.post(`/api/admin/organizations/${orgId}/users/bulk-create-username`,
      { students, org_role: 'student' }),
  // New passwords for username students, to print their login cards again.
  // Org admin only: a password reset is an account action.
  reprintLoginCards: (orgId, userIds) =>
    api.post(`/api/admin/organizations/${orgId}/users/bulk-reset-passwords`, { user_ids: userIds }),

  // Teacher <-> student assignments (advisor_student_assignments), which
  // decide what a teacher may see of a student outside their classes.
  advisorStudents: (orgId, advisorId) =>
    api.get(`/api/admin/organizations/${orgId}/advisors/${advisorId}/students`),
  studentsWithAdvisors: (orgId) =>
    api.get(`/api/admin/organizations/${orgId}/students/advisor-assignments`),
  studentAdvisors: (orgId, studentId) =>
    api.get(`/api/admin/organizations/${orgId}/students/${studentId}/advisors`),
  assignStudent: (orgId, advisorId, studentId) =>
    api.post(`/api/admin/organizations/${orgId}/advisors/${advisorId}/students`, { student_id: studentId }),
  unassignStudent: (orgId, advisorId, studentId) =>
    api.delete(`/api/admin/organizations/${orgId}/advisors/${advisorId}/students/${studentId}`),

  // Parent <-> student links (parent_student_links). Linking happens through
  // the family record; this lists and removes them.
  studentParentLinks: (orgId, studentId) =>
    api.get(`/api/admin/organizations/${orgId}/parent-connections/links?student_id=${studentId}`),
  disconnectParentLink: (orgId, linkId) =>
    api.delete(`/api/admin/organizations/${orgId}/parent-connections/links/${linkId}`),

  // Standing sign-up links (one per role) and pending email invitations.
  signUpLinks: (orgId) => api.get(`/api/admin/organizations/${orgId}/invitations/links`),
  pendingInvitations: (orgId) => api.get(`/api/admin/organizations/${orgId}/invitations?status=pending`),
  cancelInvitation: (orgId, invitationId) =>
    api.delete(`/api/admin/organizations/${orgId}/invitations/${invitationId}`),
}

export default sisPeopleApi
