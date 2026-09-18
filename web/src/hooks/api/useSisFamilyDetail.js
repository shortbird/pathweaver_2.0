import { useQuery } from '@tanstack/react-query'

import api from '../../services/api'
import { queryKeys } from '../../utils/queryKeys'

/**
 * What the SIS family drawer reads and writes (QF-03).
 *
 * FamilyDetailModal is 19 hand-rolled call sites: three panels that each
 * fetched for themselves, and fifteen writes, nearly all of them PATCHes of the
 * same household row from five different sections (name, details, registration
 * access, funding, directory opt-in). Those five had drifted into five copies
 * of the same request, which is what `updateHousehold` collapses.
 *
 * The office reopens the same family repeatedly during a registration
 * session -- check billing, fix a contact, waive a fee, come back -- and every
 * reopen refetched all three panels. They are cached now.
 */

export const useHouseholdBilling = (householdId, orgId) => useQuery({
  queryKey: queryKeys.sis.householdBilling(householdId, orgId),
  queryFn: async () => {
    const r = await api.get(`/api/sis/households/${householdId}/billing?organization_id=${orgId}`)
    return r.data || {}
  },
  enabled: !!householdId && !!orgId,
  // Money: short, because an invoice can be paid while the drawer is open.
  staleTime: 15 * 1000,
})

export const useHouseholdContacts = (householdId, orgId) => useQuery({
  queryKey: queryKeys.sis.householdContacts(householdId, orgId),
  queryFn: async () => {
    const r = await api.get(`/api/sis/households/${householdId}/emergency-contacts?organization_id=${orgId}`)
    return r.data?.contacts || []
  },
  enabled: !!householdId && !!orgId,
  staleTime: 60 * 1000,
})

export const useHouseholdRegistration = (householdId, orgId) => useQuery({
  queryKey: queryKeys.sis.householdRegistration(householdId, orgId),
  queryFn: async () => {
    const r = await api.get(`/api/sis/households/${householdId}/registration?organization_id=${orgId}`)
    return r.data?.registration || null
  },
  enabled: !!householdId && !!orgId,
  staleTime: 30 * 1000,
})

export const sisFamilyApi = {
  /**
   * One household PATCH for all five sections that edit this row. They were
   * five separate `api.patch` calls with the same URL and the same
   * organization_id boilerplate; only the fields differed.
   */
  updateHousehold: (householdId, fields, orgId) =>
    api.patch(`/api/sis/households/${householdId}`, { ...fields, organization_id: orgId }),
  uploadImage: (householdId, orgId, file) => {
    const form = new FormData()
    form.append('file', file)
    return api.post(`/api/sis/households/${householdId}/image?organization_id=${orgId}`, form)
  },
  remove: (householdId, orgId) =>
    api.delete(`/api/sis/households/${householdId}?organization_id=${orgId}`),
  // The family is leaving: every student withdrawn and their seats freed; the
  // record, the guardians and the history stay.
  withdraw: (householdId, orgId) =>
    api.post(`/api/sis/households/${householdId}/withdraw`, { organization_id: orgId }),
  // The people a deleted family left behind, off the school in one go: each
  // deleted outright, or kept on file as withdrawn when records depend on it.
  removePeople: (userIds, orgId) =>
    api.post('/api/sis/people/remove', { user_ids: userIds, organization_id: orgId }),
  addMember: (householdId, body) => api.post(`/api/sis/households/${householdId}/members`, body),
  // A child the family has no Optio account for: addMember connects one that
  // exists, this one creates it (under 13 a managed profile, 13+ their own login).
  addChild: (householdId, body) => api.post(`/api/sis/households/${householdId}/children`, body),
  removeMember: (householdId, userId, orgId) =>
    api.delete(`/api/sis/households/${householdId}/members/${userId}?organization_id=${orgId}`),
  message: (householdId, subject, body, orgId) =>
    api.post(`/api/sis/households/${householdId}/message`, { subject, body, organization_id: orgId }),
  addContact: (householdId, contact, orgId) =>
    api.post(`/api/sis/households/${householdId}/emergency-contacts`, { ...contact, organization_id: orgId }),
  removeContacts: (householdId, ids, orgId) =>
    api.post(`/api/sis/households/${householdId}/emergency-contacts/delete`, { ids, organization_id: orgId }),
  waiveFee: (householdId, orgId) =>
    api.post(`/api/sis/households/${householdId}/waive-fee`, { organization_id: orgId }),
}

export default useHouseholdRegistration
