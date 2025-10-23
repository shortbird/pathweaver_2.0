import React from 'react';
import { BadgePillarIcon } from '../badges/BadgePillarIcon';
import { useNavigate } from 'react-router-dom';
import { Crown } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';

/**
 * BadgeCarouselCard Component
 * Displays a badge in the carousel with background image and progress indicator
 * Features:
 * - Background image from Pexels with dark overlay
 * - Teen-focused imagery
 * - Full description display
 * - Progress metrics (x/x quests, x/x XP)
 * - Paid feature indicator for free tier users
 * - Entire card is clickable
 */
export default function BadgeCarouselCard({ badge }) {
  const navigate = useNavigate();
  const { user } = useAuth();

  // Check if user is on free tier
  const isFreeTier = user?.subscription_tier === 'Free';

  const handleClick = () => {
    navigate(`/badges/${badge.id}`);
  };

  // Calculate progress
  const hasProgress = badge.progress && badge.progress.quests_completed > 0;
  const questsCompleted = hasProgress ? badge.progress.quests_completed : 0;
  const questsRequired = badge.min_quests || 0;
  const xpEarned = hasProgress && badge.progress.xp_earned ? badge.progress.xp_earned : 0;
  const xpRequired = badge.min_xp || 0;

  // Pillar gradient colors (fallback if no image)
  const pillarGradients = {
    'STEM & Logic': 'from-blue-500 to-blue-600',
    'Life & Wellness': 'from-red-500 to-red-600',
    'Language & Communication': 'from-green-500 to-green-600',
    'Society & Culture': 'from-orange-500 to-orange-600',
    'Arts & Creativity': 'from-purple-500 to-purple-600'
  };

  const gradientClass = pillarGradients[badge.pillar_primary] || 'from-gray-500 to-gray-600';

  return (
    <div
      onClick={handleClick}
      className="
        flex-shrink-0 w-72 bg-white rounded-xl shadow-md hover:shadow-xl
        transition-all duration-300 cursor-pointer overflow-hidden
        transform hover:-translate-y-1 group
      "
    >
      {/* Background Image Header (like quests) */}
      <div className="relative h-48 overflow-hidden">
        {/* Background Image with Fallback to Gradient */}
        {badge.image_url ? (
          <>
            <img
              src={badge.image_url}
              alt={badge.name}
              loading="lazy"
              decoding="async"
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

        {/* Pillar Icon - Top Left */}
        <div className="absolute top-3 left-3 bg-white/20 backdrop-blur-sm rounded-full p-2">
          <BadgePillarIcon pillar={badge.pillar_primary} className="w-6 h-6 text-white drop-shadow" />
        </div>

        {/* Paid Feature Badge - Top Right */}
        {isFreeTier && (
          <div className="absolute top-3 right-3 bg-amber-500/90 backdrop-blur-sm text-white px-3 py-1.5 rounded-full text-xs font-bold flex items-center gap-1.5 shadow-lg">
            <Crown className="w-3.5 h-3.5" />
            PAID
          </div>
        )}
      </div>

      {/* Card content */}
      <div className="p-4">
        {/* Identity statement */}
        <p className="text-sm text-gray-600 italic mb-2 line-clamp-2">
          "{badge.identity_statement}"
        </p>

        {/* Description */}
        <p className="text-sm text-gray-700 mb-3 line-clamp-3">
          {badge.description}
        </p>

        {/* Progress Metrics */}
        <div className="space-y-2">
          {hasProgress ? (
            /* Show Progress for Started Badges */
            <>
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
            </>
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
      </div>
    </div>
  );
}
