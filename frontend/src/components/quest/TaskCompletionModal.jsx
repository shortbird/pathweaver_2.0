import React, { useState } from 'react';
import EvidenceUploader from '../evidence/EvidenceUploader';

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
      setError('Please provide evidence for task completion');
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
      } else if (evidenceType === 'image' || evidenceType === 'video') {
        if (evidenceData.file) {
          formData.append('file', evidenceData.file);
        } else {
          throw new Error('No file selected');
        }
      }

      const apiBase = import.meta.env.VITE_API_URL || '/api';
      const response = await fetch(`${apiBase}/v3/tasks/${task.id}/complete`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('access_token')}`
        },
        body: formData
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to complete task');
      }

      // Show success message with XP earned
      const successMessage = data.has_collaboration_bonus 
        ? `🎉 Task completed! You earned ${data.xp_awarded} XP (2x collaboration bonus!)`
        : `✅ Task completed! You earned ${data.xp_awarded} XP`;

      onComplete({
        task,
        xp_awarded: data.xp_awarded,
        message: successMessage,
        quest_completed: data.quest_completed
      });

    } catch (error) {
      console.error('Error completing task:', error);
      setError(error.message || 'Failed to complete task. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
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
          <div className="mb-6 p-4 bg-gray-50 rounded-lg">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-gray-600">Task Reward</span>
              <span className="text-lg font-bold text-green-600">{task.xp_amount} XP</span>
            </div>
            {task.description && (
              <p className="text-sm text-gray-700">{task.description}</p>
            )}
            <div className="mt-2">
              <span className={`inline-block px-3 py-1 rounded-full text-xs font-medium text-white bg-gradient-to-r
                ${task.pillar === 'creativity' ? 'from-purple-500 to-pink-500' : ''}
                ${task.pillar === 'critical_thinking' ? 'from-blue-500 to-cyan-500' : ''}
                ${task.pillar === 'practical_skills' ? 'from-green-500 to-emerald-500' : ''}
                ${task.pillar === 'communication' ? 'from-orange-500 to-yellow-500' : ''}
                ${task.pillar === 'cultural_literacy' ? 'from-red-500 to-rose-500' : ''}
              `}>
                {task.pillar.replace('_', ' ')}
              </span>
              {task.is_collaboration_eligible && (
                <span className="ml-2 inline-block px-3 py-1 rounded-full text-xs font-medium text-purple-700 bg-purple-100">
                  🤝 2x XP with collaboration
                </span>
              )}
            </div>
          </div>

          {/* Evidence Type Selection */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-3">
              How will you show your work?
            </label>
            <div className="grid grid-cols-4 gap-2">
              <button
                onClick={() => setEvidenceType('text')}
                className={`p-3 rounded-lg border-2 transition-all ${
                  evidenceType === 'text'
                    ? 'border-blue-500 bg-blue-50 text-blue-700'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <svg className="w-6 h-6 mx-auto mb-1" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M4 4a2 2 0 012-2h8a2 2 0 012 2v12a2 2 0 01-2 2H6a2 2 0 01-2-2V4zm2 0h8v12H6V4z" clipRule="evenodd" />
                </svg>
                <span className="text-xs">Text</span>
              </button>

              <button
                onClick={() => setEvidenceType('link')}
                className={`p-3 rounded-lg border-2 transition-all ${
                  evidenceType === 'link'
                    ? 'border-blue-500 bg-blue-50 text-blue-700'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <svg className="w-6 h-6 mx-auto mb-1" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M12.586 4.586a2 2 0 112.828 2.828l-3 3a2 2 0 01-2.828 0 1 1 0 00-1.414 1.414 4 4 0 005.656 0l3-3a4 4 0 00-5.656-5.656l-1.5 1.5a1 1 0 101.414 1.414l1.5-1.5zm-5 5a2 2 0 012.828 0 1 1 0 101.414-1.414 4 4 0 00-5.656 0l-3 3a4 4 0 105.656 5.656l1.5-1.5a1 1 0 10-1.414-1.414l-1.5 1.5a2 2 0 11-2.828-2.828l3-3z" clipRule="evenodd" />
                </svg>
                <span className="text-xs">Link</span>
              </button>

              <button
                onClick={() => setEvidenceType('image')}
                className={`p-3 rounded-lg border-2 transition-all ${
                  evidenceType === 'image'
                    ? 'border-blue-500 bg-blue-50 text-blue-700'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <svg className="w-6 h-6 mx-auto mb-1" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M4 3a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V5a2 2 0 00-2-2H4zm12 12H4l4-8 3 6 2-4 3 6z" clipRule="evenodd" />
                </svg>
                <span className="text-xs">Image</span>
              </button>

              <button
                onClick={() => setEvidenceType('video')}
                className={`p-3 rounded-lg border-2 transition-all ${
                  evidenceType === 'video'
                    ? 'border-blue-500 bg-blue-50 text-blue-700'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <svg className="w-6 h-6 mx-auto mb-1" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M2 6a2 2 0 012-2h6a2 2 0 012 2v8a2 2 0 01-2 2H4a2 2 0 01-2-2V6zM14.553 7.106A1 1 0 0014 8v4a1 1 0 00.553.894l2 1A1 1 0 0018 13V7a1 1 0 00-1.447-.894l-2 1z" />
                </svg>
                <span className="text-xs">Video</span>
              </button>
            </div>
          </div>

          {/* Evidence Upload Component */}
          <div className="mb-6">
            <EvidenceUploader 
              evidenceType={evidenceType}
              onChange={handleEvidenceChange}
              error={error}
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
    </div>
  );
};

export default TaskCompletionModal;