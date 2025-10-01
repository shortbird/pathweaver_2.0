import React from 'react';
import { motion } from 'framer-motion';

const BadgeProgress = ({ userBadges, allBadges }) => {
  // Calculate statistics
  const earnedBadges = userBadges?.filter((b) => b.is_earned) || [];
  const inProgressBadges = userBadges?.filter((b) => !b.is_earned && b.completed_quests > 0) || [];
  const totalBadges = allBadges?.length || 0;
  const earnedCount = earnedBadges.length;
  const inProgressCount = inProgressBadges.length;

  // Calculate progress by pillar
  const pillarProgress = {};
  const pillars = [
    'STEM & Logic',
    'Life & Wellness',
    'Language & Communication',
    'Society & Culture',
    'Arts & Creativity',
  ];

  pillars.forEach((pillar) => {
    const pillarBadges = allBadges?.filter((b) => b.pillar === pillar) || [];
    const earnedInPillar = earnedBadges.filter((b) => b.pillar === pillar).length;
    pillarProgress[pillar] = {
      earned: earnedInPillar,
      total: pillarBadges.length,
      percentage: pillarBadges.length > 0 ? Math.round((earnedInPillar / pillarBadges.length) * 100) : 0,
    };
  });

  const pillarColors = {
    'STEM & Logic': 'from-blue-500 to-indigo-600',
    'Life & Wellness': 'from-green-500 to-emerald-600',
    'Language & Communication': 'from-amber-500 to-orange-600',
    'Society & Culture': 'from-purple-500 to-violet-600',
    'Arts & Creativity': 'from-pink-500 to-rose-600',
  };

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6">
      <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">Badge Progress</h2>

      {/* Overall Progress */}
      <div className="mb-8">
        <div className="flex justify-between items-center mb-2">
          <span className="text-lg font-medium text-gray-700 dark:text-gray-300">
            Overall Progress
          </span>
          <span className="text-lg font-bold text-gray-900 dark:text-white">
            {earnedCount}/{totalBadges}
          </span>
        </div>
        <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-4">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${totalBadges > 0 ? (earnedCount / totalBadges) * 100 : 0}%` }}
            transition={{ duration: 1, ease: 'easeOut' }}
            className="bg-gradient-to-r from-[#ef597b] to-[#6d469b] h-4 rounded-full"
          ></motion.div>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        <motion.div
          whileHover={{ scale: 1.05 }}
          className="bg-green-50 dark:bg-green-900/20 rounded-lg p-4 text-center"
        >
          <div className="text-3xl font-bold text-green-600 dark:text-green-400">{earnedCount}</div>
          <div className="text-sm text-gray-600 dark:text-gray-400">Earned</div>
        </motion.div>

        <motion.div
          whileHover={{ scale: 1.05 }}
          className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4 text-center"
        >
          <div className="text-3xl font-bold text-blue-600 dark:text-blue-400">{inProgressCount}</div>
          <div className="text-sm text-gray-600 dark:text-gray-400">In Progress</div>
        </motion.div>

        <motion.div
          whileHover={{ scale: 1.05 }}
          className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4 text-center"
        >
          <div className="text-3xl font-bold text-gray-600 dark:text-gray-400">
            {totalBadges - earnedCount - inProgressCount}
          </div>
          <div className="text-sm text-gray-600 dark:text-gray-400">Not Started</div>
        </motion.div>
      </div>

      {/* Pillar Progress */}
      <div>
        <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4">Progress by Pillar</h3>
        <div className="space-y-4">
          {pillars.map((pillar) => {
            const progress = pillarProgress[pillar];
            return (
              <div key={pillar}>
                <div className="flex justify-between items-center mb-2">
                  <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    {pillar}
                  </span>
                  <span className="text-sm font-medium text-gray-600 dark:text-gray-400">
                    {progress.earned}/{progress.total}
                  </span>
                </div>
                <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${progress.percentage}%` }}
                    transition={{ duration: 0.8, delay: 0.2, ease: 'easeOut' }}
                    className={`bg-gradient-to-r ${pillarColors[pillar]} h-2 rounded-full`}
                  ></motion.div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Recent Achievements */}
      {earnedBadges.length > 0 && (
        <div className="mt-8">
          <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4">Recent Achievements</h3>
          <div className="space-y-2">
            {earnedBadges.slice(0, 5).map((badge) => (
              <motion.div
                key={badge.id}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-gray-700 rounded-lg"
              >
                <div className="text-2xl">{badge.icon || '🎯'}</div>
                <div className="flex-1">
                  <div className="font-medium text-gray-900 dark:text-white">{badge.name}</div>
                  <div className="text-xs text-gray-600 dark:text-gray-400">
                    {badge.earned_at ? new Date(badge.earned_at).toLocaleDateString() : 'Recently earned'}
                  </div>
                </div>
                <div className="text-green-500 font-bold">✓</div>
              </motion.div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default BadgeProgress;
