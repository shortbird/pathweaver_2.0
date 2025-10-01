import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import api from '../../services/api';

const TranscriptView = ({ userId }) => {
  const [transcript, setTranscript] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchTranscript = async () => {
      try {
        setLoading(true);
        const response = await api.get(`/api/users/${userId}/transcript`);
        setTranscript(response.data);
      } catch (err) {
        console.error('Error fetching transcript:', err);
        setError('Failed to load transcript');
      } finally {
        setLoading(false);
      }
    };

    if (userId) {
      fetchTranscript();
    }
  }, [userId]);

  if (loading) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6">
        <div className="animate-pulse">
          <div className="h-8 bg-gray-200 dark:bg-gray-700 rounded w-1/2 mb-4"></div>
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-20 bg-gray-200 dark:bg-gray-700 rounded"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6">
        <div className="text-red-500 text-center">{error}</div>
      </div>
    );
  }

  const { user_info, completed_quests, badges_earned, total_xp, credits } = transcript || {};

  const pillarIcons = {
    'STEM & Logic': '🔬',
    'Life & Wellness': '🌱',
    'Language & Communication': '💬',
    'Society & Culture': '🌍',
    'Arts & Creativity': '🎨',
  };

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-8">
      {/* Header */}
      <div className="text-center mb-8 pb-6 border-b-2 border-gray-200 dark:border-gray-700">
        <div className="bg-gradient-to-r from-[#ef597b] to-[#6d469b] text-transparent bg-clip-text">
          <h1 className="text-4xl font-bold mb-2">Academic Transcript</h1>
        </div>
        <div className="text-xl font-semibold text-gray-900 dark:text-white mt-4">
          {user_info?.display_name || user_info?.first_name || 'Student'}
        </div>
        <div className="text-sm text-gray-600 dark:text-gray-400">
          {user_info?.email}
        </div>
        <div className="text-sm text-gray-600 dark:text-gray-400 mt-2">
          Member since {user_info?.created_at ? new Date(user_info.created_at).toLocaleDateString() : 'N/A'}
        </div>
      </div>

      {/* Summary Statistics */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-gradient-to-r from-[#ef597b] to-[#6d469b] text-white rounded-lg p-4 text-center"
        >
          <div className="text-3xl font-bold">{total_xp || 0}</div>
          <div className="text-sm">Total XP</div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="bg-blue-500 text-white rounded-lg p-4 text-center"
        >
          <div className="text-3xl font-bold">{completed_quests?.length || 0}</div>
          <div className="text-sm">Quests Completed</div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="bg-green-500 text-white rounded-lg p-4 text-center"
        >
          <div className="text-3xl font-bold">{badges_earned?.length || 0}</div>
          <div className="text-sm">Badges Earned</div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="bg-purple-500 text-white rounded-lg p-4 text-center"
        >
          <div className="text-3xl font-bold">{credits?.total_credits || 0}</div>
          <div className="text-sm">Credits Earned</div>
        </motion.div>
      </div>

      {/* Badges Earned */}
      {badges_earned && badges_earned.length > 0 && (
        <div className="mb-8">
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">Badges Earned</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {badges_earned.map((badge, index) => (
              <motion.div
                key={badge.id}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: index * 0.05 }}
                className="flex items-center gap-4 p-4 bg-gray-50 dark:bg-gray-700 rounded-lg"
              >
                <div className="text-4xl">{badge.icon || '🎯'}</div>
                <div className="flex-1">
                  <div className="font-bold text-gray-900 dark:text-white">{badge.name}</div>
                  <div className="text-sm text-gray-600 dark:text-gray-400">{badge.pillar}</div>
                  <div className="text-xs text-gray-500 dark:text-gray-500 mt-1">
                    Earned: {badge.earned_at ? new Date(badge.earned_at).toLocaleDateString() : 'Recently'}
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      )}

      {/* Completed Quests by Pillar */}
      {completed_quests && completed_quests.length > 0 && (
        <div className="mb-8">
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">Completed Quests</h2>

          {Object.entries(
            completed_quests.reduce((acc, quest) => {
              const pillar = quest.pillar || 'Other';
              if (!acc[pillar]) acc[pillar] = [];
              acc[pillar].push(quest);
              return acc;
            }, {})
          ).map(([pillar, quests]) => (
            <div key={pillar} className="mb-6">
              <div className="flex items-center gap-2 mb-3">
                <span className="text-2xl">{pillarIcons[pillar]}</span>
                <h3 className="text-lg font-bold text-gray-900 dark:text-white">{pillar}</h3>
                <span className="text-sm text-gray-600 dark:text-gray-400">
                  ({quests.length} {quests.length === 1 ? 'quest' : 'quests'})
                </span>
              </div>

              <div className="space-y-2 ml-8">
                {quests.map((quest, index) => (
                  <motion.div
                    key={quest.id}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: index * 0.02 }}
                    className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700 rounded"
                  >
                    <div className="flex-1">
                      <div className="font-medium text-gray-900 dark:text-white">{quest.title}</div>
                      <div className="text-xs text-gray-600 dark:text-gray-400">
                        Completed: {quest.completed_at ? new Date(quest.completed_at).toLocaleDateString() : 'N/A'}
                      </div>
                    </div>
                    <div className="text-sm font-bold text-gray-700 dark:text-gray-300">
                      {quest.xp_awarded || 0} XP
                    </div>
                  </motion.div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Credits by Pillar */}
      {credits?.credits_by_pillar && Object.keys(credits.credits_by_pillar).length > 0 && (
        <div className="mb-8">
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">Credits by Pillar</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {Object.entries(credits.credits_by_pillar).map(([pillar, creditCount]) => (
              <div
                key={pillar}
                className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-700 rounded-lg"
              >
                <div className="flex items-center gap-3">
                  <span className="text-2xl">{pillarIcons[pillar]}</span>
                  <span className="font-medium text-gray-900 dark:text-white">{pillar}</span>
                </div>
                <span className="text-lg font-bold text-gray-900 dark:text-white">
                  {creditCount} credits
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Footer */}
      <div className="mt-8 pt-6 border-t-2 border-gray-200 dark:border-gray-700 text-center text-sm text-gray-600 dark:text-gray-400">
        <p>This transcript represents verified learning achievements on the Optio platform.</p>
        <p className="mt-2">Generated on {new Date().toLocaleDateString()}</p>
      </div>
    </div>
  );
};

export default TranscriptView;
