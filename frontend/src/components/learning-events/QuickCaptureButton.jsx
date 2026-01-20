import React, { useState, useEffect, useCallback } from 'react';
import { PlusIcon } from '@heroicons/react/24/outline';
import LearningEventModal from './LearningEventModal';

const OPTIO_LOGO_URL = 'https://auth.optioeducation.com/storage/v1/object/public/site-assets/logos/gradient_fav.svg';

const QuickCaptureButton = ({ onSuccess }) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const [isWiggling, setIsWiggling] = useState(false);

  // Keyboard shortcut: Ctrl+Shift+L
  const handleKeyDown = useCallback((e) => {
    if (e.ctrlKey && e.shiftKey && e.key === 'L') {
      e.preventDefault();
      setIsModalOpen(true);
    }
  }, []);

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [handleKeyDown]);

  // Random wiggle every 2-10 seconds
  useEffect(() => {
    const scheduleWiggle = () => {
      const delay = 2000 + Math.random() * 8000; // 2-10 seconds
      return setTimeout(() => {
        setIsWiggling(true);
        setTimeout(() => setIsWiggling(false), 500); // Wiggle duration
        scheduleWiggle();
      }, delay);
    };

    const timeoutId = scheduleWiggle();
    return () => clearTimeout(timeoutId);
  }, []);

  const handleSuccess = (event) => {
    setIsModalOpen(false);
    onSuccess && onSuccess(event);
  };

  return (
    <>
      {/* Floating Action Button */}
      <button
        onClick={() => setIsModalOpen(true)}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        className="fixed bottom-6 right-6 z-40 group"
        title="Capture Learning Moment (Ctrl+Shift+L)"
        aria-label="Capture a learning moment"
      >
        <div className="relative">
          {/* Main button */}
          <div
            className={`
              flex items-center gap-2 px-4 py-3 rounded-full shadow-lg
              bg-white border-2 border-optio-purple
              text-optio-purple font-semibold
              transform transition-all duration-300 ease-out
              hover:shadow-xl hover:scale-105
              ${isHovered ? 'pr-6' : ''}
              ${isWiggling ? 'animate-wiggle' : ''}
            `}
            style={isWiggling ? {
              animation: 'wiggle 0.5s ease-in-out'
            } : {}}
          >
            <img src={OPTIO_LOGO_URL} alt="" className="w-5 h-5" />
            <span className={`
              overflow-hidden transition-all duration-300 ease-out whitespace-nowrap
              ${isHovered ? 'max-w-40 opacity-100' : 'max-w-0 opacity-0'}
            `}>
              Capture Moment
            </span>
            <PlusIcon className={`
              w-5 h-5 transition-transform duration-300
              ${isHovered ? 'rotate-90' : ''}
            `} />
          </div>

          {/* Keyboard shortcut hint */}
          <div className={`
            absolute -top-8 left-1/2 -translate-x-1/2
            px-2 py-1 rounded bg-gray-900 text-white text-xs whitespace-nowrap
            transition-opacity duration-200
            ${isHovered ? 'opacity-100' : 'opacity-0 pointer-events-none'}
          `}>
            Ctrl+Shift+L
          </div>

        </div>
      </button>

      {/* Wiggle animation keyframes */}
      <style>{`
        @keyframes wiggle {
          0%, 100% { transform: rotate(0deg); }
          20% { transform: rotate(-8deg); }
          40% { transform: rotate(8deg); }
          60% { transform: rotate(-5deg); }
          80% { transform: rotate(5deg); }
        }
      `}</style>

      {/* Learning Event Modal */}
      <LearningEventModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSuccess={handleSuccess}
        quickMode={true}
      />
    </>
  );
};

export default QuickCaptureButton;
