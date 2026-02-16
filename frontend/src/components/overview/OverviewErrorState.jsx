import React from 'react';
import PropTypes from 'prop-types';

const OverviewErrorState = ({ error, onRetry }) => (
  <div className="bg-white rounded-xl shadow-lg p-8 text-center">
    <svg className="w-16 h-16 mx-auto text-gray-400 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
    <h2 className="text-xl font-bold text-gray-900 mb-2">Something went wrong</h2>
    <p className="text-gray-600 mb-4">{error}</p>
    <button
      onClick={onRetry}
      className="px-6 py-3 bg-gradient-to-r from-optio-purple to-optio-pink text-white rounded-lg font-medium hover:shadow-md transition-shadow"
    >
      Try Again
    </button>
  </div>
);

OverviewErrorState.propTypes = {
  error: PropTypes.string.isRequired,
  onRetry: PropTypes.func.isRequired
};

export default OverviewErrorState;
