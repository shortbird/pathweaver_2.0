import React from 'react'
import { EnvelopeIcon, EyeIcon, UsersIcon } from '@heroicons/react/24/outline'
import ObserverConnectionCard from './ObserverConnectionCard'
import PartnerConnectionCard from './PartnerConnectionCard'
import ConnectionRequest from './Invitations/ConnectionRequest'

const NetworkSection = ({
  // Learning Partner data
  learningPartners = [],
  pendingPartnerRequests = [],
  sentPartnerRequests = [],
  onAcceptPartnerRequest,
  onDeclinePartnerRequest,
  onCancelPartnerRequest,
  onConnectPartner,
  // Observer data
  observers = [],
  onRequestObserver,
}) => {
  const observersCount = observers.length
  const partnersCount = learningPartners.length
  const totalPendingPartnerRequests = pendingPartnerRequests.length + sentPartnerRequests.length

  return (
    <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 pb-16">

      <div className="grid lg:grid-cols-2 gap-8">
        {/* Left Column: Observers */}
        <div className="space-y-6">
          <div className="flex items-center justify-between mb-4">
            <h3
              className="text-xl font-bold text-gray-900"
              style={{ fontFamily: 'Poppins', fontWeight: 700 }}
            >
              Observers
            </h3>
            {observersCount > 0 && (
              <button
                onClick={onRequestObserver}
                className="text-sm text-blue-600 hover:text-blue-700 font-medium flex items-center gap-1"
                style={{ fontFamily: 'Poppins', fontWeight: 500 }}
              >
                <EyeIcon className="w-4 h-4" />
                Request Observer
              </button>
            )}
          </div>

          {/* Observers Empty State */}
          {observersCount === 0 ? (
            <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-xl p-8 border-2 border-blue-200 text-center">
              <div className="w-16 h-16 bg-gradient-to-r from-blue-500 to-blue-600 rounded-full flex items-center justify-center mx-auto mb-4">
                <EyeIcon className="w-8 h-8 text-white" />
              </div>
              <h4
                className="text-lg font-bold text-gray-900 mb-2"
                style={{ fontFamily: 'Poppins', fontWeight: 700 }}
              >
                No observers yet
              </h4>
              <p
                className="text-gray-600 mb-6 leading-relaxed"
                style={{ fontFamily: 'Poppins', fontWeight: 500 }}
              >
                Observers support your learning journey. They're added by your advisors to help guide and celebrate your progress.
              </p>
              <button
                onClick={onRequestObserver}
                className="bg-gradient-to-r from-blue-500 to-blue-600 text-white px-6 py-3 rounded-full font-semibold shadow-md hover:shadow-lg transition-all flex items-center gap-2 mx-auto"
                style={{ fontFamily: 'Poppins', fontWeight: 600 }}
              >
                <EyeIcon className="w-5 h-5" />
                Request Observer
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {observers.map((observer) => (
                <ObserverConnectionCard
                  key={observer.id}
                  connection={observer}
                />
              ))}
            </div>
          )}
        </div>

        {/* Right Column: Learning Partners */}
        <div className="space-y-6">
          <div className="flex items-center justify-between mb-4">
            <h3
              className="text-xl font-bold text-gray-900"
              style={{ fontFamily: 'Poppins', fontWeight: 700 }}
            >
              Learning Partners
            </h3>
            {partnersCount > 0 && (
              <button
                onClick={onConnectPartner}
                className="text-sm text-optio-purple hover:text-purple-700 font-medium flex items-center gap-1"
                style={{ fontFamily: 'Poppins', fontWeight: 500 }}
              >
                <UsersIcon className="w-4 h-4" />
                Add Partner
              </button>
            )}
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
