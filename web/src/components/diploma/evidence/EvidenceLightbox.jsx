import React, { useEffect, useCallback, useRef } from 'react';

const EvidenceLightbox = ({
  isOpen,
  images = [],
  currentIndex = 0,
  onClose,
  onNext,
  onPrevious
}) => {
  const currentImage = images[currentIndex];
  const hasMultipleImages = images.length > 1;
  // Track if this component instance set the overflow
  const didLockScroll = useRef(false);

  // Keyboard navigation
  const handleKeyDown = useCallback((event) => {
    if (!isOpen) return;

    switch (event.key) {
      case 'Escape':
        onClose();
        break;
      case 'ArrowLeft':
        if (hasMultipleImages && onPrevious) {
          onPrevious();
        }
        break;
      case 'ArrowRight':
        if (hasMultipleImages && onNext) {
          onNext();
        }
        break;
      default:
        break;
    }
  }, [isOpen, hasMultipleImages, onClose, onNext, onPrevious]);

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  // Prevent body scroll when lightbox is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
      didLockScroll.current = true;
    }

    return () => {
      // Only reset if this component was the one that locked scroll
      if (didLockScroll.current) {
        document.body.style.overflow = '';
        didLockScroll.current = false;
      }
    };
  }, [isOpen]);

  if (!isOpen || !currentImage) {
    return null;
  }

  const handleBackdropClick = (event) => {
    if (event.target === event.currentTarget) {
      onClose();
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black/90 backdrop-blur-sm z-[60] flex items-center justify-center p-4"
      onClick={handleBackdropClick}
    >
      {/* Close button */}
      <button
        onClick={onClose}
        className="absolute top-4 right-4 z-10 bg-white/20 backdrop-blur-sm hover:bg-white/30 rounded-full p-3 transition-colors"
        aria-label="Close lightbox"
      >
        <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>

      {/* Previous button */}
      {hasMultipleImages && currentIndex > 0 && (
        <button
          onClick={onPrevious}
          className="absolute left-4 top-1/2 -translate-y-1/2 z-10 bg-white/20 backdrop-blur-sm hover:bg-white/30 rounded-full p-3 transition-colors"
          aria-label="Previous image"
        >
          <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
      )}

      {/* Next button */}
      {hasMultipleImages && currentIndex < images.length - 1 && (
        <button
          onClick={onNext}
          className="absolute right-4 top-1/2 -translate-y-1/2 z-10 bg-white/20 backdrop-blur-sm hover:bg-white/30 rounded-full p-3 transition-colors"
          aria-label="Next image"
        >
          <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </button>
      )}

      {/* Image container */}
      <div className="relative max-w-full max-h-full flex flex-col">
        <div className="relative flex-1 flex items-center justify-center">
          <img
            src={currentImage.content.url}
            alt={currentImage.content.alt || 'Evidence image'}
            className="max-w-full max-h-[calc(100vh-160px)] object-contain rounded-lg shadow-2xl"
            loading="lazy"
          />
        </div>

        {/* Image info */}
        <div className="mt-4 text-center">
          {currentImage.content.caption && (
            <p className="text-white/90 text-sm mb-2 max-w-2xl mx-auto">
              {currentImage.content.caption}
            </p>
          )}

          {hasMultipleImages && (
            <div className="flex items-center justify-center space-x-2">
              <span className="text-white/70 text-sm">
                {currentIndex + 1} of {images.length}
              </span>

              {/* Image indicators */}
              <div className="flex space-x-1 ml-3">
                {images.map((_, index) => (
                  <button
                    key={index}
                    onClick={() => onNext && onNext(index - currentIndex)}
                    className={`w-2 h-2 rounded-full transition-colors ${
                      index === currentIndex
                        ? 'bg-white'
                        : 'bg-white/40 hover:bg-white/60'
                    }`}
                    aria-label={`Go to image ${index + 1}`}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Download button */}
      <div className="absolute bottom-4 right-4">
        <a
          href={currentImage.content.url}
          target="_blank"
          rel="noopener noreferrer"
          className="bg-white/20 backdrop-blur-sm hover:bg-white/30 rounded-full p-3 transition-colors inline-flex"
          aria-label="View full size image"
        >
          <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
          </svg>
        </a>
      </div>

      {/* Touch/swipe indicators for mobile */}
      {hasMultipleImages && (
        <div className="absolute bottom-4 left-4 text-white/60 text-xs">
          <div className="flex items-center space-x-2">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16l-4-4m0 0l4-4m-4 4h18" />
            </svg>
            <span>Swipe or use arrow keys</span>
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
            </svg>
          </div>
        </div>
      )}
    </div>
  );
};

export default EvidenceLightbox;