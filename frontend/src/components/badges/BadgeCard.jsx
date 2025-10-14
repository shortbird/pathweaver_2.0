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
 * BadgeCard component - displays a badge with background image
 * Features:
 * - Background image (like quests) with dark overlay
 * - Teen-focused imagery from Pexels
 * - Full description display
 * - Progress metrics (x/x quests, x/x XP)
 * - Entire card is clickable (no separate button)
 */
export default function BadgeCard({ badge, onClick }) {
  const gradientClass = pillarColors[badge.pillar_primary] || 'from-gray-400 to-gray-600';

  const userProgress = badge.user_progress;
  const isActive = userProgress && userProgress.is_active && !userProgress.completed_at;
  const isCompleted = userProgress && userProgress.completed_at;
  const hasStarted = isActive || isCompleted;

  // Calculate progress metrics
  const questsCompleted = userProgress?.quests_completed || 0;
  const questsRequired = badge.min_quests || 0;
  const xpEarned = userProgress?.xp_earned || 0;
  const xpRequired = badge.min_xp || 0;

  return (
    <div
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyPress={(e) => e.key === 'Enter' && onClick()}
      aria-label={`View details for ${badge.name} badge`}
      className="bg-white rounded-xl shadow-md hover:shadow-2xl transition-all duration-300 cursor-pointer overflow-hidden group transform hover:-translate-y-1"
    >
      {/* Background Image Header (like quests) */}
      <div className="relative h-48 overflow-hidden">
        {/* Background Image with Fallback to Gradient */}
        {badge.image_url ? (
          <>
            <img
              src={badge.image_url}
              alt={badge.name}
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
            />
            {/* Dark overlay for text readability */}
            <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/30 to-black/20"></div>
          </>
        ) : (
          /* Fallback gradient if no image */
          <div className={`w-full h-full bg-gradient-to-br ${gradientClass}`}>
            <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-black/20 to-transparent"></div>
          </div>
        )}

        {/* Badge Name - Positioned at bottom of image */}
        <div className="absolute bottom-4 left-4 right-4">
          <h3 className="text-white text-xl font-bold drop-shadow-lg line-clamp-2">
            {badge.name}
          </h3>
        </div>

        {/* Status Badges */}
        {isCompleted && (
          <div className="absolute top-3 right-3 bg-green-500 text-white text-xs font-bold px-3 py-1.5 rounded-full shadow-lg flex items-center gap-1">
            <Trophy className="w-3 h-3" />
            COMPLETED
          </div>
        )}
        {isActive && !isCompleted && (
          <div className="absolute top-3 right-3 bg-blue-500 text-white text-xs font-bold px-3 py-1.5 rounded-full shadow-lg flex items-center gap-1">
            <Target className="w-3 h-3" />
            IN PROGRESS
          </div>
        )}

        {/* Pillar Icon - Top Left */}
        <div className="absolute top-3 left-3 bg-white/20 backdrop-blur-sm rounded-full p-2">
          <BadgePillarIcon pillar={badge.pillar_primary} className="w-6 h-6 text-white drop-shadow" />
        </div>
      </div>

      {/* Card Content */}
      <div className="p-5">
        {/* Identity Statement */}
        <p className="text-sm text-gray-600 italic mb-3 line-clamp-2">
          "{badge.identity_statement}"
        </p>

        {/* Full Description (3 lines) */}
        <p className="text-sm text-gray-700 mb-4 line-clamp-3">
          {badge.description}
        </p>

        {/* Progress Metrics or Requirements */}
        <div className="mb-4">
          {hasStarted ? (
            /* Show Progress for Started Badges */
            <div className="space-y-2">
              <div className="flex justify-between items-center text-sm">
                <span className="text-gray-600">Quests:</span>
                <span className="font-semibold text-gray-800">
                  {questsCompleted} / {questsRequired}
                </span>
              </div>
              <div className="flex justify-between items-center text-sm">
                <span className="text-gray-600">XP:</span>
                <span className="font-semibold text-gray-800">
                  {xpEarned} / {xpRequired}
                </span>
              </div>
            </div>
          ) : (
            /* Show Requirements for Unstarted Badges */
            <div className="flex items-center gap-4 text-sm text-gray-600">
              <div className="flex items-center gap-1.5">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span className="font-medium">{questsRequired} quests</span>
              </div>
              <div className="flex items-center gap-1.5">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
                <span className="font-medium">{xpRequired} XP</span>
              </div>
            </div>
          )}
        </div>

        {/* Pillar Tag */}
        <div className="pt-3 border-t border-gray-100">
          <span className="inline-block text-xs bg-gray-100 text-gray-700 px-3 py-1 rounded-full font-medium">
            {badge.pillar_primary}
          </span>
        </div>
      </div>
    </div>
  );
}
