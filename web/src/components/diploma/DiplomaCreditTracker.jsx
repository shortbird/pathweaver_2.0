import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import api from '../../services/api';
import { useStudentScope } from '../../hooks/useStudentScope';
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
  pending_review: {
    label: 'Awaiting Review',
    color: 'bg-amber-100 text-amber-800',
    icon: ClockIcon,
  },
  finalized: {
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
  { key: 'pending_review', label: 'Awaiting Review' },
  // Approved credit is not actionable, but the reviewer's note on it was
  // written to the database and shown to nobody until this tab existed.
  { key: 'finalized', label: 'Approved' },
];

// Approved credit accumulates for as long as the student is enrolled. The
// dashboard shows the newest few and the rest on request, so a hundred
// finalized rows do not push everything under the tracker off the screen.
const APPROVED_PREVIEW = 8;

export default function DiplomaCreditTracker() {
  // Family scope: on a child's dashboard this is the CHILD's credit requests.
  // Every other read on that page carries the scope; this one showed the
  // parent's own (empty) list under the child's name.
  const { params: scopeParams, scopeId } = useStudentScope();
  const [creditRequests, setCreditRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filter, setFilter] = useState(null); // null = auto-select based on data
  const [expandedId, setExpandedId] = useState(null);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [showAllApproved, setShowAllApproved] = useState(false);

  // Set-state-after-unmount guard: the fetch can resolve after the component
  // (or the test environment) is gone, and the late setLoading/setError then
  // throws — seen as vitest "Unhandled Rejection: window is not defined"
  // failing CI runs where every test passed (2026-07-21).
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    fetchCreditRequests();
    return () => { mountedRef.current = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scopeId]);

  const fetchCreditRequests = async () => {
    try {
      setLoading(true);
      const response = await api.get('/api/tasks/my-credit-requests', { params: scopeParams });
      if (!mountedRef.current) return;
      const requests = response.data.data?.credit_requests || [];
      setCreditRequests(requests);

      // Auto-select the first tab that has actionable items
      if (filter === null && requests.length > 0) {
        const growCount = requests.filter(r => r.diploma_status === 'grow_this').length;
        const pendingAnyCount = requests.filter(r =>
          ['pending_review', 'pending_org_approval'].includes(r.diploma_status)
        ).length;
        if (growCount > 0) {
          setFilter('grow_this');
        } else if (pendingAnyCount > 0) {
          // Pick the first pending tab that has items
          const firstPending = requests.find(r =>
            ['pending_org_approval', 'pending_review'].includes(r.diploma_status)
          );
          if (firstPending) setFilter(firstPending.diploma_status);
        } else if (requests.some(r => r.diploma_status === 'finalized')) {
          // Nothing to do: the newest approvals, and any note that came
          // with them, are what the student came to see.
          setFilter('finalized');
        }
        // Otherwise filter stays null — shows "all caught up" summary
      }
    } catch (err) {
      if (mountedRef.current) setError('Failed to load credit requests');
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  };

  const filtered = filter
    ? creditRequests.filter(r => r.diploma_status === filter)
    : [];
  const previewCapped = filter === 'finalized' && !showAllApproved
    && filtered.length > APPROVED_PREVIEW;
  const visible = previewCapped ? filtered.slice(0, APPROVED_PREVIEW) : filtered;

  const growCount = creditRequests.filter(r => r.diploma_status === 'grow_this').length;
  const pendingCount = creditRequests.filter(r =>
    ['pending_review', 'pending_org_approval'].includes(r.diploma_status)
  ).length;
  const approvedCount = creditRequests.filter(r => r.diploma_status === 'finalized').length;
  const allCaughtUp = growCount === 0 && pendingCount === 0;
  // Tabs earn their row once there is something to switch between.
  const tabsWithItems = FILTER_TABS.filter(tab =>
    creditRequests.some(r => r.diploma_status === tab.key)
  );

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

          {allCaughtUp && approvedCount === 0 && (
            <p className="text-sm text-gray-500 text-center py-3">
              All caught up! Complete tasks and request diploma credit to track progress here.
            </p>
          )}

          {/* Filter tabs - only once there is more than one category to switch between */}
          {tabsWithItems.length > 1 && (
            <div className="flex gap-1 mb-4 overflow-x-auto" role="tablist">
              {tabsWithItems.map(tab => {
                const count = creditRequests.filter(r => r.diploma_status === tab.key).length;
                return (
                  <button
                    key={tab.key}
                    role="tab"
                    aria-selected={filter === tab.key}
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

          {/* Credit request list */}
          {filter && filtered.length === 0 ? (
            <p className="text-sm text-gray-500 text-center py-4">
              No credit requests in this category.
            </p>
          ) : filtered.length > 0 && (
            <div className="space-y-3">
              {visible.map(req => {
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
                        req.diploma_status === 'finalized' ? 'text-green-600' :
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

                        {/* The reviewer's note: what to grow, or what was
                            good about it. Both come from the latest review
                            round, so an approval with no note shows nothing. */}
                        {req.diploma_status === 'grow_this' && req.latest_feedback && (
                          <div className="mb-3 bg-blue-50 border border-blue-200 rounded-md p-3">
                            <p className="text-xs font-medium text-blue-800 mb-1">Teacher Feedback:</p>
                            <p className="text-sm text-blue-900 whitespace-pre-wrap">{req.latest_feedback}</p>
                          </div>
                        )}
                        {req.diploma_status === 'finalized' && req.latest_feedback && (
                          <div className="mb-3 bg-green-50 border border-green-200 rounded-md p-3">
                            <p className="text-xs font-medium text-green-800 mb-1">Teacher Feedback:</p>
                            <p className="text-sm text-green-900 whitespace-pre-wrap">{req.latest_feedback}</p>
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
                          {req.diploma_status === 'finalized' && req.finalized_at ? (
                            <span className="text-xs text-gray-400 ml-auto">
                              Approved {new Date(req.finalized_at).toLocaleDateString()}
                            </span>
                          ) : req.credit_requested_at && (
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
              {previewCapped && (
                <button
                  type="button"
                  onClick={() => setShowAllApproved(true)}
                  className="w-full py-2 text-xs font-medium text-optio-purple hover:text-optio-pink transition-colors"
                >
                  Show all {filtered.length} approved
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
