import { useState, useEffect, useCallback, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../services/api';
import toast from 'react-hot-toast';
import logger from '../utils/logger';

/**
 * Query key factory for curriculum-related queries
 */
const curriculumKeys = {
  all: ['curriculum'],
  quest: (questId) => [...curriculumKeys.all, 'quest', questId],
  lesson: (lessonId) => [...curriculumKeys.all, 'lesson', lessonId],
  search: (questId, query) => [...curriculumKeys.all, 'search', questId, query],
  progress: (userId, questId) => [...curriculumKeys.all, 'progress', userId, questId],
};

// ========================================
// QUERY HOOKS
// ========================================

/**
 * Hook for fetching quest curriculum with lessons and settings
 */
export const useQuestCurriculum = (questId, options = {}) => {
  return useQuery({
    queryKey: curriculumKeys.quest(questId),
    queryFn: async () => {
      const response = await api.get(`/api/quests/${questId}/curriculum`);
      return response.data;
    },
    enabled: !!questId,
    staleTime: 5 * 60 * 1000, // 5 minutes
    cacheTime: 10 * 60 * 1000, // 10 minutes
    ...options,
  });
};

/**
 * Hook for fetching individual lesson details
 * Note: Lesson details come from the main curriculum endpoint
 */
export const useLessonDetail = (questId, lessonId, options = {}) => {
  return useQuery({
    queryKey: curriculumKeys.lesson(lessonId),
    queryFn: async () => {
      const response = await api.get(`/api/quests/${questId}/curriculum`);
      // Find the specific lesson from the curriculum data
      const lesson = response.data?.lessons?.find(l => l.id === lessonId);
      return { lesson, curriculum: response.data };
    },
    enabled: !!questId && !!lessonId,
    staleTime: 5 * 60 * 1000,
    cacheTime: 10 * 60 * 1000,
    ...options,
  });
};

/**
 * Hook for full-text curriculum search
 */
export const useCurriculumSearch = (questId, searchQuery, options = {}) => {
  return useQuery({
    queryKey: curriculumKeys.search(questId, searchQuery),
    queryFn: async () => {
      const response = await api.get(`/api/quests/${questId}/curriculum/lessons/search`, {
        params: { q: searchQuery }
      });
      return response.data;
    },
    enabled: !!questId && !!searchQuery && searchQuery.trim().length >= 2,
    staleTime: 2 * 60 * 1000, // 2 minutes
    ...options,
  });
};

// ========================================
// MUTATION HOOKS - LESSON MANAGEMENT
// ========================================

/**
 * Hook for creating a new lesson
 */
export const useCreateLesson = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ questId, lessonData }) => {
      const response = await api.post(`/api/quests/${questId}/curriculum/lessons`, lessonData);
      return response.data;
    },
    onSuccess: (data, { questId }) => {
      // Invalidate curriculum query to refresh lesson list
      queryClient.invalidateQueries(curriculumKeys.quest(questId));
      toast.success('Lesson created successfully!');
    },
    onError: (error) => {
      logger.error('[CURRICULUM] Failed to create lesson:', error);
      toast.error(error.response?.data?.error || 'Failed to create lesson');
    },
  });
};

/**
 * Hook for updating an existing lesson
 */
export const useUpdateLesson = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ questId, lessonId, updates }) => {
      const response = await api.put(`/api/quests/${questId}/curriculum/lessons/${lessonId}`, updates);
      return response.data;
    },
    onSuccess: (data, { lessonId }) => {
      // Invalidate lesson detail
      queryClient.invalidateQueries(curriculumKeys.lesson(lessonId));

      // Find and invalidate parent quest curriculum
      const questId = data.lesson?.quest_id;
      if (questId) {
        queryClient.invalidateQueries(curriculumKeys.quest(questId));
      }
    },
    onError: (error) => {
      logger.error('[CURRICULUM] Failed to update lesson:', error);
      toast.error(error.response?.data?.error || 'Failed to update lesson');
    },
  });
};

/**
 * Hook for deleting a lesson
 */
export const useDeleteLesson = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ questId, lessonId }) => {
      const response = await api.delete(`/api/quests/${questId}/curriculum/lessons/${lessonId}`);
      return response.data;
    },
    onMutate: async ({ lessonId, questId }) => {
      // Cancel outgoing queries
      await queryClient.cancelQueries(curriculumKeys.quest(questId));

      // Snapshot previous value for rollback
      const previousCurriculum = queryClient.getQueryData(curriculumKeys.quest(questId));

      // Optimistically remove lesson from cache
      queryClient.setQueryData(curriculumKeys.quest(questId), (old) => {
        if (!old?.lessons) return old;
        return {
          ...old,
          lessons: old.lessons.filter(lesson => lesson.id !== lessonId)
        };
      });

      return { previousCurriculum, questId };
    },
    onSuccess: (data, variables, context) => {
      queryClient.invalidateQueries(curriculumKeys.quest(context.questId));
      toast.success('Lesson deleted successfully');
    },
    onError: (error, variables, context) => {
      // Rollback on error
      if (context?.previousCurriculum) {
        queryClient.setQueryData(curriculumKeys.quest(context.questId), context.previousCurriculum);
      }
      logger.error('[CURRICULUM] Failed to delete lesson:', error);
      toast.error(error.response?.data?.error || 'Failed to delete lesson');
    },
  });
};

/**
 * Hook for reordering lessons (drag & drop)
 */
export const useReorderLessons = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ questId, lessonOrders }) => {
      const response = await api.put(`/api/quests/${questId}/curriculum/lessons/reorder`, { lesson_orders: lessonOrders });
      return response.data;
    },
    onMutate: async ({ questId, lessonOrders }) => {
      // Cancel outgoing queries
      await queryClient.cancelQueries(curriculumKeys.quest(questId));

      // Snapshot previous value
      const previousCurriculum = queryClient.getQueryData(curriculumKeys.quest(questId));

      // Optimistically update lesson order
      queryClient.setQueryData(curriculumKeys.quest(questId), (old) => {
        if (!old?.lessons) return old;

        const reorderedLessons = [...old.lessons].sort((a, b) => {
          const orderA = lessonOrders.find(o => o.lesson_id === a.id)?.sequence_order ?? a.sequence_order;
          const orderB = lessonOrders.find(o => o.lesson_id === b.id)?.sequence_order ?? b.sequence_order;
          return orderA - orderB;
        });

        return { ...old, lessons: reorderedLessons };
      });

      return { previousCurriculum, questId };
    },
    onError: (error, variables, context) => {
      // Rollback on error
      if (context?.previousCurriculum) {
        queryClient.setQueryData(curriculumKeys.quest(context.questId), context.previousCurriculum);
      }
      logger.error('[CURRICULUM] Failed to reorder lessons:', error);
      toast.error('Failed to reorder lessons');
    },
    onSettled: (data, error, { questId }) => {
      // Always refetch after mutation settles
      queryClient.invalidateQueries(curriculumKeys.quest(questId));
    },
  });
};

// ========================================
// MUTATION HOOKS - PROGRESS TRACKING
// ========================================

/**
 * Hook for updating lesson progress
 */
export const useUpdateProgress = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ questId, lessonId, progressData }) => {
      const response = await api.post(`/api/quests/${questId}/curriculum/progress/${lessonId}`, progressData);
      return response.data;
    },
    onSuccess: (data, { lessonId }) => {
      // Invalidate lesson detail
      queryClient.invalidateQueries(curriculumKeys.lesson(lessonId));

      // Invalidate progress queries
      const questId = data.progress?.quest_id;
      if (questId) {
        queryClient.invalidateQueries(curriculumKeys.progress(null, questId));
        queryClient.invalidateQueries(curriculumKeys.quest(questId));
      }
    },
    onError: (error) => {
      logger.error('[CURRICULUM] Failed to update progress:', error);
      // Silent fail for progress updates (non-critical)
    },
  });
};

// ========================================
// MUTATION HOOKS - AI TASK GENERATION
// ========================================

/**
 * Hook for generating tasks from curriculum using AI
 */
export const useGenerateTasks = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ questId, lessonId }) => {
      const response = await api.post(`/api/quests/${questId}/curriculum/lessons/${lessonId}/generate-tasks`, {});
      return response.data;
    },
    onSuccess: (data, { questId }) => {
      queryClient.invalidateQueries(['quests', 'detail', questId]);
      queryClient.invalidateQueries(curriculumKeys.quest(questId));

      const taskCount = data.tasks?.length || 0;
      toast.success(`Generated ${taskCount} task${taskCount !== 1 ? 's' : ''} from curriculum!`);
    },
    onError: (error) => {
      logger.error('[CURRICULUM] Failed to generate tasks:', error);
      toast.error(error.response?.data?.error || 'Failed to generate tasks');
    },
  });
};

/**
 * Hook for linking existing tasks to lessons
 */
export const useLinkTasks = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ questId, lessonId, taskIds }) => {
      const response = await api.post(`/api/quests/${questId}/curriculum/lessons/${lessonId}/link-task`, { task_ids: taskIds });
      return response.data;
    },
    onSuccess: (data, { lessonId }) => {
      queryClient.invalidateQueries(curriculumKeys.lesson(lessonId));

      const questId = data.lesson?.quest_id;
      if (questId) {
        queryClient.invalidateQueries(curriculumKeys.quest(questId));
        queryClient.invalidateQueries(['quests', 'detail', questId]);
      }

      toast.success('Tasks linked successfully!');
    },
    onError: (error) => {
      logger.error('[CURRICULUM] Failed to link tasks:', error);
      toast.error(error.response?.data?.error || 'Failed to link tasks');
    },
  });
};

// ========================================
// CUSTOM HOOK WITH AUTO-SAVE AND STATE
// ========================================

/**
 * Main curriculum data hook with auto-save, localStorage backup, and unsaved changes tracking
 */
export const useCurriculumData = (questId) => {
  const queryClient = useQueryClient();

  // Queries
  const curriculumQuery = useQuestCurriculum(questId);

  // Mutations
  const createLessonMutation = useCreateLesson();
  const updateLessonMutation = useUpdateLesson();
  const deleteLessonMutation = useDeleteLesson();
  const reorderLessonsMutation = useReorderLessons();
  const updateProgressMutation = useUpdateProgress();
  const generateTasksMutation = useGenerateTasks();
  const linkTasksMutation = useLinkTasks();

  // Local state
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState(null);

  // Debounced auto-save timer
  const autoSaveTimerRef = useRef(null);
  const pendingChangesRef = useRef(null);

  // LocalStorage backup key
  const backupKey = `curriculum_backup_${questId}`;

  /**
   * Save pending changes to localStorage as backup
   */
  const backupToLocalStorage = useCallback((data) => {
    try {
      localStorage.setItem(backupKey, JSON.stringify({
        data,
        timestamp: Date.now(),
        questId,
      }));
      logger.debug('[CURRICULUM] Backed up to localStorage');
    } catch (error) {
      logger.error('[CURRICULUM] Failed to backup to localStorage:', error);
    }
  }, [backupKey, questId]);

  /**
   * Restore from localStorage backup
   */
  const restoreFromBackup = useCallback(() => {
    try {
      const backup = localStorage.getItem(backupKey);
      if (!backup) return null;

      const parsed = JSON.parse(backup);
      const age = Date.now() - parsed.timestamp;

      // Only restore if backup is less than 1 hour old
      if (age < 60 * 60 * 1000) {
        logger.debug('[CURRICULUM] Restored from localStorage backup');
        return parsed.data;
      } else {
        // Clear stale backup
        localStorage.removeItem(backupKey);
        return null;
      }
    } catch (error) {
      logger.error('[CURRICULUM] Failed to restore from localStorage:', error);
      return null;
    }
  }, [backupKey]);

  /**
   * Clear localStorage backup
   */
  const clearBackup = useCallback(() => {
    try {
      localStorage.removeItem(backupKey);
      logger.debug('[CURRICULUM] Cleared localStorage backup');
    } catch (error) {
      logger.error('[CURRICULUM] Failed to clear backup:', error);
    }
  }, [backupKey]);

  /**
   * Debounced auto-save function (3 second delay)
   */
  const scheduleAutoSave = useCallback((lessonId, updates) => {
    setHasUnsavedChanges(true);
    pendingChangesRef.current = { lessonId, updates };

    // Backup to localStorage immediately
    backupToLocalStorage({ lessonId, updates });

    // Clear existing timer
    if (autoSaveTimerRef.current) {
      clearTimeout(autoSaveTimerRef.current);
    }

    // Schedule new save after 3 seconds
    autoSaveTimerRef.current = setTimeout(() => {
      if (pendingChangesRef.current) {
        setIsSaving(true);
        updateLessonMutation.mutate(
          { lessonId: pendingChangesRef.current.lessonId, updates: pendingChangesRef.current.updates },
          {
            onSuccess: () => {
              setHasUnsavedChanges(false);
              setIsSaving(false);
              setLastSaved(new Date());
              clearBackup();
              pendingChangesRef.current = null;
            },
            onError: () => {
              setIsSaving(false);
              // Keep hasUnsavedChanges=true on error
            }
          }
        );
      }
    }, 3000);
  }, [updateLessonMutation, backupToLocalStorage, clearBackup]);

  /**
   * Force immediate save (for manual save button)
   */
  const forceSave = useCallback(() => {
    if (autoSaveTimerRef.current) {
      clearTimeout(autoSaveTimerRef.current);
    }

    if (pendingChangesRef.current) {
      setIsSaving(true);
      updateLessonMutation.mutate(
        { lessonId: pendingChangesRef.current.lessonId, updates: pendingChangesRef.current.updates },
        {
          onSuccess: () => {
            setHasUnsavedChanges(false);
            setIsSaving(false);
            setLastSaved(new Date());
            clearBackup();
            pendingChangesRef.current = null;
          },
          onError: () => {
            setIsSaving(false);
          }
        }
      );
    }
  }, [updateLessonMutation, clearBackup]);

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current);
      }
    };
  }, []);

  // Navigation warning when there are unsaved changes
  useEffect(() => {
    const handleBeforeUnload = (e) => {
      if (hasUnsavedChanges) {
        e.preventDefault();
        e.returnValue = '';
        return '';
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [hasUnsavedChanges]);

  return {
    // Query data
    curriculum: curriculumQuery.data,
    isLoading: curriculumQuery.isLoading,
    error: curriculumQuery.error,
    refetch: curriculumQuery.refetch,

    // Mutations
    createLesson: createLessonMutation.mutate,
    updateLesson: updateLessonMutation.mutate,
    deleteLesson: deleteLessonMutation.mutate,
    reorderLessons: reorderLessonsMutation.mutate,
    updateProgress: updateProgressMutation.mutate,
    generateTasks: generateTasksMutation.mutate,
    linkTasks: linkTasksMutation.mutate,

    // Mutation states
    isCreating: createLessonMutation.isPending,
    isUpdating: updateLessonMutation.isPending,
    isDeleting: deleteLessonMutation.isPending,
    isReordering: reorderLessonsMutation.isPending,
    isGeneratingTasks: generateTasksMutation.isPending,
    isLinkingTasks: linkTasksMutation.isPending,

    // Auto-save state
    hasUnsavedChanges,
    isSaving,
    lastSaved,
    scheduleAutoSave,
    forceSave,

    // Backup utilities
    restoreFromBackup,
    clearBackup,

    // Query client
    queryClient,
  };
};

export default useCurriculumData;
