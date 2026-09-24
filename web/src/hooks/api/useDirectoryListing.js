import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import api from '../../services/api'
import { queryKeys } from '../../utils/queryKeys'

/**
 * How this family is listed in one school's Family Directory: whether it is
 * listed at all, and which contact details show. Read and written by the
 * Directory tab of Family Settings (components/parent/DirectoryListingSettings),
 * where these controls moved from the directory page on 2026-09-22 (iCreate,
 * 2d456409: "preferably put this in a more hidden place (Like settings.)").
 *
 * The saved values come back as they are stored -- email and phone default
 * on, address off, only when the family never chose (the backend applies
 * those defaults, not this hook).
 */
const shape = (d = {}) => ({
  optedIn: Boolean(d.opted_in),
  defaultIn: d.default_in === true,
  share_email: d.share_email !== false,
  share_phone: d.share_phone !== false,
  share_address: d.share_address === true,
  carpool_interest: d.carpool_interest === true,
})

export function useDirectoryListing(orgId) {
  return useQuery({
    queryKey: queryKeys.family.directoryListing(orgId),
    queryFn: async () => {
      const { data } = await api.get(`/api/sis/parent/directory/opt-in?organization_id=${orgId}`)
      return shape(data)
    },
    enabled: Boolean(orgId),
    retry: false,
    refetchOnWindowFocus: false,
  })
}

/**
 * Save the listing, optimistically: the switch moves on the click and goes
 * back if the save fails. Sends carpool_interest too: the carpool checkbox
 * sits beside the switch in Family Settings as well as on the directory page
 * (2026-09-24), and both write the same household flag.
 */
export function useSaveDirectoryListing(orgId) {
  const queryClient = useQueryClient()
  const key = queryKeys.family.directoryListing(orgId)
  return useMutation({
    mutationFn: (next) => api.put(`/api/sis/parent/directory/opt-in?organization_id=${orgId}`, {
      opted_in: next.optedIn,
      share_email: next.share_email,
      share_phone: next.share_phone,
      share_address: next.share_address,
      carpool_interest: next.carpool_interest,
    }),
    onMutate: async (next) => {
      await queryClient.cancelQueries({ queryKey: key })
      const prev = queryClient.getQueryData(key)
      queryClient.setQueryData(key, next)
      return { prev }
    },
    onError: (_err, _next, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(key, ctx.prev)
    },
  })
}

export default useDirectoryListing
