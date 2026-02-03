import React, { useState, useRef, useEffect } from 'react';
import { Dialog } from '@headlessui/react';
import {
  XMarkIcon,
  ArrowLeftIcon,
  LightBulbIcon,
  ArrowsPointingOutIcon,
  ArrowPathIcon,
  SparklesIcon
} from '@heroicons/react/24/outline';
import api from '../../services/api';
import { renderMarkdown } from '../../utils/markdownRenderer';
import { useAIAccess } from '../../contexts/AIAccessContext';

// Category definitions
const CATEGORIES = [
  {
    id: 'understand',
    label: 'Help me understand',
    icon: LightBulbIcon,
    description: 'Simplify or explain this content',
    options: [
      { id: 'simplify', label: 'Simplify it', prompt: 'Please simplify this content using easier words that are simple to understand.' },
      { id: 'example', label: 'Give me an example', prompt: 'Give me a real-world example of this concept.' },
      { id: 'analogy', label: 'Use an analogy', prompt: 'Explain this using an analogy I can relate to.' },
      { id: 'diagram', label: 'Draw a diagram', prompt: 'Draw a simple ASCII diagram to help me visualize this concept.' }
    ]
  },
  {
    id: 'deeper',
    label: 'Go deeper',
    icon: ArrowsPointingOutIcon,
    description: 'More detail, context, connections',
    options: [
      { id: 'why', label: 'Why does this matter?', prompt: 'Why is this concept important? How will it help me?' },
      { id: 'details', label: 'Show me the details', prompt: 'Give me more detailed information about this topic.' },
      { id: 'realworld', label: 'Real-world applications', prompt: 'How is this used in the real world? Give me practical applications.' },
      { id: 'connections', label: 'What connects to this?', prompt: 'What other concepts or topics connect to this? How does it fit in the bigger picture?' }
    ]
  },
  {
    id: 'perspective',
    label: 'Different perspective',
    icon: ArrowPathIcon,
    description: 'Creative and alternative viewpoints',
    options: [
      { id: 'opposite', label: 'Opposite viewpoint', prompt: 'Present the opposite viewpoint or counterargument to this concept.' },
      { id: 'whatif', label: 'What if...?', prompt: 'Explore some interesting "what if" scenarios related to this concept.' },
      { id: 'expert', label: 'How would an expert see this?', prompt: 'How would an expert in this field think about or approach this concept?' }
    ]
  }
];

// Follow-up actions after AI responds
const FOLLOWUP_ACTIONS = [
  { id: 'another', label: 'Try another way', prompt: 'Explain this again, but using a completely different approach.' },
  { id: 'more', label: 'Tell me more', prompt: 'Tell me more about this. Go deeper into the details.' }
];

const LessonHelperModal = ({
  isOpen,
  onClose,
  lessonId,
  blockIndex,
  stepTitle = '',
  totalSteps = 1,
  currentStepIndex = 0
}) => {
  const { canUseLessonHelper } = useAIAccess();

  // View state: 'menu' | 'submenu' | 'response'
  const [view, setView] = useState('menu');
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [response, setResponse] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [conversationId, setConversationId] = useState(null);
  const responseRef = useRef(null);

  // Reset state when modal closes
  useEffect(() => {
    if (!isOpen) {
      setView('menu');
      setSelectedCategory(null);
      setResponse(null);
      setError(null);
      // Keep conversationId for continuity within session
    }
  }, [isOpen]);

  // Scroll to top of response when it changes
  useEffect(() => {
    if (response && responseRef.current) {
      responseRef.current.scrollTop = 0;
    }
  }, [response]);

  // Don't render if AI lesson helper is disabled
  if (!canUseLessonHelper) {
    return null;
  }

  const sendRequest = async (prompt, actionType) => {
    setIsLoading(true);
    setError(null);

    try {
      const payload = {
        message: prompt,
        conversation_id: conversationId,
        mode: 'teacher',
        lesson_id: lessonId,
        block_index: blockIndex,
        action_type: actionType
      };

      const apiResponse = await api.post('/api/tutor/chat', payload);
      const responseData = apiResponse.data.data || apiResponse.data;

      setResponse(responseData.response);
      setView('response');

      // Save conversation ID for follow-up requests
      if (!conversationId && responseData.conversation_id) {
        setConversationId(responseData.conversation_id);
      }
    } catch (err) {
      console.error('Failed to get AI response:', err);
      setError('Sorry, something went wrong. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCategorySelect = (category) => {
    setSelectedCategory(category);
    setView('submenu');
  };

  const handleOptionSelect = (option) => {
    sendRequest(option.prompt, option.id);
  };

  const handleFollowUp = (action) => {
    sendRequest(action.prompt, action.id);
  };

  const handleBack = () => {
    if (view === 'submenu') {
      setView('menu');
      setSelectedCategory(null);
    } else if (view === 'response') {
      setView('menu');
      setSelectedCategory(null);
      setResponse(null);
    }
  };

  const handleClose = () => {
    onClose();
  };

  return (
    <Dialog open={isOpen} onClose={handleClose} className="z-50">
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/40" aria-hidden="true" />

      {/* Modal container */}
      <div className="fixed inset-0 flex items-center justify-center p-4">
        <Dialog.Panel className="w-full max-w-lg bg-white rounded-2xl shadow-2xl overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 bg-gray-50">
            <div className="flex items-center gap-3">
              {view !== 'menu' && (
                <button
                  onClick={handleBack}
                  className="p-1.5 -ml-1.5 rounded-lg text-gray-500 hover:text-gray-700 hover:bg-gray-200 transition-colors"
                  title="Back"
                >
                  <ArrowLeftIcon className="w-5 h-5" />
                </button>
              )}
              <div className="flex items-center gap-2 min-w-0">
                <SparklesIcon className="w-5 h-5 text-optio-purple flex-shrink-0" />
                <Dialog.Title className="font-semibold text-gray-900 text-sm whitespace-nowrap">
                  {view === 'submenu' && selectedCategory ? selectedCategory.label : 'Lesson Helper'}
                </Dialog.Title>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-sm text-gray-500">
                Step {currentStepIndex + 1} of {totalSteps}
              </span>
              <button
                onClick={handleClose}
                className="p-1.5 rounded-lg text-gray-500 hover:text-gray-700 hover:bg-gray-200 transition-colors"
                title="Close"
              >
                <XMarkIcon className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Content */}
          <div className="p-5">
            {/* Error display */}
            {error && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                {error}
              </div>
            )}

            {/* Loading state */}
            {isLoading && (
              <div className="flex flex-col items-center justify-center py-12">
                <div className="flex space-x-2 mb-4">
                  <div className="w-3 h-3 bg-optio-purple rounded-full animate-bounce" />
                  <div className="w-3 h-3 bg-optio-purple rounded-full animate-bounce" style={{ animationDelay: '0.1s' }} />
                  <div className="w-3 h-3 bg-optio-purple rounded-full animate-bounce" style={{ animationDelay: '0.2s' }} />
                </div>
                <p className="text-gray-500 text-sm">Thinking...</p>
              </div>
            )}

            {/* Menu view - Category selection */}
            {view === 'menu' && !isLoading && (
              <div className="grid grid-cols-3 gap-3">
                {CATEGORIES.map((category) => (
                  <button
                    key={category.id}
                    onClick={() => handleCategorySelect(category)}
                    className="flex flex-col items-center p-4 rounded-xl border-2 border-gray-100 hover:border-optio-purple/40 hover:bg-optio-purple/5 transition-all text-center group"
                  >
                    <category.icon className="w-8 h-8 text-gray-400 group-hover:text-optio-purple transition-colors mb-3" />
                    <span className="font-medium text-gray-800 text-sm leading-tight mb-1">
                      {category.label}
                    </span>
                    <span className="text-xs text-gray-500 leading-tight">
                      {category.description}
                    </span>
                  </button>
                ))}
              </div>
            )}

            {/* Submenu view - Option selection */}
            {view === 'submenu' && selectedCategory && !isLoading && (
              <div className="grid grid-cols-2 gap-3">
                {selectedCategory.options.map((option) => (
                  <button
                    key={option.id}
                    onClick={() => handleOptionSelect(option)}
                    className="p-4 rounded-xl border-2 border-gray-100 hover:border-optio-purple/40 hover:bg-optio-purple/5 transition-all text-left"
                  >
                    <span className="font-medium text-gray-800 text-sm">
                      {option.label}
                    </span>
                  </button>
                ))}
              </div>
            )}

            {/* Response view */}
            {view === 'response' && response && !isLoading && (
              <div>
                <div
                  ref={responseRef}
                  className="max-h-72 overflow-y-auto mb-4 prose prose-sm max-w-none prose-headings:text-gray-900 prose-p:text-gray-700 prose-li:text-gray-700"
                >
                  {renderMarkdown(response)}
                </div>

                {/* Follow-up actions */}
                <div className="flex flex-wrap gap-2 pt-4 border-t border-gray-100">
                  {FOLLOWUP_ACTIONS.map((action) => (
                    <button
                      key={action.id}
                      onClick={() => handleFollowUp(action)}
                      className="px-4 py-2 rounded-full border border-gray-200 text-sm font-medium text-gray-700 hover:border-optio-purple/40 hover:bg-optio-purple/5 transition-all"
                    >
                      {action.label}
                    </button>
                  ))}
                  <button
                    onClick={handleClose}
                    className="px-4 py-2 rounded-full bg-optio-purple text-white text-sm font-medium hover:bg-optio-purple/90 transition-colors ml-auto"
                  >
                    Got it!
                  </button>
                </div>
              </div>
            )}
          </div>
        </Dialog.Panel>
      </div>
    </Dialog>
  );
};

export default LessonHelperModal;
