import React, { useState, useEffect, useCallback, useRef, memo } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate, useLocation } from 'react-router-dom';
import api from '../services/api';
import { InformationCircleIcon } from '@heroicons/react/24/outline';
import logger from '../utils/logger';

// Import hub components
import TabToggle from '../components/hub/TabToggle';
import HubSearch from '../components/hub/HubSearch';
import BadgeCarousel from '../components/hub/BadgeCarousel';
import QuestBadgeInfoModal from '../components/hub/QuestBadgeInfoModal';

// Import existing quest components
import QuestCardSimple from '../components/quest/QuestCardSimple';
// import TeamUpModal from '../components/quest/TeamUpModal'; // REMOVED - Phase 3 refactoring (January 2025)
import CreateQuestModal from '../components/CreateQuestModal';
import { SkeletonCard } from '../components/ui/Skeleton';

/**
 * QuestBadgeHub - Unified Hub for Badges and Quests
 * Combines the badge explorer and quest hub into a single, cohesive interface
 * Features:
 * - Tab toggle between BADGES and QUESTS views
 * - Search across both badges and quests
 * - Horizontal scrolling badge carousels by pillar
 * - Infinite scroll quest grid
 */
const QuestBadgeHub = () => {
  const { user, loginTimestamp } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  // View state - BADGES DISABLED, always show quests
  const [activeTab, setActiveTab] = useState(() => {
    // BADGES FEATURE DISABLED - Feature under redesign
    // Always return 'quests' regardless of route
    return 'quests';
    /* DISABLED - Badge route handling
    if (location.pathname.startsWith('/badges')) {
      return 'badges';
    }
    if (location.pathname.startsWith('/quests')) {
      return 'quests';
    }
    return localStorage.getItem('hub_active_tab') || 'quests';
    */
  });

  // Filter state
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState('');

  // BADGES DISABLED - Badge state commented out
  /* DISABLED - Badge state
  const [badgesByPillar, setBadgesByPillar] = useState({});
  const [badgesLoading, setBadgesLoading] = useState(false);
  const [badgesError, setBadgesError] = useState('');
  */

  // Quest state
  const [quests, setQuests] = useState([]);
  const [questsLoading, setQuestsLoading] = useState(false);
  const [questsError, setQuestsError] = useState('');
  const [questPage, setQuestPage] = useState(1);
  const [hasMoreQuests, setHasMoreQuests] = useState(true);
  const [totalQuests, setTotalQuests] = useState(0);
  const [isLoadingMoreQuests, setIsLoadingMoreQuests] = useState(false);

  // Modal state
  // const [showTeamUpModal, setShowTeamUpModal] = useState(false); // REMOVED - Phase 3 refactoring (January 2025)
  // const [selectedQuestForTeamUp, setSelectedQuestForTeamUp] = useState(null); // REMOVED - Phase 3 refactoring (January 2025)
  const [showCreateQuestModal, setShowCreateQuestModal] = useState(false);
  const [showInfoModal, setShowInfoModal] = useState(false);

  // Refs for loading state and infinite scroll
  const isLoadingRef = useRef(false);

  // Scroll to top when switching tabs (route-based scroll handled globally by ScrollToTop component)
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [activeTab]);

  // Save tab selection to localStorage
  useEffect(() => {
    localStorage.setItem('hub_active_tab', activeTab);
  }, [activeTab]);

  // Debounce search term to prevent API calls on every keystroke (500ms delay)
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      setDebouncedSearchTerm(searchTerm);
    }, 500);

    return () => clearTimeout(timeoutId);
  }, [searchTerm]);

  // BADGES DISABLED - Badge fetching commented out
  /* DISABLED - Fetch badges when in badges tab
  useEffect(() => {
    if (activeTab === 'badges' && user !== undefined) {
      fetchBadges();
    }
  }, [activeTab, debouncedSearchTerm, user, loginTimestamp]);
  */

  // Reset quest pagination when filters change (must run before fetch)
  useEffect(() => {
    if (activeTab === 'quests') {
      setQuestPage(1);
      setQuests([]);
      setHasMoreQuests(true);
      isLoadingRef.current = false; // Reset loading ref
    }
  }, [debouncedSearchTerm]);

  // BADGES DISABLED - fetchBadges function commented out
  /* DISABLED - Fetch badges from API
  const fetchBadges = useCallback(async () => {
    if (badgesLoading) return;

    setBadgesLoading(true);
    setBadgesError('');

    const result = await safeAsync(async (signal) => {
      const params = new URLSearchParams();
      if (debouncedSearchTerm.trim()) {
        params.append('search', debouncedSearchTerm.trim());
      }

      const response = await api.get(`/api/hub/badges?${params}`, {
        signal,
        headers: { 'Cache-Control': 'no-cache' }
      });

      return response.data;
    });

    if (result.success && isMounted()) {
      setBadgesByPillar(result.data.badges_by_pillar || {});
    } else if (result.error && !result.aborted && isMounted()) {
      setBadgesError('Failed to load badges. Please try again.');
    }

    if (isMounted()) {
      setBadgesLoading(false);
    }
  }, [badgesLoading, debouncedSearchTerm, safeAsync, isMounted]);
  */

  // Fetch quests from API - memoized to prevent recreation
  const fetchQuests = useCallback(async (pageToFetch = 1) => {
    const isInitial = pageToFetch === 1;

    if (isLoadingRef.current) {
      logger.debug('[HUB] Fetch blocked - already loading');
      return;
    }

    logger.debug(`[HUB] fetchQuests called - page: ${pageToFetch}`);
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

      logger.debug(`[HUB] Fetching: /api/quests?${params}`);
      const response = await api.get(`/api/quests?${params}`, {
        headers: { 'Cache-Control': 'no-cache' }
      });

      const responseData = response.data;
      logger.debug(`[HUB] Response:`, responseData);

      // API v1 format: {data: [...], meta: {...}, links: {...}}
      const questsData = responseData.data || [];
      const meta = responseData.meta || {};

      logger.debug(`[HUB] Success - Got ${questsData.length} quests, total: ${meta.total}`);

      if (isInitial) {
        setQuests(questsData);
      } else {
        setQuests(prev => [...prev, ...questsData]);
      }

      setTotalQuests(meta.total || 0);
      setHasMoreQuests(!!responseData.links?.next);
      setQuestsError('');
    } catch (error) {
      if (error.name !== 'AbortError') {
        console.error('[HUB] Quest fetch error:', error);
        setQuestsError('Failed to load quests. Please try again.');
      }
    } finally {
      isLoadingRef.current = false;
      setQuestsLoading(false);
      setIsLoadingMoreQuests(false);
    }
  }, [debouncedSearchTerm]);

  // Fetch quests when in quests tab
  useEffect(() => {
    if (activeTab === 'quests' && user !== undefined && questPage > 0) {
      logger.debug(`[HUB] Fetching page ${questPage}...`);
      fetchQuests(questPage);
    }
  }, [activeTab, questPage, user, loginTimestamp, debouncedSearchTerm, fetchQuests]);

  // Intersection observer ref for cleanup
  const observerRef = useRef(null);

  // Callback ref for infinite scroll - attaches to last quest element
  const lastQuestElementRef = useCallback(node => {
    // Cleanup previous observer
    if (observerRef.current) {
      observerRef.current.disconnect();
    }

    if (!node || isLoadingMoreQuests || questsLoading || !hasMoreQuests) {
      return;
    }

    // Create new observer
    observerRef.current = new IntersectionObserver(
      entries => {
        if (entries[0].isIntersecting && hasMoreQuests && !isLoadingRef.current) {
          logger.debug(`[HUB] Infinite scroll triggered - loading page ${questPage + 1}`);
          setQuestPage(prevPage => prevPage + 1);
        }
      },
      { rootMargin: '200px' }
    );

    observerRef.current.observe(node);
  }, [isLoadingMoreQuests, questsLoading, hasMoreQuests, questPage]);

  // Quest action handlers
  const handleEnroll = useCallback(async (questId) => {
    if (!user) {
      window.location.href = '/login';
      return;
    }

    try {
      const response = await api.post(`/api/quests/${questId}/enroll`, {});
      const data = response.data;

      setQuests(quests.map(q =>
        q.id === questId
          ? { ...q, user_enrollment: data.enrollment }
          : q
      ));
    } catch (error) {
      console.error('Enrollment error:', error);
    }
  }, [quests, user]);

  // Team-up handler removed - Phase 3 refactoring (January 2025)
  // const handleTeamUp = useCallback((quest) => { ... }, [user]);

  const handleCreateQuest = useCallback(() => {
    if (!user) {
      window.location.href = '/login';
      return;
    }
    setShowCreateQuestModal(true);
  }, [user]);

  const handleCreateQuestSuccess = useCallback((newQuest) => {
    // Refresh quests list to show the newly created quest
    setQuests([]);
    setQuestPage(0); // Set to 0 first
    setTimeout(() => setQuestPage(1), 0); // Then back to 1 to trigger refetch
  }, []);

  // All features are now free for all users (Phase 2 refactoring - January 2025)
  const canCreateQuests = !!user;

  // BADGES DISABLED - renderBadgesView function commented out
  /* DISABLED - Render helpers for badges
  const renderBadgesView = () => {
    if (badgesLoading) {
      return (
        <div className="flex items-center justify-center py-16">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-optio-purple" />
        </div>
      );
    }

    if (badgesError) {
      return (
        <div className="text-center py-12 text-red-600">
          {badgesError}
        </div>
      );
    }

    const pillarsToShow = Object.keys(badgesByPillar);
    const hasBadges = pillarsToShow.some(pillar => badgesByPillar[pillar]?.length > 0);

    if (!hasBadges) {
      return (
        <div className="text-center py-16">
          <p className="text-gray-500 text-lg">
            No badges found matching your criteria.
          </p>
        </div>
      );
    }

    return (
      <div className="space-y-8">
        {pillarsToShow.map((pillar) => {
          const badges = badgesByPillar[pillar];
          if (!badges || badges.length === 0) return null;

          return (
            <BadgeCarousel
              key={pillar}
              pillar={pillar}
              badges={badges}
            />
          );
        })}
      </div>
    );
  };
  */

  const renderQuestsView = () => {
    if (questsLoading) {
      return (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[...Array(6)].map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      );
    }

    if (questsError) {
      return (
        <div className="text-center py-12 text-red-600">
          {questsError}
        </div>
      );
    }

    if (quests.length === 0) {
      return (
        <div className="text-center py-16 bg-white rounded-xl border border-gray-200">
          <svg className="mx-auto h-20 w-20 text-gray-300 mb-4" fill="currentColor" viewBox="0 0 24 24">
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm-1-13h2v6h-2zm0 8h2v2h-2z"/>
          </svg>
          <h3 className="text-xl font-semibold text-gray-900 mb-2">No quests found</h3>
          <p className="text-gray-600">Try adjusting your filters or check back later for new quests!</p>
        </div>
      );
    }

    return (
      <>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {quests.map((quest, index) => {
            if (quests.length === index + 1) {
              return (
                <div ref={lastQuestElementRef} key={quest.id}>
                  <QuestCardSimple quest={quest} />
                </div>
              );
            } else {
              return (
                <QuestCardSimple key={quest.id} quest={quest} />
              );
            }
          })}
        </div>

        {/* Loading more indicator */}
        {isLoadingMoreQuests && (
          <div className="mt-8 flex justify-center">
            <div className="flex items-center gap-3 text-gray-600">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-optio-purple" />
              <span>Loading more quests...</span>
            </div>
          </div>
        )}

        {/* End of results */}
        {!hasMoreQuests && quests.length > 0 && (
          <div className="mt-8 text-center text-gray-500">
            <div className="inline-flex items-center gap-2 px-4 py-2 bg-gray-100 rounded-full">
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
              <span>You've reached the end! {totalQuests} quests shown.</span>
            </div>
          </div>
        )}
      </>
    );
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Hero header with gradient - purple to pink */}
      <div className="bg-gradient-primary text-white py-16">
        <div className="max-w-7xl mx-auto px-4">
          <h1 className="text-5xl font-bold mb-4" style={{ fontFamily: 'Poppins, sans-serif' }}>
            EXPLORE NEW LEARNING PATHS
          </h1>
          <div className="flex items-center gap-3">
            <p className="text-xl" style={{ fontFamily: 'Poppins, sans-serif' }}>
              {/* BADGES FEATURE DISABLED - Feature under redesign
              Choose from{' '}
              <span
                className="inline-flex items-center gap-2 px-3 py-1 bg-white/20 rounded-full cursor-default relative group"
                title="Long-term learning journeys"
              >
                <strong>Badges</strong>
                <span className="
                  absolute bottom-full left-1/2 -translate-x-1/2 mb-2
                  px-3 py-2 bg-gray-900 text-white text-sm rounded-lg
                  opacity-0 group-hover:opacity-100 pointer-events-none
                  transition-opacity duration-200 whitespace-nowrap
                  shadow-lg z-10
                ">
                  Long-term learning journeys with multiple quests
                  <span className="
                    absolute top-full left-1/2 -translate-x-1/2
                    border-4 border-transparent border-t-gray-900
                  "></span>
                </span>
              </span>
              {' '}or{' '}
              */}
              Discover{' '}
              <span
                className="inline-flex items-center gap-2 px-3 py-1 bg-white/20 rounded-full cursor-default relative group"
                title="Individual learning adventures"
              >
                <strong>Quests</strong>
                {/* Hover tooltip for Quests */}
                <span className="
                  absolute bottom-full left-1/2 -translate-x-1/2 mb-2
                  px-3 py-2 bg-gray-900 text-white text-sm rounded-lg
                  opacity-0 group-hover:opacity-100 pointer-events-none
                  transition-opacity duration-200 whitespace-nowrap
                  shadow-lg z-10
                ">
                  Individual standalone learning adventures
                  <span className="
                    absolute top-full left-1/2 -translate-x-1/2
                    border-4 border-transparent border-t-gray-900
                  "></span>
                </span>
              </span>
            </p>
            <button
              onClick={() => setShowInfoModal(true)}
              className="
                p-2 rounded-full bg-white/20 hover:bg-white/30
                transition-all duration-200 hover:scale-110
                border border-white/30 hover:border-white/50
              "
              aria-label="Learn about badges and quests"
              title="Learn more about badges and quests"
            >
              <InformationCircleIcon className="w-5 h-5 text-white" />
            </button>
          </div>
        </div>
      </div>

      {/* Main content */}
      <div className="max-w-7xl mx-auto px-4 py-8">
        {/* Controls section */}
        <div className="mb-8 space-y-6">
          {/* Tab toggle, search, and suggest button */}
          <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
            <div className="min-h-[44px]">
              <TabToggle activeTab={activeTab} onTabChange={setActiveTab} />
            </div>

            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full lg:w-auto flex-wrap">
              <div className="w-full sm:w-96">
                <div className="min-h-[44px]">
                  <HubSearch
                    value={searchTerm}
                    onChange={setSearchTerm}
                    placeholder="SEARCH"
                  />
                </div>
              </div>

              {/* Create Quest button for authenticated users - now in header row */}
              {activeTab === 'quests' && canCreateQuests && (
                <button
                  onClick={handleCreateQuest}
                  className="bg-gradient-primary text-white px-6 py-3 rounded-lg font-semibold hover:opacity-90 transition-opacity flex items-center justify-center gap-2 shadow-lg whitespace-nowrap min-h-[44px]"
                  style={{ fontFamily: 'Poppins, sans-serif' }}
                >
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" />
                  </svg>
                  Create Your Own Quest
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Content area with gradient text header */}
        <div className="mb-6">
          <div className="mb-6">
            <h2
              className="text-4xl font-medium bg-gradient-primary bg-clip-text text-transparent"
              style={{ fontFamily: 'Poppins, sans-serif' }}
            >
              {/* BADGES DISABLED - Always show AVAILABLE QUESTS */}
              AVAILABLE QUESTS
            </h2>
          </div>

          {/* BADGES DISABLED - Always render quests view */}
          {renderQuestsView()}
        </div>
      </div>

      {/* Modals */}
      {/* Team-up modal removed - Phase 3 refactoring (January 2025) */}

      {showCreateQuestModal && (
        <CreateQuestModal
          isOpen={showCreateQuestModal}
          onClose={() => setShowCreateQuestModal(false)}
          onSuccess={handleCreateQuestSuccess}
        />
      )}

      {/* Info Modal */}
      <QuestBadgeInfoModal
        isOpen={showInfoModal}
        onClose={() => setShowInfoModal(false)}
      />
    </div>
  );
};

export default memo(QuestBadgeHub);
