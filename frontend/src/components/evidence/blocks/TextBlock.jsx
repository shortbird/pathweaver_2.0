/**
 * TextBlock - Displays text evidence with expand/collapse
 */

import React from 'react';
import PropTypes from 'prop-types';

const TextBlock = ({ block, isExpanded, onToggle, displayMode }) => {
  const { content } = block;
  const text = content.text || '';

  // Truncate length based on display mode
  const truncateLength = displayMode === 'compact' ? 150 : 300;
  const shouldTruncate = text.length > truncateLength;
  const displayText = shouldTruncate && !isExpanded
    ? text.slice(0, truncateLength) + '...'
    : text;

  return (
    <div className="w-full bg-white border border-gray-200 rounded-lg p-6">
      <div className="flex items-start gap-3 mb-3">
        <div className="flex-shrink-0 w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center">
          <svg className="h-5 w-5 text-blue-700" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
        </div>
        <div className="flex-1">
          <h4 className="text-sm font-bold text-gray-900 mb-1" style={{ fontFamily: 'Poppins, sans-serif' }}>
            Student Notes
          </h4>
        </div>
      </div>

      <div className="prose max-w-none">
        <p className="text-gray-900 whitespace-pre-wrap font-medium leading-relaxed" style={{ fontFamily: 'Poppins, sans-serif' }}>
          {displayText}
        </p>
      </div>

      {shouldTruncate && (
        <button
          onClick={onToggle}
          className="mt-3 text-sm font-semibold text-optio-purple hover:text-purple-800 transition-colors min-h-[44px]"
          style={{ fontFamily: 'Poppins, sans-serif' }}
        >
          {isExpanded ? 'Show less' : 'Show more'}
        </button>
      )}
    </div>
  );
};

TextBlock.propTypes = {
  block: PropTypes.shape({
    content: PropTypes.shape({
      text: PropTypes.string.isRequired
    }).isRequired
  }).isRequired,
  isExpanded: PropTypes.bool,
  onToggle: PropTypes.func,
  displayMode: PropTypes.oneOf(['full', 'compact', 'preview'])
};

TextBlock.defaultProps = {
  isExpanded: false,
  onToggle: () => {},
  displayMode: 'full'
};

export default TextBlock;
