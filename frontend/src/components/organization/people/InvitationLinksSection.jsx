import React from 'react'
import { LinkIcon, ChevronRightIcon } from '@heroicons/react/24/outline'

/**
 * Collapsible section for managing invitation links by role.
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
  handleGenerateLink
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
            <div className="divide-y divide-gray-100">
              {VALID_ROLES.map(({ value: role, label }) => {
                const existingLink = getLinkForRole(role)
                const isGenerating = generating === role

                return (
                  <div key={role} className="flex items-center justify-between py-3 gap-3">
                    <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium min-w-[90px] justify-center ${getRoleBadgeClass(role)}`}>
                      {label}
                    </span>

                    {existingLink ? (
                      <div className="flex items-center gap-2 flex-1 min-w-0">
                        <span className="text-xs text-gray-400 truncate flex-1 font-mono">
                          .../{existingLink.invitation_code.slice(0, 12)}...
                        </span>
                        <span className="text-xs text-gray-400 whitespace-nowrap hidden sm:inline">
                          exp {formatExpiration(existingLink.expires_at)}
                        </span>
                        <button
                          onClick={() => handleCopyLink(existingLink.invitation_code, existingLink.id)}
                          className={`px-2 py-1 rounded text-xs font-medium transition-colors ${
                            copiedLinkId === existingLink.id
                              ? 'bg-green-100 text-green-700'
                              : 'text-optio-purple hover:bg-optio-purple/10'
                          }`}
                        >
                          {copiedLinkId === existingLink.id ? 'Copied!' : 'Copy'}
                        </button>
                        <button
                          onClick={() => handleGenerateLink(role)}
                          disabled={isGenerating}
                          className="text-xs text-gray-400 hover:text-gray-600 disabled:opacity-50"
                          title="Refresh link"
                        >
                          {isGenerating ? '...' : (
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                            </svg>
                          )}
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => handleGenerateLink(role)}
                        disabled={isGenerating}
                        className="text-xs text-gray-500 hover:text-optio-purple disabled:opacity-50 transition-colors"
                      >
                        {isGenerating ? 'Generating...' : '+ Generate'}
                      </button>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default InvitationLinksSection
