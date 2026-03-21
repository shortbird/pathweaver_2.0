/**
 * Quest hooks - discovery, detail, and enrollment.
 */

import { useEffect, useState, useCallback } from 'react';
import api from '../services/api';
import { useAuthStore } from '../stores/authStore';

export interface Quest {
  id: string;
  title: string;
  description: string;
  big_idea: string;
  image_url: string | null;
  header_image_url: string | null;
  pillar: string;
  xp_required: number;
  is_active: boolean;
  is_public: boolean;
  allow_custom_tasks: boolean;
  enrollmentCount?: number;
  completedCount?: number;
}

export interface QuestTopic {
  name: string;
  count: number;
}

export function useQuestDiscovery() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const [quests, setQuests] = useState<Quest[]>([]);
  const [topics, setTopics] = useState<QuestTopic[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedTopic, setSelectedTopic] = useState<string | null>(null);

  const fetchQuests = useCallback(async () => {
    if (!isAuthenticated) return;
    try {
      setLoading(true);
      const params: Record<string, string> = {};
      if (search) params.search = search;
      if (selectedTopic) params.topic = selectedTopic;
      const { data } = await api.get('/api/quests', { params });
      setQuests(data.quests || data.data || data || []);
    } catch {
      // Non-critical
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated, search, selectedTopic]);

  const fetchTopics = useCallback(async () => {
    if (!isAuthenticated) return;
    try {
      const { data } = await api.get('/api/quests/topics');
      setTopics(data.topics || data || []);
    } catch {
      // Non-critical
    }
  }, [isAuthenticated]);

  useEffect(() => { fetchTopics(); }, [fetchTopics]);
  useEffect(() => { fetchQuests(); }, [fetchQuests]);

  return { quests, topics, loading, search, setSearch, selectedTopic, setSelectedTopic, refetch: fetchQuests };
}

export function useQuestDetail(questId: string | null) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const [quest, setQuest] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isAuthenticated || !questId) { setLoading(false); return; }
    (async () => {
      try {
        setLoading(true);
        const { data } = await api.get(`/api/quests/${questId}`);
        setQuest(data.quest || data);
      } catch {
        // Non-critical
      } finally {
        setLoading(false);
      }
    })();
  }, [isAuthenticated, questId]);

  return { quest, loading };
}
