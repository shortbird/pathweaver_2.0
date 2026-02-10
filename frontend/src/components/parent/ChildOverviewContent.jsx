import React, { useState } from 'react';
import PropTypes from 'prop-types';
import { useParentChildOverview } from '../../hooks/api/useParentChildOverview';
import { Cog6ToothIcon } from '@heroicons/react/24/outline';

// Overview Components
import HeroSection from '../overview/HeroSection';
import LearningSnapshot from '../overview/LearningSnapshot';
import SkillsGrowth from '../overview/SkillsGrowth';
import ConstellationPreview from '../overview/ConstellationPreview';
import PortfolioSection from '../overview/PortfolioSection';
import LearningJournalSection from '../overview/LearningJournalSection';
import ParentConversationsViewer from './ParentConversationsViewer';
import CollapsibleSection from '../overview/CollapsibleSection';
import OverviewLoadingSkeleton from '../overview/OverviewLoadingSkeleton';

/**
 * ChildOverviewContent - Displays StudentOverviewPage components for a child in parent view.
 * Excludes AccountSettings and makes PortfolioSection read-only.
 *
 * @param {string} studentId - The student/child ID
 * @param {function} onEditClick - Callback when edit button is clicked
 * @param {boolean} isDependent - True if child is under 13 (hides diploma credits)
 * @param {string} viewMode - 'parent' or 'observer' - observers have restricted access
 */
const ChildOverviewContent = ({ studentId, onEditClick, isDependent = false, viewMode = 'parent' }) => {
  const isObserver = viewMode === 'observer';
  const { data, isLoading, error, refetch } = useParentChildOverview(studentId);

  if (isLoading) {
    return <OverviewLoadingSkeleton />;
  }

  if (error) {
    return (
      <div className="bg-white rounded-xl shadow-lg p-8 text-center">
        <svg className="w-16 h-16 mx-auto text-gray-400 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <h2 className="text-xl font-bold text-gray-900 mb-2">Something went wrong</h2>
        <p className="text-gray-600 mb-4">{error}</p>
        <button
          onClick={refetch}
          className="px-6 py-3 bg-gradient-to-r from-optio-purple to-optio-pink text-white rounded-lg font-medium hover:shadow-md transition-shadow"
        >
          Try Again
        </button>
      </div>
    );
  }

  if (!data) {
    return null;
  }

  // Determine which sections have data
  const hasSnapshotData = (data.activeQuests?.length > 0) || (data.recentCompletions?.length > 0);
  const hasSkillsData = data.totalXp > 0 || Object.values(data.xpByPillar || {}).some(v => v > 0);
  const hasConstellationData = (data.questOrbs?.length > 0) || Object.values(data.pillarsData || {}).some(p => p?.total > 0);
  const hasPortfolioData = data.achievements?.length > 0;

  return (
    <div className="space-y-6">
      {/* Hero Section with Actions Button */}
      <div className="relative">
        <HeroSection
          user={data.user}
          memberSince={data.memberSince}
          rhythm={data.engagementData?.rhythm?.state}
          totalXp={data.totalXp}
          completedQuestsCount={data.completedQuestsCount}
          completedTasksCount={data.completedTasksCount}
          viewMode="parent"
        />
        {/* Actions Button - top right on mobile (gear icon only), bottom right on desktop (full button) */}
        {onEditClick && (
          <>
            {/* Mobile: gear icon at top right */}
            <button
              onClick={onEditClick}
              className="md:hidden absolute top-4 right-4 p-2 text-white/80 hover:text-white hover:bg-white/20 rounded-lg transition-all"
              aria-label="Settings"
            >
              <Cog6ToothIcon className="w-5 h-5" />
            </button>
            {/* Desktop: full button at bottom right */}
            <button
              onClick={onEditClick}
              className="hidden md:flex absolute bottom-4 right-4 items-center gap-2 px-3 py-2 border border-white/50 text-white rounded-lg text-sm font-medium bg-transparent hover:bg-white/20 hover:border-white transition-all"
              style={{ fontFamily: 'Poppins, sans-serif' }}
            >
              <Cog6ToothIcon className="w-4 h-4" />
              Actions
            </button>
          </>
        )}
      </div>

      {/* Learning Snapshot - only show if has quests or completions */}
      {hasSnapshotData && (
        <CollapsibleSection
          title="Learning Snapshot"
          icon={<svg className="w-6 h-6 text-optio-purple" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>}
        >
          <LearningSnapshot
            engagementData={data.engagementData}
            activeQuests={data.activeQuests}
            recentCompletions={data.recentCompletions}
            hideHeader
            studentId={studentId}
          />
        </CollapsibleSection>
      )}

      {/* Skills & Growth - only show if has XP */}
      {hasSkillsData && (
        <CollapsibleSection
          title="Skills & Growth"
          icon={<svg className="w-6 h-6 text-optio-purple" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>}
        >
          <SkillsGrowth
            xpByPillar={data.xpByPillar}
            subjectXp={data.subjectXp}
            pendingSubjectXp={data.pendingSubjectXp}
            totalXp={data.totalXp}
            hideHeader
            showDiplomaCredits={!isDependent}
          />
        </CollapsibleSection>
      )}

      {/* Constellation Preview - only show if has quest orbs or pillar data */}
      {hasConstellationData && (
        <CollapsibleSection
          id="constellation"
          title="Learning Constellation"
          icon={<svg className="w-6 h-6 text-optio-purple" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" /></svg>}
        >
          <ConstellationPreview
            pillarsData={data.pillarsData}
            questOrbs={data.questOrbs}
            badgeOrbs={[]}
            hideHeader
          />
        </CollapsibleSection>
      )}

      {/* Portfolio Evidence - only show if has achievements */}
      {hasPortfolioData && (
        <CollapsibleSection
          id="portfolio"
          title="Portfolio"
          icon={<svg className="w-6 h-6 text-optio-purple" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" /></svg>}
        >
          <PortfolioSection
            achievements={data.achievements}
            visibilityStatus={data.visibilityStatus}
            userId={studentId}
            readOnly
            hideHeader
          />
        </CollapsibleSection>
      )}

      {/* Learning Journal - Always show, this is primary activity for young kids */}
      <CollapsibleSection
        id="learning-journal"
        title="Learning Journal"
        icon={<svg className="w-6 h-6 text-optio-purple" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" /></svg>}
      >
        <LearningJournalSection
          studentId={studentId}
          viewMode={isObserver ? 'observer' : 'parent'}
          hideHeader
        />
      </CollapsibleSection>

      {/* Communications - Read-only view of student's conversations (hidden for observers) */}
      {!isObserver && (
        <CollapsibleSection
          id="communications"
          title="Communications"
          icon={<svg className="w-6 h-6 text-optio-purple" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" /></svg>}
          defaultOpen={false}
        >
          <ParentConversationsViewer studentId={studentId} />
        </CollapsibleSection>
      )}
    </div>
  );
};

ChildOverviewContent.propTypes = {
  studentId: PropTypes.string.isRequired,
  onEditClick: PropTypes.func,
  isDependent: PropTypes.bool,
  viewMode: PropTypes.oneOf(['parent', 'observer'])
};

export default ChildOverviewContent;
