/**
 * Course hooks - catalog, detail, enrollment, progress.
 */

import { useEffect, useState, useCallback, useRef } from 'react';
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
  const isLoading = useAuthStore((s) => s.isLoading);
  const user = useAuthStore((s) => s.user);
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const effectiveRole = user?.role === 'org_managed' ? user?.org_role : user?.role;
  const isSuperadmin = effectiveRole === 'superadmin';

  // Debounce search by 500ms
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setDebouncedSearch(search), 500);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [search]);

  const fetchCourses = useCallback(async () => {
    // Wait for auth to settle before fetching -- avoids double-fetch
    if (isLoading) return;
    try {
      setLoading(true);
      if (isSuperadmin && isAuthenticated) {
        // Superadmin sees all courses via authenticated endpoint
        const params: Record<string, string> = { filter: 'admin_all' };
        if (debouncedSearch) params.search = debouncedSearch;
        const { data } = await api.get('/api/courses', { params });
        setCourses(data.courses || data || []);
      } else {
        // Use public endpoint (no auth required) for catalog
        const params: Record<string, string> = {};
        if (debouncedSearch) params.search = debouncedSearch;
        const { data } = await api.get('/api/public/courses', { params });
        setCourses(data.courses || data || []);
      }
    } catch {
      // Non-critical
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch, isSuperadmin, isAuthenticated, isLoading]);

  useEffect(() => { fetchCourses(); }, [fetchCourses]);

  return { courses, loading, search, setSearch, refetch: fetchCourses, isSuperadmin };
}

export function useCourseDetail(courseId: string | null) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const isLoading = useAuthStore((s) => s.isLoading);
  const [course, setCourse] = useState<CourseDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchCourse = useCallback(async () => {
    if (!courseId) { setLoading(false); return; }
    if (isLoading) return;
    try {
      setLoading(true);
      if (isAuthenticated) {
        // Homepage returns everything: course details, quests with lessons, enrollment, progress
        const { data: hp } = await api.get(`/api/courses/${courseId}/homepage`);
        setCourse({
          ...hp.course,
          quests: hp.quests || [],
          enrollment: hp.enrollment || null,
          progress: hp.progress || null,
        });
      } else {
        const res = await api.get(`/api/public/courses/${courseId}`);
        const data = res.data;
        setCourse(data.course || data);
      }
      setError(null);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to load course');
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated, isLoading, courseId]);

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

export interface LessonStep {
  id: string;
  type: 'text' | 'video';
  order: number;
  title: string;
  content: string; // HTML
  video_url?: string;
}

export interface Lesson {
  id: string;
  quest_id: string;
  title: string;
  description: string | null;
  content: { version: number; steps: LessonStep[] } | null;
  sequence_order: number;
  is_published: boolean;
  estimated_duration_minutes: number | null;
  video_url: string | null;
  files: any[] | null;
  linked_task_ids: string[];
}

export function useLessons(questId: string | null) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchLessons = useCallback(async () => {
    if (!isAuthenticated || !questId) return;
    try {
      setLoading(true);
      setError(null);
      const { data } = await api.get(`/api/quests/${questId}/curriculum/lessons`);
      setLessons(data.lessons || []);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to load lessons');
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated, questId]);

  useEffect(() => { fetchLessons(); }, [fetchLessons]);

  return { lessons, loading, error, refetch: fetchLessons };
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
