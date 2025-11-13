import React, { useState, useEffect } from 'react'
import { Bot, User } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { useConversationMessages, useSendMessage, useMarkAsRead } from '../../hooks/api/useDirectMessages'
import ChatInterface from '../tutor/ChatInterface'
import MessageThread from './MessageThread'
import MessageInput from './MessageInput'
import toast from 'react-hot-toast'

const ChatWindow = ({ conversation, onConversationCreate }) => {
  const { user } = useAuth()
  const [tutorConversationId, setTutorConversationId] = useState(null)

  // Determine chat type
  const chatType = conversation?.type // 'advisor', 'bot', 'friend'
  const otherUser = conversation?.other_user

  // For direct messages (advisor, friend)
  const {
    data: messagesData,
    isLoading: messagesLoading
  } = useConversationMessages(
    chatType !== 'bot' ? conversation?.id : null,
    user?.id,
    {
      enabled: !!conversation && chatType !== 'bot'
    }
  )

  const sendMessageMutation = useSendMessage()
  const markAsReadMutation = useMarkAsRead()

  // Mark messages as read when conversation opens
  useEffect(() => {
    if (messagesData?.messages && messagesData.messages.length > 0 && chatType !== 'bot') {
      const unreadMessages = messagesData.messages.filter(
        m => m.recipient_id === user?.id && !m.read_at
      )

      unreadMessages.forEach(message => {
        markAsReadMutation.mutate(message.id)
      })
    }
  }, [messagesData?.messages, user?.id, chatType])

  const handleSendMessage = async (content) => {
    if (chatType === 'bot') {
      // For bot, the ChatInterface handles sending
      return
    }

    try {
      await sendMessageMutation.mutateAsync({
        targetUserId: otherUser.id,
        content,
        currentUserId: user?.id // Pass current user ID for optimistic update
      })
    } catch (error) {
      // Error handling is done in the mutation
      console.error('Failed to send message:', error)
    }
  }

  if (!conversation) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center bg-gray-50">
        <User className="w-20 h-20 text-gray-300 mb-4" />
        <h2 className="text-xl font-semibold text-gray-700 mb-2">No conversation selected</h2>
        <p className="text-gray-500">
          Select a conversation from the list to start messaging
        </p>
      </div>
    )
  }

  // Render OptioBot chat
  if (chatType === 'bot') {
    return (
      <div className="flex-1 overflow-hidden">
        <ChatInterface
          conversationId={conversation?.tutorConversationId || tutorConversationId}
          currentQuest={null}
          currentTask={null}
          onClose={null}
          hideHeader={false}
          className="h-full border-0 shadow-none rounded-none"
          onConversationCreate={(convId) => {
            setTutorConversationId(convId)
            if (onConversationCreate) {
              onConversationCreate(convId)
            }
          }}
        />
      </div>
    )
  }

  // Render advisor or friend chat
  const isAdvisor = chatType === 'advisor'
  const displayName = otherUser?.display_name || `${otherUser?.first_name} ${otherUser?.last_name}`
  const initial = displayName?.charAt(0)?.toUpperCase() || '?'

  return (
    <div className="flex-1 flex flex-col">
      {/* Header */}
      <div className="border-b border-gray-200 bg-white p-4">
        <div className="flex items-center space-x-3">
          {otherUser?.avatar_url ? (
            <img
              src={otherUser.avatar_url}
              alt={displayName}
              className="w-12 h-12 rounded-full object-cover"
            />
          ) : (
            <div className={`w-12 h-12 ${isAdvisor ? 'bg-gradient-to-br from-blue-400 to-purple-500' : 'bg-gradient-to-br from-green-400 to-emerald-500'} rounded-full flex items-center justify-center text-white font-bold text-lg`}>
              {initial}
            </div>
          )}
          <div>
            <div className="flex items-center space-x-2">
              <h2 className="text-lg font-semibold text-gray-900">{displayName}</h2>
              {isAdvisor && (
                <span className="px-2 py-0.5 bg-blue-100 text-blue-700 text-xs font-medium rounded-full">
                  Advisor
                </span>
              )}
            </div>
            <p className="text-sm text-gray-500">
              {isAdvisor ? 'Your teacher' : 'Friend'}
            </p>
          </div>
        </div>
      </div>

      {/* Messages */}
      <MessageThread
        messages={messagesData?.messages || []}
        otherUser={otherUser}
        isLoading={messagesLoading}
      />

      {/* Input */}
      <MessageInput
        onSendMessage={handleSendMessage}
        disabled={sendMessageMutation.isPending}
        placeholder={`Message ${displayName}...`}
      />
    </div>
  )
}

export default ChatWindow
