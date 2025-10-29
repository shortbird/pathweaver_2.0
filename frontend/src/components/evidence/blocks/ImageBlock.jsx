/**
 * ImageBlock - Displays image evidence with lightbox
 */

import React, { useState } from 'react';
import PropTypes from 'prop-types';

const ImageBlock = ({ block, displayMode }) => {
  const { content } = block;
  const { url, alt, caption, filename } = content;
  const [showLightbox, setShowLightbox] = useState(false);
  const [imageError, setImageError] = useState(false);

  if (imageError) {
    return (
      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6">
        <div className="flex items-center gap-3">
          <svg className="h-6 w-6 text-yellow-600 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <div>
            <p className="font-semibold text-yellow-900" style={{ fontFamily: 'Poppins, sans-serif' }}>
              Image unavailable
            </p>
            <p className="text-sm text-yellow-800 font-medium" style={{ fontFamily: 'Poppins, sans-serif' }}>
              {filename || 'Unknown file'}
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <div
          className="cursor-pointer hover:opacity-90 transition-opacity"
          onClick={() => setShowLightbox(true)}
        >
          <img
            src={url}
            alt={alt || 'Student evidence image'}
            className="w-full h-auto"
            onError={() => setImageError(true)}
            loading="lazy"
          />
        </div>

        {caption && (
          <div className="p-4 bg-gray-50 border-t border-gray-200">
            <p className="text-sm text-gray-700 font-medium" style={{ fontFamily: 'Poppins, sans-serif' }}>
              {caption}
            </p>
          </div>
        )}
      </div>

      {/* Lightbox Modal */}
      {showLightbox && (
        <div
          className="fixed inset-0 bg-black bg-opacity-90 z-50 flex items-center justify-center p-4"
          onClick={() => setShowLightbox(false)}
        >
          <button
            onClick={() => setShowLightbox(false)}
            className="absolute top-4 right-4 text-white hover:text-gray-300 transition-colors"
            aria-label="Close lightbox"
          >
            <svg className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>

          <img
            src={url}
            alt={alt || 'Student evidence image'}
            className="max-w-full max-h-full object-contain"
            onClick={(e) => e.stopPropagation()}
          />

          {caption && (
            <div className="absolute bottom-0 left-0 right-0 bg-black bg-opacity-75 p-4 text-center">
              <p className="text-white font-medium" style={{ fontFamily: 'Poppins, sans-serif' }}>
                {caption}
              </p>
            </div>
          )}
        </div>
      )}
    </>
  );
};

ImageBlock.propTypes = {
  block: PropTypes.shape({
    content: PropTypes.shape({
      url: PropTypes.string.isRequired,
      alt: PropTypes.string,
      caption: PropTypes.string,
      filename: PropTypes.string
    }).isRequired
  }).isRequired,
  displayMode: PropTypes.oneOf(['full', 'compact', 'preview'])
};

ImageBlock.defaultProps = {
  displayMode: 'full'
};

export default ImageBlock;
