import { useState, useEffect, useCallback } from 'react';
import {
  DocumentTextIcon,
  ChatBubbleLeftRightIcon,
  CheckCircleIcon,
  ClockIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  PaperAirplaneIcon,
  BoltIcon,
  UserCircleIcon,
  XMarkIcon
} from '@heroicons/react/24/outline';
import api from '../../services/api';
import toast from 'react-hot-toast';
import { getPillarData } from '../../utils/pillarMappings';

/**
 * DraftFeedbackPanel - Admin panel for reviewing task drafts and providing iterative feedback.
 * Part of the "process is the goal" diploma credit system.
 *
 * Features:
 * - List pending drafts awaiting feedback
 * - View evidence and feedback history
 * - Add feedback for revision
 * - Mark drafts as ready for diploma credit
 * - Fast-track simple tasks directly to finalized
 */
export default function DraftFeedbackPanel() {
  const [drafts, setDrafts] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [expandedDraft, setExpandedDraft] = useState(null);
  const [feedbackText, setFeedbackText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [sortOrder, setSortOrder] = useState('oldest');
  const [activeTab, setActiveTab] = useState('pending'); // 'pending' | 'ready'

  // Load drafts and stats
  const loadDrafts = useCallback(async () => {
    setLoading(true);
    try {
      const endpoint = activeTab === 'ready'
        ? '/api/admin/drafts/ready-for-student'
        : '/api/admin/drafts/pending';

      const [draftsRes, statsRes] = await Promise.all([
        api.get(endpoint, { params: { sort: sortOrder, limit: 50 } }),
        api.get('/api/admin/drafts/stats')
      ]);

      setDrafts(draftsRes.data.data?.drafts || []);
      setStats(statsRes.data.data);
    } catch (err) {
      console.error('Failed to load drafts:', err);
      toast.error('Failed to load drafts');
    } finally {
      setLoading(false);
    }
  }, [activeTab, sortOrder]);

  useEffect(() => {
    loadDrafts();
  }, [loadDrafts]);

  // Load detailed draft info when expanded
  const loadDraftDetails = async (draftId) => {
    if (expandedDraft?.id === draftId) {
      setExpandedDraft(null);
      return;
    }

    try {
      const response = await api.get(`/api/admin/drafts/${draftId}`);
      setExpandedDraft(response.data.data);
      setFeedbackText('');
    } catch (err) {
      console.error('Failed to load draft details:', err);
      toast.error('Failed to load draft details');
    }
  };

  // Submit feedback
  const handleSubmitFeedback = async (draftId) => {
    if (!feedbackText.trim()) {
      toast.error('Please enter feedback');
      return;
    }

    setSubmitting(true);
    try {
      await api.post(`/api/admin/drafts/${draftId}/feedback`, {
        feedback_text: feedbackText
      });

      toast.success('Feedback sent to student');
      setFeedbackText('');
      loadDrafts();
      setExpandedDraft(null);
    } catch (err) {
      console.error('Failed to submit feedback:', err);
      toast.error('Failed to submit feedback');
    } finally {
      setSubmitting(false);
    }
  };

  // Mark as ready for credit
  const handleSuggestReady = async (draftId, fastTrack = false) => {
    setSubmitting(true);
    try {
      await api.put(`/api/admin/drafts/${draftId}/suggest-ready`, {
        feedback_text: feedbackText.trim() || undefined,
        fast_track: fastTrack
      });

      const message = fastTrack
        ? 'Task fast-tracked and finalized for diploma credit'
        : 'Marked ready for diploma credit - student can now finalize';

      toast.success(message);
      setFeedbackText('');
      loadDrafts();
      setExpandedDraft(null);
    } catch (err) {
      console.error('Failed to suggest ready:', err);
      toast.error('Failed to update draft status');
    } finally {
      setSubmitting(false);
    }
  };

  // Format date
  const formatDate = (dateStr) => {
    if (!dateStr) return 'Unknown';
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit'
    });
  };

  // Get pillar styling
  const getPillarStyle = (pillar) => {
    const data = getPillarData(pillar);
    return data?.gradient || 'from-gray-400 to-gray-500';
  };

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-gray-200 rounded w-1/3"></div>
          <div className="h-32 bg-gray-100 rounded"></div>
          <div className="h-32 bg-gray-100 rounded"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2" style={{ fontFamily: 'Poppins' }}>
          Draft Feedback
        </h1>
        <p className="text-gray-600">
          Review student work and provide iterative feedback toward diploma credits.
        </p>
      </div>

      {/* Stats Cards */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-1">
              <ClockIcon className="w-5 h-5 text-amber-600" />
              <span className="text-sm text-amber-700">Pending Review</span>
            </div>
            <div className="text-2xl font-bold text-amber-800">{stats.pending_drafts}</div>
          </div>

          <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-1">
              <CheckCircleIcon className="w-5 h-5 text-blue-600" />
              <span className="text-sm text-blue-700">Ready for Student</span>
            </div>
            <div className="text-2xl font-bold text-blue-800">{stats.ready_for_student}</div>
          </div>

          <div className="bg-green-50 border border-green-200 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-1">
              <DocumentTextIcon className="w-5 h-5 text-green-600" />
              <span className="text-sm text-green-700">Finalized Today</span>
            </div>
            <div className="text-2xl font-bold text-green-800">{stats.finalized_today}</div>
          </div>

          <div className="bg-purple-50 border border-purple-200 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-1">
              <ChatBubbleLeftRightIcon className="w-5 h-5 text-purple-600" />
              <span className="text-sm text-purple-700">Total Feedback</span>
            </div>
            <div className="text-2xl font-bold text-purple-800">{stats.total_feedback_given}</div>
          </div>
        </div>
      )}

      {/* Tabs and Sort */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
        <div className="flex rounded-lg bg-gray-100 p-1">
          <button
            onClick={() => setActiveTab('pending')}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              activeTab === 'pending'
                ? 'bg-white shadow text-gray-900'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            Pending Review {stats?.pending_drafts > 0 && (
              <span className="ml-1 bg-amber-500 text-white text-xs px-2 py-0.5 rounded-full">
                {stats.pending_drafts}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab('ready')}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              activeTab === 'ready'
                ? 'bg-white shadow text-gray-900'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            Ready for Student
          </button>
        </div>

        {activeTab === 'pending' && (
          <select
            value={sortOrder}
            onChange={(e) => setSortOrder(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
          >
            <option value="oldest">Oldest First</option>
            <option value="newest">Newest First</option>
          </select>
        )}
      </div>

      {/* Empty State */}
      {drafts.length === 0 && (
        <div className="text-center py-16 bg-gray-50 rounded-xl">
          <CheckCircleIcon className="w-16 h-16 mx-auto mb-4 text-green-500" />
          <h2 className="text-xl font-semibold text-gray-900 mb-2" style={{ fontFamily: 'Poppins' }}>
            {activeTab === 'pending' ? 'No Drafts Pending Review' : 'No Drafts Awaiting Student Action'}
          </h2>
          <p className="text-gray-600">
            {activeTab === 'pending'
              ? 'All student work has been reviewed. Check back later for new submissions.'
              : 'All approved work has been finalized by students.'
            }
          </p>
        </div>
      )}

      {/* Draft List */}
      <div className="space-y-4">
        {drafts.map((draft) => {
          const isExpanded = expandedDraft?.id === draft.id;
          const student = draft.users || {};
          const task = draft.user_quest_tasks || {};
          const quest = draft.quests || {};
          const pillarGradient = getPillarStyle(task.pillar);

          return (
            <div
              key={draft.id}
              className={`bg-white border rounded-xl overflow-hidden transition-shadow ${
                isExpanded ? 'shadow-lg border-optio-purple' : 'shadow-sm hover:shadow-md'
              }`}
            >
              {/* Draft Header */}
              <button
                onClick={() => loadDraftDetails(draft.id)}
                className="w-full p-4 text-left hover:bg-gray-50 transition-colors"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-4 flex-1 min-w-0">
                    {/* Avatar */}
                    {student.avatar_url ? (
                      <img
                        src={student.avatar_url}
                        alt=""
                        className="w-10 h-10 rounded-full flex-shrink-0"
                      />
                    ) : (
                      <UserCircleIcon className="w-10 h-10 text-gray-400 flex-shrink-0" />
                    )}

                    {/* Content */}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-gray-900 truncate">
                          {student.display_name || student.email || 'Unknown Student'}
                        </span>
                        <span className={`text-xs px-2 py-0.5 rounded-full bg-gradient-to-r ${pillarGradient} text-white`}>
                          {task.pillar || 'unknown'}
                        </span>
                        {draft.revision_number > 1 && (
                          <span className="text-xs px-2 py-0.5 rounded bg-blue-100 text-blue-700">
                            Revision {draft.revision_number}
                          </span>
                        )}
                      </div>

                      <h3 className="text-gray-800 font-medium mt-1 truncate">
                        {task.title || 'Untitled Task'}
                      </h3>

                      <p className="text-sm text-gray-500 mt-1">
                        {quest.title || 'Unknown Quest'} | Submitted {formatDate(draft.completed_at)}
                      </p>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {draft.feedback_count > 0 && (
                      <span className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded">
                        {draft.feedback_count} feedback
                      </span>
                    )}
                    {isExpanded ? (
                      <ChevronUpIcon className="w-5 h-5 text-gray-400" />
                    ) : (
                      <ChevronDownIcon className="w-5 h-5 text-gray-400" />
                    )}
                  </div>
                </div>
              </button>

              {/* Expanded Details */}
              {isExpanded && expandedDraft && (
                <div className="border-t bg-gray-50 p-4">
                  {/* Evidence Preview */}
                  <div className="mb-6">
                    <h4 className="text-sm font-semibold text-gray-700 mb-2">Evidence Submitted</h4>
                    <div className="bg-white rounded-lg p-4 border">
                      {expandedDraft.is_confidential ? (
                        <p className="text-gray-500 italic">Evidence marked as confidential</p>
                      ) : expandedDraft.evidence_text ? (
                        <p className="text-gray-800 whitespace-pre-wrap">{expandedDraft.evidence_text}</p>
                      ) : expandedDraft.evidence_url ? (
                        <a
                          href={expandedDraft.evidence_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-600 hover:underline break-all"
                        >
                          {expandedDraft.evidence_url}
                        </a>
                      ) : (
                        <p className="text-gray-500 italic">No evidence available</p>
                      )}
                    </div>
                  </div>

                  {/* Subject XP Distribution */}
                  {(expandedDraft.user_quest_tasks?.subject_xp_distribution ||
                    expandedDraft.user_quest_tasks?.diploma_subjects) && (
                    <div className="mb-6">
                      <h4 className="text-sm font-semibold text-gray-700 mb-2">Diploma Credits</h4>
                      <div className="flex flex-wrap gap-2">
                        {Object.entries(
                          expandedDraft.user_quest_tasks?.subject_xp_distribution ||
                          expandedDraft.user_quest_tasks?.diploma_subjects || {}
                        ).map(([subject, value]) => (
                          <span
                            key={subject}
                            className="px-3 py-1 bg-purple-100 text-purple-700 rounded-full text-sm"
                          >
                            {subject}: {typeof value === 'number' && value <= 100 ? `${value}%` : `${value} XP`}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Feedback History */}
                  {expandedDraft.feedback_history?.length > 0 && (
                    <div className="mb-6">
                      <h4 className="text-sm font-semibold text-gray-700 mb-2">Feedback History</h4>
                      <div className="space-y-3">
                        {expandedDraft.feedback_history.map((fb) => (
                          <div key={fb.id} className="bg-white rounded-lg p-3 border">
                            <div className="flex justify-between items-start mb-1">
                              <span className="text-xs text-gray-500">
                                Revision {fb.revision_number} | {formatDate(fb.created_at)}
                              </span>
                              <span className="text-xs text-gray-500">
                                {fb.users?.display_name || 'Reviewer'}
                              </span>
                            </div>
                            <p className="text-gray-800">{fb.feedback_text}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Feedback Input */}
                  {activeTab === 'pending' && (
                    <div className="mb-4">
                      <label className="text-sm font-semibold text-gray-700 mb-2 block">
                        Add Feedback
                      </label>
                      <textarea
                        value={feedbackText}
                        onChange={(e) => setFeedbackText(e.target.value)}
                        placeholder="Enter feedback for the student..."
                        rows={3}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-optio-purple focus:border-transparent resize-none"
                      />
                    </div>
                  )}

                  {/* Action Buttons */}
                  {activeTab === 'pending' && (
                    <div className="flex flex-wrap gap-3">
                      <button
                        onClick={() => handleSubmitFeedback(draft.id)}
                        disabled={submitting || !feedbackText.trim()}
                        className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                      >
                        <PaperAirplaneIcon className="w-4 h-4" />
                        Send Feedback
                      </button>

                      <button
                        onClick={() => handleSuggestReady(draft.id, false)}
                        disabled={submitting}
                        className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                      >
                        <CheckCircleIcon className="w-4 h-4" />
                        Ready for Credit
                      </button>

                      <button
                        onClick={() => handleSuggestReady(draft.id, true)}
                        disabled={submitting}
                        className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-optio-purple to-optio-pink text-white rounded-lg hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        title="Skip student finalization step - directly award diploma credit"
                      >
                        <BoltIcon className="w-4 h-4" />
                        Fast-Track
                      </button>
                    </div>
                  )}

                  {/* Close Button */}
                  <button
                    onClick={() => setExpandedDraft(null)}
                    className="mt-4 text-sm text-gray-500 hover:text-gray-700"
                  >
                    Close
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
