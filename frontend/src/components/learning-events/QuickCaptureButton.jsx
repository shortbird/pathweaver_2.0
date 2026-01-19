import React, { useState, useEffect, useCallback } from 'react';
import { PlusIcon, SparklesIcon } from '@heroicons/react/24/outline';
import LearningEventModal from './LearningEventModal';

const QuickCaptureButton = ({ onSuccess }) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isHovered, setIsHovered] = useState(false);

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
          <div className={`
            flex items-center gap-2 px-4 py-3 rounded-full shadow-lg
            bg-gradient-to-r from-optio-purple to-optio-pink
            text-white font-semibold
            transform transition-all duration-300 ease-out
            hover:shadow-xl hover:scale-105
            ${isHovered ? 'pr-6' : ''}
          `}>
            <SparklesIcon className="w-5 h-5" />
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

          {/* Pulse animation ring */}
          <div className="absolute inset-0 rounded-full bg-gradient-to-r from-optio-purple to-optio-pink opacity-30 animate-ping" />
        </div>
      </button>

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
