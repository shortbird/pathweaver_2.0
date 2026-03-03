import { useState, useEffect, useCallback, useRef } from 'react';
import api from '../../services/api';
import CreditReviewDetail from './CreditReviewDetail';
import {
  AcademicCapIcon,
  ArrowPathIcon,
  ClockIcon,
  UserCircleIcon,
} from '@heroicons/react/24/outline';

export default function CreditReviewQueue({ studentId = null, studentName = null }) {
  const [queue, setQueue] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedCompletionId, setSelectedCompletionId] = useState(null);
  const fetchIdRef = useRef(0);

  const fetchQueue = useCallback(async () => {
    const fetchId = ++fetchIdRef.current;
    try {
      setLoading(true);
      setError(null);
      const response = await api.get('/api/advisor/credit-queue');

      // Ignore stale responses (from React StrictMode double-mount or rapid re-fetches)
      if (fetchId !== fetchIdRef.current) return;

      let items = response.data.data?.queue || [];

      // Filter by student if provided
      if (studentId) {
        items = items.filter(item => item.student_id === studentId);
      }

      setQueue(items);
    } catch (err) {
      // Ignore errors from stale fetches
      if (fetchId !== fetchIdRef.current) return;
      setError('Failed to load credit review queue');
    } finally {
      if (fetchId === fetchIdRef.current) {
        setLoading(false);
      }
    }
  }, [studentId]);

  useEffect(() => {
    fetchQueue();
  }, [fetchQueue]);

  const handleReviewComplete = async () => {
    // Find current index before refetching
    const currentIndex = queue.findIndex(item => item.completion_id === selectedCompletionId);

    // Fetch updated queue
    const fetchId = ++fetchIdRef.current;
    try {
      const response = await api.get('/api/advisor/credit-queue');
      if (fetchId !== fetchIdRef.current) return;

      let items = response.data.data?.queue || [];
      if (studentId) {
        items = items.filter(item => item.student_id === studentId);
      }
      setQueue(items);

      // Auto-advance to next item at same position, or go back to list if empty
      if (items.length > 0) {
        const nextIndex = Math.min(currentIndex, items.length - 1);
        setSelectedCompletionId(items[Math.max(0, nextIndex)].completion_id);
      } else {
        setSelectedCompletionId(null);
      }
    } catch (err) {
      if (fetchId !== fetchIdRef.current) return;
      setError('Failed to load credit review queue');
      setSelectedCompletionId(null);
    }
  };

  if (selectedCompletionId) {
    return (
      <CreditReviewDetail
        completionId={selectedCompletionId}
        onBack={() => setSelectedCompletionId(null)}
        onActionComplete={handleReviewComplete}
      />
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <ArrowPathIcon className="w-8 h-8 text-optio-purple animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-md p-4">
        <p className="text-red-800 text-sm">{error}</p>
        <button
          onClick={fetchQueue}
          className="mt-2 text-sm text-red-600 hover:text-red-800 underline"
        >
          Try again
        </button>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <AcademicCapIcon className="w-5 h-5 text-optio-purple" />
          <h3 className="text-lg font-semibold text-gray-900" style={{ fontFamily: 'Poppins' }}>
            {studentId ? 'Credit Reviews' : 'Credit Review Queue'}
          </h3>
          {queue.length > 0 && (
            <span className="px-2 py-0.5 bg-optio-purple text-white text-xs font-bold rounded-full">
              {queue.length}
            </span>
          )}
        </div>
        <button
          onClick={fetchQueue}
          className="p-1.5 text-gray-500 hover:text-optio-purple hover:bg-gray-100 rounded-lg transition-colors"
          title="Refresh"
        >
          <ArrowPathIcon className="w-4 h-4" />
        </button>
      </div>

      {queue.length === 0 ? (
        <div className="text-center py-8 text-gray-500">
          <AcademicCapIcon className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="text-sm">No pending credit reviews.</p>
          <p className="text-xs text-gray-400 mt-1">
            Students will appear here when they request diploma credit.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {queue.map(item => (
            <button
              key={item.completion_id}
              onClick={() => setSelectedCompletionId(item.completion_id)}
              className="w-full text-left p-3 border border-gray-200 rounded-lg hover:border-optio-purple/30 hover:bg-optio-purple/5 transition-colors group"
            >
              <div className="flex items-start gap-3">
                {!studentId && (
                  <div className="flex-shrink-0">
                    {item.student_avatar ? (
                      <img
                        src={item.student_avatar}
                        alt={item.student_name}
                        className="w-8 h-8 rounded-full object-cover"
                      />
                    ) : (
                      <UserCircleIcon className="w-8 h-8 text-gray-400" />
                    )}
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  {!studentId && (
                    <p className="text-xs font-medium text-gray-600 mb-0.5">
                      {item.student_name}
                    </p>
                  )}
                  <p className="text-sm font-medium text-gray-900 truncate group-hover:text-optio-purple transition-colors">
                    {item.task_title}
                  </p>
                  <p className="text-xs text-gray-500 truncate">
                    {item.quest_title}
                  </p>
                  <div className="flex items-center gap-2 mt-1.5">
                    {item.pillar && (
                      <span className="px-1.5 py-0.5 bg-gray-100 text-gray-600 text-xs rounded">
                        {item.pillar}
                      </span>
                    )}
                    <span className="text-xs text-gray-500">{item.xp_value} XP</span>
                    {item.evidence_block_count > 0 && (
                      <span className="text-xs text-gray-400">
                        {item.evidence_block_count} evidence block{item.evidence_block_count !== 1 ? 's' : ''}
                      </span>
                    )}
                    {item.revision_number > 1 && (
                      <span className="px-1.5 py-0.5 bg-blue-50 text-blue-700 text-xs rounded">
                        Round {item.revision_number}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex-shrink-0 flex items-center gap-1 text-xs text-gray-400">
                  <ClockIcon className="w-3.5 h-3.5" />
                  {item.submitted_at
                    ? new Date(item.submitted_at).toLocaleDateString()
                    : 'Unknown'
                  }
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
