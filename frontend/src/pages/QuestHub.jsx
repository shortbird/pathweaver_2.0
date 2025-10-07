import React, { useState, useEffect, useCallback, useRef, memo, useMemo } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate, useLocation } from 'react-router-dom';
import api from '../services/api';
import { handleApiResponse } from '../utils/errorHandling';
import { useIsMounted, useObserver, useDebounceWithCleanup, useSafeAsync } from '../hooks/useMemoryLeakFix';
import QuestCard from '../components/quest/improved/QuestCard';
import QuestListItem from '../components/quest/improved/QuestListItem';
import QuestFilters from '../components/quest/improved/QuestFilters';
import TeamUpModal from '../components/quest/TeamUpModal';
import QuestSuggestionModal from '../components/QuestSuggestionModal';
import { SkeletonCard } from '../components/ui/Skeleton';
import Button from '../components/ui/Button';
import { hasFeatureAccess } from '../utils/tierMapping';

// Debounce utility with cancel method
const debounce = (func, wait) => {
  let timeout;
  const executedFunction = function(...args) {
    const later = () => {
      clearTimeout(timeout);
      timeout = null;
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };

  executedFunction.cancel = function() {
    clearTimeout(timeout);
    timeout = null;
  };

  return executedFunction;
};

const QuestHub = () => {
  const { user, loginTimestamp } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [quests, setQuests] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [error, setError] = useState('');
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
  const [showTeamUpModal, setShowTeamUpModal] = useState(false);
  const [selectedQuestForTeamUp, setSelectedQuestForTeamUp] = useState(null);
  const [showQuestSuggestionModal, setShowQuestSuggestionModal] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [totalResults, setTotalResults] = useState(0);

  // Filter state
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState('newest');
  const [viewMode, setViewMode] = useState('grid');

  // Memory leak prevention hooks
  const isMounted = useIsMounted();
  const safeAsync = useSafeAsync();
  const isLoadingRef = useRef(false);

  // Memory-safe debounced page increment
  const { debouncedFn: debouncedPageIncrement } = useDebounceWithCleanup(() => {
    if (!isLoadingRef.current && isMounted()) {
      setPage(prevPage => prevPage + 1);
    }
  }, 100);

  // Debounced search function
  const { debouncedFn: debouncedSearch } = useDebounceWithCleanup(() => {
    if (isMounted()) {
      setPage(1);
      setQuests([]);
      setHasMore(true);
    }
  }, 300);

  // Memory-safe intersection observer
  const setupObserver = useObserver((node) => {
    return new IntersectionObserver(
      entries => {
        if (entries[0].isIntersecting && hasMore && !isLoadingRef.current && isMounted()) {
          debouncedPageIncrement();
        }
      },
      {
        rootMargin: '100px' // Load more content when 100px away from bottom
      }
    );
  });

  const lastQuestElementRef = useCallback(node => {
    if (isLoadingMore || isLoading || !node) return;

    const observer = setupObserver(node);
    observer.observe(node);
  }, [isLoadingMore, isLoading, hasMore, debouncedPageIncrement, setupObserver]);

  // Memory-safe data fetching effect
  useEffect(() => {
    // Skip if user auth not determined yet
    if (user === undefined) return;

    // Create abort-safe fetch function
    const fetchData = async (isInitial = true, targetPage = page) => {
      if (isLoadingRef.current) return;

      isLoadingRef.current = true;

      // Only update state if component is still mounted
      if (!isMounted()) return;

      if (isInitial) {
        setIsLoading(true);
        setQuests([]);
        setPage(1);
        setHasMore(true);
        setError('');
      } else {
        setIsLoadingMore(true);
      }

      const result = await safeAsync(async (signal) => {
        const params = new URLSearchParams({
          page: targetPage,
          per_page: 12,
          t: Date.now()
        });

        // Add filter parameters
        if (searchTerm.trim()) {
          params.append('search', searchTerm.trim());
        }
        if (sortBy) {
          params.append('sort', sortBy);
        }

        const response = await api.get(`/api/quests?${params}`, {
          headers: {
            'Cache-Control': 'no-cache'
          },
          signal // Add abort signal for cancellation
        });

        // DEBUG: Log first quest to see pillar_breakdown data
        if (response.data?.quests?.length > 0) {
            title: response.data.quests[0].title,
            pillar_breakdown: response.data.quests[0].pillar_breakdown,
            user_enrollment: response.data.quests[0].user_enrollment,
            completed_enrollment: response.data.quests[0].completed_enrollment
          });
        }

        return response.data;
      });

      // Only process result if component is still mounted and operation wasn't aborted
      if (result.success && isMounted()) {
        const data = result.data;

        if (isInitial) {
          setQuests(data.quests || []);
          setHasLoadedOnce(true);
        } else {
          setQuests(prev => [...prev, ...(data.quests || [])]);
        }

        setTotalResults(data.total || 0);
        setHasMore(data.has_more === true);
      } else if (result.error && !result.aborted && isMounted()) {
        const errorMsg = 'Unable to load quests at this time. Please check your connection and refresh the page.';
        if (!isInitial || hasLoadedOnce) {
          setError(errorMsg);
        }
      }

      // Cleanup loading state if component is still mounted
      if (isMounted()) {
        isLoadingRef.current = false;
        setIsLoading(false);
        setIsLoadingMore(false);
        if (isInitial) {
          setHasLoadedOnce(true);
        }
      }
    };

    // Handle page changes (infinite scroll)
    if (page > 1) {
      fetchData(false, page);
      return;
    }

    // Handle initial load
    fetchData(true, 1);
  }, [page, user, loginTimestamp, hasLoadedOnce, isMounted, safeAsync, searchTerm, sortBy]);

  // Reset on location change (when returning to quest hub)
  useEffect(() => {
    if (location.pathname === '/quests' && hasLoadedOnce) {
      setQuests([]);
      setPage(1);
      setHasMore(true);
      setError('');
    }
  }, [location.pathname, hasLoadedOnce]);


  const handleEnroll = useCallback(async (questId) => {
    if (!user) {
      window.location.href = '/login';
      return;
    }

    try {
      const response = await api.post(`/api/quests/${questId}/enroll`, {});
      const data = response.data;
      handleApiResponse({ ok: true, status: 200 }, data, 'Failed to enroll');

      // Update quest in state
      setQuests(quests.map(q => 
        q.id === questId 
          ? { ...q, user_enrollment: data.enrollment }
          : q
      ));

      // Show success toast instead of alert
      // TODO: Implement toast notification
      // Success message handled by UI feedback
    } catch (error) {
    }
  }, [quests, user]);

  const handleTeamUp = useCallback((quest) => {
    if (!user) {
      window.location.href = '/login';
      return;
    }
    setSelectedQuestForTeamUp(quest);
    setShowTeamUpModal(true);
  }, [user]);

  const handleInviteSent = useCallback((result) => {
    // TODO: Replace with toast
    // Success message handled by UI feedback
  }, []);

  const handleQuestSuggestion = useCallback(() => {
    if (!user) {
      window.location.href = '/login';
      return;
    }
    setShowQuestSuggestionModal(true);
  }, [user]);

  const handleQuestSuggestionSuccess = useCallback(() => {
    // Optionally refresh quests or show additional feedback
  }, []);

  // Check if user can suggest quests (supported tier and above)
  const canSuggestQuests = useMemo(() => {
    if (!user) return false;
    // Use hasFeatureAccess to check if user has at least supported tier access
    return hasFeatureAccess(user.subscription_tier, 'supported');
  }, [user]);

  // Filter handlers
  const handleSearchChange = useCallback((value) => {
    setSearchTerm(value);
    debouncedSearch();
  }, [debouncedSearch]);

  const handleSortChange = useCallback((sort) => {
    setSortBy(sort);
    setPage(1);
    setQuests([]);
    setHasMore(true);
  }, []);

  const handleViewModeChange = useCallback((mode) => {
    setViewMode(mode);
  }, []);


  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-white">
      <div className="max-w-7xl mx-auto px-4 py-8">
        {/* Header - Compact */}
        <div className="mb-6 flex justify-between items-center">
          <div>
            <h1 className="text-4xl font-bold bg-gradient-to-r from-[#6d469b] to-[#ef597b] bg-clip-text text-transparent mb-2">
              Quest Hub
            </h1>
            <p className="text-gray-600">
              Choose your adventure and start earning XP!
            </p>
          </div>
          
          {/* Quest Suggestion Button - Only show for non-free tiers */}
          {canSuggestQuests && (
            <div className="flex-shrink-0">
              <button
                onClick={handleQuestSuggestion}
                className="bg-gradient-to-r from-[#ef597b] to-[#6d469b] text-white px-6 py-3 rounded-lg font-semibold hover:opacity-90 transition-opacity flex items-center gap-2 shadow-lg"
              >
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" />
                </svg>
                Suggest a Quest
              </button>
            </div>
          )}
        </div>

        {/* Quest Filters - Clean Sticky Toolbar */}
        <div className="sticky top-0 z-20 bg-white/95 backdrop-blur-sm border-b border-gray-200 mb-6 -mx-4 px-4 py-4">
          <div className="max-w-7xl mx-auto">
            <QuestFilters
              searchTerm={searchTerm}
              onSearchChange={handleSearchChange}
              sortBy={sortBy}
              onSortChange={handleSortChange}
              viewMode={viewMode}
              onViewModeChange={handleViewModeChange}
              totalResults={totalResults}
            />
          </div>
        </div>

        {/* Error Display */}
        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 flex items-center gap-3">
            <svg className="w-5 h-5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
            </svg>
            <span>{error}</span>
          </div>
        )}

        {/* Quest Grid with Infinite Scroll */}
        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[...Array(6)].map((_, i) => (
              <SkeletonCard key={i} />
            ))}
          </div>
        ) : quests.length === 0 ? (
          <div className="text-center py-16 bg-white rounded-xl border border-gray-200">
            <svg className="mx-auto h-20 w-20 text-gray-300 mb-4" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm-1-13h2v6h-2zm0 8h2v2h-2z"/>
            </svg>
            <h3 className="text-xl font-semibold text-gray-900 mb-2">No quests found</h3>
            <p className="text-gray-600 mb-6">Try adjusting your filters or check back later for new quests!</p>
          </div>
        ) : (
          <>
            {/* Quest Display - Grid or List View */}
            {viewMode === 'grid' ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {quests.map((quest, index) => {
                  // Attach ref to last element for infinite scroll
                  if (quests.length === index + 1) {
                    return (
                      <div ref={lastQuestElementRef} key={quest.id}>
                        <QuestCard
                          quest={quest}
                          onEnroll={handleEnroll}
                          onTeamUp={handleTeamUp}
                        />
                      </div>
                    );
                  } else {
                    return (
                      <QuestCard
                        key={quest.id}
                        quest={quest}
                        onEnroll={handleEnroll}
                        onTeamUp={handleTeamUp}
                      />
                    );
                  }
                })}
              </div>
            ) : (
              <div className="space-y-4">
                {quests.map((quest, index) => {
                  // Attach ref to last element for infinite scroll
                  if (quests.length === index + 1) {
                    return (
                      <div ref={lastQuestElementRef} key={quest.id}>
                        <QuestListItem
                          quest={quest}
                          onEnroll={handleEnroll}
                          onTeamUp={handleTeamUp}
                        />
                      </div>
                    );
                  } else {
                    return (
                      <QuestListItem
                        key={quest.id}
                        quest={quest}
                        onEnroll={handleEnroll}
                        onTeamUp={handleTeamUp}
                      />
                    );
                  }
                })}
              </div>
            )}

            {/* Loading More Indicator */}
            {isLoadingMore && (
              <div className="mt-8 flex justify-center">
                <div className="flex items-center gap-3 text-gray-600">
                  <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-[#6d469b]" />
                  <span>Loading more quests...</span>
                </div>
              </div>
            )}

            {/* End of Results */}
            {!hasMore && quests.length > 0 && (
              <div className="mt-8 text-center text-gray-500">
                <div className="inline-flex items-center gap-2 px-4 py-2 bg-gray-100 rounded-full">
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                  <span>You've reached the end! {totalResults} quests shown.</span>
                </div>
              </div>
            )}
          </>
        )}

        {/* Team Up Modal */}
        {showTeamUpModal && selectedQuestForTeamUp && (
          <TeamUpModal
            quest={selectedQuestForTeamUp}
            onClose={() => {
              setShowTeamUpModal(false);
              setSelectedQuestForTeamUp(null);
            }}
            onInviteSent={handleInviteSent}
          />
        )}

        {/* Quest Suggestion Modal */}
        {showQuestSuggestionModal && (
          <QuestSuggestionModal
            onClose={() => setShowQuestSuggestionModal(false)}
            onSuccess={handleQuestSuggestionSuccess}
          />
        )}
      </div>
    </div>
  );
};

export default memo(QuestHub);