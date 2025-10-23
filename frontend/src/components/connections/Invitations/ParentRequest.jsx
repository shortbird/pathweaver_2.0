import React from 'react'
import { CheckCircleIcon, XMarkIcon, UserGroupIcon } from '@heroicons/react/24/outline'

const ParentRequest = ({ request, onAccept, onDecline }) => {
  const formatTimeAgo = (timestamp) => {
    if (!timestamp) return ''
    const now = new Date()
    const time = new Date(timestamp)
    const diffInHours = Math.floor((now - time) / (1000 * 60 * 60))

    if (diffInHours < 1) return 'Just now'
    if (diffInHours < 24) return `${diffInHours} hour${diffInHours > 1 ? 's' : ''} ago`
    const diffInDays = Math.floor(diffInHours / 24)
    return `${diffInDays} day${diffInDays > 1 ? 's' : ''} ago`
  }

  return (
    <div
      className="flex items-center justify-between p-4 bg-blue-50 border-2 border-blue-200 rounded-xl hover:shadow-md transition-shadow"
      role="article"
      aria-label={`Parent access request from ${request.parent_name}`}
    >
      <div className="flex items-center gap-4 flex-1 min-w-0">
        {/* Icon */}
        <div className="w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
          <UserGroupIcon className="w-7 h-7 text-blue-600" />
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <p
            className="font-bold text-neutral-700 text-base mb-1 truncate"
            style={{ fontFamily: 'Poppins', fontWeight: 700 }}
          >
            {request.parent_name}
          </p>
          <p
            className="text-sm text-neutral-500 font-medium"
            style={{ fontFamily: 'Poppins', fontWeight: 500 }}
          >
            {request.parent_email}
          </p>
          <p
            className="text-xs text-[#9692A0] mt-1 font-medium"
            style={{ fontFamily: 'Poppins', fontWeight: 500 }}
          >
            Parent access request • {formatTimeAgo(request.requested_at)}
          </p>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex gap-2 ml-4">
        <button
          onClick={() => onAccept(request.link_id)}
          className="p-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2"
          aria-label={`Accept parent access request from ${request.parent_name}`}
          title="Accept request"
        >
          <CheckCircleIcon className="w-5 h-5" />
        </button>
        <button
          onClick={() => onDecline(request.link_id)}
          className="p-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2"
          aria-label={`Decline parent access request from ${request.parent_name}`}
          title="Decline request"
        >
          <XMarkIcon className="w-5 h-5" />
        </button>
      </div>
    </div>
  )
}

export default ParentRequest
