import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import { useAuth } from '../contexts/AuthContext'
import api from '../services/api'
import {
  useFriends,
  useSendFriendRequest,
  useAcceptFriendRequest,
  useDeclineFriendRequest,
  useCancelFriendRequest,
} from '../hooks/api/useFriends'

// Import new components
import ConnectionsHeader from '../components/connections/ConnectionsHeader'
import NetworkSection from '../components/connections/NetworkSection'
import AddLearningPartnerModal from '../components/connections/Modals/AddLearningPartnerModal'
import AddObserverModal from '../components/connections/Modals/AddObserverModal'

const ConnectionsPage = () => {
  const navigate = useNavigate()
  const { user } = useAuth()

  // State
  const [showAddPartnerModal, setShowAddPartnerModal] = useState(false)
  const [showAddObserverModal, setShowAddObserverModal] = useState(false)
  const [returnToQuest, setReturnToQuest] = useState(null)

  // React Query hooks
  const {
    data: friendsData,
    isLoading: loadingFriends,
  } = useFriends(user?.id, {
    enabled: !!user?.id,
  })

  // Mutations
  const sendFriendRequestMutation = useSendFriendRequest()
  const acceptFriendRequestMutation = useAcceptFriendRequest()
  const declineFriendRequestMutation = useDeclineFriendRequest()
  const cancelFriendRequestMutation = useCancelFriendRequest()

  // Extract data from React Query
  const friends = friendsData?.friends || []
  const pendingRequests = friendsData?.pending_requests || []
  const sentRequests = friendsData?.sent_requests || []

  // Debug logging
  console.log('[CONNECTIONS PAGE] friendsData:', friendsData)
  console.log('[CONNECTIONS PAGE] friends:', friends)
  console.log('[CONNECTIONS PAGE] pendingRequests:', pendingRequests)
  console.log('[CONNECTIONS PAGE] sentRequests:', sentRequests)

  // Loading state
  const loading = loadingFriends

  // Scroll to top on mount
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [])

  // Check if we should return to a quest after adding friends
  useEffect(() => {
    const questId = sessionStorage.getItem('returnToQuest')
    if (questId) {
      setReturnToQuest(questId)
    }
  }, [])

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

  // Handlers
  const handleBackToQuest = () => {
    sessionStorage.removeItem('returnToQuest')
    navigate(`/quests/${returnToQuest}`)
  }

  const handleSendPartnerRequest = (email, message) => {
    sendFriendRequestMutation.mutate(email, {
      onSuccess: () => {
        toast.success("Connection request sent!")
        setShowAddPartnerModal(false)
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

  const handleRequestObserver = async (observerData) => {
    try {
      const response = await api.post('/api/observer-requests', observerData)
      toast.success('Observer request submitted for admin review')
      setShowAddObserverModal(false)
    } catch (error) {
      console.error('Error submitting observer request:', error)
      toast.error(error.response?.data?.error || 'Failed to submit observer request')
    }
  }

  // Loading state
  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-optio-purple"></div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-white">
      <ConnectionsHeader returnToQuest={returnToQuest} onBackToQuest={handleBackToQuest} />

      <NetworkSection
        // Learning Partner props
        learningPartners={friends}
        pendingPartnerRequests={formattedPendingRequests}
        sentPartnerRequests={formattedSentRequests}
        onAcceptPartnerRequest={handleAcceptRequest}
        onDeclinePartnerRequest={handleDeclineRequest}
        onCancelPartnerRequest={handleCancelRequest}
        onConnectPartner={() => setShowAddPartnerModal(true)}
        // Observer props
        onRequestObserver={() => setShowAddObserverModal(true)}
      />

      {/* Modals */}
      <AddLearningPartnerModal
        isOpen={showAddPartnerModal}
        onClose={() => setShowAddPartnerModal(false)}
        onSendRequest={handleSendPartnerRequest}
        isLoading={sendFriendRequestMutation.isPending}
      />

      <AddObserverModal
        isOpen={showAddObserverModal}
        onClose={() => setShowAddObserverModal(false)}
        onSendRequest={handleRequestObserver}
        isLoading={false}
      />
    </div>
  )
}

export default ConnectionsPage
