import React, { useState, useEffect, useCallback } from 'react';
import { Helmet } from 'react-helmet-async';
import { useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useActingAs } from '../contexts/ActingAsContext';
import api from '../services/api';
import toast from 'react-hot-toast';
import logger from '../utils/logger';
import { buildQuestOrbs, PILLAR_DEFINITIONS } from '../utils/pillarHelpers';

// Overview Components
import HeroSection from '../components/overview/HeroSection';
import AccountSettings from '../components/overview/AccountSettings';
import CollapsibleSection from '../components/overview/CollapsibleSection';
import OverviewLoadingSkeleton from '../components/overview/OverviewLoadingSkeleton';
import OverviewErrorState from '../components/overview/OverviewErrorState';
import StudentOverviewSections from '../components/overview/StudentOverviewSections';

// Modals
import PublicConsentModal from '../components/diploma/PublicConsentModal';
import EditProfileModal from '../components/overview/EditProfileModal';

const StudentOverviewPage = () => {
  const { user, updateUser, loginTimestamp } = useAuth();
  const { actingAsDependent } = useActingAs();
  const location = useLocation();

  // Effective user (dependent if acting as one, otherwise logged-in user)
  const effectiveUser = actingAsDependent || user;

  // Data states
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Profile data
  const [profileData, setProfileData] = useState(null);

  // Dashboard data
  const [dashboardData, setDashboardData] = useState({
    totalXp: 0,
    xpByPillar: {},
    rhythm: null,
    activeQuests: [],
    recentCompletions: [],
    completedTasksCount: 0
  });

  // Engagement data (from separate endpoint)
  const [engagementData, setEngagementData] = useState({
    calendar: [],
    rhythm: null,
    summary: null
  });

  // Portfolio data
  const [completedQuests, setCompletedQuests] = useState([]);
  const [subjectXp, setSubjectXp] = useState({});
  const [pendingSubjectXp, setPendingSubjectXp] = useState({});
  const [learningEvents, setLearningEvents] = useState([]);

  // Constellation data
  const [pillarsData, setPillarsData] = useState([]);
  const [questOrbs, setQuestOrbs] = useState([]);

  // Edit profile modal
  const [showEditProfileModal, setShowEditProfileModal] = useState(false);

  // Privacy/visibility
  const [visibilityStatus, setVisibilityStatus] = useState(null);
  const [showConsentModal, setShowConsentModal] = useState(false);
  const [privacyLoading, setPrivacyLoading] = useState(false);

  // Fetch all data
  const fetchData = useCallback(async () => {
    if (!effectiveUser?.id) return;

    setLoading(true);
    setError(null);

    try {
      const [
        profileResult,
        dashboardResult,
        completedQuestsResult,
        subjectXpResult,
        learningEventsResult,
        visibilityResult,
        engagementResult
      ] = await Promise.allSettled([
        api.get('/api/users/profile'),
        api.get('/api/users/dashboard'),
        api.get('/api/quests/completed'),
        api.get('/api/users/subject-xp'),
        api.get('/api/learning-events'),
        api.get(`/api/portfolio/user/${effectiveUser.id}/visibility-status`),
        api.get('/api/users/me/engagement')
      ]);

      // Process profile
      if (profileResult.status === 'fulfilled') {
        setProfileData(profileResult.value.data);
      }

      // Process dashboard
      if (dashboardResult.status === 'fulfilled') {
        const data = dashboardResult.value.data;
        const xpByCategory = data.xp_by_category || {};
        const recentCompletions = data.recent_completions || [];

        setDashboardData({
          totalXp: data.stats?.total_xp || Object.values(xpByCategory).reduce((sum, xp) => sum + xp, 0),
          xpByPillar: xpByCategory,
          rhythm: data.rhythm || null,
          activeQuests: data.active_quests || [],
          recentCompletions,
          completedTasksCount: data.stats?.completed_tasks_count || 0
        });

        // Build constellation pillars data
        const isRecentlyActive = (pillarId) => {
          const sevenDaysAgo = new Date();
          sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
          return recentCompletions.some((completion) => {
            try {
              const completionDate = new Date(completion.completed_at);
              return completionDate >= sevenDaysAgo && completion.pillar === pillarId;
            } catch {
              return false;
            }
          });
        };

        const pillars = PILLAR_DEFINITIONS.map((def) => ({
          ...def,
          xp: xpByCategory[def.id] || 0,
          isActive: isRecentlyActive(def.id),
          questCount: recentCompletions.filter(c => c.pillar === def.id).length
        }));
        setPillarsData(pillars);
      }

      // Process completed quests
      if (completedQuestsResult.status === 'fulfilled') {
        const achievements = completedQuestsResult.value.data.achievements || [];
        setCompletedQuests(achievements);
        setQuestOrbs(buildQuestOrbs(achievements));
      }

      // Process subject XP
      if (subjectXpResult.status === 'fulfilled' && subjectXpResult.value.data?.subject_xp) {
        const subjectXpMap = {};
        const pendingMap = {};
        subjectXpResult.value.data.subject_xp.forEach(item => {
          subjectXpMap[item.school_subject] = item.verified_xp ?? item.xp_amount;
          if (item.pending_xp) {
            pendingMap[item.school_subject] = item.pending_xp;
          }
        });
        setSubjectXp(subjectXpMap);
        setPendingSubjectXp(pendingMap);
      }

      // Process learning events
      if (learningEventsResult.status === 'fulfilled') {
        setLearningEvents(learningEventsResult.value.data.events || []);
      }

      // Process visibility
      if (visibilityResult.status === 'fulfilled') {
        setVisibilityStatus(visibilityResult.value.data.data || null);
      }

      // Process engagement data
      if (engagementResult.status === 'fulfilled' && engagementResult.value.data?.engagement) {
        const engagement = engagementResult.value.data.engagement;
        setEngagementData({
          calendar: engagement.calendar?.days || [],
          rhythm: engagement.rhythm || null,
          summary: engagement.summary || null
        });
      }

    } catch (err) {
      logger.error('Error fetching overview data:', err);
      setError('Failed to load your overview. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [effectiveUser?.id]);

  // Initial data fetch
  useEffect(() => {
    fetchData();
  }, [fetchData, loginTimestamp]);

  // Handle scroll to section from hash
  useEffect(() => {
    if (location.hash && !loading) {
      const element = document.querySelector(location.hash);
      if (element) {
        setTimeout(() => {
          element.scrollIntoView({ behavior: 'smooth' });
        }, 100);
      }
    }
  }, [location.hash, loading]);

  // Privacy toggle handler
  const handlePrivacyToggle = () => {
    if (!visibilityStatus?.is_public) {
      setShowConsentModal(true);
    } else {
      updatePrivacy(false);
    }
  };

  const updatePrivacy = async (makePublic, consentAcknowledged = false) => {
    if (!effectiveUser?.id) return;

    setPrivacyLoading(true);
    try {
      await api.put(`/api/portfolio/user/${effectiveUser.id}/privacy`, {
        is_public: makePublic,
        consent_acknowledged: consentAcknowledged
      });

      const response = await api.get(`/api/portfolio/user/${effectiveUser.id}/visibility-status`);
      setVisibilityStatus(response.data.data || null);
      setShowConsentModal(false);
      toast.success(makePublic ? 'Portfolio is now public' : 'Portfolio is now private');
    } catch (err) {
      logger.error('Failed to update privacy:', err);
      toast.error(err.response?.data?.message || 'Failed to update privacy settings');
    } finally {
      setPrivacyLoading(false);
    }
  };

  const handleConsentConfirm = () => {
    updatePrivacy(true, true);
  };

  const handleEditProfile = () => {
    setShowEditProfileModal(true);
  };

  const handleUserUpdate = (updatedUser) => {
    const mergedUser = { ...profileData?.user, ...effectiveUser, ...updatedUser };

    if (updateUser) {
      updateUser(mergedUser);
    }
    setProfileData(prev => ({ ...prev, user: mergedUser }));
  };

  if (loading) {
    return <OverviewLoadingSkeleton fullScreen />;
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
        <OverviewErrorState error={error} onRetry={fetchData} />
      </div>
    );
  }

  const currentUser = profileData?.user || effectiveUser;

  // Build the data object expected by StudentOverviewSections
  const overviewData = {
    engagementData,
    activeQuests: dashboardData.activeQuests,
    recentCompletions: dashboardData.recentCompletions,
    xpByPillar: dashboardData.xpByPillar,
    subjectXp,
    pendingSubjectXp,
    totalXp: dashboardData.totalXp,
    pillarsData,
    questOrbs,
    achievements: completedQuests,
    visibilityStatus
  };

  const accountSettingsSection = (
    <CollapsibleSection
      id="account-settings"
      title="Account Settings"
      icon={
        <svg className="w-6 h-6 text-optio-purple" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      }
      defaultOpen={false}
    >
      <AccountSettings
        user={currentUser}
        visibilityStatus={visibilityStatus}
        onUserUpdate={handleUserUpdate}
        hideHeader
      />
    </CollapsibleSection>
  );

  return (
    <div className="min-h-screen bg-gray-50">
      <Helmet>
        <title>{currentUser?.first_name}'s Overview | Optio</title>
        <meta name="description" content="View your complete learning journey, skills progress, and portfolio in one place." />
      </Helmet>

      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        {/* Hero Section */}
        <HeroSection
          user={currentUser}
          memberSince={currentUser?.created_at}
          rhythm={dashboardData.rhythm}
          totalXp={dashboardData.totalXp}
          completedQuestsCount={completedQuests.length}
          completedTasksCount={dashboardData.completedTasksCount}
          onEditProfile={handleEditProfile}
        />

        <StudentOverviewSections
          data={overviewData}
          studentId={effectiveUser?.id}
          showJournal
          journalViewMode="student"
          journalMoments={learningEvents}
          visibilityStatus={visibilityStatus}
          onPrivacyToggle={handlePrivacyToggle}
          privacyLoading={privacyLoading}
          afterJournal={accountSettingsSection}
        />
      </div>

      {/* Modals */}
      <PublicConsentModal
        isOpen={showConsentModal}
        onClose={() => setShowConsentModal(false)}
        onConfirm={handleConsentConfirm}
        isMinor={visibilityStatus?.is_minor}
        parentName={visibilityStatus?.parent_info?.first_name || 'your parent or guardian'}
        loading={privacyLoading}
      />

      <EditProfileModal
        isOpen={showEditProfileModal}
        onClose={() => setShowEditProfileModal(false)}
        user={currentUser}
        onUserUpdate={handleUserUpdate}
      />
    </div>
  );
};

export default StudentOverviewPage;
