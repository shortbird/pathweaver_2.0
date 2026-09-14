import React from 'react'
import { toast } from 'react-hot-toast'
import { UsersIcon } from '@heroicons/react/24/outline'
import {
  forChild, useConnectionApprovals, useDecideConnection, useRevokeConnection,
} from '../../hooks/api/useConnectionApprovals'
import { ActiveConnectionRow, PendingConnectionCard } from '../connections/ConnectionApprovalCards'

/**
 * One child's peer connections, on their card on the family dashboard.
 *
 * Until 2026-09-15 a parent approved connections on a page of their own
 * (/connections/approvals, "Student connections" in the sidebar) that listed
 * every child's requests together. The request is about one child, and the
 * parent is on that child's card already, so it lives here: a request
 * waiting on the parent renders in full (it is the consent, and the consent
 * text stays where it is stated), and the connections they already approved
 * sit under it with the way to end them. A child with neither renders
 * nothing -- the card stays short.
 */
export default function ChildConnections({ childId }) {
  const { data } = useConnectionApprovals()
  const decide = useDecideConnection()
  const revoke = useRevokeConnection()
  const { pending, approved } = forChild(data, childId)
  if (pending.length === 0 && approved.length === 0) return null

  const busy = decide.isPending || revoke.isPending

  const onDecide = (connectionId, approve) => decide.mutate(
    { connectionId, approve },
    {
      onSuccess: () => toast.success(approve ? 'Approved.' : 'Declined.'),
      onError: (err) => toast.error(err.response?.data?.error || 'Could not save your answer.'),
    },
  )

  const onRevoke = (connectionId) => revoke.mutate(connectionId, {
    onSuccess: () => toast.success('Connection removed.'),
    onError: (err) => toast.error(err.response?.data?.error || 'Could not remove that connection.'),
  })

  return (
    <section aria-label="Connections" className="mt-3 space-y-2">
      <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide flex items-center gap-1.5">
        <UsersIcon className="w-3.5 h-3.5" />
        Connections
        {pending.length > 0 && (
          <span className="rounded-full bg-optio-pink px-1.5 text-[10px] font-bold leading-4 text-white">
            {pending.length}
          </span>
        )}
      </h4>
      {pending.map((req) => (
        <PendingConnectionCard key={req.id} request={req} onDecide={onDecide} busy={busy} compact />
      ))}
      {approved.map((c) => (
        <ActiveConnectionRow key={c.connection_id} connection={c} onRevoke={onRevoke} busy={busy} compact />
      ))}
    </section>
  )
}
