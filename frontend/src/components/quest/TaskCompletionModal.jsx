import React, { useState } from 'react';
import ImprovedEvidenceUploader from '../evidence/ImprovedEvidenceUploader';
import { handleApiResponse } from '../../utils/errorHandling';
import ModalErrorBoundary from '../ModalErrorBoundary';

const TaskCompletionModal = ({ task, questId, onComplete, onClose }) => {
  const [evidenceType, setEvidenceType] = useState('text');
  const [evidenceData, setEvidenceData] = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

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

      // Add evidence data based on type
      if (evidenceType === 'text') {
        formData.append('text_content', evidenceData.content);
      } else if (evidenceType === 'link') {
        formData.append('text_content', evidenceData.url);
        formData.append('link_title', evidenceData.title || '');
      } else if (['image', 'video', 'document'].includes(evidenceType)) {
        if (evidenceData.file) {
          formData.append('file', evidenceData.file);
        } else {
          throw new Error('No file selected');
        }
      }

      const apiBase = import.meta.env.VITE_API_URL || '';
      const response = await fetch(`${apiBase}/api/v3/tasks/${task.id}/complete`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('access_token')}`
        },
        body: formData
      });

      const data = await response.json();
      
      // Add debugging to see what's happening
      console.log('Task completion response:', {
        status: response.status,
        ok: response.ok,
        data: data
      });
      
      // Use utility function for consistent error handling
      handleApiResponse(response, data, 'Failed to complete task');

      // Additional check for API-level success flag
      if (data.success === false) {
        throw new Error(data.error || data.message || 'Failed to complete task');
      }

      // Show success message with XP earned
      const successMessage = data.has_collaboration_bonus 
        ? `Task completed! You earned ${data.xp_awarded} XP (2x collaboration bonus!)`
        : `Task completed! You earned ${data.xp_awarded} XP`;

      // Let the parent handle modal closure via onComplete callback
      onComplete({
        task,
        xp_awarded: data.xp_awarded,
        message: successMessage,
        quest_completed: data.quest_completed
      });

    } catch (error) {
      console.error('Error completing task:', error);
      console.error('Error details:', {
        message: error.message,
        taskId: task.id,
        questId: questId,
        evidenceType: evidenceType,
        evidenceData: evidenceData
      });
      setError(error.message || 'Failed to complete task. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <ModalErrorBoundary onClose={onClose}>
        <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
          {/* Header */}
          <div className="bg-gradient-to-r from-blue-600 to-purple-600 text-white p-6 rounded-t-xl">
          <div className="flex justify-between items-start">
            <div>
              <h2 className="text-2xl font-bold mb-2">Complete Task</h2>
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
              <div className="flex items-center gap-4">
                <div className={`flex items-center gap-2 px-4 py-2 rounded-lg bg-white shadow-sm border border-gray-200`}>
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

          {/* Action Buttons */}
          <div className="flex justify-end gap-3">
            <button
              onClick={onClose}
              className="px-6 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors"
              disabled={isSubmitting}
            >
              Cancel
            </button>
            <button
              onClick={handleSubmit}
              disabled={isSubmitting || !evidenceData || Object.keys(evidenceData).length === 0}
              className="px-6 py-2 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-lg hover:from-blue-700 hover:to-purple-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSubmitting ? 'Submitting...' : 'Complete Task'}
            </button>
          </div>
        </div>
      </div>
      </ModalErrorBoundary>
    </div>
  );
};

export default TaskCompletionModal;