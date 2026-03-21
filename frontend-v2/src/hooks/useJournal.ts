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
  type: 'topic' | 'quest' | 'course';
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
