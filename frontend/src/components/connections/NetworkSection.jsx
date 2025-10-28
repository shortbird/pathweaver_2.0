import React from 'react'
import { EnvelopeIcon, UserGroupIcon, UsersIcon } from '@heroicons/react/24/outline'
import FamilyConnectionCard from './FamilyConnectionCard'
import PartnerConnectionCard from './PartnerConnectionCard'
import ParentRequest from './Invitations/ParentRequest'
import ConnectionRequest from './Invitations/ConnectionRequest'

const NetworkSection = ({
  // Family/Parent data
  familyConnections = [],
  pendingParentRequests = [],
  onAcceptParentRequest,
  onDeclineParentRequest,
  onInviteParent,

  // Learning Partner data
  learningPartners = [],
  pendingPartnerRequests = [],
  sentPartnerRequests = [],
  onAcceptPartnerRequest,
  onDeclinePartnerRequest,
  onCancelPartnerRequest,
  onConnectPartner,
}) => {
  const familyCount = familyConnections.length
  const partnersCount = learningPartners.length
  const totalPendingPartnerRequests = pendingPartnerRequests.length + sentPartnerRequests.length

  return (
    <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-16">
      <h2
        className="text-3xl font-bold text-gray-900 mb-8"
        style={{ fontFamily: 'Poppins', fontWeight: 700 }}
      >
        Your Network
      </h2>

      <div className="grid lg:grid-cols-2 gap-8">
        {/* Left Column: Family Connections */}
        <div className="space-y-6">
          <div className="flex items-center justify-between mb-4">
            <h3
              className="text-xl font-semibold text-gray-900"
              style={{ fontFamily: 'Poppins', fontWeight: 600 }}
            >
              Family & Parents ({familyCount})
            </h3>
          </div>

          {/* Pending Parent Requests - INLINE */}
          {pendingParentRequests.length > 0 && (
            <div className="bg-blue-50 border-2 border-blue-200 rounded-xl p-4 mb-4">
              <h4
                className="font-semibold text-blue-900 mb-3 flex items-center gap-2"
                style={{ fontFamily: 'Poppins', fontWeight: 600 }}
              >
                <EnvelopeIcon className="w-5 h-5" />
                Pending Parent Access Requests ({pendingParentRequests.length})
              </h4>
              <div className="space-y-3">
                {pendingParentRequests.map((request) => (
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

          {/* Active Family Connections */}
          {familyCount === 0 && pendingParentRequests.length === 0 ? (
            <div className="bg-gradient-to-br from-purple-50 to-pink-50 rounded-xl p-8 border-2 border-purple-100 text-center">
              <div className="w-16 h-16 bg-gradient-primary rounded-full flex items-center justify-center mx-auto mb-4">
                <UserGroupIcon className="w-8 h-8 text-white" />
              </div>
              <h4
                className="text-lg font-bold text-gray-900 mb-2"
                style={{ fontFamily: 'Poppins', fontWeight: 700 }}
              >
                No family members connected yet
              </h4>
              <p
                className="text-gray-600 mb-6 leading-relaxed"
                style={{ fontFamily: 'Poppins', fontWeight: 500 }}
              >
                Invite your parents or guardians to view your progress and celebrate your wins.
              </p>
              <button
                onClick={onInviteParent}
                className="bg-gradient-primary text-white px-6 py-3 rounded-full font-semibold shadow-md hover:shadow-lg transition-all"
                style={{ fontFamily: 'Poppins', fontWeight: 600 }}
              >
                Invite a Parent
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {familyConnections.map((connection) => (
                <FamilyConnectionCard
                  key={connection.link_id || connection.id}
                  connection={connection}
                />
              ))}
            </div>
          )}
        </div>

        {/* Right Column: Learning Partners */}
        <div className="space-y-6">
          <div className="flex items-center justify-between mb-4">
            <h3
              className="text-xl font-semibold text-gray-900"
              style={{ fontFamily: 'Poppins', fontWeight: 600 }}
            >
              Learning Partners ({partnersCount})
            </h3>
          </div>

          {/* Pending Partner Requests - INLINE */}
          {totalPendingPartnerRequests > 0 && (
            <div className="bg-purple-50 border-2 border-purple-200 rounded-xl p-4 mb-4">
              <h4
                className="font-semibold text-purple-900 mb-3 flex items-center gap-2"
                style={{ fontFamily: 'Poppins', fontWeight: 600 }}
              >
                <EnvelopeIcon className="w-5 h-5" />
                Pending Requests ({totalPendingPartnerRequests})
              </h4>

              <div className="space-y-3">
                {/* Incoming requests */}
                {pendingPartnerRequests.map((request) => (
                  <ConnectionRequest
                    key={request.friendship_id}
                    request={request}
                    type="incoming"
                    onAccept={onAcceptPartnerRequest}
                    onDecline={onDeclinePartnerRequest}
                  />
                ))}

                {/* Sent requests */}
                {sentPartnerRequests.map((request) => (
                  <ConnectionRequest
                    key={request.friendship_id}
                    request={request}
                    type="sent"
                    onCancel={onCancelPartnerRequest}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Active Learning Partners */}
          {partnersCount === 0 && totalPendingPartnerRequests === 0 ? (
            <div className="bg-gradient-to-br from-purple-50 to-pink-50 rounded-xl p-8 border-2 border-purple-100 text-center">
              <div className="w-16 h-16 bg-gradient-primary rounded-full flex items-center justify-center mx-auto mb-4">
                <UsersIcon className="w-8 h-8 text-white" />
              </div>
              <h4
                className="text-lg font-bold text-gray-900 mb-2"
                style={{ fontFamily: 'Poppins', fontWeight: 700 }}
              >
                No learning partners yet
              </h4>
              <p
                className="text-gray-600 mb-6 leading-relaxed"
                style={{ fontFamily: 'Poppins', fontWeight: 500 }}
              >
                Connect with other learners to see what they're exploring and celebrate each other's progress.
              </p>
              <button
                onClick={onConnectPartner}
                className="bg-gradient-primary text-white px-6 py-3 rounded-full font-semibold shadow-md hover:shadow-lg transition-all"
                style={{ fontFamily: 'Poppins', fontWeight: 600 }}
              >
                Find Learning Partners
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {learningPartners.map((partner) => (
                <PartnerConnectionCard
                  key={partner.friendship_id || partner.id}
                  partner={partner}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  )
}

export default NetworkSection
