import React from 'react'
import { ClockIcon, HeartIcon, EyeIcon } from '@heroicons/react/24/outline'

// Pillar color mapping
const PILLAR_COLORS = {
  'STEM & Logic': { border: '#4BA3C3', bg: '#DDF1FC', text: '#4BA3C3' },
  'Life & Wellness': { border: '#B3393F', bg: '#FBE5E5', text: '#B3393F' },
  'Language & Communication': { border: '#58A55C', bg: '#E3F6E5', text: '#58A55C' },
  'Society & Culture': { border: '#BE6B27', bg: '#FFF0E1', text: '#BE6B27' },
  'Arts & Creativity': { border: '#59189C', bg: '#F2E7F9', text: '#59189C' },
}

const ActivityCard = ({ activity, onViewQuest, onEncourage }) => {
  const pillarColors = PILLAR_COLORS[activity.pillar] || PILLAR_COLORS['STEM & Logic']

  // Get first initial for avatar
  const initial = activity.userName?.charAt(0)?.toUpperCase() || '?'

  // Format activity text based on type
  const getActivityText = () => {
    if (activity.type === 'quest_started') {
      return (
        <>
          <span className="font-semibold" style={{ fontFamily: 'Poppins', fontWeight: 600 }}>
            {activity.userName}
          </span>
          {' is exploring '}
          <span style={{ color: pillarColors.text }}>
            {activity.pillar}
          </span>
        </>
      )
    } else if (activity.type === 'task_completed') {
      return (
        <>
          <span className="font-semibold" style={{ fontFamily: 'Poppins', fontWeight: 600 }}>
            {activity.userName}
          </span>
          {' completed a task in '}
          <span style={{ color: pillarColors.text }}>
            {activity.pillar}
          </span>
        </>
      )
    }
    return activity.userName
  }

  return (
    <div
      className="bg-white rounded-[20px] shadow-sm hover:shadow-md transition-all duration-300 hover:scale-[1.01] p-5"
      style={{ borderLeft: `4px solid ${pillarColors.border}` }}
    >
      <div className="flex items-start gap-4">
        {/* Avatar */}
        <div
          className="w-12 h-12 rounded-full flex items-center justify-center text-white font-bold text-lg flex-shrink-0 border-2 border-white shadow-sm"
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
          <p className="text-neutral-700 mb-1" style={{ fontFamily: 'Poppins', fontWeight: 500 }}>
            {getActivityText()}
          </p>

          <p
            className="text-sm text-neutral-500 mb-2 truncate"
            style={{ fontFamily: 'Poppins', fontWeight: 500 }}
          >
            {activity.questTitle}
          </p>

          <div className="flex items-center gap-1 text-xs text-neutral-400 mb-3">
            <ClockIcon className="w-3 h-3" aria-hidden="true" />
            <span style={{ fontFamily: 'Poppins', fontWeight: 500 }}>{activity.timeAgo}</span>
          </div>

          {/* Action Buttons */}
          <div className="flex gap-2">
            <button
              onClick={() => onViewQuest(activity.questId)}
              className="flex items-center gap-1 px-3 py-1.5 text-sm border-2 rounded-full transition-all duration-300 hover:bg-gradient-to-r hover:from-[#6D469B] hover:to-[#EF597B] hover:text-white hover:border-transparent"
              style={{
                borderImage: 'linear-gradient(90deg, #6D469B 0%, #EF597B 100%) 1',
                color: '#6D469B',
                fontFamily: 'Poppins',
                fontWeight: 500,
              }}
            >
              <EyeIcon className="w-4 h-4" />
              View Quest
            </button>

            <button
              onClick={() => onEncourage(activity.userId)}
              className="flex items-center gap-1 px-3 py-1.5 text-sm text-optio-purple hover:bg-neutral-50 rounded-full transition-colors"
              style={{ fontFamily: 'Poppins', fontWeight: 500 }}
            >
              <HeartIcon className="w-4 h-4" />
              Encourage
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default ActivityCard
