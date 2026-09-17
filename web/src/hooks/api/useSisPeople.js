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
  resendInvite: (orgId, staffId) =>
    api.post(`/api/sis/staff/${staffId}/resend-invite`, { organization_id: orgId }),
  createHousehold: (orgId, name) =>
    api.post('/api/sis/households', { name, organization_id: orgId }),
}

export default sisPeopleApi
