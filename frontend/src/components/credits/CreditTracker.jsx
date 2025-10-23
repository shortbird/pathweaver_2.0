import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import api from '../../services/api';

const CreditTracker = ({ userId }) => {
  const [credits, setCredits] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchCredits = async () => {
      try {
        setLoading(true);
        const response = await api.get(`/api/credits/${userId}`);
        setCredits(response.data);
      } catch (err) {
        console.error('Error fetching credits:', err);
        setError('Failed to load credit information');
      } finally {
        setLoading(false);
      }
    };

    if (userId) {
      fetchCredits();
    }
  }, [userId]);

  if (loading) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6">
        <div className="animate-pulse">
          <div className="h-8 bg-gray-200 dark:bg-gray-700 rounded w-1/3 mb-4"></div>
          <div className="space-y-3">
            <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded"></div>
            <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-5/6"></div>
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

  const { total_credits, credits_by_pillar, recent_credits } = credits || {};

  const pillarColors = {
    'STEM & Logic': 'from-blue-500 to-indigo-600',
    'Life & Wellness': 'from-green-500 to-emerald-600',
    'Language & Communication': 'from-amber-500 to-orange-600',
    'Society & Culture': 'from-purple-500 to-violet-600',
    'Arts & Creativity': 'from-pink-500 to-rose-600',
  };

  const pillarIcons = {
    'STEM & Logic': '🔬',
    'Life & Wellness': '🌱',
    'Language & Communication': '💬',
    'Society & Culture': '🌍',
    'Arts & Creativity': '🎨',
  };

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6">
      <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">Academic Credits</h2>

      {/* Total Credits */}
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="bg-gradient-primary text-white rounded-lg p-6 mb-6 text-center"
      >
        <div className="text-5xl font-bold mb-2">{total_credits || 0}</div>
        <div className="text-lg">Total Credits Earned</div>
      </motion.div>

      {/* Credits by Pillar */}
      <div className="mb-6">
        <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4">Credits by Pillar</h3>
        <div className="space-y-3">
          {credits_by_pillar &&
            Object.entries(credits_by_pillar).map(([pillar, creditCount], index) => {
              const maxCredits = Math.max(...Object.values(credits_by_pillar));
              const percentage = maxCredits > 0 ? (creditCount / maxCredits) * 100 : 0;

              return (
                <motion.div
                  key={pillar}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: index * 0.1 }}
                  className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4"
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className="text-2xl">{pillarIcons[pillar]}</span>
                      <span className="font-medium text-gray-900 dark:text-white">{pillar}</span>
                    </div>
                    <span className="text-lg font-bold text-gray-900 dark:text-white">
                      {creditCount} credits
                    </span>
                  </div>
                  <div className="w-full bg-gray-200 dark:bg-gray-600 rounded-full h-2">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${percentage}%` }}
                      transition={{ duration: 0.8, delay: 0.2 }}
                      className={`bg-gradient-to-r ${pillarColors[pillar]} h-2 rounded-full`}
                    ></motion.div>
                  </div>
                </motion.div>
              );
            })}
        </div>
      </div>

      {/* Recent Credits */}
      {recent_credits && recent_credits.length > 0 && (
        <div>
          <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4">Recent Credits</h3>
          <div className="space-y-2">
            {recent_credits.slice(0, 5).map((credit, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.05 }}
                className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700 rounded-lg"
              >
                <div className="flex items-center gap-3">
                  <span className="text-xl">{pillarIcons[credit.pillar]}</span>
                  <div>
                    <div className="font-medium text-gray-900 dark:text-white">{credit.source}</div>
                    <div className="text-xs text-gray-600 dark:text-gray-400">{credit.pillar}</div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-bold text-gray-900 dark:text-white">
                    +{credit.credit_value}
                  </span>
                  <span className="text-xs text-gray-500 dark:text-gray-400">credits</span>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      )}

      {/* Info Box */}
      <div className="mt-6 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
        <div className="text-sm text-gray-700 dark:text-gray-300">
          <p className="font-medium mb-2">How Credits Work:</p>
          <ul className="list-disc list-inside space-y-1 text-xs">
            <li>Earn credits by completing quests and earning badges</li>
            <li>Each quest awards credits based on its difficulty and pillar</li>
            <li>Credits contribute to your academic transcript</li>
            <li>Showcase your credits on your diploma to demonstrate expertise</li>
          </ul>
        </div>
      </div>
    </div>
  );
};

export default CreditTracker;
