/**
 * Journal hooks - fetches learning events, interest tracks, and unified topics.
 */

import { useEffect, useState, useCallback } from 'react';
import api from '../services/api';
import { useAuthStore } from '../stores/authStore';

export interface EvidenceBlock {
  id?: string;
  block_type: 'text' | 'image' | 'video' | 'link' | 'document';
  content: Record<string, any>;
  file_url?: string;
  file_name?: string;
  order_index: number;
}

export interface LearningEvent {
  id: string;
  user_id: string;
  title: string;
  description: string;
  pillars: string[];
  event_date: string;
  created_at: string;
  source_type: string;
  evidence_blocks: EvidenceBlock[];
  topics: Array<{ type: string; id: string; name: string; color?: string }>;
  track_id?: string;
  quest_id?: string;
  attached_task_id?: string | null;
  attached_task?: {
    id: string;
    title: string;
    pillar: string;
    xp_value: number;
    quest_id?: string;
    quest_title?: string;
  } | null;
}

export interface InterestTrack {
  id: string;
  name: string;
  description: string;
  color: string;
  icon: string;
  moment_count: number;
  evolved_to_quest_id: string | null;
  created_at: string;
}

export interface UnifiedTopic {
  id: string;
  name: string;
  type: 'topic' | 'track' | 'quest' | 'course';
  color?: string;
  icon?: string;
  moment_count?: number;
  children?: UnifiedTopic[];
}

export function useUnifiedTopics() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const [topics, setTopics] = useState<UnifiedTopic[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchTopics = useCallback(async () => {
    if (!isAuthenticated) return;
    try {
      setLoading(true);
      const { data } = await api.get('/api/topics/unified');
      const allTopics = [
        ...(data.topics || []),
        ...(data.course_topics || []).map((c: any) => ({ ...c, type: 'course' })),
      ];
      setTopics(allTopics);
    } catch {
      // Non-critical
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated]);

  useEffect(() => { fetchTopics(); }, [fetchTopics]);

  return { topics, loading, refetch: fetchTopics };
}

export function useUnassignedMoments() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const [moments, setMoments] = useState<LearningEvent[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchMoments = useCallback(async () => {
    if (!isAuthenticated) return;
    try {
      setLoading(true);
      const { data } = await api.get('/api/learning-events/unassigned');
      setMoments(data.moments || data.learning_events || data || []);
    } catch {
      // Non-critical
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated]);

  useEffect(() => { fetchMoments(); }, [fetchMoments]);

  return { moments, loading, refetch: fetchMoments };
}

export function useTrackMoments(trackId: string | null) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const [track, setTrack] = useState<InterestTrack | null>(null);
  const [moments, setMoments] = useState<LearningEvent[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchTrack = useCallback(async () => {
    if (!isAuthenticated || !trackId) { setLoading(false); return; }
    try {
      setLoading(true);
      const { data } = await api.get(`/api/interest-tracks/${trackId}`);
      const trackData = data.track || data;
      setTrack(trackData);
      setMoments(trackData.moments || data.moments || []);
    } catch {
      // Non-critical
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated, trackId]);

  useEffect(() => { fetchTrack(); }, [fetchTrack]);

  return { track, moments, loading, refetch: fetchTrack };
}

// ── Mutation helpers (not hooks) ──

export async function deleteLearningEvent(eventId: string) {
  await api.delete(`/api/learning-events/${eventId}`);
}

export async function updateLearningEvent(eventId: string, updates: {
  title?: string;
  description?: string;
  pillars?: string[];
  track_id?: string | null;
  topics?: Array<{ type: string; id: string }>;
  event_date?: string | null;
}) {
  const { data } = await api.put(`/api/learning-events/${eventId}`, updates);
  return data;
}

export async function getAiSuggestions(description: string) {
  const { data } = await api.post('/api/learning-events/ai-suggestions', { description });
  return data;
}

export async function assignMomentToTopic(momentId: string, topicType: string, topicId: string | null, action: 'add' | 'remove' = 'add') {
  const { data } = await api.post(`/api/learning-events/${momentId}/assign-topic`, {
    type: topicType,
    topic_id: topicId,
    action,
  });
  return data;
}

export async function deleteInterestTrack(trackId: string) {
  await api.delete(`/api/interest-tracks/${trackId}`);
}

export async function updateInterestTrack(trackId: string, updates: { name?: string; description?: string; color?: string }) {
  const { data } = await api.put(`/api/interest-tracks/${trackId}`, updates);
  return data;
}

export async function evolveTrackToQuest(trackId: string) {
  const { data } = await api.post(`/api/interest-tracks/${trackId}/evolve`, {});
  return data;
}

export async function previewEvolvedQuest(trackId: string) {
  const { data } = await api.get(`/api/interest-tracks/${trackId}/evolve/preview`);
  return data;
}

// ── Quest tasks for journal integration ──

export interface QuestTask {
  id: string;
  title: string;
  description: string;
  pillar: string;
  xp_value: number;
  xp_amount: number;
  is_completed: boolean;
  is_moment?: boolean;
  completed_at?: string;
  evidence_text?: string;
  evidence_url?: string;
  evidence_blocks?: EvidenceBlock[];
}

export function useQuestTasks(questId: string | null) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const [tasks, setTasks] = useState<QuestTask[]>([]);
  const [questTitle, setQuestTitle] = useState('');
  const [loading, setLoading] = useState(true);

  const fetchTasks = useCallback(async () => {
    if (!isAuthenticated || !questId) { setLoading(false); return; }
    try {
      setLoading(true);
      const { data } = await api.get(`/api/quests/${questId}`);
      const quest = data.quest || data;
      setTasks(quest.quest_tasks || []);
      setQuestTitle(quest.title || '');
    } catch {
      // Non-critical
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated, questId]);

  useEffect(() => { fetchTasks(); }, [fetchTasks]);

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

  const generateTasks = async (interests?: string) => {
    if (!questId) return [];
    const sessionId = await ensureSession();
    const existingTitles = tasks.map((t) => t.title);
    const { data } = await api.post(`/api/quests/${questId}/generate-tasks`, {
      session_id: sessionId,
      approach: 'hybrid',
      interests: interests ? [interests] : [],
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
    const newTask: QuestTask = {
      id: data.task_id || `temp-${Date.now()}`,
      title: task.title,
      description: task.description || '',
      pillar: task.pillar || 'stem',
      xp_value: task.xp_value || 50,
      xp_amount: task.xp_value || 50,
      is_completed: false,
    };
    setTasks((prev) => [...prev, newTask]);
    return data;
  };

  return { tasks, questTitle, loading, refetch: fetchTasks, generateTasks, acceptTask };
}

export function useQuestMoments(questId: string | null) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const [moments, setMoments] = useState<LearningEvent[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchMoments = useCallback(async () => {
    if (!isAuthenticated || !questId) { setLoading(false); return; }
    try {
      setLoading(true);
      const { data } = await api.get(`/api/quests/${questId}/moments`);
      setMoments(data.moments || data.learning_events || data || []);
    } catch {
      // Non-critical
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated, questId]);

  useEffect(() => { fetchMoments(); }, [fetchMoments]);

  return { moments, loading, refetch: fetchMoments };
}
