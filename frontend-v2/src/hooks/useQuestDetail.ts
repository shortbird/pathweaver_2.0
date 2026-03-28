/**
 * Quest Detail hook - fetches quest with enrollment, tasks, and engagement.
 * Provides actions: enroll, complete task, create task, generate tasks.
 */

import { useEffect, useState, useCallback } from 'react';
import api from '../services/api';
import { useAuthStore } from '../stores/authStore';

export interface QuestTask {
  id: string;
  title: string;
  description: string;
  pillar: string;
  xp_value: number;
  xp_amount: number;
  diploma_subjects: string[];
  order_index: number;
  is_completed: boolean;
  is_required: boolean;
  evidence_text?: string;
  evidence_url?: string;
  completed_at?: string;
}

export interface QuestDetail {
  id: string;
  title: string;
  description: string;
  header_image_url: string | null;
  image_url: string | null;
  quest_type: string;
  approach_examples: any;
  allow_custom_tasks: boolean;
  is_active: boolean;
  user_enrollment: any | null;
  completed_enrollment: any | null;
  quest_tasks: QuestTask[];
  template_tasks: any[];
  sample_tasks: any[];
  preset_tasks: any[];
  has_template_tasks: boolean;
  progress: { completed_tasks: number; total_tasks: number; percentage: number } | null;
}

export function useQuestDetail(questId: string | null) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const [quest, setQuest] = useState<QuestDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchQuest = useCallback(async () => {
    if (!isAuthenticated || !questId) { setLoading(false); return; }
    try {
      setLoading(true);
      const { data } = await api.get(`/api/quests/${questId}`);
      console.log('[QuestDetail] API response keys:', Object.keys(data));
      console.log('[QuestDetail] title:', data.title, 'quest.title:', data.quest?.title);
      setQuest(data.quest || data);
      setError(null);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to load quest');
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated, questId]);

  const enroll = async (options?: { force_new?: boolean; load_previous_tasks?: boolean }) => {
    if (!questId) return;
    const { data } = await api.post(`/api/quests/${questId}/enroll`, options || {});
    await fetchQuest();
    return data;
  };

  const completeTask = async (taskId: string, evidenceBlocks?: any[]) => {
    if (!questId) return;
    // Normalize blocks: backend expects `type`, DB returns `block_type`
    const normalized = (evidenceBlocks || []).map((b: any) => ({
      ...b,
      type: b.type || b.block_type,
    }));
    const { data } = await api.post(`/api/evidence/documents/${taskId}`, {
      blocks: normalized,
      status: 'completed',
    });
    // Update local state immediately
    setQuest((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        quest_tasks: prev.quest_tasks.map((t) =>
          t.id === taskId ? { ...t, is_completed: true } : t
        ),
      };
    });
    return data;
  };

  // Personalization session management
  const sessionRef = { current: null as string | null };

  const ensureSession = async (): Promise<string> => {
    if (sessionRef.current) return sessionRef.current;
    if (!questId) throw new Error('No quest ID');
    const { data } = await api.post(`/api/quests/${questId}/start-personalization`, {});
    const sid = data.session_id;
    if (!sid) throw new Error('No session ID returned');
    sessionRef.current = sid;
    return sid;
  };

  const generateTasks = async (interests?: string, pillar?: string, subject?: string) => {
    if (!questId) return [];
    const sessionId = await ensureSession();
    // Pass existing task titles so AI avoids suggesting duplicates
    const existingTitles = (quest?.quest_tasks || []).map((t) => t.title);
    const { data } = await api.post(`/api/quests/${questId}/generate-tasks`, {
      session_id: sessionId,
      approach: 'hybrid',
      interests: interests ? [interests] : [],
      cross_curricular_subjects: subject ? [subject] : [],
      exclude_tasks: existingTitles,
    });
    return data.tasks || data.generated_tasks || [];
  };

  const acceptTask = async (task: any) => {
    if (!questId) return;
    const sessionId = await ensureSession();
    const { data } = await api.post(`/api/quests/${questId}/personalization/accept-task`, {
      session_id: sessionId,
      task,
    });
    // Optimistically add the task to local state instead of refetching
    // (refetch causes re-render that can unmount the wizard mid-flow)
    const newTask = data.task || {
      id: data.task_id || `temp-${Date.now()}`,
      title: task.title,
      description: task.description || '',
      pillar: task.pillar || 'stem',
      xp_value: task.xp_value || 50,
      xp_amount: task.xp_value || 50,
      diploma_subjects: task.diploma_subjects || [],
      order_index: (quest?.quest_tasks?.length || 0),
      is_completed: false,
      is_required: false,
    };
    setQuest((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        quest_tasks: [...prev.quest_tasks, newTask],
      };
    });
    return data;
  };

  const deleteTask = async (taskId: string) => {
    await api.delete(`/api/tasks/${taskId}`);
    setQuest((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        quest_tasks: prev.quest_tasks.filter((t) => t.id !== taskId),
      };
    });
  };

  useEffect(() => { fetchQuest(); }, [fetchQuest]);

  return {
    quest, loading, error,
    refetch: fetchQuest,
    enroll, completeTask, generateTasks, acceptTask, deleteTask,
  };
}

export const PILLARS = [
  { key: 'stem', label: 'STEM' },
  { key: 'art', label: 'Art' },
  { key: 'communication', label: 'Communication' },
  { key: 'civics', label: 'Civics' },
  { key: 'wellness', label: 'Wellness' },
];

export const DIPLOMA_SUBJECTS = [
  'English', 'Mathematics', 'Science', 'Social Studies', 'Foreign Language',
  'Fine Arts', 'Physical Education', 'Health', 'Technology', 'Career & Technical',
  'Elective',
];
