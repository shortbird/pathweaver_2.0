import React, { useState, useEffect, useCallback, useRef, memo } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate, useLocation } from 'react-router-dom';
import api from '../services/api';
import { useIsMounted, useObserver, useDebounceWithCleanup, useSafeAsync } from '../hooks/useMemoryLeakFix';
import { Info } from 'lucide-react';

// Import hub components
import TabToggle from '../components/hub/TabToggle';
import HubFilters from '../components/hub/HubFilters';
import HubSearch from '../components/hub/HubSearch';
import BadgeCarousel from '../components/hub/BadgeCarousel';
import QuestBadgeInfoModal from '../components/hub/QuestBadgeInfoModal';

// Import existing quest components
import QuestCardSimple from '../components/quest/QuestCardSimple';
import TeamUpModal from '../components/quest/TeamUpModal';
import QuestSuggestionModal from '../components/QuestSuggestionModal';
import { SkeletonCard } from '../components/ui/Skeleton';
import { hasFeatureAccess } from '../utils/tierMapping';

/**
 * QuestBadgeHub - Unified Hub for Badges and Quests
 * Combines the badge explorer and quest hub into a single, cohesive interface
 * Features:
 * - Tab toggle between BADGES and QUESTS views
 * - Pillar-based filtering
 * - Search across both badges and quests
 * - Horizontal scrolling badge carousels by pillar
 * - Infinite scroll quest grid
 */
const QuestBadgeHub = () => {
  const { user, loginTimestamp } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  // View state - determine initial tab based on route
  const [activeTab, setActiveTab] = useState(() => {
    // If coming from /badges route, show badges tab
    if (location.pathname.startsWith('/badges')) {
      return 'badges';
    }
    // If coming from /quests route, show quests tab
    if (location.pathname.startsWith('/quests')) {
      return 'quests';
    }
    // Otherwise restore last viewed tab from localStorage
    return localStorage.getItem('hub_active_tab') || 'badges';
  });

  // Filter state
  const [selectedPillar, setSelectedPillar] = useState('ALL');
  const [searchTerm, setSearchTerm] = useState('');

  // Badge state
  const [badgesByPillar, setBadgesByPillar] = useState({});
  const [badgesLoading, setBadgesLoading] = useState(false);
  const [badgesError, setBadgesError] = useState('');

  // Quest state
  const [quests, setQuests] = useState([]);
  const [questsLoading, setQuestsLoading] = useState(false);
  const [questsError, setQuestsError] = useState('');
  const [questPage, setQuestPage] = useState(1);
  const [hasMoreQuests, setHasMoreQuests] = useState(true);
  const [totalQuests, setTotalQuests] = useState(0);
  const [isLoadingMoreQuests, setIsLoadingMoreQuests] = useState(false);

  // Modal state
  const [showTeamUpModal, setShowTeamUpModal] = useState(false);
  const [selectedQuestForTeamUp, setSelectedQuestForTeamUp] = useState(null);
  const [showQuestSuggestionModal, setShowQuestSuggestionModal] = useState(false);
  const [showInfoModal, setShowInfoModal] = useState(false);

  // Memory leak prevention
  const isMounted = useIsMounted();
  const safeAsync = useSafeAsync();
  const isLoadingRef = useRef(false);

  // Scroll to top when switching tabs (route-based scroll handled globally by ScrollToTop component)
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [activeTab]);

  // Save tab selection to localStorage
  useEffect(() => {
    localStorage.setItem('hub_active_tab', activeTab);
  }, [activeTab]);

  // Fetch badges when in badges tab
  useEffect(() => {
    if (activeTab === 'badges' && user !== undefined) {
      fetchBadges();
    }
  }, [activeTab, selectedPillar, searchTerm, user, loginTimestamp]);

  // Reset quest pagination when filters change (must run before fetch)
  useEffect(() => {
    if (activeTab === 'quests') {
      setQuestPage(1);
      setQuests([]);
      setHasMoreQuests(true);
      isLoadingRef.current = false; // Reset loading ref
    }
  }, [selectedPillar, searchTerm]);

  // Fetch quests when in quests tab
  useEffect(() => {
    if (activeTab === 'quests' && user !== undefined && questPage === 1) {
      console.log('[HUB] Fetching initial quests...');
      fetchQuests(true);
    } else if (activeTab === 'quests' && user !== undefined && questPage > 1) {
      console.log(`[HUB] Fetching page ${questPage}...`);
      fetchQuests(false);
    }
  }, [activeTab, questPage, user, loginTimestamp]);

  // Fetch badges from API
  const fetchBadges = async () => {
    if (badgesLoading) return;

    setBadgesLoading(true);
    setBadgesError('');

    const result = await safeAsync(async (signal) => {
      const params = new URLSearchParams();
      if (selectedPillar !== 'ALL') {
        params.append('pillar', selectedPillar);
      }
      if (searchTerm.trim()) {
        params.append('search', searchTerm.trim());
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
  };

  // Fetch quests from API
  const fetchQuests = async (isInitial = true) => {
    if (isLoadingRef.current) {
      console.log('[HUB] Fetch blocked - already loading');
      return;
    }

    console.log(`[HUB] fetchQuests called - isInitial: ${isInitial}, page: ${questPage}`);
    isLoadingRef.current = true;

    if (isInitial) {
      setQuestsLoading(true);
      setQuests([]);
      setQuestPage(1);
      setHasMoreQuests(true);
    } else {
      setIsLoadingMoreQuests(true);
    }

    const result = await safeAsync(async (signal) => {
      const params = new URLSearchParams({
        page: isInitial ? 1 : questPage,
        per_page: 12,
        t: Date.now()
      });

      if (searchTerm.trim()) {
        params.append('search', searchTerm.trim());
      }
      if (selectedPillar !== 'ALL') {
        params.append('pillar', selectedPillar);
      }

      console.log(`[HUB] Fetching: /api/quests?${params}`);
      const response = await api.get(`/api/quests?${params}`, {
        signal,
        headers: { 'Cache-Control': 'no-cache' }
      });

      console.log(`[HUB] Response:`, response.data);
      return response.data;
    });

    if (result.success && isMounted()) {
      const data = result.data;
      console.log(`[HUB] Success - Got ${data.quests?.length || 0} quests, total: ${data.total}`);

      if (isInitial) {
        setQuests(data.quests || []);
      } else {
        setQuests(prev => [...prev, ...(data.quests || [])]);
      }

      setTotalQuests(data.total || 0);
      setHasMoreQuests(data.has_more === true);
      setQuestsError(''); // Clear any previous errors
    } else if (result.error && !result.aborted && isMounted()) {
      console.error('[HUB] Quest fetch error:', result.error);
      setQuestsError('Failed to load quests. Please try again.');
    }

    if (isMounted()) {
      isLoadingRef.current = false;
      setQuestsLoading(false);
      setIsLoadingMoreQuests(false);
    }
  };

  // Debounced page increment for infinite scroll
  const { debouncedFn: debouncedPageIncrement } = useDebounceWithCleanup(() => {
    if (!isLoadingRef.current && isMounted()) {
      setQuestPage(prevPage => prevPage + 1);
    }
  }, 100);

  // Intersection observer for infinite scroll (quests only)
  const setupObserver = useObserver((node) => {
    return new IntersectionObserver(
      entries => {
        if (entries[0].isIntersecting && hasMoreQuests && !isLoadingRef.current && isMounted()) {
          debouncedPageIncrement();
        }
      },
      { rootMargin: '100px' }
    );
  });

  const lastQuestElementRef = useCallback(node => {
    if (isLoadingMoreQuests || questsLoading || !node) return;

    const observer = setupObserver(node);
    observer.observe(node);
  }, [isLoadingMoreQuests, questsLoading, hasMoreQuests, debouncedPageIncrement, setupObserver]);

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

  const handleTeamUp = useCallback((quest) => {
    if (!user) {
      window.location.href = '/login';
      return;
    }
    setSelectedQuestForTeamUp(quest);
    setShowTeamUpModal(true);
  }, [user]);

  const handleQuestSuggestion = useCallback(() => {
    if (!user) {
      window.location.href = '/login';
      return;
    }
    setShowQuestSuggestionModal(true);
  }, [user]);

  const canSuggestQuests = user && hasFeatureAccess(user.subscription_tier, 'supported');

  // Render helpers
  const renderBadgesView = () => {
    if (badgesLoading) {
      return (
        <div className="flex items-center justify-center py-16">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#6d469b]" />
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

    // Filter badge groups based on selected pillar
    const pillarsToShow = selectedPillar === 'ALL'
      ? Object.keys(badgesByPillar)
      : [selectedPillar];

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
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-[#6d469b]" />
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
      <div className="bg-gradient-to-r from-[#6d469b] to-[#ef597b] text-white py-16">
        <div className="max-w-7xl mx-auto px-4">
          <h1 className="text-5xl font-bold mb-4" style={{ fontFamily: 'Poppins, sans-serif' }}>
            EXPLORE NEW LEARNING PATHS
          </h1>
          <div className="flex items-center gap-3">
            <p className="text-xl" style={{ fontFamily: 'Poppins, sans-serif' }}>
              Choose from{' '}
              <span
                className="inline-flex items-center gap-2 px-3 py-1 bg-white/20 rounded-full cursor-default relative group"
                title="Long-term learning journeys"
              >
                <strong>Badges</strong>
                {/* Hover tooltip for Badges */}
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
              <Info className="w-5 h-5 text-white" />
            </button>
          </div>
        </div>
      </div>

      {/* Main content */}
      <div className="max-w-7xl mx-auto px-4 py-8">
        {/* Controls section */}
        <div className="mb-8 space-y-6">
          {/* Tab toggle and search */}
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <TabToggle activeTab={activeTab} onTabChange={setActiveTab} />

            <div className="w-full md:w-96">
              <HubSearch
                value={searchTerm}
                onChange={setSearchTerm}
                placeholder="SEARCH"
              />
            </div>
          </div>

          {/* Quest suggestion button for eligible users */}
          {activeTab === 'quests' && canSuggestQuests && (
            <div className="flex justify-end">
              <button
                onClick={handleQuestSuggestion}
                className="bg-gradient-to-r from-[#6d469b] to-[#ef597b] text-white px-6 py-3 rounded-lg font-semibold hover:opacity-90 transition-opacity flex items-center gap-2 shadow-lg"
              >
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" />
                </svg>
                Suggest a Quest
              </button>
            </div>
          )}

          {/* Filters */}
          <HubFilters
            selectedPillar={selectedPillar}
            onPillarChange={setSelectedPillar}
          />
        </div>

        {/* Content area with gradient text header */}
        <div className="mb-6">
          <div className="mb-6">
            <h2
              className="text-4xl font-medium bg-gradient-to-r from-[#6d469b] to-[#ef597b] bg-clip-text text-transparent"
              style={{ fontFamily: 'Poppins, sans-serif' }}
            >
              {activeTab === 'badges' ? 'RECOMMENDED BADGES' : 'AVAILABLE QUESTS'}
            </h2>
          </div>

          {activeTab === 'badges' ? renderBadgesView() : renderQuestsView()}
        </div>
      </div>

      {/* Modals */}
      {showTeamUpModal && selectedQuestForTeamUp && (
        <TeamUpModal
          quest={selectedQuestForTeamUp}
          onClose={() => {
            setShowTeamUpModal(false);
            setSelectedQuestForTeamUp(null);
          }}
          onInviteSent={() => {}}
        />
      )}

      {showQuestSuggestionModal && (
        <QuestSuggestionModal
          onClose={() => setShowQuestSuggestionModal(false)}
          onSuccess={() => {}}
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
