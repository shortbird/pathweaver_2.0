import React, { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import api from '../../services/api';
import {
  UserGroupIcon,
  PaperAirplaneIcon,
  CheckCircleIcon,
  XMarkIcon,
  ExclamationTriangleIcon,
  ClockIcon
} from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';

const ParentLinking = () => {
  const { user } = useAuth();
  const [parentEmail, setParentEmail] = useState('');
  const [invitations, setInvitations] = useState([]);
  const [linkedParents, setLinkedParents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    loadParentLinks();
  }, []);

  const loadParentLinks = async () => {
    setLoading(true);
    try {
      const response = await api.get('/api/parents/my-links');
      setLinkedParents(response.data.linked_parents || []);
      setInvitations(response.data.pending_invitations || []);
    } catch (error) {
      console.error('Error loading parent links:', error);
      toast.error('Failed to load parent connections');
    } finally {
      setLoading(false);
    }
  };

  const sendInvitation = async (e) => {
    e.preventDefault();
    if (!parentEmail.trim()) {
      toast.error('Please enter a parent email address');
      return;
    }

    setSending(true);
    try {
      await api.post('/api/parents/invite', { parent_email: parentEmail });
      toast.success('Invitation sent! Your parent has 48 hours to accept.');
      setParentEmail('');
      loadParentLinks();
    } catch (error) {
      console.error('Error sending invitation:', error);
      const message = error.response?.data?.error || 'Failed to send invitation';
      toast.error(message);
    } finally {
      setSending(false);
    }
  };

  const cancelInvitation = async (invitationId) => {
    try {
      await api.delete(`/api/parents/invitations/${invitationId}`);
      toast.success('Invitation cancelled');
      loadParentLinks();
    } catch (error) {
      console.error('Error cancelling invitation:', error);
      toast.error('Failed to cancel invitation');
    }
  };

  const formatTimeRemaining = (expiresAt) => {
    const now = new Date();
    const expiry = new Date(expiresAt);
    const hoursRemaining = Math.max(0, Math.floor((expiry - now) / (1000 * 60 * 60)));
    return `${hoursRemaining}h remaining`;
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center py-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-optio-purple"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-gradient-to-r from-optio-purple to-pink-500 rounded-lg p-6 text-white">
        <div className="flex items-center gap-3 mb-2">
          <UserGroupIcon className="w-8 h-8" />
          <h2 className="text-2xl font-bold" style={{ fontFamily: 'Poppins, sans-serif' }}>
            Parent Access
          </h2>
        </div>
        <p className="font-medium" style={{ fontFamily: 'Poppins, sans-serif' }}>
          Invite a parent or guardian to support your learning journey. They'll have read-only access to view your progress and help you stay on track.
        </p>
      </div>

      {/* Important Info */}
      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
        <div className="flex items-start gap-3">
          <ExclamationTriangleIcon className="w-6 h-6 text-yellow-600 flex-shrink-0" />
          <div>
            <h3 className="font-semibold text-yellow-900 mb-1" style={{ fontFamily: 'Poppins, sans-serif' }}>
              Important to know
            </h3>
            <ul className="text-sm text-yellow-800 space-y-1 font-medium" style={{ fontFamily: 'Poppins, sans-serif' }}>
              <li>• Once approved, parent access is permanent and cannot be revoked</li>
              <li>• Parents can view your progress, quests, and AI tutor conversations</li>
              <li>• Parents can upload evidence on your behalf (requires your approval)</li>
              <li>• Invitations expire after 48 hours</li>
            </ul>
          </div>
        </div>
      </div>

      {/* Send Invitation Form */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <h3 className="text-xl font-bold text-gray-900 mb-4" style={{ fontFamily: 'Poppins, sans-serif' }}>
          Invite a Parent
        </h3>
        <form onSubmit={sendInvitation} className="flex gap-3">
          <input
            type="email"
            value={parentEmail}
            onChange={(e) => setParentEmail(e.target.value)}
            placeholder="parent@example.com"
            className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-optio-purple focus:border-transparent font-medium"
            style={{ fontFamily: 'Poppins, sans-serif' }}
            disabled={sending}
          />
          <button
            type="submit"
            disabled={sending}
            className="px-6 py-2 bg-gradient-to-r from-optio-purple to-pink-500 text-white rounded-lg font-semibold hover:shadow-lg transition-shadow disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            style={{ fontFamily: 'Poppins, sans-serif' }}
          >
            {sending ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                Sending...
              </>
            ) : (
              <>
                <PaperAirplaneIcon className="w-5 h-5" />
                Send Invitation
              </>
            )}
          </button>
        </form>
      </div>

      {/* Pending Invitations */}
      {invitations.length > 0 && (
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <h3 className="text-xl font-bold text-gray-900 mb-4" style={{ fontFamily: 'Poppins, sans-serif' }}>
            Pending Invitations
          </h3>
          <div className="space-y-3">
            {invitations.map((invitation) => (
              <div key={invitation.id} className="flex items-center justify-between p-4 bg-blue-50 border border-blue-200 rounded-lg">
                <div className="flex items-center gap-3">
                  <ClockIcon className="w-5 h-5 text-blue-600" />
                  <div>
                    <p className="font-semibold text-gray-900" style={{ fontFamily: 'Poppins, sans-serif' }}>
                      {invitation.parent_email}
                    </p>
                    <p className="text-sm text-gray-600 font-medium" style={{ fontFamily: 'Poppins, sans-serif' }}>
                      Sent {new Date(invitation.created_at).toLocaleDateString()} • {formatTimeRemaining(invitation.expires_at)}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => cancelInvitation(invitation.id)}
                  className="p-2 text-red-600 hover:bg-red-100 rounded-lg transition-colors"
                  title="Cancel invitation"
                >
                  <XMarkIcon className="w-5 h-5" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Linked Parents */}
      {linkedParents.length > 0 && (
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <h3 className="text-xl font-bold text-gray-900 mb-4" style={{ fontFamily: 'Poppins, sans-serif' }}>
            Connected Parents
          </h3>
          <div className="space-y-3">
            {linkedParents.map((parent) => (
              <div key={parent.id} className="flex items-center justify-between p-4 bg-green-50 border border-green-200 rounded-lg">
                <div className="flex items-center gap-3">
                  <CheckCircleIcon className="w-5 h-5 text-green-600" />
                  <div>
                    <p className="font-semibold text-gray-900" style={{ fontFamily: 'Poppins, sans-serif' }}>
                      {parent.parent_name || parent.parent_email}
                    </p>
                    <p className="text-sm text-gray-600 font-medium" style={{ fontFamily: 'Poppins, sans-serif' }}>
                      Connected since {new Date(parent.approved_at).toLocaleDateString()}
                    </p>
                  </div>
                </div>
                <div className="px-3 py-1 bg-green-100 text-green-800 rounded-full text-xs font-semibold" style={{ fontFamily: 'Poppins, sans-serif' }}>
                  Active
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Empty State */}
      {linkedParents.length === 0 && invitations.length === 0 && (
        <div className="text-center py-8 bg-gray-50 rounded-lg border-2 border-dashed border-gray-300">
          <UserGroupIcon className="w-12 h-12 text-gray-400 mx-auto mb-3" />
          <p className="text-gray-600 font-medium" style={{ fontFamily: 'Poppins, sans-serif' }}>
            No parents connected yet. Send an invitation to get started!
          </p>
        </div>
      )}
    </div>
  );
};

export default ParentLinking;
