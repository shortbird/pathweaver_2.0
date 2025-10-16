import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import { useAuth } from '../contexts/AuthContext'
import {
  useFriends,
  useSendFriendRequest,
  useAcceptFriendRequest,
  useDeclineFriendRequest,
  useCancelFriendRequest,
  useCollaborations,
} from '../hooks/api/useFriends'
import { collaborationAPI } from '../services/api'
import { hasFeatureAccess } from '../utils/tierMapping'

// Import new components
import ConnectionsHeader from '../components/connections/ConnectionsHeader'
import ConnectionsTabs from '../components/connections/ConnectionsTabs'
import ActivityFeedTab from '../components/connections/ActivityFeed/ActivityFeedTab'
import ConnectionsTab from '../components/connections/YourConnections/ConnectionsTab'
import InvitationsTab from '../components/connections/Invitations/InvitationsTab'
import AddConnectionModal from '../components/connections/Modals/AddConnectionModal'

const ConnectionsPage = () => {
  const navigate = useNavigate()
  const { user } = useAuth()

  // State
  const [activeTab, setActiveTab] = useState('activity')
  const [showAddModal, setShowAddModal] = useState(false)
  const [returnToQuest, setReturnToQuest] = useState(null)

  // React Query hooks
  const {
    data: friendsData,
    isLoading: loadingFriends,
  } = useFriends(user?.id, {
    enabled: !!user?.id && hasFeatureAccess(user?.subscription_tier, 'supported'),
  })

  const {
    data: collaborationsData,
    isLoading: loadingCollaborations,
  } = useCollaborations(user?.id, {
    enabled: !!user?.id && hasFeatureAccess(user?.subscription_tier, 'supported'),
  })

  // Mutations
  const sendFriendRequestMutation = useSendFriendRequest()
  const acceptFriendRequestMutation = useAcceptFriendRequest()
  const declineFriendRequestMutation = useDeclineFriendRequest()
  const cancelFriendRequestMutation = useCancelFriendRequest()

  // Check if user has access to connections feature
  const hasAccess = hasFeatureAccess(user?.subscription_tier, 'supported')

  // Extract data from React Query
  const friends = friendsData?.friends || []
  const pendingRequests = friendsData?.pending_requests || []
  const sentRequests = friendsData?.sent_requests || []
  const teamInvitations = collaborationsData?.received_invitations || []
  const sentTeamInvitations = collaborationsData?.sent_invitations || []

  // Loading state
  const loading = loadingFriends || loadingCollaborations

  // Check if we should return to a quest after adding friends
  useEffect(() => {
    const questId = sessionStorage.getItem('returnToQuest')
    if (questId) {
      setReturnToQuest(questId)
    }
  }, [])

  // Generate activity feed from friends' recent quest activity
  // TODO: This would ideally come from a dedicated API endpoint
  const generateActivityFeed = () => {
    // Mock activity feed for now
    // In production, this would fetch from API showing friends' recent quest starts/completions
    return []
  }

  const activities = generateActivityFeed()

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

  // Format data for components
  const formattedPendingRequests = pendingRequests.map((req) => ({
    ...req,
    timeAgo: formatTimeAgo(req.created_at),
  }))

  const formattedSentRequests = sentRequests.map((req) => ({
    ...req,
    timeAgo: formatTimeAgo(req.created_at),
  }))

  const formattedTeamInvitations = teamInvitations.map((invite) => ({
    ...invite,
    timeAgo: formatTimeAgo(invite.created_at),
  }))

  const formattedSentTeamInvitations = sentTeamInvitations.map((invite) => ({
    ...invite,
    timeAgo: formatTimeAgo(invite.created_at),
  }))

  // Handlers
  const handleBackToQuest = () => {
    sessionStorage.removeItem('returnToQuest')
    navigate(`/quests/${returnToQuest}`)
  }

  const handleSendRequest = (email, message) => {
    sendFriendRequestMutation.mutate(email, {
      onSuccess: () => {
        if (returnToQuest) {
          toast.success("Connection request sent! Once accepted, you can team up on the quest.")
        } else {
          toast.success("Connection request sent!")
        }
        setShowAddModal(false)
        setActiveTab('invitations') // Switch to invitations tab
      },
      onError: (error) => {
        toast.error(error.response?.data?.error || 'Failed to send connection request')
      },
    })
  }

  const handleAcceptRequest = (friendshipId) => {
    acceptFriendRequestMutation.mutate(friendshipId, {
      onSuccess: () => {
        toast.success("You're now connected - explore together!")
      },
    })
  }

  const handleDeclineRequest = (friendshipId) => {
    declineFriendRequestMutation.mutate(friendshipId)
  }

  const handleCancelRequest = (friendshipId) => {
    cancelFriendRequestMutation.mutate(friendshipId)
  }

  const handleAcceptTeamInvite = async (inviteId, questId) => {
    try {
      await collaborationAPI.acceptInvite(inviteId)
      toast.success("Team-up accepted - you'll both earn 2x XP on this quest!")
      setTimeout(() => {
        navigate(`/quests/${questId}`)
      }, 1500)
    } catch (error) {
      toast.error(error.response?.data?.error || 'Failed to accept team-up invitation')
    }
  }

  const handleDeclineTeamInvite = async (inviteId) => {
    try {
      await collaborationAPI.declineInvite(inviteId)
      toast.success('Team-up invitation declined')
    } catch (error) {
      toast.error(error.response?.data?.error || 'Failed to decline team-up invitation')
    }
  }

  const handleCancelTeamInvite = async (inviteId) => {
    try {
      await collaborationAPI.cancelInvite(inviteId)
      toast.success('Team-up invitation cancelled')
    } catch (error) {
      toast.error(error.response?.data?.error || 'Failed to cancel team-up invitation')
    }
  }

  // Loading state
  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#6D469B]"></div>
      </div>
    )
  }

  // If user doesn't have access, show upgrade message
  if (!hasAccess) {
    return (
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <div className="text-center">
          <div className="mb-8">
            <svg
              className="w-16 h-16 mx-auto text-gray-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197m13.5-9a2.5 2.5 0 11-5 0 2.5 2.5 0 015 0z"
              />
            </svg>
          </div>

          <h1
            className="text-3xl font-bold mb-4"
            style={{ fontFamily: 'Poppins', fontWeight: 700 }}
          >
            Connect with Learning Partners
          </h1>
          <p
            className="text-lg text-[#605C61] mb-8 max-w-2xl mx-auto"
            style={{ fontFamily: 'Poppins', fontWeight: 500 }}
          >
            Build your learning community by connecting with others, collaborating on quests, and earning bonus XP together.
          </p>

          <div className="bg-white rounded-xl shadow-lg p-8 mb-8">
            <h2
              className="text-xl font-semibold mb-6"
              style={{ fontFamily: 'Poppins', fontWeight: 600 }}
            >
              Accelerate Tier Features
            </h2>
            <div className="grid md:grid-cols-2 gap-6 text-left">
              <div className="flex items-start gap-3">
                <svg
                  className="w-5 h-5 text-green-500 mt-1 flex-shrink-0"
                  fill="currentColor"
                  viewBox="0 0 20 20"
                >
                  <path
                    fillRule="evenodd"
                    d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                    clipRule="evenodd"
                  />
                </svg>
                <div>
                  <h3
                    className="font-medium"
                    style={{ fontFamily: 'Poppins', fontWeight: 600 }}
                  >
                    Connect with Learning Partners
                  </h3>
                  <p
                    className="text-sm text-[#605C61]"
                    style={{ fontFamily: 'Poppins', fontWeight: 500 }}
                  >
                    Send and accept connection requests to build your learning community
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <svg
                  className="w-5 h-5 text-green-500 mt-1 flex-shrink-0"
                  fill="currentColor"
                  viewBox="0 0 20 20"
                >
                  <path
                    fillRule="evenodd"
                    d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                    clipRule="evenodd"
                  />
                </svg>
                <div>
                  <h3
                    className="font-medium"
                    style={{ fontFamily: 'Poppins', fontWeight: 600 }}
                  >
                    Team-Up for 2x XP
                  </h3>
                  <p
                    className="text-sm text-[#605C61]"
                    style={{ fontFamily: 'Poppins', fontWeight: 500 }}
                  >
                    Collaborate on quests with others to earn double experience points
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <svg
                  className="w-5 h-5 text-green-500 mt-1 flex-shrink-0"
                  fill="currentColor"
                  viewBox="0 0 20 20"
                >
                  <path
                    fillRule="evenodd"
                    d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                    clipRule="evenodd"
                  />
                </svg>
                <div>
                  <h3
                    className="font-medium"
                    style={{ fontFamily: 'Poppins', fontWeight: 600 }}
                  >
                    Learning Activity Feed
                  </h3>
                  <p
                    className="text-sm text-[#605C61]"
                    style={{ fontFamily: 'Poppins', fontWeight: 500 }}
                  >
                    See what your connections are discovering right now
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <svg
                  className="w-5 h-5 text-green-500 mt-1 flex-shrink-0"
                  fill="currentColor"
                  viewBox="0 0 20 20"
                >
                  <path
                    fillRule="evenodd"
                    d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                    clipRule="evenodd"
                  />
                </svg>
                <div>
                  <h3
                    className="font-medium"
                    style={{ fontFamily: 'Poppins', fontWeight: 600 }}
                  >
                    Portfolio Diploma Access
                  </h3>
                  <p
                    className="text-sm text-[#605C61]"
                    style={{ fontFamily: 'Poppins', fontWeight: 500 }}
                  >
                    Build and share your professional learning portfolio
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className="flex justify-center gap-4">
            <button
              onClick={() => navigate('/subscription')}
              className="bg-gradient-to-r from-[#6D469B] to-[#EF597B] text-white px-8 py-3 rounded-full font-semibold shadow-[0_4px_20px_rgba(109,70,155,0.15)] hover:shadow-[0_6px_25px_rgba(109,70,155,0.25)] hover:-translate-y-0.5 transition-all duration-300"
              style={{ fontFamily: 'Poppins', fontWeight: 600 }}
            >
              Upgrade to Accelerate
            </button>
            <button
              onClick={() => navigate('/quests')}
              className="bg-gray-100 text-gray-700 px-6 py-3 rounded-full font-medium hover:bg-gray-200 transition-colors"
              style={{ fontFamily: 'Poppins', fontWeight: 500 }}
            >
              Continue Learning
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-white">
      <ConnectionsHeader returnToQuest={returnToQuest} onBackToQuest={handleBackToQuest} />

      <ConnectionsTabs
        activeTab={activeTab}
        onTabChange={setActiveTab}
        counts={{
          connections: friends.length,
          pendingRequests: pendingRequests.length,
          teamInvitations: teamInvitations.length,
        }}
      />

      {activeTab === 'activity' && (
        <ActivityFeedTab
          activities={activities}
          onAddConnection={() => setShowAddModal(true)}
        />
      )}

      {activeTab === 'connections' && (
        <ConnectionsTab
          connections={friends}
          onAddConnection={() => setShowAddModal(true)}
        />
      )}

      {activeTab === 'invitations' && (
        <InvitationsTab
          pendingRequests={formattedPendingRequests}
          sentRequests={formattedSentRequests}
          teamInvitations={formattedTeamInvitations}
          sentTeamInvitations={formattedSentTeamInvitations}
          onAcceptRequest={handleAcceptRequest}
          onDeclineRequest={handleDeclineRequest}
          onCancelRequest={handleCancelRequest}
          onAcceptTeamInvite={handleAcceptTeamInvite}
          onDeclineTeamInvite={handleDeclineTeamInvite}
          onCancelTeamInvite={handleCancelTeamInvite}
        />
      )}

      <AddConnectionModal
        isOpen={showAddModal}
        onClose={() => setShowAddModal(false)}
        onSendRequest={handleSendRequest}
        isLoading={sendFriendRequestMutation.isPending}
      />
    </div>
  )
}

export default ConnectionsPage
