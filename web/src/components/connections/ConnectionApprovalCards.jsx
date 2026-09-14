import React from 'react'

/**
 * The two rows an approver sees for a peer connection -- rendered on the
 * school admin's approvals page and on each child's card on the family
 * dashboard, so the consent text is written once.
 *
 * A parent (or, for two students inside one school, that school's admin) is
 * asked to approve their OWN child joining a connection. They are never asked
 * to speak for the other family; the other child's approver gets their own
 * copy, and one "no" from either side ends it.
 */

/**
 * A request waiting on this approver. The card states plainly what is being
 * consented to, because that is the whole point of asking: what the other
 * student would be able to see, and that it can be undone later. A consent
 * screen that says "approve connection?" and nothing else is a click, not a
 * consent.
 */
export function PendingConnectionCard({ request, onDecide, busy = false, compact = false }) {
  return (
    <div className={`rounded-lg border border-gray-200 bg-white ${compact ? 'p-4' : 'p-5'}`}>
      <p className="font-medium text-gray-900">
        {request.child.display_name} wants to connect with {request.peer.display_name}
      </p>

      {/* Spelled out rather than summarised. This is the disclosure the
          approval authorises, and it is the only place it is stated. */}
      <ul className="mt-3 space-y-1 text-sm text-gray-700 list-disc list-inside">
        <li>They would each be able to see the other's portfolio and work</li>
        <li>They would each be able to leave comments on that work</li>
        <li>They would not see each other's email address or birthday</li>
        <li>You can undo this at any time</li>
      </ul>

      {request.approver_kind === 'org_admin' && (
        <p className="mt-3 text-sm text-gray-500">
          You're being asked as this student's school administrator,
          because no parent or guardian account is linked to them. Both
          students are at your school.
        </p>
      )}

      <div className="mt-4 flex gap-2">
        <button
          type="button"
          onClick={() => onDecide(request.connection_id, true)}
          disabled={busy}
          className="btn-primary px-4 py-2"
        >
          Approve
        </button>
        <button
          type="button"
          onClick={() => onDecide(request.connection_id, false)}
          disabled={busy}
          className="btn-quiet"
        >
          Decline
        </button>
      </div>
    </div>
  )
}

/**
 * A connection this approver said yes to. Approval is not the end of a
 * parent's involvement: revocation was always in the API, but with no
 * surface a parent who changed their mind had to email support -- a right
 * you can only exercise by asking someone else is not much of a right.
 */
export function ActiveConnectionRow({ connection, onRevoke, busy = false, compact = false }) {
  return (
    <div className={`flex items-center gap-3 rounded-lg border border-gray-200 bg-white ${compact ? 'p-3' : 'p-4'}`}>
      <div className="flex-1 min-w-0">
        <p className="font-medium text-gray-900 text-sm">
          {compact
            ? `Connected with ${connection.peer.display_name}`
            : `${connection.child.display_name} and ${connection.peer.display_name}`}
        </p>
        {connection.connected_since && (
          <p className="text-xs text-gray-500">
            Connected since {new Date(connection.connected_since).toLocaleDateString()}
          </p>
        )}
      </div>
      <button
        type="button"
        onClick={() => onRevoke(connection.connection_id)}
        disabled={busy}
        className="btn-quiet shrink-0 px-3 py-1.5"
      >
        End connection
      </button>
    </div>
  )
}
