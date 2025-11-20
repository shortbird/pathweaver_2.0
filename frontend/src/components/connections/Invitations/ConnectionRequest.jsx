import React from 'react'
import { ClockIcon } from '@heroicons/react/24/outline'

const ConnectionRequest = ({ request, type = 'incoming', onAccept, onDecline, onCancel }) => {
  const isIncoming = type === 'incoming'
  const person = isIncoming ? request.requester : request.addressee
  const initial = person?.first_name?.charAt(0)?.toUpperCase() || '?'

  return (
    <div
      className={`rounded-[16px] p-5 transition-all duration-300 ${
        isIncoming
          ? 'bg-gradient-to-r from-[#F3EFF4] to-[#E7D5F2] border-l-4'
          : 'bg-neutral-50'
      }`}
      style={isIncoming ? { borderLeftColor: '#6D469B' } : {}}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3 flex-1 min-w-0">
          {/* Avatar */}
          <div
            className="w-12 h-12 rounded-full flex items-center justify-center text-white font-bold text-lg flex-shrink-0 shadow-sm"
            style={{
              background: 'linear-gradient(135deg, #6D469B 0%, #EF597B 100%)',
              fontFamily: 'Poppins',
              fontWeight: 700,
            }}
          >
            {initial}
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            <h4
              className="font-semibold text-neutral-700 mb-1"
              style={{ fontFamily: 'Poppins', fontWeight: 600 }}
            >
              {person?.first_name} {person?.last_name}
            </h4>

            {isIncoming ? (
              <p
                className="text-sm text-neutral-500 mb-2"
                style={{ fontFamily: 'Poppins', fontWeight: 500 }}
              >
                wants to connect
              </p>
            ) : (
              <div className="flex items-center gap-2 mb-2">
                {request.status === 'pending' && (
                  <span
                    className="text-xs bg-yellow-100 text-yellow-700 px-2 py-1 rounded-full font-medium"
                    style={{ fontFamily: 'Poppins', fontWeight: 600 }}
                  >
                    ⏳ Pending
                  </span>
                )}
                {request.status === 'rejected' && (
                  <span
                    className="text-xs bg-red-100 text-red-700 px-2 py-1 rounded-full font-medium"
                    style={{ fontFamily: 'Poppins', fontWeight: 600 }}
                  >
                    ❌ Declined
                  </span>
                )}
                {request.status === 'accepted' && (
                  <span
                    className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded-full font-medium"
                    style={{ fontFamily: 'Poppins', fontWeight: 600 }}
                  >
                    ✓ Approved
                  </span>
                )}
              </div>
            )}

            <div className="flex items-center gap-1 text-xs text-neutral-400">
              <ClockIcon className="w-3 h-3" />
              <span style={{ fontFamily: 'Poppins', fontWeight: 500 }}>
                {isIncoming ? request.timeAgo : `Sent ${request.timeAgo}`}
              </span>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex flex-col sm:flex-row gap-2 flex-shrink-0">
          {isIncoming ? (
            <>
              <button
                onClick={() => onAccept(request.friendship_id)}
                className="bg-gradient-primary text-white px-4 py-2 rounded-full text-sm font-semibold shadow-[0_2px_10px_rgba(109,70,155,0.15)] hover:shadow-[0_4px_15px_rgba(109,70,155,0.25)] transition-all duration-300"
                style={{ fontFamily: 'Poppins', fontWeight: 600 }}
              >
                Accept Connection
              </button>
              <button
                onClick={() => onDecline(request.friendship_id)}
                className="bg-gray-200 text-gray-700 px-4 py-2 rounded-full text-sm font-medium hover:bg-gray-300 transition-colors"
                style={{ fontFamily: 'Poppins', fontWeight: 500 }}
              >
                Decline
              </button>
            </>
          ) : (
            request.status === 'pending' && (
              <button
                onClick={() => onCancel(request.friendship_id)}
                className="text-red-600 hover:text-red-800 text-sm font-medium px-3 py-1 hover:bg-red-50 rounded transition-colors"
                style={{ fontFamily: 'Poppins', fontWeight: 500 }}
              >
                Cancel Request
              </button>
            )
          )}
        </div>
      </div>
    </div>
  )
}

export default ConnectionRequest
