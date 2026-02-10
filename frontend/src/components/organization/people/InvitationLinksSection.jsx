import React from 'react'
import { LinkIcon, ChevronRightIcon, ClipboardIcon, ArrowPathIcon } from '@heroicons/react/24/outline'
import { CheckIcon } from '@heroicons/react/24/solid'

/**
 * Collapsible section for managing invitation links by role.
 * Compact card grid showing one card per role with active link status.
 */
function InvitationLinksSection({
  showInvitationLinks,
  setShowInvitationLinks,
  linksLoading,
  VALID_ROLES,
  getLinkForRole,
  generating,
  getRoleBadgeClass,
  formatExpiration,
  copiedLinkId,
  handleCopyLink,
  handleGenerateLink,
  refreshConfirmRole,
  handleRefreshLinkRequest,
  handleCancelRefresh,
  handleConfirmRefresh
}) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100">
      <button
        onClick={() => setShowInvitationLinks(!showInvitationLinks)}
        className="w-full px-6 py-4 flex items-center justify-between hover:bg-gray-50 transition-colors"
      >
        <div className="flex items-center gap-3">
          <LinkIcon className="w-5 h-5 text-optio-purple" />
          <span className="font-semibold text-gray-900">Invitation Links</span>
        </div>
        <ChevronRightIcon className={`w-5 h-5 text-gray-400 transition-transform ${showInvitationLinks ? 'rotate-90' : ''}`} />
      </button>

      {showInvitationLinks && (
        <div className="px-6 pb-4 border-t border-gray-100">
          {linksLoading ? (
            <div className="py-4 text-center">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-optio-purple mx-auto"></div>
            </div>
          ) : (
            <>
              {/* Refresh Confirmation Modal */}
              {refreshConfirmRole && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                  <div className="bg-white rounded-xl shadow-xl max-w-md w-full mx-4 p-6">
                    <div className="flex items-center gap-3 mb-4">
                      <div className="w-10 h-10 rounded-full bg-yellow-100 flex items-center justify-center">
                        <ArrowPathIcon className="w-5 h-5 text-yellow-600" />
                      </div>
                      <h3 className="text-lg font-semibold text-gray-900">Refresh Link?</h3>
                    </div>
                    <p className="text-gray-600 mb-6">
                      Refreshing will invalidate the current {VALID_ROLES.find(r => r.value === refreshConfirmRole)?.label || refreshConfirmRole} invitation link.
                      Anyone with the old link will not be able to use it.
                    </p>
                    <div className="flex gap-3 justify-end">
                      <button
                        onClick={handleCancelRefresh}
                        className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={handleConfirmRefresh}
                        disabled={generating === refreshConfirmRole}
                        className="px-4 py-2 bg-optio-purple text-white rounded-lg hover:bg-optio-purple/90 transition-colors disabled:opacity-50"
                      >
                        {generating === refreshConfirmRole ? 'Refreshing...' : 'Refresh Link'}
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Role Cards Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 pt-4">
                {VALID_ROLES.map(({ value: role, label }) => {
                  const existingLink = getLinkForRole(role)
                  const isGenerating = generating === role
                  const isCopied = existingLink && copiedLinkId === existingLink.id

                  return (
                    <div
                      key={role}
                      className="border border-gray-200 rounded-lg p-3 hover:border-gray-300 transition-colors"
                    >
                      {/* Role Badge and Actions */}
                      <div className="flex items-center justify-between mb-2">
                        <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${getRoleBadgeClass(role)}`}>
                          {label}
                        </span>

                        {existingLink ? (
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => handleCopyLink(existingLink.invitation_code, existingLink.id)}
                              className={`p-1.5 rounded transition-colors ${
                                isCopied
                                  ? 'bg-green-100 text-green-700'
                                  : 'text-gray-400 hover:text-optio-purple hover:bg-optio-purple/10'
                              }`}
                              title={isCopied ? 'Copied!' : 'Copy link'}
                            >
                              {isCopied ? (
                                <CheckIcon className="w-4 h-4" />
                              ) : (
                                <ClipboardIcon className="w-4 h-4" />
                              )}
                            </button>
                            <button
                              onClick={() => handleRefreshLinkRequest(role)}
                              disabled={isGenerating}
                              className="p-1.5 rounded text-gray-400 hover:text-optio-purple hover:bg-optio-purple/10 transition-colors disabled:opacity-50"
                              title="Refresh link"
                            >
                              <ArrowPathIcon className={`w-4 h-4 ${isGenerating ? 'animate-spin' : ''}`} />
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => handleGenerateLink(role)}
                            disabled={isGenerating}
                            className="text-xs text-optio-purple hover:text-optio-purple/80 font-medium disabled:opacity-50 transition-colors"
                          >
                            {isGenerating ? 'Generating...' : 'Generate'}
                          </button>
                        )}
                      </div>

                      {/* Link Info */}
                      {existingLink ? (
                        <div className="text-xs text-gray-500">
                          <div className="font-mono truncate mb-0.5">
                            ...{existingLink.invitation_code.slice(0, 16)}...
                          </div>
                          <div>
                            Expires {formatExpiration(existingLink.expires_at)}
                          </div>
                        </div>
                      ) : (
                        <div className="text-xs text-gray-400">
                          No active link
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}

export default InvitationLinksSection
