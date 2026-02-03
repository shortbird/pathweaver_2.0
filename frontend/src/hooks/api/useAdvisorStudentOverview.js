import { useState, useEffect, useCallback } from 'react';
import api from '../../services/api';
import logger from '../../utils/logger';

/**
 * Hook to fetch consolidated student overview data for advisor view.
 * Returns data formatted for StudentOverviewPage components.
 * Mirrors useParentChildOverview pattern.
 *
 * @param {string} studentId - The student ID to fetch data for
 * @returns {Object} { data, isLoading, error, refetch }
 */
export function useAdvisorStudentOverview(studentId) {
  const [data, setData] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchData = useCallback(async () => {
    if (!studentId) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const response = await api.get(`/api/advisor/student-overview/${studentId}`);
      const apiData = response.data;

      // Transform API response to match StudentOverviewPage component format
      const transformed = {
        // For HeroSection
        user: {
          id: apiData.student.id,
          first_name: apiData.student.first_name,
          last_name: apiData.student.last_name,
          avatar_url: apiData.student.avatar_url,
          created_at: apiData.student.created_at
        },
        memberSince: apiData.student.created_at,

        // For dashboard stats
        totalXp: apiData.dashboard.total_xp,
        xpByPillar: apiData.dashboard.xp_by_pillar,
        completedQuestsCount: apiData.completed_quests?.length || 0,
        completedTasksCount: apiData.dashboard.completed_tasks_count,

        // For LearningSnapshot
        engagementData: {
          calendar: apiData.engagement.calendar || [],
          rhythm: apiData.engagement.rhythm,
          summary: apiData.engagement.summary
        },
        activeQuests: apiData.dashboard.active_quests || [],
        recentCompletions: apiData.dashboard.recent_completions || [],

        // For SkillsGrowth
        subjectXp: apiData.subject_xp || {},
        pendingSubjectXp: apiData.pending_subject_xp || {},

        // For ConstellationPreview
        pillarsData: apiData.pillars_data || [],
        questOrbs: buildQuestOrbs(apiData.completed_quests || []),

        // For PortfolioSection
        achievements: apiData.portfolio_achievements || apiData.completed_quests || [],
        visibilityStatus: apiData.visibility_status,

        // Raw data for additional needs
        completedQuests: apiData.completed_quests || []
      };

      setData(transformed);
    } catch (err) {
      logger.error('Error fetching student overview:', err);
      setError(err.response?.data?.error || 'Failed to load student overview');
    } finally {
      setIsLoading(false);
    }
  }, [studentId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return { data, isLoading, error, refetch: fetchData };
}

/**
 * Build quest orbs for constellation from completed quests.
 * Matches the format expected by ConstellationPreview.
 */
function buildQuestOrbs(completedQuests) {
  return completedQuests.map((achievement) => {
    const xpDistribution = {};
    let questTotalXp = 0;

    // Build XP distribution from task_evidence
    if (achievement.task_evidence) {
      Object.values(achievement.task_evidence).forEach((taskInfo) => {
        const pillarName = taskInfo.pillar;
        const xp = taskInfo.xp_awarded || 0;
        if (pillarName && xp > 0) {
          const pillarId = mapPillarNameToId(pillarName);
          xpDistribution[pillarId] = (xpDistribution[pillarId] || 0) + xp;
          questTotalXp += xp;
        }
      });
    }

    // Fallback to total_xp_earned if no distribution was built
    if (questTotalXp === 0 && achievement.total_xp_earned) {
      questTotalXp = achievement.total_xp_earned;
      if (Object.keys(xpDistribution).length === 0) {
        xpDistribution['stem'] = questTotalXp;
      }
    }

    const quest = achievement.quest || {};
    return {
      id: quest.id || achievement.id,
      title: quest.title || achievement.title || 'Untitled Quest',
      totalXP: questTotalXp || 50,
      xpDistribution: Object.keys(xpDistribution).length > 0 ? xpDistribution : { stem: 50 },
      status: achievement.status || 'completed',
      completedAt: achievement.completed_at
    };
  });
}

/**
 * Map pillar display name to ID.
 */
function mapPillarNameToId(pillarName) {
  if (!pillarName) return 'stem';

  const lowerName = pillarName.toLowerCase();

  if (['stem', 'wellness', 'communication', 'civics', 'art'].includes(lowerName)) {
    return lowerName;
  }

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

  return legacyMapping[lowerName] || 'stem';
}

export default useAdvisorStudentOverview;
