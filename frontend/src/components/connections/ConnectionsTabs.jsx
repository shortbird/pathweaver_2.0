import React from 'react'
import { UserGroupIcon, UsersIcon, EnvelopeIcon } from '@heroicons/react/24/outline'

const ConnectionsTabs = ({ activeTab, onTabChange, counts = {} }) => {
  const tabs = [
    {
      id: 'activity',
      label: 'Activity Feed',
      icon: UserGroupIcon,
      count: 0, // Activity feed doesn't show count
    },
    {
      id: 'connections',
      label: 'Your Connections',
      icon: UsersIcon,
      count: counts.connections || 0,
    },
    {
      id: 'invitations',
      label: 'Invitations',
      icon: EnvelopeIcon,
      count: counts.pendingRequests || 0, // Team invitations removed (Phase 3 refactoring)
    },
  ]

  return (
    <nav
      role="navigation"
      aria-label="Connection sections"
      className="bg-white border-b border-gray-200"
    >
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <div
          role="tablist"
          className="flex flex-col sm:flex-row gap-2 sm:gap-0 -mb-px"
        >
          {tabs.map((tab) => {
            const isActive = activeTab === tab.id
            const Icon = tab.icon

            return (
              <button
                key={tab.id}
                role="tab"
                aria-selected={isActive}
                aria-controls={`${tab.id}-panel`}
                id={`${tab.id}-tab`}
                onClick={() => onTabChange(tab.id)}
                className={`
                  flex items-center justify-center gap-2 px-6 py-4 font-semibold
                  border-b-3 transition-all duration-300 min-h-[48px]
                  ${
                    isActive
                      ? 'border-transparent bg-gradient-primary text-white rounded-t-lg'
                      : 'border-transparent text-neutral-400 hover:text-neutral-500 hover:bg-neutral-50'
                  }
                `}
                style={{ fontFamily: 'Poppins', fontWeight: 600 }}
              >
                <Icon className="w-5 h-5" aria-hidden="true" />
                <span className="text-center">{tab.label}</span>
                {tab.count > 0 && (
                  <span
                    className={`
                      flex items-center justify-center min-w-[24px] h-6 px-2
                      rounded-full text-xs font-bold
                      ${isActive ? 'bg-white text-optio-purple' : 'bg-gradient-primary text-white'}
                    `}
                    aria-label={`${tab.count} items`}
                  >
                    {tab.count}
                  </span>
                )}
              </button>
            )
          })}
        </div>
      </div>
    </nav>
  )
}

export default ConnectionsTabs
