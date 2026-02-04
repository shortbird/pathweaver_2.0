import React, { useState, useEffect, useCallback } from 'react';
import { Helmet } from 'react-helmet-async';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useActingAs } from '../contexts/ActingAsContext';
import api from '../services/api';
import toast from 'react-hot-toast';
import logger from '../utils/logger';

// Overview Components
import HeroSection from '../components/overview/HeroSection';
import LearningSnapshot from '../components/overview/LearningSnapshot';
import SkillsGrowth from '../components/overview/SkillsGrowth';
import ConstellationPreview from '../components/overview/ConstellationPreview';
import PortfolioSection from '../components/overview/PortfolioSection';
import LearningJournalSection from '../components/overview/LearningJournalSection';
import AccountSettings from '../components/overview/AccountSettings';
import CollapsibleSection from '../components/overview/CollapsibleSection';
import OverviewLoadingSkeleton from '../components/overview/OverviewLoadingSkeleton';

// Modals
import PublicConsentModal from '../components/diploma/PublicConsentModal';
import EditProfileModal from '../components/overview/EditProfileModal';

const StudentOverviewPage = () => {
  const { user, updateUser, loginTimestamp } = useAuth();
  const { actingAsDependent } = useActingAs();
  const navigate = useNavigate();
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

  // Pillar mapping for constellation
  const mapPillarNameToId = (pillarName) => {
    if (['stem', 'wellness', 'communication', 'civics', 'art'].includes(pillarName)) {
      return pillarName;
    }
    const legacyMapping = {
      'stem_logic': 'stem',
      'language_communication': 'communication',
      'arts_creativity': 'art',
      'life_wellness': 'wellness',
      'society_culture': 'civics',
      'thinking_skills': 'stem',
      'creativity': 'art',
      'practical_skills': 'wellness',
      'general': 'stem'
    };
    return legacyMapping[pillarName] || 'stem';
  };

  // Pillar definitions
  const PILLAR_DEFINITIONS = [
    { id: 'stem', name: 'STEM', description: 'Science, technology, engineering, and mathematics' },
    { id: 'communication', name: 'Communication', description: 'Writing, speaking, storytelling, and presentation' },
    { id: 'art', name: 'Art', description: 'Visual arts, music, design, and creative expression' },
    { id: 'wellness', name: 'Wellness', description: 'Health, fitness, mindfulness, and personal growth' },
    { id: 'civics', name: 'Civics', description: 'Citizenship, community, social impact, and leadership' }
  ];

  // Fetch all data
  const fetchData = useCallback(async () => {
    if (!effectiveUser?.id) return;

    setLoading(true);
    setError(null);

    try {
      // Fetch all data in parallel
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

        // Build quest orbs for constellation
        const orbs = achievements.map((achievement) => {
          const xpDistribution = {};
          let questTotalXp = 0;

          // Build XP distribution from task_evidence (each task has a pillar)
          if (achievement.task_evidence) {
            Object.values(achievement.task_evidence).forEach((taskInfo) => {
              const pillarName = taskInfo.pillar;
              const xp = taskInfo.xp_awarded || 0;
              if (pillarName && xp > 0) {
                const pillarId = mapPillarNameToId(pillarName);
                xpDistribution[pillarId] = (xpDistribution[pillarId] || 0) + xp;
                questTotalXp += xp;
              }
            });
          }

          // Fallback to total_xp_earned if no distribution was built
          if (questTotalXp === 0 && achievement.total_xp_earned) {
            questTotalXp = achievement.total_xp_earned;
            if (Object.keys(xpDistribution).length === 0) {
              xpDistribution['stem'] = questTotalXp;
            }
          }

          const quest = achievement.quest || {};
          return {
            id: quest.id || achievement.id,
            title: quest.title || 'Untitled Quest',
            totalXP: questTotalXp || 50,
            xpDistribution: Object.keys(xpDistribution).length > 0 ? xpDistribution : { stem: 50 },
            status: achievement.status || 'completed',
            completedAt: achievement.completed_at
          };
        });
        setQuestOrbs(orbs);
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

      // Refresh visibility status
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
    // Merge with existing user data to ensure all fields are preserved
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
        <div className="bg-white rounded-xl shadow-lg p-8 max-w-md w-full text-center">
          <svg className="w-16 h-16 mx-auto text-gray-400 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <h2 className="text-xl font-bold text-gray-900 mb-2">Something went wrong</h2>
          <p className="text-gray-600 mb-4">{error}</p>
          <button
            onClick={() => fetchData()}
            className="px-6 py-3 bg-gradient-to-r from-optio-purple to-optio-pink text-white rounded-lg font-medium hover:shadow-md transition-shadow"
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  const currentUser = profileData?.user || effectiveUser;

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

        {/* Learning Snapshot */}
        <CollapsibleSection
          title="Learning Snapshot"
          icon={<svg className="w-6 h-6 text-optio-purple" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>}
        >
          <LearningSnapshot
            engagementData={engagementData}
            activeQuests={dashboardData.activeQuests}
            recentCompletions={dashboardData.recentCompletions}
            hideHeader
          />
        </CollapsibleSection>

        {/* Skills & Growth */}
        <CollapsibleSection
          title="Skills & Growth"
          icon={<svg className="w-6 h-6 text-optio-purple" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>}
        >
          <SkillsGrowth
            xpByPillar={dashboardData.xpByPillar}
            subjectXp={subjectXp}
            totalXp={dashboardData.totalXp}
            hideHeader
          />
        </CollapsibleSection>

        {/* Constellation Preview */}
        <CollapsibleSection
          id="constellation"
          title="Learning Constellation"
          icon={<svg className="w-6 h-6 text-optio-purple" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" /></svg>}
        >
          <ConstellationPreview
            pillarsData={pillarsData}
            questOrbs={questOrbs}
            badgeOrbs={[]}
            hideHeader
          />
        </CollapsibleSection>

        {/* Portfolio Evidence */}
        <CollapsibleSection
          id="portfolio"
          title="Portfolio"
          icon={<svg className="w-6 h-6 text-optio-purple" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" /></svg>}
        >
          <PortfolioSection
            achievements={completedQuests}
            visibilityStatus={visibilityStatus}
            userId={effectiveUser?.id}
            onPrivacyToggle={handlePrivacyToggle}
            privacyLoading={privacyLoading}
            hideHeader
          />
        </CollapsibleSection>

        {/* Learning Journal */}
        <CollapsibleSection
          id="learning-journal"
          title="Learning Journal"
          icon={<svg className="w-6 h-6 text-optio-purple" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" /></svg>}
        >
          <LearningJournalSection
            moments={learningEvents}
            viewMode="student"
            hideHeader
          />
        </CollapsibleSection>

        {/* Account Settings */}
        <CollapsibleSection
          id="account-settings"
          title="Account Settings"
          icon={<svg className="w-6 h-6 text-optio-purple" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>}
          defaultOpen={false}
        >
          <AccountSettings
            user={currentUser}
            visibilityStatus={visibilityStatus}
            onUserUpdate={handleUserUpdate}
            hideHeader
          />
        </CollapsibleSection>
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
