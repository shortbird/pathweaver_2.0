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
          {/* Condensed Header with Pillar Color */}
          <div
            className="text-white p-4 rounded-t-xl relative flex items-center justify-between"
            style={{ backgroundColor: pillarData.color }}
          >
            <div className="flex-1">
              <h2 className="text-xl font-bold" style={{ fontFamily: 'Poppins' }}>
                {task.title}
              </h2>
              <div className="flex items-center gap-2 mt-1">
                <div className="px-2 py-0.5 bg-white/30 rounded-full text-xs font-semibold" style={{ fontFamily: 'Poppins' }}>
                  {pillarData.name}
                </div>
                <div className="px-2 py-0.5 bg-white/30 rounded-full text-xs font-bold" style={{ fontFamily: 'Poppins' }}>
                  {task.xp_amount} XP
                </div>
              </div>
            </div>
            <button
              onClick={onClose}
              className="text-white hover:text-white/80 transition-colors ml-4"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Content */}
          <div className="p-4">

            {/* Success Message */}
            {successMessage && (
              <div className="mb-4 p-4 bg-green-50 border-2 border-green-200 rounded-lg">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <svg className="w-5 h-5 text-green-500" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                    </svg>
                    <span className="font-semibold text-green-800" style={{ fontFamily: 'Poppins' }}>{successMessage}</span>
                  </div>
                  <button
                    onClick={() => {
                      onComplete({
                        task,
                        ...completionData
                      });
                    }}
                    className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-all font-semibold text-sm"
                    style={{ fontFamily: 'Poppins' }}
                  >
                    Close
                  </button>
                </div>
              </div>
            )}

            {/* Error Display */}
            {error && (
              <div className="mb-4 p-3 bg-red-50 border-2 border-red-200 rounded-lg">
                <div className="flex items-center gap-2">
                  <svg className="w-5 h-5 text-red-500 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                  </svg>
                  <span className="text-red-700 text-sm font-medium" style={{ fontFamily: 'Poppins' }}>{error}</span>
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
        </div>
      </ModalErrorBoundary>
    </div>
  );
};

export default TaskEvidenceModal;