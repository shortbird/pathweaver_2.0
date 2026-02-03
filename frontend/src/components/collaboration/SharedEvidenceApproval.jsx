import React, { useState, useEffect } from 'react';
import api from '../../services/api';

export default function SharedEvidenceApproval({ onApprovalChange }) {
  const [pendingApprovals, setPendingApprovals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [processingId, setProcessingId] = useState(null);

  useEffect(() => {
    fetchPendingApprovals();
  }, []);

  const fetchPendingApprovals = async () => {
    try {
      const response = await api.get('/api/collaborations/pending-approvals');
      if (response.data.success) {
        setPendingApprovals(response.data.approvals || []);
      } else {
        setError(response.data.error || 'Failed to load pending approvals');
      }
    } catch (err) {
      console.error('Failed to fetch pending approvals:', err);
      setError(err.response?.data?.error || 'Failed to load pending approvals');
    } finally {
      setLoading(false);
    }
  };

  const handleApproval = async (approvalId, action) => {
    setProcessingId(approvalId);
    setError('');

    try {
      const response = await api.post(`/api/collaborations/approvals/${approvalId}/${action}`, {});

      if (response.data.success) {
        // Remove approved/rejected item from list
        setPendingApprovals(prev => prev.filter(a => a.id !== approvalId));

        // Notify parent component
        onApprovalChange?.();
      } else {
        setError(response.data.error || `Failed to ${action} evidence`);
      }
    } catch (err) {
      console.error(`Failed to ${action} evidence:`, err);
      setError(err.response?.data?.error || `Failed to ${action} evidence`);
    } finally {
      setProcessingId(null);
    }
  };

  if (loading) {
    return (
      <div className="bg-white rounded-xl shadow-md p-6">
        <div className="flex items-center justify-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-optio-purple"></div>
        </div>
      </div>
    );
  }

  if (pendingApprovals.length === 0) {
    return null; // Don't show anything if no pending approvals
  }

  return (
    <div className="bg-white rounded-xl shadow-md p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-bold text-gray-900">
          Shared Evidence Approvals
        </h2>
        <span className="bg-optio-purple text-white px-3 py-1 rounded-full text-sm font-medium">
          {pendingApprovals.length} pending
        </span>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4 text-sm text-red-700 flex items-start gap-2">
          <svg className="w-5 h-5 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span>{error}</span>
        </div>
      )}

      <div className="space-y-4">
        {pendingApprovals.map(approval => (
          <div
            key={approval.id}
            className="border border-gray-200 rounded-lg p-4 hover:border-optio-purple/50 transition-colors"
          >
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1">
                {/* Submitter Info */}
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-8 h-8 rounded-full bg-gradient-to-r from-optio-purple to-optio-pink flex items-center justify-center text-white font-semibold text-sm">
                    {approval.submitted_by_name?.charAt(0) || '?'}
                  </div>
                  <div>
                    <div className="font-medium text-gray-900">
                      {approval.submitted_by_name || 'Collaborator'}
                    </div>
                    <div className="text-xs text-gray-500">
                      Shared {new Date(approval.shared_at).toLocaleDateString()}
                    </div>
                  </div>
                </div>

                {/* Task Info */}
                <div className="mb-3">
                  <div className="text-sm font-semibold text-gray-900 mb-1">
                    {approval.task_title || 'Task Completion'}
                  </div>
                  <div className="text-xs text-gray-600">
                    Quest: {approval.quest_title || approval.quest_id}
                  </div>
                </div>

                {/* Evidence Preview */}
                <div className="bg-gray-50 rounded-lg p-3 mb-3">
                  <div className="flex items-start gap-2">
                    {approval.evidence_type === 'image' && (
                      <svg className="w-5 h-5 text-gray-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                    )}
                    {approval.evidence_type === 'text' && (
                      <svg className="w-5 h-5 text-gray-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                    )}
                    {approval.evidence_type === 'link' && (
                      <svg className="w-5 h-5 text-gray-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                      </svg>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-medium text-gray-700 uppercase mb-1">
                        {approval.evidence_type}
                      </div>
                      {approval.evidence_type === 'text' && (
                        <p className="text-sm text-gray-800 line-clamp-2">
                          {approval.evidence_content}
                        </p>
                      )}
                      {(approval.evidence_type === 'link' || approval.evidence_type === 'image') && (
                        <a
                          href={approval.evidence_content}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-sm text-optio-purple hover:underline truncate block"
                        >
                          {approval.evidence_content}
                        </a>
                      )}
                    </div>
                  </div>
                </div>

                {/* Info Notice */}
                <div className="text-xs text-gray-600 flex items-start gap-1">
                  <svg className="w-4 h-4 text-gray-400 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span>Approving this evidence will add it to your portfolio for this quest</span>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex flex-col gap-2">
                <button
                  onClick={() => handleApproval(approval.id, 'approve')}
                  disabled={processingId === approval.id}
                  className="px-4 py-2 bg-gradient-to-r from-optio-purple to-optio-pink text-white rounded-lg hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed font-medium text-sm whitespace-nowrap"
                >
                  {processingId === approval.id ? 'Processing...' : 'Approve'}
                </button>
                <button
                  onClick={() => handleApproval(approval.id, 'reject')}
                  disabled={processingId === approval.id}
                  className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed text-sm whitespace-nowrap"
                >
                  Reject
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
