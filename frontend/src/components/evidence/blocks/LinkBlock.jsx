/**
 * LinkBlock - Displays link evidence with rich preview card
 */

import React from 'react';
import PropTypes from 'prop-types';

const LinkBlock = ({ block, displayMode }) => {
  const { content } = block;
  const { url, title, description } = content;

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="block bg-white border border-gray-200 rounded-lg p-6 hover:shadow-md hover:border-purple-300 transition-all"
    >
      <div className="flex items-start gap-4">
        <div className="flex-shrink-0 w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center">
          <svg className="h-6 w-6 text-purple-700" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
          </svg>
        </div>

        <div className="flex-1 min-w-0">
          {title && (
            <h4 className="font-bold text-gray-900 mb-1 truncate" style={{ fontFamily: 'Poppins, sans-serif' }}>
              {title}
            </h4>
          )}

          {description && (
            <p className="text-sm text-gray-600 font-medium mb-2 line-clamp-2" style={{ fontFamily: 'Poppins, sans-serif' }}>
              {description}
            </p>
          )}

          <p className="text-xs text-purple-600 font-semibold truncate" style={{ fontFamily: 'Poppins, sans-serif' }}>
            {url}
          </p>
        </div>

        <svg className="h-5 w-5 text-gray-400 flex-shrink-0 mt-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
      </div>
    </a>
  );
};

LinkBlock.propTypes = {
  block: PropTypes.shape({
    content: PropTypes.shape({
      url: PropTypes.string.isRequired,
      title: PropTypes.string,
      description: PropTypes.string
    }).isRequired
  }).isRequired,
  displayMode: PropTypes.oneOf(['full', 'compact', 'preview'])
};

LinkBlock.defaultProps = {
  displayMode: 'full'
};

export default LinkBlock;
