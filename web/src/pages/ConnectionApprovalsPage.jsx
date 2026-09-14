import React from 'react'
import { Navigate } from 'react-router-dom'
import { toast } from 'react-hot-toast'
import { useAuth } from '../contexts/AuthContext'
import {
  useConnectionApprovals, useDecideConnection, useRevokeConnection,
} from '../hooks/api/useConnectionApprovals'
import { ActiveConnectionRow, PendingConnectionCard } from '../components/connections/ConnectionApprovalCards'

/**
 * Peer connections — the grown-up's side, for a SCHOOL ADMIN.
 *
 * For two students inside one school with no guardian linked, the school's
 * admin is the approver, and this page is where the notification email
 * lands them. A parent's copy of the same rows lives on the family
 * dashboard, on the card of the child each request is about (2026-09-15);
 * a parent who follows an older email link here is sent there. The sidebar
 * item this page used to have went with it.
 *
 * Backed by /api/connections/approvals, which returns only rows naming the
 * caller as approver.
 */
export default function ConnectionApprovalsPage() {
  const { effectiveRole } = useAuth()
  const { data, isLoading } = useConnectionApprovals({ enabled: effectiveRole !== 'parent' })
  const decide = useDecideConnection()
  const revoke = useRevokeConnection()
  const busy = decide.isPending || revoke.isPending

  if (effectiveRole === 'parent') {
    return <Navigate to="/family" replace />
  }

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

  if (isLoading) {
    return <div className="max-w-2xl mx-auto p-6 text-gray-500">Loading...</div>
  }

  const pending = data?.pending || []
  const approved = data?.approved || []

  return (
    <div className="max-w-2xl mx-auto p-6">
      <h1 className="text-2xl font-bold text-gray-900">Student connections</h1>
      <p className="text-gray-600 mt-1">
        Approve new connections, and manage the ones you've already approved.
      </p>

      <h2 className="text-lg font-semibold text-gray-900 mt-8">Waiting on you</h2>
      {pending.length === 0 ? (
        <div className="mt-3 rounded-lg border border-gray-200 bg-gray-50 p-5 text-gray-600">
          Nothing waiting on you right now.
        </div>
      ) : (
        <div className="mt-6 space-y-4">
          {pending.map((req) => (
            <PendingConnectionCard key={req.id} request={req} onDecide={onDecide} busy={busy} />
          ))}
        </div>
      )}

      <h2 className="text-lg font-semibold text-gray-900 mt-10">Active connections</h2>
      <p className="text-sm text-gray-600 mt-1">
        Connections you approved. You can end any of these at any time, without
        asking the other family.
      </p>

      {approved.length === 0 ? (
        <div className="mt-3 rounded-lg border border-gray-200 bg-gray-50 p-5 text-gray-600">
          No active connections yet.
        </div>
      ) : (
        <div className="mt-3 space-y-2">
          {approved.map((c) => (
            <ActiveConnectionRow key={c.connection_id} connection={c} onRevoke={onRevoke} busy={busy} />
          ))}
        </div>
      )}
    </div>
  )
}
