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

// Threads waiting for a reply -- what the inbox page counts -- not unread
// messages. Messages made it "9+" against a page of three threads (iCreate,
// 2026-09-15, 4b364a4c): one chatty parent counted five, and class chats the
// page cannot show counted too.
const threadsFrom = (res) => {
  const data = res?.data?.data ?? res?.data ?? {}
  return Number(data.needs_reply_threads ?? 0) || 0
}

// `admin` is the sidebar's answer (its own role check, minus a teacher
// preview) so this badge cannot ask for the school inbox on a preview the
// sidebar has already stopped drawing admin nav for.
const InboxUnreadBadge = ({ orgId = null, isSuperadmin = false, admin = undefined }) => {
  const { user } = useAuth()
  const isAdmin = admin === undefined ? isSisAdmin(user) : admin

  const { data: count = 0 } = useQuery({
    queryKey: ['sis', 'inboxUnread', orgId, isAdmin],
    enabled: Boolean(user?.id) && !(isAdmin && isSuperadmin && !orgId),
    refetchInterval: REFETCH_MS,
    staleTime: REFETCH_MS / 2,
    queryFn: async () => {
      const requests = [api.get('/api/messages/unread-count?threads=1').catch(() => null)]
      if (isAdmin) {
        requests.push(
          // expect403: a refusal is an empty half, not a page to Sentry
          // (OPTIO-WEB-24: an admin's tab polling under a masquerade cookie).
          api.get(withOrg('/api/school-inbox/unread-count', isSuperadmin ? orgId : null), { expect403: true })
            .catch(() => null),
        )
      }
      const results = await Promise.all(requests)
      return results.reduce((n, r) => n + threadsFrom(r), 0)
    },
  })

  if (!count) return null
  return (
    <span
      aria-label={`${count} thread${count === 1 ? '' : 's'} waiting for a reply`}
      className="ml-auto min-w-[20px] rounded-full bg-optio-pink px-1.5 py-0.5 text-center text-[11px] font-semibold leading-tight text-white"
    >
      {count > 9 ? '9+' : count}
    </span>
  )
}

export default InboxUnreadBadge
