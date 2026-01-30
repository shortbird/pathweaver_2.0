/**
 * useStudentOverview - Consolidated data hook for Student Overview Page
 *
 * Fetches all required data in parallel for optimal performance.
 */

import { useState, useEffect, useCallback } from 'react';
import api from '../../services/api';

// Pillar mapping for constellation data
const mapPillarNameToId = (pillarName) => {
  if (['stem', 'wellness', 'communication', 'civics', 'art'].includes(pillarName)) {
    return pillarName;
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
  return legacyMapping[pillarName] || 'stem';
};

// Pillar definitions for constellation
const PILLAR_DEFINITIONS = [
  { id: 'stem', name: 'STEM', description: 'Science, technology, engineering, and mathematics' },
  { id: 'communication', name: 'Communication', description: 'Writing, speaking, storytelling, and presentation' },
  { id: 'art', name: 'Art', description: 'Visual arts, music, design, and creative expression' },
  { id: 'wellness', name: 'Wellness', description: 'Health, fitness, mindfulness, and personal growth' },
  { id: 'civics', name: 'Civics', description: 'Citizenship, community, social impact, and leadership' }
];

export function useStudentOverview(userId) {
  const [data, setData] = useState({
    // Profile data
    user: null,
    memberSince: null,

    // Stats
    totalXp: 0,
    completedQuestsCount: 0,
    skillsCount: 0,

    // Dashboard data
    rhythm: null,
    engagementCalendar: [],
    activeQuests: [],
    recentCompletions: [],
    xpByPillar: {},

    // Portfolio data
    completedQuests: [],
    subjectXp: {},
    pendingSubjectXp: {},
    learningEvents: [],

    // Constellation data
    pillarsData: [],
    questOrbs: [],

    // Connections data
    friends: [],
    observers: [],
    parentAccess: null,

    // Visibility/Privacy
    visibilityStatus: null
  });

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchData = useCallback(async () => {
    if (!userId) return;

    setLoading(true);
    setError(null);

    try {
      // Fetch all data in parallel using Promise.allSettled for resilience
      const [
        profileResult,
        dashboardResult,
        completedQuestsResult,
        subjectXpResult,
        learningEventsResult,
        friendsResult,
        observersResult,
        visibilityResult
      ] = await Promise.allSettled([
        api.get('/api/users/profile'),
        api.get('/api/users/dashboard'),
        api.get('/api/quests/completed'),
        api.get('/api/users/subject-xp'),
        api.get('/api/learning-events'),
        api.get('/api/friends'),
        api.get('/api/observers/my-students').catch(() => ({ data: { students: [] } })),
        api.get(`/api/portfolio/user/${userId}/visibility-status`).catch(() => ({ data: { data: null } }))
      ]);

      // Process profile data
      const profileData = profileResult.status === 'fulfilled' ? profileResult.value.data : null;
      const user = profileData?.user || null;

      // Process dashboard data
      const dashboardData = dashboardResult.status === 'fulfilled' ? dashboardResult.value.data : {};
      const xpByCategory = dashboardData.xp_by_category || {};
      const recentCompletions = dashboardData.recent_completions || [];
      const activeQuests = dashboardData.active_quests || [];

      // Calculate total XP
      const totalXp = dashboardData.stats?.total_xp ||
        Object.values(xpByCategory).reduce((sum, xp) => sum + xp, 0);

      // Process completed quests
      const completedQuestsData = completedQuestsResult.status === 'fulfilled'
        ? completedQuestsResult.value.data
        : { achievements: [] };
      const completedQuests = completedQuestsData.achievements || [];

      // Process subject XP
      let subjectXpMap = {};
      let pendingSubjectXpMap = {};
      if (subjectXpResult.status === 'fulfilled' && subjectXpResult.value.data?.subject_xp) {
        subjectXpResult.value.data.subject_xp.forEach(item => {
          subjectXpMap[item.school_subject] = item.verified_xp ?? item.xp_amount;
          if (item.pending_xp) {
            pendingSubjectXpMap[item.school_subject] = item.pending_xp;
          }
        });
      }

      // Process learning events
      const learningEventsData = learningEventsResult.status === 'fulfilled'
        ? learningEventsResult.value.data
        : { events: [] };
      const learningEvents = learningEventsData.events || [];

      // Process friends
      const friendsData = friendsResult.status === 'fulfilled'
        ? friendsResult.value.data
        : { friends: [] };
      const friends = friendsData.friends || friendsData || [];

      // Process observers
      const observersData = observersResult.status === 'fulfilled'
        ? observersResult.value.data
        : { students: [] };

      // Process visibility status
      const visibilityData = visibilityResult.status === 'fulfilled'
        ? visibilityResult.value.data
        : { data: null };

      // Build constellation pillars data
      const isRecentlyActive = (pillarId) => {
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
        return recentCompletions.some((completion) => {
          try {
            const completionDate = new Date(completion.completed_at);
            return completionDate >= sevenDaysAgo && completion.pillar === pillarId;
          } catch {
            return false;
          }
        });
      };

      const pillarsData = PILLAR_DEFINITIONS.map((def) => ({
        ...def,
        xp: xpByCategory[def.id] || 0,
        isActive: isRecentlyActive(def.id),
        questCount: recentCompletions.filter(c => c.pillar === def.id).length
      }));

      // Build quest orbs for constellation
      const questOrbs = completedQuests.map((quest) => {
        const xpDistribution = {};
        let questTotalXp = 0;

        if (quest.xp_earned?.breakdown) {
          Object.entries(quest.xp_earned.breakdown).forEach(([pillarName, xp]) => {
            const pillarId = mapPillarNameToId(pillarName);
            xpDistribution[pillarId] = (xpDistribution[pillarId] || 0) + xp;
            questTotalXp += xp;
          });
        }

        if (questTotalXp === 0 && quest.xp_earned?.total) {
          questTotalXp = quest.xp_earned.total;
          if (Object.keys(xpDistribution).length === 0) {
            xpDistribution['stem'] = questTotalXp;
          }
        }

        return {
          id: quest.id,
          title: quest.title,
          totalXP: questTotalXp || 50,
          xpDistribution: Object.keys(xpDistribution).length > 0 ? xpDistribution : { stem: 50 },
          status: 'completed',
          completedAt: quest.completed_at
        };
      });

      // Add in-progress quests to orbs
      activeQuests.forEach((enrollment) => {
        const quest = enrollment.quests;
        if (!quest || questOrbs.find(q => q.id === quest.id)) return;

        const xpDistribution = {};
        let questTotalXp = 0;

        (quest.quest_tasks || []).forEach((task) => {
          const pillarName = task.pillar;
          const xp = task.xp_value || task.xp_amount || 0;
          if (pillarName && xp > 0) {
            const pillarId = mapPillarNameToId(pillarName);
            xpDistribution[pillarId] = (xpDistribution[pillarId] || 0) + xp;
            questTotalXp += xp;
          }
        });

        if (questTotalXp > 0) {
          questOrbs.push({
            id: quest.id,
            title: quest.title,
            totalXP: questTotalXp,
            xpDistribution,
            status: 'in_progress',
            startedAt: enrollment.started_at
          });
        }
      });

      setData({
        user,
        memberSince: user?.created_at,
        totalXp,
        completedQuestsCount: completedQuests.length,
        skillsCount: Object.keys(xpByCategory).filter(k => xpByCategory[k] > 0).length,
        rhythm: dashboardData.rhythm || null,
        engagementCalendar: dashboardData.engagement_calendar || [],
        activeQuests,
        recentCompletions,
        xpByPillar: xpByCategory,
        completedQuests,
        subjectXp: subjectXpMap,
        pendingSubjectXp: pendingSubjectXpMap,
        learningEvents,
        pillarsData,
        questOrbs,
        friends: Array.isArray(friends) ? friends : [],
        observers: observersData.students || [],
        parentAccess: profileData?.parent_access || null,
        visibilityStatus: visibilityData.data || null
      });

    } catch (err) {
      console.error('Error fetching student overview data:', err);
      setError('Failed to load student data');
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const refresh = useCallback(() => {
    fetchData();
  }, [fetchData]);

  return {
    ...data,
    loading,
    error,
    refresh
  };
}

export default useStudentOverview;
