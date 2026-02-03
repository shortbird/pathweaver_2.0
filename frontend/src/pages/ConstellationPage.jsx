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
  const [questOrbs, setQuestOrbs] = useState([]);
  const [badgeOrbs, setBadgeOrbs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // NEW pillar system (January 2025) - simplified single-word keys
  const PILLAR_DISPLAY_NAMES = {
    'stem': 'STEM',
    'wellness': 'Wellness',
    'communication': 'Communication',
    'civics': 'Civics',
    'art': 'Art'
  };

  // Map pillar keys (from API) - new system uses lowercase single-word keys
  const mapPillarNameToId = (pillarName) => {
    // If already in new format (stem, wellness, etc.), return as-is
    if (['stem', 'wellness', 'communication', 'civics', 'art'].includes(pillarName)) {
      return pillarName;
    }

    // Legacy fallback for any old data
    const legacyMapping = {
      'stem_logic': 'stem',
      'language_communication': 'communication',
      'arts_creativity': 'art',
      'life_wellness': 'wellness',
      'society_culture': 'civics',
      'thinking_skills': 'stem',
      'creativity': 'art',
      'practical_skills': 'wellness',
      'general': 'stem'
    };

    return legacyMapping[pillarName] || 'stem'; // Default to stem if unknown
  };

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

      // Define pillars in specific order for pentagon formation (NEW simplified system)
      const pillarDefinitions = [
        {
          id: 'stem',
          name: 'STEM',
          description: 'Science, technology, engineering, and mathematics',
        },
        {
          id: 'communication',
          name: 'Communication',
          description: 'Writing, speaking, storytelling, and presentation',
        },
        {
          id: 'art',
          name: 'Art',
          description: 'Visual arts, music, design, and creative expression',
        },
        {
          id: 'wellness',
          name: 'Wellness',
          description: 'Health, fitness, mindfulness, and personal growth',
        },
        {
          id: 'civics',
          name: 'Civics',
          description: 'Citizenship, community, social impact, and leadership',
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

      // Fetch user's completed quests (most recent 100 - sufficient for visualization)
      try {
        const questsResponse = await api.get('/api/users/completed-quests?page=1&per_page=100');
        const userQuests = questsResponse.data.quests || [];

        // Also get in-progress quests from dashboard data
        const dashboardQuests = data.active_quests || [];

        // Process quests to calculate XP distributions
        const processedQuests = [];

        // Process completed quests
        userQuests.forEach((questData) => {
          // API returns quest data directly (not enrollment wrapper)
          const quest = questData;
          if (!quest || !quest.id) return;

          // Calculate XP distribution from xp_earned breakdown
          const xpDistribution = {};
          let totalXP = 0;

          if (quest.xp_earned && quest.xp_earned.breakdown) {
            // Use the breakdown from the API and map pillar names to IDs
            Object.entries(quest.xp_earned.breakdown).forEach(([pillarName, xp]) => {
              const pillarId = mapPillarNameToId(pillarName);
              xpDistribution[pillarId] = (xpDistribution[pillarId] || 0) + xp;
              totalXP += xp;
            });
          }

          // Also try the total if breakdown is empty but total exists
          if (totalXP === 0 && quest.xp_earned && quest.xp_earned.total) {
            totalXP = quest.xp_earned.total;
            // If we have a total but no breakdown, assign to a default pillar
            // This is a fallback to ensure quests still appear
            if (Object.keys(xpDistribution).length === 0) {
              xpDistribution['stem'] = totalXP;
            }
          }

          // Always add completed quests, even if XP is 0 (they still completed it!)
          processedQuests.push({
            id: quest.id,
            title: quest.title,
            totalXP: totalXP || 50, // Use 50 as default if no XP calculated
            xpDistribution: Object.keys(xpDistribution).length > 0 ? xpDistribution : { 'stem': 50 },
            status: 'completed',
            completedAt: quest.completed_at
          });
        });

        // Process in-progress quests from dashboard
        dashboardQuests.forEach((enrollment) => {
          const quest = enrollment.quests;
          if (!quest) return;

          // Calculate XP distribution from quest tasks
          const xpDistribution = {};
          let totalXP = 0;

          // Use quest_tasks if available (enriched by dashboard endpoint)
          (quest.quest_tasks || []).forEach((task) => {
            const pillarName = task.pillar;
            const xp = task.xp_value || task.xp_amount || 0;

            if (pillarName && xp > 0) {
              const pillarId = mapPillarNameToId(pillarName);
              xpDistribution[pillarId] = (xpDistribution[pillarId] || 0) + xp;
              totalXP += xp;
            }
          });

          // Fallback to pillar_breakdown if quest_tasks not available
          if (totalXP === 0 && quest.pillar_breakdown) {
            Object.entries(quest.pillar_breakdown).forEach(([pillarName, xp]) => {
              const pillarId = mapPillarNameToId(pillarName);
              xpDistribution[pillarId] = (xpDistribution[pillarId] || 0) + xp;
              totalXP += xp;
            });
          }

          if (totalXP > 0 && !processedQuests.find(q => q.id === quest.id)) {
            processedQuests.push({
              id: quest.id,
              title: quest.title,
              totalXP,
              xpDistribution,
              status: 'in_progress',
              startedAt: enrollment.started_at
            });
          }
        });

        setQuestOrbs(processedQuests);
      } catch (questError) {
        console.error('Error fetching quests:', questError);
        // Don't fail the whole page if quests fail
      }

      // Fetch user's earned badges
      try {
        const badgesResponse = await api.get('/api/badges/my-badges?status=completed');
        const earnedBadges = badgesResponse.data.completed_badges || [];

        // Process badges for constellation display
        const processedBadges = earnedBadges.map(userBadge => {
          const badge = userBadge.badges || {};
          return {
            id: badge.id,
            name: badge.name,
            description: badge.description,
            pillar: badge.pillar || badge.pillar_primary,
            earnedAt: userBadge.earned_at,
            icon_url: badge.icon_url || badge.image_url
          };
        });

        setBadgeOrbs(processedBadges);
      } catch (badgeError) {
        console.error('Error fetching badges:', badgeError);
        // Don't fail the whole page if badges fail
      }
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
                <div className="w-4 h-4 rounded-full bg-gradient-primary" />
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
          <div className="flex gap-4 justify-center flex-wrap">
            <button
              onClick={handleRetry}
              className="px-8 py-3 bg-gradient-primary
                         text-white font-medium rounded-lg
                         hover:shadow-xl transition-all transform hover:scale-105 min-h-[44px]"
            >
              Try Again
            </button>
            <button
              onClick={handleExit}
              className="px-8 py-3 bg-white/10 text-white font-medium rounded-lg
                         hover:bg-white/20 transition-all min-h-[44px]"
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
          <div className="flex gap-4 justify-center flex-wrap">
            <button
              onClick={() => navigate('/quests')}
              className="px-10 py-4 bg-gradient-primary
                         text-white font-semibold text-lg rounded-lg
                         hover:shadow-2xl transition-all transform hover:scale-105 min-h-[44px]"
            >
              Begin Your Journey
            </button>
            <button
              onClick={handleExit}
              className="px-8 py-4 bg-white/10 text-white font-medium text-lg rounded-lg
                         hover:bg-white/20 transition-all min-h-[44px]"
            >
              Back to Dashboard
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Main Constellation View
  return <ConstellationView pillarsData={pillarsData} questOrbs={questOrbs} badgeOrbs={badgeOrbs} onExit={handleExit} />;
};

export default ConstellationPage;
