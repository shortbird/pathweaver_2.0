import React from 'react';
import PropTypes from 'prop-types';
import { useParentChildOverview } from '../../hooks/api/useParentChildOverview';
import { Cog6ToothIcon } from '@heroicons/react/24/outline';

import HeroSection from '../overview/HeroSection';
import CollapsibleSection from '../overview/CollapsibleSection';
import OverviewLoadingSkeleton from '../overview/OverviewLoadingSkeleton';
import OverviewErrorState from '../overview/OverviewErrorState';
import StudentOverviewSections from '../overview/StudentOverviewSections';
import ParentConversationsViewer from './ParentConversationsViewer';

/**
 * ChildOverviewContent - Displays StudentOverviewPage components for a child in parent view.
 * Excludes AccountSettings and makes PortfolioSection read-only.
 *
 * @param {string} studentId - The student/child ID
 * @param {function} onEditClick - Callback when edit button is clicked
 * @param {boolean} isDependent - True if child is under 13 (hides diploma credits)
 * @param {string} viewMode - 'parent' or 'observer' - observers have restricted access
 */
const ChildOverviewContent = ({ studentId, onEditClick, isDependent = false, dependentName = null, viewMode = 'parent' }) => {
  const isObserver = viewMode === 'observer';
  const { data, isLoading, error, refetch } = useParentChildOverview(studentId);

  if (isLoading) {
    return <OverviewLoadingSkeleton />;
  }

  if (error) {
    return <OverviewErrorState error={error} onRetry={refetch} />;
  }

  if (!data) {
    return null;
  }

  const communicationsSection = !isObserver ? (
    <CollapsibleSection
      id="communications"
      title="Communications"
      icon={<svg className="w-6 h-6 text-optio-purple" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" /></svg>}
      defaultOpen={false}
    >
      <ParentConversationsViewer studentId={studentId} />
    </CollapsibleSection>
  ) : null;

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

      <StudentOverviewSections
        data={data}
        studentId={studentId}
        isDependent={isDependent}
        dependentName={dependentName}
        showJournal
        hideEmptySections
        portfolioReadOnly
        showDiplomaCredits={!isDependent}
        journalViewMode={isObserver ? 'observer' : 'parent'}
        afterJournal={communicationsSection}
      />
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
