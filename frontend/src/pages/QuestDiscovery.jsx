import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate, useSearchParams } from 'react-router-dom';
import api from '../services/api';
import {
  MagnifyingGlassIcon,
  PlusIcon,
  XMarkIcon
} from '@heroicons/react/24/outline';
import logger from '../utils/logger';

// Components
import QuestCard from '../components/quest/QuestCard';
import CreateQuestModal from '../components/CreateQuestModal';
import { SkeletonCard } from '../components/ui/Skeleton';
import EmptyState from '../components/ui/EmptyState';
import GlassTabBar from '../components/ui/GlassTabBar';

// Sentinel id for the "no topic selected" tab
const ALL_TOPICS = '__all__';

// Topic taxonomy with subtopics
const TOPIC_TAXONOMY = {
  Creative: ['Music', 'Art', 'Design', 'Animation', 'Film', 'Writing', 'Photography', 'Crafts'],
  Science: ['Biology', 'Chemistry', 'Physics', 'Technology', 'Research', 'Astronomy', 'Environment'],
  Building: ['3D Printing', 'Engineering', 'Robotics', 'DIY', 'Woodworking', 'Electronics', 'Maker'],
  Nature: ['Gardening', 'Wildlife', 'Outdoors', 'Sustainability', 'Plants', 'Animals', 'Hiking'],
  Business: ['Entrepreneurship', 'Finance', 'Marketing', 'Leadership', 'Startups', 'Economics'],
  Personal: ['Wellness', 'Fitness', 'Mindfulness', 'Skills', 'Philosophy', 'Self-Improvement'],
  Academic: ['Reading', 'Math', 'History', 'Languages', 'Literature', 'Geography', 'Social Studies'],
  Food: ['Cooking', 'Nutrition', 'Baking', 'Culinary', 'Food Science'],
  Games: ['Board Games', 'Video Games', 'Puzzles', 'Strategy', 'Sports']
};

/**
 * QuestDiscovery - Explore and discover quests
 * Features:
 * - Compact header band: title + search + topic filters in one slim block,
 *   so quests are visible above the fold
 * - Topic-based filtering with subtopics
 * - Enhanced search (title + big_idea)
 * - "Exciting first" ordering (sort=popular: hand-curated featured quests first, then newest — see backend/utils/quest_popularity.py)
 */
const QuestDiscovery = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  // View state
  const [showCreateModal, setShowCreateModal] = useState(false);

  // Filter state
  const [searchTerm, setSearchTerm] = useState(searchParams.get('search') || '');
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState(searchTerm);
  const [selectedTopic, setSelectedTopic] = useState(searchParams.get('topic') || null);
  const [selectedSubtopic, setSelectedSubtopic] = useState(null);

  // Topics state
  const [topics, setTopics] = useState([]);
  const [topicsLoading, setTopicsLoading] = useState(true);

  // Quest state
  const [quests, setQuests] = useState([]);
  const [questsLoading, setQuestsLoading] = useState(false);
  const [questsError, setQuestsError] = useState('');
  const [questPage, setQuestPage] = useState(1);
  const [hasMoreQuests, setHasMoreQuests] = useState(true);
  const [totalQuests, setTotalQuests] = useState(0);
  const [isLoadingMoreQuests, setIsLoadingMoreQuests] = useState(false);

  // Refs
  const isLoadingRef = useRef(false);
  const observerRef = useRef(null);

  // Debounce search term
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      setDebouncedSearchTerm(searchTerm);
    }, 500);
    return () => clearTimeout(timeoutId);
  }, [searchTerm]);

  // Update URL params when filters change
  useEffect(() => {
    const params = new URLSearchParams();
    if (debouncedSearchTerm) params.set('search', debouncedSearchTerm);
    if (selectedTopic) params.set('topic', selectedTopic);
    setSearchParams(params, { replace: true });
  }, [debouncedSearchTerm, selectedTopic, setSearchParams]);

  // Fetch topic stats
  useEffect(() => {
    const fetchTopics = async () => {
      try {
        const response = await api.get('/api/quests/topics');
        if (response.data.success) {
          setTopics(response.data.topics || []);
        }
      } catch (error) {
        logger.error('Failed to fetch topics:', error);
      } finally {
        setTopicsLoading(false);
      }
    };
    fetchTopics();
  }, []);

  // Track filter version to force refetch on filter change
  const [filterVersion, setFilterVersion] = useState(0);

  // Reset pagination when filters change
  useEffect(() => {
    setQuestPage(1);
    setQuests([]);
    setHasMoreQuests(true);
    isLoadingRef.current = false;
    // Increment filter version to force refetch
    setFilterVersion(v => v + 1);
  }, [debouncedSearchTerm, selectedTopic, selectedSubtopic]);

  // Clear subtopic when topic changes
  useEffect(() => {
    setSelectedSubtopic(null);
  }, [selectedTopic]);

  // Fetch quests
  const fetchQuests = useCallback(async (pageToFetch = 1) => {
    const isInitial = pageToFetch === 1;

    if (isLoadingRef.current) return;
    isLoadingRef.current = true;

    if (isInitial) {
      setQuestsLoading(true);
      setQuests([]);
      setHasMoreQuests(true);
    } else {
      setIsLoadingMoreQuests(true);
    }

    try {
      const params = new URLSearchParams({
        page: pageToFetch,
        per_page: 12,
        // "Exciting first": backend puts the hand-curated featured quests first, then newest
        sort: 'popular',
        t: Date.now()
      });

      if (debouncedSearchTerm.trim()) {
        params.append('search', debouncedSearchTerm.trim());
      }
      if (selectedTopic) {
        params.append('topic', selectedTopic);
      }
      if (selectedSubtopic) {
        params.append('subtopic', selectedSubtopic);
      }

      const response = await api.get(`/api/quests?${params}`, {
        headers: { 'Cache-Control': 'no-cache' }
      });

      const questsData = response.data.data || [];
      const meta = response.data.meta || {};

      if (isInitial) {
        setQuests(questsData);
      } else {
        setQuests(prev => [...prev, ...questsData]);
      }

      setTotalQuests(meta.total || 0);
      setHasMoreQuests(!!response.data.links?.next);
      setQuestsError('');
    } catch (error) {
      if (error.name !== 'AbortError') {
        console.error('[QuestDiscovery] Fetch error:', error);
        setQuestsError('Failed to load quests. Please try again.');
      }
    } finally {
      isLoadingRef.current = false;
      setQuestsLoading(false);
      setIsLoadingMoreQuests(false);
    }
  }, [debouncedSearchTerm, selectedTopic, selectedSubtopic]);

  // Fetch quests when page or filter version changes
  useEffect(() => {
    if (user !== undefined && questPage > 0) {
      fetchQuests(questPage);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [questPage, user, filterVersion]);

  // Infinite scroll observer
  const lastQuestRef = useCallback(node => {
    if (observerRef.current) observerRef.current.disconnect();
    if (!node || isLoadingMoreQuests || questsLoading || !hasMoreQuests) return;

    observerRef.current = new IntersectionObserver(
      entries => {
        if (entries[0].isIntersecting && hasMoreQuests && !isLoadingRef.current) {
          setQuestPage(prev => prev + 1);
        }
      },
      { rootMargin: '200px' }
    );

    observerRef.current.observe(node);
  }, [isLoadingMoreQuests, questsLoading, hasMoreQuests]);

  // Handle topic selection from the tab rail ("All" clears the filter)
  const handleTopicSelect = (topicId) => {
    setSelectedTopic(topicId === ALL_TOPICS ? null : topicId);
  };

  // Handle subtopic selection from the tab rail ("All" clears the filter)
  const handleSubtopicSelect = (subtopicId) => {
    setSelectedSubtopic(subtopicId === ALL_TOPICS ? null : subtopicId);
  };

  // Clear all filters
  const clearFilters = () => {
    setSearchTerm('');
    setSelectedTopic(null);
    setSelectedSubtopic(null);
  };

  // Get subtopics for selected topic
  const subtopics = selectedTopic ? TOPIC_TAXONOMY[selectedTopic] || [] : [];

  // Handle quest click
  const handleQuestClick = (quest) => {
    navigate(`/quests/${quest.id}`);
  };

  // Handle quest created
  const handleQuestCreated = (quest) => {
    setShowCreateModal(false);
    navigate(`/quests/${quest.id}`);
  };

  return (
    <div className="min-h-screen bg-neutral-50">
      {/* Compact header band: title + search + filters, quests above the fold */}
      <div className="sticky top-0 z-10 bg-white border-b border-gray-200">
        {/* Slim brand gradient accent (replaces the old full-bleed hero) */}
        <div className="h-1 bg-gradient-primary" aria-hidden="true" />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3">
          {/* Row 1: title + search + count + actions */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <h1 className="text-2xl font-bold text-gray-900 whitespace-nowrap">Quests</h1>

            <div className="relative flex-1 min-w-[180px] max-w-xl">
              <MagnifyingGlassIcon className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input
                type="text"
                aria-label="Search quests"
                placeholder="Search quests..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-9 py-2 text-sm border border-gray-200 rounded-lg text-gray-900 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-optio-purple"
              />
              {searchTerm && (
                <button
                  onClick={() => setSearchTerm('')}
                  aria-label="Clear search"
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  <XMarkIcon className="h-4 w-4" />
                </button>
              )}
            </div>

            <div className="ml-auto flex items-center gap-3">
              <span className="text-sm text-gray-500 whitespace-nowrap" aria-live="polite">
                {questsLoading ? 'Loading...' : `${totalQuests} quests`}
              </span>
              {(selectedTopic || selectedSubtopic || debouncedSearchTerm) && (
                <button
                  onClick={clearFilters}
                  className="text-sm font-medium text-optio-purple hover:underline whitespace-nowrap"
                >
                  Clear filters
                </button>
              )}
              {user && (
                <button
                  onClick={() => setShowCreateModal(true)}
                  className="btn-primary"
                >
                  <PlusIcon className="h-5 w-5" />
                  <span className="hidden sm:inline">Create Quest</span>
                </button>
              )}
            </div>
          </div>

          {/* Row 2: topic filter rail (scrolls horizontally when it overflows) */}
          {!topicsLoading && topics.length > 0 && (
            <div className="mt-3">
              <GlassTabBar
                aria-label="Quest topics"
                tabs={[
                  { id: ALL_TOPICS, label: 'All' },
                  ...topics.map((topic) => ({
                    id: topic.name,
                    label: topic.name,
                    badge: topic.count
                  }))
                ]}
                active={selectedTopic || ALL_TOPICS}
                onSelect={handleTopicSelect}
              />

              {/* Row 3: subtopics, only when a topic is selected */}
              {selectedTopic && subtopics.length > 0 && (
                <div className="mt-2">
                  <GlassTabBar
                    aria-label={`${selectedTopic} subtopics`}
                    tabs={[
                      { id: ALL_TOPICS, label: `All ${selectedTopic}` },
                      ...subtopics.map((subtopic) => ({ id: subtopic, label: subtopic }))
                    ]}
                    active={selectedSubtopic || ALL_TOPICS}
                    onSelect={handleSubtopicSelect}
                  />
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Content Area */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {questsError && (
          <div className="text-center py-8 text-red-600">{questsError}</div>
        )}

        {questsLoading && quests.length === 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-6">
            {[...Array(6)].map((_, i) => (
              <SkeletonCard key={i} />
            ))}
          </div>
        ) : quests.length === 0 ? (
          <EmptyState
            plain
            icon={MagnifyingGlassIcon}
            title="No quests found"
            hint={selectedTopic || selectedSubtopic || debouncedSearchTerm
              ? 'Try adjusting your filters or search terms'
              : 'Be the first to create a quest!'}
            action={user && (
              <button
                onClick={() => setShowCreateModal(true)}
                className="btn-primary"
              >
                <PlusIcon className="h-5 w-5" />
                Create Your First Quest
              </button>
            )}
          />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-6">
            {quests.map((quest, index) => (
              <div
                key={quest.id}
                ref={index === quests.length - 1 ? lastQuestRef : null}
              >
                <QuestCard
                  quest={quest}
                  onClick={() => handleQuestClick(quest)}
                />
              </div>
            ))}

            {/* Loading more indicator */}
            {isLoadingMoreQuests && (
              <>
                {[...Array(3)].map((_, i) => (
                  <SkeletonCard key={`loading-${i}`} />
                ))}
              </>
            )}
          </div>
        )}
      </div>

      {/* Create Quest Modal */}
      {showCreateModal && (
        <CreateQuestModal
          isOpen={showCreateModal}
          onClose={() => setShowCreateModal(false)}
          onSuccess={handleQuestCreated}
        />
      )}
    </div>
  );
};

export default QuestDiscovery;
