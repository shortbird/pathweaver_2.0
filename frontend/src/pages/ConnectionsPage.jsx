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
import QuickActions from '../components/connections/QuickActions'
import NetworkSection from '../components/connections/NetworkSection'
import InviteParentModal from '../components/connections/Modals/InviteParentModal'
import AddLearningPartnerModal from '../components/connections/Modals/AddLearningPartnerModal'

const ConnectionsPage = () => {
  const navigate = useNavigate()
  const { user } = useAuth()

  // State
  const [showInviteParentModal, setShowInviteParentModal] = useState(false)
  const [showAddPartnerModal, setShowAddPartnerModal] = useState(false)
  const [returnToQuest, setReturnToQuest] = useState(null)
  const [parentRequests, setParentRequests] = useState([])
  const [sendingParentInvite, setSendingParentInvite] = useState(false)

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

  // Loading state
  const loading = loadingFriends

  // Check if we should return to a quest after adding friends
  useEffect(() => {
    const questId = sessionStorage.getItem('returnToQuest')
    if (questId) {
      setReturnToQuest(questId)
    }
  }, [])

  // Load parent requests
  useEffect(() => {
    const loadParentRequests = async () => {
      try {
        const response = await api.get('/api/parents/pending-approvals')
        setParentRequests(response.data.pending_approvals || [])
      } catch (error) {
        console.error('Error loading parent requests:', error)
      }
    }

    if (user?.id) {
      loadParentRequests()
    }
  }, [user])

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

  const formattedParentRequests = parentRequests.map((req) => ({
    ...req,
    parent_name: `${req.parent_first_name || ''} ${req.parent_last_name || ''}`.trim(),
    timeAgo: formatTimeAgo(req.requested_at),
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

  const handleSendParentInvite = async (email, message) => {
    try {
      setSendingParentInvite(true)
      await api.post('/api/parents/invite', { email, message })
      toast.success('Parent invitation sent!')
      setShowInviteParentModal(false)
    } catch (error) {
      console.error('Error sending parent invite:', error)
      const errorMessage = error.response?.data?.error || 'Failed to send parent invitation'
      toast.error(errorMessage)
    } finally {
      setSendingParentInvite(false)
    }
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

  // Parent request handlers
  const handleAcceptParentRequest = async (linkId) => {
    try {
      await api.post(`/api/parents/approve-link/${linkId}`, {})
      toast.success('Parent access approved! They can now view your progress.')
      // Reload parent requests
      const response = await api.get('/api/parents/pending-approvals')
      setParentRequests(response.data.pending_approvals || [])
    } catch (error) {
      console.error('Error approving parent:', error)
      const message = error.response?.data?.error || 'Failed to approve parent'
      toast.error(message)
    }
  }

  const handleDeclineParentRequest = async (linkId) => {
    try {
      await api.delete(`/api/parents/decline-link/${linkId}`)
      toast.success('Parent request declined')
      // Reload parent requests
      const response = await api.get('/api/parents/pending-approvals')
      setParentRequests(response.data.pending_approvals || [])
    } catch (error) {
      console.error('Error declining parent:', error)
      toast.error('Failed to decline parent request')
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

      <QuickActions
        onInviteParent={() => setShowInviteParentModal(true)}
        onConnectPartner={() => setShowAddPartnerModal(true)}
      />

      <NetworkSection
        // Family/Parent props
        familyConnections={friends.filter(f => f.role === 'parent' || f.parent_name)} // Basic filtering - can improve later
        pendingParentRequests={formattedParentRequests}
        onAcceptParentRequest={handleAcceptParentRequest}
        onDeclineParentRequest={handleDeclineParentRequest}
        onInviteParent={() => setShowInviteParentModal(true)}
        // Learning Partner props
        learningPartners={friends.filter(f => !f.role || f.role !== 'parent')} // Basic filtering
        pendingPartnerRequests={formattedPendingRequests}
        sentPartnerRequests={formattedSentRequests}
        onAcceptPartnerRequest={handleAcceptRequest}
        onDeclinePartnerRequest={handleDeclineRequest}
        onCancelPartnerRequest={handleCancelRequest}
        onConnectPartner={() => setShowAddPartnerModal(true)}
      />

      {/* Modals */}
      <InviteParentModal
        isOpen={showInviteParentModal}
        onClose={() => setShowInviteParentModal(false)}
        onSendInvite={handleSendParentInvite}
        isLoading={sendingParentInvite}
      />

      <AddLearningPartnerModal
        isOpen={showAddPartnerModal}
        onClose={() => setShowAddPartnerModal(false)}
        onSendRequest={handleSendPartnerRequest}
        isLoading={sendFriendRequestMutation.isPending}
      />
    </div>
  )
}

export default ConnectionsPage
