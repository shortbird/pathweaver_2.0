import { useQuery } from '@tanstack/react-query'

import api from '../../services/api'
import { withOrg } from '../../pages/sis/useSisOrg'
import { queryKeys } from '../../utils/queryKeys'

/**
 * The replies to one calendar event: who is coming, how many of them, and — on
 * a paid event — whether the fee was actually paid.
 *
 * iCreate, 2026-08-28 (9cf78e9a) asked for RSVPs and payments on calendar
 * events. The collecting shipped without the reading, so the office had no
 * screen that showed a reply. This is what the event editor reads.
 *
 * The office opens the same event repeatedly while it plans one evening —
 * check the count, close, reopen to change the time — so the cache earns its
 * keep on a single sitting rather than over a day.
 */
export const useSisEventRsvps = (eventId, orgId, options = {}) => useQuery({
  queryKey: queryKeys.sis.eventRsvps(eventId, orgId),
  queryFn: async () => {
    const res = await api.get(withOrg(`/api/sis/events/${eventId}/rsvps`, orgId))
    return res.data || { rsvps: [], families: 0, people: 0 }
  },
  enabled: !!eventId && !!orgId,
  // Families reply on their own time, and a stale headcount is a wrong
  // headcount when somebody is counting chairs.
  staleTime: 30 * 1000,
  ...options,
})

export default useSisEventRsvps
