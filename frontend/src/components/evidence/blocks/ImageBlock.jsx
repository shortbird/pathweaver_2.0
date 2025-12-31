/**
 * ImageBlock - Displays image evidence with lightbox
 * Supports both old format (content.url) and new format (content.items)
 */

import React, { useState } from 'react';
import PropTypes from 'prop-types';

const ImageBlock = ({ block, displayMode }) => {
  const { content } = block;
  const [showLightbox, setShowLightbox] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState(0);
  const [imageErrors, setImageErrors] = useState({});

  // Handle both old format (content.url) and new format (content.items)
  const items = content?.items || (content?.url ? [{
    url: content.url,
    alt: content.alt,
    caption: content.caption,
    filename: content.filename
  }] : []);

  // Handle empty items
  if (items.length === 0) {
    return (
      <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 text-center text-gray-500">
        No image content
      </div>
    );
  }

  const handleImageError = (index) => {
    setImageErrors(prev => ({ ...prev, [index]: true }));
  };

  const openLightbox = (index) => {
    setLightboxIndex(index);
    setShowLightbox(true);
  };

  // Render a single image item
  const renderImageItem = (item, index) => {
    const { url, alt, caption, filename } = item;

    if (!url) {
      return null;
    }

    if (imageErrors[index]) {
      return (
        <div key={index} className="bg-yellow-50 border border-yellow-200 rounded-lg p-6">
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
      <div key={index} className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <div
          className="cursor-pointer hover:opacity-90 transition-opacity"
          onClick={() => openLightbox(index)}
        >
          <img
            src={url}
            alt={alt || caption || 'Student evidence image'}
            className="w-full h-auto"
            onError={() => handleImageError(index)}
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
    );
  };

  // Get current lightbox item
  const currentItem = items[lightboxIndex] || {};

  return (
    <>
      {/* Image grid */}
      <div className={`${items.length === 1 ? '' : 'grid gap-3'} ${items.length === 2 ? 'grid-cols-2' : items.length >= 3 ? 'grid-cols-3' : ''}`}>
        {items.map((item, index) => renderImageItem(item, index))}
      </div>

      {/* Lightbox Modal */}
      {showLightbox && currentItem.url && (
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

          {/* Navigation arrows for multiple images */}
          {items.length > 1 && (
            <>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setLightboxIndex((prev) => (prev - 1 + items.length) % items.length);
                }}
                className="absolute left-4 top-1/2 -translate-y-1/2 text-white hover:text-gray-300 transition-colors p-2"
                aria-label="Previous image"
              >
                <svg className="h-10 w-10" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setLightboxIndex((prev) => (prev + 1) % items.length);
                }}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-white hover:text-gray-300 transition-colors p-2"
                aria-label="Next image"
              >
                <svg className="h-10 w-10" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </button>
            </>
          )}

          <img
            src={currentItem.url}
            alt={currentItem.alt || currentItem.caption || 'Student evidence image'}
            className="max-w-full max-h-full object-contain"
            onClick={(e) => e.stopPropagation()}
          />

          {(currentItem.caption || items.length > 1) && (
            <div className="absolute bottom-0 left-0 right-0 bg-black bg-opacity-75 p-4 text-center">
              {currentItem.caption && (
                <p className="text-white font-medium" style={{ fontFamily: 'Poppins, sans-serif' }}>
                  {currentItem.caption}
                </p>
              )}
              {items.length > 1 && (
                <p className="text-white/70 text-sm mt-1" style={{ fontFamily: 'Poppins, sans-serif' }}>
                  {lightboxIndex + 1} / {items.length}
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </>
  );
};

ImageBlock.propTypes = {
  block: PropTypes.shape({
    content: PropTypes.oneOfType([
      PropTypes.shape({
        url: PropTypes.string,
        alt: PropTypes.string,
        caption: PropTypes.string,
        filename: PropTypes.string
      }),
      PropTypes.shape({
        items: PropTypes.arrayOf(PropTypes.shape({
          url: PropTypes.string,
          alt: PropTypes.string,
          caption: PropTypes.string,
          filename: PropTypes.string
        }))
      })
    ])
  }).isRequired,
  displayMode: PropTypes.oneOf(['full', 'compact', 'preview'])
};

ImageBlock.defaultProps = {
  displayMode: 'full'
};

export default ImageBlock;
