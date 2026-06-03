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
  /** Who captured the moment. Null/own-id = the student; a parent's id when a
   *  parent captured it for the child. Drives parent edit/delete permissions. */
  captured_by_user_id?: string | null;
  /** Display name of the capturer when it wasn't the student (parent view). */
  captured_by_name?: string;
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

// Module-level cache so the Journal feels instant when re-entered. The hook
// rehydrates from this cache on mount and only flips `loading` to true when
// there's nothing to show yet — subsequent refetches happen silently in the
// background while the previous tiles remain on screen.
let _topicsCache: UnifiedTopic[] | null = null;

/**
 * @param studentId  When set, fetch a CHILD's topics via the parent-scoped
 *   endpoint (parent journal view). The module-level cache is bypassed in that
 *   mode so a child's topics never bleed into the parent's own Journal tab.
 */
export function useUnifiedTopics(studentId?: string) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const useCache = !studentId;
  const [topics, setTopics] = useState<UnifiedTopic[]>(useCache ? (_topicsCache || []) : []);
  const [loading, setLoading] = useState(useCache ? _topicsCache === null : true);

  const fetchTopics = useCallback(async () => {
    if (!isAuthenticated) return;
    // Only show the loading state when we have nothing on screen yet —
    // otherwise refetching after e.g. creating a topic would briefly blank
    // out the grid.
    if (!useCache || _topicsCache === null) setLoading(true);
    try {
      const url = studentId ? `/api/parent/children/${studentId}/topics` : '/api/topics/unified';
      const { data } = await api.get(url);
      const allTopics = [
        ...(data.topics || []),
        ...(data.course_topics || []).map((c: any) => ({ ...c, type: 'course' })),
      ];
      if (useCache) _topicsCache = allTopics;
      setTopics(allTopics);
    } catch {
      // Non-critical — keep whatever cached tiles are on screen.
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated, studentId, useCache]);

  useEffect(() => { fetchTopics(); }, [fetchTopics]);

  return { topics, loading, refetch: fetchTopics };
}

/** Call after logout / role-switch so a new user doesn't see the prior cache. */
export function clearUnifiedTopicsCache() {
  _topicsCache = null;
}

// Same cache pattern as useUnifiedTopics — the unassigned count drives the
// Journal's first tile, so we want it to render instantly on re-entry.
let _unassignedCache: LearningEvent[] | null = null;

/**
 * @param studentId  When set, derive a CHILD's unassigned moments from the
 *   parent-scoped moments list (there's no dedicated parent "unassigned"
 *   endpoint): a moment is unassigned when it carries no topic associations.
 */
export function useUnassignedMoments(studentId?: string) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const useCache = !studentId;
  const [moments, setMoments] = useState<LearningEvent[]>(useCache ? (_unassignedCache || []) : []);
  const [loading, setLoading] = useState(useCache ? _unassignedCache === null : true);

  const fetchMoments = useCallback(async () => {
    if (!isAuthenticated) return;
    if (!useCache || _unassignedCache === null) setLoading(true);
    try {
      if (studentId) {
        const { data } = await api.get(`/api/parent/children/${studentId}/learning-moments`, { params: { limit: 100 } });
        const all = data.moments || [];
        setMoments(all.filter((m: any) => !m.topics || m.topics.length === 0));
      } else {
        const { data } = await api.get('/api/learning-events/unassigned');
        const next = data.moments || data.learning_events || data || [];
        _unassignedCache = next;
        setMoments(next);
      }
    } catch {
      // Non-critical — keep cached list on screen.
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated, studentId, useCache]);

  useEffect(() => { fetchMoments(); }, [fetchMoments]);

  // Optimistically drop a moment from the list (and cache) so a delete feels
  // instant instead of triggering a full reload of the journal.
  const removeMoment = useCallback((id: string) => {
    setMoments((prev) => {
      const next = prev.filter((m) => m.id !== id);
      if (useCache) _unassignedCache = next;
      return next;
    });
  }, [useCache]);

  return { moments, loading, refetch: fetchMoments, removeMoment };
}

export function clearUnassignedMomentsCache() {
  _unassignedCache = null;
}

/**
 * @param studentId  When set, fetch a CHILD's track detail via the
 *   parent-scoped endpoint (same `get_track_with_moments` service, identical
 *   shape).
 */
export function useTrackMoments(trackId: string | null, studentId?: string) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const [track, setTrack] = useState<InterestTrack | null>(null);
  const [moments, setMoments] = useState<LearningEvent[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchTrack = useCallback(async () => {
    if (!isAuthenticated || !trackId) { setLoading(false); return; }
    try {
      setLoading(true);
      const url = studentId
        ? `/api/parent/children/${studentId}/topics/${trackId}`
        : `/api/interest-tracks/${trackId}`;
      const { data } = await api.get(url);
      const trackData = data.track || data;
      setTrack(trackData);
      setMoments(trackData.moments || data.moments || []);
    } catch {
      // Non-critical
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated, trackId, studentId]);

  useEffect(() => { fetchTrack(); }, [fetchTrack]);

  const removeMoment = useCallback((id: string) => {
    setMoments((prev) => prev.filter((m) => m.id !== id));
  }, []);

  return { track, moments, loading, refetch: fetchTrack, removeMoment };
}

// ── Mutation helpers (not hooks) ──

export async function deleteLearningEvent(eventId: string) {
  await api.delete(`/api/learning-events/${eventId}`);
}

export async function updateLearningEvent(eventId: string, updates: {
  title?: string | null;
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

// ── Parent-scoped mutations ──
// A parent edits/deletes a moment on their CHILD's account. The backend
// (routes/parent/learning_moments.py) only permits this for moments the parent
// themselves captured (captured_by_user_id == parent). Pillars are intentionally
// not editable through the parent endpoint — only title/description/date/topic.

export async function updateChildLearningEvent(childId: string, eventId: string, updates: {
  title?: string | null;
  description?: string;
  event_date?: string | null;
  topics?: Array<{ type: string; id: string }>;
}) {
  const { data } = await api.put(`/api/parent/children/${childId}/learning-moments/${eventId}`, updates);
  return data;
}

export async function deleteChildLearningEvent(childId: string, eventId: string) {
  await api.delete(`/api/parent/children/${childId}/learning-moments/${eventId}`);
}

export async function assignChildMomentToTopic(
  childId: string,
  momentId: string,
  topicType: string,
  topicId: string | null,
  action: 'add' | 'remove' = 'add',
) {
  const { data } = await api.post(
    `/api/parent/children/${childId}/learning-events/${momentId}/assign-topic`,
    { type: topicType, topic_id: topicId, action },
  );
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

  const removeMoment = useCallback((id: string) => {
    setMoments((prev) => prev.filter((m) => m.id !== id));
  }, []);

  return { moments, loading, refetch: fetchMoments, removeMoment };
}
