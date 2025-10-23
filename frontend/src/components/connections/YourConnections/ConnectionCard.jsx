import React from 'react'
import { EyeIcon, UserGroupIcon } from '@heroicons/react/24/outline'

// Pillar icon mapping
const PILLAR_ICONS = {
  'STEM & Logic': '🔬',
  'Life & Wellness': '❤️',
  'Language & Communication': '🗣️',
  'Society & Culture': '🌍',
  'Arts & Creativity': '🎨',
}

// Pillar color mapping
const PILLAR_COLORS = {
  'STEM & Logic': pillar-stem,
  'Life & Wellness': '#B3393F',
  'Language & Communication': pillar-communication,
  'Society & Culture': '#BE6B27',
  'Arts & Creativity': '#59189C',
}

const ConnectionCard = ({ connection, onViewJourney, onTeamUp }) => {
  // Get first initial for avatar
  const initial = connection.first_name?.charAt(0)?.toUpperCase() || '?'

  // Get current pillar info (mock for now, would come from recent activity)
  const currentPillar = connection.current_pillar || 'STEM & Logic'
  const pillarIcon = PILLAR_ICONS[currentPillar] || '🔬'
  const pillarColor = PILLAR_COLORS[currentPillar] || pillar-stem

  return (
    <div className="bg-white rounded-[20px] shadow-sm hover:shadow-lg hover:-translate-y-0.5 transition-all duration-300 p-6 flex flex-col items-center text-center min-h-[320px]">
      {/* Avatar */}
      <div
        className="w-20 h-20 rounded-full flex items-center justify-center text-white font-bold text-2xl mb-4 border-2 border-white shadow-md"
        style={{
          background: 'linear-gradient(135deg, #6D469B 0%, #EF597B 100%)',
          fontFamily: 'Poppins',
          fontWeight: 700,
        }}
      >
        {initial}
      </div>

      {/* Name */}
      <h3
        className="text-lg font-semibold text-neutral-700 mb-2"
        style={{ fontFamily: 'Poppins', fontWeight: 600 }}
      >
        {connection.first_name} {connection.last_name}
      </h3>

      {/* Current Activity */}
      <div className="flex items-center gap-2 mb-6">
        <span className="text-2xl" role="img" aria-label={currentPillar}>
          {pillarIcon}
        </span>
        <div className="text-left">
          <p
            className="text-xs text-neutral-400"
            style={{ fontFamily: 'Poppins', fontWeight: 500 }}
          >
            Currently exploring
          </p>
          <p
            className="text-sm font-medium"
            style={{ color: pillarColor, fontFamily: 'Poppins', fontWeight: 600 }}
          >
            {currentPillar}
          </p>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="w-full space-y-2 mt-auto">
        <button
          onClick={() => onTeamUp(connection.id)}
          className="w-full bg-gradient-primary text-white py-2.5 rounded-full font-semibold shadow-[0_2px_10px_rgba(109,70,155,0.15)] hover:shadow-[0_4px_15px_rgba(109,70,155,0.25)] transition-all duration-300 flex items-center justify-center gap-2"
          style={{ fontFamily: 'Poppins', fontWeight: 600 }}
        >
          <UserGroupIcon className="w-5 h-5" />
          Team Up on Quest
        </button>

        <button
          onClick={() => onViewJourney(connection.id)}
          className="w-full border-2 py-2.5 rounded-full font-medium transition-all duration-300 hover:bg-gradient-to-r hover:from-[#6D469B] hover:to-[#EF597B] hover:text-white hover:border-transparent flex items-center justify-center gap-2"
          style={{
            borderImage: 'linear-gradient(90deg, #6D469B 0%, #EF597B 100%) 1',
            color: '#6D469B',
            fontFamily: 'Poppins',
            fontWeight: 500,
          }}
        >
          <EyeIcon className="w-5 h-5" />
          View Journey
        </button>
      </div>
    </div>
  )
}

export default ConnectionCard
