import { BadgePillarIcon } from './BadgePillarIcon';
import { Trophy, Target } from 'lucide-react';

/**
 * Design system pillar color gradients - aligned with Optio brand
 * Using exact design system colors for consistency
 */
const pillarColors = {
  'STEM & Logic': 'from-pillar-stem to-blue-600',           // #2469D1
  'Arts & Creativity': 'from-pillar-arts to-purple-600',    // #AF56E5
  'Language & Communication': 'from-pillar-communication to-green-600',  // #3DA24A
  'Society & Culture': 'from-pillar-society to-orange-600', // #FF9028
  'Life & Wellness': 'from-pillar-life to-red-600'          // #E65C5C
};

/**
 * BadgeCard component - displays a badge with improved visual design
 * Features:
 * - Icon-based pillar representation (no more single letters)
 * - Improved hover states and animations
 * - Brand-compliant color gradients
 * - Progress visualization for active badges
 */
export default function BadgeCard({ badge, onClick }) {
  const gradientClass = pillarColors[badge.pillar_primary] || 'from-gray-400 to-gray-600';

  const userProgress = badge.user_progress;
  const isActive = userProgress && userProgress.is_active && !userProgress.completed_at;
  const isCompleted = userProgress && userProgress.completed_at;

  return (
    <div
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyPress={(e) => e.key === 'Enter' && onClick()}
      aria-label={`View details for ${badge.name} badge`}
      className="bg-white rounded-xl shadow-md hover:shadow-2xl transition-all duration-300 cursor-pointer overflow-hidden group transform hover:-translate-y-1"
    >
      {/* Gradient Header with Icon */}
      <div className={`relative h-40 bg-gradient-to-br ${gradientClass} flex flex-col items-center justify-center`}>
        {/* Main Pillar Icon */}
        <div className="mb-2 transform group-hover:scale-110 transition-transform duration-300">
          <BadgePillarIcon pillar={badge.pillar_primary} className="w-16 h-16 text-white" />
        </div>

        {/* Badge Name */}
        <div className="text-white text-lg font-bold text-center px-4 line-clamp-2">
          {badge.name}
        </div>

        {/* Status Badges */}
        {isCompleted && (
          <div className="absolute top-2 right-2 bg-green-500 text-white text-xs font-bold px-3 py-1 rounded-full shadow-lg flex items-center gap-1">
            <Trophy className="w-3 h-3" />
            COMPLETED
          </div>
        )}
        {isActive && !isCompleted && (
          <div className="absolute top-2 right-2 bg-green-500 text-white text-xs font-bold px-3 py-1 rounded-full shadow-lg flex items-center gap-1">
            <Target className="w-3 h-3" />
            IN PROGRESS
          </div>
        )}
        {badge.ai_generated && (
          <div className="absolute bottom-2 left-2 bg-black bg-opacity-50 text-white text-xs px-2 py-1 rounded backdrop-blur-sm">
            AI Generated
          </div>
        )}

        {/* Subtle pattern overlay for depth */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
      </div>

      {/* Card Content */}
      <div className="p-5">
        {/* Identity Statement */}
        <p className="text-sm text-gray-600 italic mb-3 line-clamp-2">
          "{badge.identity_statement}"
        </p>

        {/* Description */}
        <p className="text-sm text-gray-700 mb-4 line-clamp-2">
          {badge.description}
        </p>

        {/* Progress Bar (if active) */}
        {isActive && userProgress && (
          <div className="mb-4">
            <div className="flex justify-between text-xs text-gray-600 mb-1">
              <span className="font-medium">Progress</span>
              <span className="font-semibold">{userProgress.progress_percentage}%</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2.5 overflow-hidden">
              <div
                className={`bg-gradient-to-r ${gradientClass} h-2.5 rounded-full transition-all duration-500 ease-out`}
                style={{ width: `${userProgress.progress_percentage}%` }}
              ></div>
            </div>
            <div className="flex justify-between text-xs text-gray-500 mt-1">
              <span>{userProgress.quests_completed} / {badge.min_quests} quests</span>
              <span>{userProgress.xp_earned} / {badge.min_xp} XP</span>
            </div>
          </div>
        )}

        {/* Badge Stats - Redesigned with Icons */}
        <div className="pb-4 border-b border-gray-100">
          <div className="flex items-center gap-4 text-sm mb-3">
            <div className="flex items-center gap-1.5 text-gray-600">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span className="font-medium">{badge.min_quests}</span>
              <span className="text-xs text-gray-500">quests</span>
            </div>
            <div className="flex items-center gap-1.5 text-gray-600">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
              <span className="font-medium">{badge.min_xp}</span>
              <span className="text-xs text-gray-500">XP</span>
            </div>
          </div>

          {/* Pillar Tag - Now on its own row */}
          <span className="inline-block text-xs bg-gray-100 text-gray-700 px-3 py-1 rounded-full font-medium">
            {badge.pillar_primary}
          </span>
        </div>

        {/* Hover Call-to-Action */}
        <div className="pt-3 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
          <span className="text-sm font-semibold bg-gradient-to-r from-[#ef597b] to-[#6d469b] bg-clip-text text-transparent">
            View Details →
          </span>
        </div>
      </div>
    </div>
  );
}
