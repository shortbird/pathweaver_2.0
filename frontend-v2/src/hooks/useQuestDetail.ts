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

  const enroll = async () => {
    if (!questId) return;
    const { data } = await api.post(`/api/quests/${questId}/start`, {});
    await fetchQuest();
    return data;
  };

  const completeTask = async (taskId: string, evidenceBlocks?: any[]) => {
    if (!questId) return;
    const { data } = await api.post(`/api/evidence-documents/tasks/${taskId}`, {
      blocks: evidenceBlocks || [],
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

  const generateTasks = async (interests?: string, pillar?: string, subject?: string) => {
    if (!questId) return [];
    const { data } = await api.post(`/api/quests/${questId}/generate-tasks`, {
      interests,
      pillar,
      subject,
    });
    return data.tasks || data.generated_tasks || [];
  };

  const acceptTask = async (task: any) => {
    if (!questId) return;
    const { data } = await api.post(`/api/quests/${questId}/personalization/accept-task`, {
      task,
    });
    await fetchQuest();
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
