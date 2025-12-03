import React, { useState, useEffect } from 'react';
import api from '../services/api';

/**
 * ReflectionModal
 *
 * Modal for optional reflection when setting down a quest.
 * Fetches random reflection prompts from backend.
 *
 * Philosophy-aligned: Encourages metacognition without making it mandatory
 */
const ReflectionModal = ({ isOpen, onClose, questId, questTitle, onConfirm }) => {
  const [prompts, setPrompts] = useState([]);
  const [selectedPromptId, setSelectedPromptId] = useState(null);
  const [reflectionText, setReflectionText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [loadingPrompts, setLoadingPrompts] = useState(true);

  useEffect(() => {
    if (isOpen) {
      fetchPrompts();
      // Reset state when modal opens
      setReflectionText('');
      setSelectedPromptId(null);
    }
  }, [isOpen]);

  const fetchPrompts = async () => {
    setLoadingPrompts(true);
    try {
      const response = await api.get('/reflection-prompts?limit=5');
      setPrompts(response.data.prompts);
      // Auto-select first prompt
      if (response.data.prompts.length > 0) {
        setSelectedPromptId(response.data.prompts[0].id);
      }
    } catch (error) {
      console.error('Error fetching reflection prompts:', error);
    } finally {
      setLoadingPrompts(false);
    }
  };

  const handleSetDown = async (skipReflection = false) => {
    setIsLoading(true);
    try {
      const payload = skipReflection
        ? {}
        : {
            reflection_note: reflectionText,
            prompt_id: selectedPromptId
          };

      const response = await api.post(`/quests/${questId}/setdown`, payload);

      if (onConfirm) {
        onConfirm(response.data);
      }

      onClose();
    } catch (error) {
      console.error('Error setting down quest:', error);
      alert('Failed to set down quest. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen) return null;

  const selectedPrompt = prompts.find(p => p.id === selectedPromptId);

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto shadow-2xl">
        {/* Header */}
        <div className="bg-gradient-to-r from-optio-purple to-optio-pink p-6 rounded-t-2xl">
          <h2 className="text-2xl font-bold text-white">Setting Down: {questTitle}</h2>
          <p className="text-purple-100 mt-2">
            Take a moment to reflect on what you discovered (optional)
          </p>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {loadingPrompts ? (
            <div className="text-center py-8">
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-optio-purple border-t-transparent"></div>
              <p className="mt-2 text-gray-600">Loading reflection prompts...</p>
            </div>
          ) : (
            <>
              {/* Prompt Selection */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Choose a reflection prompt:
                </label>
                <div className="space-y-2">
                  {prompts.map((prompt) => (
                    <button
                      key={prompt.id}
                      onClick={() => setSelectedPromptId(prompt.id)}
                      className={`
                        w-full text-left p-4 rounded-lg border-2 transition-all
                        ${selectedPromptId === prompt.id
                          ? 'border-optio-purple bg-purple-50'
                          : 'border-gray-200 hover:border-purple-300 bg-white'
                        }
                      `}
                    >
                      <div className="flex items-start gap-3">
                        <div className={`
                          flex-shrink-0 w-5 h-5 rounded-full border-2 mt-0.5
                          ${selectedPromptId === prompt.id
                            ? 'border-optio-purple bg-optio-purple'
                            : 'border-gray-300'
                          }
                        `}>
                          {selectedPromptId === prompt.id && (
                            <div className="w-full h-full flex items-center justify-center">
                              <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                              </svg>
                            </div>
                          )}
                        </div>
                        <div className="flex-1">
                          <p className="font-medium text-gray-900">{prompt.prompt_text}</p>
                          <p className="text-xs text-gray-500 mt-1 capitalize">{prompt.category}</p>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Reflection Text Area */}
              {selectedPrompt && (
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Your reflection:
                  </label>
                  <textarea
                    value={reflectionText}
                    onChange={(e) => setReflectionText(e.target.value)}
                    placeholder={`${selectedPrompt.prompt_text}\n\nShare your thoughts here...`}
                    className="w-full h-32 p-4 border-2 border-gray-300 rounded-lg focus:border-optio-purple focus:ring focus:ring-purple-200 resize-none"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    {reflectionText.length} characters
                  </p>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer Actions */}
        <div className="bg-gray-50 px-6 py-4 rounded-b-2xl flex items-center justify-between gap-4">
          <button
            onClick={onClose}
            disabled={isLoading}
            className="px-4 py-2 text-gray-700 hover:text-gray-900 font-medium disabled:opacity-50"
          >
            Cancel
          </button>

          <div className="flex gap-3">
            <button
              onClick={() => handleSetDown(true)}
              disabled={isLoading}
              className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 font-medium transition-colors disabled:opacity-50"
            >
              Skip Reflection
            </button>

            <button
              onClick={() => handleSetDown(false)}
              disabled={isLoading || !reflectionText.trim()}
              className="px-6 py-2 bg-gradient-to-r from-optio-purple to-optio-pink text-white rounded-lg hover:from-purple-700 hover:to-pink-700 font-semibold transition-all shadow-md hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoading ? 'Setting Down...' : 'Set Down with Reflection'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ReflectionModal;
