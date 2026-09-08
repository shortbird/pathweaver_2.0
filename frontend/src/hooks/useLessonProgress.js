/**
 * useLessonProgress Hook
 *
 * Manages lesson progress state and persistence for curriculum viewing.
 * Handles saving, loading, and resetting progress via API.
 *
 * Usage:
 *   const {
 *     lessonProgress,
 *     completedSteps,
 *     setCompletedSteps,
 *     progressLoaded,
 *     hasUnsavedChanges,
 *     setHasUnsavedChanges,
 *     saveProgress,
 *     resetProgress,
 *     loadProgress
 *   } = useLessonProgress({ questId });
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import api from '../services/api';

export function useLessonProgress({ questId }) {
  // Map of lessonId -> progress data
  const [lessonProgress, setLessonProgress] = useState({});
  // Set of completed step indices for current lesson
  const [completedSteps, setCompletedSteps] = useState(new Set());
  // Whether initial progress has been loaded
  const [progressLoaded, setProgressLoaded] = useState(false);
  // Whether there are unsaved changes
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  // Load all lesson progress for the quest
  const loadProgress = useCallback(async () => {
    if (!questId) {
      setProgressLoaded(true);
      return {};
    }

    try {
      const response = await api.get(`/api/quests/${questId}/curriculum/progress`);
      const progressData = response.data.progress || [];
      const progressMap = {};
      progressData.forEach(p => {
        progressMap[p.lesson_id] = p;
      });
      setLessonProgress(progressMap);
      setProgressLoaded(true);
      return progressMap;
    } catch (err) {
      console.error('[useLessonProgress] Failed to load progress:', err);
      setProgressLoaded(true);
      return {};
    }
  }, [questId]);

  // Save progress for a specific lesson
  const saveProgress = useCallback(async (lessonId, completedStepsArray, currentStep, totalSteps) => {
    if (!questId || !lessonId) return false;

    try {
      const allContentStepsComplete = totalSteps > 0 && completedStepsArray.length >= totalSteps;

      await api.post(`/api/quests/${questId}/curriculum/progress/${lessonId}`, {
        status: allContentStepsComplete ? 'completed' : 'in_progress',
        progress_percentage: totalSteps > 0 ? Math.round((completedStepsArray.length / totalSteps) * 100) : 0,
        last_position: {
          completed_steps: completedStepsArray,
          current_step: currentStep
        }
      });

      // Update local progress state
      setLessonProgress(prev => ({
        ...prev,
        [lessonId]: {
          ...prev[lessonId],
          status: allContentStepsComplete ? 'completed' : 'in_progress',
          last_position: {
            completed_steps: completedStepsArray,
            current_step: currentStep
          }
        }
      }));

      setHasUnsavedChanges(false);
      return true;
    } catch (err) {
      console.error('[useLessonProgress] Failed to save progress:', err);
      return false;
    }
  }, [questId]);

  // Reset progress for a specific lesson
  const resetProgress = useCallback(async (lessonId) => {
    if (!questId || !lessonId) return false;

    try {
      await api.delete(`/api/quests/${questId}/curriculum/progress/${lessonId}`);

      // Reset local state
      setCompletedSteps(new Set());
      setLessonProgress(prev => {
        const newProgress = { ...prev };
        delete newProgress[lessonId];
        return newProgress;
      });

      return true;
    } catch (err) {
      console.error('[useLessonProgress] Failed to reset progress:', err);
      return false;
    }
  }, [questId]);

  // Get progress for a specific lesson
  const getLessonProgress = useCallback((lessonId) => {
    return lessonProgress[lessonId] || null;
  }, [lessonProgress]);

  // Initialize completed steps from saved progress
  const initializeFromProgress = useCallback((lessonId) => {
    const savedProgress = lessonProgress[lessonId];
    if (savedProgress?.last_position?.completed_steps) {
      setCompletedSteps(new Set(savedProgress.last_position.completed_steps));
      return savedProgress.last_position;
    }
    setCompletedSteps(new Set());
    return null;
  }, [lessonProgress]);

  // Mark a step as completed
  const markStepCompleted = useCallback((stepIndex) => {
    setCompletedSteps(prev => {
      const next = new Set(prev);
      next.add(stepIndex);
      return next;
    });
    setHasUnsavedChanges(true);
  }, []);

  return {
    lessonProgress,
    setLessonProgress,
    completedSteps,
    setCompletedSteps,
    progressLoaded,
    hasUnsavedChanges,
    setHasUnsavedChanges,
    saveProgress,
    resetProgress,
    loadProgress,
    getLessonProgress,
    initializeFromProgress,
    markStepCompleted
  };
}

export default useLessonProgress;
