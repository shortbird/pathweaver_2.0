import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import { useAuth } from '../contexts/AuthContext'
import {
  useFriends,
  useFriendsActivity,
  useSendFriendRequest,
  useAcceptFriendRequest,
  useDeclineFriendRequest,
  useCancelFriendRequest,
  // useCollaborations, // REMOVED - Phase 3 refactoring (January 2025)
} from '../hooks/api/useFriends'
// import { collaborationAPI } from '../services/api' // REMOVED - Phase 3 refactoring (January 2025)
// import { hasFeatureAccess } from '../utils/tierMapping' // REMOVED - Phase 3 refactoring (January 2025)

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

  // React Query hooks - Connections feature is available to ALL users including free tier
  const {
    data: friendsData,
    isLoading: loadingFriends,
  } = useFriends(user?.id, {
    enabled: !!user?.id,
  })

  // const { // REMOVED - Phase 3 refactoring (January 2025)
  //   data: collaborationsData,
  //   isLoading: loadingCollaborations,
  // } = useCollaborations(user?.id, {
  //   enabled: !!user?.id,
  // })

  const {
    data: activityData,
    isLoading: loadingActivity,
  } = useFriendsActivity(user?.id, {
    enabled: !!user?.id,
  })

  // Mutations
  const sendFriendRequestMutation = useSendFriendRequest()
  const acceptFriendRequestMutation = useAcceptFriendRequest()
  const declineFriendRequestMutation = useDeclineFriendRequest()
  const cancelFriendRequestMutation = useCancelFriendRequest()

  // Connections feature is available to ALL users - no tier restriction
  const hasAccess = true

  // Extract data from React Query
  const friends = friendsData?.friends || []
  const pendingRequests = friendsData?.pending_requests || []
  const sentRequests = friendsData?.sent_requests || []
  // const teamInvitations = collaborationsData?.received_invitations || [] // REMOVED - Phase 3 refactoring (January 2025)
  // const sentTeamInvitations = collaborationsData?.sent_invitations || [] // REMOVED - Phase 3 refactoring (January 2025)

  // Loading state
  const loading = loadingFriends || loadingActivity // loadingCollaborations removed (Phase 3 refactoring)

  // Check if we should return to a quest after adding friends
  useEffect(() => {
    const questId = sessionStorage.getItem('returnToQuest')
    if (questId) {
      setReturnToQuest(questId)
    }
  }, [])

  // Get activity feed from API
  const activities = activityData?.activities || []

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

  // Team-up invitations removed - Phase 3 refactoring (January 2025)
  // const formattedTeamInvitations = teamInvitations.map((invite) => ({
  //   ...invite,
  //   timeAgo: formatTimeAgo(invite.created_at),
  // }))

  // const formattedSentTeamInvitations = sentTeamInvitations.map((invite) => ({
  //   ...invite,
  //   timeAgo: formatTimeAgo(invite.created_at),
  // }))

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

  // Team-up handlers removed - Phase 3 refactoring (January 2025)
  // const handleAcceptTeamInvite = async (inviteId, questId) => { ... }
  // const handleDeclineTeamInvite = async (inviteId) => { ... }
  // const handleCancelTeamInvite = async (inviteId) => { ... }

  // Loading state
  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#6D469B]"></div>
      </div>
    )
  }

  // Connections feature is available to all users - no upgrade wall needed

  return (
    <div className="min-h-screen bg-white">
      <ConnectionsHeader returnToQuest={returnToQuest} onBackToQuest={handleBackToQuest} />

      <ConnectionsTabs
        activeTab={activeTab}
        onTabChange={setActiveTab}
        counts={{
          connections: friends.length,
          pendingRequests: pendingRequests.length,
          // teamInvitations: teamInvitations.length, // REMOVED - Phase 3 refactoring (January 2025)
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
          // teamInvitations={formattedTeamInvitations} // REMOVED - Phase 3 refactoring (January 2025)
          // sentTeamInvitations={formattedSentTeamInvitations} // REMOVED - Phase 3 refactoring (January 2025)
          onAcceptRequest={handleAcceptRequest}
          onDeclineRequest={handleDeclineRequest}
          onCancelRequest={handleCancelRequest}
          // onAcceptTeamInvite={handleAcceptTeamInvite} // REMOVED - Phase 3 refactoring (January 2025)
          // onDeclineTeamInvite={handleDeclineTeamInvite} // REMOVED - Phase 3 refactoring (January 2025)
          // onCancelTeamInvite={handleCancelTeamInvite} // REMOVED - Phase 3 refactoring (January 2025)
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
