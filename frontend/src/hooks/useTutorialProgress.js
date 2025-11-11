/**
 * useTutorialProgress Hook
 *
 * Manages tutorial quest progress tracking with real-time verification.
 * Automatically checks for completed tasks and triggers verification.
 */

import { useState, useEffect, useCallback } from 'react';
import api from '../services/api';

export const useTutorialProgress = () => {
  const [tutorialStatus, setTutorialStatus] = useState({
    exists: false,
    started: false,
    completed: false,
    loading: true,
    error: null
  });

  const [tasks, setTasks] = useState([]);
  const [progress, setProgress] = useState({
    completedCount: 0,
    totalCount: 0,
    percentage: 0
  });

  const [isVerifying, setIsVerifying] = useState(false);

  /**
   * Fetch tutorial status
   */
  const fetchTutorialStatus = useCallback(async () => {
    try {
      const response = await api.get('/api/tutorial/status');

      setTutorialStatus({
        exists: response.data.tutorial_exists,
        started: response.data.tutorial_started,
        completed: response.data.tutorial_completed,
        questId: response.data.tutorial_quest_id,
        title: response.data.tutorial_title,
        loading: false,
        error: null
      });

      if (response.data.tutorial_started) {
        setProgress({
          completedCount: response.data.completed_tasks_count || 0,
          totalCount: response.data.total_tasks_count || 0,
          percentage: response.data.progress_percentage || 0
        });
      }

      return response.data;
    } catch (error) {
      console.error('Error fetching tutorial status:', error);
      setTutorialStatus(prev => ({
        ...prev,
        loading: false,
        error: error.response?.data?.error || 'Failed to load tutorial status'
      }));
      throw error;
    }
  }, []);

  /**
   * Fetch tutorial tasks with completion status
   */
  const fetchTutorialTasks = useCallback(async () => {
    try {
      const response = await api.get('/api/tutorial/tasks');

      if (response.data.tutorial_started) {
        setTasks(response.data.tasks || []);

        // Update progress
        const completed = response.data.tasks?.filter(t => t.is_completed).length || 0;
        const total = response.data.tasks?.length || 0;

        setProgress({
          completedCount: completed,
          totalCount: total,
          percentage: total > 0 ? Math.round((completed / total) * 100) : 0
        });
      } else {
        setTasks([]);
      }

      return response.data;
    } catch (error) {
      console.error('Error fetching tutorial tasks:', error);
      throw error;
    }
  }, []);

  /**
   * Start the tutorial quest
   */
  const startTutorial = useCallback(async () => {
    try {
      const response = await api.post('/api/tutorial/start', {});

      // Refresh status and tasks after starting
      await Promise.all([
        fetchTutorialStatus(),
        fetchTutorialTasks()
      ]);

      return response.data;
    } catch (error) {
      console.error('Error starting tutorial:', error);
      throw error;
    }
  }, [fetchTutorialStatus, fetchTutorialTasks]);

  /**
   * Check for new task completions and auto-verify
   */
  const checkProgress = useCallback(async () => {
    if (!tutorialStatus.started || tutorialStatus.completed || isVerifying) {
      return { newly_completed: [] };
    }

    setIsVerifying(true);

    try {
      const response = await api.post('/api/tutorial/check-progress', {});

      // If tasks were auto-completed, refresh the task list
      if (response.data.newly_completed && response.data.newly_completed.length > 0) {
        await fetchTutorialTasks();

        // Update tutorial status if quest is now complete
        if (response.data.tutorial_complete) {
          await fetchTutorialStatus();
        }
      }

      return response.data;
    } catch (error) {
      console.error('Error checking tutorial progress:', error);
      throw error;
    } finally {
      setIsVerifying(false);
    }
  }, [tutorialStatus.started, tutorialStatus.completed, isVerifying, fetchTutorialTasks, fetchTutorialStatus]);

  /**
   * Initial load
   */
  useEffect(() => {
    const loadTutorial = async () => {
      try {
        const status = await fetchTutorialStatus();

        if (status.tutorial_started) {
          await fetchTutorialTasks();
        }
      } catch (error) {
        // Error already handled in fetchTutorialStatus
      }
    };

    loadTutorial();
  }, [fetchTutorialStatus, fetchTutorialTasks]);

  /**
   * Auto-check progress every 10 seconds if tutorial is active
   */
  useEffect(() => {
    if (!tutorialStatus.started || tutorialStatus.completed) {
      return;
    }

    const interval = setInterval(() => {
      checkProgress();
    }, 10000); // Check every 10 seconds

    return () => clearInterval(interval);
  }, [tutorialStatus.started, tutorialStatus.completed, checkProgress]);

  return {
    // Status
    tutorialStatus,

    // Tasks
    tasks,

    // Progress
    progress,

    // Actions
    startTutorial,
    checkProgress,
    refresh: useCallback(async () => {
      await Promise.all([
        fetchTutorialStatus(),
        fetchTutorialTasks()
      ]);
    }, [fetchTutorialStatus, fetchTutorialTasks]),

    // Flags
    isVerifying,
    isLoading: tutorialStatus.loading
  };
};

export default useTutorialProgress;
