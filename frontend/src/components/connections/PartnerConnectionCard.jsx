import React from 'react'
import { Link } from 'react-router-dom'
import {
  BeakerIcon,
  HeartIcon,
  ChatBubbleLeftRightIcon,
  ScaleIcon,
  PaintBrushIcon,
} from '@heroicons/react/24/outline'

const PartnerConnectionCard = ({ partner }) => {
  // Get initial from name
  const getInitial = (name) => {
    if (!name) return '?'
    return name.charAt(0).toUpperCase()
  }

  // Pillar configuration
  const pillarConfig = {
    stem: {
      icon: BeakerIcon,
      color: '#3B82F6', // blue
      label: 'STEM',
    },
    wellness: {
      icon: HeartIcon,
      color: '#10B981', // green
      label: 'Wellness',
    },
    communication: {
      icon: ChatBubbleLeftRightIcon,
      color: '#F59E0B', // amber
      label: 'Communication',
    },
    civics: {
      icon: ScaleIcon,
      color: '#8B5CF6', // violet
      label: 'Civics',
    },
    art: {
      icon: PaintBrushIcon,
      color: '#EF4444', // red
      label: 'Art',
    },
  }

  // Build display name from backend data structure
  // Backend returns: { id, first_name, last_name, display_name, avatar_url, bio, portfolio_slug, role }
  const firstName = partner.first_name || ''
  const lastName = partner.last_name || ''
  const fullName = `${firstName} ${lastName}`.trim()
  const displayName = partner.display_name || fullName || 'Unknown User'

  const initial = getInitial(displayName)
  const currentPillar = partner.current_pillar || partner.pillar_primary || 'stem'
  const pillarData = pillarConfig[currentPillar.toLowerCase()] || pillarConfig.stem
  const PillarIcon = pillarData.icon

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
          <div className="flex items-center gap-2 mt-1">
            <PillarIcon
              className="w-4 h-4"
              style={{ color: pillarData.color }}
            />
            <p
              className="text-sm font-medium truncate"
              style={{
                color: pillarData.color,
                fontFamily: 'Poppins',
                fontWeight: 500,
              }}
            >
              Exploring {pillarData.label}
            </p>
          </div>
        </div>

        {/* View Journey Button */}
        <Link
          to={`/diploma/${partner.id || partner.user_id}`}
          className="px-4 py-2 border-2 border-purple-300 text-purple-700 rounded-full font-medium hover:bg-gradient-primary hover:text-white hover:border-transparent transition-all whitespace-nowrap min-h-[44px] flex items-center touch-manipulation"
          style={{ fontFamily: 'Poppins', fontWeight: 500 }}
        >
          View Journey
        </Link>
      </div>
    </div>
  )
}

export default PartnerConnectionCard
