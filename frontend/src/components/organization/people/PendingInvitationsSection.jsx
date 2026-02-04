import React from 'react'
import { EnvelopeIcon, ChevronRightIcon } from '@heroicons/react/24/outline'

/**
 * Collapsible section for displaying pending email invitations.
 */
function PendingInvitationsSection({
  showPendingInvitations,
  setShowPendingInvitations,
  pendingInvitations,
  pendingLoading,
  getRoleBadgeClass,
  formatExpiration
}) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100">
      <button
        onClick={() => setShowPendingInvitations(!showPendingInvitations)}
        className="w-full px-6 py-4 flex items-center justify-between hover:bg-gray-50 transition-colors"
      >
        <div className="flex items-center gap-3">
          <EnvelopeIcon className="w-5 h-5 text-optio-purple" />
          <span className="font-semibold text-gray-900">Pending Invitations</span>
          {pendingInvitations.length > 0 && (
            <span className="px-2 py-0.5 bg-yellow-100 text-yellow-700 text-xs font-medium rounded-full">
              {pendingInvitations.length}
            </span>
          )}
        </div>
        <ChevronRightIcon className={`w-5 h-5 text-gray-400 transition-transform ${showPendingInvitations ? 'rotate-90' : ''}`} />
      </button>

      {showPendingInvitations && (
        <div className="px-6 pb-4 border-t border-gray-100">
          {pendingLoading ? (
            <div className="py-4 text-center">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-optio-purple mx-auto"></div>
            </div>
          ) : pendingInvitations.length === 0 ? (
            <p className="py-4 text-sm text-gray-500 text-center">No pending invitations</p>
          ) : (
            <div className="divide-y divide-gray-100">
              {pendingInvitations.map(inv => (
                <div key={inv.id} className="py-3 flex items-center justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{inv.email}</p>
                    <p className="text-xs text-gray-500">
                      {inv.invited_name && `${inv.invited_name} - `}
                      <span className={`inline-flex px-1.5 py-0.5 rounded text-xs font-medium ${getRoleBadgeClass(inv.role)}`}>
                        {inv.role === 'org_admin' ? 'Org Admin' : inv.role}
                      </span>
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-400">
                      Expires {formatExpiration(inv.expires_at)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default PendingInvitationsSection
