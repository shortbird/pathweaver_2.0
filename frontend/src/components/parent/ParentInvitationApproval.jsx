import React, { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import api from '../../services/api';
import {
  EnvelopeIcon,
  CheckCircleIcon,
  XCircleIcon,
  ClockIcon,
  ExclamationTriangleIcon
} from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';

const ParentInvitationApproval = () => {
  const { user } = useAuth();
  const [invitations, setInvitations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(null);

  useEffect(() => {
    loadInvitations();
  }, []);

  const loadInvitations = async () => {
    setLoading(true);
    try {
      const response = await api.get('/api/parents/pending-invitations');
      setInvitations(response.data.invitations || []);
    } catch (error) {
      console.error('Error loading invitations:', error);
      toast.error('Failed to load invitations');
    } finally {
      setLoading(false);
    }
  };

  const approveInvitation = async (invitationId, studentName) => {
    setProcessing(invitationId);
    try {
      await api.post(`/api/parents/invitations/${invitationId}/approve`, {});
      toast.success(`You're now connected to ${studentName}'s learning journey!`);
      loadInvitations();
    } catch (error) {
      console.error('Error approving invitation:', error);
      const message = error.response?.data?.error || 'Failed to approve invitation';
      toast.error(message);
    } finally {
      setProcessing(null);
    }
  };

  const declineInvitation = async (invitationId, studentName) => {
    if (!window.confirm(`Are you sure you want to decline the invitation from ${studentName}?`)) {
      return;
    }

    setProcessing(invitationId);
    try {
      await api.delete(`/api/parents/invitations/${invitationId}/decline`);
      toast.success('Invitation declined');
      loadInvitations();
    } catch (error) {
      console.error('Error declining invitation:', error);
      toast.error('Failed to decline invitation');
    } finally {
      setProcessing(null);
    }
  };

  const formatTimeRemaining = (expiresAt) => {
    const now = new Date();
    const expiry = new Date(expiresAt);
    const hoursRemaining = Math.max(0, Math.floor((expiry - now) / (1000 * 60 * 60)));

    if (hoursRemaining < 1) {
      const minutesRemaining = Math.max(0, Math.floor((expiry - now) / (1000 * 60)));
      return `${minutesRemaining} minutes remaining`;
    }

    return `${hoursRemaining} hours remaining`;
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center py-12">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600"></div>
      </div>
    );
  }

  if (invitations.length === 0) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-12">
        <div className="text-center bg-white rounded-lg border border-gray-200 p-12">
          <EnvelopeIcon className="w-16 h-16 text-gray-400 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-gray-900 mb-2" style={{ fontFamily: 'Poppins, sans-serif' }}>
            No Pending Invitations
          </h2>
          <p className="text-gray-600 font-medium" style={{ fontFamily: 'Poppins, sans-serif' }}>
            You don't have any student invitations waiting for approval.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2" style={{ fontFamily: 'Poppins, sans-serif' }}>
          Student Invitations
        </h1>
        <p className="text-gray-600 font-medium" style={{ fontFamily: 'Poppins, sans-serif' }}>
          You have {invitations.length} pending invitation{invitations.length !== 1 ? 's' : ''} to connect with student{invitations.length !== 1 ? 's' : ''}.
        </p>
      </div>

      {/* Important Notice */}
      <div className="bg-purple-50 border border-purple-200 rounded-lg p-6 mb-8">
        <div className="flex items-start gap-3">
          <ExclamationTriangleIcon className="w-6 h-6 text-purple-600 flex-shrink-0" />
          <div>
            <h3 className="font-semibold text-purple-900 mb-2" style={{ fontFamily: 'Poppins, sans-serif' }}>
              What you'll have access to:
            </h3>
            <ul className="text-sm text-purple-800 space-y-1 font-medium" style={{ fontFamily: 'Poppins, sans-serif' }}>
              <li>✓ View their active quests and progress</li>
              <li>✓ See their learning patterns and insights</li>
              <li>✓ Monitor AI tutor conversations for safety</li>
              <li>✓ Upload evidence on their behalf (with their approval)</li>
              <li>✓ Receive learning rhythm updates</li>
            </ul>
            <p className="text-sm text-purple-800 mt-3 font-semibold" style={{ fontFamily: 'Poppins, sans-serif' }}>
              ⚠️ Once approved, this connection is permanent and cannot be revoked.
            </p>
          </div>
        </div>
      </div>

      {/* Invitations List */}
      <div className="space-y-4">
        {invitations.map((invitation) => (
          <div key={invitation.id} className="bg-white rounded-lg border border-gray-200 p-6 shadow-sm hover:shadow-md transition-shadow">
            <div className="flex items-start justify-between gap-6">
              <div className="flex-1">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-12 h-12 bg-gradient-to-r from-purple-600 to-pink-500 rounded-full flex items-center justify-center text-white text-xl font-bold" style={{ fontFamily: 'Poppins, sans-serif' }}>
                    {invitation.student_first_name?.[0]}{invitation.student_last_name?.[0]}
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-gray-900" style={{ fontFamily: 'Poppins, sans-serif' }}>
                      {invitation.student_first_name} {invitation.student_last_name}
                    </h3>
                    <p className="text-sm text-gray-600 font-medium" style={{ fontFamily: 'Poppins, sans-serif' }}>
                      {invitation.student_email}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 text-sm text-gray-600 font-medium mb-4" style={{ fontFamily: 'Poppins, sans-serif' }}>
                  <ClockIcon className="w-4 h-4" />
                  Invited {new Date(invitation.created_at).toLocaleDateString()} • {formatTimeRemaining(invitation.expires_at)}
                </div>

                <p className="text-gray-700 font-medium" style={{ fontFamily: 'Poppins, sans-serif' }}>
                  {invitation.student_first_name} has invited you to support their learning journey on Optio.
                  You'll have read-only access to their progress, quests, and insights to help guide and encourage them.
                </p>
              </div>

              <div className="flex flex-col gap-2">
                <button
                  onClick={() => approveInvitation(invitation.id, invitation.student_first_name)}
                  disabled={processing === invitation.id}
                  className="px-6 py-3 bg-gradient-to-r from-green-600 to-green-500 text-white rounded-lg font-semibold hover:shadow-lg transition-shadow disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 whitespace-nowrap"
                  style={{ fontFamily: 'Poppins, sans-serif' }}
                >
                  {processing === invitation.id ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                      Processing...
                    </>
                  ) : (
                    <>
                      <CheckCircleIcon className="w-5 h-5" />
                      Accept
                    </>
                  )}
                </button>
                <button
                  onClick={() => declineInvitation(invitation.id, invitation.student_first_name)}
                  disabled={processing === invitation.id}
                  className="px-6 py-3 bg-gray-200 text-gray-800 rounded-lg font-semibold hover:bg-gray-300 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 whitespace-nowrap"
                  style={{ fontFamily: 'Poppins, sans-serif' }}
                >
                  <XCircleIcon className="w-5 h-5" />
                  Decline
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default ParentInvitationApproval;
