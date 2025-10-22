import React, { useState } from 'react';
import { X, Award, BookOpen, Info } from 'lucide-react';
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
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex items-center justify-center min-h-screen px-4 pt-4 pb-20 text-center sm:block sm:p-0">
        {/* Background overlay */}
        <div
          className="fixed inset-0 transition-opacity bg-gray-500 bg-opacity-75"
          onClick={onClose}
        ></div>

        {/* Center modal */}
        <span className="hidden sm:inline-block sm:align-middle sm:h-screen">&#8203;</span>

        {/* Modal panel */}
        <ModalErrorBoundary onClose={onClose}>
          <div className="inline-block align-bottom bg-white rounded-xl text-left overflow-hidden shadow-2xl transform transition-all sm:my-8 sm:align-middle sm:max-w-4xl sm:w-full max-h-[85vh] overflow-y-auto">
            {/* Header with Pillar Color */}
            <div
              className="px-8 py-8"
              style={{ backgroundColor: pillarData.color }}
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="text-sm font-semibold uppercase tracking-wide text-white/90 mb-2" style={{ fontFamily: 'Poppins' }}>
                    {pillarData.name}
                  </div>
                  <h3 className="text-3xl font-bold text-white mb-4" style={{ fontFamily: 'Poppins' }}>{task.title}</h3>
                  <div className="flex items-center gap-3">
                    <div className="px-6 py-2 bg-white/20 backdrop-blur-sm text-white rounded-full text-lg font-bold flex items-center gap-2" style={{ fontFamily: 'Poppins' }}>
                      <Award className="w-5 h-5" />
                      {task.xp_amount} XP
                    </div>
                  </div>
                </div>
                <button
                  onClick={onClose}
                  className="ml-4 text-white hover:text-white/80 transition-colors"
                >
                  <X className="w-8 h-8" />
                </button>
              </div>
            </div>

            {/* Content */}
            <div className="px-8 py-6 space-y-6">
              {/* Description */}
              {task.description && (
                <div
                  className="rounded-xl p-6 border-2"
                  style={{
                    backgroundColor: `${pillarData.color}10`,
                    borderColor: `${pillarData.color}50`
                  }}
                >
                  <h4 className="font-bold text-lg mb-3 flex items-center gap-2" style={{ color: pillarData.color, fontFamily: 'Poppins' }}>
                    <BookOpen className="w-5 h-5" />
                    Description
                  </h4>
                  {task.description.split('\n').map((line, idx) => {
                    const trimmedLine = line.trim();
                    if (trimmedLine.startsWith('•')) {
                      return (
                        <div key={idx} className="flex items-start mb-2">
                          <span className="mr-3 mt-1 text-xl font-bold" style={{ color: pillarData.color }}>•</span>
                          <span className="text-gray-700 text-base leading-relaxed" style={{ fontFamily: 'Poppins' }}>{trimmedLine.substring(1).trim()}</span>
                        </div>
                      );
                    } else if (trimmedLine) {
                      return (
                        <p key={idx} className="text-gray-700 text-base leading-relaxed mb-2" style={{ fontFamily: 'Poppins' }}>{trimmedLine}</p>
                      );
                    }
                    return null;
                  })}
                </div>
              )}

              {/* Instructions */}
              <div
                className="border-2 rounded-xl p-6"
                style={{
                  backgroundColor: `${pillarData.color}10`,
                  borderColor: pillarData.color
                }}
              >
                <h4 className="font-bold text-lg mb-3 flex items-center gap-2" style={{ color: pillarData.color, fontFamily: 'Poppins' }}>
                  <Info className="w-5 h-5" />
                  How to Use Multi-Format Evidence
                </h4>
                <ul className="space-y-2">
                  <li className="flex items-start">
                    <span className="mr-3 mt-1 text-xl font-bold" style={{ color: pillarData.color }}>•</span>
                    <span className="text-gray-700 text-base leading-relaxed" style={{ fontFamily: 'Poppins' }}>
                      <strong>Add different types of content:</strong> Mix text, images, videos, links, and documents
                    </span>
                  </li>
                  <li className="flex items-start">
                    <span className="mr-3 mt-1 text-xl font-bold" style={{ color: pillarData.color }}>•</span>
                    <span className="text-gray-700 text-base leading-relaxed" style={{ fontFamily: 'Poppins' }}>
                      <strong>Build your story:</strong> Document your learning process step by step
                    </span>
                  </li>
                  <li className="flex items-start">
                    <span className="mr-3 mt-1 text-xl font-bold" style={{ color: pillarData.color }}>•</span>
                    <span className="text-gray-700 text-base leading-relaxed" style={{ fontFamily: 'Poppins' }}>
                      <strong>Auto-save:</strong> Your work is automatically saved as you type
                    </span>
                  </li>
                  <li className="flex items-start">
                    <span className="mr-3 mt-1 text-xl font-bold" style={{ color: pillarData.color }}>•</span>
                    <span className="text-gray-700 text-base leading-relaxed" style={{ fontFamily: 'Poppins' }}>
                      <strong>Drag to reorder:</strong> Arrange content blocks in any order
                    </span>
                  </li>
                  <li className="flex items-start">
                    <span className="mr-3 mt-1 text-xl font-bold" style={{ color: pillarData.color }}>•</span>
                    <span className="text-gray-700 text-base leading-relaxed" style={{ fontFamily: 'Poppins' }}>
                      <strong>Mark complete when ready:</strong> Submit your evidence to earn XP
                    </span>
                  </li>
                </ul>
              </div>

              {/* Success Message */}
              {successMessage && (
                <div className="p-6 bg-green-50 border-2 border-green-200 rounded-xl">
                  <div className="flex items-start gap-3">
                    <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center flex-shrink-0">
                      <svg className="w-6 h-6 text-green-600" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                      </svg>
                    </div>
                    <div className="flex-1">
                      <div className="font-bold text-lg text-green-800 mb-3" style={{ fontFamily: 'Poppins' }}>{successMessage}</div>
                      <button
                        onClick={() => {
                          onComplete({
                            task,
                            ...completionData
                          });
                        }}
                        className="px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-bold"
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
                <div className="p-6 bg-red-50 border-2 border-red-200 rounded-xl">
                  <div className="flex items-start gap-3">
                    <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center flex-shrink-0">
                      <svg className="w-6 h-6 text-red-600" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                      </svg>
                    </div>
                    <span className="text-red-700 text-base font-medium" style={{ fontFamily: 'Poppins' }}>{error}</span>
                  </div>
                </div>
              )}

              {/* Multi-format Evidence Editor */}
              {!successMessage && (
                <div>
                  <MultiFormatEvidenceEditor
                    taskId={task.id}
                    userId={null} // Will be extracted from auth token
                    onComplete={handleComplete}
                    onError={handleError}
                    autoSaveEnabled={true}
                  />
                </div>
              )}
            </div>

            {/* Footer */}
            {!successMessage && (
              <div className="bg-gray-50 px-8 py-6">
                <button
                  onClick={onClose}
                  className="w-full px-6 py-3 text-white rounded-lg hover:shadow-xl transition-all font-bold text-lg"
                  style={{ backgroundColor: pillarData.color, fontFamily: 'Poppins' }}
                >
                  Save & Close
                </button>
              </div>
            )}
          </div>
        </ModalErrorBoundary>
      </div>
    </div>
  );
};

export default TaskEvidenceModal;
