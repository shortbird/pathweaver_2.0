import React, { useState } from 'react';
import PropTypes from 'prop-types';
import { Link } from 'react-router-dom';
import { useAdvisorStudentOverview } from '../../hooks/api/useAdvisorStudentOverview';

import HeroSection from '../overview/HeroSection';
import OverviewLoadingSkeleton from '../overview/OverviewLoadingSkeleton';
import OverviewErrorState from '../overview/OverviewErrorState';
import StudentOverviewSections from '../overview/StudentOverviewSections';
import EditUserModal from '../organization/people/EditUserModal';

/**
 * AdvisorStudentOverviewContent - Displays StudentOverviewPage components for a student in advisor view.
 * When canEdit=true (org admins), shows edit profile button and portfolio privacy controls.
 */
const AdvisorStudentOverviewContent = ({ studentId, canEdit = false, orgId }) => {
  const { data, isLoading, error, refetch } = useAdvisorStudentOverview(studentId);
  const [showEditModal, setShowEditModal] = useState(false);

  const handleEditProfile = () => {
    setShowEditModal(true);
  };

  const handleEditSuccess = () => {
    setShowEditModal(false);
    refetch();
  };

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
      {/* Hero Section */}
      <div className="relative">
        <HeroSection
          user={data.user}
          memberSince={data.memberSince}
          rhythm={data.engagementData?.rhythm?.state}
          totalXp={data.totalXp}
          completedQuestsCount={data.completedQuestsCount}
          completedTasksCount={data.completedTasksCount}
          viewMode="student"
          onEditProfile={canEdit ? handleEditProfile : undefined}
        />
        <Link
          to={`/public/diploma/${studentId}`}
          className="absolute top-4 right-4 flex items-center gap-2 px-3 py-2 bg-white/90 backdrop-blur-sm border border-gray-200 text-gray-700 rounded-lg text-sm font-medium hover:bg-white hover:shadow-md transition-all min-h-[40px]"
          style={{ fontFamily: 'Poppins, sans-serif' }}
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
          </svg>
          View Full Portfolio
        </Link>
      </div>

      <StudentOverviewSections
        data={data}
        studentId={studentId}
        portfolioReadOnly={!canEdit}
      />

      {/* Edit User Modal */}
      {showEditModal && canEdit && data?.user && (
        <EditUserModal
          orgId={orgId || data.user.organization_id}
          user={data.user}
          onClose={() => setShowEditModal(false)}
          onSuccess={handleEditSuccess}
          onRemove={() => {
            setShowEditModal(false);
          }}
        />
      )}
    </div>
  );
};

AdvisorStudentOverviewContent.propTypes = {
  studentId: PropTypes.string.isRequired,
  canEdit: PropTypes.bool,
  orgId: PropTypes.string
};

export default AdvisorStudentOverviewContent;
