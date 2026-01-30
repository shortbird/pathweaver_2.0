import React, { useState } from 'react';
import PropTypes from 'prop-types';
import { useParentChildOverview } from '../../hooks/api/useParentChildOverview';
import { PencilIcon } from '@heroicons/react/24/outline';

// Overview Components
import HeroSection from '../overview/HeroSection';
import LearningSnapshot from '../overview/LearningSnapshot';
import SkillsGrowth from '../overview/SkillsGrowth';
import ConstellationPreview from '../overview/ConstellationPreview';
import PortfolioSection from '../overview/PortfolioSection';

// Collapsible section wrapper (copied from StudentOverviewPage)
const CollapsibleSection = ({ title, icon, children, defaultOpen = true, id }) => {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <section id={id} className="bg-white rounded-2xl shadow-lg overflow-hidden">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between p-6 hover:bg-gray-50 transition-colors"
      >
        <div className="flex items-center gap-2">
          {icon}
          <h2 className="text-xl font-bold text-gray-900" style={{ fontFamily: 'Poppins', fontWeight: 700 }}>
            {title}
          </h2>
        </div>
        <svg
          className={`w-5 h-5 text-gray-500 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      <div className={`transition-all duration-300 ${isOpen ? 'max-h-[5000px] opacity-100' : 'max-h-0 opacity-0 overflow-hidden'}`}>
        <div className="px-6 pb-6">
          {children}
        </div>
      </div>
    </section>
  );
};

// Loading skeleton
const LoadingSkeleton = () => (
  <div className="animate-pulse space-y-6">
    <div className="h-48 bg-gray-200 rounded-2xl" />
    <div className="h-64 bg-gray-200 rounded-2xl" />
    <div className="h-48 bg-gray-200 rounded-2xl" />
    <div className="h-96 bg-gray-200 rounded-2xl" />
  </div>
);

/**
 * ChildOverviewContent - Displays StudentOverviewPage components for a child in parent view.
 * Excludes AccountSettings and makes PortfolioSection read-only.
 */
const ChildOverviewContent = ({ studentId, onEditClick }) => {
  const { data, isLoading, error, refetch } = useParentChildOverview(studentId);

  if (isLoading) {
    return <LoadingSkeleton />;
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

  return (
    <div className="space-y-6">
      {/* Hero Section with Edit Button */}
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
        {/* Edit Button - positioned in top right of hero section */}
        {onEditClick && (
          <button
            onClick={onEditClick}
            className="absolute top-4 right-4 flex items-center gap-2 px-3 py-2 bg-white/90 backdrop-blur-sm border border-gray-200 text-gray-700 rounded-lg text-sm font-medium hover:bg-white hover:shadow-md transition-all min-h-[40px]"
            style={{ fontFamily: 'Poppins, sans-serif' }}
          >
            <PencilIcon className="w-4 h-4" />
            Edit
          </button>
        )}
      </div>

      {/* Learning Snapshot */}
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

      {/* Skills & Growth */}
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
        />
      </CollapsibleSection>

      {/* Constellation Preview */}
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

      {/* Portfolio Evidence - Read-only for parents */}
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
    </div>
  );
};

ChildOverviewContent.propTypes = {
  studentId: PropTypes.string.isRequired,
  onEditClick: PropTypes.func
};

export default ChildOverviewContent;
