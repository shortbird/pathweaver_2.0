import React from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';

const BadgeCard = ({ badge, showProgress = false, userProgress = null }) => {
  const { id, name, description, icon, pillar, required_quest_count, tier } = badge;

  const pillarColors = {
    'STEM & Logic': 'from-blue-500 to-indigo-600',
    'Life & Wellness': 'from-green-500 to-emerald-600',
    'Language & Communication': 'from-amber-500 to-orange-600',
    'Society & Culture': 'from-purple-500 to-violet-600',
    'Arts & Creativity': 'from-pink-500 to-rose-600',
  };

  const tierBadges = {
    explorer: { label: 'Explorer', color: 'bg-gray-500' },
    creator: { label: 'Creator', color: 'bg-blue-500' },
    visionary: { label: 'Visionary', color: 'bg-purple-500' },
  };

  const pillarGradient = pillarColors[pillar] || 'from-gray-500 to-gray-600';
  const tierInfo = tierBadges[tier] || tierBadges.explorer;

  // Calculate progress if userProgress is provided
  const progressPercentage = userProgress
    ? Math.min(100, Math.round((userProgress.completed_quests / required_quest_count) * 100))
    : 0;

  const isCompleted = userProgress?.is_earned || false;

  return (
    <Link to={`/badges/${id}`}>
      <motion.div
        whileHover={{ scale: 1.05, y: -5 }}
        whileTap={{ scale: 0.98 }}
        className={`relative bg-white dark:bg-gray-800 rounded-lg shadow-lg overflow-hidden cursor-pointer transition-all duration-300 ${
          isCompleted ? 'ring-2 ring-green-500' : ''
        }`}
      >
        {/* Tier Badge */}
        <div className="absolute top-2 right-2 z-10">
          <span className={`${tierInfo.color} text-white text-xs font-bold px-2 py-1 rounded`}>
            {tierInfo.label}
          </span>
        </div>

        {/* Icon Section with Pillar Gradient */}
        <div className={`bg-gradient-to-r ${pillarGradient} p-6 flex items-center justify-center`}>
          <div className="text-6xl filter drop-shadow-lg">
            {icon || '🎯'}
          </div>
        </div>

        {/* Content Section */}
        <div className="p-4">
          <div className="flex items-start justify-between mb-2">
            <h3 className="text-lg font-bold text-gray-900 dark:text-white line-clamp-2">
              {name}
            </h3>
          </div>

          <p className="text-sm text-gray-600 dark:text-gray-300 mb-3 line-clamp-2">
            {description}
          </p>

          {/* Pillar Tag */}
          <div className="mb-3">
            <span className="inline-block bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 text-xs font-medium px-2 py-1 rounded">
              {pillar}
            </span>
          </div>

          {/* Quest Requirement */}
          <div className="text-sm text-gray-600 dark:text-gray-400 mb-3">
            Complete {required_quest_count} {required_quest_count === 1 ? 'quest' : 'quests'}
          </div>

          {/* Progress Bar (if showProgress) */}
          {showProgress && userProgress && (
            <div className="mt-3">
              <div className="flex justify-between items-center mb-1">
                <span className="text-xs font-medium text-gray-700 dark:text-gray-300">
                  Progress
                </span>
                <span className="text-xs font-medium text-gray-700 dark:text-gray-300">
                  {userProgress.completed_quests}/{required_quest_count}
                </span>
              </div>
              <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                <div
                  className={`bg-gradient-to-r ${pillarGradient} h-2 rounded-full transition-all duration-500`}
                  style={{ width: `${progressPercentage}%` }}
                ></div>
              </div>
            </div>
          )}

          {/* Completion Badge */}
          {isCompleted && (
            <div className="mt-3 flex items-center justify-center">
              <div className="bg-green-500 text-white text-xs font-bold px-3 py-1 rounded-full flex items-center gap-1">
                <span>✓</span>
                <span>EARNED</span>
              </div>
            </div>
          )}
        </div>
      </motion.div>
    </Link>
  );
};

export default BadgeCard;
