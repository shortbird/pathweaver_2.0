import React from 'react'
import { CalendarIcon, ListBulletIcon } from '@heroicons/react/24/outline'

const ViewToggle = ({ currentView, onChange }) => {
  return (
    <div className="inline-flex rounded-lg border border-gray-300 bg-white p-1" role="tablist" aria-label="Calendar view options">
      <button
        onClick={() => onChange('calendar')}
        className={`
          inline-flex items-center px-4 py-2 rounded-md text-sm font-medium transition-colors min-h-[44px]
          ${currentView === 'calendar'
            ? 'bg-gradient-primary text-white'
            : 'text-gray-700 hover:text-gray-900 hover:bg-gray-50'
          }
        `}
        role="tab"
        aria-selected={currentView === 'calendar'}
        aria-controls="calendar-panel"
      >
        <CalendarIcon className="w-5 h-5 mr-2" />
        <span className="hidden sm:inline">Calendar</span>
      </button>
      <button
        onClick={() => onChange('list')}
        className={`
          inline-flex items-center px-4 py-2 rounded-md text-sm font-medium transition-colors min-h-[44px]
          ${currentView === 'list'
            ? 'bg-gradient-primary text-white'
            : 'text-gray-700 hover:text-gray-900 hover:bg-gray-50'
          }
        `}
        role="tab"
        aria-selected={currentView === 'list'}
        aria-controls="list-panel"
      >
        <ListBulletIcon className="w-5 h-5 mr-2" />
        <span className="hidden sm:inline">List</span>
      </button>
    </div>
  )
}

export default ViewToggle
