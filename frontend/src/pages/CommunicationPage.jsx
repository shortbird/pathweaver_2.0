import React, { useState, useEffect, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { useConversations } from '../hooks/api/useDirectMessages'
import { useGroups } from '../hooks/api/useGroupMessages'
import ConversationList from '../components/communication/ConversationList'
import ChatWindow from '../components/communication/ChatWindow'
import GroupChatWindow from '../components/communication/GroupChatWindow'
import CreateGroupModal from '../components/communication/CreateGroupModal'
import PushNotificationBanner from '../components/notifications/PushNotificationBanner'

const CommunicationPage = () => {
  const { user } = useAuth()
  const [searchParams] = useSearchParams()
  const [selectedConversation, setSelectedConversation] = useState(null)
  const [showCreateGroupModal, setShowCreateGroupModal] = useState(false)
  const groupParamHandled = useRef(false)

  // React Query hook for conversations
  const {
    data: conversationsData,
    isLoading: conversationsLoading
  } = useConversations(user?.id, {
    enabled: !!user?.id
  })

  // React Query hook for group conversations
  const {
    data: groupsData,
    isLoading: groupsLoading,
    refetch: refetchGroups
  } = useGroups(user?.id, {
    enabled: !!user?.id
  })

  // Scroll to top when page loads
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [])

  // Deep-link: ?group=<id> opens that group chat (e.g. from a class roster).
  useEffect(() => {
    const groupId = searchParams.get('group')
    if (!groupId || groupParamHandled.current) return
    const groups = groupsData?.groups || (Array.isArray(groupsData) ? groupsData : [])
    const match = groups.find((g) => g.id === groupId)
    if (match) {
      groupParamHandled.current = true
      setSelectedConversation({ ...match, type: 'group' })
    }
  }, [searchParams, groupsData])

  const handleSelectConversation = (conversation) => {
    setSelectedConversation(conversation)
  }

  const handleCreateGroup = () => {
    setShowCreateGroupModal(true)
  }

  const handleGroupCreated = (group) => {
    refetchGroups()
    // Select the newly created group
    setSelectedConversation({
      ...group,
      type: 'group'
    })
  }

  // Determine which chat window to show
  const isGroupChat = selectedConversation?.type === 'group'

  return (
    <div className="h-[calc(100vh-4rem)] bg-gray-50">
      {/* Push notification prompt - fixed at top */}
      <div className="absolute top-16 left-0 right-0 z-10">
        <PushNotificationBanner />
      </div>

      <div className="max-w-[1600px] mx-auto h-full">
        <div className="h-full flex bg-white shadow-lg rounded-lg overflow-hidden">
          {/* Left Sidebar - Conversations List
              Mobile: full width, hidden when a conversation is selected
              Desktop: fixed width, always visible. Kept narrow so the message
              column gets the bulk of the desktop width. */}
          <div className={`w-full md:w-[300px] lg:w-[340px] flex-shrink-0 ${selectedConversation ? 'hidden md:block' : ''}`}>
            <ConversationList
              conversations={conversationsData?.conversations || []}
              selectedConversation={selectedConversation}
              onSelectConversation={handleSelectConversation}
              isLoading={conversationsLoading || groupsLoading}
              groupConversations={groupsData?.groups || []}
              onCreateGroup={handleCreateGroup}
            />
          </div>

          {/* Right Side - Chat Window
              Mobile: full width, hidden when no conversation selected
              Desktop: flex-1, always visible */}
          <div className={`flex-1 flex flex-col ${!selectedConversation ? 'hidden md:flex' : ''}`}>
            {isGroupChat ? (
              <GroupChatWindow
                group={selectedConversation}
                onBack={() => setSelectedConversation(null)}
              />
            ) : (
              <ChatWindow
                conversation={selectedConversation}
                onBack={() => setSelectedConversation(null)}
              />
            )}
          </div>
        </div>
      </div>

      {/* Create Group Modal */}
      <CreateGroupModal
        isOpen={showCreateGroupModal}
        onClose={() => setShowCreateGroupModal(false)}
        onGroupCreated={handleGroupCreated}
      />
    </div>
  )
}

export default CommunicationPage
