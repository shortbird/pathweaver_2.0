import React, { useState, useEffect } from 'react';
import { ChevronLeftIcon, ChevronRightIcon, XMarkIcon } from '@heroicons/react/24/outline';

/**
 * PhilosophyGuide Component
 * Onboarding carousel explaining curriculum design philosophy
 * Shows on first curriculum access with option to dismiss permanently
 */
const PhilosophyGuide = ({ isOpen, onClose }) => {
  const [currentSlide, setCurrentSlide] = useState(0);
  const [dontShowAgain, setDontShowAgain] = useState(false);

  const slides = [
    {
      title: 'Just-In-Time Teaching',
      subtitle: 'Learn Exactly When You Need It',
      icon: '⚡',
      content: [
        'Traditional education teaches skills years before you use them.',
        'Our curriculum delivers concepts right when you need them for your quest.',
        'This creates natural curiosity and immediate application.',
        'You\'re not studying for "someday" - you\'re learning for RIGHT NOW.'
      ],
      gradient: 'from-optio-purple to-purple-700'
    },
    {
      title: 'Zone of Proximal Development',
      subtitle: 'Supported Stretching',
      icon: '🎯',
      content: [
        'We meet you where you are, then guide you one step beyond.',
        'Lessons introduce concepts slightly above your current level.',
        'Scaffolding and examples help you bridge the gap.',
        'You\'re always challenged, never overwhelmed.'
      ],
      gradient: 'from-purple-600 to-optio-pink'
    },
    {
      title: 'Tasks as Demonstrations',
      subtitle: 'Show What You Know',
      icon: '✨',
      content: [
        'Every task is a chance to demonstrate your understanding.',
        'You\'re not memorizing facts - you\'re creating real things.',
        'Your work becomes evidence of growth and capability.',
        'Learning becomes visible through what you build.'
      ],
      gradient: 'from-optio-pink to-pink-700'
    },
    {
      title: 'Process Over Outcomes',
      subtitle: 'The Journey IS the Goal',
      icon: '🌱',
      content: [
        'We celebrate your learning process, not just completion.',
        'Mistakes and iterations are expected and valued.',
        'Progress is measured by growth, not grades.',
        'You\'re becoming who you want to be, right now.'
      ],
      gradient: 'from-pink-600 to-optio-purple'
    }
  ];

  const totalSlides = slides.length;

  const handleNext = () => {
    setCurrentSlide((prev) => (prev + 1) % totalSlides);
  };

  const handlePrevious = () => {
    setCurrentSlide((prev) => (prev - 1 + totalSlides) % totalSlides);
  };

  const handleClose = () => {
    if (dontShowAgain) {
      localStorage.setItem('optio_curriculum_philosophy_dismissed', 'true');
    }
    onClose();
  };

  const handleSkip = () => {
    handleClose();
  };

  // Keyboard navigation
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e) => {
      if (e.key === 'ArrowLeft') {
        handlePrevious();
      } else if (e.key === 'ArrowRight') {
        handleNext();
      } else if (e.key === 'Escape') {
        handleClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  if (!isOpen) return null;

  const currentSlideData = slides[currentSlide];

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-70 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="philosophy-guide-title"
    >
      <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full relative overflow-hidden">
        {/* Close Button */}
        <button
          onClick={handleClose}
          className="absolute top-4 right-4 text-white hover:text-gray-200 transition-colors z-10"
          aria-label="Close philosophy guide"
        >
          <XMarkIcon className="w-6 h-6" />
        </button>

        {/* Gradient Header with Icon */}
        <div className={`bg-gradient-to-r ${currentSlideData.gradient} p-8 text-white`}>
          <div className="text-center">
            <div className="text-6xl mb-4" role="img" aria-label={currentSlideData.title}>
              {currentSlideData.icon}
            </div>
            <h2
              id="philosophy-guide-title"
              className="text-3xl font-bold mb-2"
              style={{ fontFamily: 'Poppins, sans-serif' }}
            >
              {currentSlideData.title}
            </h2>
            <p className="text-xl opacity-90">
              {currentSlideData.subtitle}
            </p>
          </div>
        </div>

        {/* Content */}
        <div className="p-8">
          <ul className="space-y-4 text-gray-700">
            {currentSlideData.content.map((point, index) => (
              <li key={index} className="flex items-start">
                <span className="text-optio-purple mr-3 mt-1 text-xl">•</span>
                <span className="text-lg leading-relaxed">{point}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* Progress Dots */}
        <div className="flex justify-center space-x-2 px-8 pb-6">
          {slides.map((_, index) => (
            <button
              key={index}
              onClick={() => setCurrentSlide(index)}
              className={`w-3 h-3 rounded-full transition-all ${
                index === currentSlide
                  ? 'bg-optio-purple w-8'
                  : 'bg-gray-300 hover:bg-gray-400'
              }`}
              aria-label={`Go to slide ${index + 1}`}
              aria-current={index === currentSlide ? 'true' : 'false'}
            />
          ))}
        </div>

        {/* Navigation and Controls */}
        <div className="px-8 pb-8 flex items-center justify-between">
          {/* Previous Button */}
          <button
            onClick={handlePrevious}
            className="flex items-center text-gray-600 hover:text-optio-purple transition-colors disabled:opacity-50"
            disabled={currentSlide === 0}
            aria-label="Previous slide"
          >
            <ChevronLeftIcon className="w-5 h-5 mr-1" />
            <span className="font-medium">Previous</span>
          </button>

          {/* Center: Don't Show Again Checkbox */}
          <div className="flex items-center">
            <input
              type="checkbox"
              id="dont-show-again"
              checked={dontShowAgain}
              onChange={(e) => setDontShowAgain(e.target.checked)}
              className="w-4 h-4 text-optio-purple border-gray-300 rounded focus:ring-optio-purple focus:ring-2"
            />
            <label htmlFor="dont-show-again" className="ml-2 text-sm text-gray-600">
              Don't show again
            </label>
          </div>

          {/* Next/Skip Button */}
          {currentSlide < totalSlides - 1 ? (
            <button
              onClick={handleNext}
              className="flex items-center text-gray-600 hover:text-optio-purple transition-colors"
              aria-label="Next slide"
            >
              <span className="font-medium">Next</span>
              <ChevronRightIcon className="w-5 h-5 ml-1" />
            </button>
          ) : (
            <button
              onClick={handleSkip}
              className="px-6 py-2 bg-gradient-to-r from-optio-purple to-optio-pink text-white rounded-lg hover:shadow-lg transition-shadow font-medium"
            >
              Get Started
            </button>
          )}
        </div>

        {/* Skip Link (top-right on all slides) */}
        <div className="absolute top-4 left-4">
          <button
            onClick={handleSkip}
            className="text-white text-sm hover:underline opacity-90"
          >
            Skip Tutorial
          </button>
        </div>

        {/* Slide Counter */}
        <div className="absolute bottom-4 right-8 text-sm text-gray-500">
          {currentSlide + 1} / {totalSlides}
        </div>
      </div>
    </div>
  );
};

/**
 * Hook to check if philosophy guide should be shown
 */
export const useShouldShowPhilosophyGuide = () => {
  const [shouldShow, setShouldShow] = useState(false);

  useEffect(() => {
    const dismissed = localStorage.getItem('optio_curriculum_philosophy_dismissed');
    setShouldShow(!dismissed);
  }, []);

  return shouldShow;
};

export default PhilosophyGuide;
