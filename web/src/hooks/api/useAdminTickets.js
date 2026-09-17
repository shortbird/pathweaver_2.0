import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import api from '../../services/api'
import { queryKeys } from '../../utils/queryKeys'

/**
 * The ticket tracker behind /admin/tickets.
 *
 * Optio tracked its own bug reports in Perch (a separate app) until
 * 2026-09-14. These hooks read the one table every platform report now lands
 * in -- /api/bug-reports -- so superadmin can see what is open, what is being
 * worked on and what was done, without leaving the admin console.
 *
 * The vocabulary is the backend's and is deliberately small:
 *   status    new | triaged | fixing | fixed | resolved | wont_fix
 *             ('open' = the first four; `fixed` is committed but not yet on
 *             production, and the release pipeline resolves it)
 *   type      bug | feature | question | tweak
 *   priority  low | normal | high | urgent
 */
export const TICKET_STATUSES = ['new', 'triaged', 'fixing', 'fixed', 'resolved', 'wont_fix']
export const TICKET_TYPES = ['bug', 'feature', 'question', 'tweak']
export const TICKET_PRIORITIES = ['low', 'normal', 'high', 'urgent']

const clean = (filters = {}) =>
  Object.fromEntries(Object.entries(filters).filter(([, v]) => v !== '' && v != null))

export const useAdminTickets = (filters = {}, options = {}) => {
  const params = clean(filters)
  return useQuery({
    queryKey: queryKeys.admin.tickets.list(params),
    queryFn: async () => {
      const res = await api.get('/api/bug-reports', { params })
      return res.data || { reports: [], total: 0 }
    },
    // A tracker is read in one sitting: switching tabs and back should not
    // refetch, but a ticket filed a minute ago should show on the next visit.
    staleTime: 30 * 1000,
    placeholderData: keepPreviousData,
    ...options,
  })
}

export const useAdminTicket = (ticketId, options = {}) => useQuery({
  queryKey: queryKeys.admin.tickets.detail(ticketId),
  queryFn: async () => {
    const res = await api.get(`/api/bug-reports/${ticketId}`)
    return res.data?.report || null
  },
  enabled: !!ticketId,
  staleTime: 30 * 1000,
  ...options,
})

export const useAdminTicketSummary = (options = {}) => useQuery({
  queryKey: queryKeys.admin.tickets.summary(),
  queryFn: async () => {
    const res = await api.get('/api/bug-reports/summary')
    return res.data?.counts || {}
  },
  staleTime: 30 * 1000,
  ...options,
})

/**
 * One mutation for every triage edit. Any change can move a ticket between
 * tabs and change the counts, so the whole subtree is invalidated rather than
 * patching one cache entry and leaving the others to disagree.
 */
export const useUpdateAdminTicket = () => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ ticketId, changes }) => {
      const res = await api.patch(`/api/bug-reports/${ticketId}`, changes)
      return res.data?.report
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.admin.tickets.all })
    },
  })
}

export default useAdminTickets
