import React from 'react'
import { ClockIcon, SparklesIcon } from '@heroicons/react/24/outline'

const TeamUpInvite = ({ invite, type = 'incoming', onAccept, onDecline, onCancel, onViewQuest }) => {
  const isIncoming = type === 'incoming'
  const person = isIncoming ? invite.sender : invite.partner
  const initial = person?.first_name?.charAt(0)?.toUpperCase() || '?'

  return (
    <div
      className={`rounded-[16px] p-5 transition-all duration-300 ${
        isIncoming
          ? 'bg-gradient-to-r from-[#F3EFF4] to-[#DDF1FC] border-l-4'
          : 'bg-[#F3EFF4]'
      }`}
      style={isIncoming ? { borderLeftColor: '#2469D1' } : {}}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3 flex-1 min-w-0">
          {/* Avatar */}
          <div
            className="w-12 h-12 rounded-full flex items-center justify-center text-white font-bold text-lg flex-shrink-0 shadow-sm"
            style={{
              background: 'linear-gradient(135deg, #2469D1 0%, #7AC1F4 100%)',
              fontFamily: 'Poppins',
              fontWeight: 700,
            }}
          >
            {initial}
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            <h4
              className="font-semibold text-[#3B383C] mb-1"
              style={{ fontFamily: 'Poppins', fontWeight: 600 }}
            >
              {person?.first_name} {person?.last_name}
            </h4>

            <p
              className="text-sm text-[#605C61] mb-1 truncate"
              style={{ fontFamily: 'Poppins', fontWeight: 500 }}
            >
              {isIncoming ? 'invited you to team up' : ''}
            </p>

            <p
              className="text-sm text-[#2469D1] mb-2 truncate font-medium"
              style={{ fontFamily: 'Poppins', fontWeight: 600 }}
            >
              Quest: {invite.quest?.title}
            </p>

            <div className="flex items-center gap-2 mb-2">
              <div className="flex items-center gap-1 bg-gradient-to-r from-[#6D469B] to-[#EF597B] text-white px-2 py-1 rounded-full text-xs font-bold">
                <SparklesIcon className="w-3 h-3" />
                <span style={{ fontFamily: 'Poppins', fontWeight: 700 }}>2x XP</span>
              </div>
            </div>

            <div className="flex items-center gap-1 text-xs text-[#908B92]">
              <ClockIcon className="w-3 h-3" />
              <span style={{ fontFamily: 'Poppins', fontWeight: 500 }}>
                {isIncoming ? invite.timeAgo : `Sent ${invite.timeAgo}`}
              </span>
            </div>

            {invite.message && (
              <p
                className="text-xs text-[#605C61] mt-2 italic"
                style={{ fontFamily: 'Poppins', fontWeight: 500 }}
              >
                "{invite.message}"
              </p>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="flex flex-col gap-2 flex-shrink-0">
          {isIncoming ? (
            <>
              <button
                onClick={() => onAccept(invite.id, invite.quest?.id)}
                className="bg-gradient-to-r from-[#6D469B] to-[#EF597B] text-white px-4 py-2 rounded-lg text-sm font-semibold shadow-[0_2px_10px_rgba(109,70,155,0.15)] hover:shadow-[0_4px_15px_rgba(109,70,155,0.25)] transition-all duration-300 whitespace-nowrap"
                style={{ fontFamily: 'Poppins', fontWeight: 600 }}
              >
                Accept Team-Up
              </button>
              <button
                onClick={() => onDecline(invite.id)}
                className="bg-gray-200 text-gray-700 px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-300 transition-colors"
                style={{ fontFamily: 'Poppins', fontWeight: 500 }}
              >
                Decline
              </button>
            </>
          ) : (
            <>
              {invite.status === 'pending' && (
                <button
                  onClick={() => onCancel(invite.id)}
                  className="text-red-600 hover:text-red-800 text-sm font-medium px-3 py-1 hover:bg-red-50 rounded transition-colors"
                  style={{ fontFamily: 'Poppins', fontWeight: 500 }}
                >
                  Cancel
                </button>
              )}
              {invite.status === 'accepted' && (
                <button
                  onClick={() => onViewQuest(invite.quest?.id)}
                  className="bg-green-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-green-700 transition-colors"
                  style={{ fontFamily: 'Poppins', fontWeight: 600 }}
                >
                  View Quest
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}

export default TeamUpInvite
