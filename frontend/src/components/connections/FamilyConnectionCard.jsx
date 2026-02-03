import React, { useState } from 'react'
import { EllipsisVerticalIcon } from '@heroicons/react/24/outline'

const FamilyConnectionCard = ({ connection }) => {
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

  const initial = getInitial(connection.name || connection.parent_name)
  const displayName = connection.name || connection.parent_name || 'Unknown'
  const connectionDate = formatConnectionDate(connection.linked_at || connection.created_at)

  return (
    <div className="bg-white border-2 border-gray-100 rounded-xl p-4 hover:border-purple-200 hover:shadow-md transition-all">
      <div className="flex items-center gap-4">
        {/* Avatar */}
        <div
          className="w-12 h-12 rounded-full bg-gradient-primary flex items-center justify-center text-white text-lg font-bold flex-shrink-0"
          style={{ fontFamily: 'Poppins', fontWeight: 700 }}
        >
          {initial}
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <h4
            className="font-semibold text-gray-900 truncate"
            style={{ fontFamily: 'Poppins', fontWeight: 600 }}
          >
            {displayName}
          </h4>
          <p
            className="text-sm text-gray-500 truncate"
            style={{ fontFamily: 'Poppins', fontWeight: 500 }}
          >
            Parent • Connected {connectionDate}
          </p>
        </div>

        {/* Options Menu */}
        <div className="relative">
          <button
            className="text-gray-400 hover:text-gray-600 transition-colors p-2 min-h-[44px] min-w-[44px] flex items-center justify-center"
            onClick={() => setShowMenu(!showMenu)}
            aria-label="Connection options"
          >
            <EllipsisVerticalIcon className="w-5 h-5" />
          </button>

          {/* Dropdown Menu (Future: Add remove option) */}
          {showMenu && (
            <div className="absolute right-0 mt-2 w-48 bg-white rounded-lg shadow-lg border-2 border-gray-100 z-10">
              <div className="py-1">
                <button
                  className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors min-h-[44px]"
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

export default FamilyConnectionCard
