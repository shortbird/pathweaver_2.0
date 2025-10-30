import React, { useState, useEffect } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { useConversations } from '../hooks/api/useDirectMessages'
import ConversationList from '../components/communication/ConversationList'
import ChatWindow from '../components/communication/ChatWindow'
import api from '../services/api'

const CommunicationPage = () => {
  const { user } = useAuth()
  const [selectedConversation, setSelectedConversation] = useState(null)
  const [mostRecentTutorConv, setMostRecentTutorConv] = useState(null)

  // React Query hook for conversations
  const {
    data: conversationsData,
    isLoading: conversationsLoading
  } = useConversations(user?.id, {
    enabled: !!user?.id
  })

  // Fetch user's most recent tutor conversation
  useEffect(() => {
    const fetchMostRecentTutorConversation = async () => {
      if (!user?.id) return

      try {
        const response = await api.get('/api/tutor/conversations', {
          params: { limit: 1, offset: 0 }
        })

        console.log('📝 CommunicationPage: API response:', response.data)

        // Backend wraps response in {data: {...}, success: true}
        const conversations = response.data?.data?.conversations || response.data?.conversations
        console.log('📝 CommunicationPage: Conversations array:', conversations)

        if (conversations && conversations.length > 0) {
          const convId = conversations[0].id
          console.log('📝 CommunicationPage: Setting most recent conversation ID:', convId)
          setMostRecentTutorConv(convId)
        } else {
          console.log('📝 CommunicationPage: No conversations found')
        }
      } catch (error) {
        console.error('Failed to fetch most recent tutor conversation:', error)
      }
    }

    fetchMostRecentTutorConversation()
  }, [user?.id])

  // Auto-select OptioBot on initial load with most recent conversation
  useEffect(() => {
    if (!selectedConversation) {
      // Select OptioBot by default
      console.log('📝 CommunicationPage: Creating initial OptioBot selection, convId:', mostRecentTutorConv)
      setSelectedConversation({
        id: 'optiobot',
        type: 'bot',
        other_user: {
          id: 'bot',
          display_name: 'OptioBot',
          first_name: 'OptioBot',
          role: 'bot'
        },
        tutorConversationId: mostRecentTutorConv, // Will be null initially, then update
        last_message_at: new Date().toISOString(),
        last_message_preview: 'Your AI Learning Companion',
        unread_count: 0
      })
    } else if (selectedConversation && selectedConversation.type === 'bot' && mostRecentTutorConv && !selectedConversation.tutorConversationId) {
      // Update OptioBot with conversation ID once it's loaded
      console.log('📝 CommunicationPage: Updating OptioBot with conversation ID:', mostRecentTutorConv)
      setSelectedConversation(prev => ({
        ...prev,
        tutorConversationId: mostRecentTutorConv
      }))
    }
  }, [selectedConversation, mostRecentTutorConv])

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
