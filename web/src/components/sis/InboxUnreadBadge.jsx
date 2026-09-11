import React from 'react'
import { useQuery } from '@tanstack/react-query'
import api from '../../services/api'
import { useAuth } from '../../contexts/AuthContext'
import { isSisAdmin } from '../../pages/sis/sisRole'
import { withOrg } from '../../pages/sis/useSisOrg'

/**
 * Unread count on the sidebar's Messaging item.
 *
 * The console had no unread signal anywhere. A parent writing to the school and
 * a colleague writing to you both landed on a page nothing pointed at, so the
 * only way to discover either was to open /inbox and look — which is exactly
 * what nobody does when they are not expecting anything (iCreate, 2026-09-10).
 *
 * Sums the two sources the page can show, because a badge that counted only one
 * of them would be a worse lie than no badge: you would learn to trust it and
 * then miss everything on the other tab.
 *
 * Best-effort. A failed count renders nothing rather than a zero, so a lookup
 * problem never tells somebody their inbox is empty when it is not.
 */
const REFETCH_MS = 60000

const unreadFrom = (res) => {
  const data = res?.data?.data ?? res?.data ?? {}
  return Number(data.unread_count ?? data.count ?? data.unread ?? 0) || 0
}

const InboxUnreadBadge = ({ orgId = null, isSuperadmin = false }) => {
  const { user } = useAuth()
  const admin = isSisAdmin(user)

  const { data: count = 0 } = useQuery({
    queryKey: ['sis', 'inboxUnread', orgId, admin],
    enabled: Boolean(user?.id) && !(admin && isSuperadmin && !orgId),
    refetchInterval: REFETCH_MS,
    staleTime: REFETCH_MS / 2,
    queryFn: async () => {
      const requests = [api.get('/api/messages/unread-count').catch(() => null)]
      if (admin) {
        requests.push(
          api.get(withOrg('/api/school-inbox/unread-count', isSuperadmin ? orgId : null))
            .catch(() => null),
        )
      }
      const results = await Promise.all(requests)
      return results.reduce((n, r) => n + unreadFrom(r), 0)
    },
  })

  if (!count) return null
  return (
    <span
      aria-label={`${count} unread message${count === 1 ? '' : 's'}`}
      className="ml-auto min-w-[20px] rounded-full bg-optio-pink px-1.5 py-0.5 text-center text-[11px] font-semibold leading-tight text-white"
    >
      {count > 9 ? '9+' : count}
    </span>
  )
}

export default InboxUnreadBadge
