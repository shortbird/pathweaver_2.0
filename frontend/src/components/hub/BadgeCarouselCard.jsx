import React from 'react';
import { BadgePillarIcon } from '../badges/BadgePillarIcon';
import { useNavigate } from 'react-router-dom';

/**
 * BadgeCarouselCard Component
 * Displays a badge in the carousel with progress indicator
 * Matches mockup design: shows icon, name, identity statement, and quest count
 */
export default function BadgeCarouselCard({ badge }) {
  const navigate = useNavigate();

  const handleClick = () => {
    navigate(`/badges/${badge.id}`);
  };

  // Calculate progress
  const hasProgress = badge.progress && badge.progress.quests_completed > 0;
  const questsCompleted = hasProgress ? badge.progress.quests_completed : 0;
  const questsRequired = badge.min_quests || 0;
  const progressPercentage = hasProgress ? badge.progress.percentage : 0;

  // Pillar gradient colors
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
      {/* Gradient header with icon */}
      <div className={`relative h-32 bg-gradient-to-br ${gradientClass} flex items-center justify-center`}>
        <div className="transform group-hover:scale-110 transition-transform duration-300">
          <BadgePillarIcon pillar={badge.pillar_primary} className="w-12 h-12 text-white" />
        </div>

        {/* Subtle pattern overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
      </div>

      {/* Card content */}
      <div className="p-4">
        {/* Badge name */}
        <h3 className="font-bold text-lg text-gray-900 mb-2 line-clamp-1">
          {badge.name}
        </h3>

        {/* Identity statement */}
        <p className="text-sm text-gray-600 italic mb-3 line-clamp-2">
          "{badge.identity_statement}"
        </p>

        {/* Quest count indicator */}
        <div className="flex items-center justify-between text-sm">
          <div className="flex items-center gap-2 text-gray-700">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span className="font-semibold">
              {questsCompleted} / {questsRequired} quests
            </span>
          </div>

          {/* Progress percentage indicator */}
          {hasProgress && (
            <span className="text-xs font-medium bg-gradient-to-r from-[#ef597b] to-[#6d469b] bg-clip-text text-transparent">
              {Math.round(progressPercentage)}%
            </span>
          )}
        </div>

        {/* Progress bar */}
        {hasProgress && (
          <div className="mt-3 w-full bg-gray-200 rounded-full h-2 overflow-hidden">
            <div
              className={`bg-gradient-to-r ${gradientClass} h-2 rounded-full transition-all duration-500`}
              style={{ width: `${progressPercentage}%` }}
            />
          </div>
        )}

        {/* Call to action on hover */}
        <div className="mt-3 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
          <span className="text-sm font-semibold bg-gradient-to-r from-[#ef597b] to-[#6d469b] bg-clip-text text-transparent">
            View Details →
          </span>
        </div>
      </div>
    </div>
  );
}
