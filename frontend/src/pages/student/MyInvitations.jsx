import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import api from '../../services/api';
import InvitationCard from '../../components/InvitationCard';
import toast from 'react-hot-toast';

const MyInvitations = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [invitations, setInvitations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(null);

  useEffect(() => {
    fetchInvitations();
  }, []);

  const fetchInvitations = async () => {
    try {
      setLoading(true);
      const response = await api.get('/api/students/quest-invitations');
      setInvitations(response.data.invitations || []);
    } catch (error) {
      console.error('Error fetching invitations:', error);
      toast.error('Failed to load invitations');
    } finally {
      setLoading(false);
    }
  };

  const handleAccept = async (invitationId) => {
    try {
      setActionLoading(invitationId);
      await api.post(`/api/students/quest-invitations/${invitationId}/accept`, {});
      toast.success('Quest accepted! Visit your quest library to get started.');
      // Remove from list
      setInvitations(prev => prev.filter(inv => inv.id !== invitationId));
    } catch (error) {
      console.error('Error accepting invitation:', error);
      toast.error(error.response?.data?.error || 'Failed to accept invitation');
    } finally {
      setActionLoading(null);
    }
  };

  const handleDecline = async (invitationId) => {
    try {
      setActionLoading(invitationId);
      await api.post(`/api/students/quest-invitations/${invitationId}/decline`, {});
      toast.success('Invitation declined');
      // Remove from list
      setInvitations(prev => prev.filter(inv => inv.id !== invitationId));
    } catch (error) {
      console.error('Error declining invitation:', error);
      toast.error(error.response?.data?.error || 'Failed to decline invitation');
    } finally {
      setActionLoading(null);
    }
  };

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-optio-purple"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">
          Quest Invitations
        </h1>
        <p className="text-gray-600">
          Advisors have invited you to embark on these learning quests
        </p>
      </div>

      {/* Invitations List */}
      {invitations.length === 0 ? (
        <div className="bg-white rounded-xl shadow-lg p-12 text-center border border-gray-200">
          <div className="max-w-md mx-auto">
            <svg
              className="mx-auto h-16 w-16 text-gray-400 mb-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M3 19v-8.93a2 2 0 01.89-1.664l7-4.666a2 2 0 012.22 0l7 4.666A2 2 0 0121 10.07V19M3 19a2 2 0 002 2h14a2 2 0 002-2M3 19l6.75-4.5M21 19l-6.75-4.5M3 10l6.75 4.5M21 10l-6.75 4.5m0 0l-1.14.76a2 2 0 01-2.22 0l-1.14-.76"
              />
            </svg>
            <h3 className="text-xl font-semibold text-gray-900 mb-2">
              No pending invitations
            </h3>
            <p className="text-gray-600 mb-6">
              When advisors invite you to quests, they'll appear here
            </p>
            <button
              onClick={() => navigate('/quests')}
              className="bg-gradient-to-r from-optio-purple to-optio-pink text-white px-6 py-3 rounded-lg font-semibold hover:shadow-lg transition-all"
            >
              Browse Quest Library
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {invitations.map((invitation) => (
            <InvitationCard
              key={invitation.id}
              invitation={invitation}
              onAccept={handleAccept}
              onDecline={handleDecline}
              isLoading={actionLoading === invitation.id}
            />
          ))}
        </div>
      )}
    </div>
  );
};

export default MyInvitations;
