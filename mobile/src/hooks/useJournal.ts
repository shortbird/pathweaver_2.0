/**
 * Journal hooks - fetches learning events, interest tracks, and unified topics.
 */

import { useEffect, useState, useCallback, useRef } from 'react';
import api from '../services/api';
import { useAuthStore } from '../stores/authStore';
import { useRefetchOnForeground } from './useRefetchOnForeground';

export interface EvidenceBlock {
  id?: string;
  // Mirrors the server's vocabulary exactly — see valid_block_types in
  // backend/routes/learning_events/evidence.py. 'audio' was missing here, so
  // every `block_type === 'audio'` check (the voice-note player) read to tsc as
  // a comparison with no overlap.
  block_type: 'text' | 'image' | 'video' | 'link' | 'document' | 'audio';
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
  topics: { type: string; id: string; name: string; color?: string }[];
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
  useRefetchOnForeground(fetchTopics);

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

  useRefetchOnForeground(fetchMoments);

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

  useRefetchOnForeground(fetchTrack);

  return { track, moments, loading, refetch: fetchTrack, removeMoment };
}

// ── Mutation helpers (not hooks) ──
//
// Family scope: every write takes an optional `studentId`. With it, the
// request names the child (`student_id`) and the backend's @student_scope
// writes to the child's rows as the parent (2026-09-15). Against a backend
// that predates that -- a preview OTA ahead of its backend -- the primary
// route answers 403/404 for the child's row, and the write falls back to the
// parent-shaped endpoint under /api/parent/children/<id>/..., which permits
// only what the older rules did (moments the parent captured themselves).
// Those parent-shaped helpers were their own three exported functions until
// the fold; the fallback is the whole of what remains of them.

const isRefusal = (err: unknown) => [403, 404].includes((err as { response?: { status?: number } })?.response?.status ?? 0);

export async function deleteLearningEvent(eventId: string, studentId?: string | null) {
  if (!studentId) {
    await api.delete(`/api/learning-events/${eventId}`);
    return;
  }
  try {
    await api.delete(`/api/learning-events/${eventId}`, { params: { student_id: studentId } });
  } catch (err) {
    if (!isRefusal(err)) throw err;
    await api.delete(`/api/parent/children/${studentId}/learning-moments/${eventId}`);
  }
}

export async function updateLearningEvent(eventId: string, updates: {
  title?: string | null;
  description?: string;
  pillars?: string[];
  track_id?: string | null;
  topics?: { type: string; id: string }[];
  event_date?: string | null;
}, studentId?: string | null) {
  if (!studentId) {
    const { data } = await api.put(`/api/learning-events/${eventId}`, updates);
    return data;
  }
  try {
    const { data } = await api.put(`/api/learning-events/${eventId}`, { ...updates, student_id: studentId });
    return data;
  } catch (err) {
    if (!isRefusal(err)) throw err;
    // The parent-shaped route does not take pillars.
    const { pillars: _pillars, ...rest } = updates;
    const { data } = await api.put(`/api/parent/children/${studentId}/learning-moments/${eventId}`, rest);
    return data;
  }
}

export async function getAiSuggestions(description: string) {
  const { data } = await api.post('/api/learning-events/ai-suggestions', { description });
  return data;
}

export async function assignMomentToTopic(
  momentId: string, topicType: string, topicId: string | null,
  action: 'add' | 'remove' = 'add', studentId?: string | null,
) {
  const body = { type: topicType, topic_id: topicId, action };
  if (!studentId) {
    const { data } = await api.post(`/api/learning-events/${momentId}/assign-topic`, body);
    return data;
  }
  try {
    const { data } = await api.post(`/api/learning-events/${momentId}/assign-topic`, { ...body, student_id: studentId });
    return data;
  } catch (err) {
    if (!isRefusal(err)) throw err;
    const { data } = await api.post(`/api/parent/children/${studentId}/learning-events/${momentId}/assign-topic`, body);
    return data;
  }
}

/**
 * Create a topic (track) — for the current user, or for a child when `childId`
 * is set (parent flow). Returns the new topic row ({ id, name, color, icon }).
 */
export async function createTopic(
  name: string,
  opts?: { childId?: string; color?: string; icon?: string },
): Promise<{ id: string; name: string; color?: string; icon?: string }> {
  const body = { name: name.trim(), color: opts?.color || '#6D469B', icon: opts?.icon || 'folder' };
  const { data } = opts?.childId
    ? await api.post(`/api/parent/children/${opts.childId}/topics`, body)
    : await api.post('/api/interest-tracks', body);
  return data.track;
}

export async function deleteInterestTrack(trackId: string, studentId?: string | null) {
  await api.delete(`/api/interest-tracks/${trackId}`, studentId ? { params: { student_id: studentId } } : undefined);
}

export async function updateInterestTrack(
  trackId: string, updates: { name?: string; description?: string; color?: string }, studentId?: string | null,
) {
  const { data } = await api.put(`/api/interest-tracks/${trackId}`, studentId ? { ...updates, student_id: studentId } : updates);
  return data;
}

// ── Evolve a topic into a quest ──
//
// The backend needs a quest title (plus optional description and tasks) to
// evolve a track. Posting an empty body 400'd with "Request body is required"
// on every Evolve tap. The flow mirrors the web app: fetch the AI preview, let
// the student review and edit it, then post what they approved.

export interface EvolvePreviewTask {
  title: string;
  description?: string;
  pillar?: string;
  xp_value?: number;
}

export interface EvolvePreview {
  title: string;
  description: string;
  tasks: EvolvePreviewTask[];
  total_xp?: number;
  primary_pillar?: string;
  learning_outcomes?: string[];
}

export interface EvolvePreviewResponse {
  success: boolean;
  preview?: EvolvePreview;
  moment_count?: number;
  track_name?: string;
  error?: string;
}

export interface EvolvePayload {
  title: string;
  description?: string | null;
  tasks?: EvolvePreviewTask[];
}

export interface EvolveResult {
  success: boolean;
  quest_id?: string;
  quest?: { id: string; title: string };
  tasks_created?: number;
  message?: string;
  error?: string;
}

export async function evolveTrackToQuest(trackId: string, payload: EvolvePayload, studentId?: string | null): Promise<EvolveResult> {
  const { data } = await api.post(`/api/interest-tracks/${trackId}/evolve`, studentId ? { ...payload, student_id: studentId } : payload);
  return data;
}

export async function previewEvolvedQuest(trackId: string, studentId?: string | null): Promise<EvolvePreviewResponse> {
  const { data } = await api.get(`/api/interest-tracks/${trackId}/evolve/preview`, studentId ? { params: { student_id: studentId } } : undefined);
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
  const sessionRef = useRef<string | null>(null);

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

  useRefetchOnForeground(fetchTasks);

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

  useRefetchOnForeground(fetchMoments);

  return { moments, loading, refetch: fetchMoments, removeMoment };
}
