import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { handleApiResponse } from '../../utils/errorHandling';
import { friendsAPI, collaborationAPI } from '../../services/api';
import CollaborationBadge from '../ui/CollaborationBadge';
import toast from 'react-hot-toast';

const TeamUpModal = ({ quest, onClose, onInviteSent }) => {
  const navigate = useNavigate();
  const [friends, setFriends] = useState([]);
  const [invitedFriends, setInvitedFriends] = useState(new Set());
  const [collaborationStatus, setCollaborationStatus] = useState(new Map()); // Track collaboration status per friend
  const [sendingInvite, setSendingInvite] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchTerm, setSearchTerm] = useState('');

  // Defensive programming - handle undefined quest
  if (!quest || !quest.id) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
        <div className="bg-white rounded-xl shadow-2xl max-w-md w-full p-6">
          <div className="text-center">
            <h2 className="text-xl font-bold mb-4 text-red-600">Error</h2>
            <p className="text-gray-600 mb-4">Quest information is not available. Please try again.</p>
            <button
              onClick={onClose}
              className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    );
  }

  useEffect(() => {
    fetchFriendsAndCollaborations();
  }, []);

  const fetchFriendsAndCollaborations = async () => {
    try {
      // Fetch friends and collaboration data in parallel
      const [friendsResponse, collaborationsResponse] = await Promise.all([
        friendsAPI.getFriends(),
        collaborationAPI.getInvites()
      ]);

      const friendsList = friendsResponse.data.friends || [];
      setFriends(friendsList);

      // Build collaboration status map
      const statusMap = new Map();
      const invitedSet = new Set();

      // Process sent invitations for this quest
      if (collaborationsResponse.data.sent_invitations) {
        collaborationsResponse.data.sent_invitations
          .filter(invite => invite.quest?.id === quest.id)
          .forEach(invite => {
            statusMap.set(invite.partner.id, {
              status: invite.status,
              inviteId: invite.id,
              type: 'sent'
            });
            if (invite.status === 'pending') {
              invitedSet.add(invite.partner.id);
            }
          });
      }

      // Process active collaborations
      const activeResponse = await collaborationAPI.getActive();
      if (activeResponse.data.collaborations) {
        activeResponse.data.collaborations
          .filter(collab => collab.quest?.id === quest.id)
          .forEach(collab => {
            statusMap.set(collab.partner.id, {
              status: 'accepted',
              collaborationId: collab.id,
              type: 'active'
            });
          });
      }

      setCollaborationStatus(statusMap);
      setInvitedFriends(invitedSet);

    } catch (error) {
      console.error('Failed to load friends and collaborations:', error);
      setError('Failed to load friends list');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSendInvite = async (friend) => {
    setSendingInvite(friend.id);
    setError('');

    try {
      const response = await collaborationAPI.sendInvite(quest.id, friend.id);

      // Mark friend as invited and update collaboration status
      setInvitedFriends(prev => new Set([...prev, friend.id]));
      setCollaborationStatus(prev => new Map(prev).set(friend.id, {
        status: 'pending',
        type: 'sent'
      }));

      // Show success message
      const friendName = `${friend.first_name} ${friend.last_name}`;
      toast.success(`Team-up invitation sent to ${friendName}!`);

      if (onInviteSent) {
        onInviteSent({
          friend: friend,
          quest: quest,
          message: response.data.message || `Invitation sent to ${friendName}!`
        });
      }

    } catch (error) {
      const errorMessage = error.response?.data?.error || error.message || 'Failed to send invitation';
      setError(errorMessage);
      toast.error(errorMessage);
    } finally {
      setSendingInvite(null);
    }
  };

  const getButtonState = (friend) => {
    const status = collaborationStatus.get(friend.id);

    if (!status) {
      return {
        disabled: false,
        text: 'Invite to Team Up',
        style: 'bg-gradient-to-r from-[#ef597b] to-[#6d469b] text-white',
        action: () => handleSendInvite(friend)
      };
    }

    switch (status.status) {
      case 'pending':
        return {
          disabled: true,
          text: 'Invitation Sent',
          style: 'bg-yellow-100 text-yellow-800',
          action: null
        };
      case 'accepted':
        return {
          disabled: true,
          text: 'Already Teamed Up',
          style: 'bg-green-100 text-green-800',
          action: null
        };
      case 'declined':
        return {
          disabled: false,
          text: 'Re-invite',
          style: 'bg-blue-100 text-blue-800 hover:bg-blue-200',
          action: () => handleSendInvite(friend)
        };
      default:
        return {
          disabled: false,
          text: 'Invite to Team Up',
          style: 'bg-gradient-to-r from-[#ef597b] to-[#6d469b] text-white',
          action: () => handleSendInvite(friend)
        };
    }
  };

  const filteredFriends = friends.filter(friend => {
    const searchLower = searchTerm.toLowerCase();
    const username = friend.username?.toLowerCase() || '';
    const firstName = friend.first_name?.toLowerCase() || '';
    const lastName = friend.last_name?.toLowerCase() || '';
    const fullName = `${firstName} ${lastName}`.toLowerCase();
    
    return username.includes(searchLower) || 
           firstName.includes(searchLower) || 
           lastName.includes(searchLower) ||
           fullName.includes(searchLower);
  });

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-xl shadow-2xl max-w-md w-full">
        {/* Header */}
        <div className="bg-gradient-to-r from-purple-600 to-pink-600 text-white p-6 rounded-t-xl">
          <div className="flex justify-between items-start">
            <div>
              <h2 className="text-2xl font-bold mb-2">Team Up!</h2>
              <p className="text-purple-100 text-sm">
                Complete this quest with a friend for double XP
              </p>
            </div>
            <button
              onClick={onClose}
              className="text-white hover:text-gray-200 transition-colors"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-6">
          {isLoading ? (
            <div className="flex justify-center py-8">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600"></div>
            </div>
          ) : friends.length === 0 ? (
            <div className="text-center py-8">
              <svg className="mx-auto h-12 w-12 text-gray-400 mb-3" fill="currentColor" viewBox="0 0 20 20">
                <path d="M13 6a3 3 0 11-6 0 3 3 0 016 0zM18 8a2 2 0 11-4 0 2 2 0 014 0zM14 15a4 4 0 00-8 0v3h8v-3zM6 8a2 2 0 11-4 0 2 2 0 014 0zM16 18v-3a5.972 5.972 0 00-.75-2.906A3.005 3.005 0 0119 15v3h-3zM4.75 12.094A5.973 5.973 0 004 15v3H1v-3a3 3 0 013.75-2.906z" />
              </svg>
              <p className="text-gray-600 mb-4">You haven't added any friends yet!</p>
              <p className="text-sm text-gray-500 mb-4">Add friends first, then come back to this quest to team up with them.</p>
              <button
                onClick={() => {
                  // Save quest ID to return to after adding friends
                  sessionStorage.setItem('returnToQuest', quest.id);
                  navigate('/friends');
                }}
                className="bg-purple-600 text-white px-4 py-2 rounded-lg hover:bg-purple-700 transition-colors"
              >
                Add Friends
              </button>
            </div>
          ) : (
            <>
              {/* Search */}
              <div className="mb-4">
                <input
                  type="text"
                  placeholder="Search friends..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                />
              </div>

              {/* Friends List */}
              <div className="max-h-64 overflow-y-auto mb-4">
                {filteredFriends.length === 0 ? (
                  <p className="text-center text-gray-500 py-4">No friends found</p>
                ) : (
                  <div className="space-y-2">
                    {filteredFriends.map(friend => {
                      const buttonState = getButtonState(friend);
                      const collaborationInfo = collaborationStatus.get(friend.id);

                      return (
                        <div
                          key={friend.id}
                          className="flex items-center p-3 rounded-lg border border-gray-200 hover:border-purple-300 transition-all"
                        >
                          <div className="flex items-center flex-1">
                            <div className="w-10 h-10 bg-gradient-to-br from-purple-400 to-pink-400 rounded-full flex items-center justify-center text-white font-bold">
                              {friend.first_name?.[0]?.toUpperCase() || '?'}
                            </div>
                            <div className="ml-3">
                              <p className="font-medium text-gray-900">
                                {`${friend.first_name} ${friend.last_name}`}
                              </p>
                              {collaborationInfo && (
                                <CollaborationBadge
                                  status={collaborationInfo.status}
                                  showXpBonus={collaborationInfo.status === 'accepted'}
                                  className="mt-1"
                                />
                              )}
                            </div>
                          </div>
                          <button
                            onClick={buttonState.action}
                            disabled={buttonState.disabled || sendingInvite === friend.id}
                            className={`px-4 py-1.5 text-sm rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${buttonState.style}`}
                          >
                            {sendingInvite === friend.id ? 'Inviting...' : buttonState.text}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* XP Bonus Info */}
              <div className="bg-purple-50 border border-purple-200 rounded-lg p-3 mb-4">
                <div className="flex items-start">
                  <svg className="w-5 h-5 text-purple-600 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                  </svg>
                  <div className="ml-2">
                    <p className="text-sm font-medium text-purple-900">2x XP Bonus!</p>
                    <p className="text-xs text-purple-700 mt-1">
                      Both you and any friends you work with will earn double XP for all tasks completed in this quest
                    </p>
                  </div>
                </div>
              </div>

              {/* Error Display */}
              {error && (
                <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
                  {error}
                </div>
              )}

              {/* Close Button */}
              <div className="flex justify-end">
                <button
                  onClick={onClose}
                  className="px-6 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors"
                >
                  Close
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default TeamUpModal;