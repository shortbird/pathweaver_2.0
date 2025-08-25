import React, { useState, useEffect } from 'react'
import api from '../services/api'
import toast from 'react-hot-toast'

const FriendsPage = () => {
  const [friends, setFriends] = useState([])
  const [pendingRequests, setPendingRequests] = useState([])
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)

  useEffect(() => {
    fetchFriends()
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
      toast.success('Friend request sent!')
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
      await api.post(`/community/friends/accept/${friendshipId}`)
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

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    )
  }

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <h1 className="text-3xl font-bold mb-8">Friends & Community</h1>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
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

          {pendingRequests.length > 0 && (
            <div className="card mb-6">
              <h2 className="text-xl font-semibold mb-4">Pending Requests</h2>
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
                <h3 className="font-medium mb-1">XP Bonuses</h3>
                <p className="text-sm text-gray-600">
                  Earn extra XP when completing quests with friends (Creator tier)
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