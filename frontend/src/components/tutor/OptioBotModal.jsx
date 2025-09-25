import React, { useEffect } from 'react';
import { Bot, X } from 'lucide-react';
import ChatInterface from './ChatInterface';

const OptioBotModal = ({
  isOpen,
  onClose,
  currentQuest = null,
  currentTask = null
}) => {

  // Close modal on Escape key
  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === 'Escape' && isOpen) {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown);
      // Prevent body scroll when modal is open
      document.body.style.overflow = 'hidden';
    }

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = 'unset';
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-hidden">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black bg-opacity-50 transition-opacity"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="absolute inset-4 bg-white rounded-2xl shadow-2xl flex flex-col">
        {/* Single Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200 bg-gradient-to-r from-[#ef597b] to-[#6d469b] rounded-t-2xl">
          <div className="flex items-center space-x-4">
            <div className="w-12 h-12 bg-white rounded-full flex items-center justify-center shadow-md">
              <Bot className="w-7 h-7 text-[#6d469b]" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-white">OptioBot</h2>
              <p className="text-white/80 text-sm">Your AI Learning Companion</p>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            {/* Close Button */}
            <button
              onClick={onClose}
              className="w-10 h-10 bg-white/20 text-white rounded-full flex items-center justify-center hover:bg-white/30 transition-colors"
              title="Close"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-hidden">
          <ChatInterface
            currentQuest={null}
            currentTask={null}
            onClose={onClose}
            className="h-full border-0 shadow-none rounded-none"
          />
        </div>
      </div>
    </div>
  );
};

export default OptioBotModal;