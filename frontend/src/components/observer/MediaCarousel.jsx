import { useState, useRef, useEffect } from 'react';
import PropTypes from 'prop-types';
import { ChevronLeftIcon, ChevronRightIcon, LinkIcon, VideoCameraIcon } from '@heroicons/react/24/outline';
import DocumentPreview from './DocumentPreview';

/**
 * Instagram-style media carousel for displaying multiple images/media items.
 * Supports swipe gestures on touch devices and arrow navigation.
 */
const MediaCarousel = ({ media = [] }) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [touchStart, setTouchStart] = useState(null);
  const [touchEnd, setTouchEnd] = useState(null);
  const containerRef = useRef(null);

  // Filter to only image items for the carousel (other types shown separately)
  const imageItems = media.filter(item => item.type === 'image');
  const otherItems = media.filter(item => item.type !== 'image');

  // Minimum swipe distance to trigger slide change
  const minSwipeDistance = 50;

  const handleTouchStart = (e) => {
    setTouchEnd(null);
    setTouchStart(e.targetTouches[0].clientX);
  };

  const handleTouchMove = (e) => {
    setTouchEnd(e.targetTouches[0].clientX);
  };

  const handleTouchEnd = () => {
    if (!touchStart || !touchEnd) return;

    const distance = touchStart - touchEnd;
    const isLeftSwipe = distance > minSwipeDistance;
    const isRightSwipe = distance < -minSwipeDistance;

    if (isLeftSwipe && currentIndex < imageItems.length - 1) {
      setCurrentIndex(prev => prev + 1);
    }
    if (isRightSwipe && currentIndex > 0) {
      setCurrentIndex(prev => prev - 1);
    }
  };

  const goToNext = () => {
    if (currentIndex < imageItems.length - 1) {
      setCurrentIndex(prev => prev + 1);
    }
  };

  const goToPrev = () => {
    if (currentIndex > 0) {
      setCurrentIndex(prev => prev - 1);
    }
  };

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'ArrowLeft') goToPrev();
      if (e.key === 'ArrowRight') goToNext();
    };

    const container = containerRef.current;
    if (container) {
      container.addEventListener('keydown', handleKeyDown);
      return () => container.removeEventListener('keydown', handleKeyDown);
    }
  }, [currentIndex, imageItems.length]);

  if (media.length === 0) return null;

  // Single image - no carousel needed
  if (imageItems.length === 1 && otherItems.length === 0) {
    return (
      <div className="bg-gray-100 aspect-square flex items-center justify-center">
        <img
          src={imageItems[0].url}
          alt="Evidence"
          className="max-w-full max-h-full object-contain"
          loading="lazy"
        />
      </div>
    );
  }

  return (
    <div className="space-y-0">
      {/* Image Carousel */}
      {imageItems.length > 0 && (
        <div
          ref={containerRef}
          className="relative bg-gray-100 overflow-hidden"
          tabIndex={0}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
        >
          {/* Images container - fixed aspect ratio prevents layout shift */}
          <div
            className="flex transition-transform duration-300 ease-out"
            style={{ transform: `translateX(-${currentIndex * 100}%)` }}
          >
            {imageItems.map((item, index) => (
              <div key={index} className="w-full flex-shrink-0 aspect-square flex items-center justify-center bg-gray-100">
                <img
                  src={item.url}
                  alt={`Evidence ${index + 1}`}
                  className="max-w-full max-h-full object-contain"
                  loading={index === 0 ? 'eager' : 'lazy'}
                />
              </div>
            ))}
          </div>

          {/* Navigation arrows - only show on desktop and when multiple images */}
          {imageItems.length > 1 && (
            <>
              {currentIndex > 0 && (
                <button
                  onClick={goToPrev}
                  className="hidden sm:flex absolute left-2 top-1/2 -translate-y-1/2 w-8 h-8 bg-white/90 hover:bg-white rounded-full items-center justify-center shadow-lg transition-all"
                  aria-label="Previous image"
                >
                  <ChevronLeftIcon className="w-5 h-5 text-gray-700" />
                </button>
              )}
              {currentIndex < imageItems.length - 1 && (
                <button
                  onClick={goToNext}
                  className="hidden sm:flex absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 bg-white/90 hover:bg-white rounded-full items-center justify-center shadow-lg transition-all"
                  aria-label="Next image"
                >
                  <ChevronRightIcon className="w-5 h-5 text-gray-700" />
                </button>
              )}
            </>
          )}

          {/* Dot indicators - only show when multiple images */}
          {imageItems.length > 1 && (
            <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-1.5">
              {imageItems.map((_, index) => (
                <button
                  key={index}
                  onClick={() => setCurrentIndex(index)}
                  className={`w-2 h-2 rounded-full transition-all ${
                    index === currentIndex
                      ? 'bg-white w-4'
                      : 'bg-white/60 hover:bg-white/80'
                  }`}
                  aria-label={`Go to image ${index + 1}`}
                />
              ))}
            </div>
          )}

          {/* Image counter */}
          {imageItems.length > 1 && (
            <div className="absolute top-3 right-3 px-2 py-1 bg-black/60 text-white text-xs rounded-full">
              {currentIndex + 1} / {imageItems.length}
            </div>
          )}
        </div>
      )}

      {/* Non-image media items (videos, links, documents) */}
      {otherItems.map((item, index) => (
        <div key={`other-${index}`} className="bg-gray-100">
          {item.type === 'video' && (
            <div className="aspect-video bg-gray-900">
              {item.url.includes('youtube.com') || item.url.includes('youtu.be') ? (
                <iframe
                  src={item.url.replace('watch?v=', 'embed/').replace('youtu.be/', 'youtube.com/embed/')}
                  className="w-full h-full"
                  allowFullScreen
                  title="Video evidence"
                />
              ) : (
                <a
                  href={item.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-center h-full text-white hover:text-gray-300 min-h-[200px]"
                >
                  <VideoCameraIcon className="w-12 h-12" />
                  <span className="ml-2">Watch Video</span>
                </a>
              )}
            </div>
          )}
          {item.type === 'link' && (
            <a
              href={item.url}
              target="_blank"
              rel="noopener noreferrer"
              className="block p-4 bg-gray-50 hover:bg-gray-100 transition-colors"
            >
              <div className="flex items-center gap-3">
                <LinkIcon className="w-6 h-6 shrink-0 text-blue-600" />
                <div className="min-w-0">
                  <span className="text-base font-medium text-blue-600 block truncate">
                    {item.title || (() => {
                      try {
                        return new URL(item.url).hostname.replace('www.', '');
                      } catch {
                        return 'View Link';
                      }
                    })()}
                  </span>
                  <p className="text-sm text-gray-500 truncate">{item.url}</p>
                </div>
              </div>
            </a>
          )}
          {item.type === 'document' && (
            <DocumentPreview url={item.url} title={item.title} />
          )}
        </div>
      ))}
    </div>
  );
};

MediaCarousel.propTypes = {
  media: PropTypes.arrayOf(PropTypes.shape({
    type: PropTypes.oneOf(['image', 'video', 'link', 'document']).isRequired,
    url: PropTypes.string.isRequired,
    title: PropTypes.string
  }))
};

export default MediaCarousel;
