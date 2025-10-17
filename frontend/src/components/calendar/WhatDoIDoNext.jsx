import React, { useState } from 'react'
import { Link } from 'react-router-dom'
import { useNextUp, getPillarColor } from '../../hooks/api/useCalendar'
import { ChevronDownIcon, ChevronUpIcon, RocketLaunchIcon } from '@heroicons/react/24/outline'

const WhatDoIDoNext = ({ userId, selectedPillar, onPillarChange }) => {
  const { data: nextUpData, isLoading } = useNextUp(userId)
  const [isExpanded, setIsExpanded] = useState(false)

  const pillars = [
    'STEM & Logic',
    'Life & Wellness',
    'Language & Communication',
    'Society & Culture',
    'Arts & Creativity'
  ]

  if (isLoading) {
    return (
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <div className="animate-pulse">
          <div className="h-6 bg-gray-200 rounded w-1/4 mb-4"></div>
          <div className="space-y-3">
            <div className="h-4 bg-gray-200 rounded"></div>
            <div className="h-4 bg-gray-200 rounded w-5/6"></div>
          </div>
        </div>
      </div>
    )
  }

  const filteredToday = selectedPillar
    ? nextUpData?.today?.filter(item => item.pillar === selectedPillar) || []
    : nextUpData?.today || []

  const filteredWeek = selectedPillar
    ? nextUpData?.this_week?.filter(item => item.pillar === selectedPillar) || []
    : nextUpData?.this_week || []

  const filteredWandering = selectedPillar
    ? nextUpData?.wandering?.filter(item => item.pillar === selectedPillar) || []
    : nextUpData?.wandering || []

  const hasItems = filteredToday.length > 0 || filteredWeek.length > 0 || filteredWandering.length > 0

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200">
      {/* Header */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between p-6 hover:bg-gray-50 transition-colors"
        aria-expanded={isExpanded}
        aria-controls="next-up-content"
      >
        <div className="flex items-center">
          <RocketLaunchIcon className="w-6 h-6 text-purple-600 mr-3" />
          <h2 className="text-xl font-bold text-gray-900" style={{ fontFamily: 'Poppins, sans-serif' }}>
            What Do I Do Next?
          </h2>
        </div>
        {isExpanded ? (
          <ChevronUpIcon className="w-5 h-5 text-gray-400" />
        ) : (
          <ChevronDownIcon className="w-5 h-5 text-gray-400" />
        )}
      </button>

      {/* Content */}
      {isExpanded && (
        <div id="next-up-content" className="px-6 pb-6">
          {/* Pillar Filter */}
          <div className="mb-4">
            <label className="text-sm font-medium text-gray-700 block mb-2">Filter by Pillar:</label>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => onPillarChange(null)}
                className={`px-3 py-1 rounded-full text-sm font-medium transition-colors ${
                  !selectedPillar
                    ? 'bg-gray-800 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                All Pillars
              </button>
              {pillars.map(pillar => {
                const colors = getPillarColor(pillar)
                return (
                  <button
                    key={pillar}
                    onClick={() => onPillarChange(pillar)}
                    className={`px-3 py-1 rounded-full text-sm font-medium transition-colors ${
                      selectedPillar === pillar
                        ? `${colors.bg} ${colors.text} ring-2 ${colors.border}`
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    {pillar}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Items */}
          {!hasItems ? (
            <div className="text-center py-8">
              <p className="text-gray-600">No scheduled items{selectedPillar ? ' for this pillar' : ''}. Start by scheduling some tasks from the sidebar!</p>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Today's Items */}
              {filteredToday.length > 0 && (
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-3" style={{ fontFamily: 'Poppins, sans-serif' }}>Today</h3>
                  <div className="space-y-2">
                    {filteredToday.map(item => (
                      <TaskCard key={item.id} item={item} />
                    ))}
                    {nextUpData?.has_more_today && (
                      <Link to="/calendar" className="text-sm text-purple-600 hover:text-purple-800 font-medium">
                        View all today's tasks →
                      </Link>
                    )}
                  </div>
                </div>
              )}

              {/* This Week's Items */}
              {filteredWeek.length > 0 && (
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-3" style={{ fontFamily: 'Poppins, sans-serif' }}>This Week</h3>
                  <div className="space-y-2">
                    {filteredWeek.slice(0, 3).map(item => (
                      <TaskCard key={item.id} item={item} />
                    ))}
                    {filteredWeek.length > 3 && (
                      <p className="text-sm text-gray-600">+ {filteredWeek.length - 3} more this week</p>
                    )}
                  </div>
                </div>
              )}

              {/* Wandering Items */}
              {filteredWandering.length > 0 && (
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-3" style={{ fontFamily: 'Poppins, sans-serif' }}>Ready for a Pivot?</h3>
                  <p className="text-sm text-gray-600 mb-3">These items are past their date or haven't been active recently</p>
                  <div className="space-y-2">
                    {filteredWandering.slice(0, 3).map(item => (
                      <TaskCard key={item.id} item={item} />
                    ))}
                    {filteredWandering.length > 3 && (
                      <p className="text-sm text-gray-600">+ {filteredWandering.length - 3} more to explore</p>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

const TaskCard = ({ item }) => {
  const pillarColors = getPillarColor(item.pillar)

  return (
    <Link
      to={`/quests/${item.quest_id}`}
      className="flex items-center justify-between p-4 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors group border border-gray-200 hover:border-gray-300"
    >
      <div className="flex-1 min-w-0">
        {/* Task Title - Main Heading (EMPHASIZED) */}
        <h4 className="font-bold text-gray-900 text-lg mb-1 truncate" style={{ fontFamily: 'Poppins, sans-serif' }}>
          {item.task_title}
        </h4>
        {/* Quest Title - Subheading (secondary) */}
        <p className="font-medium text-gray-600 text-sm mb-2 truncate">{item.quest_title}</p>

        {/* Pillar and XP - Secondary */}
        <div className="flex items-center gap-2">
          <span className={`px-2 py-0.5 rounded text-xs font-medium ${pillarColors.bg} ${pillarColors.text}`}>
            {item.pillar}
          </span>
          {item.xp_value && (
            <span className="text-xs font-medium text-gray-500">{item.xp_value} XP</span>
          )}
        </div>
      </div>
      <button
        className="ml-4 px-3 py-1.5 bg-gradient-to-r from-[#6d469b] to-[#ef597b] text-white rounded-lg text-sm font-medium opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
        style={{ fontFamily: 'Poppins, sans-serif' }}
        onClick={(e) => {
          e.preventDefault()
          window.location.href = `/quests/${item.quest_id}`
        }}
      >
        Start Now
      </button>
    </Link>
  )
}

export default WhatDoIDoNext
