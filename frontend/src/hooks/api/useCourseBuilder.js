/**
 * useCourseBuilder Hook
 *
 * Provides API operations for building and managing courses.
 * Handles course CRUD, quest management, and publishing.
 *
 * Usage:
 *   const {
 *     course,
 *     quests,
 *     loading,
 *     saving,
 *     saveStatus,
 *     loadCourse,
 *     createCourse,
 *     updateCourse,
 *     deleteCourse,
 *     addQuest,
 *     removeQuest,
 *     reorderQuests,
 *     toggleQuestPublish,
 *     publishCourse,
 *     unpublishCourse
 *   } = useCourseBuilder({ courseId });
 */

import { useState, useCallback } from 'react';
import { toast } from 'react-hot-toast';
import api from '../../services/api';
import courseService from '../../services/courseService';

export function useCourseBuilder({ courseId, onNavigate } = {}) {
  const [course, setCourse] = useState(null);
  const [quests, setQuests] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState('saved'); // 'saved', 'saving', 'error'
  const [isPublishing, setIsPublishing] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // Load course and its quests
  const loadCourse = useCallback(async (id = courseId) => {
    if (!id) return null;

    try {
      setLoading(true);

      // Fetch course info
      const courseResponse = await courseService.getCourseById(id);
      setCourse(courseResponse.course);

      // Fetch course quests
      const questsResponse = await api.get(`/api/courses/${id}/quests`);
      const fetchedQuests = questsResponse.data.quests || [];
      setQuests(fetchedQuests);

      return { course: courseResponse.course, quests: fetchedQuests };
    } catch (error) {
      console.error('Failed to load course:', error);
      toast.error('Failed to load course data');
      return null;
    } finally {
      setLoading(false);
    }
  }, [courseId]);

  // Create a new course
  const createCourse = useCallback(async (data) => {
    if (!data.title?.trim()) {
      toast.error('Please enter a course title');
      return null;
    }

    try {
      setSaving(true);
      const response = await courseService.createCourse({
        title: data.title,
        description: data.description || ''
      });

      toast.success('Course created!');
      return response.course;
    } catch (error) {
      console.error('Failed to create course:', error);
      toast.error('Failed to create course');
      return null;
    } finally {
      setSaving(false);
    }
  }, []);

  // Update course metadata
  const updateCourse = useCallback(async (updates, id = courseId) => {
    if (!id) return false;

    try {
      setSaveStatus('saving');
      await courseService.updateCourse(id, updates);

      // Update local state
      setCourse(prev => ({ ...prev, ...updates }));
      setSaveStatus('saved');
      return true;
    } catch (error) {
      console.error('Failed to update course:', error);
      setSaveStatus('error');
      toast.error('Failed to save changes');
      return false;
    }
  }, [courseId]);

  // Delete course
  const deleteCourse = useCallback(async (id = courseId) => {
    if (!id) return false;

    try {
      setIsDeleting(true);
      await courseService.deleteCourse(id);
      toast.success('Course deleted successfully');
      return true;
    } catch (error) {
      console.error('Failed to delete course:', error);
      toast.error(error.response?.data?.error || 'Failed to delete course');
      return false;
    } finally {
      setIsDeleting(false);
    }
  }, [courseId]);

  // Add quest to course
  const addQuest = useCallback(async (quest, id = courseId) => {
    if (!id || !quest) return false;

    try {
      setSaving(true);
      await courseService.addQuestToCourse(id, quest.id, {
        sequence_order: quests.length
      });

      const updatedQuest = { ...quest, order_index: quests.length };
      setQuests(prev => [...prev, updatedQuest]);
      toast.success('Project added to course');
      return updatedQuest;
    } catch (error) {
      console.error('Failed to add quest:', error);
      toast.error('Failed to add quest');
      return false;
    } finally {
      setSaving(false);
    }
  }, [courseId, quests.length]);

  // Remove quest from course
  const removeQuest = useCallback(async (questId, id = courseId) => {
    if (!id || !questId) return false;

    try {
      setSaving(true);
      await courseService.removeQuestFromCourse(id, questId);

      setQuests(prev => prev.filter(q => q.id !== questId));
      toast.success('Project removed from course');
      return true;
    } catch (error) {
      console.error('Failed to remove quest:', error);
      toast.error('Failed to remove quest');
      return false;
    } finally {
      setSaving(false);
    }
  }, [courseId]);

  // Reorder quests (accepts array of quest IDs or reordered quests)
  const reorderQuests = useCallback(async (newOrder, id = courseId) => {
    if (!id) return false;

    // newOrder can be array of IDs or array of quests
    const questIds = Array.isArray(newOrder) && typeof newOrder[0] === 'string'
      ? newOrder
      : newOrder.map(q => q.id);

    // Update local state optimistically
    const reorderedQuests = questIds.map((questId, idx) => {
      const quest = quests.find(q => q.id === questId);
      return { ...quest, order_index: idx };
    });
    setQuests(reorderedQuests);

    try {
      await courseService.reorderQuests(id, questIds);
      return true;
    } catch (error) {
      console.error('Failed to reorder quests:', error);
      toast.error('Failed to save project order');
      // Revert on error
      loadCourse(id);
      return false;
    }
  }, [courseId, quests, loadCourse]);

  // Toggle quest publish status
  const toggleQuestPublish = useCallback(async (questId, isPublished, id = courseId) => {
    if (!id || !questId) return false;

    try {
      await api.put(`/api/courses/${id}/quests/${questId}`, {
        is_published: isPublished
      });

      // Update local state
      setQuests(prev => prev.map(q =>
        q.id === questId ? { ...q, is_published: isPublished } : q
      ));

      toast.success(isPublished ? 'Project published' : 'Project unpublished');
      return true;
    } catch (error) {
      console.error('Failed to toggle project publish status:', error);
      toast.error('Failed to update project');
      return false;
    }
  }, [courseId]);

  // Publish course
  const publishCourse = useCallback(async (id = courseId) => {
    if (!id) return false;

    try {
      setIsPublishing(true);
      await courseService.publishCourse(id);
      setCourse(prev => ({ ...prev, status: 'published' }));
      toast.success('Course published! A completion badge has been created.');
      return true;
    } catch (error) {
      console.error('Failed to publish course:', error);
      toast.error('Failed to publish course');
      return false;
    } finally {
      setIsPublishing(false);
    }
  }, [courseId]);

  // Unpublish course
  const unpublishCourse = useCallback(async (id = courseId) => {
    if (!id) return false;

    try {
      setIsPublishing(true);
      await courseService.unpublishCourse(id);
      setCourse(prev => ({ ...prev, status: 'draft' }));
      toast.success('Course unpublished');
      return true;
    } catch (error) {
      console.error('Failed to unpublish course:', error);
      toast.error('Failed to unpublish course');
      return false;
    } finally {
      setIsPublishing(false);
    }
  }, [courseId]);

  // Get a specific quest from local state
  const getQuest = useCallback((questId) => {
    return quests.find(q => q.id === questId) || null;
  }, [quests]);

  return {
    // State
    course,
    setCourse,
    quests,
    setQuests,
    loading,
    saving,
    saveStatus,
    isPublishing,
    isDeleting,

    // Course operations
    loadCourse,
    createCourse,
    updateCourse,
    deleteCourse,
    publishCourse,
    unpublishCourse,

    // Quest operations
    addQuest,
    removeQuest,
    reorderQuests,
    toggleQuestPublish,
    getQuest
  };
}

export default useCourseBuilder;
