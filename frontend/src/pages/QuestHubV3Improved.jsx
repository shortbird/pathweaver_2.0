import React, { useState, useEffect, useCallback, useRef, memo, useMemo } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate, useLocation } from 'react-router-dom';
import { handleApiResponse } from '../utils/errorHandling';
import QuestCard from '../components/quest/improved/QuestCard';
import QuestFilters from '../components/quest/improved/QuestFilters';
import TeamUpModal from '../components/quest/TeamUpModal';
import QuestSuggestionModal from '../components/QuestSuggestionModal';
import { SkeletonCard } from '../components/ui/Skeleton';
import Button from '../components/ui/Button';
import { hasFeatureAccess } from '../utils/tierMapping';

// Simple debounce utility
const debounce = (func, wait) => {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
};

const QuestHubV3Improved = () => {
  const { user, loginTimestamp } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [quests, setQuests] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [error, setError] = useState('');
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedPillar, setSelectedPillar] = useState('all');
  const [selectedSubject, setSelectedSubject] = useState('all');
  const [showTeamUpModal, setShowTeamUpModal] = useState(false);
  const [selectedQuestForTeamUp, setSelectedQuestForTeamUp] = useState(null);
  const [showQuestSuggestionModal, setShowQuestSuggestionModal] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [totalResults, setTotalResults] = useState(0);
  
  // Ref for infinite scroll with debouncing
  const observerRef = useRef();
  const isLoadingRef = useRef(false);

  // Debounced page increment to prevent rapid firing
  const debouncedPageIncrement = useCallback(
    debounce(() => {
      if (!isLoadingRef.current) {
        setPage(prevPage => prevPage + 1);
      }
    }, 100),
    []
  );

  const lastQuestElementRef = useCallback(node => {
    if (isLoadingMore || isLoading) return;
    if (observerRef.current) observerRef.current.disconnect();

    observerRef.current = new IntersectionObserver(
      entries => {
        if (entries[0].isIntersecting && hasMore && !isLoadingRef.current) {
          debouncedPageIncrement();
        }
      },
      {
        rootMargin: '100px' // Load more content when 100px away from bottom
      }
    );

    if (node) observerRef.current.observe(node);
  }, [isLoadingMore, isLoading, hasMore, debouncedPageIncrement]);

  // Create debounced search handler
  const debouncedSearch = useCallback(
    debounce((searchValue) => {
      setQuests([]);
      setPage(1);
      setHasMore(true);
      setError('');
    }, 500),
    []
  );

  // Handle search term changes with debouncing
  useEffect(() => {
    debouncedSearch(searchTerm);
    return () => {
      debouncedSearch.cancel();
    };
  }, [searchTerm, debouncedSearch]);

  // Reset and fetch when filters change (non-search)
  useEffect(() => {
    setQuests([]);
    setPage(1);
    setHasMore(true);
    setError('');
  }, [selectedPillar, selectedSubject]);

  // Main fetch effect - triggers when page changes or filters change
  useEffect(() => {
    if (user !== undefined) { // Wait for auth to be determined
      if (page === 1) {
        fetchQuests(true);
      } else {
        fetchQuests(false);
      }
    }
  }, [page, selectedPillar, selectedSubject, user, loginTimestamp]);

  // Separate effect for search changes
  useEffect(() => {
    if (user !== undefined && page === 1) {
      fetchQuests(true);
    }
  }, [searchTerm]);

  // Reset on location change (when returning to quest hub)
  useEffect(() => {
    if (location.pathname === '/quests' && hasLoadedOnce) {
      setQuests([]);
      setPage(1);
      setHasMore(true);
      setError('');
    }
  }, [location.pathname, hasLoadedOnce]);

  const fetchQuests = useCallback(async (isInitial = true) => {
    // Prevent concurrent requests
    if (isLoadingRef.current) return;

    isLoadingRef.current = true;

    if (isInitial) {
      setIsLoading(true);
    } else {
      setIsLoadingMore(true);
    }
    setError('');

    try {
      const params = new URLSearchParams({
        page,
        per_page: 12,
        ...(searchTerm && { search: searchTerm }),
        ...(selectedPillar !== 'all' && { pillar: selectedPillar }),
        ...(selectedSubject !== 'all' && { subject: selectedSubject }),
        t: Date.now() // Cache-busting parameter
      });

      const apiBase = import.meta.env.VITE_API_URL || '';
      const response = await fetch(`${apiBase}/api/v3/quests?${params}`, {
        headers: user ? {
          'Authorization': `Bearer ${localStorage.getItem('access_token')}`
        } : {},
        cache: 'no-cache' // Ensure fresh data
      });

      if (!response.ok) {
        throw new Error('Unable to load quests at this time. Please check your internet connection and try again.');
      }

      const data = await response.json();
      
      if (isInitial) {
        setQuests(data.quests || []);
        setHasLoadedOnce(true);
      } else {
        setQuests(prev => [...prev, ...(data.quests || [])]);
      }
      
      setTotalResults(data.total || 0);
      setHasMore(data.has_more === true);
    } catch (error) {
      const errorMsg = error.response?.status === 500 
        ? 'Our servers are temporarily unavailable. Please try again in a few moments.'
        : error.response?.status === 404
        ? 'No quests found. Check back later for new adventures!'
        : 'Unable to load quests at this time. Please check your connection and refresh the page.'
      
      // Only show error if we're not loading for the first time or if we've loaded before
      if (!isInitial || hasLoadedOnce) {
        setError(errorMsg);
      }
    } finally {
      isLoadingRef.current = false;
      setIsLoading(false);
      setIsLoadingMore(false);
      if (isInitial) {
        setHasLoadedOnce(true);
      }
    }
  }, [page, searchTerm, selectedPillar, selectedSubject, user]);

  const handleEnroll = useCallback(async (questId) => {
    if (!user) {
      window.location.href = '/login';
      return;
    }

    try {
      const apiBase = import.meta.env.VITE_API_URL || '';
      const response = await fetch(`${apiBase}/api/v3/quests/${questId}/enroll`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('access_token')}`,
          'Content-Type': 'application/json'
        }
      });

      const data = await response.json();
      handleApiResponse(response, data, 'Failed to enroll');

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

  // Featured quests section - memoized to prevent unnecessary re-renders
  const featuredQuests = useMemo(() => quests.slice(0, 3), [quests]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-white">
      <div className="max-w-7xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-8 flex justify-between items-start">
          <div>
            <h1 className="text-5xl font-bold bg-gradient-to-r from-[#6d469b] to-[#ef597b] bg-clip-text text-transparent mb-3">
              Quest Hub
            </h1>
            <p className="text-gray-600 text-lg">
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

        {/* Featured Section - Only show when not searching */}
        {!searchTerm && selectedPillar === 'all' && featuredQuests.length > 0 && (
          <div className="mb-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">Featured Quests</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
              {featuredQuests.map(quest => (
                <div key={quest.id} className="relative">
                  <div className="absolute -top-2 -right-2 z-10 bg-gradient-to-r from-[#ef597b] to-[#6d469b] text-white text-xs font-bold px-3 py-1 rounded-full shadow-lg">
                    FEATURED
                  </div>
                  <QuestCard
                    quest={quest}
                    onEnroll={handleEnroll}
                    onTeamUp={handleTeamUp}
                  />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Filters */}
        <QuestFilters
          searchTerm={searchTerm}
          onSearchChange={setSearchTerm}
          selectedPillar={selectedPillar}
          onPillarChange={setSelectedPillar}
          selectedSubject={selectedSubject}
          onSubjectChange={setSelectedSubject}
          totalResults={totalResults}
        />

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
            <Button
              variant="outline"
              onClick={() => {
                setSearchTerm('');
                setSelectedPillar('all');
              }}
            >
              Clear Filters
            </Button>
          </div>
        ) : (
          <>
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

export default memo(QuestHubV3Improved);