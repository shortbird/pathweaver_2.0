/**
 * LinkBlock - Displays link evidence with rich preview card
 * Supports both old format (content.url) and new format (content.items)
 */

import React from 'react';
import PropTypes from 'prop-types';

const LinkBlock = ({ block, displayMode }) => {
  const { content } = block;

  // Handle both old format (content.url) and new format (content.items)
  const items = content?.items || (content?.url ? [{ url: content.url, title: content.title, description: content.description }] : []);

  // Handle empty items
  if (items.length === 0) {
    return (
      <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 text-center text-gray-500">
        No link content
      </div>
    );
  }

  // Render a single link item
  const renderLinkItem = (item, index) => {
    const { url, title, description } = item;

    if (!url) {
      return null;
    }

    return (
      <a
        key={index}
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

            <p className="text-xs text-optio-purple font-semibold truncate" style={{ fontFamily: 'Poppins, sans-serif' }}>
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

  // Render all link items
  return (
    <div className="space-y-3">
      {items.map((item, index) => renderLinkItem(item, index))}
    </div>
  );
};

LinkBlock.propTypes = {
  block: PropTypes.shape({
    content: PropTypes.oneOfType([
      PropTypes.shape({
        url: PropTypes.string,
        title: PropTypes.string,
        description: PropTypes.string
      }),
      PropTypes.shape({
        items: PropTypes.arrayOf(PropTypes.shape({
          url: PropTypes.string,
          title: PropTypes.string,
          description: PropTypes.string
        }))
      })
    ])
  }).isRequired,
  displayMode: PropTypes.oneOf(['full', 'compact', 'preview'])
};

LinkBlock.defaultProps = {
  displayMode: 'full'
};

export default LinkBlock;
