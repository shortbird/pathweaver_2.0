import React, { useState, useEffect } from 'react';
import api from '../../services/api';
import InviteUserModal from './InviteUserModal';

export default function PendingInvitationsList({ organizationId, onUpdate }) {
  const [invitations, setInvitations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [actionLoading, setActionLoading] = useState(null);
  const [statusFilter, setStatusFilter] = useState('pending');

  useEffect(() => {
    fetchInvitations();
  }, [organizationId, statusFilter]);

  const fetchInvitations = async () => {
    try {
      setLoading(true);
      const params = statusFilter !== 'all' ? `?status=${statusFilter}` : '';
      const response = await api.get(`/api/admin/organizations/${organizationId}/invitations${params}`);
      setInvitations(response.data.invitations || []);
      setError(null);
    } catch (err) {
      console.error('Failed to fetch invitations:', err);
      setError('Failed to load invitations');
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async (invitationId) => {
    setActionLoading(invitationId);
    try {
      await api.post(`/api/admin/organizations/${organizationId}/invitations/${invitationId}/resend`, {});
      fetchInvitations();
    } catch (err) {
      console.error('Failed to resend invitation:', err);
      alert(err.response?.data?.error || 'Failed to resend invitation');
    } finally {
      setActionLoading(null);
    }
  };

  const handleCancel = async (invitationId) => {
    if (!confirm('Cancel this invitation?')) return;

    setActionLoading(invitationId);
    try {
      await api.delete(`/api/admin/organizations/${organizationId}/invitations/${invitationId}`);
      fetchInvitations();
    } catch (err) {
      console.error('Failed to cancel invitation:', err);
      alert(err.response?.data?.error || 'Failed to cancel invitation');
    } finally {
      setActionLoading(null);
    }
  };

  const getStatusBadge = (status) => {
    const styles = {
      pending: 'bg-yellow-100 text-yellow-700',
      accepted: 'bg-green-100 text-green-700',
      expired: 'bg-gray-100 text-gray-600',
      cancelled: 'bg-red-100 text-red-700'
    };
    return (
      <span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-medium ${styles[status] || styles.pending}`}>
        {status.charAt(0).toUpperCase() + status.slice(1)}
      </span>
    );
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return '-';
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  };

  const isExpired = (expiresAt) => {
    return new Date(expiresAt) < new Date();
  };

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-optio-purple"></div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header with Invite Button */}
      <div className="flex flex-wrap justify-between items-center gap-4">
        <div>
          <h2 className="text-xl font-bold text-gray-900">User Invitations</h2>
          <p className="text-sm text-gray-600 mt-1">
            Invite users to join your organization via email
          </p>
        </div>
        <div className="flex items-center gap-3">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-optio-purple/20 focus:border-optio-purple outline-none"
          >
            <option value="pending">Pending</option>
            <option value="accepted">Accepted</option>
            <option value="expired">Expired</option>
            <option value="cancelled">Cancelled</option>
            <option value="all">All</option>
          </select>
          <button
            onClick={() => setShowInviteModal(true)}
            className="inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-optio-purple to-optio-pink text-white font-medium rounded-lg hover:opacity-90 transition-opacity"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Invite User
          </button>
        </div>
      </div>

      {error && (
        <div className="p-4 bg-red-50 text-red-700 rounded-lg">
          {error}
        </div>
      )}

      {/* Invitations Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50 border-b border-gray-100">
            <tr>
              <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Email</th>
              <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Name</th>
              <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Role</th>
              <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Status</th>
              <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Expires</th>
              <th className="px-6 py-4 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {invitations.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-6 py-12 text-center text-gray-500">
                  {statusFilter === 'pending'
                    ? 'No pending invitations. Click "Invite User" to send one.'
                    : `No ${statusFilter} invitations.`}
                </td>
              </tr>
            ) : (
              invitations.map(invitation => (
                <tr key={invitation.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4">
                    <span className="text-gray-900">{invitation.email}</span>
                  </td>
                  <td className="px-6 py-4">
                    {invitation.invited_name ? (
                      <span className="text-gray-900">{invitation.invited_name}</span>
                    ) : (
                      <span className="text-gray-400 italic">Not provided</span>
                    )}
                  </td>
                  <td className="px-6 py-4">
                    <span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-medium ${
                      invitation.role === 'org_admin' ? 'bg-purple-100 text-purple-700' :
                      invitation.role === 'advisor' ? 'bg-blue-100 text-blue-700' :
                      invitation.role === 'parent' ? 'bg-green-100 text-green-700' :
                      'bg-gray-100 text-gray-700'
                    }`}>
                      {invitation.role === 'org_admin' ? 'Org Admin' :
                       invitation.role.charAt(0).toUpperCase() + invitation.role.slice(1)}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    {getStatusBadge(invitation.status)}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-600">
                    {invitation.status === 'pending' && isExpired(invitation.expires_at) ? (
                      <span className="text-red-600">Expired</span>
                    ) : (
                      formatDate(invitation.expires_at)
                    )}
                  </td>
                  <td className="px-6 py-4 text-right">
                    {invitation.status === 'pending' && (
                      <div className="flex justify-end gap-2">
                        <button
                          onClick={() => handleResend(invitation.id)}
                          disabled={actionLoading === invitation.id}
                          className="text-optio-purple hover:underline text-sm font-medium disabled:opacity-50"
                        >
                          {actionLoading === invitation.id ? '...' : 'Resend'}
                        </button>
                        <span className="text-gray-300">|</span>
                        <button
                          onClick={() => handleCancel(invitation.id)}
                          disabled={actionLoading === invitation.id}
                          className="text-red-600 hover:underline text-sm font-medium disabled:opacity-50"
                        >
                          Cancel
                        </button>
                      </div>
                    )}
                    {invitation.status === 'accepted' && (
                      <span className="text-sm text-gray-500">
                        {formatDate(invitation.accepted_at)}
                      </span>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Invite Modal */}
      {showInviteModal && (
        <InviteUserModal
          organizationId={organizationId}
          onClose={() => setShowInviteModal(false)}
          onSuccess={() => {
            fetchInvitations();
            onUpdate?.();
          }}
        />
      )}
    </div>
  );
}
