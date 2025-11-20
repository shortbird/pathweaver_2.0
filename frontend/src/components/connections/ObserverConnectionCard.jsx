import React, { useState } from 'react'
import { EyeIcon, EllipsisVerticalIcon } from '@heroicons/react/24/outline'

const ObserverConnectionCard = ({ connection }) => {
  const [showMenu, setShowMenu] = useState(false)

  // Get initial from name
  const getInitial = (name) => {
    if (!name) return '?'
    return name.charAt(0).toUpperCase()
  }

  // Format connection date
  const formatConnectionDate = (date) => {
    if (!date) return 'Recently'
    const now = new Date()
    const connectedDate = new Date(date)
    const diffInDays = Math.floor((now - connectedDate) / (1000 * 60 * 60 * 24))

    if (diffInDays === 0) return 'Today'
    if (diffInDays === 1) return 'Yesterday'
    if (diffInDays < 30) return `${diffInDays} days ago`
    const diffInMonths = Math.floor(diffInDays / 30)
    if (diffInMonths === 1) return '1 month ago'
    return `${diffInMonths} months ago`
  }

  const initial = getInitial(connection.name || connection.observer_name)
  const displayName = connection.name || connection.observer_name || 'Unknown'
  const connectionDate = formatConnectionDate(connection.linked_at || connection.created_at)

  return (
    <div className="bg-white border-2 border-blue-100 rounded-xl p-4 hover:border-blue-200 hover:shadow-md transition-all">
      <div className="flex items-center gap-4">
        {/* Avatar with Blue Gradient */}
        <div
          className="w-12 h-12 rounded-full bg-gradient-to-r from-blue-500 to-blue-600 flex items-center justify-center text-white text-lg font-bold flex-shrink-0"
          style={{ fontFamily: 'Poppins', fontWeight: 700 }}
        >
          {initial}
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <h4
              className="font-semibold text-gray-900 truncate"
              style={{ fontFamily: 'Poppins', fontWeight: 600 }}
            >
              {displayName}
            </h4>
            {/* Observer Badge */}
            <span className="px-2 py-0.5 bg-blue-100 text-blue-700 text-xs font-semibold rounded-full flex items-center gap-1">
              <EyeIcon className="w-3 h-3" />
              Observer
            </span>
          </div>
          <p
            className="text-sm text-gray-500 truncate"
            style={{ fontFamily: 'Poppins', fontWeight: 500 }}
          >
            Supporting your journey • Connected {connectionDate}
          </p>
        </div>

        {/* Options Menu */}
        <div className="relative">
          <button
            className="text-gray-400 hover:text-gray-600 transition-colors p-2"
            onClick={() => setShowMenu(!showMenu)}
            aria-label="Connection options"
          >
            <EllipsisVerticalIcon className="w-5 h-5" />
          </button>

          {/* Dropdown Menu */}
          {showMenu && (
            <div className="absolute right-0 mt-2 w-48 bg-white rounded-lg shadow-lg border-2 border-gray-100 z-10">
              <div className="py-1">
                <button
                  className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                  style={{ fontFamily: 'Poppins', fontWeight: 500 }}
                  onClick={() => setShowMenu(false)}
                  disabled
                >
                  View Details (Coming Soon)
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Close menu when clicking outside */}
      {showMenu && (
        <div
          className="fixed inset-0 z-0"
          onClick={() => setShowMenu(false)}
        />
      )}
    </div>
  )
}

export default ObserverConnectionCard
