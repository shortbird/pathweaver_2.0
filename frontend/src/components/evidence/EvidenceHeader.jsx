/**
 * EvidenceHeader - Displays task/quest context metadata
 */

import React from 'react';
import PropTypes from 'prop-types';

const EvidenceHeader = ({ context, blockCount }) => {
  const { taskTitle, questTitle, pillar, completedAt, xpAwarded } = context;

  const formatDate = (dateString) => {
    if (!dateString) return '';
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  return (
    <div className="bg-gradient-to-r from-purple-50 to-pink-50 border border-purple-200 rounded-lg p-6 mb-4">
      <div className="flex items-start justify-between gap-4 mb-4">
        <div className="flex-1 min-w-0">
          {taskTitle && (
            <h3 className="text-lg font-bold text-gray-900 mb-1" style={{ fontFamily: 'Poppins, sans-serif' }}>
              {taskTitle}
            </h3>
          )}

          {questTitle && (
            <p className="text-sm text-gray-700 font-semibold mb-2" style={{ fontFamily: 'Poppins, sans-serif' }}>
              {questTitle}
            </p>
          )}

          <div className="flex items-center gap-3 flex-wrap">
            {pillar && (
              <span className="text-xs font-bold px-3 py-1 rounded-full bg-purple-100 text-purple-800" style={{ fontFamily: 'Poppins, sans-serif' }}>
                {pillar}
              </span>
            )}

            {completedAt && (
              <span className="text-xs font-semibold px-3 py-1 rounded-full bg-green-100 text-green-800" style={{ fontFamily: 'Poppins, sans-serif' }}>
                {formatDate(completedAt)}
              </span>
            )}

            {xpAwarded && (
              <span className="text-xs font-bold px-3 py-1 rounded-full bg-blue-100 text-blue-800" style={{ fontFamily: 'Poppins, sans-serif' }}>
                {xpAwarded} XP
              </span>
            )}
          </div>
        </div>
      </div>

      {blockCount > 0 && (
        <div className="flex items-center gap-2 text-sm text-gray-600 font-medium" style={{ fontFamily: 'Poppins, sans-serif' }}>
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          <span>{blockCount} {blockCount === 1 ? 'piece' : 'pieces'} of evidence</span>
        </div>
      )}
    </div>
  );
};

EvidenceHeader.propTypes = {
  context: PropTypes.shape({
    taskTitle: PropTypes.string,
    questTitle: PropTypes.string,
    pillar: PropTypes.string,
    completedAt: PropTypes.string,
    xpAwarded: PropTypes.number
  }).isRequired,
  blockCount: PropTypes.number
};

EvidenceHeader.defaultProps = {
  blockCount: 0
};

export default EvidenceHeader;
