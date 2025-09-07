import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../services/api'
import toast from 'react-hot-toast'
import { useAuth } from '../contexts/AuthContext'
import { hasFeatureAccess } from '../utils/tierMapping'

const FriendsPage = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [friends, setFriends] = useState([])
  const [pendingRequests, setPendingRequests] = useState([])
  const [teamInvitations, setTeamInvitations] = useState([])
  const [activeCollaborations, setActiveCollaborations] = useState([])
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [returnToQuest, setReturnToQuest] = useState(null)

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
    if (hasAccess) {
      fetchFriends()
      fetchTeamInvitations()
      fetchActiveCollaborations()
    } else {
      setLoading(false)
    }
  }, [hasAccess])

  const fetchFriends = async () => {
    try {
      const response = await api.get('/api/community/friends')
      setFriends(response.data.friends)
      setPendingRequests(response.data.pending_requests)
    } catch (error) {
      toast.error('Failed to load friends')
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
      await api.post('/api/community/friends/request', { email })
      if (returnToQuest) {
        toast.success('Friend request sent! Once accepted, you can team up on the quest.')
      } else {
        toast.success('Friend request sent!')
      }
      setEmail('')
      fetchFriends()
    } catch (error) {
      toast.error(error.response?.data?.error || 'Failed to send friend request')
    } finally {
      setSending(false)
    }
  }

  const acceptRequest = async (friendshipId) => {
    try {
      const response = await api.post(`/api/community/friends/accept/${friendshipId}`, {})
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
      await api.delete(`/api/community/friends/decline/${friendshipId}`)
      toast.success('Friend request declined')
      fetchFriends()
    } catch (error) {
      toast.error('Failed to decline friend request')
    }
  }

  const fetchTeamInvitations = async () => {
    try {
      const response = await api.get('/api/v3/collaborations/invites')
      setTeamInvitations(response.data.invitations || [])
      if (response.data.invitations && response.data.invitations.length > 0) {
      }
    } catch (error) {
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
      await api.post(`/api/v3/collaborations/${inviteId}/accept`, {})
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
      await api.post(`/api/v3/collaborations/${inviteId}/decline`, {})
      toast.success('Team invitation declined')
      fetchTeamInvitations()
    } catch (error) {
      toast.error(error.response?.data?.error || 'Failed to decline team invitation')
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
                <svg className="w-5 h-5 text-[#ef597b] mt-1 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
                <div>
                  <h3 className="font-medium">Connect with Friends</h3>
                  <p className="text-sm text-gray-600">Send and accept friend requests to build your learning network</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <svg className="w-5 h-5 text-[#ef597b] mt-1 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
                <div>
                  <h3 className="font-medium">Team-Up for 2x XP</h3>
                  <p className="text-sm text-gray-600">Collaborate on quests with friends to earn double experience points</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <svg className="w-5 h-5 text-[#ef597b] mt-1 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
                <div>
                  <h3 className="font-medium">Learning Community</h3>
                  <p className="text-sm text-gray-600">Join a supportive community of learners and educators</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <svg className="w-5 h-5 text-[#ef597b] mt-1 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
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

          {(teamInvitations.length > 0 || true) && (
            <div className="card mb-6">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-semibold">Team-Up Invitations</h2>
                <button
                  onClick={() => {
                    fetchTeamInvitations();
                    toast.success('Refreshed invitations');
                  }}
                  className="text-sm bg-purple-100 text-primary px-3 py-1 rounded-full font-semibold hover:bg-purple-200 transition-colors"
                >
                  Refresh
                </button>
              </div>
              <div className="space-y-3">
                {teamInvitations.length === 0 ? (
                  <p className="text-gray-500 text-center py-4">
                    No pending team invitations
                  </p>
                ) : (
                  teamInvitations.map(invite => (
                  <div
                    key={invite.id}
                    className="p-4 bg-purple-50 border border-purple-200 rounded-lg"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <p className="font-medium text-purple-900">
                          {invite.requester.first_name} {invite.requester.last_name} invited you to team up!
                        </p>
                        <p className="text-sm text-purple-700 mt-1">
                          Quest: {invite.quest.title}
                        </p>
                        <p className="text-xs text-purple-600 mt-2">
                          🎯 Complete together for 2x XP bonus
                        </p>
                      </div>
                      <div className="flex gap-2 ml-4">
                        <button
                          onClick={() => acceptTeamInvite(invite.id, invite.quest.id)}
                          className="bg-primary text-white px-4 py-2 rounded-[20px] text-sm font-semibold hover:bg-primary-dark hover:-translate-y-0.5 transition-all duration-300"
                        >
                          Accept
                        </button>
                        <button
                          onClick={() => declineTeamInvite(invite.id)}
                          className="bg-gray-600 text-white px-3 py-1 rounded text-sm hover:bg-gray-700"
                        >
                          Decline
                        </button>
                      </div>
                    </div>
                  </div>
                ))
                )}
              </div>
            </div>
          )}

          {pendingRequests.length > 0 && (
            <div className="card mb-6">
              <h2 className="text-xl font-semibold mb-4">Friend Requests</h2>
              <div className="space-y-3">
                {pendingRequests.map(request => (
                  <div
                    key={request.friendship_id}
                    className="flex items-center justify-between p-3 bg-yellow-50 rounded-lg"
                  >
                    <div>
                      <p className="font-medium">
                        {request.requester.first_name} {request.requester.last_name}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => acceptRequest(request.friendship_id)}
                        className="bg-emerald-500 text-white px-4 py-2 rounded-[20px] text-sm font-semibold hover:bg-emerald-600 hover:-translate-y-0.5 transition-all duration-300"
                      >
                        Accept
                      </button>
                      <button
                        onClick={() => declineRequest(request.friendship_id)}
                        className="bg-red-500 text-white px-4 py-2 rounded-[20px] text-sm font-semibold hover:bg-red-600 hover:-translate-y-0.5 transition-all duration-300"
                      >
                        Decline
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeCollaborations.length > 0 && (
            <div className="card mb-6">
              <h2 className="text-xl font-semibold mb-4">Active Team-Ups</h2>
              <div className="space-y-3">
                {activeCollaborations.map(collab => (
                  <div
                    key={collab.id}
                    className="p-3 bg-green-50 border border-green-200 rounded-lg"
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium text-green-900">
                          {collab.quest.title}
                        </p>
                        <p className="text-sm text-green-700">
                          Partner: {collab.partner.first_name} {collab.partner.last_name}
                        </p>
                      </div>
                      <div className="text-right">
                        <span className="text-xs bg-green-600 text-white px-2 py-1 rounded">
                          2x XP Active
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="card">
            <h2 className="text-xl font-semibold mb-4">My Friends ({friends.length})</h2>
            {friends.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {friends.map(friend => (
                  <div
                    key={friend.id}
                    className="p-4 bg-background rounded-lg"
                  >
                    <p className="font-medium">
                      {friend.first_name} {friend.last_name}
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-gray-600">
                You haven't added any friends yet. Send friend requests to connect with other learners!
              </p>
            )}
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