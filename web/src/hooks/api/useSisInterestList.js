import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import api from '../../services/api'
import { withOrg } from '../../pages/sis/useSisOrg'
import { queryKeys } from '../../utils/queryKeys'

/**
 * The interest list: families who joined the waitlist from the registration
 * link before registering or paying (backend/services/sis_interest_list_service.py).
 *
 * The office opens it to invite a family when a spot frees up, so the list is
 * refetched after every invite or removal rather than patched in place: the
 * server decides the status (an invite on a family who just registered is
 * refused) and the place in line follows from it.
 */
export const useSisInterestList = (orgId, options = {}) => useQuery({
  queryKey: queryKeys.sis.interestList(orgId),
  queryFn: async () => {
    const res = await api.get(withOrg('/api/sis/interest-list', orgId))
    return res.data?.entries || []
  },
  enabled: !!orgId,
  staleTime: 30 * 1000,
  ...options,
})

const useInterestListAction = (orgId, request) => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: request,
    onSettled: () => queryClient.invalidateQueries({ queryKey: queryKeys.sis.interestList(orgId) }),
  })
}

/** Email the family the registration link; resolves to { entry, emailed }. */
export const useInviteInterestListEntry = (orgId) => useInterestListAction(orgId, async (entryId) => {
  const res = await api.post(`/api/sis/interest-list/${entryId}/invite`, { organization_id: orgId })
  return res.data
})

/** 'removed' takes a family off the list, 'waiting' puts them back. */
export const useSetInterestListStatus = (orgId) => useInterestListAction(orgId, async ({ entryId, status }) => {
  const res = await api.post(`/api/sis/interest-list/${entryId}/status`, { organization_id: orgId, status })
  return res.data
})

/**
 * The public form's one write: no session, keyed by the registration link's
 * invitation code. A plain call, not a hook -- nothing on the family's side
 * reads the list back.
 */
export const joinInterestList = (code, body) => api.post('/api/registration/interest-list', { code, ...body })

export default useSisInterestList
