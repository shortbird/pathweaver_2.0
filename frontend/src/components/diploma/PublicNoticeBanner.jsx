import React from 'react';
import { GlobeAltIcon, ShieldCheckIcon } from '@heroicons/react/24/outline';

/**
 * PublicNoticeBanner - Shows on public portfolios to indicate opt-in consent
 *
 * FERPA compliance: Indicates that the portfolio owner has explicitly
 * chosen to make their educational records public.
 *
 * @param {string} studentName - Name of the portfolio owner
 * @param {boolean} withParentApproval - Whether a parent approved (for minors)
 * @param {string} consentDate - ISO date string of when consent was given
 */
const PublicNoticeBanner = ({
  studentName = 'This student',
  withParentApproval = false,
  consentDate
}) => {
  // Format date if provided
  const formattedDate = consentDate
    ? new Date(consentDate).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric'
      })
    : null;

  return (
    <div className="bg-gradient-to-r from-optio-purple/5 to-optio-pink/5 border-b border-optio-purple/10">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-2">
        <div className="flex items-center justify-center gap-2 text-sm text-gray-600">
          {withParentApproval ? (
            <>
              <ShieldCheckIcon className="h-4 w-4 text-optio-purple" />
              <span>
                {studentName} has chosen to share this portfolio publicly with parental consent
                {formattedDate && <span className="text-gray-400 ml-1">({formattedDate})</span>}
              </span>
            </>
          ) : (
            <>
              <GlobeAltIcon className="h-4 w-4 text-optio-purple" />
              <span>
                {studentName} has chosen to share this portfolio publicly
                {formattedDate && <span className="text-gray-400 ml-1">({formattedDate})</span>}
              </span>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default PublicNoticeBanner;
