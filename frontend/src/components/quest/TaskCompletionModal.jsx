import React, { useState } from 'react';
import ImprovedEvidenceUploader from '../evidence/ImprovedEvidenceUploader';
import { handleApiResponse } from '../../utils/errorHandling';
import ModalErrorBoundary from '../ModalErrorBoundary';

const TaskCompletionModal = ({ task, questId, onComplete, onClose }) => {
  const [evidenceType, setEvidenceType] = useState('text');
  const [evidenceData, setEvidenceData] = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [isConfidential, setIsConfidential] = useState(false);

  const handleEvidenceChange = (data) => {
    setEvidenceData(data);
    setError('');
  };

  const handleSubmit = async () => {
    if (!evidenceData || Object.keys(evidenceData).length === 0) {
      setError('Please submit work for task completion');
      return;
    }

    setIsSubmitting(true);
    setError('');

    try {
      const formData = new FormData();
      formData.append('evidence_type', evidenceType);
      formData.append('is_confidential', isConfidential ? 'true' : 'false');

      // Add evidence data based on type
      if (evidenceType === 'text') {
        formData.append('text_content', evidenceData.content);
      } else if (evidenceType === 'link' || evidenceType === 'video') {
        formData.append('text_content', evidenceData.url);
        formData.append('link_title', evidenceData.title || '');
      } else if (['image', 'document'].includes(evidenceType)) {
        if (evidenceData.file) {
          formData.append('file', evidenceData.file);
        } else {
          throw new Error('No file selected');
        }
      }

      const apiBase = import.meta.env.VITE_API_URL || '';
      const response = await fetch(`${apiBase}/api/tasks/${task.id}/complete`, {
        method: 'POST',
        credentials: 'include', // Send cookies for authentication
        body: formData
      });

      const data = await response.json();
      
      
      // Check for HTTP error status
      if (!response.ok) {
        const errorDetail = data.error || data.message;
        const errorMessage = typeof errorDetail === 'string' ? errorDetail : JSON.stringify(errorDetail) || 'Failed to complete task';
        throw new Error(errorMessage);
      }

      // Check for API-level success flag (backend uses success: true/false)
      if (data.success === false) {
        const errorDetail = data.error || data.message;
        const errorMessage = typeof errorDetail === 'string' ? errorDetail : JSON.stringify(errorDetail) || 'Failed to complete task';
        throw new Error(errorMessage);
      }

      // If we get here, the request was successful

      // Show success message with XP earned
      const xpAwarded = data.xp_awarded || 0;
      const successMessage = data.has_collaboration_bonus
        ? `Draft submitted! You earned ${xpAwarded} pillar XP (2x collaboration bonus!). Your work will be reviewed for diploma credit.`
        : `Draft submitted! You earned ${xpAwarded} pillar XP. Your work will be reviewed for diploma credit.`;

      // Let the parent handle modal closure via onComplete callback
      onComplete({
        task,
        xp_awarded: xpAwarded,
        message: successMessage,
        quest_completed: data.quest_completed || false
      });

    } catch (error) {
      const errorMsg = error.response?.status === 413
        ? 'Your file is too large. Please use a smaller file or reduce the image quality.'
        : error.response?.status === 400
        ? 'Invalid submission format. Please check your evidence and try again.'
        : error.response?.status === 403
        ? 'You do not have permission to complete this task.'
        : error.response?.status >= 500
        ? 'Our servers are temporarily unavailable. Please try again in a moment.'
        : error.message || 'Unable to submit your task completion. Please check your connection and try again.'
      setError(errorMsg);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <ModalErrorBoundary onClose={onClose}>
        <div className="bg-white rounded-xl shadow-2xl max-w-full sm:max-w-2xl mx-2 sm:mx-0 w-full max-h-[90vh] overflow-y-auto">
          {/* Header */}
          <div className="bg-gradient-to-r from-blue-600 to-purple-600 text-white p-6 rounded-t-xl">
          <div className="flex justify-between items-start">
            <div>
              <h2 className="text-2xl font-bold mb-2">Submit Draft</h2>
              <p className="text-blue-100">{task.title}</p>
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
              <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 sm:gap-4">
                <div className={`flex items-center gap-2 px-4 py-2 rounded-lg bg-white shadow-sm border border-gray-200 w-full sm:w-auto`}>
                  <div className={`w-2 h-2 rounded-full bg-gradient-to-r
                    ${task.pillar === 'creativity' ? 'from-purple-500 to-pink-500' : ''}
                    ${task.pillar === 'critical_thinking' ? 'from-blue-500 to-cyan-500' : ''}
                    ${task.pillar === 'practical_skills' ? 'from-green-500 to-emerald-500' : ''}
                    ${task.pillar === 'communication' ? 'from-orange-500 to-yellow-500' : ''}
                    ${task.pillar === 'cultural_literacy' ? 'from-red-500 to-rose-500' : ''}
                  `}></div>
                  <span className="text-sm font-medium text-gray-700 capitalize">
                    {task.pillar.replace('_', ' ')}
                  </span>
                  <span className="text-lg font-bold text-green-600">+{task.xp_amount} XP</span>
                </div>
                {task.is_collaboration_eligible && (
                  <div className="flex items-center gap-2 px-4 py-2 rounded-lg bg-purple-50 border border-purple-200 w-full sm:w-auto">
                    <span className="text-sm font-medium text-purple-700">🤝 Double XP Available</span>
                  </div>
                )}
              </div>
            </div>
            {task.description && (
              <p className="text-sm sm:text-base text-gray-700 mt-3 pt-3 border-t border-gray-200">{task.description}</p>
            )}
          </div>

          {/* Evidence Upload Component with integrated type selector */}
          <div className="mb-6">
            <ImprovedEvidenceUploader 
              evidenceType={evidenceType}
              onChange={handleEvidenceChange}
              onTypeChange={setEvidenceType}
              error={error}
              taskDescription={task.description}
            />
          </div>

          {/* Error Display */}
          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
              {error}
            </div>
          )}

          {/* Confidential Checkbox */}
          <div className="mb-6 p-4 bg-gradient-to-br from-purple-50 to-pink-50 border border-purple-200 rounded-lg">
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={isConfidential}
                onChange={(e) => setIsConfidential(e.target.checked)}
                className="mt-1 h-5 w-5 text-optio-purple focus:ring-purple-500 border-gray-300 rounded cursor-pointer"
              />
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <svg className="h-4 w-4 text-optio-purple" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                  </svg>
                  <span className="text-sm font-bold text-gray-900" style={{ fontFamily: 'Poppins, sans-serif' }}>
                    Mark as Confidential
                  </span>
                </div>
                <p className="text-xs text-gray-700 leading-relaxed" style={{ fontFamily: 'Poppins, sans-serif' }}>
                  Only you will be able to see this evidence. Others will see a message that this evidence is confidential.
                </p>
              </div>
            </label>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-col sm:flex-row justify-end gap-3">
            <button
              onClick={onClose}
              className="min-h-[44px] w-full sm:w-auto px-6 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors"
              disabled={isSubmitting}
            >
              Cancel
            </button>
            <button
              onClick={handleSubmit}
              disabled={isSubmitting || !evidenceData || Object.keys(evidenceData).length === 0}
              className="min-h-[44px] w-full sm:w-auto px-6 py-2 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-lg hover:from-blue-700 hover:to-purple-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSubmitting ? 'Submitting...' : 'Submit Draft'}
            </button>
          </div>
        </div>
      </div>
      </ModalErrorBoundary>
    </div>
  );
};

export default TaskCompletionModal;