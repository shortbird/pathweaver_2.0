import React, { useState } from 'react';
import MultiFormatEvidenceEditor from '../evidence/MultiFormatEvidenceEditor';
import ModalErrorBoundary from '../ModalErrorBoundary';

const TaskEvidenceModal = ({ task, questId, onComplete, onClose }) => {
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  const handleComplete = (completionData) => {
    setSuccessMessage(completionData.message);
  };

  const handleError = (errorMessage) => {
    setError(errorMessage);
  };

  const getPillarConfig = (pillar) => {
    const configs = {
      'arts_creativity': { color: 'from-purple-500 to-pink-500', bg: 'bg-purple-50' },
      'stem_logic': { color: 'from-blue-500 to-cyan-500', bg: 'bg-blue-50' },
      'life_wellness': { color: 'from-green-500 to-emerald-500', bg: 'bg-green-50' },
      'language_communication': { color: 'from-orange-500 to-yellow-500', bg: 'bg-orange-50' },
      'society_culture': { color: 'from-red-500 to-rose-500', bg: 'bg-red-50' },
      // Legacy pillar support
      'creativity': { color: 'from-purple-500 to-pink-500', bg: 'bg-purple-50' },
      'critical_thinking': { color: 'from-blue-500 to-cyan-500', bg: 'bg-blue-50' },
      'practical_skills': { color: 'from-green-500 to-emerald-500', bg: 'bg-green-50' },
      'communication': { color: 'from-orange-500 to-yellow-500', bg: 'bg-orange-50' },
      'cultural_literacy': { color: 'from-red-500 to-rose-500', bg: 'bg-red-50' }
    };
    return configs[pillar] || configs.creativity;
  };

  const pillarConfig = getPillarConfig(task.pillar);

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <ModalErrorBoundary onClose={onClose}>
        <div className="bg-white rounded-xl shadow-2xl max-w-6xl w-full max-h-[90vh] overflow-y-auto">
          {/* Header */}
          <div className="bg-gradient-to-r from-[#ef597b] to-[#6d469b] text-white p-6 rounded-t-xl">
            <div className="flex justify-between items-start">
              <div>
                <h2 className="text-2xl font-bold mb-2">Update Progress</h2>
                <p className="text-pink-100">{task.title}</p>
              </div>
              <button
                onClick={onClose}
                className="text-white hover:text-gray-200 transition-colors"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>

          {/* Content */}
          <div className="p-6">
            {/* Task Details */}
            <div className="mb-6 p-4 bg-gradient-to-r from-gray-50 to-gray-100 rounded-lg border border-gray-200">
              <div className="mb-3">
                <h3 className="text-sm font-medium text-gray-600 mb-1">Task Reward</h3>
                <div className="flex items-center gap-4">
                  <div className={`flex items-center gap-2 px-4 py-2 rounded-lg bg-white shadow-sm border border-gray-200`}>
                    <div className={`w-2 h-2 rounded-full bg-gradient-to-r ${pillarConfig.color}`}></div>
                    <span className="text-sm font-medium text-gray-700 capitalize">
                      {task.pillar?.replace('_', ' ') || 'General'}
                    </span>
                    <span className="text-lg font-bold text-green-600">+{task.xp_amount} XP</span>
                  </div>
                  {task.is_collaboration_eligible && (
                    <div className="flex items-center gap-2 px-4 py-2 rounded-lg bg-purple-50 border border-purple-200">
                      <span className="text-sm font-medium text-purple-700">🤝 Double XP Available</span>
                    </div>
                  )}
                </div>
              </div>
              {task.description && (
                <p className="text-sm text-gray-700 mt-3 pt-3 border-t border-gray-200">{task.description}</p>
              )}
            </div>

            {/* Success Message */}
            {successMessage && (
              <div className="mb-4 p-4 bg-green-50 border border-green-200 rounded-lg text-green-700">
                <div className="flex items-start gap-2">
                  <svg className="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                  <div className="flex-1">
                    <div className="font-medium mb-3">{successMessage}</div>
                    <button
                      onClick={() => {
                        onComplete({
                          task,
                          xp_awarded: null,
                          message: successMessage,
                          quest_completed: false,
                          has_collaboration_bonus: false
                        });
                      }}
                      className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-medium text-sm"
                    >
                      Close
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Error Display */}
            {error && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
                <div className="flex items-start gap-2">
                  <svg className="w-5 h-5 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                  </svg>
                  <span>{error}</span>
                </div>
              </div>
            )}

            {/* Multi-format Evidence Editor */}
            {!successMessage && (
              <div className="mb-6">
                <MultiFormatEvidenceEditor
                  taskId={task.id}
                  userId={null} // Will be extracted from auth token
                  onComplete={handleComplete}
                  onError={handleError}
                  autoSaveEnabled={true}
                />
              </div>
            )}

            {/* Instructions */}
            <div className="mt-6 p-4 bg-blue-50 rounded-xl border border-blue-200">
              <h4 className="text-sm font-semibold text-blue-800 mb-2 flex items-center gap-2">
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                </svg>
                How to Use Multi-Format Evidence
              </h4>
              <ul className="text-xs text-blue-700 space-y-1">
                <li>• <strong>Add different types of content:</strong> Mix text, images, videos, links, and documents</li>
                <li>• <strong>Build your story:</strong> Document your learning process step by step</li>
                <li>• <strong>Auto-save:</strong> Your work is automatically saved as you type</li>
                <li>• <strong>Drag to reorder:</strong> Arrange content blocks in any order</li>
                <li>• <strong>Mark complete when ready:</strong> Submit your evidence to earn XP</li>
              </ul>
            </div>
          </div>
        </div>
      </ModalErrorBoundary>
    </div>
  );
};

export default TaskEvidenceModal;