import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../services/api'
import toast from 'react-hot-toast'

const FriendsPage = () => {
  const navigate = useNavigate();
  const [friends, setFriends] = useState([])
  const [pendingRequests, setPendingRequests] = useState([])
  const [teamInvitations, setTeamInvitations] = useState([])
  const [activeCollaborations, setActiveCollaborations] = useState([])
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [returnToQuest, setReturnToQuest] = useState(null)

  useEffect(() => {
    // Check if we should return to a quest after adding friends
    const questId = sessionStorage.getItem('returnToQuest')
    if (questId) {
      setReturnToQuest(questId)
    }
  }, [])

  useEffect(() => {
    fetchFriends()
    fetchTeamInvitations()
    fetchActiveCollaborations()
  }, [])

  const fetchFriends = async () => {
    try {
      const response = await api.get('/community/friends')
      setFriends(response.data.friends)
      setPendingRequests(response.data.pending_requests)
    } catch (error) {
      console.error('Failed to fetch friends:', error)
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
      await api.post('/community/friends/request', { email })
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
      await api.post(`/community/friends/accept/${friendshipId}`, {})
      toast.success('Friend request accepted!')
      fetchFriends()
    } catch (error) {
      toast.error('Failed to accept friend request')
    }
  }

  const declineRequest = async (friendshipId) => {
    try {
      await api.delete(`/community/friends/decline/${friendshipId}`)
      toast.success('Friend request declined')
      fetchFriends()
    } catch (error) {
      toast.error('Failed to decline friend request')
    }
  }

  const fetchTeamInvitations = async () => {
    try {
      console.log('Fetching team invitations...')
      const response = await api.get('/v3/collaborations/invites')
      console.log('Team invitations response:', response.data)
      setTeamInvitations(response.data.invitations || [])
      if (response.data.invitations && response.data.invitations.length > 0) {
        console.log('Found', response.data.invitations.length, 'team invitations')
      }
    } catch (error) {
      console.error('Failed to fetch team invitations:', error)
    }
  }

  const fetchActiveCollaborations = async () => {
    try {
      const response = await api.get('/v3/collaborations/active')
      setActiveCollaborations(response.data.collaborations || [])
    } catch (error) {
      console.error('Failed to fetch collaborations:', error)
    }
  }

  const acceptTeamInvite = async (inviteId, questId) => {
    try {
      await api.post(`/v3/collaborations/${inviteId}/accept`, {})
      toast.success('Team invitation accepted! You\'ll earn 2x XP together!')
      fetchTeamInvitations()
      fetchActiveCollaborations()
      // Navigate to the quest page after accepting
      setTimeout(() => {
        navigate(`/quests/${questId}`)
      }, 1500)
    } catch (error) {
      console.error('Error accepting invitation:', error)
      toast.error(error.response?.data?.error || 'Failed to accept team invitation')
    }
  }

  const declineTeamInvite = async (inviteId) => {
    try {
      await api.post(`/v3/collaborations/${inviteId}/decline`, {})
      toast.success('Team invitation declined')
      fetchTeamInvitations()
    } catch (error) {
      console.error('Error declining invitation:', error)
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
            className="bg-purple-600 text-white px-4 py-2 rounded-lg hover:bg-purple-700 transition-colors flex items-center gap-2"
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
                  className="text-sm bg-purple-100 text-purple-700 px-3 py-1 rounded hover:bg-purple-200"
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
                          {invite.requester.username || `${invite.requester.first_name} ${invite.requester.last_name}`} invited you to team up!
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
                          className="bg-purple-600 text-white px-3 py-1 rounded text-sm hover:bg-purple-700"
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
                        className="bg-green-600 text-white px-3 py-1 rounded text-sm hover:bg-green-700"
                      >
                        Accept
                      </button>
                      <button
                        onClick={() => declineRequest(request.friendship_id)}
                        className="bg-red-600 text-white px-3 py-1 rounded text-sm hover:bg-red-700"
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
                          Partner: {collab.partner.username || `${collab.partner.first_name} ${collab.partner.last_name}`}
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
                    <p className="text-xs text-gray-500 mt-1">
                      {friend.subscription_tier.toUpperCase()} member
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