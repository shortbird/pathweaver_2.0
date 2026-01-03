import React, { useState, useEffect } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { useAIAccess } from '../contexts/AIAccessContext'
import { useConversations } from '../hooks/api/useDirectMessages'
import ConversationList from '../components/communication/ConversationList'
import ChatWindow from '../components/communication/ChatWindow'
import api from '../services/api'

const CommunicationPage = () => {
  const { user } = useAuth()
  const { canUseChatbot, loading: aiAccessLoading } = useAIAccess()
  const [selectedConversation, setSelectedConversation] = useState(null)

  // React Query hook for conversations
  const {
    data: conversationsData,
    isLoading: conversationsLoading
  } = useConversations(user?.id, {
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

  return (
    <div className="h-[calc(100vh-4rem)] bg-gray-50">
      <div className="max-w-7xl mx-auto h-full">
        <div className="h-full flex bg-white shadow-lg rounded-lg overflow-hidden">
          {/* Left Sidebar - Conversations List (30%) */}
          <div className="w-full md:w-[350px] lg:w-[400px] flex-shrink-0">
            <ConversationList
              conversations={conversationsData?.conversations || []}
              selectedConversation={selectedConversation}
              onSelectConversation={handleSelectConversation}
              isLoading={conversationsLoading}
            />
          </div>

          {/* Right Side - Chat Window (70%) */}
          <div className="flex-1 flex flex-col">
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
          </div>
        </div>
      </div>
    </div>
  )
}

export default CommunicationPage
