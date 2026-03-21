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
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [selectedTopic, setSelectedTopic] = useState<string | null>(null);
  const PAGE_SIZE = 12;

  const fetchQuests = useCallback(async (pageNum = 1, append = false) => {
    if (!isAuthenticated) return;
    try {
      if (append) setLoadingMore(true); else setLoading(true);
      const params: Record<string, string | number> = { page: pageNum, per_page: PAGE_SIZE };
      if (search) params.search = search;
      if (selectedTopic) params.topic = selectedTopic;
      const { data } = await api.get('/api/quests', { params });
      const newQuests = data.data || data.quests || data || [];
      const totalPages = data.meta?.pages || 1;
      if (append) {
        // Deduplicate by ID
        setQuests((prev) => {
          const existingIds = new Set(prev.map((q) => q.id));
          const unique = newQuests.filter((q: Quest) => !existingIds.has(q.id));
          return [...prev, ...unique];
        });
      } else {
        setQuests(newQuests);
      }
      setHasMore(pageNum < totalPages);
      setPage(pageNum);
    } catch {
      // Non-critical
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [isAuthenticated, search, selectedTopic]);

  const loadMore = useCallback(() => {
    if (!loadingMore && hasMore) {
      fetchQuests(page + 1, true);
    }
  }, [fetchQuests, page, loadingMore, hasMore]);

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
  useEffect(() => { fetchQuests(1, false); }, [fetchQuests]);

  return { quests, topics, loading, loadingMore, hasMore, search, setSearch, selectedTopic, setSelectedTopic, loadMore, refetch: () => fetchQuests(1, false) };
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
