import React from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import AdvisorStudentOverviewContent from '../../components/advisor/AdvisorStudentOverviewContent';

/**
 * OrgStudentOverviewPage - Student overview for org admins/advisors
 *
 * Shows comprehensive student overview analytics instead of diploma view.
 * Provides URL-based back navigation (no state dependency).
 * Org admins have edit access to student information.
 *
 * Route: /admin/organizations/:orgId/student/:studentId
 */
export default function OrgStudentOverviewPage() {
  const { orgId, studentId } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { isAdmin, isSuperadmin } = useAuth();

  // Org admins and superadmins can edit student information
  const canEdit = isAdmin || isSuperadmin;
  const returnTab = searchParams.get('tab') || 'progress';

  const handleBack = () => {
    // Navigate back to org management with progress tab selected
    navigate(`/organization?tab=${returnTab}`);
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header with back button */}
      <div className="bg-gradient-to-r from-optio-purple to-optio-pink text-white py-6">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <button
            onClick={handleBack}
            className="flex items-center gap-2 text-white/90 hover:text-white mb-4 transition-colors min-h-[44px]"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            Back to Progress
          </button>
          <h1 className="text-2xl font-bold">Student Overview</h1>
          <p className="mt-1 text-white/80 text-sm">
            Comprehensive learning analytics and portfolio
          </p>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <AdvisorStudentOverviewContent studentId={studentId} canEdit={canEdit} orgId={orgId} />
      </div>
    </div>
  );
}
