import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import api from '../../services/api';
import CreditIterationHistory from './CreditIterationHistory';
import {
  ClockIcon,
  CheckCircleIcon,
  ArrowPathIcon,
  AcademicCapIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  ChevronRightIcon,
} from '@heroicons/react/24/outline';

const STATUS_CONFIG = {
  pending_org_approval: {
    label: 'Awaiting Org Review',
    color: 'bg-purple-100 text-purple-800',
    icon: ClockIcon,
  },
  pending_optio_approval: {
    label: 'Awaiting Optio Review',
    color: 'bg-indigo-100 text-indigo-800',
    icon: ClockIcon,
  },
  pending_review: {
    label: 'Awaiting Review',
    color: 'bg-amber-100 text-amber-800',
    icon: ClockIcon,
  },
  approved: {
    label: 'Approved',
    color: 'bg-green-100 text-green-800',
    icon: CheckCircleIcon,
  },
  grow_this: {
    label: 'Grow This',
    color: 'bg-blue-100 text-blue-800',
    icon: ArrowPathIcon,
  },
};

const FILTER_TABS = [
  { key: 'grow_this', label: 'Grow This' },
  { key: 'pending_org_approval', label: 'Awaiting Org Review' },
  { key: 'pending_optio_approval', label: 'Awaiting Optio Review' },
  { key: 'pending_review', label: 'Awaiting Review' },
];

export default function DiplomaCreditTracker() {
  const [creditRequests, setCreditRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filter, setFilter] = useState(null); // null = auto-select based on data
  const [expandedId, setExpandedId] = useState(null);
  const [isCollapsed, setIsCollapsed] = useState(false);

  useEffect(() => {
    fetchCreditRequests();
  }, []);

  const fetchCreditRequests = async () => {
    try {
      setLoading(true);
      const response = await api.get('/api/tasks/my-credit-requests');
      const requests = response.data.data?.credit_requests || [];
      setCreditRequests(requests);

      // Auto-select the first tab that has actionable items
      if (filter === null && requests.length > 0) {
        const growCount = requests.filter(r => r.diploma_status === 'grow_this').length;
        const pendingAnyCount = requests.filter(r =>
          ['pending_review', 'pending_org_approval', 'pending_optio_approval'].includes(r.diploma_status)
        ).length;
        if (growCount > 0) {
          setFilter('grow_this');
        } else if (pendingAnyCount > 0) {
          // Pick the first pending tab that has items
          const firstPending = requests.find(r =>
            ['pending_org_approval', 'pending_optio_approval', 'pending_review'].includes(r.diploma_status)
          );
          if (firstPending) setFilter(firstPending.diploma_status);
        }
        // Otherwise filter stays null — shows "all caught up" summary
      }
    } catch (err) {
      setError('Failed to load credit requests');
    } finally {
      setLoading(false);
    }
  };

  const filtered = filter
    ? creditRequests.filter(r => r.diploma_status === filter)
    : [];

  const growCount = creditRequests.filter(r => r.diploma_status === 'grow_this').length;
  const pendingCount = creditRequests.filter(r =>
    ['pending_review', 'pending_org_approval', 'pending_optio_approval'].includes(r.diploma_status)
  ).length;
  const approvedCount = creditRequests.filter(r => r.diploma_status === 'approved').length;
  const allCaughtUp = growCount === 0 && pendingCount === 0;

  if (loading) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-6 bg-gray-200 rounded w-48" />
          <div className="h-4 bg-gray-200 rounded w-full" />
          <div className="h-4 bg-gray-200 rounded w-3/4" />
        </div>
      </div>
    );
  }

  if (creditRequests.length === 0 && !error) {
    return null; // Don't show section if no credit requests
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
      {/* Collapsible header */}
      <button
        onClick={() => setIsCollapsed(!isCollapsed)}
        className="w-full flex items-center gap-2 p-4 sm:px-6 hover:bg-gray-50 transition-colors text-left"
      >
        <AcademicCapIcon className="w-5 h-5 text-optio-purple flex-shrink-0" />
        <h2 className="text-lg font-bold text-gray-900 font-['Poppins']">
          Diploma Credit Tracker
        </h2>
        {growCount > 0 && (
          <span className="px-2 py-0.5 text-xs font-bold rounded-full bg-blue-100 text-blue-800">
            {growCount} to revise
          </span>
        )}
        {pendingCount > 0 && growCount === 0 && (
          <span className="px-2 py-0.5 text-xs font-bold rounded-full bg-amber-100 text-amber-800">
            {pendingCount} awaiting review
          </span>
        )}
        <div className="ml-auto flex items-center gap-2">
          <span className="text-sm text-gray-500">
            {allCaughtUp ? 'All caught up!' : `${approvedCount} approved`}
          </span>
          {isCollapsed ? (
            <ChevronRightIcon className="w-4 h-4 text-gray-400" />
          ) : (
            <ChevronDownIcon className="w-4 h-4 text-gray-400" />
          )}
        </div>
      </button>

      {!isCollapsed && (
        <div className="px-4 sm:px-6 pb-4 sm:pb-6">
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-md p-3 mb-4">
              <p className="text-red-800 text-sm">{error}</p>
            </div>
          )}

          {allCaughtUp ? (
            <p className="text-sm text-gray-500 text-center py-3">
              All caught up! Complete tasks and request diploma credit to track progress here.
            </p>
          ) : (
            <>
              {/* Filter tabs - only show if both categories have items */}
              {growCount > 0 && pendingCount > 0 && (
                <div className="flex gap-1 mb-4 overflow-x-auto">
                  {FILTER_TABS.map(tab => {
                    const count = creditRequests.filter(r => r.diploma_status === tab.key).length;
                    if (count === 0) return null;
                    return (
                      <button
                        key={tab.key}
                        onClick={() => setFilter(tab.key)}
                        className={`px-3 py-1.5 text-xs font-medium rounded-full whitespace-nowrap transition-colors ${
                          filter === tab.key
                            ? 'bg-optio-purple text-white'
                            : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                        }`}
                      >
                        {tab.label} ({count})
                      </button>
                    );
                  })}
                </div>
              )}
            </>
          )}

          {/* Credit request list */}
          {!allCaughtUp && filtered.length === 0 ? (
            <p className="text-sm text-gray-500 text-center py-4">
              No credit requests in this category.
            </p>
          ) : filtered.length > 0 && (
            <div className="space-y-3">
              {filtered.map(req => {
                const config = STATUS_CONFIG[req.diploma_status] || STATUS_CONFIG.pending_review;
                const StatusIcon = config.icon;
                const isExpanded = expandedId === req.completion_id;

                return (
                  <div
                    key={req.completion_id}
                    className="border border-gray-200 rounded-lg overflow-hidden"
                  >
                    <button
                      onClick={() => setExpandedId(isExpanded ? null : req.completion_id)}
                      className="w-full flex items-center gap-3 p-3 hover:bg-gray-50 transition-colors text-left"
                    >
                      <StatusIcon className={`w-5 h-5 flex-shrink-0 ${
                        req.diploma_status === 'approved' ? 'text-green-600' :
                        req.diploma_status === 'grow_this' ? 'text-blue-600' :
                        'text-amber-600'
                      }`} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">
                          {req.task_title}
                        </p>
                        <p className="text-xs text-gray-500 truncate">
                          {req.quest_title}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${config.color}`}>
                          {config.label}
                        </span>
                        {req.subjects && Object.keys(req.subjects).length > 0 && (
                          <span className="text-xs text-gray-500">
                            {Object.values(req.subjects).reduce((a, b) => a + b, 0)} XP
                          </span>
                        )}
                        {isExpanded ? (
                          <ChevronUpIcon className="w-4 h-4 text-gray-400" />
                        ) : (
                          <ChevronDownIcon className="w-4 h-4 text-gray-400" />
                        )}
                      </div>
                    </button>

                    {isExpanded && (
                      <div className="border-t border-gray-100 p-3 bg-gray-50">
                        {/* Subject breakdown */}
                        {req.subjects && Object.keys(req.subjects).length > 0 && (
                          <div className="mb-3">
                            <p className="text-xs font-medium text-gray-600 mb-1">Subject Credits:</p>
                            <div className="flex flex-wrap gap-1">
                              {Object.entries(req.subjects).map(([subject, xp]) => (
                                <span
                                  key={subject}
                                  className="px-2 py-0.5 bg-white border border-gray-200 rounded text-xs text-gray-700"
                                >
                                  {subject.replace(/_/g, ' ')}: {xp} XP
                                </span>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Grow This feedback */}
                        {req.diploma_status === 'grow_this' && req.latest_feedback && (
                          <div className="mb-3 bg-blue-50 border border-blue-200 rounded-md p-3">
                            <p className="text-xs font-medium text-blue-800 mb-1">Advisor Feedback:</p>
                            <p className="text-sm text-blue-900">{req.latest_feedback}</p>
                          </div>
                        )}

                        {/* Actions */}
                        <div className="flex items-center gap-2">
                          {req.diploma_status === 'grow_this' && req.quest_id && (
                            <Link
                              to={`/quests/${req.quest_id}?task=${req.task_id}`}
                              className="px-3 py-1.5 bg-optio-purple text-white text-xs font-medium rounded-md hover:bg-purple-700 transition-colors"
                            >
                              Revise & Resubmit
                            </Link>
                          )}
                          {req.revision_number > 1 && (
                            <span className="text-xs text-gray-500">
                              Round {req.revision_number}
                            </span>
                          )}
                          {req.credit_requested_at && (
                            <span className="text-xs text-gray-400 ml-auto">
                              {new Date(req.credit_requested_at).toLocaleDateString()}
                            </span>
                          )}
                        </div>

                        {/* Iteration history (expandable) */}
                        {req.task_id && (
                          <CreditIterationHistory
                            taskId={req.task_id}
                            completionId={req.completion_id}
                            compact
                          />
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
