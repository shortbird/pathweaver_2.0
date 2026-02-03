/**
 * useLessonManagement Hook
 *
 * Provides API operations for managing curriculum lessons within a quest.
 * Handles fetching, reordering, and deleting lessons.
 *
 * Usage:
 *   const {
 *     lessons,
 *     loading,
 *     loadLessons,
 *     reorderLessons,
 *     deleteLesson,
 *     createLesson,
 *     updateLesson
 *   } = useLessonManagement({ questId });
 */

import { useState, useCallback } from 'react';
import { toast } from 'react-hot-toast';
import api from '../../services/api';

export function useLessonManagement({ questId } = {}) {
  const [lessons, setLessons] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  // Load lessons for a quest
  const loadLessons = useCallback(async (id = questId) => {
    if (!id) {
      setLessons([]);
      return [];
    }

    try {
      setLoading(true);
      const response = await api.get(`/api/quests/${id}/curriculum/lessons?include_unpublished=true`);
      const fetchedLessons = response.data.lessons || [];
      setLessons(fetchedLessons);
      return fetchedLessons;
    } catch (error) {
      console.error('Failed to load lessons:', error);
      toast.error('Failed to load lessons');
      setLessons([]);
      return [];
    } finally {
      setLoading(false);
    }
  }, [questId]);

  // Reorder lessons via drag and drop
  const reorderLessons = useCallback(async (newOrder, id = questId) => {
    if (!id) return false;

    // newOrder can be array of IDs or array of lessons
    const lessonIds = Array.isArray(newOrder) && typeof newOrder[0] === 'string'
      ? newOrder
      : newOrder.map(l => l.id);

    // Update local state optimistically
    const reorderedLessons = lessonIds.map((lessonId, idx) => {
      const lesson = lessons.find(l => l.id === lessonId);
      return { ...lesson, sequence_order: idx + 1, order: idx + 1 };
    });
    setLessons(reorderedLessons);

    try {
      await api.put(`/api/quests/${id}/curriculum/lessons/reorder`, {
        lesson_order: lessonIds
      });
      return true;
    } catch (error) {
      console.error('Failed to reorder lessons:', error);
      toast.error('Failed to save lesson order');
      // Revert on error
      loadLessons(id);
      return false;
    }
  }, [questId, lessons, loadLessons]);

  // Delete a lesson
  const deleteLesson = useCallback(async (lessonId, id = questId) => {
    if (!id || !lessonId) return false;

    try {
      setSaving(true);
      await api.delete(`/api/quests/${id}/curriculum/lessons/${lessonId}`);
      setLessons(prev => prev.filter(l => l.id !== lessonId));
      toast.success('Lesson deleted');
      return true;
    } catch (error) {
      console.error('Failed to delete lesson:', error);
      toast.error('Failed to delete lesson');
      return false;
    } finally {
      setSaving(false);
    }
  }, [questId]);

  // Create a new lesson
  const createLesson = useCallback(async (lessonData, id = questId) => {
    if (!id) return null;

    try {
      setSaving(true);
      const response = await api.post(`/api/quests/${id}/curriculum/lessons`, lessonData);
      const newLesson = response.data.lesson || response.data;

      // Add to local state
      setLessons(prev => [...prev, newLesson]);
      toast.success('Lesson created');
      return newLesson;
    } catch (error) {
      console.error('Failed to create lesson:', error);
      toast.error('Failed to create lesson');
      return null;
    } finally {
      setSaving(false);
    }
  }, [questId]);

  // Update an existing lesson
  const updateLesson = useCallback(async (lessonId, updates, id = questId) => {
    if (!id || !lessonId) return false;

    try {
      setSaving(true);
      const response = await api.put(`/api/quests/${id}/curriculum/lessons/${lessonId}`, updates);
      const updatedLesson = response.data.lesson || response.data;

      // Update in local state
      setLessons(prev => prev.map(l =>
        l.id === lessonId ? { ...l, ...updatedLesson } : l
      ));

      return updatedLesson;
    } catch (error) {
      console.error('Failed to update lesson:', error);
      toast.error('Failed to update lesson');
      return false;
    } finally {
      setSaving(false);
    }
  }, [questId]);

  // Get a specific lesson from local state
  const getLesson = useCallback((lessonId) => {
    return lessons.find(l => l.id === lessonId) || null;
  }, [lessons]);

  // Get lessons count
  const lessonCount = lessons.length;

  return {
    // State
    lessons,
    setLessons,
    loading,
    saving,
    lessonCount,

    // Operations
    loadLessons,
    reorderLessons,
    deleteLesson,
    createLesson,
    updateLesson,
    getLesson
  };
}

export default useLessonManagement;
