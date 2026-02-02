import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Navigate, Link, useNavigate, useParams } from 'react-router-dom';
import api from '../services/api';
import toast from 'react-hot-toast';
import InterestTracksList from '../components/interest-tracks/InterestTracksList';
import InterestTrackDetail from '../components/interest-tracks/InterestTrackDetail';
import QuestMomentsDetail from '../components/interest-tracks/QuestMomentsDetail';
import LearningEventCard from '../components/learning-events/LearningEventCard';
import QuickCaptureButton from '../components/learning-events/QuickCaptureButton';
import ParentMomentCaptureButton from '../components/parent/ParentMomentCaptureButton';
import EvolveTopicModal from '../components/interest-tracks/EvolveTopicModal';
import {
  FolderOpenIcon,
  SparklesIcon,
  ArrowPathIcon,
  ArrowLeftIcon
} from '@heroicons/react/24/outline';

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
        // Parent API returns all moments, filter unassigned ones
        const moments = response.data.moments || [];
        const unassigned = moments.filter(m => !m.track_id && !m.quest_id);
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
    console.log('[LearningJournalPage] handleSelectQuest called with:', questId);
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

  const handleCaptureSuccess = (event) => {
    // Refresh the appropriate view
    if (showUnassigned) {
      fetchUnassignedMoments();
    } else if (selectedTrackId) {
      // The InterestTrackDetail will need to refresh
    } else if (selectedQuestId) {
      // QuestMomentsDetail will refresh on its own
    }
    // Also refresh tracks list to update moment counts
    setTracksRefreshKey(prev => prev + 1);
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
      <div className="flex items-center justify-center min-h-screen">
        <div className="w-8 h-8 border-4 border-optio-purple border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  // Auth check
  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return (
    <div className="h-screen flex flex-col bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-4 py-3 sm:px-6">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3 sm:gap-4">
            <img
              src="https://auth.optioeducation.com/storage/v1/object/public/site-assets/logos/logo_95c9e6ea25f847a2a8e538d96ee9a827.png"
              alt="Optio"
              className="h-7 sm:h-8 w-auto"
            />
            <div className="h-6 w-px bg-gray-300" />
            <div>
              <h1 className="text-lg sm:text-2xl font-bold text-gray-900">
                {isParentView && childInfo
                  ? `${childInfo.first_name || childInfo.display_name}'s Learning Journal`
                  : 'Learning Journal'}
              </h1>
              <p className="text-xs sm:text-sm text-gray-500 hidden sm:block">
                {isParentView
                  ? 'View and organize learning moments'
                  : 'Track your spontaneous learning and organize it by topics of interest'}
              </p>
            </div>
          </div>

          {/* Back to Platform/Dashboard - top right */}
          <Link
            to={isParentView ? '/parent/dashboard' : '/dashboard'}
            className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <ArrowLeftIcon className="w-4 h-4" />
            <span className="hidden sm:inline">{isParentView ? 'Dashboard' : 'Platform'}</span>
          </Link>
        </div>

        {/* Mobile Tab Navigation */}
        <div className="lg:hidden mt-3 flex bg-gray-100 rounded-lg p-1">
          <button
            onClick={() => setMobileView('list')}
            className={`
              flex-1 py-2 px-4 text-sm font-medium rounded-md transition-all
              ${mobileView === 'list'
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-600 hover:text-gray-900'}
            `}
          >
            Topics
          </button>
          <button
            onClick={() => setMobileView('detail')}
            className={`
              flex-1 py-2 px-4 text-sm font-medium rounded-md transition-all
              ${mobileView === 'detail'
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-600 hover:text-gray-900'}
            `}
          >
            {getDetailViewLabel()}
          </button>
        </div>
      </header>

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden max-w-7xl mx-auto w-full">
        {/* Sidebar - Tracks List */}
        <aside
          className={`
            w-full lg:w-80 xl:w-96 bg-white border-r border-gray-200
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
            flex-1 bg-white overflow-hidden
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
                      <h2 className="text-xl font-bold text-gray-900">Unassigned Moments</h2>
                      <p className="text-sm text-gray-500">
                        {unassignedMoments.length} moment{unassignedMoments.length !== 1 ? 's' : ''} without a track
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

                {/* AI suggestion for organizing */}
                {unassignedMoments.length >= 5 && (
                  <div className="mt-4 p-3 bg-gradient-to-r from-purple-50 to-pink-50 rounded-lg border border-purple-200">
                    <div className="flex items-center gap-2 text-sm text-purple-700">
                      <SparklesIcon className="w-4 h-4" />
                      <span>
                        You have {unassignedMoments.length} unassigned moments. Consider organizing them into topics!
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
                  <div className="text-center py-12">
                    <FolderOpenIcon className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                    <p className="text-gray-500 mb-2">No unassigned moments</p>
                    <p className="text-sm text-gray-400">
                      All your learning moments are organized in topics
                    </p>
                  </div>
                )}
              </div>
            </div>
          ) : selectedQuestId ? (
            // Quest Moments View
            <QuestMomentsDetail
              questId={selectedQuestId}
              onMomentConverted={handleMomentConverted}
              studentId={isParentView ? childId : null}
            />
          ) : selectedTrackId ? (
            // Track Detail View
            <InterestTrackDetail
              trackId={selectedTrackId}
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
                  className="w-24 h-24 mx-auto mb-6"
                />
                <h2 className="text-xl font-bold text-gray-900 mb-2">
                  Welcome to Your Learning Journal
                </h2>
                <p className="text-gray-600 mb-6">
                  Capture spontaneous learning moments, organize them into interest tracks,
                  and eventually evolve them into quests.
                </p>
                <div className="space-y-3">
                  <p className="text-sm text-gray-500">
                    Press <kbd className="px-2 py-1 bg-gray-100 rounded text-xs font-mono">Ctrl+Shift+L</kbd> to
                    quickly capture a moment
                  </p>
                </div>
              </div>
            </div>
          )}
        </main>
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
        <QuickCaptureButton onSuccess={handleCaptureSuccess} />
      )}

      {/* Evolve Topic Modal */}
      <EvolveTopicModal
        isOpen={showEvolveModal}
        onClose={() => setShowEvolveModal(false)}
        track={trackToEvolve}
        onSuccess={handleEvolveSuccess}
      />
    </div>
  );
};

export default LearningJournalPage;
