import React, { useRef } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import BadgeCarouselCard from './BadgeCarouselCard';

/**
 * BadgeCarousel Component
 * Horizontal scrolling carousel for badges grouped by pillar
 * Features smooth scroll-snap behavior and navigation arrows
 */
export default function BadgeCarousel({ pillar, badges }) {
  const scrollContainerRef = useRef(null);

  // Scroll handlers
  const scrollLeft = () => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollBy({
        left: -300,
        behavior: 'smooth'
      });
    }
  };

  const scrollRight = () => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollBy({
        left: 300,
        behavior: 'smooth'
      });
    }
  };

  // Pillar color mapping
  const pillarColors = {
    'STEM & Logic': 'text-blue-600',
    'Life & Wellness': 'text-red-600',
    'Language & Communication': 'text-green-600',
    'Society & Culture': 'text-orange-600',
    'Arts & Creativity': 'text-purple-600'
  };

  const pillarColor = pillarColors[pillar] || 'text-gray-800';

  if (!badges || badges.length === 0) {
    return null;
  }

  return (
    <div className="mb-8">
      {/* Pillar header */}
      <div className="flex items-center justify-between mb-4">
        <h2 className={`text-2xl font-bold ${pillarColor}`}>
          {pillar}
        </h2>

        {/* Navigation arrows - only show if there are enough badges to scroll */}
        {badges.length > 3 && (
          <div className="flex gap-2">
            <button
              onClick={scrollLeft}
              className="
                p-2 rounded-full bg-white border border-gray-200
                hover:bg-gray-50 hover:border-gray-300
                transition-all duration-200 shadow-sm hover:shadow-md
              "
              aria-label="Scroll left"
            >
              <ChevronLeft className="w-5 h-5 text-gray-600" />
            </button>

            <button
              onClick={scrollRight}
              className="
                p-2 rounded-full bg-white border border-gray-200
                hover:bg-gray-50 hover:border-gray-300
                transition-all duration-200 shadow-sm hover:shadow-md
              "
              aria-label="Scroll right"
            >
              <ChevronRight className="w-5 h-5 text-gray-600" />
            </button>
          </div>
        )}
      </div>

      {/* Scrollable badge container */}
      <div className="relative">
        <div
          ref={scrollContainerRef}
          className="
            flex gap-4 overflow-x-auto pb-4
            scrollbar-thin scrollbar-thumb-gray-300 scrollbar-track-gray-100
            scroll-smooth
          "
          style={{
            scrollSnapType: 'x mandatory',
            WebkitOverflowScrolling: 'touch',
            scrollbarWidth: 'thin',
            scrollbarColor: '#D1D5DB #F3F4F6'
          }}
        >
          {badges.map((badge) => (
            <div
              key={badge.id}
              style={{ scrollSnapAlign: 'start' }}
            >
              <BadgeCarouselCard badge={badge} />
            </div>
          ))}
        </div>

        {/* Gradient fade at edges for visual cue */}
        <div className="absolute top-0 left-0 bottom-4 w-8 bg-gradient-to-r from-gray-50 to-transparent pointer-events-none" />
        <div className="absolute top-0 right-0 bottom-4 w-8 bg-gradient-to-l from-gray-50 to-transparent pointer-events-none" />
      </div>
    </div>
  );
}
