import React, { useState } from 'react';
import MultiFormatEvidenceEditor from '../evidence/MultiFormatEvidenceEditor';
import ModalErrorBoundary from '../ModalErrorBoundary';
import { getPillarData } from '../../utils/pillarMappings';

const TaskEvidenceModal = ({ task, questId, onComplete, onClose }) => {
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [completionData, setCompletionData] = useState(null);

  const handleComplete = (data) => {
    setSuccessMessage(data.message);
    setCompletionData(data);
  };

  const handleError = (errorMessage) => {
    setError(errorMessage);
  };

  const pillarData = getPillarData(task.pillar);

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <ModalErrorBoundary onClose={onClose}>
        <div className="bg-white rounded-xl shadow-2xl max-w-6xl w-full max-h-[90vh] overflow-y-auto">
          {/* Header with Pillar Color */}
          <div
            className="text-white p-8 rounded-t-xl relative"
            style={{ backgroundColor: pillarData.color }}
          >
            <div className="flex justify-between items-start">
              <div>
                <div className="text-sm font-semibold uppercase tracking-wide opacity-90 mb-2" style={{ fontFamily: 'Poppins' }}>
                  {pillarData.name}
                </div>
                <h2 className="text-3xl font-bold mb-2" style={{ fontFamily: 'Poppins' }}>Update Progress</h2>
                <p className="text-white/90 text-lg" style={{ fontFamily: 'Poppins' }}>{task.title}</p>
              </div>
              <button
                onClick={onClose}
                className="text-white hover:text-white/80 transition-colors"
              >
                <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>

          {/* Content */}
          <div className="p-8">
            {/* Task Details */}
            <div
              className="mb-6 p-6 rounded-xl border-2"
              style={{
                backgroundColor: `${pillarData.color}10`,
                borderColor: pillarData.color
              }}
            >
              <div className="mb-4">
                <h3 className="text-sm font-semibold uppercase tracking-wide mb-3" style={{ color: pillarData.color, fontFamily: 'Poppins' }}>
                  Task Reward
                </h3>
                <div className="flex items-center gap-2">
                  <div
                    className="px-6 py-3 rounded-lg text-white shadow-lg"
                    style={{ backgroundColor: pillarData.color }}
                  >
                    <span className="text-2xl font-bold" style={{ fontFamily: 'Poppins' }}>+{task.xp_amount} XP</span>
                  </div>
                </div>
              </div>
              {task.description && (
                <div className="mt-4 pt-4 border-t" style={{ borderColor: `${pillarData.color}30` }}>
                  <h4 className="text-base font-bold mb-3" style={{ fontFamily: 'Poppins', color: pillarData.color }}>
                    Task Description
                  </h4>
                  {task.description.split('\n').map((line, idx) => {
                    const trimmedLine = line.trim();
                    if (trimmedLine.startsWith('•')) {
                      return (
                        <div key={idx} className="flex items-start mb-2">
                          <span className="mr-2 font-bold" style={{ color: pillarData.color }}>•</span>
                          <span className="text-sm text-gray-700" style={{ fontFamily: 'Poppins' }}>
                            {trimmedLine.substring(1).trim()}
                          </span>
                        </div>
                      );
                    } else if (trimmedLine) {
                      return (
                        <p key={idx} className="text-sm text-gray-700 mb-2" style={{ fontFamily: 'Poppins' }}>
                          {trimmedLine}
                        </p>
                      );
                    }
                    return null;
                  })}
                </div>
              )}
            </div>

            {/* Success Message */}
            {successMessage && (
              <div className="mb-6 p-6 bg-green-50 border-2 border-green-200 rounded-xl">
                <div className="flex items-start gap-3">
                  <svg className="w-6 h-6 text-green-500 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                  <div className="flex-1">
                    <div className="font-bold text-green-800 mb-4" style={{ fontFamily: 'Poppins' }}>{successMessage}</div>
                    <button
                      onClick={() => {
                        onComplete({
                          task,
                          ...completionData
                        });
                      }}
                      className="px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-all shadow-lg font-bold"
                      style={{ fontFamily: 'Poppins' }}
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
            <div
              className="mt-6 p-6 rounded-xl border-2"
              style={{
                backgroundColor: `${pillarData.color}10`,
                borderColor: `${pillarData.color}50`
              }}
            >
              <h4 className="text-base font-bold mb-3 flex items-center gap-2" style={{ color: pillarData.color, fontFamily: 'Poppins' }}>
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                </svg>
                How to Use Multi-Format Evidence
              </h4>
              <ul className="text-sm text-gray-700 space-y-2" style={{ fontFamily: 'Poppins' }}>
                <li className="flex items-start">
                  <span className="mr-2 font-bold" style={{ color: pillarData.color }}>•</span>
                  <span><strong>Add different types of content:</strong> Mix text, images, videos, links, and documents</span>
                </li>
                <li className="flex items-start">
                  <span className="mr-2 font-bold" style={{ color: pillarData.color }}>•</span>
                  <span><strong>Build your story:</strong> Document your learning process step by step</span>
                </li>
                <li className="flex items-start">
                  <span className="mr-2 font-bold" style={{ color: pillarData.color }}>•</span>
                  <span><strong>Auto-save:</strong> Your work is automatically saved as you type</span>
                </li>
                <li className="flex items-start">
                  <span className="mr-2 font-bold" style={{ color: pillarData.color }}>•</span>
                  <span><strong>Drag to reorder:</strong> Arrange content blocks in any order</span>
                </li>
                <li className="flex items-start">
                  <span className="mr-2 font-bold" style={{ color: pillarData.color }}>•</span>
                  <span><strong>Mark complete when ready:</strong> Submit your evidence to earn XP</span>
                </li>
              </ul>
            </div>
          </div>
        </div>
      </ModalErrorBoundary>
    </div>
  );
};

export default TaskEvidenceModal;