import { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate, useLocation, useSearchParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useQuestDetail, useEnrollQuest, useCompleteTask, useEndQuest } from './api/useQuests';
import { normalizePillarKey } from '../utils/pillarMappings';
import { queryKeys } from '../utils/queryKeys';
import toast from 'react-hot-toast';
import logger from '../utils/logger';

/**
 * Custom hook for QuestDetail page data fetching and state management
 * Centralizes all quest-related data logic
 */
export const useQuestDetailData = (questId) => {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const queryClient = useQueryClient();

  // React Query hooks for data fetching
  const {
    data: quest,
    isLoading,
    error,
    refetch: refetchQuest
  } = useQuestDetail(questId, {
    enabled: !!questId,
    staleTime: 30000,
    cacheTime: 300000,
  });

  // React Query mutations
  const enrollMutation = useEnrollQuest();
  const completeTaskMutation = useCompleteTask();
  const endQuestMutation = useEndQuest();

  // Loading states
  const isEnrolling = enrollMutation.isPending;
  const isRefreshing = completeTaskMutation.isPending;

  // Local state
  const [selectedTask, setSelectedTask] = useState(null);
  const [showPersonalizationWizard, setShowPersonalizationWizard] = useState(false);
  const [showQuestCompletionCelebration, setShowQuestCompletionCelebration] = useState(false);
  const [displayMode, setDisplayMode] = useState('flexible');
  const [showRestartModal, setShowRestartModal] = useState(false);
  const [restartModalData, setRestartModalData] = useState({ previousTaskCount: 0, questTitle: '' });

  // Handle showPersonalize query param (from course lesson "Create Your Own" link)
  const showPersonalizeFromUrl = searchParams.get('showPersonalize');
  const hasProcessedPersonalizeRef = useRef(false);

  useEffect(() => {
    if (showPersonalizeFromUrl === 'true' && !hasProcessedPersonalizeRef.current) {
      hasProcessedPersonalizeRef.current = true;
      setShowPersonalizationWizard(true);
      // Clean up the URL param after processing
      navigate(location.pathname, { replace: true });
    }
  }, [showPersonalizeFromUrl, navigate, location.pathname]);

  // Memoized XP calculations
  const xpData = useMemo(() => {
    if (!quest?.quest_tasks) return { baseXP: 0, totalXP: 0, earnedXP: 0 };

    const tasks = quest.quest_tasks;
    const baseXP = tasks.reduce((sum, task) => sum + (task.xp_amount || 0), 0);
    const earnedXP = tasks
      .filter(task => task.is_completed)
      .reduce((sum, task) => sum + (task.xp_amount || 0), 0);

    return { baseXP, totalXP: baseXP, earnedXP };
  }, [quest?.quest_tasks]);

  // Memoized pillar breakdown
  const pillarBreakdown = useMemo(() => {
    if (!quest?.quest_tasks) return {};

    const breakdown = {};
    quest.quest_tasks.forEach(task => {
      const normalizedPillar = normalizePillarKey(task.pillar || 'wellness');
      if (!breakdown[normalizedPillar]) {
        breakdown[normalizedPillar] = 0;
      }
      breakdown[normalizedPillar] += task.xp_amount || 0;
    });

    return breakdown;
  }, [quest?.quest_tasks]);

  // Memoized completed tasks count
  const completedTasks = useMemo(() => {
    return quest?.quest_tasks?.filter(task => task.is_completed).length || 0;
  }, [quest?.quest_tasks]);

  // Handle navigation from task library
  useEffect(() => {
    if (location.state?.tasksAdded) {
      logger.debug('[QUEST_DETAIL] Returning from task library, refetching quest data');

      queryClient.setQueryData(queryKeys.quests.detail(questId), (oldData) => {
        if (!oldData) return oldData;
        return {
          ...oldData,
          user_enrollment: oldData.user_enrollment ? {
            ...oldData.user_enrollment,
            is_active: true
          } : null,
          completed_enrollment: false
        };
      });

      queryClient.invalidateQueries(queryKeys.quests.detail(questId));
      refetchQuest();
      navigate(location.pathname, { replace: true, state: {} });

      if (location.state?.addedCount > 0) {
        toast.success(`${location.state.addedCount} task${location.state.addedCount > 1 ? 's' : ''} added successfully!`);
      }
    }
  }, [location.state, questId, queryClient, refetchQuest, navigate, location.pathname]);

  // Select task - either from URL param or auto-select first task
  const taskIdFromUrl = searchParams.get('task');
  const lastProcessedTaskIdRef = useRef(null);

  useEffect(() => {
    if (!quest?.quest_tasks?.length || !quest.user_enrollment) return;

    // If URL has a task ID, select that task (only if it's a new/different task ID)
    if (taskIdFromUrl && lastProcessedTaskIdRef.current !== taskIdFromUrl) {
      // Try direct match first
      let task = quest.quest_tasks.find(t => t.id === taskIdFromUrl);

      // If not found, try source_task_id match (for course-copied tasks)
      if (!task) {
        task = quest.quest_tasks.find(t => t.source_task_id === taskIdFromUrl);
      }

      // If still not found, try title match via template task lookup
      // This handles the case where URL has template task ID but user has their own copy
      if (!task && taskIdFromUrl) {
        // Store the template task ID to title mapping for later use
        const templateTaskTitle = sessionStorage.getItem(`task_title_${taskIdFromUrl}`);
        if (templateTaskTitle) {
          task = quest.quest_tasks.find(t => t.title === templateTaskTitle);
        }
      }

      if (task) {
        lastProcessedTaskIdRef.current = taskIdFromUrl;
        setSelectedTask(task);
        return;
      }
    }

    // Otherwise, auto-select first incomplete task (or first task) if none selected and no URL param
    if (!selectedTask && !taskIdFromUrl) {
      const firstIncomplete = quest.quest_tasks.find(t => !t.is_completed);
      const taskToSelect = firstIncomplete || quest.quest_tasks[0];
      setSelectedTask(taskToSelect);
    }
  }, [quest?.quest_tasks, quest?.user_enrollment, selectedTask, taskIdFromUrl]);

  // Progress calculations
  const totalTasks = quest?.quest_tasks?.length || 0;
  const progressPercentage = quest?.progress?.percentage || (totalTasks > 0 ? (completedTasks / totalTasks) * 100 : 0);
  const isQuestCompleted = quest?.completed_enrollment || (quest?.progress && quest.progress.percentage === 100);

  return {
    // Quest data
    quest,
    isLoading,
    error,
    refetchQuest,

    // Mutations
    enrollMutation,
    completeTaskMutation,
    endQuestMutation,

    // Loading states
    isEnrolling,
    isRefreshing,

    // Local state
    selectedTask,
    setSelectedTask,
    showPersonalizationWizard,
    setShowPersonalizationWizard,
    showQuestCompletionCelebration,
    setShowQuestCompletionCelebration,
    displayMode,
    setDisplayMode,
    showRestartModal,
    setShowRestartModal,
    restartModalData,
    setRestartModalData,

    // Computed values
    xpData,
    pillarBreakdown,
    completedTasks,
    totalTasks,
    progressPercentage,
    isQuestCompleted,

    // Query client
    queryClient
  };
};
