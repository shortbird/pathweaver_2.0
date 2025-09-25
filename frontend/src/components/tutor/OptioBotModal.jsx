import React, { useState, useEffect } from 'react';
import { Bot, X, Minimize2, MessageSquare } from 'lucide-react';
import ChatInterface from './ChatInterface';

const OptioBotModal = ({
  isOpen,
  onClose,
  currentQuest = null,
  currentTask = null
}) => {
  const [isMinimized, setIsMinimized] = useState(false);

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
      <div className={`absolute inset-4 bg-white rounded-2xl shadow-2xl flex flex-col transition-all duration-300 ${
        isMinimized ? 'bottom-4 top-auto h-16' : ''
      }`}>

        {/* Header */}
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
            {/* Minimize Button */}
            <button
              onClick={() => setIsMinimized(!isMinimized)}
              className="w-10 h-10 bg-white/20 text-white rounded-full flex items-center justify-center hover:bg-white/30 transition-colors"
              title={isMinimized ? "Expand" : "Minimize"}
            >
              <Minimize2 className="w-5 h-5" />
            </button>

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
        {!isMinimized && (
          <div className="flex-1 overflow-hidden">
            <ChatInterface
              currentQuest={currentQuest}
              currentTask={currentTask}
              onClose={onClose}
              className="h-full border-0 shadow-none rounded-none"
            />
          </div>
        )}

        {/* Minimized state */}
        {isMinimized && (
          <div className="flex items-center justify-between px-6 py-4">
            <div className="flex items-center space-x-3">
              <Bot className="w-5 h-5 text-[#6d469b]" />
              <span className="text-gray-700 font-medium">OptioBot is ready to help!</span>
            </div>
            <button
              onClick={() => setIsMinimized(false)}
              className="bg-gradient-to-r from-[#ef597b] to-[#6d469b] text-white px-4 py-2 rounded-full text-sm hover:shadow-lg transition-shadow flex items-center space-x-2"
            >
              <MessageSquare className="w-4 h-4" />
              <span>Continue Chat</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default OptioBotModal;