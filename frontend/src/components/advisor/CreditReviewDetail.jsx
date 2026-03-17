import { useState, useEffect } from 'react';
import api from '../../services/api';
import CreditIterationHistory from '../diploma/CreditIterationHistory';
import { CREDIT_REQUIREMENTS, calculateCreditsFromXP } from '../../utils/creditRequirements';
import {
  ArrowLeftIcon,
  ArrowPathIcon,
  CheckCircleIcon,
  CheckIcon,
  AcademicCapIcon,
  DocumentTextIcon,
  UserCircleIcon,
} from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';

export default function CreditReviewDetail({ completionId, onBack, onActionComplete }) {
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [feedback, setFeedback] = useState('');
  const [subjectOverrides, setSubjectOverrides] = useState({});
  const [isApproving, setIsApproving] = useState(false);
  const [isReturning, setIsReturning] = useState(false);
  const [showSubjectEditor, setShowSubjectEditor] = useState(false);

  useEffect(() => {
    fetchDetail();
  }, [completionId]);

  const fetchDetail = async () => {
    try {
      setLoading(true);
      const response = await api.get(`/api/advisor/credit-queue/${completionId}`);
      const data = response.data.data;
      setDetail(data);
      // Initialize subject overrides with suggestion
      if (data?.suggested_subjects) {
        setSubjectOverrides({ ...data.suggested_subjects });
      }
    } catch (err) {
      setError('Failed to load review details');
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async () => {
    setIsApproving(true);
    try {
      const payload = { feedback: feedback.trim() };
      if (showSubjectEditor && Object.keys(subjectOverrides).length > 0) {
        payload.subjects = subjectOverrides;
      }
      await api.post(`/api/advisor/credit-queue/${completionId}/approve`, payload);
      toast.success('Diploma credit approved');
      onActionComplete?.();
    } catch (err) {
      const msg = err.response?.data?.message || 'Failed to approve';
      toast.error(msg);
    } finally {
      setIsApproving(false);
    }
  };

  const handleGrowThis = async () => {
    if (!feedback.trim()) {
      toast.error('Please provide feedback when returning work');
      return;
    }
    setIsReturning(true);
    try {
      await api.post(`/api/advisor/credit-queue/${completionId}/grow-this`, {
        feedback: feedback.trim()
      });
      toast.success('Returned to student with feedback');
      onActionComplete?.();
    } catch (err) {
      const msg = err.response?.data?.message || 'Failed to return';
      toast.error(msg);
    } finally {
      setIsReturning(false);
    }
  };

  const handleSubjectChange = (subject, value) => {
    const numValue = parseInt(value) || 0;
    setSubjectOverrides(prev => ({
      ...prev,
      [subject]: numValue
    }));
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <ArrowPathIcon className="w-8 h-8 text-optio-purple animate-spin" />
      </div>
    );
  }

  if (error || !detail) {
    return (
      <div>
        <button onClick={onBack} className="flex items-center gap-1 text-sm text-gray-600 hover:text-gray-900 mb-4">
          <ArrowLeftIcon className="w-4 h-4" />
          Back to queue
        </button>
        <div className="bg-red-50 border border-red-200 rounded-md p-4">
          <p className="text-red-800 text-sm">{error || 'Review not found'}</p>
        </div>
      </div>
    );
  }

  const { completion, task, quest, student, evidence_blocks, review_rounds, suggested_subjects, student_subject_xp } = detail;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button onClick={onBack} className="p-1.5 text-gray-500 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors">
          <ArrowLeftIcon className="w-5 h-5" />
        </button>
        <div className="flex-1 min-w-0">
          <h3 className="text-lg font-semibold text-gray-900 truncate" style={{ fontFamily: 'Poppins' }}>
            {task?.title || 'Review'}
          </h3>
          <p className="text-sm text-gray-500">{quest?.title}</p>
        </div>
      </div>

      {/* Student info */}
      <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
        {student?.avatar_url ? (
          <img src={student.avatar_url} alt={`${student.first_name || ''} ${student.last_name || ''}`.trim() || student.display_name || 'Student'} className="w-10 h-10 rounded-full object-cover" />
        ) : (
          <UserCircleIcon className="w-10 h-10 text-gray-400" />
        )}
        <div>
          <p className="text-sm font-medium text-gray-900">{`${student?.first_name || ''} ${student?.last_name || ''}`.trim() || student?.display_name || 'Student'}</p>
          <p className="text-xs text-gray-500">{student?.email}</p>
        </div>
        <div className="ml-auto text-right">
          <p className="text-sm font-bold text-optio-purple">{task?.xp_value || completion?.xp_awarded} XP</p>
          <p className="text-xs text-gray-500">{task?.pillar}</p>
        </div>
      </div>

      {/* Evidence display */}
      <div className="border border-gray-200 rounded-lg overflow-hidden">
        <div className="px-4 py-2 bg-gray-50 border-b border-gray-200">
          <h4 className="text-sm font-medium text-gray-700 flex items-center gap-1.5">
            <DocumentTextIcon className="w-4 h-4" />
            Student Evidence ({evidence_blocks?.length || 0} block{(evidence_blocks?.length || 0) !== 1 ? 's' : ''})
          </h4>
        </div>
        <div className="p-4 max-h-[32rem] overflow-y-auto">
          {evidence_blocks && evidence_blocks.length > 0 ? (
            <div className="space-y-3">
              {evidence_blocks.map((block, idx) => {
                const type = block.block_type || block.type;
                const content = block.content || {};
                return (
                  <div key={block.id || idx} className="border border-gray-100 rounded p-3 bg-white">
                    <span className="text-xs font-medium text-gray-500 uppercase">{type}</span>
                    {type === 'text' ? (
                      <p className="text-sm text-gray-700 mt-1 whitespace-pre-wrap">
                        {content.text || (typeof content === 'string' ? content : '')}
                      </p>
                    ) : type === 'image' ? (
                      <div className="mt-1">
                        <a href={content.url} target="_blank" rel="noopener noreferrer">
                          <img
                            src={content.url}
                            alt={content.alt || content.caption || content.filename || 'Evidence image'}
                            className="max-h-48 rounded border border-gray-200 object-contain"
                          />
                        </a>
                        {content.caption && (
                          <p className="text-xs text-gray-500 mt-1">{content.caption}</p>
                        )}
                      </div>
                    ) : type === 'link' ? (
                      <div className="mt-1">
                        <a
                          href={content.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-sm text-optio-purple hover:underline break-all"
                        >
                          {content.title || content.url}
                        </a>
                        {content.description && (
                          <p className="text-xs text-gray-500 mt-0.5">{content.description}</p>
                        )}
                      </div>
                    ) : type === 'video' ? (
                      <div className="mt-1">
                        {content.url ? (
                          <a
                            href={content.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-sm text-optio-purple hover:underline break-all"
                          >
                            {content.title || content.url}
                          </a>
                        ) : (
                          <p className="text-sm text-gray-500 italic">No video URL provided</p>
                        )}
                      </div>
                    ) : type === 'document' ? (
                      <div className="mt-1">
                        <a
                          href={content.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-sm text-optio-purple hover:underline"
                        >
                          {content.filename || 'Download document'}
                        </a>
                        {content.file_size && (
                          <span className="text-xs text-gray-400 ml-2">
                            ({(content.file_size / 1024).toFixed(0)} KB)
                          </span>
                        )}
                      </div>
                    ) : (
                      <p className="text-sm text-gray-500 mt-1 italic">
                        {content.url ? (
                          <a href={content.url} target="_blank" rel="noopener noreferrer" className="text-optio-purple hover:underline">
                            {content.title || content.filename || content.url}
                          </a>
                        ) : 'Content preview not available'}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-sm text-gray-500 text-center py-4">No evidence submitted.</p>
          )}
        </div>
      </div>

      {/* Subject distribution */}
      {suggested_subjects && Object.keys(suggested_subjects).length > 0 && (
        <div className="border border-gray-200 rounded-lg p-4">
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-sm font-medium text-gray-700">Subject Credit Distribution</h4>
            <button
              onClick={() => setShowSubjectEditor(!showSubjectEditor)}
              className="text-xs text-optio-purple hover:text-optio-pink transition-colors"
            >
              {showSubjectEditor ? 'Use suggestion' : 'Override'}
            </button>
          </div>
          {showSubjectEditor ? (
            <div className="space-y-2">
              {Object.entries(subjectOverrides).map(([subject, xp]) => (
                <div key={subject} className="flex items-center gap-2">
                  <span className="text-xs text-gray-600 w-32 truncate capitalize">
                    {subject.replace(/_/g, ' ')}
                  </span>
                  <input
                    type="number"
                    value={xp}
                    onChange={(e) => handleSubjectChange(subject, e.target.value)}
                    className="w-20 px-2 py-1 text-sm border border-gray-300 rounded focus:border-optio-purple focus:ring-1 focus:ring-optio-purple outline-none"
                    min="0"
                  />
                  <span className="text-xs text-gray-500">XP</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              {Object.entries(suggested_subjects).map(([subject, xp]) => (
                <span key={subject} className="px-2 py-1 bg-gray-100 text-gray-700 text-xs rounded">
                  {subject.replace(/_/g, ' ')}: {xp} XP
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Student's current subject XP - circle progress charts */}
      {student_subject_xp && student_subject_xp.length > 0 && (() => {
        // Build XP map from student data
        const xpMap = {};
        const pendingMap = {};
        student_subject_xp.forEach(s => {
          xpMap[s.school_subject] = s.xp_amount || 0;
          pendingMap[s.school_subject] = s.pending_xp || 0;
        });

        // Show all subjects that have any XP or pending, plus subjects from this task's suggestion
        const relevantSubjects = Object.keys(CREDIT_REQUIREMENTS).filter(subj =>
          (xpMap[subj] || 0) > 0 || (pendingMap[subj] || 0) > 0 || (suggested_subjects && suggested_subjects[subj])
        );

        if (relevantSubjects.length === 0) return null;

        return (
          <div className="border border-gray-200 rounded-lg p-4">
            <h4 className="text-sm font-medium text-gray-700 mb-3">Student's Diploma Progress</h4>
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
              {relevantSubjects.map(subj => {
                const req = CREDIT_REQUIREMENTS[subj];
                if (!req) return null;
                const xp = xpMap[subj] || 0;
                const pending = pendingMap[subj] || 0;
                const creditsEarned = calculateCreditsFromXP(xp);
                const creditsPending = calculateCreditsFromXP(pending);
                const isComplete = creditsEarned >= req.credits;
                const verifiedPercent = Math.min((creditsEarned / req.credits) * 100, 100);
                const totalPercent = Math.min(((creditsEarned + creditsPending) / req.credits) * 100, 100);

                const radius = 28;
                const circumference = 2 * Math.PI * radius;
                const verifiedOffset = circumference - (verifiedPercent / 100) * circumference;
                const pendingOffset = circumference - (totalPercent / 100) * circumference;

                return (
                  <div key={subj} className="flex flex-col items-center">
                    <div className="relative w-16 h-16 mb-1">
                      <svg className="transform -rotate-90 w-16 h-16">
                        <circle cx="32" cy="32" r={radius} stroke="#E5E7EB" strokeWidth="5" fill="none" />
                        {creditsPending > 0 && (
                          <circle
                            cx="32" cy="32" r={radius}
                            stroke="#FBBF24" strokeWidth="5" fill="none"
                            strokeDasharray={circumference} strokeDashoffset={pendingOffset}
                            strokeLinecap="round"
                          />
                        )}
                        <circle
                          cx="32" cy="32" r={radius}
                          stroke={isComplete ? '#10B981' : xp > 0 ? '#6D469B' : '#D1D5DB'}
                          strokeWidth="5" fill="none"
                          strokeDasharray={circumference} strokeDashoffset={verifiedOffset}
                          strokeLinecap="round"
                        />
                      </svg>
                      <div className="absolute inset-0 flex items-center justify-center">
                        {isComplete ? (
                          <CheckIcon className="w-5 h-5 text-green-600 stroke-[3]" />
                        ) : (
                          <span className="text-xs font-bold text-gray-700">
                            {Math.round(verifiedPercent)}%
                          </span>
                        )}
                      </div>
                    </div>
                    <span className="text-[10px] text-gray-600 text-center leading-tight">
                      {req.displayName}
                    </span>
                    <span className="text-[10px] font-medium text-gray-800">
                      {creditsEarned}/{req.credits}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })()}

      {/* Iteration history */}
      {review_rounds && review_rounds.length > 1 && (
        <div className="border border-gray-200 rounded-lg p-4">
          <h4 className="text-sm font-medium text-gray-700 mb-2">Previous Rounds</h4>
          <div className="space-y-2">
            {review_rounds.filter(r => r.reviewer_action).map(round => (
              <div key={round.id} className={`p-2 rounded text-xs ${
                round.reviewer_action === 'approved' ? 'bg-green-50 text-green-800' :
                round.reviewer_action === 'grow_this' ? 'bg-blue-50 text-blue-800' :
                'bg-gray-50 text-gray-700'
              }`}>
                <span className="font-medium">Round {round.round_number}:</span>{' '}
                {round.reviewer_action === 'approved' ? 'Approved' : 'Grow This'}
                {round.reviewer_feedback && ` - "${round.reviewer_feedback}"`}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Feedback input */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Feedback {completion?.diploma_status === 'pending_review' ? '(optional for approve, required for Grow This)' : ''}
        </label>
        <textarea
          value={feedback}
          onChange={(e) => setFeedback(e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:border-optio-purple focus:ring-1 focus:ring-optio-purple outline-none resize-none"
          rows={3}
          placeholder="Write feedback for the student..."
        />
      </div>

      {/* Action buttons */}
      {completion?.diploma_status === 'pending_review' && (
        <div className="flex items-center gap-3 pt-2">
          <button
            onClick={handleApprove}
            disabled={isApproving || isReturning}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-gradient-to-r from-green-600 to-green-700 text-white font-medium rounded-lg hover:shadow-md transition-all disabled:opacity-50"
            style={{ fontFamily: 'Poppins' }}
          >
            {isApproving ? (
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              <>
                <CheckCircleIcon className="w-5 h-5" />
                Approve Credit
              </>
            )}
          </button>
          <button
            onClick={handleGrowThis}
            disabled={isApproving || isReturning}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-gradient-to-r from-blue-600 to-blue-700 text-white font-medium rounded-lg hover:shadow-md transition-all disabled:opacity-50"
            style={{ fontFamily: 'Poppins' }}
          >
            {isReturning ? (
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              <>
                <ArrowPathIcon className="w-5 h-5" />
                Grow This
              </>
            )}
          </button>
        </div>
      )}
    </div>
  );
}
