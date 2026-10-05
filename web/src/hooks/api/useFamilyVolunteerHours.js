import { useQuery } from '@tanstack/react-query'

import api from '../../services/api'
import { queryKeys } from '../../utils/queryKeys'

/**
 * This family's own volunteer hours at one school.
 *
 * iCreate 01082b30: "Could we make a way for parents to be able to see how
 * many volunteer hours they have completed? We can keep it updated, but ...
 * keep it private so not everyone sees everyone elses." Staff keep one number
 * per family; GET /api/sis/parent/volunteer-hours answers only for the
 * family's own guardians (404 for anyone else, which reads here as null).
 *
 * `shown` is the server's call: true when this family has hours or the school
 * has entered hours for any family, so a school that never uses the field
 * shows nothing.
 *
 * Returns { hours, updatedAt, shown }. `shown` is false while loading and on
 * any failure: the line is a nicety, never an error on the page.
 */
export default function useFamilyVolunteerHours(orgId, { enabled = true } = {}) {
  const query = useQuery({
    queryKey: queryKeys.family.volunteerHours(orgId),
    queryFn: async () => {
      try {
        const { data } = await api.get(`/api/sis/parent/volunteer-hours?organization_id=${orgId}`)
        return data
      } catch {
        return null
      }
    },
    enabled: Boolean(orgId) && enabled,
    retry: false,
    refetchOnWindowFocus: false,
    staleTime: 5 * 60 * 1000,
  })
  const data = query.data
  return {
    hours: data ? Number(data.volunteer_hours || 0) : null,
    updatedAt: data?.updated_at || null,
    shown: Boolean(data?.shown),
  }
}
