import React, { useState, useEffect, useCallback } from 'react';
import api from '../../services/api';
import { GlobeAltIcon, ShieldCheckIcon, XMarkIcon, CheckIcon } from '@heroicons/react/24/outline';
import logger from '../../utils/logger';

/**
 * VisibilityApprovalSection - Shows pending portfolio visibility requests from children
 *
 * FERPA compliance: Parents must approve before minors can make their portfolios public.
 * This section appears on the parent dashboard when there are pending requests.
 */
const VisibilityApprovalSection = () => {
  const [pendingRequests, setPendingRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [respondingTo, setRespondingTo] = useState(null);
  const [showDenyReason, setShowDenyReason] = useState(null);
  const [denyReason, setDenyReason] = useState('');

  // Fetch pending visibility requests
  const fetchPendingRequests = useCallback(async () => {
    try {
      const response = await api.get('/api/parental-consent/visibility-approval/pending');
      if (response.data?.pending_requests) {
        setPendingRequests(response.data.pending_requests);
      }
    } catch (error) {
      logger.error('Failed to fetch visibility requests:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPendingRequests();
  }, [fetchPendingRequests]);

  // Handle approve
  const handleApprove = async (requestId, studentName) => {
    setRespondingTo(requestId);
    try {
      await api.post(`/api/parental-consent/visibility-approval/${requestId}/respond`, {
        approved: true
      });
      // Remove from list
      setPendingRequests(prev => prev.filter(r => r.id !== requestId));
    } catch (error) {
      logger.error('Failed to approve visibility request:', error);
      alert(error.response?.data?.error || 'Failed to approve request');
    } finally {
      setRespondingTo(null);
    }
  };

  // Handle deny
  const handleDeny = async (requestId, studentName) => {
    setRespondingTo(requestId);
    try {
      await api.post(`/api/parental-consent/visibility-approval/${requestId}/respond`, {
        approved: false,
        reason: denyReason || 'Parent did not approve'
      });
      // Remove from list
      setPendingRequests(prev => prev.filter(r => r.id !== requestId));
      setShowDenyReason(null);
      setDenyReason('');
    } catch (error) {
      logger.error('Failed to deny visibility request:', error);
      alert(error.response?.data?.error || 'Failed to deny request');
    } finally {
      setRespondingTo(null);
    }
  };

  // Format date
  const formatDate = (dateString) => {
    if (!dateString) return '';
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  };

  // Don't render if no pending requests or still loading
  if (loading) return null;
  if (pendingRequests.length === 0) return null;

  return (
    <div className="mb-6">
      <div className="bg-amber-50 border border-amber-200 rounded-lg overflow-hidden">
        {/* Header */}
        <div className="bg-amber-100 px-4 py-3 flex items-center gap-2">
          <ShieldCheckIcon className="w-5 h-5 text-amber-700" />
          <h3 className="font-semibold text-amber-800" style={{ fontFamily: 'Poppins, sans-serif' }}>
            Portfolio Visibility Requests ({pendingRequests.length})
          </h3>
        </div>

        {/* Requests list */}
        <div className="divide-y divide-amber-200">
          {pendingRequests.map((request) => (
            <div key={request.id} className="px-4 py-4">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div className="flex items-start gap-3">
                  <GlobeAltIcon className="w-6 h-6 text-amber-600 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="font-medium text-gray-900" style={{ fontFamily: 'Poppins, sans-serif' }}>
                      {request.student_name} wants to make their portfolio public
                    </p>
                    <p className="text-sm text-gray-600 mt-1" style={{ fontFamily: 'Poppins, sans-serif' }}>
                      Requested on {formatDate(request.requested_at)}
                    </p>
                    <p className="text-xs text-gray-500 mt-1" style={{ fontFamily: 'Poppins, sans-serif' }}>
                      This will allow anyone with the link to view their achievements and learning evidence.
                    </p>
                  </div>
                </div>

                {/* Action buttons */}
                {showDenyReason === request.id ? (
                  <div className="flex flex-col gap-2 min-w-[200px]">
                    <input
                      type="text"
                      value={denyReason}
                      onChange={(e) => setDenyReason(e.target.value)}
                      placeholder="Reason (optional)"
                      className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-optio-purple"
                    />
                    <div className="flex gap-2">
                      <button
                        onClick={() => {
                          setShowDenyReason(null);
                          setDenyReason('');
                        }}
                        className="flex-1 px-3 py-2 text-sm text-gray-600 hover:text-gray-800 transition-colors"
                        disabled={respondingTo === request.id}
                      >
                        Cancel
                      </button>
                      <button
                        onClick={() => handleDeny(request.id, request.student_name)}
                        disabled={respondingTo === request.id}
                        className="flex-1 px-3 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 disabled:opacity-50 transition-colors"
                      >
                        {respondingTo === request.id ? 'Denying...' : 'Confirm Deny'}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex gap-2">
                    <button
                      onClick={() => setShowDenyReason(request.id)}
                      disabled={respondingTo === request.id}
                      className="flex items-center gap-1.5 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50 disabled:opacity-50 transition-colors min-h-[44px]"
                    >
                      <XMarkIcon className="w-4 h-4" />
                      Deny
                    </button>
                    <button
                      onClick={() => handleApprove(request.id, request.student_name)}
                      disabled={respondingTo === request.id}
                      className="flex items-center gap-1.5 px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50 transition-colors min-h-[44px]"
                    >
                      {respondingTo === request.id ? (
                        <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                        </svg>
                      ) : (
                        <CheckIcon className="w-4 h-4" />
                      )}
                      {respondingTo === request.id ? 'Approving...' : 'Approve'}
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default VisibilityApprovalSection;
