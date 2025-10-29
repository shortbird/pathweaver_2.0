/**
 * EvidenceEmptyState - Displays when no evidence is available
 */

import React from 'react';
import PropTypes from 'prop-types';

const EvidenceEmptyState = ({ message }) => {
  return (
    <div className="bg-gray-50 border border-gray-200 rounded-lg p-8 text-center">
      <svg
        className="h-12 w-12 text-gray-400 mx-auto mb-4"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.5}
          d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
        />
      </svg>

      <p className="text-gray-600 font-semibold" style={{ fontFamily: 'Poppins, sans-serif' }}>
        {message || 'No evidence available'}
      </p>
    </div>
  );
};

EvidenceEmptyState.propTypes = {
  message: PropTypes.string
};

EvidenceEmptyState.defaultProps = {
  message: 'No evidence available'
};

export default EvidenceEmptyState;
