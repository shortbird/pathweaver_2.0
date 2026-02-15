import React, { useState, useEffect, useCallback } from 'react';
import {
  ChatBubbleLeftRightIcon,
  CheckCircleIcon,
  ClockIcon,
  ArrowPathIcon,
  SparklesIcon
} from '@heroicons/react/24/outline';
import api from '../../services/api';
import toast from 'react-hot-toast';

/**
 * TaskFeedbackStatus - Shows feedback status and finalization options for completed tasks.
 * Part of the iterative draft feedback system for diploma credits.
 *
 * States:
 * - draft: Awaiting review (show "Awaiting feedback" status)
 * - ready_for_credit: Reviewer approved (show "Finalize" button)
 * - finalized: Complete (show "Diploma credit earned" status)
 */
export default function TaskFeedbackStatus({ taskId, onStatusChange }) {
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [finalizing, setFinalizing] = useState(false);
  const [showFeedbackHistory, setShowFeedbackHistory] = useState(false);

  const loadStatus = useCallback(async () => {
    if (!taskId) return;

    try {
      const response = await api.get(`/api/tasks/${taskId}/draft-status`);
      setStatus(response.data.data);
    } catch (err) {
      console.error('Failed to load draft status:', err);
      // Not a critical error - task might not have a completion yet
    } finally {
      setLoading(false);
    }
  }, [taskId]);

  useEffect(() => {
    loadStatus();
  }, [loadStatus]);

  const handleFinalize = async () => {
    setFinalizing(true);
    try {
      const response = await api.post(`/api/tasks/${taskId}/finalize`, {});

      toast.success(response.data.message || 'Task finalized for diploma credit!');

      // Reload status
      await loadStatus();

      // Notify parent component
      if (onStatusChange) {
        onStatusChange('finalized');
      }
    } catch (err) {
      console.error('Failed to finalize task:', err);
      toast.error(err.response?.data?.message || 'Failed to finalize task');
    } finally {
      setFinalizing(false);
    }
  };

  // Format date
  const formatDate = (dateStr) => {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit'
    });
  };

  // Don't render if no completion exists
  if (loading) {
    return (
      <div className="animate-pulse bg-gray-100 rounded-lg p-3 h-16"></div>
    );
  }

  if (!status?.has_completion) {
    return null;
  }

  // Finalized state
  if (status.diploma_status === 'finalized') {
    return (
      <div className="bg-green-50 border border-green-200 rounded-lg p-4">
        <div className="flex items-center gap-2 text-green-700">
          <CheckCircleIcon className="w-5 h-5" />
          <span className="font-medium">Diploma Credit Earned</span>
        </div>
        {status.finalized_at && (
          <p className="text-sm text-green-600 mt-1">
            Finalized {formatDate(status.finalized_at)}
          </p>
        )}
      </div>
    );
  }

  // Ready for credit - show finalize button
  if (status.diploma_status === 'ready_for_credit') {
    return (
      <div className="bg-gradient-to-br from-purple-50 to-pink-50 border border-purple-200 rounded-lg p-4">
        <div className="flex items-start gap-3">
          <SparklesIcon className="w-6 h-6 text-purple-600 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <h4 className="font-semibold text-purple-800">Ready for Diploma Credit</h4>
            <p className="text-sm text-purple-700 mt-1">
              Your work has been reviewed and approved. Finalize to add this credit to your diploma progress.
            </p>

            {/* Show latest feedback if any */}
            {status.latest_feedback && (
              <div className="mt-3 p-3 bg-white rounded-lg border border-purple-100">
                <p className="text-sm text-gray-700 italic">"{status.latest_feedback}"</p>
                {status.feedback_at && (
                  <p className="text-xs text-gray-500 mt-1">
                    {formatDate(status.feedback_at)}
                  </p>
                )}
              </div>
            )}

            <button
              onClick={handleFinalize}
              disabled={finalizing}
              className="mt-4 w-full sm:w-auto px-6 py-2 bg-gradient-to-r from-optio-purple to-optio-pink text-white rounded-lg font-medium hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {finalizing ? (
                <>
                  <ArrowPathIcon className="w-4 h-4 animate-spin" />
                  Finalizing...
                </>
              ) : (
                <>
                  <CheckCircleIcon className="w-4 h-4" />
                  Finalize for Diploma Credit
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Draft state - awaiting feedback
  return (
    <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
      <div className="flex items-start gap-3">
        <ClockIcon className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
        <div className="flex-1">
          <h4 className="font-medium text-amber-800">Draft Submitted - Awaiting Feedback</h4>
          <p className="text-sm text-amber-700 mt-1">
            Your work is being reviewed. You earned pillar XP immediately.
            Diploma credits will be awarded once your work is approved and finalized.
          </p>

          {/* Show revision number */}
          {status.revision_number > 1 && (
            <p className="text-xs text-amber-600 mt-2">
              Revision {status.revision_number}
            </p>
          )}

          {/* Show latest feedback if any */}
          {status.latest_feedback && (
            <div className="mt-3">
              <button
                onClick={() => setShowFeedbackHistory(!showFeedbackHistory)}
                className="text-sm text-amber-700 hover:text-amber-900 flex items-center gap-1"
              >
                <ChatBubbleLeftRightIcon className="w-4 h-4" />
                {showFeedbackHistory ? 'Hide Feedback' : 'View Feedback'}
              </button>

              {showFeedbackHistory && (
                <div className="mt-2 space-y-2">
                  {status.feedback_history?.length > 0 ? (
                    status.feedback_history.map((fb, idx) => (
                      <div key={idx} className="p-3 bg-white rounded-lg border border-amber-100">
                        <p className="text-sm text-gray-700">{fb.feedback_text}</p>
                        <p className="text-xs text-gray-500 mt-1">
                          Revision {fb.revision_number} | {formatDate(fb.created_at)}
                        </p>
                      </div>
                    ))
                  ) : status.latest_feedback ? (
                    <div className="p-3 bg-white rounded-lg border border-amber-100">
                      <p className="text-sm text-gray-700">{status.latest_feedback}</p>
                      {status.feedback_at && (
                        <p className="text-xs text-gray-500 mt-1">{formatDate(status.feedback_at)}</p>
                      )}
                    </div>
                  ) : (
                    <p className="text-sm text-gray-500 italic">No feedback yet</p>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
