import React, { useCallback, useEffect, useState } from 'react';
import PropTypes from 'prop-types';
import { toast } from 'react-hot-toast';
import api from '../../services/api';
import { getSubjectName } from '../../constants/subjects';

/**
 * CreditClassProgressPanel
 *
 * Shown on a class quest (quest_type='class'). Displays subject-XP progress
 * toward the 1,000-XP credit target and lets the student submit the class for
 * Optio review once they hit it. Backend: GET /api/quests/:id/class-progress
 * and POST /api/quests/:id/submit-class-for-review.
 */
const REVIEW_STATUS_LABEL = {
  submitted_for_review: { label: 'Submitted for review', style: 'bg-yellow-100 text-yellow-800' },
  credit_awarded: { label: 'Credit awarded', style: 'bg-green-100 text-green-800' },
  rejected: { label: 'Returned for more work', style: 'bg-red-100 text-red-700' },
};

const CreditClassProgressPanel = ({ questId, transcriptSubject }) => {
  const [progress, setProgress] = useState(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await api.get(`/api/quests/${questId}/class-progress`);
      setProgress(res.data?.data || null);
    } catch (err) {
      // Non-fatal: the rest of the quest page still works.
      console.error('Failed to load class progress', err);
    } finally {
      setLoading(false);
    }
  }, [questId]);

  useEffect(() => {
    load();
  }, [load]);

  const handleSubmit = async () => {
    if (submitting) return;
    setSubmitting(true);
    try {
      await api.post(`/api/quests/${questId}/submit-class-for-review`, {});
      toast.success('Class submitted for review');
      await load();
    } catch (err) {
      const msg =
        err.response?.data?.error?.message ||
        err.response?.data?.error ||
        'Could not submit class for review.';
      toast.error(typeof msg === 'string' ? msg : 'Could not submit class.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="bg-white rounded-xl shadow-md p-6 mb-4 flex items-center justify-center">
        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-optio-purple" />
      </div>
    );
  }

  if (!progress) return null;

  const targetXp = progress.target_xp || 1000;
  const approvedXp = progress.approved_xp || 0;
  const creditsEarned = progress.credits_earned || 0;
  const xpTowardNext = progress.xp_toward_next_credit ?? approvedXp;
  const subjectName =
    progress.transcript_subject_display || getSubjectName(transcriptSubject || progress.transcript_subject);
  const percent = Math.min(100, Math.round((xpTowardNext / targetXp) * 100));
  const reviewStatus = progress.review_status;
  const reviewMeta = reviewStatus ? REVIEW_STATUS_LABEL[reviewStatus] : null;

  return (
    <div className="bg-white rounded-xl shadow-md p-6 mb-4">
      <div className="flex items-start justify-between mb-4">
        <div>
          <h3 className="text-lg font-bold text-gray-900">Credit progress</h3>
          <p className="text-sm text-gray-500">
            Counts toward your <span className="font-semibold text-optio-purple">{subjectName}</span> credit
          </p>
        </div>
        {reviewMeta && (
          <span className={`px-2.5 py-1 text-xs font-medium rounded ${reviewMeta.style}`}>
            {reviewMeta.label}
          </span>
        )}
      </div>

      <div className="flex items-center gap-3 mb-2">
        <span className="text-2xl font-bold text-optio-purple">{xpTowardNext}</span>
        <span className="text-sm text-gray-500">/ {targetXp} XP toward next credit</span>
        {creditsEarned > 0 && (
          <span className="ml-auto text-sm font-semibold text-green-700">
            {creditsEarned} credit{creditsEarned > 1 ? 's' : ''} earned
          </span>
        )}
      </div>

      <div className="w-full h-3 bg-gray-100 rounded-full overflow-hidden">
        <div
          className="h-full bg-gradient-to-r from-optio-purple to-optio-pink rounded-full transition-all"
          style={{ width: `${percent}%` }}
        />
      </div>

      {reviewStatus === 'rejected' && progress.review_notes && (
        <div className="mt-3 p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-800">
          <span className="font-semibold">Reviewer notes: </span>
          {progress.review_notes}
        </div>
      )}

      <div className="mt-4">
        {progress.can_submit_for_review ? (
          <button
            onClick={handleSubmit}
            disabled={submitting}
            className="w-full px-6 py-3 bg-gradient-to-r from-optio-purple to-optio-pink text-white font-semibold rounded-lg disabled:opacity-50 hover:opacity-90 transition"
          >
            {submitting ? 'Submitting…' : 'Submit class for review'}
          </button>
        ) : reviewStatus === 'submitted_for_review' ? (
          <p className="text-sm text-gray-500 text-center">
            Your class is being reviewed by Optio. We'll let you know when your credit is awarded.
          </p>
        ) : (
          <p className="text-sm text-gray-500 text-center">
            Earn {Math.max(0, targetXp - xpTowardNext)} more XP to submit this class for credit.
          </p>
        )}
      </div>
    </div>
  );
};

CreditClassProgressPanel.propTypes = {
  questId: PropTypes.string.isRequired,
  transcriptSubject: PropTypes.string,
};

export default CreditClassProgressPanel;
