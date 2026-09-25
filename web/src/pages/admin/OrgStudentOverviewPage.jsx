import React from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useOrganization } from '../../contexts/OrganizationContext';
import { moduleEnabled } from '../../modules/moduleEnabled';
import { switchSurfaceInApp } from '../../utils/appSurface';
import AdvisorStudentOverviewContent from '../../components/advisor/AdvisorStudentOverviewContent';

/**
 * OrgStudentOverviewPage - Student overview for org admins/advisors
 *
 * Shows comprehensive student overview analytics instead of diploma view.
 * Provides URL-based back navigation (no state dependency).
 * Org admins have edit access to student information.
 *
 * Route: /admin/organizations/:orgId/student/:studentId
 *        /admin/students/:studentId  (a platform student, who has no org)
 *
 * `?returnTo=` sends Back somewhere other than the org's People tab: the
 * credit grader links here with the queue's place in it, so Back reopens the
 * same item. Only an in-app path is honoured.
 */
export default function OrgStudentOverviewPage() {
  const { orgId, studentId } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { isAdmin, isSuperadmin } = useAuth();
  const { organization } = useOrganization();

  // Org admins and superadmins can edit student information
  const canEdit = isAdmin || isSuperadmin;
  const returnTab = searchParams.get('tab') || 'people';
  const returnTo = safeReturnTo(searchParams.get('returnTo'));
  // A school that runs the SIS console keeps the student's record there
  // (profile, family, contacts, schedule); this page is their learning
  // overview. One door to that record rather than a second editor here
  // (M13a; ticket 7962081e was filed from this page).
  // No org, no school record to open.
  const sisRecord = Boolean(orgId) && (isSuperadmin || (organization?.id === orgId && moduleEnabled(organization, 'sis')));

  const handleBack = () => {
    navigate(returnTo || `/organization?tab=${returnTab}`);
  };
  const backLabel = returnTo?.startsWith('/credit-dashboard') || returnTo?.includes('cr_item=')
    ? 'Back to grading'
    : returnTo ? 'Back' : 'Back to People';

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
            {backLabel}
          </button>
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold">Student Overview</h1>
              <p className="mt-1 text-white/80 text-sm">
                Comprehensive learning analytics and portfolio
              </p>
            </div>
            {sisRecord && (
              <button
                type="button"
                onClick={() => switchSurfaceInApp('sis', `/people?student=${studentId}`)}
                className="shrink-0 rounded-lg border border-white/60 px-3 py-1.5 text-sm font-medium text-white hover:bg-white/10 min-h-[44px]"
              >
                Open school record
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <AdvisorStudentOverviewContent studentId={studentId} canEdit={canEdit} orgId={orgId} />
      </div>
    </div>
  );
}

/** An in-app path, or null. `//host` and absolute URLs would leave the app. */
export function safeReturnTo(value) {
  if (!value || !value.startsWith('/') || value.startsWith('//') || value.startsWith('/\\')) return null;
  return value;
}
