import React from 'react'
import { EnvelopeIcon, UserGroupIcon } from '@heroicons/react/24/outline'
import ConnectionRequest from './ConnectionRequest'
import ParentRequest from './ParentRequest'
// import TeamUpInvite from './TeamUpInvite' // REMOVED - Phase 3 refactoring (January 2025)
import InvitationsEmptyState from './InvitationsEmptyState'

const InvitationsTab = ({
  pendingRequests = [],
  sentRequests = [],
  parentRequests = [],
  // teamInvitations = [], // REMOVED - Phase 3 refactoring (January 2025)
  // sentTeamInvitations = [], // REMOVED - Phase 3 refactoring (January 2025)
  onAcceptRequest,
  onDeclineRequest,
  onCancelRequest,
  onAcceptParentRequest,
  onDeclineParentRequest,
  // onAcceptTeamInvite, // REMOVED - Phase 3 refactoring (January 2025)
  // onDeclineTeamInvite, // REMOVED - Phase 3 refactoring (January 2025)
  // onCancelTeamInvite, // REMOVED - Phase 3 refactoring (January 2025)
}) => {

  return (
    <section
      role="tabpanel"
      id="invitations-panel"
      aria-labelledby="invitations-tab"
      className="py-8 px-4 sm:px-6 lg:px-8"
    >
      <div className="max-w-4xl mx-auto space-y-8">
        {/* Connection Requests Section */}
        <div>
          <h2
            className="text-2xl font-bold text-neutral-700 mb-6 flex items-center gap-2"
            style={{ fontFamily: 'Poppins', fontWeight: 700 }}
          >
            <EnvelopeIcon className="w-6 h-6 text-optio-purple" />
            Connection Requests
          </h2>

          {/* Incoming Requests */}
          <div className="mb-6">
            <h3
              className="text-lg font-semibold text-neutral-700 mb-4"
              style={{ fontFamily: 'Poppins', fontWeight: 600 }}
            >
              Incoming ({pendingRequests.length})
            </h3>
            {pendingRequests.length === 0 ? (
              <InvitationsEmptyState type="incoming" />
            ) : (
              <div className="space-y-3">
                {pendingRequests.map((request) => (
                  <ConnectionRequest
                    key={request.friendship_id}
                    request={request}
                    type="incoming"
                    onAccept={onAcceptRequest}
                    onDecline={onDeclineRequest}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Sent Requests */}
          <div>
            <h3
              className="text-lg font-semibold text-neutral-700 mb-4"
              style={{ fontFamily: 'Poppins', fontWeight: 600 }}
            >
              Sent ({sentRequests.length})
            </h3>
            {sentRequests.length === 0 ? (
              <InvitationsEmptyState type="sent" />
            ) : (
              <div className="space-y-3">
                {sentRequests.map((request) => (
                  <ConnectionRequest
                    key={request.friendship_id}
                    request={request}
                    type="sent"
                    onCancel={onCancelRequest}
                  />
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Parent Access Requests Section */}
        {parentRequests.length > 0 && (
          <div>
            <h2
              className="text-2xl font-bold text-neutral-700 mb-6 flex items-center gap-2"
              style={{ fontFamily: 'Poppins', fontWeight: 700 }}
            >
              <UserGroupIcon className="w-6 h-6 text-optio-purple" />
              Parent Access Requests
            </h2>
            <div className="space-y-3">
              {parentRequests.map((request) => (
                <ParentRequest
                  key={request.link_id}
                  request={request}
                  onAccept={onAcceptParentRequest}
                  onDecline={onDeclineParentRequest}
                />
              ))}
            </div>
          </div>
        )}

        {/* Team-Up Invitations Section - REMOVED Phase 3 refactoring (January 2025) */}
      </div>
    </section>
  )
}

export default InvitationsTab
