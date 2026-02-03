import React, { useState, useEffect } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { useAIAccess } from '../contexts/AIAccessContext'
import { useConversations } from '../hooks/api/useDirectMessages'
import { useGroups } from '../hooks/api/useGroupMessages'
import ConversationList from '../components/communication/ConversationList'
import ChatWindow from '../components/communication/ChatWindow'
import GroupChatWindow from '../components/communication/GroupChatWindow'
import CreateGroupModal from '../components/communication/CreateGroupModal'
import PushNotificationBanner from '../components/notifications/PushNotificationBanner'

const CommunicationPage = () => {
  const { user } = useAuth()
  const { canUseChatbot, loading: aiAccessLoading } = useAIAccess()
  const [selectedConversation, setSelectedConversation] = useState(null)
  const [showCreateGroupModal, setShowCreateGroupModal] = useState(false)

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

  // Auto-select OptioBot on initial load with empty chat (only if chatbot is enabled)
  useEffect(() => {
    if (!selectedConversation && user?.id && !aiAccessLoading && canUseChatbot) {
      // Select OptioBot by default with a fresh, empty chat
      setSelectedConversation({
        id: 'optiobot',
        type: 'bot',
        other_user: {
          id: 'bot',
          display_name: 'OptioBot',
          first_name: 'OptioBot',
          role: 'bot'
        },
        tutorConversationId: null, // Always start with empty chat
        last_message_at: new Date().toISOString(),
        last_message_preview: 'Your AI Learning Companion',
        unread_count: 0
      })
    }
  }, [selectedConversation, user?.id, aiAccessLoading, canUseChatbot])

  // Scroll to top when page loads
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [])

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

      <div className="max-w-7xl mx-auto h-full">
        <div className="h-full flex bg-white shadow-lg rounded-lg overflow-hidden">
          {/* Left Sidebar - Conversations List (30%) */}
          <div className="w-full md:w-[350px] lg:w-[400px] flex-shrink-0">
            <ConversationList
              conversations={conversationsData?.conversations || []}
              selectedConversation={selectedConversation}
              onSelectConversation={handleSelectConversation}
              isLoading={conversationsLoading || groupsLoading}
              groupConversations={groupsData?.groups || []}
              onCreateGroup={handleCreateGroup}
            />
          </div>

          {/* Right Side - Chat Window (70%) */}
          <div className="flex-1 flex flex-col">
            {isGroupChat ? (
              <GroupChatWindow
                group={selectedConversation}
                onBack={() => setSelectedConversation(null)}
              />
            ) : (
              <ChatWindow
                conversation={selectedConversation}
                onConversationCreate={(convId) => {
                  // Update selected conversation with new conversation ID
                  if (selectedConversation?.type === 'bot') {
                    setSelectedConversation(prev => ({
                      ...prev,
                      tutorConversationId: convId
                    }))
                  }
                }}
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
