import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate, useParams } from 'react-router-dom';
import api from '../services/api';
import toast from 'react-hot-toast';
import InterestTracksList from '../components/interest-tracks/InterestTracksList';
import InterestTrackDetail from '../components/interest-tracks/InterestTrackDetail';
import QuestMomentsDetail from '../components/interest-tracks/QuestMomentsDetail';
import LearningEventCard from '../components/learning-events/LearningEventCard';
import QuickCaptureButton from '../components/learning-events/QuickCaptureButton';
import BulkImportModal from '../components/learning-events/BulkImportModal';
import ParentMomentCaptureButton from '../components/parent/ParentMomentCaptureButton';
import EvolveTopicModal from '../components/interest-tracks/EvolveTopicModal';
import {
  FolderOpenIcon,
  SparklesIcon,
  ArrowPathIcon,
  PhotoIcon,
  PlusIcon
} from '@heroicons/react/24/outline';
import GlassTabBar from '../components/ui/GlassTabBar';
import EmptyState from '../components/ui/EmptyState';
import { PageLoader } from '../components/ui/Spinner';

const LearningJournalPage = () => {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const { childId } = useParams(); // Optional - when parent views child's journal

  // Parent viewing mode
  const isParentView = !!childId;
  const [childInfo, setChildInfo] = useState(null);
  const [selectedTrackId, setSelectedTrackId] = useState(null);
  const [selectedQuestId, setSelectedQuestId] = useState(null);
  const [showUnassigned, setShowUnassigned] = useState(true); // Default to unassigned view
  const [unassignedMoments, setUnassignedMoments] = useState([]);
  const [isLoadingUnassigned, setIsLoadingUnassigned] = useState(false);
  const [tracksRefreshKey, setTracksRefreshKey] = useState(0);

  // Mobile view state
  const [mobileView, setMobileView] = useState('list'); // 'list' or 'detail'

  // Evolve modal state
  const [showEvolveModal, setShowEvolveModal] = useState(false);
  const [trackToEvolve, setTrackToEvolve] = useState(null);

  // Bulk import modal (self-view only)
  const [showBulkImport, setShowBulkImport] = useState(false);

  // Capture modal (self-view only) - shared between the header CTA, the
  // floating button, and the Ctrl+Shift+L shortcut via QuickCaptureButton.
  const [showCapture, setShowCapture] = useState(false);

  // Fetch child info when in parent mode
  useEffect(() => {
    if (isParentView && childId) {
      const fetchChildInfo = async () => {
        try {
          const response = await api.get(`/api/parent/child-overview/${childId}`);
          if (response.data?.student) {
            setChildInfo(response.data.student);
          }
        } catch (error) {
          console.error('Failed to fetch child info:', error);
        }
      };
      fetchChildInfo();
    }
  }, [isParentView, childId]);

  const fetchUnassignedMoments = useCallback(async () => {
    try {
      setIsLoadingUnassigned(true);
      // Use parent API when viewing child's journal
      const endpoint = isParentView
        ? `/api/parent/children/${childId}/learning-moments?limit=50`
        : '/api/learning-events/unassigned';
      const response = await api.get(endpoint);

      if (isParentView) {
        const moments = response.data.moments || [];
        const unassigned = moments.filter((m) => (m.topics || []).length === 0);
        setUnassignedMoments(unassigned);
      } else if (response.data.success) {
        setUnassignedMoments(response.data.moments);
      }
    } catch (error) {
      console.error('Failed to fetch unassigned moments:', error);
      toast.error('Failed to load unassigned moments');
    } finally {
      setIsLoadingUnassigned(false);
    }
  }, [isParentView, childId]);

  useEffect(() => {
    if (showUnassigned) {
      fetchUnassignedMoments();
    }
  }, [showUnassigned, fetchUnassignedMoments]);

  // Handle keyboard shortcut for quick capture
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.ctrlKey && e.shiftKey && e.key === 'L') {
        // QuickCaptureButton handles this, but we could trigger it here too
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleSelectTrack = (trackId) => {
    setSelectedTrackId(trackId);
    setSelectedQuestId(null);
    setShowUnassigned(false);
    setMobileView('detail');
  };

  const handleSelectQuest = (questId) => {
    setSelectedQuestId(questId);
    setSelectedTrackId(null);
    setShowUnassigned(false);
    setMobileView('detail');
  };

  const handleSelectUnassigned = () => {
    setSelectedTrackId(null);
    setSelectedQuestId(null);
    setShowUnassigned(true);
    setMobileView('detail');
  };

  const handleDeleteTrack = (trackId) => {
    setSelectedTrackId(null);
    setSelectedQuestId(null);
    setShowUnassigned(true);
    setMobileView('list');
    setTracksRefreshKey(prev => prev + 1);
    fetchUnassignedMoments(); // Moments from deleted track become unassigned
  };

  const handleGraduateTrack = (track) => {
    setTrackToEvolve(track);
    setShowEvolveModal(true);
  };

  const handleEvolveSuccess = (questId) => {
    // Navigate to the newly created quest
    navigate(`/quests/${questId}`);
  };

  const handleCaptureSuccess = () => {
    // Bump the tracks refresh key — the list, the open track panel, and the
    // open quest panel all subscribe to it, so they all refetch together.
    if (showUnassigned) {
      fetchUnassignedMoments();
    }
    setTracksRefreshKey((prev) => prev + 1);
  };

  // Handler for when a moment is assigned to a track
  const handleMomentAssigned = () => {
    fetchUnassignedMoments();
    setTracksRefreshKey(prev => prev + 1);
  };

  // Handler for when a moment is converted to a task
  const handleMomentConverted = (task) => {
    // Could show a link to the task or refresh data
    setTracksRefreshKey(prev => prev + 1);
  };

  // Get the detail view label for mobile tab
  const getDetailViewLabel = () => {
    if (showUnassigned) return 'Unassigned';
    if (selectedQuestId) return 'Quest Moments';
    if (selectedTrackId) return 'Topic Detail';
    return 'Select Topic';
  };

  // Auth loading
  if (authLoading) {
    return (
      <PageLoader className="h-64" />
    );
  }

  return (
    <div className="h-[calc(100vh-4rem)] flex flex-col bg-neutral-50">
      {/* Page Header with Mobile Tabs */}
      <div className="max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 pt-6 pb-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-2xl font-bold text-gray-900">
              {isParentView && childInfo
                ? `${childInfo.first_name || childInfo.display_name}'s Learning Journal`
                : 'Learning Journal'}
            </h1>
            <p className="mt-1 text-sm text-gray-500">
              {isParentView
                ? 'View and organize learning moments'
                : 'Track your spontaneous learning and organize it by topics of interest'}
            </p>
          </div>
          {!isParentView && (
            <div className="flex shrink-0 items-center gap-2">
              <button
                onClick={() => setShowBulkImport(true)}
                className="btn-quiet"
                title="Import many photos at once"
              >
                <PhotoIcon className="w-4 h-4" />
                <span className="hidden sm:inline">Bulk import</span>
              </button>
              <button
                onClick={() => setShowCapture(true)}
                className="btn-primary"
                title="Capture a learning moment (Ctrl+Shift+L)"
              >
                <PlusIcon className="w-4 h-4" />
                <span className="hidden sm:inline">Capture moment</span>
                <span className="sm:hidden">Capture</span>
              </button>
            </div>
          )}
        </div>

        {/* Mobile Tab Navigation */}
        <GlassTabBar
          size="md"
          className="lg:hidden mt-4"
          aria-label="Journal views"
          tabs={[
            { id: 'list', label: 'Topics' },
            { id: 'detail', label: getDetailViewLabel() },
          ]}
          active={mobileView}
          onSelect={setMobileView}
        />
      </div>

      {/* Main Content - split pane inside a canonical card */}
      <div className="flex-1 min-h-0 max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 pb-6">
        <div className="h-full flex overflow-hidden bg-white rounded-xl border border-gray-200 shadow-sm">
        {/* Sidebar - Tracks List */}
        <aside
          className={`
            w-full lg:w-80 xl:w-96 lg:border-r lg:border-gray-200
            ${mobileView === 'list' ? 'block' : 'hidden lg:block'}
          `}
        >
          <InterestTracksList
            selectedTrackId={showUnassigned || selectedQuestId ? null : selectedTrackId}
            selectedQuestId={selectedQuestId}
            onSelectTrack={handleSelectTrack}
            onSelectQuest={handleSelectQuest}
            onSelectUnassigned={handleSelectUnassigned}
            showUnassigned={showUnassigned}
            refreshKey={tracksRefreshKey}
            onMomentsAssigned={fetchUnassignedMoments}
            className="h-full"
            studentId={isParentView ? childId : null}
          />
        </aside>

        {/* Main Content Area */}
        <main
          className={`
            flex-1 overflow-hidden
            ${mobileView === 'detail' ? 'block' : 'hidden lg:block'}
          `}
        >
          {showUnassigned ? (
            // Unassigned Moments View
            <div className="h-full flex flex-col">
              <div className="p-6 border-b border-gray-200 bg-gray-50">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-xl bg-gray-200 flex items-center justify-center">
                      <FolderOpenIcon className="w-6 h-6 text-gray-600" />
                    </div>
                    <div>
                      <h2 className="text-lg font-semibold text-gray-900">Unassigned Moments</h2>
                      <p className="text-sm text-gray-500">
                        {unassignedMoments.length} moment{unassignedMoments.length !== 1 ? 's' : ''} without a topic
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={fetchUnassignedMoments}
                    className="p-2 text-gray-400 hover:text-gray-600 hover:bg-white rounded-lg transition-colors"
                    title="Refresh"
                  >
                    <ArrowPathIcon className="w-5 h-5" />
                  </button>
                </div>

                {unassignedMoments.length > 0 && (
                  <div className="mt-4 p-3 bg-gradient-to-r from-optio-purple/5 to-optio-pink/5 rounded-lg border border-optio-purple/20">
                    <div className="flex items-start gap-2 text-sm text-optio-purple-dark">
                      <SparklesIcon className="w-4 h-4 mt-0.5 flex-shrink-0" />
                      <span>
                        Moments here aren't earning XP yet. Add each one to a topic
                        or quest, then promote it into a task to earn XP.
                      </span>
                    </div>
                  </div>
                )}
              </div>

              <div className="flex-1 overflow-y-auto p-6">
                {isLoadingUnassigned ? (
                  <div className="animate-pulse space-y-4">
                    {[1, 2, 3].map(i => (
                      <div key={i} className="h-24 bg-gray-100 rounded-lg" />
                    ))}
                  </div>
                ) : unassignedMoments.length > 0 ? (
                  <div className="space-y-4">
                    {unassignedMoments.map(moment => (
                      <LearningEventCard
                        key={moment.id}
                        event={moment}
                        showTrackAssign={true}
                        onTrackAssigned={handleMomentAssigned}
                        studentId={isParentView ? childId : null}
                      />
                    ))}
                  </div>
                ) : (
                  <EmptyState
                    plain
                    icon={FolderOpenIcon}
                    title="All caught up"
                    hint="Capture more moments and assign them to a topic or quest to earn XP."
                  />
                )}
              </div>
            </div>
          ) : selectedQuestId ? (
            // Quest Moments View
            <QuestMomentsDetail
              questId={selectedQuestId}
              refreshKey={tracksRefreshKey}
              onMomentConverted={handleMomentConverted}
              studentId={isParentView ? childId : null}
            />
          ) : selectedTrackId ? (
            // Track Detail View
            <InterestTrackDetail
              trackId={selectedTrackId}
              refreshKey={tracksRefreshKey}
              onDelete={handleDeleteTrack}
              onGraduate={handleGraduateTrack}
              studentId={isParentView ? childId : null}
            />
          ) : (
            // Empty state
            <div className="h-full flex items-center justify-center p-6">
              <div className="text-center max-w-md">
                <img
                  src="https://auth.optioeducation.com/storage/v1/object/public/site-assets/logos/gradient_fav.svg"
                  alt="Optio"
                  className="w-20 h-20 mx-auto mb-6"
                />
                <h2 className="text-lg font-semibold text-gray-900 mb-2">
                  Welcome to Your Learning Journal
                </h2>
                <p className="text-sm text-gray-600 mb-6">
                  Capture spontaneous learning moments, organize them into topics of interest,
                  and eventually evolve them into quests.
                </p>
                {!isParentView && (
                  <button
                    onClick={() => setShowCapture(true)}
                    className="btn-primary"
                  >
                    <PlusIcon className="w-4 h-4" />
                    Capture a moment
                  </button>
                )}
                <p className="mt-4 text-sm text-gray-500">
                  Press <kbd className="px-2 py-1 bg-gray-100 rounded text-xs font-mono">Ctrl+Shift+L</kbd> to
                  quickly capture a moment
                </p>
              </div>
            </div>
          )}
        </main>
        </div>
      </div>

      {/* Quick Capture FAB */}
      {isParentView ? (
        <ParentMomentCaptureButton
          children={[]}
          dependents={childInfo ? [{ id: childId, display_name: childInfo.first_name || childInfo.display_name }] : []}
          selectedChildId={childId}
          onSuccess={handleCaptureSuccess}
        />
      ) : (
        <QuickCaptureButton
          onSuccess={handleCaptureSuccess}
          open={showCapture}
          onOpenChange={setShowCapture}
        />
      )}

      {/* Evolve Topic Modal */}
      <EvolveTopicModal
        isOpen={showEvolveModal}
        onClose={() => setShowEvolveModal(false)}
        track={trackToEvolve}
        onSuccess={handleEvolveSuccess}
      />

      {/* Bulk Import Modal (self-view only) */}
      {!isParentView && (
        <BulkImportModal
          isOpen={showBulkImport}
          onClose={() => setShowBulkImport(false)}
          onSuccess={handleCaptureSuccess}
        />
      )}
    </div>
  );
};

export default LearningJournalPage;
