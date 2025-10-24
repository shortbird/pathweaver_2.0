import React from 'react';

/**
 * BadgeProgressCard
 *
 * Displays badge progress with breakdown for OnFire pathway badges.
 * Shows OnFire courses vs custom Optio quests separately.
 *
 * Supports both badge types:
 * - exploration: Traditional quest/XP tracking
 * - onfire_pathway: OnFire courses + Optio quests
 */
const BadgeProgressCard = ({ badge, progress }) => {
  const isOnFirePathway = badge.badge_type === 'onfire_pathway';
  const pillarColors = {
    stem: 'purple',
    wellness: 'green',
    communication: 'blue',
    civics: 'orange',
    art: 'pink'
  };

  const color = pillarColors[badge.pillar_primary] || 'purple';

  const renderOnFireProgress = () => (
    <div className="space-y-4">
      {/* OnFire Courses Progress */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 bg-orange-100 rounded-full flex items-center justify-center">
              <span className="text-sm">🔥</span>
            </div>
            <span className="font-semibold text-gray-700">OnFire Courses</span>
          </div>
          <span className="text-sm font-medium text-gray-600">
            {progress.onfire_courses_completed}/{progress.onfire_courses_required}
          </span>
        </div>

        <div className="w-full bg-gray-200 rounded-full h-3 overflow-hidden">
          <div
            className="bg-gradient-to-r from-orange-500 to-orange-600 h-full transition-all duration-500 rounded-full"
            style={{ width: `${progress.onfire_progress}%` }}
          />
        </div>
      </div>

      {/* Custom Optio Quests Progress */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <div className={`w-6 h-6 bg-${color}-100 rounded-full flex items-center justify-center`}>
              <span className="text-sm">✨</span>
            </div>
            <span className="font-semibold text-gray-700">Custom Quests</span>
          </div>
          <span className="text-sm font-medium text-gray-600">
            {progress.optio_quests_completed}/{progress.optio_quests_required}
          </span>
        </div>

        <div className="w-full bg-gray-200 rounded-full h-3 overflow-hidden">
          <div
            className={`bg-gradient-to-r from-${color}-600 to-${color}-700 h-full transition-all duration-500 rounded-full`}
            style={{ width: `${progress.optio_progress}%` }}
          />
        </div>
      </div>

      {/* Overall Progress */}
      <div className="pt-2 border-t border-gray-200">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-gray-600">Overall Progress</span>
          <span className="text-lg font-bold text-gray-900">{progress.percentage}%</span>
        </div>
      </div>
    </div>
  );

  const renderExplorationProgress = () => (
    <div className="space-y-4">
      {/* Quests Progress */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <span className="font-semibold text-gray-700">Quests Picked Up & Set Down</span>
          <span className="text-sm font-medium text-gray-600">
            {progress.quests_completed}/{progress.quests_required}
          </span>
        </div>

        <div className="w-full bg-gray-200 rounded-full h-3 overflow-hidden">
          <div
            className={`bg-gradient-to-r from-${color}-600 to-${color}-700 h-full transition-all duration-500 rounded-full`}
            style={{ width: `${progress.quest_progress}%` }}
          />
        </div>
      </div>

      {/* XP Progress */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <span className="font-semibold text-gray-700">XP Earned</span>
          <span className="text-sm font-medium text-gray-600">
            {progress.xp_earned}/{progress.xp_required} XP
          </span>
        </div>

        <div className="w-full bg-gray-200 rounded-full h-3 overflow-hidden">
          <div
            className={`bg-gradient-to-r from-${color}-500 to-${color}-600 h-full transition-all duration-500 rounded-full`}
            style={{ width: `${progress.xp_progress}%` }}
          />
        </div>
      </div>

      {/* Overall Progress */}
      <div className="pt-2 border-t border-gray-200">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-gray-600">Overall Progress</span>
          <span className="text-lg font-bold text-gray-900">{progress.percentage}%</span>
        </div>
      </div>
    </div>
  );

  return (
    <div className="bg-white rounded-lg p-6 shadow-md border-2 border-gray-100">
      {/* Badge Header */}
      <div className="flex items-start gap-4 mb-4">
        {badge.image_url && (
          <img
            src={badge.image_url}
            alt={badge.name}
            className="w-16 h-16 rounded-full object-cover"
          />
        )}
        <div className="flex-1">
          <h3 className="font-bold text-lg text-gray-900">{badge.name}</h3>
          <p className="text-sm text-gray-600 italic">{badge.identity_statement}</p>
          {isOnFirePathway && (
            <div className="mt-1 inline-flex items-center gap-1 px-2 py-1 bg-orange-100 text-orange-700 rounded-full text-xs font-medium">
              <span>🔥</span>
              <span>OnFire Pathway</span>
            </div>
          )}
        </div>
      </div>

      {/* Progress Bars */}
      {isOnFirePathway ? renderOnFireProgress() : renderExplorationProgress()}

      {/* Status Message */}
      {progress.can_claim && (
        <div className="mt-4 p-3 bg-green-50 border-2 border-green-200 rounded-lg">
          <p className="text-sm font-medium text-green-800">
            ✅ Ready to claim! All requirements met.
          </p>
        </div>
      )}
    </div>
  );
};

export default BadgeProgressCard;
