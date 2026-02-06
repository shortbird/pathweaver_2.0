import React from 'react';
import PropTypes from 'prop-types';

/**
 * OverviewLoadingSkeleton - Reusable loading skeleton for overview pages
 * Used across StudentOverviewPage, ChildOverviewContent, and AdvisorStudentOverviewContent
 *
 * @param {boolean} fullScreen - If true, adds min-h-screen and bg-gray-50 wrapper
 */
const OverviewLoadingSkeleton = ({ fullScreen = false }) => {
  const skeletonContent = (
    <div className="animate-pulse space-y-6">
      <div className="h-48 bg-gray-200 rounded-2xl" />
      <div className="h-64 bg-gray-200 rounded-2xl" />
      <div className="h-48 bg-gray-200 rounded-2xl" />
      <div className="h-96 bg-gray-200 rounded-2xl" />
    </div>
  );

  if (fullScreen) {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          {skeletonContent}
        </div>
      </div>
    );
  }

  return skeletonContent;
};

OverviewLoadingSkeleton.propTypes = {
  fullScreen: PropTypes.bool
};

export default OverviewLoadingSkeleton;
