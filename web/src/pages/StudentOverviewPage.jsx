import React, { useState, useEffect, useCallback } from 'react';
import { Helmet } from 'react-helmet-async';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useActingAs } from '../contexts/ActingAsContext';
import { useFamilyScope } from '../contexts/FamilyScopeContext';
import { useStudentScope } from '../hooks/useStudentScope';
import api from '../services/api';
import { fetchProgramDiploma } from '../programs/registry';
import toast from 'react-hot-toast';
import logger from '../utils/logger';

// Overview Components
import HeroSection from '../components/overview/HeroSection';
import AccountSettings from '../components/overview/AccountSettings';
import CollapsibleSection from '../components/overview/CollapsibleSection';
import OverviewLoadingSkeleton from '../components/overview/OverviewLoadingSkeleton';
import OverviewErrorState from '../components/overview/OverviewErrorState';
import StudentOverviewSections from '../components/overview/StudentOverviewSections';
import WeeklyXpGoalCard from '../components/overview/WeeklyXpGoalCard';
import ParentConversationsViewer from '../components/parent/ParentConversationsViewer';

// Modals
import PublicConsentModal from '../components/diploma/PublicConsentModal';
import EditProfileModal from '../components/overview/EditProfileModal';

const StudentOverviewPage = () => {
  const { user, updateUser, loginTimestamp } = useAuth();
  const { actingAsDependent } = useActingAs();
  const { selectedChild } = useFamilyScope();
  const { params: scopeParams, isDelegated } = useStudentScope();
  const location = useLocation();

  // Whose overview: the child a parent is scoped to (contexts/
  // FamilyScopeContext -- every read below carries the scope), the dependent
  // of a still-live act-as session (one release, for stale cookies), else the
  // signed-in user. The profile row itself is loaded below and wins for
  // display; this only needs the id.
  const effectiveUser = selectedChild
    ? { id: selectedChild.id, first_name: selectedChild.firstName, avatar_url: selectedChild.avatarUrl }
    : (actingAsDependent || user);

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
  // OEA diploma progress (only present for Hearthwood Academy students with a chosen
  // pathway). When set, the Skills & Growth panel shows OEA pathway progress
  // instead of Optio's XP-based diploma credits.
  const [oea, setOea] = useState(null);
  const [learningEvents, setLearningEvents] = useState([]);

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
        engagementResult,
        oeaResult
      ] = await Promise.allSettled([
        api.get('/api/users/profile', { params: scopeParams }),
        api.get('/api/users/dashboard', { params: scopeParams }),
        api.get('/api/quests/completed', { params: scopeParams }),
        api.get('/api/users/subject-xp', { params: scopeParams }),
        api.get('/api/learning-events', { params: scopeParams }),
        api.get(`/api/portfolio/user/${effectiveUser.id}/visibility-status`),
        api.get('/api/users/me/engagement', { params: scopeParams }),
        // OEA students: their real diploma is the pathway, not Optio XP credits.
        // 403/404 (non-OEA or no access) is fine — falls back to Optio credits.
        fetchProgramDiploma(effectiveUser.id)
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
      }

      // Process completed quests
      if (completedQuestsResult.status === 'fulfilled') {
        const achievements = completedQuestsResult.value.data.achievements || [];
        setCompletedQuests(achievements);
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

      // OEA diploma progress. Store the whole response (includes is_oea_student)
      // so Skills & Growth can show pathway progress, a choose-pathway prompt for
      // OEA students without a pathway yet, or fall back to Optio credits.
      if (oeaResult.status === 'fulfilled') {
        setOea(oeaResult.value || null);
      } else {
        setOea(null);
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
    oea,
    totalXp: dashboardData.totalXp,
    achievements: completedQuests,
    visibilityStatus
  };

  // /api/quests/completed also returns in-progress quests that have at least
  // one submitted task, so the portfolio can show partial evidence. The hero's
  // "Quests" stat is a completion count, so it must not include those -- the
  // mobile profile already filters this way, and a student comparing the two
  // saw 17 here against 12 there (2026-09-14).
  const completedQuestsOnly = completedQuests.filter((a) => a.status === 'completed');

  // Account settings are the signed-in user's own identity (name, password,
  // deletion). PUT /api/users/profile is never delegated, so in family scope
  // this section points the parent at Family Settings instead of showing a
  // form that would edit the wrong account.
  const accountSettingsSection = isDelegated ? (
    <CollapsibleSection
      id="account-settings"
      title="Account Settings"
      icon={
        <svg className="w-6 h-6 text-optio-purple" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      }
      defaultOpen={false}
    >
      <p className="text-sm text-gray-600">
        {currentUser?.first_name || 'Your child'}'s name, photo and login are managed from{' '}
        <Link to={`/family?settings=${selectedChild?.id || 'you'}`} className="text-optio-purple font-medium hover:underline">Family settings</Link>.
      </p>
    </CollapsibleSection>
  ) : (
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

  // The child's communication history -- DMs, class chats, AI tutor -- read
  // only, for the guardian. It sat in a Communications section of the old
  // parent dashboard (ChildOverviewContent); the child's own profile page is
  // where it lives in family scope now, since that page is the full view of
  // the child. A student sees their own messages at /messages, never here.
  const communicationsSection = isDelegated && selectedChild ? (
    <CollapsibleSection
      id="communications"
      title="Communications"
      icon={
        <svg className="w-6 h-6 text-optio-purple" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
        </svg>
      }
      defaultOpen={false}
    >
      <ParentConversationsViewer studentId={selectedChild.id} />
    </CollapsibleSection>
  ) : null;

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
          completedQuestsCount={completedQuestsOnly.length}
          completedTasksCount={dashboardData.completedTasksCount}
          onEditProfile={isDelegated ? undefined : handleEditProfile}
        />

        {/* Weekly XP goal. Renders nothing unless the student's school has the
            feature on — the card asks the server, so no flag check here. */}
        <WeeklyXpGoalCard
          studentId={effectiveUser?.id}
          viewerIsStudent={!isDelegated}
          studentFirstName={currentUser?.first_name}
        />

        <StudentOverviewSections
          data={overviewData}
          studentId={effectiveUser?.id}
          showJournal
          journalViewMode="student"
          viewerMode="student"
          journalMoments={learningEvents}
          visibilityStatus={visibilityStatus}
          onPrivacyToggle={handlePrivacyToggle}
          privacyLoading={privacyLoading}
          afterJournal={(
            <>
              {communicationsSection}
              {accountSettingsSection}
            </>
          )}
          onEvidenceDeleted={fetchData}
        />
      </div>

      {/* Modals */}
      <PublicConsentModal
        isOpen={showConsentModal}
        onClose={() => setShowConsentModal(false)}
        onConfirm={handleConsentConfirm}
        isMinor={visibilityStatus?.is_minor}
        parentName={
          visibilityStatus?.approver?.first_name
          || visibilityStatus?.parent_info?.first_name
          || 'your parent or guardian'
        }
        approverKind={visibilityStatus?.approver_kind}
        minorReason={visibilityStatus?.minor_reason}
        canMakePublic={visibilityStatus?.can_make_public !== false}
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
