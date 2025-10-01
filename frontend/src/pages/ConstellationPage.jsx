import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import ConstellationView from '../components/constellation/ConstellationView';
import api from '../services/api';
import toast from 'react-hot-toast';
import { motion } from 'framer-motion';

const ConstellationPage = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [pillarsData, setPillarsData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (user?.id) {
      fetchConstellationData();
    }
  }, [user]);

  const fetchConstellationData = async () => {
    try {
      setLoading(true);
      setError(null);

      // Fetch dashboard data which includes pillar XP breakdown
      const response = await api.get('/api/users/dashboard');
      const data = response.data;

      // Extract pillar XP from xp_by_category
      const xpByCategory = data.xp_by_category || {};
      const recentCompletions = data.recent_completions || [];

      // Define pillars in specific order for pentagon formation
      const pillarDefinitions = [
        {
          id: 'stem_logic',
          name: 'STEM & Logic',
          description: 'Problem-solving, coding, robotics, and data analysis',
        },
        {
          id: 'language_communication',
          name: 'Language & Communication',
          description: 'Writing, storytelling, debate, and journalism',
        },
        {
          id: 'arts_creativity',
          name: 'Arts & Creativity',
          description: 'Visual arts, music, design, and creative innovation',
        },
        {
          id: 'life_wellness',
          name: 'Life & Wellness',
          description: 'Health, fitness, nutrition, and mental wellness',
        },
        {
          id: 'society_culture',
          name: 'Society & Culture',
          description: 'History, social research, and civic engagement',
        },
      ];

      // Check if pillar was active in last 7 days
      const isRecentlyActive = (pillarId) => {
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

        return recentCompletions.some((completion) => {
          try {
            const completionDate = new Date(completion.completed_at);
            const completionPillar = completion.pillar || '';
            return (
              completionDate >= sevenDaysAgo &&
              completionPillar === pillarId
            );
          } catch {
            return false;
          }
        });
      };

      // Count quests completed for each pillar
      const countQuestsForPillar = (pillarId) => {
        return recentCompletions.filter(
          (completion) => completion.pillar === pillarId
        ).length;
      };

      // Map pillar data
      const pillars = pillarDefinitions.map((def) => ({
        ...def,
        xp: xpByCategory[def.id] || 0,
        isActive: isRecentlyActive(def.id),
        questCount: countQuestsForPillar(def.id),
      }));

      setPillarsData(pillars);
    } catch (error) {
      console.error('Error fetching constellation data:', error);
      setError('Failed to load constellation data');
      toast.error('Failed to load constellation data');
    } finally {
      setLoading(false);
    }
  };

  const handleExit = () => {
    navigate('/dashboard');
  };

  const handleRetry = () => {
    fetchConstellationData();
  };

  // Loading State
  if (loading) {
    return (
      <div className="fixed inset-0 z-[9999] bg-gradient-to-br from-gray-900 to-black
                      flex items-center justify-center">
        <div className="text-center">
          {/* Animated loading stars */}
          <div className="relative w-32 h-32 mx-auto mb-8">
            {[0, 1, 2, 3, 4].map((i) => (
              <motion.div
                key={i}
                className="absolute inset-0 flex items-center justify-center"
                animate={{
                  scale: [1, 1.3, 1],
                  opacity: [0.3, 1, 0.3],
                  rotate: [0, 72 * i, 72 * i],
                }}
                transition={{
                  duration: 2,
                  repeat: Infinity,
                  delay: i * 0.2,
                  ease: 'easeInOut',
                }}
              >
                <div className="w-4 h-4 rounded-full bg-gradient-to-r from-[#ef597b] to-[#6d469b]" />
              </motion.div>
            ))}
          </div>
          <p className="text-white text-lg font-medium">
            Mapping your learning universe...
          </p>
        </div>
      </div>
    );
  }

  // Error State
  if (error) {
    return (
      <div className="fixed inset-0 z-[9999] bg-gradient-to-br from-gray-900 to-black
                      flex items-center justify-center">
        <div className="text-center max-w-md px-6">
          <div className="text-6xl mb-6">⭐</div>
          <h2 className="text-3xl font-bold text-white mb-3">
            Couldn't load your constellation
          </h2>
          <p className="text-gray-400 mb-8 text-lg">
            We're having trouble connecting to the stars
          </p>
          <div className="flex gap-4 justify-center">
            <button
              onClick={handleRetry}
              className="px-8 py-3 bg-gradient-to-r from-[#ef597b] to-[#6d469b]
                         text-white font-medium rounded-lg
                         hover:shadow-xl transition-all transform hover:scale-105"
            >
              Try Again
            </button>
            <button
              onClick={handleExit}
              className="px-8 py-3 bg-white/10 text-white font-medium rounded-lg
                         hover:bg-white/20 transition-all"
            >
              Exit
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Empty State (No XP yet)
  const totalXP = pillarsData.reduce((sum, pillar) => sum + pillar.xp, 0);
  if (totalXP === 0) {
    return (
      <div className="fixed inset-0 z-[9999] bg-gradient-to-br from-gray-900 to-black
                      flex items-center justify-center">
        <div className="text-center max-w-2xl px-6">
          <motion.div
            initial={{ scale: 0, rotate: -180 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={{ duration: 0.8, ease: [0.34, 1.56, 0.64, 1] }}
            className="text-8xl mb-8"
          >
            ✨
          </motion.div>
          <h2 className="text-4xl font-bold text-white mb-4">
            Your constellation awaits
          </h2>
          <p className="text-gray-300 text-xl mb-8 leading-relaxed">
            Start exploring quests to light up your first stars and watch your
            unique learning constellation take shape across the universe
          </p>
          <button
            onClick={() => navigate('/quests')}
            className="px-10 py-4 bg-gradient-to-r from-[#ef597b] to-[#6d469b]
                       text-white font-semibold text-lg rounded-lg
                       hover:shadow-2xl transition-all transform hover:scale-105"
          >
            Begin Your Journey
          </button>
          <button
            onClick={handleExit}
            className="ml-4 px-8 py-4 bg-white/10 text-white font-medium text-lg rounded-lg
                       hover:bg-white/20 transition-all"
          >
            Back to Dashboard
          </button>
        </div>
      </div>
    );
  }

  // Main Constellation View
  return <ConstellationView pillarsData={pillarsData} onExit={handleExit} />;
};

export default ConstellationPage;
