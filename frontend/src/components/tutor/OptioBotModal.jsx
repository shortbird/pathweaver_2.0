import React, { useEffect, useState } from 'react';
import { Bot, X, RotateCcw } from 'lucide-react';
import ChatInterface from './ChatInterface';

const CONVERSATION_MODES = [
  { value: 'study_buddy', label: 'Study Buddy', description: 'Casual and encouraging' },
  { value: 'teacher', label: 'Teacher', description: 'Structured lessons' },
  { value: 'discovery', label: 'Explorer', description: 'Question-based learning' },
  { value: 'review', label: 'Reviewer', description: 'Review and practice' },
  { value: 'creative', label: 'Creator', description: 'Creative brainstorming' }
];

const OptioBotModal = ({
  isOpen,
  onClose,
  currentQuest = null,
  currentTask = null,
  conversationId = null,
  onConversationCreate = null,
  onStartNewConversation = null
}) => {
  const [selectedMode, setSelectedMode] = useState('teacher');
  const [showModeSelector, setShowModeSelector] = useState(false);

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

  const handleModeChange = (newMode) => {
    setSelectedMode(newMode);
    setShowModeSelector(false);
  };

  const currentModeInfo = CONVERSATION_MODES.find(mode => mode.value === selectedMode);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-hidden">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black bg-opacity-50 transition-opacity"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="absolute inset-x-4 inset-y-8 max-w-4xl mx-auto bg-white rounded-2xl shadow-2xl flex flex-col">
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

          <div className="flex items-center space-x-4">
            {/* New Conversation Button */}
            {conversationId && onStartNewConversation && (
              <button
                onClick={() => {
                  onStartNewConversation();
                  setShowModeSelector(false);
                }}
                className="bg-white/20 text-white px-3 py-2 rounded-full text-sm hover:bg-white/30 transition-colors flex items-center space-x-1"
                title="Start new conversation"
              >
                <RotateCcw className="w-4 h-4" />
                <span>New Chat</span>
              </button>
            )}

            {/* Mode Selector */}
            <div className="relative">
              <button
                onClick={() => setShowModeSelector(!showModeSelector)}
                className="bg-white/20 text-white px-4 py-2 rounded-full text-sm hover:bg-white/30 transition-colors flex items-center space-x-2"
              >
                <span>{currentModeInfo?.label}</span>
              </button>

              {showModeSelector && (
                <div className="absolute top-full right-0 mt-2 w-64 bg-white rounded-lg shadow-xl border z-50">
                  <div className="p-2">
                    {CONVERSATION_MODES.map(mode => (
                      <button
                        key={mode.value}
                        onClick={() => handleModeChange(mode.value)}
                        className={`w-full text-left p-3 rounded-lg hover:bg-gray-50 transition-colors ${
                          selectedMode === mode.value ? 'bg-purple-50 border border-purple-200' : ''
                        }`}
                      >
                        <div className="flex items-center space-x-3">
                          <div>
                            <div className="font-medium text-gray-900">{mode.label}</div>
                            <div className="text-sm text-gray-500">{mode.description}</div>
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

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
            conversationId={conversationId}
            currentQuest={null}
            currentTask={null}
            onClose={onClose}
            selectedMode={selectedMode}
            hideHeader={true}
            className="h-full border-0 shadow-none rounded-none"
            onConversationCreate={onConversationCreate}
          />
        </div>
      </div>
    </div>
  );
};

export default OptioBotModal;