import React from 'react'
import { EnvelopeIcon } from '@heroicons/react/24/outline'
import ConnectionRequest from './ConnectionRequest'
// import TeamUpInvite from './TeamUpInvite' // REMOVED - Phase 3 refactoring (January 2025)
import InvitationsEmptyState from './InvitationsEmptyState'

const InvitationsTab = ({
  pendingRequests = [],
  sentRequests = [],
  // teamInvitations = [], // REMOVED - Phase 3 refactoring (January 2025)
  // sentTeamInvitations = [], // REMOVED - Phase 3 refactoring (January 2025)
  onAcceptRequest,
  onDeclineRequest,
  onCancelRequest,
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
            className="text-2xl font-bold text-[#3B383C] mb-6 flex items-center gap-2"
            style={{ fontFamily: 'Poppins', fontWeight: 700 }}
          >
            <EnvelopeIcon className="w-6 h-6 text-[#6d469b]" />
            Connection Requests
          </h2>

          {/* Incoming Requests */}
          <div className="mb-6">
            <h3
              className="text-lg font-semibold text-[#3B383C] mb-4"
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
              className="text-lg font-semibold text-[#3B383C] mb-4"
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

        {/* Team-Up Invitations Section - REMOVED Phase 3 refactoring (January 2025) */}
      </div>
    </section>
  )
}

export default InvitationsTab
