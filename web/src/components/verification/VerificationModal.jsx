import React, { useState } from 'react';
import api from '../../services/api';
import SubjectSplitEditor from '../credit-dashboard/grader/SubjectSplitEditor';
import { sumSubjects } from '../credit-dashboard/aiReview';

/**
 * A teacher's review of one task completion (schools without the SIS).
 *
 * The split is XP per diploma subject, in the platform's own subjects, edited
 * with the credit dashboard's editor. It used to be percentages over seven
 * subjects that exist nowhere else ("english", "arts", "other"), seeded from
 * an XP split, so a proposal never added up to 100 and nothing could pass.
 */
export default function VerificationModal({ completion, onClose, onSuccess }) {
  const targetXp = completion.xp_awarded || 0;
  const [distribution, setDistribution] = useState(completion.aiProposedDistribution || {});
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const total = sumSubjects(distribution);
  const isValid = total > 0 && (!targetXp || total === targetXp);

  const handleApprove = async () => {
    if (!isValid) {
      setError(targetXp
        ? `The subjects must add up to ${targetXp} XP`
        : 'Give the XP at least one subject');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const response = await api.post(`/api/teacher/verify/${completion.completion_id}`, {
        action: 'approve',
        subject_distribution: distribution,
        notes: notes
      });

      if (response.data.success) {
        onSuccess?.(response.data);
        onClose();
      } else {
        setError(response.data.error || 'Failed to approve verification');
      }
    } catch (err) {
      console.error('Failed to approve verification:', err);
      setError(err.response?.data?.error || 'Failed to approve verification');
    } finally {
      setLoading(false);
    }
  };

  const handleReject = async () => {
    if (!notes.trim()) {
      setError('Please provide notes explaining why this is being rejected');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const response = await api.post(`/api/teacher/verify/${completion.completion_id}`, {
        action: 'reject',
        notes: notes
      });

      if (response.data.success) {
        onSuccess?.(response.data);
        onClose();
      } else {
        setError(response.data.error || 'Failed to reject verification');
      }
    } catch (err) {
      console.error('Failed to reject verification:', err);
      setError(err.response?.data?.error || 'Failed to reject verification');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl w-full max-w-3xl max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold">Verify Subject Alignment</h2>
            <button
              onClick={onClose}
              className="p-2 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        <div className="px-6 py-4 space-y-6">
          {/* Task Information */}
          <div className="bg-gray-50 rounded-lg p-4">
            <h3 className="font-semibold text-gray-900 mb-2">{completion.task_title}</h3>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-gray-600">Student:</span>
                <span className="ml-2 font-medium">{completion.student_name || completion.student_id}</span>
              </div>
              <div>
                <span className="text-gray-600">Completed:</span>
                <span className="ml-2 font-medium">
                  {new Date(completion.completed_at).toLocaleDateString()}
                </span>
              </div>
              <div>
                <span className="text-gray-600">Quest:</span>
                <span className="ml-2 font-medium">{completion.quest_title || completion.quest_id}</span>
              </div>
              <div>
                <span className="text-gray-600">XP Awarded:</span>
                <span className="ml-2 font-medium">{completion.xp_awarded} XP</span>
              </div>
            </div>
          </div>

          {/* Subject Distribution Editor */}
          <div>
            <h3 className="font-semibold text-gray-900 mb-3">Diploma Subject Distribution</h3>
            <p className="text-sm text-gray-600 mb-4">
              Split this task&apos;s XP across diploma subjects. It starts from the
              subjects suggested when the task was made.
            </p>
            <SubjectSplitEditor
              subjects={distribution}
              onChange={setDistribution}
              editable
              targetXp={targetXp || null}
            />
          </div>

          {/* Verification Notes */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Verification Notes {!isValid && <span className="text-red-500">*</span>}
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 focus:ring-2 focus:ring-optio-purple/20 focus:border-optio-purple outline-none"
              rows="4"
              placeholder="Add any notes about this verification (required for rejections)..."
            />
          </div>

          {/* Error Message */}
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700 flex items-start gap-2">
              <svg className="w-5 h-5 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span>{error}</span>
            </div>
          )}
        </div>

        {/* Action Buttons */}
        <div className="sticky bottom-0 bg-gray-50 border-t border-gray-200 px-6 py-4 flex items-center justify-between gap-3">
          <button
            onClick={handleReject}
            disabled={loading}
            className="px-4 py-2 border border-red-300 text-red-700 rounded-lg hover:bg-red-50 disabled:opacity-50 disabled:cursor-not-allowed font-medium"
          >
            {loading ? 'Rejecting...' : 'Reject'}
          </button>

          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              disabled={loading}
              className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Cancel
            </button>
            <button
              onClick={handleApprove}
              disabled={loading || !isValid}
              className="px-4 py-2 bg-gradient-to-r from-optio-purple to-optio-pink text-white rounded-lg hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed font-medium"
            >
              {loading ? 'Approving...' : 'Approve & Save'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
