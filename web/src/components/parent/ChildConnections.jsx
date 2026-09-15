import React from 'react'
import { toast } from 'react-hot-toast'
import { UsersIcon } from '@heroicons/react/24/outline'
import {
  forChild, useConnectionApprovals, useDecideConnection, useRevokeConnection,
} from '../../hooks/api/useConnectionApprovals'
import { ActiveConnectionRow, PendingConnectionCard } from '../connections/ConnectionApprovalCards'

/**
 * One child's peer connections: the requests waiting on the parent and the
 * friends already approved, with the way to end one.
 *
 * Lives in the Friends section of the child's settings (ChildSettingsPanel),
 * under the policy card that decides whether requests come at all. It went
 * from a page of its own (/connections/approvals, every child together) to
 * the child's card on the family dashboard on 2026-09-15, and from the card
 * into settings the same day: the policy (ChildFriendsCard) and the requests
 * are one decision about one child, and the card carries a count instead. A
 * request waiting on the parent renders in full (it is the consent, and the
 * consent text stays where it is stated). A child with neither renders
 * nothing.
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
    <section aria-label="Connections" className="mt-4 space-y-2">
      <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide flex items-center gap-1.5">
        <UsersIcon className="w-3.5 h-3.5" />
        {pending.length > 0 ? 'Requests and friends' : 'Friends'}
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
