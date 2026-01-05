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

// Topic colors for styling
const TOPIC_COLORS = {
  Creative: { bg: 'bg-purple-500', hover: 'hover:bg-purple-600', light: 'bg-purple-100 text-purple-800' },
  Science: { bg: 'bg-blue-500', hover: 'hover:bg-blue-600', light: 'bg-blue-100 text-blue-800' },
  Building: { bg: 'bg-orange-500', hover: 'hover:bg-orange-600', light: 'bg-orange-100 text-orange-800' },
  Nature: { bg: 'bg-green-500', hover: 'hover:bg-green-600', light: 'bg-green-100 text-green-800' },
  Business: { bg: 'bg-slate-500', hover: 'hover:bg-slate-600', light: 'bg-slate-100 text-slate-800' },
  Personal: { bg: 'bg-pink-500', hover: 'hover:bg-pink-600', light: 'bg-pink-100 text-pink-800' },
  Academic: { bg: 'bg-indigo-500', hover: 'hover:bg-indigo-600', light: 'bg-indigo-100 text-indigo-800' },
  Food: { bg: 'bg-amber-500', hover: 'hover:bg-amber-600', light: 'bg-amber-100 text-amber-800' },
  Games: { bg: 'bg-cyan-500', hover: 'hover:bg-cyan-600', light: 'bg-cyan-100 text-cyan-800' }
};

/**
 * QuestDiscovery - Explore and discover quests
 * Features:
 * - Topic-based filtering with subtopics
 * - Enhanced search (title + big_idea)
 * - Pyramid layout for topic chips
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

  // Handle topic click
  const handleTopicClick = (topicName) => {
    if (selectedTopic === topicName) {
      setSelectedTopic(null);
    } else {
      setSelectedTopic(topicName);
    }
  };

  // Handle subtopic click
  const handleSubtopicClick = (subtopicName) => {
    if (selectedSubtopic === subtopicName) {
      setSelectedSubtopic(null);
    } else {
      setSelectedSubtopic(subtopicName);
    }
  };

  // Clear all filters
  const clearFilters = () => {
    setSearchTerm('');
    setSelectedTopic(null);
    setSelectedSubtopic(null);
  };

  // Get subtopics for selected topic
  const subtopics = selectedTopic ? TOPIC_TAXONOMY[selectedTopic] || [] : [];
  const topicColors = selectedTopic ? TOPIC_COLORS[selectedTopic] : null;

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
    <div className="min-h-screen bg-gray-50">
      {/* Hero Section */}
      <div className="bg-gradient-to-br from-optio-purple to-optio-pink text-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          <div className="text-center mb-8">
            <h1 className="text-4xl font-bold mb-3">
              Discover Your Next Adventure
            </h1>
            <p className="text-lg text-white/80 max-w-2xl mx-auto">
              Explore quests that match your interests and start your learning journey
            </p>
          </div>

          {/* Search Bar */}
          <div className="max-w-2xl mx-auto mb-8">
            <div className="relative">
              <MagnifyingGlassIcon className="absolute left-4 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
              <input
                type="text"
                placeholder="Search quests..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-12 pr-12 py-4 rounded-xl text-gray-900 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-white/50 shadow-lg"
              />
              {searchTerm && (
                <button
                  onClick={() => setSearchTerm('')}
                  className="absolute right-4 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  <XMarkIcon className="h-5 w-5" />
                </button>
              )}
            </div>
          </div>

          {/* Topic Chips - Dynamic responsive layout */}
          {!topicsLoading && topics.length > 0 && (
            <div className="max-w-5xl mx-auto">
              {/* All topics in a single flex container for natural wrapping */}
              <div className="flex flex-wrap justify-center gap-2 sm:gap-3">
                {topics.map((topic) => (
                  <button
                    key={topic.name}
                    onClick={() => handleTopicClick(topic.name)}
                    className={`
                      px-3 py-1.5 sm:px-4 sm:py-2 rounded-full text-xs sm:text-sm font-medium transition-all whitespace-nowrap
                      ${selectedTopic === topic.name
                        ? 'bg-white text-gray-900 shadow-lg scale-105'
                        : 'bg-white/20 text-white hover:bg-white/30'
                      }
                    `}
                  >
                    {topic.name}
                    <span className="ml-1 opacity-70">({topic.count})</span>
                  </button>
                ))}
              </div>

              {/* Subtopics - shown when a topic is selected */}
              {selectedTopic && subtopics.length > 0 && (
                <div className="mt-4 pt-4 border-t border-white/20">
                  <div className="flex items-center justify-center mb-3">
                    <span className="text-white/70 text-sm">Filter by:</span>
                  </div>
                  <div className="flex flex-wrap justify-center gap-2">
                    {subtopics.map((subtopic) => (
                      <button
                        key={subtopic}
                        onClick={() => handleSubtopicClick(subtopic)}
                        className={`
                          px-2.5 py-1 sm:px-3 sm:py-1.5 rounded-full text-xs font-medium transition-all whitespace-nowrap
                          ${selectedSubtopic === subtopic
                            ? 'bg-white text-gray-900 shadow-md'
                            : 'bg-white/10 text-white/90 hover:bg-white/20 border border-white/30'
                          }
                        `}
                      >
                        {subtopic}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Action Bar */}
      <div className="bg-white border-b sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            {/* Results count and filters */}
            <div className="flex items-center gap-4">
              <span className="text-gray-600">
                {questsLoading ? 'Loading...' : `${totalQuests} quests`}
              </span>
              {(selectedTopic || selectedSubtopic || debouncedSearchTerm) && (
                <button
                  onClick={clearFilters}
                  className="text-sm text-optio-purple hover:text-optio-pink"
                >
                  Clear filters
                </button>
              )}
            </div>

            {/* Create Quest Button */}
            {user && (
              <button
                onClick={() => setShowCreateModal(true)}
                className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-optio-purple to-optio-pink text-white rounded-lg hover:opacity-90 transition-opacity"
              >
                <PlusIcon className="h-5 w-5" />
                <span className="hidden sm:inline">Create Quest</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Content Area */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {questsError && (
          <div className="text-center py-8 text-red-600">{questsError}</div>
        )}

        {questsLoading && quests.length === 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {[...Array(6)].map((_, i) => (
              <SkeletonCard key={i} />
            ))}
          </div>
        ) : quests.length === 0 ? (
          <div className="text-center py-16">
            <div className="text-gray-400 mb-4">
              <MagnifyingGlassIcon className="h-16 w-16 mx-auto" />
            </div>
            <h3 className="text-xl font-medium text-gray-600 mb-2">
              No quests found
            </h3>
            <p className="text-gray-500 mb-6">
              {selectedTopic || selectedSubtopic || debouncedSearchTerm
                ? 'Try adjusting your filters or search terms'
                : 'Be the first to create a quest!'}
            </p>
            {user && (
              <button
                onClick={() => setShowCreateModal(true)}
                className="inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-optio-purple to-optio-pink text-white rounded-lg hover:opacity-90"
              >
                <PlusIcon className="h-5 w-5" />
                Create Your First Quest
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
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
