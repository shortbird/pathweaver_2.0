import React from 'react'
import { LinkIcon, ChevronRightIcon, ClipboardIcon } from '@heroicons/react/24/outline'
import { CheckIcon } from '@heroicons/react/24/solid'

/**
 * Standing account-creation links (one permanent, auto-provisioned link per
 * role) plus pending email invitations, which only appear when there are any
 * since they exist solely as the follow-up state of an email invite.
 *
 * Direct-add flows (invite by email, create student, bulk import, parent
 * linking) live in the Add People button's chooser modal (AddPeopleChooser),
 * so this card is purely the self-serve share-a-link path and its state.
 */
function AddPeopleSection({
  showAddPeople,
  setShowAddPeople,
  linksLoading,
  VALID_ROLES,
  getLinkForRole,
  getRoleBadgeClass,
  copiedLinkId,
  handleCopyLink,
  pendingInvitations,
  pendingLoading,
  formatExpiration
}) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100">
      <button
        onClick={() => setShowAddPeople(!showAddPeople)}
        className="w-full px-6 py-4 flex items-center justify-between hover:bg-gray-50 transition-colors"
      >
        <div className="flex items-center gap-3">
          <LinkIcon className="w-5 h-5 text-optio-purple" />
          <span className="font-semibold text-gray-900">Account Creation Links</span>
          {pendingInvitations.length > 0 && (
            <span className="px-2 py-0.5 bg-yellow-100 text-yellow-700 text-xs font-medium rounded-full">
              {pendingInvitations.length} pending
            </span>
          )}
        </div>
        <ChevronRightIcon className={`w-5 h-5 text-gray-400 transition-transform ${showAddPeople ? 'rotate-90' : ''}`} />
      </button>

      {showAddPeople && (
        <div className="px-6 pb-5 border-t border-gray-100">
          {/* Account creation links */}
          <div className="pt-4">
            <p className="text-xs text-gray-500">
              Anyone with the link can create their own account in your organization with that role.
            </p>

            {linksLoading ? (
              <div className="py-6 text-center">
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-optio-purple mx-auto"></div>
              </div>
            ) : (
              <div className="divide-y divide-gray-100 mt-1">
                {VALID_ROLES.map(({ value: role, label }) => {
                  const link = getLinkForRole(role)
                  const isCopied = copiedLinkId === role
                  const fullLink = link
                    ? `${window.location.origin}/invitation/${link.invitation_code}`
                    : null

                  return (
                    <div key={role} className="flex items-center gap-3 py-3">
                      <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium shrink-0 w-16 justify-center ${getRoleBadgeClass(role)}`}>
                        {label}
                      </span>

                      {fullLink ? (
                        <div className="flex-1 min-w-0 text-xs text-gray-600 font-mono break-all select-all">
                          {fullLink}
                        </div>
                      ) : (
                        <div className="flex-1 text-xs text-gray-400">
                          Link unavailable
                        </div>
                      )}

                      {link && (
                        <button
                          onClick={() => handleCopyLink(link.invitation_code, role)}
                          className={`shrink-0 inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                            isCopied
                              ? 'bg-green-100 text-green-700'
                              : 'text-optio-purple bg-optio-purple/10 hover:bg-optio-purple/20'
                          }`}
                          title={isCopied ? 'Copied!' : 'Copy link'}
                        >
                          {isCopied ? (
                            <CheckIcon className="w-4 h-4" />
                          ) : (
                            <ClipboardIcon className="w-4 h-4" />
                          )}
                          {isCopied ? 'Copied' : 'Copy'}
                        </button>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* Pending email invitations (follow-up state of Invite by Email) */}
          {!pendingLoading && pendingInvitations.length > 0 && (
            <div className="pt-4 border-t border-gray-100 mt-4">
              <h4 className="text-sm font-medium text-gray-900">Pending email invitations</h4>
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
                    <span className="text-xs text-gray-400">
                      Expires {formatExpiration(inv.expires_at)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default AddPeopleSection
