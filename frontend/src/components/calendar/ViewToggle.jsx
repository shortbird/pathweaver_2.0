import React from 'react'
import { CalendarIcon, ListBulletIcon } from '@heroicons/react/24/outline'

const ViewToggle = ({ currentView, onChange }) => {
  return (
    <div className="inline-flex rounded-lg border border-gray-300 bg-white p-1" role="tablist" aria-label="Calendar view options">
      <button
        onClick={() => onChange('calendar')}
        className={`
          inline-flex items-center px-4 py-2 rounded-md text-sm font-medium transition-colors
          ${currentView === 'calendar'
            ? 'bg-gradient-to-r from-[#6d469b] to-[#ef597b] text-white'
            : 'text-gray-700 hover:text-gray-900 hover:bg-gray-50'
          }
        `}
        role="tab"
        aria-selected={currentView === 'calendar'}
        aria-controls="calendar-panel"
      >
        <CalendarIcon className="w-5 h-5 mr-2" />
        Calendar
      </button>
      <button
        onClick={() => onChange('list')}
        className={`
          inline-flex items-center px-4 py-2 rounded-md text-sm font-medium transition-colors
          ${currentView === 'list'
            ? 'bg-gradient-to-r from-[#6d469b] to-[#ef597b] text-white'
            : 'text-gray-700 hover:text-gray-900 hover:bg-gray-50'
          }
        `}
        role="tab"
        aria-selected={currentView === 'list'}
        aria-controls="list-panel"
      >
        <ListBulletIcon className="w-5 h-5 mr-2" />
        List
      </button>
    </div>
  )
}

export default ViewToggle
