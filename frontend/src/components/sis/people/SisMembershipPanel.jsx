import React, { Suspense, lazy, useEffect, useRef } from 'react'
import { ChevronDownIcon, UserPlusIcon, UsersIcon, EnvelopeIcon, ArrowPathIcon } from '@heroicons/react/24/outline'
import { CheckIcon, ClipboardIcon } from '@heroicons/react/24/solid'
import usePeopleTabState from '../../../hooks/usePeopleTabState'
import CreateUsernameStudentModal from '../../organization/CreateUsernameStudentModal'
import { Modal } from '../../organization/people'
import { ModalOverlay } from '../../ui'

const BulkUserImport = lazy(() => import('../../admin/BulkUserImport'))
const InviteUserModal = lazy(() => import('../../admin/InviteUserModal'))

const linkUrl = (code) => `${window.location.origin}/invitation/${code}`

// Roles that get a standing, open registration link. Teacher/staff are
// deliberately excluded — an open Teacher link would grant staff access to
// anyone who has it, so teachers are added by email invite only.
const LINK_ROLES = [
  { value: 'student', label: 'Student' },
  { value: 'parent', label: 'Parent' },
]

/**
 * Onboarding + membership admin for the SIS Users page. Reuses the invitation
 * machinery from the legacy org People tab (shared registration links, email
 * invites, bulk CSV import, create-student-no-email) via the shared
 * usePeopleTabState hook, scoped to the SIS-selected org.
 *
 * The registration links are the primary surface here — one big, copy-friendly
 * link per role. onChanged is called after any membership change so the host
 * page can reload its roster.
 */
const SisMembershipPanel = ({ orgId, orgSlug, onChanged }) => {
  const state = usePeopleTabState({ orgId, orgSlug, users: [], onUpdate: onChanged || (() => {}) })

  // Auto-provision a standing link for each open role once the org's links load.
  // These act as the org's permanent per-role registration links, so we create
  // any that are missing rather than making the admin click "Generate". The ref
  // (reset when the org changes) prevents duplicate creates during the async gap.
  const { linksLoading, generating, invitationLinks, getLinkForRole, handleGenerateLink } = state
  const requested = useRef(new Set())
  useEffect(() => { requested.current = new Set() }, [orgId])
  useEffect(() => {
    if (!orgId || linksLoading) return
    for (const { value: role } of LINK_ROLES) {
      if (!getLinkForRole(role) && generating !== role && !requested.current.has(role)) {
        requested.current.add(role)
        handleGenerateLink(role)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId, linksLoading, invitationLinks])

  if (!orgId) return null

  return (
    <div className="mb-8 bg-white rounded-xl border border-gray-200 p-5 space-y-5">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-lg font-semibold text-neutral-900">Onboarding</h2>
          <p className="text-sm text-neutral-500">Share a registration link, invite by email, or bulk-import students.</p>
        </div>

        <div className="relative">
          <button
            onClick={() => state.setShowActionsDropdown(!state.showActionsDropdown)}
            className="inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-optio-purple to-optio-pink text-white font-medium rounded-lg hover:opacity-90"
          >
            <UserPlusIcon className="w-5 h-5" />
            Add people
            <ChevronDownIcon className="w-4 h-4" />
          </button>

          {state.showActionsDropdown && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => state.setShowActionsDropdown(false)} />
              <div className="absolute right-0 mt-2 w-56 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-20">
                <button
                  onClick={() => { state.setShowActionsDropdown(false); state.setShowInviteModal(true) }}
                  className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2"
                >
                  <EnvelopeIcon className="w-4 h-4" />
                  Invite by Email
                </button>
                <button
                  onClick={() => { state.setShowActionsDropdown(false); state.setShowCreateUsernameModal(true) }}
                  className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2"
                >
                  <UserPlusIcon className="w-4 h-4" />
                  Create Student (No Email)
                </button>
                <button
                  onClick={() => { state.setShowActionsDropdown(false); state.setShowBulkImportModal(true) }}
                  className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2"
                >
                  <UsersIcon className="w-4 h-4" />
                  Bulk Import CSV
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Registration links — one prominent, copy-friendly link per role */}
      <div>
        <h3 className="text-sm font-semibold text-neutral-700 mb-1">Registration links</h3>
        <p className="text-xs text-neutral-500 mb-3">
          Share these standing links so people can self-register into this school with the right role.
        </p>
        {state.linksLoading ? (
          <div className="py-6 text-center">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-optio-purple mx-auto" />
          </div>
        ) : (
          <div className="space-y-3">
            {LINK_ROLES.map(({ value: role, label }) => {
              const link = state.getLinkForRole(role)
              const isGenerating = state.generating === role
              const isCopied = link && state.copiedLinkId === link.id
              return (
                <div key={role} className="rounded-lg border border-gray-200 p-3">
                  <div className="flex items-center justify-between mb-2">
                    <span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-semibold ${state.getRoleBadgeClass(role)}`}>
                      {label}
                    </span>
                  </div>

                  {link ? (
                    <div className="flex items-stretch gap-2">
                      <input
                        readOnly
                        value={linkUrl(link.invitation_code)}
                        onFocus={(e) => e.target.select()}
                        onClick={(e) => e.target.select()}
                        className="flex-1 min-w-0 rounded-lg border border-gray-300 bg-neutral-50 px-3 py-2.5 text-sm font-mono text-neutral-700 focus:outline-none focus:ring-2 focus:ring-optio-purple"
                      />
                      <button
                        onClick={() => state.handleCopyLink(link.invitation_code, link.id)}
                        className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold transition-colors ${
                          isCopied
                            ? 'bg-green-100 text-green-700'
                            : 'bg-gradient-to-r from-optio-purple to-optio-pink text-white hover:opacity-90'
                        }`}
                      >
                        {isCopied ? <CheckIcon className="w-4 h-4" /> : <ClipboardIcon className="w-4 h-4" />}
                        {isCopied ? 'Copied' : 'Copy'}
                      </button>
                      <button
                        onClick={() => state.handleRefreshLinkRequest(role)}
                        disabled={isGenerating}
                        title="Reset link (invalidates the current one)"
                        className="inline-flex items-center justify-center px-3 py-2.5 rounded-lg border border-gray-300 text-neutral-500 hover:text-optio-purple hover:border-optio-purple transition-colors disabled:opacity-50"
                      >
                        <ArrowPathIcon className={`w-4 h-4 ${isGenerating ? 'animate-spin' : ''}`} />
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 px-3 py-2.5 text-sm text-neutral-400">
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-optio-purple" />
                      Preparing link…
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Refresh confirmation */}
      {state.refreshConfirmRole && (
        <ModalOverlay onClose={state.handleCancelRefresh}>
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full mx-4 p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-yellow-100 flex items-center justify-center">
                <ArrowPathIcon className="w-5 h-5 text-yellow-600" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900">Reset this link?</h3>
            </div>
            <p className="text-gray-600 mb-6">
              This invalidates the current {LINK_ROLES.find((r) => r.value === state.refreshConfirmRole)?.label || state.refreshConfirmRole} link and issues a new one.
              Anyone who already has the old link will no longer be able to use it.
            </p>
            <div className="flex gap-3 justify-end">
              <button onClick={state.handleCancelRefresh} className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors">
                Cancel
              </button>
              <button
                onClick={state.handleConfirmRefresh}
                disabled={state.generating === state.refreshConfirmRole}
                className="px-4 py-2 bg-optio-purple text-white rounded-lg hover:bg-optio-purple/90 transition-colors disabled:opacity-50"
              >
                {state.generating === state.refreshConfirmRole ? 'Resetting…' : 'Reset link'}
              </button>
            </div>
          </div>
        </ModalOverlay>
      )}

      {/* Modals */}
      {state.showCreateUsernameModal && (
        <CreateUsernameStudentModal
          orgId={orgId}
          orgSlug={orgSlug}
          onClose={() => state.setShowCreateUsernameModal(false)}
          onSuccess={() => { onChanged && onChanged() }}
        />
      )}

      {state.showInviteModal && (
        <Suspense fallback={
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white" />
          </div>
        }>
          <InviteUserModal
            organizationId={orgId}
            onClose={() => state.setShowInviteModal(false)}
            onSuccess={() => { state.fetchPendingInvitations(); onChanged && onChanged() }}
          />
        </Suspense>
      )}

      {state.showBulkImportModal && (
        <Modal title="Bulk Import Users" onClose={() => state.setShowBulkImportModal(false)}>
          <div className="p-6">
            <Suspense fallback={
              <div className="flex justify-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-optio-purple" />
              </div>
            }>
              <BulkUserImport
                organizationId={orgId}
                onImportComplete={() => { state.setShowBulkImportModal(false); onChanged && onChanged() }}
              />
            </Suspense>
          </div>
        </Modal>
      )}
    </div>
  )
}

export default SisMembershipPanel
