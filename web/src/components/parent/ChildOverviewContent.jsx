import React from 'react';
import PropTypes from 'prop-types';
import { useParentChildOverview } from '../../hooks/api/useParentChildOverview';
import { Cog6ToothIcon } from '@heroicons/react/24/outline';

import HeroSection from '../overview/HeroSection';
import OverviewLoadingSkeleton from '../overview/OverviewLoadingSkeleton';
import OverviewErrorState from '../overview/OverviewErrorState';
import StudentOverviewSections from '../overview/StudentOverviewSections';
import WeeklyXpGoalCard from '../overview/WeeklyXpGoalCard';

/**
 * ChildOverviewContent - a student's overview as an OBSERVER sees it
 * (pages/ObserverStudentOverviewPage): hero, weekly goal, and the read-only
 * sections, with nothing a guardian would get.
 *
 * It was the parent dashboard's copy of the child overview until 2026-09-15,
 * with a `viewMode='parent'` branch carrying the child's AI-tutor
 * conversations, schedule, classes and attendance. That branch lost its only
 * caller when the dashboard was retired (a parent reads the child's real
 * /overview in family scope, and the class pieces live on /school); the
 * observer page always passed 'observer', so the parent half rendered for
 * nobody and is gone.
 *
 * @param {string} studentId - The student's ID
 * @param {function} onEditClick - Callback when edit button is clicked
 * @param {boolean} isDependent - True if the student is under 13 (hides diploma credits)
 */
const ChildOverviewContent = ({ studentId, onEditClick, isDependent = false, dependentName = null }) => {
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
            {/* Desktop: full button at bottom right. Named for what it opens
                (this child's settings) so it doesn't read as a sibling of the
                page-level "Family Settings" button. */}
            <button
              onClick={onEditClick}
              className="hidden md:flex absolute bottom-4 right-4 items-center gap-2 px-3 py-2 border border-white/50 text-white rounded-lg text-sm font-medium bg-transparent hover:bg-white/20 hover:border-white transition-all"
            >
              <Cog6ToothIcon className="w-4 h-4" />
              {data.user?.first_name ? `Manage ${data.user.first_name}` : 'Manage student'}
            </button>
          </>
        )}
      </div>

      {/* Weekly XP goal (schools that enabled it; renders nothing otherwise).
          Shown to observers too — they read the progress, and the server
          withholds the editor from them via can_edit. */}
      <WeeklyXpGoalCard
        studentId={studentId}
        studentFirstName={data.user?.first_name}
      />

      <StudentOverviewSections
        data={data}
        studentId={studentId}
        isDependent={isDependent}
        dependentName={dependentName}
        showJournal
        hideEmptySections
        portfolioReadOnly
        showDiplomaCredits={!isDependent}
        journalViewMode="observer"
        viewerMode="observer"
      />
    </div>
  );
};

ChildOverviewContent.propTypes = {
  studentId: PropTypes.string.isRequired,
  onEditClick: PropTypes.func,
  isDependent: PropTypes.bool,
  dependentName: PropTypes.string,
};

export default ChildOverviewContent;
