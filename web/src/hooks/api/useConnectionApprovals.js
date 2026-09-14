import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import api from '../../services/api'

/**
 * Peer connections, the approver's side (/api/connections/approvals).
 *
 * The endpoint answers with the rows that name the CALLER as approver:
 * `pending` (a child of theirs wants to connect and is waiting on their yes)
 * and `approved` (connections they said yes to, which they may end at any
 * time). Read here once and shared by the two places that render it:
 * pages/ConnectionApprovalsPage (the school admin's surface, and where the
 * notification email lands) and the family dashboard's child cards, where a
 * parent meets each request beside the child it is about (2026-09-15).
 *
 * Decide and end are mutations that refetch the list, so a card that was
 * "waiting on you" moves to "active" without the page reloading.
 */
const KEY = ['connections', 'approvals']

export function useConnectionApprovals(options = {}) {
  return useQuery({
    queryKey: KEY,
    queryFn: async () => {
      const res = await api.get('/api/connections/approvals')
      const data = res.data?.data || res.data || {}
      return { pending: data.pending || [], approved: data.approved || [] }
    },
    retry: false,
    refetchOnWindowFocus: false,
    staleTime: 30 * 1000,
    ...options,
  })
}

/** Approve (true) or decline (false) one pending connection. */
export function useDecideConnection() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ connectionId, approve }) =>
      api.post(`/api/connections/${connectionId}/approve`, { approve }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: KEY }),
  })
}

/** End a connection the caller approved. Either side's approver may. */
export function useRevokeConnection() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (connectionId) => api.post(`/api/connections/${connectionId}/revoke`, {}),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: KEY }),
  })
}

/** The rows about one child, for the family dashboard's per-child card. */
export function forChild(data, childId) {
  return {
    pending: (data?.pending || []).filter((r) => r.child?.id === childId),
    approved: (data?.approved || []).filter((r) => r.child?.id === childId),
  }
}
