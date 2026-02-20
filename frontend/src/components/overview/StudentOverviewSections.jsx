import React from 'react';
import PropTypes from 'prop-types';

import LearningSnapshot from './LearningSnapshot';
import SkillsGrowth from './SkillsGrowth';
import ConstellationPreview from './ConstellationPreview';
import PortfolioSection from './PortfolioSection';
import LearningJournalSection from './LearningJournalSection';
import CollapsibleSection from './CollapsibleSection';

// Shared SVG icons for section headers
const icons = {
  snapshot: (
    <svg className="w-6 h-6 text-optio-purple" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
    </svg>
  ),
  skills: (
    <svg className="w-6 h-6 text-optio-purple" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
    </svg>
  ),
  constellation: (
    <svg className="w-6 h-6 text-optio-purple" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
    </svg>
  ),
  portfolio: (
    <svg className="w-6 h-6 text-optio-purple" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
    </svg>
  ),
  journal: (
    <svg className="w-6 h-6 text-optio-purple" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
    </svg>
  ),
  settings: (
    <svg className="w-6 h-6 text-optio-purple" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  )
};

/**
 * StudentOverviewSections - Unified section layout for all overview views.
 *
 * Renders the collapsible sections (Snapshot, Skills, Constellation, Portfolio,
 * Journal, and optional after-slots) with consistent icons and titles.
 */
const StudentOverviewSections = ({
  data,
  studentId = null,
  isDependent = false,
  dependentName = null,
  showJournal = false,
  hideEmptySections = false,
  portfolioReadOnly = false,
  showDiplomaCredits = true,
  visibilityStatus,
  onPrivacyToggle,
  privacyLoading = false,
  journalViewMode = 'student',
  journalMoments,
  afterPortfolio,
  afterJournal
}) => {
  // Determine which sections have data (for hideEmptySections mode)
  const hasSnapshotData = !hideEmptySections || (data.activeQuests?.length > 0) || (data.recentCompletions?.length > 0);
  const hasSkillsData = !hideEmptySections || data.totalXp > 0 || Object.values(data.xpByPillar || {}).some(v => v > 0);
  const hasConstellationData = !hideEmptySections || (data.questOrbs?.length > 0) || Object.values(data.pillarsData || {}).some(p => p?.total > 0);
  const hasPortfolioData = !hideEmptySections || data.achievements?.length > 0;

  return (
    <>
      {/* Learning Snapshot */}
      {hasSnapshotData && (
        <CollapsibleSection title="Learning Snapshot" icon={icons.snapshot}>
          <LearningSnapshot
            engagementData={data.engagementData}
            activeQuests={data.activeQuests}
            recentCompletions={data.recentCompletions}
            hideHeader
            studentId={studentId}
            isDependent={isDependent}
            dependentName={dependentName}
          />
        </CollapsibleSection>
      )}

      {/* Skills & Growth */}
      {hasSkillsData && (
        <CollapsibleSection title="Skills & Growth" icon={icons.skills}>
          <SkillsGrowth
            xpByPillar={data.xpByPillar}
            subjectXp={data.subjectXp}
            pendingSubjectXp={data.pendingSubjectXp}
            totalXp={data.totalXp}
            hideHeader
            showDiplomaCredits={showDiplomaCredits}
          />
        </CollapsibleSection>
      )}

      {/* Constellation Preview */}
      {hasConstellationData && (
        <CollapsibleSection id="constellation" title="Learning Constellation" icon={icons.constellation}>
          <ConstellationPreview
            pillarsData={data.pillarsData}
            questOrbs={data.questOrbs}
            badgeOrbs={[]}
            hideHeader
          />
        </CollapsibleSection>
      )}

      {/* Portfolio */}
      {hasPortfolioData && (
        <CollapsibleSection id="portfolio" title="Portfolio" icon={icons.portfolio}>
          <PortfolioSection
            achievements={data.achievements}
            visibilityStatus={visibilityStatus ?? data.visibilityStatus}
            userId={studentId}
            onPrivacyToggle={onPrivacyToggle}
            privacyLoading={privacyLoading}
            readOnly={portfolioReadOnly}
            hideHeader
          />
        </CollapsibleSection>
      )}

      {afterPortfolio}

      {/* Learning Journal */}
      {showJournal && (
        <CollapsibleSection id="learning-journal" title="Learning Journal" icon={icons.journal}>
          <LearningJournalSection
            moments={journalMoments}
            studentId={studentId}
            viewMode={journalViewMode}
            hideHeader
          />
        </CollapsibleSection>
      )}

      {afterJournal}
    </>
  );
};

StudentOverviewSections.propTypes = {
  data: PropTypes.shape({
    engagementData: PropTypes.object,
    activeQuests: PropTypes.array,
    recentCompletions: PropTypes.array,
    xpByPillar: PropTypes.object,
    subjectXp: PropTypes.object,
    pendingSubjectXp: PropTypes.object,
    totalXp: PropTypes.number,
    pillarsData: PropTypes.array,
    questOrbs: PropTypes.array,
    achievements: PropTypes.array,
    visibilityStatus: PropTypes.object
  }).isRequired,
  studentId: PropTypes.string,
  isDependent: PropTypes.bool,
  showJournal: PropTypes.bool,
  hideEmptySections: PropTypes.bool,
  portfolioReadOnly: PropTypes.bool,
  showDiplomaCredits: PropTypes.bool,
  visibilityStatus: PropTypes.object,
  onPrivacyToggle: PropTypes.func,
  privacyLoading: PropTypes.bool,
  journalViewMode: PropTypes.oneOf(['student', 'parent', 'observer']),
  journalMoments: PropTypes.array,
  afterPortfolio: PropTypes.node,
  afterJournal: PropTypes.node
};

export default StudentOverviewSections;
