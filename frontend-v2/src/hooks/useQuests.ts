/**
 * Quest hooks - discovery, detail, and enrollment.
 */

import { useEffect, useState, useCallback, useRef } from 'react';
import { Platform } from 'react-native';
import api from '../services/api';
import { useAuthStore } from '../stores/authStore';

// Read/write URL search params on web for persistence
function getWebParam(key: string): string | null {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return null;
  return new URLSearchParams(window.location.search).get(key);
}

function setWebParams(params: Record<string, string | null>) {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return;
  const url = new URL(window.location.href);
  for (const [k, v] of Object.entries(params)) {
    if (v) url.searchParams.set(k, v);
    else url.searchParams.delete(k);
  }
  window.history.replaceState({}, '', url.toString());
}

export interface Quest {
  id: string;
  title: string;
  description: string;
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

// Topic taxonomy with subtopics (matches v1 QuestDiscovery)
export const TOPIC_TAXONOMY: Record<string, string[]> = {
  Creative: ['Music', 'Art', 'Design', 'Animation', 'Film', 'Writing', 'Photography', 'Crafts'],
  Science: ['Biology', 'Chemistry', 'Physics', 'Technology', 'Research', 'Astronomy', 'Environment'],
  Building: ['3D Printing', 'Engineering', 'Robotics', 'DIY', 'Woodworking', 'Electronics', 'Maker'],
  Nature: ['Gardening', 'Wildlife', 'Outdoors', 'Sustainability', 'Plants', 'Animals', 'Hiking'],
  Business: ['Entrepreneurship', 'Finance', 'Marketing', 'Leadership', 'Startups', 'Economics'],
  Personal: ['Wellness', 'Fitness', 'Mindfulness', 'Skills', 'Philosophy', 'Self-Improvement'],
  Academic: ['Reading', 'Math', 'History', 'Languages', 'Literature', 'Geography', 'Social Studies'],
  Food: ['Cooking', 'Baking', 'Nutrition', 'Food Science', 'Fermentation', 'World Cuisine'],
  Games: ['Board Games', 'Video Games', 'Game Design', 'Puzzles', 'Strategy', 'Esports'],
};

export function useQuestDiscovery() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const [quests, setQuests] = useState<Quest[]>([]);
  const [topics, setTopics] = useState<QuestTopic[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [page, setPage] = useState(1);
  const [search, setSearchRaw] = useState(getWebParam('search') || '');
  const [debouncedSearch, setDebouncedSearch] = useState(getWebParam('search') || '');
  const [selectedTopic, setSelectedTopicRaw] = useState<string | null>(getWebParam('topic'));
  const [selectedSubtopic, setSelectedSubtopicRaw] = useState<string | null>(getWebParam('subtopic'));

  // Wrap setters to sync URL params
  const setSearch = useCallback((v: string) => { setSearchRaw(v); setWebParams({ search: v || null }); }, []);
  const setSelectedTopic = useCallback((v: string | null) => { setSelectedTopicRaw(v); setWebParams({ topic: v, subtopic: null }); }, []);
  const setSelectedSubtopic = useCallback((v: string | null) => { setSelectedSubtopicRaw(v); setWebParams({ subtopic: v }); }, []);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const PAGE_SIZE = 12;

  // Debounce search input by 500ms
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setDebouncedSearch(search), 500);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [search]);

  // Clear subtopic when topic changes
  useEffect(() => {
    setSelectedSubtopic(null);
  }, [selectedTopic]);

  const fetchQuests = useCallback(async (pageNum = 1, append = false) => {
    if (!isAuthenticated) return;
    try {
      if (append) setLoadingMore(true); else setLoading(true);
      const params: Record<string, string | number> = { page: pageNum, per_page: PAGE_SIZE };
      if (debouncedSearch) params.search = debouncedSearch;
      if (selectedTopic) params.topic = selectedTopic;
      if (selectedSubtopic) params.subtopic = selectedSubtopic;
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
  }, [isAuthenticated, debouncedSearch, selectedTopic, selectedSubtopic]);

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

  // Derive subtopics from selected topic
  const subtopics = selectedTopic ? TOPIC_TAXONOMY[selectedTopic] || [] : [];

  return { quests, topics, loading, loadingMore, hasMore, search, setSearch, selectedTopic, setSelectedTopic, selectedSubtopic, setSelectedSubtopic, subtopics, loadMore, refetch: () => fetchQuests(1, false) };
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
