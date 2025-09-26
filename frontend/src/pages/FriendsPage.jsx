import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { friendsAPI, collaborationAPI } from '../services/api'
import api from '../services/api'
import toast from 'react-hot-toast'
import { useAuth } from '../contexts/AuthContext'
import { hasFeatureAccess } from '../utils/tierMapping'
import StatusBadge from '../components/ui/StatusBadge'
import CollaborationBadge from '../components/ui/CollaborationBadge'
import { UserPlusIcon, ClockIcon, CheckCircleIcon, UsersIcon, PaperAirplaneIcon } from '@heroicons/react/24/outline'

const FriendsPage = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [friends, setFriends] = useState([])
  const [pendingRequests, setPendingRequests] = useState([])
  const [sentRequests, setSentRequests] = useState([])
  const [teamInvitations, setTeamInvitations] = useState([])
  const [sentTeamInvitations, setSentTeamInvitations] = useState([])
  const [activeCollaborations, setActiveCollaborations] = useState([])
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [returnToQuest, setReturnToQuest] = useState(null)
  const [activeTab, setActiveTab] = useState('incoming')

  // Check if user has access to friends feature
  const hasAccess = hasFeatureAccess(user?.subscription_tier, 'supported');

  useEffect(() => {
    // Check if we should return to a quest after adding friends
    const questId = sessionStorage.getItem('returnToQuest')
    if (questId) {
      setReturnToQuest(questId)
    }
  }, [])

  useEffect(() => {
    if (hasAccess && user?.id) {
      fetchFriends()
      fetchTeamInvitations()
      fetchActiveCollaborations()
    } else {
      setLoading(false)
    }
  }, [hasAccess, user?.id])

  const fetchFriends = async () => {
    try {
      const response = await friendsAPI.getFriends()
      setFriends(response.data.friends || [])
      setPendingRequests(response.data.pending_requests || [])
      setSentRequests(response.data.sent_requests || [])
    } catch (error) {
      console.error('Failed to load friends:', error)
      if (error.response?.status === 404) {
        console.log('Friends endpoint not found')
      } else if (error.response?.status === 403) {
        console.log('Friends access denied - subscription tier issue')
      } else {
        toast.error('Failed to load friends')
      }
    } finally {
      setLoading(false)
    }
  }

  const sendFriendRequest = async (e) => {
    e.preventDefault()
    if (!email.trim()) {
      toast.error('Please enter an email address')
      return
    }

    setSending(true)
    try {
      await friendsAPI.sendFriendRequest(email.trim())
      if (returnToQuest) {
        toast.success('Friend request sent! Once accepted, you can team up on the quest.')
      } else {
        toast.success('Friend request sent!')
      }
      setEmail('')
      setActiveTab('sent') // Switch to sent tab to show the new request
      fetchFriends()
    } catch (error) {
      toast.error(error.response?.data?.error || 'Failed to send friend request')
    } finally {
      setSending(false)
    }
  }

  const acceptRequest = async (friendshipId) => {
    try {
      await friendsAPI.acceptFriendRequest(friendshipId)
      toast.success('Friend request accepted!')

      // Refresh friends list (don't fail silently if this fails)
      try {
        await fetchFriends()
      } catch (refreshError) {
        // Don't show error toast since the main operation succeeded
      }
    } catch (error) {
      toast.error(error.response?.data?.error || 'Failed to accept friend request')
    }
  }

  const declineRequest = async (friendshipId) => {
    try {
      await friendsAPI.declineFriendRequest(friendshipId)
      toast.success('Friend request declined')
      fetchFriends()
    } catch (error) {
      toast.error('Failed to decline friend request')
    }
  }

  const cancelRequest = async (friendshipId) => {
    try {
      await friendsAPI.cancelFriendRequest(friendshipId)
      toast.success('Friend request cancelled')
      fetchFriends()
    } catch (error) {
      toast.error(error.response?.data?.error || 'Failed to cancel friend request')
    }
  }

  // Helper function to format time ago
  const formatTimeAgo = (timestamp) => {
    if (!timestamp) return ''
    const now = new Date()
    const time = new Date(timestamp)
    const diffInHours = Math.floor((now - time) / (1000 * 60 * 60))

    if (diffInHours < 1) return 'Just now'
    if (diffInHours < 24) return `${diffInHours} hour${diffInHours > 1 ? 's' : ''} ago`
    const diffInDays = Math.floor(diffInHours / 24)
    return `${diffInDays} day${diffInDays > 1 ? 's' : ''} ago`
  }

  // Tab component for friend requests
  const TabButton = ({ id, label, count, isActive, onClick, icon: Icon }) => (
    <button
      onClick={() => onClick(id)}
      className={`flex items-center gap-2 px-4 py-3 font-medium border-b-2 transition-colors ${
        isActive
          ? 'border-purple-500 text-purple-600 bg-purple-50'
          : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
      }`}
    >
      <Icon className="w-4 h-4" />
      {label}
      {count > 0 && (
        <span className="ml-1 bg-purple-100 text-purple-600 px-2 py-0.5 rounded-full text-xs font-semibold">
          {count}
        </span>
      )}
    </button>
  )

  const fetchTeamInvitations = async () => {
    try {
      const response = await collaborationAPI.getInvites()

      // Separate received and sent invitations
      setTeamInvitations(response.data.received_invitations || [])
      setSentTeamInvitations(response.data.sent_invitations || [])
    } catch (error) {
      console.error('Failed to fetch team invitations:', error)
    }
  }

  const fetchActiveCollaborations = async () => {
    try {
      const response = await api.get('/api/v3/collaborations/active')
      setActiveCollaborations(response.data.collaborations || [])
    } catch (error) {
    }
  }

  const acceptTeamInvite = async (inviteId, questId) => {
    try {
      await collaborationAPI.acceptInvite(inviteId)
      toast.success('Team invitation accepted! You\'ll earn 2x XP together!')
      fetchTeamInvitations()
      fetchActiveCollaborations()
      // Navigate to the quest page after accepting
      setTimeout(() => {
        navigate(`/quests/${questId}`)
      }, 1500)
    } catch (error) {
      toast.error(error.response?.data?.error || 'Failed to accept team invitation')
    }
  }

  const declineTeamInvite = async (inviteId) => {
    try {
      await collaborationAPI.declineInvite(inviteId)
      toast.success('Team invitation declined')
      fetchTeamInvitations()
    } catch (error) {
      toast.error(error.response?.data?.error || 'Failed to decline team invitation')
    }
  }

  const cancelTeamInvite = async (inviteId) => {
    try {
      await collaborationAPI.cancelInvite(inviteId)
      toast.success('Team invitation cancelled')
      fetchTeamInvitations()
    } catch (error) {
      toast.error(error.response?.data?.error || 'Failed to cancel team invitation')
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    )
  }

  // If user doesn't have access, show upgrade message
  if (!hasAccess) {
    return (
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <div className="text-center">
          <div className="mb-8">
            <svg className="w-16 h-16 mx-auto text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197m13.5-9a2.5 2.5 0 11-5 0 2.5 2.5 0 015 0z" />
            </svg>
          </div>
          
          <h1 className="text-3xl font-bold mb-4">Connect with Learning Partners</h1>
          <p className="text-lg text-gray-600 mb-8 max-w-2xl mx-auto">
            Build your learning community by connecting with friends, collaborating on quests, and earning bonus XP together.
          </p>
          
          <div className="bg-white rounded-xl shadow-lg p-8 mb-8">
            <h2 className="text-xl font-semibold mb-6">Supported Tier Features</h2>
            <div className="grid md:grid-cols-2 gap-6 text-left">
              <div className="flex items-start gap-3">
                <svg className="w-5 h-5 text-green-500 mt-1 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
                <div>
                  <h3 className="font-medium">Connect with Friends</h3>
                  <p className="text-sm text-gray-600">Send and accept friend requests to build your learning network</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <svg className="w-5 h-5 text-green-500 mt-1 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
                <div>
                  <h3 className="font-medium">Team-Up for 2x XP</h3>
                  <p className="text-sm text-gray-600">Collaborate on quests with friends to earn double experience points</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <svg className="w-5 h-5 text-green-500 mt-1 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
                <div>
                  <h3 className="font-medium">Learning Community</h3>
                  <p className="text-sm text-gray-600">Join a supportive community of learners and educators</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <svg className="w-5 h-5 text-green-500 mt-1 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
                <div>
                  <h3 className="font-medium">Portfolio Diploma Access</h3>
                  <p className="text-sm text-gray-600">Build and share your professional learning portfolio</p>
                </div>
              </div>
            </div>
          </div>
          
          <div className="flex justify-center gap-4">
            <button
              onClick={() => navigate('/subscription')}
              className="bg-gradient-to-r from-[#ef597b] to-[#6d469b] text-white px-8 py-3 rounded-[30px] font-semibold shadow-[0_4px_20px_rgba(239,89,123,0.15)] hover:shadow-[0_6px_25px_rgba(239,89,123,0.25)] hover:-translate-y-0.5 transition-all duration-300"
            >
              Upgrade to Supported
            </button>
            <button
              onClick={() => navigate('/quests')}
              className="bg-gray-100 text-gray-700 px-6 py-3 rounded-[30px] font-medium hover:bg-gray-200 transition-colors"
            >
              Continue Learning
            </button>
          </div>
        </div>
      </div>
    )
  }

  const handleBackToQuest = () => {
    sessionStorage.removeItem('returnToQuest')
    navigate(`/quests/${returnToQuest}`)
  }

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-3xl font-bold">Friends & Community</h1>
        {returnToQuest && (
          <button
            onClick={handleBackToQuest}
            className="bg-gradient-primary text-white px-6 py-3 rounded-[30px] font-semibold shadow-[0_4px_20px_rgba(239,89,123,0.15)] hover:shadow-[0_6px_25px_rgba(239,89,123,0.25)] hover:-translate-y-0.5 transition-all duration-300 flex items-center gap-2"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 17l-5-5m0 0l5-5m-5 5h12" />
            </svg>
            Back to Quest
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          {returnToQuest && friends.length === 0 && (
            <div className="bg-purple-50 border border-purple-200 rounded-lg p-4 mb-6">
              <div className="flex items-start">
                <svg className="w-5 h-5 text-purple-600 mt-0.5 mr-2" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                </svg>
                <div>
                  <p className="text-purple-900 font-medium">Team up for 2x XP!</p>
                  <p className="text-purple-700 text-sm mt-1">
                    Add friends below, then go back to your quest to invite them to team up and earn double XP together!
                  </p>
                </div>
              </div>
            </div>
          )}
          
          <div className="card mb-6">
            <h2 className="text-xl font-semibold mb-4">Send Friend Request</h2>
            <form onSubmit={sendFriendRequest} className="flex gap-4">
              <input
                type="email"
                placeholder="Enter friend's email address..."
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="input-field flex-1"
              />
              <button
                type="submit"
                disabled={sending}
                className="btn-primary disabled:opacity-50"
              >
                {sending ? 'Sending...' : 'Send Request'}
              </button>
            </form>
          </div>

          {/* Friends Management with Tabs */}
          <div className="bg-white rounded-xl shadow-lg mb-6">
            {/* Tab Navigation */}
            <div className="flex border-b">
              <TabButton
                id="incoming"
                label="Incoming Requests"
                count={pendingRequests.length}
                isActive={activeTab === 'incoming'}
                onClick={setActiveTab}
                icon={UserPlusIcon}
              />
              <TabButton
                id="sent"
                label="Sent Requests"
                count={sentRequests.length}
                isActive={activeTab === 'sent'}
                onClick={setActiveTab}
                icon={ClockIcon}
              />
              <TabButton
                id="friends"
                label="My Friends"
                count={friends.length}
                isActive={activeTab === 'friends'}
                onClick={setActiveTab}
                icon={CheckCircleIcon}
              />
            </div>

            {/* Tab Content */}
            <div className="p-6">
              {activeTab === 'incoming' && (
                <div>
                  {pendingRequests.length === 0 ? (
                    <div className="text-center py-8">
                      <UserPlusIcon className="w-12 h-12 text-gray-400 mx-auto mb-3" />
                      <p className="text-gray-600">No pending friend requests</p>
                      <p className="text-sm text-gray-500 mt-1">When someone sends you a friend request, it will appear here</p>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {pendingRequests.map(request => (
                        <div key={request.friendship_id} className="p-4 bg-gradient-to-r from-purple-50 to-pink-50 border border-purple-200 rounded-lg">
                          <div className="flex items-start justify-between">
                            <div className="flex items-start gap-3">
                              <div className="w-10 h-10 bg-gradient-to-br from-purple-400 to-pink-400 rounded-full flex items-center justify-center text-white font-bold">
                                {request.requester.first_name?.[0]?.toUpperCase() || '?'}
                              </div>
                              <div>
                                <h3 className="font-semibold text-gray-900">
                                  {request.requester.first_name} {request.requester.last_name}
                                </h3>
                                <p className="text-sm text-gray-600">Wants to connect with you</p>
                                <div className="flex items-center gap-1 text-xs text-gray-500 mt-1">
                                  <ClockIcon className="w-3 h-3" />
                                  <span>{formatTimeAgo(request.created_at)}</span>
                                </div>
                              </div>
                            </div>
                            <div className="flex gap-2">
                              <button
                                onClick={() => acceptRequest(request.friendship_id)}
                                className="bg-gradient-to-r from-[#ef597b] to-[#6d469b] text-white px-4 py-2 rounded-full text-sm font-semibold hover:shadow-lg transition-all duration-300"
                              >
                                Accept
                              </button>
                              <button
                                onClick={() => declineRequest(request.friendship_id)}
                                className="bg-gray-100 text-gray-700 px-4 py-2 rounded-full text-sm font-medium hover:bg-gray-200 transition-colors"
                              >
                                Decline
                              </button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {activeTab === 'sent' && (
                <div>
                  {sentRequests.length === 0 ? (
                    <div className="text-center py-8">
                      <ClockIcon className="w-12 h-12 text-gray-400 mx-auto mb-3" />
                      <p className="text-gray-600">No sent friend requests</p>
                      <p className="text-sm text-gray-500 mt-1">Friend requests you send will be tracked here</p>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {sentRequests.map(request => (
                        <div key={request.friendship_id} className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
                          <div className="flex items-start justify-between">
                            <div className="flex items-start gap-3">
                              <div className="w-10 h-10 bg-gradient-to-br from-purple-400 to-pink-400 rounded-full flex items-center justify-center text-white font-bold">
                                {request.addressee.first_name?.[0]?.toUpperCase() || '?'}
                              </div>
                              <div>
                                <h3 className="font-semibold text-gray-900">
                                  {request.addressee.first_name} {request.addressee.last_name}
                                </h3>
                                <StatusBadge status={request.status} />
                                <div className="flex items-center gap-1 text-xs text-gray-500 mt-1">
                                  <ClockIcon className="w-3 h-3" />
                                  <span>Sent {formatTimeAgo(request.created_at)}</span>
                                </div>
                              </div>
                            </div>
                            <div className="flex gap-2">
                              {request.status === 'pending' && (
                                <button
                                  onClick={() => cancelRequest(request.friendship_id)}
                                  className="text-red-600 hover:text-red-800 text-sm font-medium"
                                >
                                  Cancel
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {activeTab === 'friends' && (
                <div>
                  {friends.length === 0 ? (
                    <div className="text-center py-8">
                      <CheckCircleIcon className="w-12 h-12 text-gray-400 mx-auto mb-3" />
                      <p className="text-gray-600">No friends yet</p>
                      <p className="text-sm text-gray-500 mt-1">Send friend requests to connect with other learners!</p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {friends.map(friend => (
                        <div key={friend.id} className="p-4 bg-gradient-to-r from-green-50 to-emerald-50 border border-green-200 rounded-lg">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 bg-gradient-to-br from-green-400 to-emerald-400 rounded-full flex items-center justify-center text-white font-bold">
                              {friend.first_name?.[0]?.toUpperCase() || '?'}
                            </div>
                            <div>
                              <h3 className="font-semibold text-gray-900">
                                {friend.first_name} {friend.last_name}
                              </h3>
                              <p className="text-sm text-gray-600">Learning partner</p>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

            </div>
          </div>

          {/* Team-Up Management Container */}
          <div className="bg-white rounded-xl shadow-lg mb-6">
            <div className="p-6 border-b">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <UsersIcon className="w-6 h-6 text-purple-600" />
                  <h2 className="text-xl font-bold text-gray-900">Team-Up Center</h2>
                </div>
                <button
                  onClick={() => {
                    fetchTeamInvitations();
                    toast.success('Refreshed team-up data');
                  }}
                  className="bg-gray-100 text-gray-700 px-3 py-1 rounded-full text-sm font-medium hover:bg-gray-200 transition-colors"
                >
                  Refresh
                </button>
              </div>
              <p className="text-gray-600 text-sm mt-1">Collaborate with friends to earn 2x XP</p>
            </div>

            <div className="p-6">
              {/* Team-Up Stats Row */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                <div className="bg-gradient-to-br from-purple-50 to-purple-100 p-4 rounded-lg text-center">
                  <div className="text-2xl font-bold text-purple-600">{teamInvitations.length}</div>
                  <div className="text-sm text-purple-700">Incoming Invites</div>
                </div>
                <div className="bg-gradient-to-br from-blue-50 to-blue-100 p-4 rounded-lg text-center">
                  <div className="text-2xl font-bold text-blue-600">{sentTeamInvitations.length}</div>
                  <div className="text-sm text-blue-700">Sent Invites</div>
                </div>
                <div className="bg-gradient-to-br from-green-50 to-green-100 p-4 rounded-lg text-center">
                  <div className="text-2xl font-bold text-green-600">{activeCollaborations.length}</div>
                  <div className="text-sm text-green-700">Active Teams</div>
                </div>
              </div>

              {/* Incoming Team Invites */}
              {teamInvitations.length > 0 && (
                <div className="mb-6">
                  <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                    <UsersIcon className="w-5 h-5 text-purple-600" />
                    Incoming Team-Up Invites ({teamInvitations.length})
                  </h3>
                  <div className="space-y-3">
                    {teamInvitations.map(invite => (
                      <div key={invite.id} className="p-4 bg-gradient-to-r from-purple-50 to-pink-50 border border-purple-200 rounded-lg">
                        <div className="flex items-start justify-between">
                          <div className="flex items-start gap-3 flex-1">
                            <div className="w-10 h-10 bg-gradient-to-br from-purple-400 to-pink-400 rounded-full flex items-center justify-center text-white font-bold flex-shrink-0">
                              {invite.sender?.first_name?.[0]?.toUpperCase() || '?'}
                            </div>
                            <div className="min-w-0 flex-1">
                              <h4 className="font-semibold text-gray-900">
                                {invite.sender?.first_name} {invite.sender?.last_name}
                              </h4>
                              <p className="text-sm text-purple-700 mt-1 truncate">
                                Quest: {invite.quest?.title}
                              </p>
                              <div className="flex flex-wrap items-center gap-2 mt-2">
                                <CollaborationBadge status={invite.status} showXpBonus={false} />
                                <div className="flex items-center gap-1 text-xs text-gray-500">
                                  <ClockIcon className="w-3 h-3" />
                                  <span>{formatTimeAgo(invite.created_at)}</span>
                                </div>
                              </div>
                              {invite.message && (
                                <p className="text-xs text-gray-600 mt-2 italic">"{invite.message}"</p>
                              )}
                            </div>
                          </div>
                          <div className="flex flex-col sm:flex-row gap-2 ml-3">
                            <button
                              onClick={() => acceptTeamInvite(invite.id, invite.quest?.id)}
                              className="bg-gradient-to-r from-[#ef597b] to-[#6d469b] text-white px-4 py-2 rounded-lg text-sm font-semibold hover:shadow-lg transition-all duration-300"
                            >
                              Accept
                            </button>
                            <button
                              onClick={() => declineTeamInvite(invite.id)}
                              className="bg-gray-100 text-gray-700 px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-200 transition-colors"
                            >
                              Decline
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Sent Team Invites */}
              {sentTeamInvitations.length > 0 && (
                <div className="mb-6">
                  <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                    <PaperAirplaneIcon className="w-5 h-5 text-blue-600" />
                    Sent Team-Up Invites ({sentTeamInvitations.length})
                  </h3>
                  <div className="space-y-3">
                    {sentTeamInvitations.map(invite => (
                      <div key={invite.id} className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
                        <div className="flex items-start justify-between">
                          <div className="flex items-start gap-3 flex-1">
                            <div className="w-10 h-10 bg-gradient-to-br from-blue-400 to-purple-400 rounded-full flex items-center justify-center text-white font-bold flex-shrink-0">
                              {invite.partner?.first_name?.[0]?.toUpperCase() || '?'}
                            </div>
                            <div className="min-w-0 flex-1">
                              <h4 className="font-semibold text-gray-900">
                                {invite.partner?.first_name} {invite.partner?.last_name}
                              </h4>
                              <p className="text-sm text-blue-700 mt-1 truncate">
                                Quest: {invite.quest?.title}
                              </p>
                              <div className="flex flex-wrap items-center gap-2 mt-2">
                                <CollaborationBadge status={invite.status} showXpBonus={false} />
                                <div className="flex items-center gap-1 text-xs text-gray-500">
                                  <ClockIcon className="w-3 h-3" />
                                  <span>Sent {formatTimeAgo(invite.created_at)}</span>
                                </div>
                              </div>
                              {invite.message && (
                                <p className="text-xs text-gray-600 mt-2 italic">"{invite.message}"</p>
                              )}
                            </div>
                          </div>
                          <div className="flex flex-col gap-2 ml-3">
                            {invite.status === 'pending' && (
                              <button
                                onClick={() => cancelTeamInvite(invite.id)}
                                className="text-red-600 hover:text-red-800 text-sm font-medium px-3 py-1 hover:bg-red-50 rounded transition-colors"
                              >
                                Cancel
                              </button>
                            )}
                            {invite.status === 'accepted' && (
                              <button
                                onClick={() => navigate(`/quests/${invite.quest?.id}`)}
                                className="bg-green-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-green-700 transition-colors"
                              >
                                View Quest
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Active Collaborations */}
              {activeCollaborations.length > 0 && (
                <div className="mb-6">
                  <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                    <CheckCircleIcon className="w-5 h-5 text-green-600" />
                    Active Team-Ups ({activeCollaborations.length})
                  </h3>
                  <div className="space-y-3">
                    {activeCollaborations.map(collab => (
                      <div key={collab.id} className="p-4 bg-green-50 border border-green-200 rounded-lg">
                        <div className="flex items-start justify-between">
                          <div className="flex items-start gap-3 flex-1">
                            <div className="w-10 h-10 bg-gradient-to-br from-green-400 to-emerald-400 rounded-full flex items-center justify-center text-white font-bold flex-shrink-0">
                              {collab.partner?.first_name?.[0]?.toUpperCase() || '?'}
                            </div>
                            <div className="min-w-0 flex-1">
                              <h4 className="font-semibold text-gray-900">
                                {collab.partner?.first_name} {collab.partner?.last_name}
                              </h4>
                              <p className="text-sm text-green-700 mt-1 truncate">
                                Quest: {collab.quest?.title}
                              </p>
                              <div className="flex items-center gap-2 mt-2">
                                <span className="bg-green-600 text-white px-2 py-1 rounded-full text-xs font-medium">
                                  2x XP Active
                                </span>
                              </div>
                            </div>
                          </div>
                          <div className="flex flex-col gap-2 ml-3">
                            <button
                              onClick={() => navigate(`/quests/${collab.quest?.id}`)}
                              className="bg-green-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-green-700 transition-colors"
                            >
                              View Quest
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Empty State */}
              {teamInvitations.length === 0 && sentTeamInvitations.length === 0 && activeCollaborations.length === 0 && (
                <div className="text-center py-12">
                  <UsersIcon className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                  <h3 className="text-lg font-medium text-gray-900 mb-2">No Team-Up Activity</h3>
                  <p className="text-gray-500 mb-4">Start collaborating with friends to earn 2x XP on quests!</p>
                  <button
                    onClick={() => navigate('/quests')}
                    className="bg-gradient-to-r from-[#ef597b] to-[#6d469b] text-white px-6 py-3 rounded-lg font-medium hover:shadow-lg transition-all duration-300"
                  >
                    Browse Quests
                  </button>
                </div>
              )}
            </div>
          </div>

        </div>

        <div>
          <div className="card">
            <h2 className="text-xl font-semibold mb-4">Community Benefits</h2>
            <div className="space-y-3">
              <div className="p-3 bg-purple-50 rounded-lg">
                <h3 className="font-medium mb-1">Collaborative Learning</h3>
                <p className="text-sm text-gray-600">
                  Work together on quests and share knowledge
                </p>
              </div>
              <div className="p-3 bg-yellow-50 rounded-lg">
                <h3 className="font-medium mb-1">Team-Up Benefits</h3>
                <p className="text-sm text-gray-600">
                  Earn 2x XP when completing quests with friends!
                </p>
              </div>
              <div className="p-3 bg-green-50 rounded-lg">
                <h3 className="font-medium mb-1">Motivation & Support</h3>
                <p className="text-sm text-gray-600">
                  Stay motivated with peer encouragement
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default FriendsPage