import { useState, useEffect, useCallback } from 'react';
import api from '../../services/api';
import logger from '../../utils/logger';
import { buildQuestOrbs } from '../../utils/pillarHelpers';

/**
 * Unified hook to fetch consolidated student overview data.
 * Used by both advisor and parent/observer views.
 *
 * @param {string} studentId - The student ID to fetch data for
 * @param {string} endpoint - API endpoint path (e.g. '/api/advisor/student-overview' or '/api/parent/child-overview')
 * @returns {Object} { data, isLoading, error, refetch }
 */
export function useStudentOverviewData(studentId, endpoint) {
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
      const response = await api.get(`${endpoint}/${studentId}`);
      const apiData = response.data;

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
  }, [studentId, endpoint]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return { data, isLoading, error, refetch: fetchData };
}

export default useStudentOverviewData;
