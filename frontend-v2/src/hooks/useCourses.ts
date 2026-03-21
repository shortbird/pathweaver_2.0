/**
 * Course hooks - catalog, detail, enrollment, progress.
 */

import { useEffect, useState, useCallback } from 'react';
import api from '../services/api';
import { useAuthStore } from '../stores/authStore';

export interface Course {
  id: string;
  title: string;
  description: string;
  slug: string;
  status: string;
  visibility: string;
  cover_image_url: string | null;
  organization_id: string | null;
  created_by: string;
  created_at: string;
  // Showcase fields
  learning_outcomes: string[];
  final_deliverable: string;
  guidance_level: string;
  academic_alignment: string[];
  age_range: string;
  estimated_hours: number;
}

export interface CourseQuest {
  id: string;
  quest_id: string;
  sequence_order: number;
  quest: {
    id: string;
    title: string;
    description: string;
    image_url: string | null;
    header_image_url: string | null;
  };
  lessons?: any[];
  progress?: {
    is_completed: boolean;
    can_complete: boolean;
    percentage: number;
    earned_xp: number;
    total_xp: number;
    completed_required_tasks: number;
    total_required_tasks: number;
  };
}

export interface CourseDetail extends Course {
  quests: CourseQuest[];
  enrollment: any | null;
  progress?: {
    percentage: number;
    completed_quests: number;
    total_quests: number;
  };
}

export function useCourseCatalog() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  const fetchCourses = useCallback(async () => {
    try {
      setLoading(true);
      // Use public endpoint (no auth required) for catalog
      const params: Record<string, string> = {};
      if (search) params.search = search;
      const { data } = await api.get('/api/public/courses', { params });
      setCourses(data.courses || data || []);
    } catch {
      // Non-critical
    } finally {
      setLoading(false);
    }
  }, [search]);

  useEffect(() => { fetchCourses(); }, [fetchCourses]);

  return { courses, loading, search, setSearch, refetch: fetchCourses };
}

export function useCourseDetail(courseId: string | null) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const [course, setCourse] = useState<CourseDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchCourse = useCallback(async () => {
    if (!courseId) { setLoading(false); return; }
    try {
      setLoading(true);
      // Try authenticated endpoint first, fall back to public
      let data;
      if (isAuthenticated) {
        const res = await api.get(`/api/courses/${courseId}`);
        data = res.data;
      } else {
        const res = await api.get(`/api/public/courses/${courseId}`);
        data = res.data;
      }
      setCourse(data.course || data);
      setError(null);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to load course');
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated, courseId]);

  const enroll = async () => {
    if (!courseId) return;
    await api.post(`/api/courses/${courseId}/enroll`, {});
    await fetchCourse();
  };

  const unenroll = async () => {
    if (!courseId) return;
    await api.post(`/api/courses/${courseId}/unenroll`, {});
    await fetchCourse();
  };

  useEffect(() => { fetchCourse(); }, [fetchCourse]);

  return { course, loading, error, enroll, unenroll, refetch: fetchCourse };
}

export function useCourseProgress(courseId: string | null) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const [progress, setProgress] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isAuthenticated || !courseId) { setLoading(false); return; }
    (async () => {
      try {
        const { data } = await api.get(`/api/courses/${courseId}/progress`);
        setProgress(data.progress || data);
      } catch {
        // Non-critical
      } finally {
        setLoading(false);
      }
    })();
  }, [isAuthenticated, courseId]);

  return { progress, loading };
}
