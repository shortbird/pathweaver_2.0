import { useState, useEffect } from 'react';
import api from '../../services/api';
import {
  ChevronDownIcon,
  ChevronUpIcon,
  CheckCircleIcon,
  ArrowPathIcon,
  DocumentTextIcon,
} from '@heroicons/react/24/outline';

export default function CreditIterationHistory({ taskId, completionId, compact = false }) {
  const [rounds, setRounds] = useState([]);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    if (expanded && rounds.length === 0) {
      fetchHistory();
    }
  }, [expanded]);

  const fetchHistory = async () => {
    try {
      setLoading(true);
      const response = await api.get(`/api/tasks/${taskId}/credit-history`);
      setRounds(response.data.data?.rounds || []);
    } catch {
      // Silently fail - this is supplementary info
    } finally {
      setLoading(false);
    }
  };

  if (compact && rounds.length === 0 && !expanded) {
    return (
      <button
        onClick={() => setExpanded(true)}
        className="mt-2 text-xs text-optio-purple hover:text-optio-pink transition-colors flex items-center gap-1"
      >
        <DocumentTextIcon className="w-3.5 h-3.5" />
        View iteration history
      </button>
    );
  }

  if (!expanded && compact) {
    return (
      <button
        onClick={() => setExpanded(true)}
        className="mt-2 text-xs text-optio-purple hover:text-optio-pink transition-colors flex items-center gap-1"
      >
        <ChevronDownIcon className="w-3.5 h-3.5" />
        {rounds.length} review round{rounds.length !== 1 ? 's' : ''}
      </button>
    );
  }

  return (
    <div className={compact ? 'mt-3' : ''}>
      {compact && (
        <button
          onClick={() => setExpanded(false)}
          className="mb-2 text-xs text-optio-purple hover:text-optio-pink transition-colors flex items-center gap-1"
        >
          <ChevronUpIcon className="w-3.5 h-3.5" />
          Hide iteration history
        </button>
      )}

      {loading ? (
        <div className="flex items-center gap-2 py-2">
          <ArrowPathIcon className="w-4 h-4 text-gray-400 animate-spin" />
          <span className="text-xs text-gray-500">Loading history...</span>
        </div>
      ) : rounds.length === 0 ? (
        <p className="text-xs text-gray-500 py-2">No review rounds yet.</p>
      ) : (
        <div className="space-y-2">
          {!compact && (
            <h4 className="text-sm font-medium text-gray-700 mb-2">
              Review History ({rounds.length} round{rounds.length !== 1 ? 's' : ''})
            </h4>
          )}
          {rounds.map((round) => (
            <div
              key={round.id}
              className={`border rounded-md p-2.5 ${
                round.reviewer_action === 'approved'
                  ? 'border-green-200 bg-green-50'
                  : round.reviewer_action === 'grow_this'
                  ? 'border-blue-200 bg-blue-50'
                  : 'border-gray-200 bg-white'
              }`}
            >
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs font-medium text-gray-600">
                  Round {round.round_number}
                </span>
                {round.reviewer_action === 'approved' && (
                  <span className="flex items-center gap-1 text-xs text-green-700">
                    <CheckCircleIcon className="w-3.5 h-3.5" />
                    Approved
                  </span>
                )}
                {round.reviewer_action === 'grow_this' && (
                  <span className="flex items-center gap-1 text-xs text-blue-700">
                    <ArrowPathIcon className="w-3.5 h-3.5" />
                    Grow This
                  </span>
                )}
                {!round.reviewer_action && (
                  <span className="text-xs text-amber-600">Pending review</span>
                )}
                <span className="text-xs text-gray-400 ml-auto">
                  {new Date(round.submitted_at).toLocaleDateString()}
                </span>
              </div>

              {round.reviewer_feedback && (
                <p className="text-xs text-gray-700 mt-1">
                  {round.reviewer_name && (
                    <span className="font-medium">{round.reviewer_name}: </span>
                  )}
                  {round.reviewer_feedback}
                </p>
              )}

              {round.approved_subjects && Object.keys(round.approved_subjects).length > 0 && (
                <div className="flex flex-wrap gap-1 mt-1.5">
                  {Object.entries(round.approved_subjects).map(([subject, xp]) => (
                    <span
                      key={subject}
                      className="px-1.5 py-0.5 bg-green-100 text-green-800 text-xs rounded"
                    >
                      {subject.replace(/_/g, ' ')}: {xp} XP
                    </span>
                  ))}
                </div>
              )}

              {round.evidence_snapshot && round.evidence_snapshot.length > 0 && !compact && (
                <p className="text-xs text-gray-500 mt-1">
                  {round.evidence_snapshot.length} evidence block{round.evidence_snapshot.length !== 1 ? 's' : ''} submitted
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
