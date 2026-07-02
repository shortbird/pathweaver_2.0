import React, { useEffect, useState } from 'react'
import { ChatBubbleLeftRightIcon, ArrowLeftIcon, ExclamationTriangleIcon } from '@heroicons/react/24/outline'
import { useAuth } from '../../contexts/AuthContext'
import {
  useConversationMessages,
  useSendMessage,
  useMarkAsRead,
  useToggleMessageReaction,
  useEditMessage,
  useDeleteMessage
} from '../../hooks/api/useDirectMessages'
import useMessagingRealtime from '../../hooks/api/useMessagingRealtime'
import MessageThread from './MessageThread'
import MessageInput from './MessageInput'

const ChatWindow = ({ conversation, onBack }) => {
  const { user } = useAuth()
  const [replyTo, setReplyTo] = useState(null)

  // Determine chat type
  const chatType = conversation?.type // 'advisor', 'friend'
  const otherUser = conversation?.other_user

  // For direct messages (advisor, friend)
  const {
    data: messagesData,
    isLoading: messagesLoading,
    error: messagesError,
    refetch: refetchMessages
  } = useConversationMessages(
    conversation?.id,
    user?.id,
    {
      enabled: !!conversation
    }
  )

  const sendMessageMutation = useSendMessage()
  const markAsReadMutation = useMarkAsRead()
  const toggleReactionMutation = useToggleMessageReaction()
  const editMessageMutation = useEditMessage()
  const deleteMessageMutation = useDeleteMessage()

  // Live updates for the open conversation (polling remains as a fallback)
  useMessagingRealtime({ kind: 'dm', id: conversation?.id, enabled: !!conversation?.id })

  // Reset reply state when switching conversations
  useEffect(() => {
    setReplyTo(null)
  }, [conversation?.id])

  // Mark messages as read when conversation opens
  useEffect(() => {
    if (messagesData?.messages && messagesData.messages.length > 0) {
      const unreadMessages = messagesData.messages.filter(
        m => m.recipient_id === user?.id && !m.read_at
      )

      unreadMessages.forEach(message => {
        markAsReadMutation.mutate(message.id)
      })
    }
  }, [messagesData?.messages, user?.id])

  // Build the small { id, sender_name, content } preview shown while replying
  const buildReplyPreview = (message) => ({
    id: message.id,
    sender_name: message.sender_id === user?.id ? 'You' : displayName,
    content: message.message_content || (message.attachments?.length ? 'Attachment' : '')
  })

  const handleSendMessage = async (content, { attachments = [], replyToMessageId = null } = {}) => {
    const replyToPreview = replyTo || null
    setReplyTo(null)
    try {
      await sendMessageMutation.mutateAsync({
        targetUserId: otherUser.id,
        content,
        currentUserId: user?.id, // Pass current user ID for optimistic update
        attachments,
        replyToMessageId,
        replyToPreview
      })
    } catch (error) {
      // Error handling is done in the mutation
      console.error('Failed to send message:', error)
    }
  }

  const handleToggleReaction = (message, emoji) => {
    toggleReactionMutation.mutate({
      messageId: message.id,
      emoji,
      conversationId: conversation.id
    })
  }

  const handleEditMessage = (message, content) =>
    editMessageMutation.mutateAsync({
      messageId: message.id,
      content,
      conversationId: conversation.id
    })

  const handleDeleteMessage = (message) => {
    deleteMessageMutation.mutate({
      messageId: message.id,
      conversationId: conversation.id
    })
  }

  if (!conversation) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center bg-gray-50 p-6 text-center">
        <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-optio-purple to-optio-pink flex items-center justify-center mb-4">
          <ChatBubbleLeftRightIcon className="w-9 h-9 text-white" />
        </div>
        <h2 className="text-xl font-semibold text-gray-800 mb-1" style={{ fontFamily: 'Poppins' }}>Your messages</h2>
        <p className="text-gray-500 max-w-xs">
          Pick a conversation from the list, or choose a contact to start a new one.
        </p>
      </div>
    )
  }

  // Render advisor / support / friend chat
  const isAdvisor = chatType === 'advisor'
  const isSupport = chatType === 'support' || conversation?.relationshipTypes?.includes('support')
  const displayName = `${otherUser?.first_name || ''} ${otherUser?.last_name || ''}`.trim() || otherUser?.display_name || 'Unknown'
  const initial = displayName?.charAt(0)?.toUpperCase() || '?'
  const OPTIO_LOGO_URL = 'https://auth.optioeducation.com/storage/v1/object/public/site-assets/logos/gradient_fav.svg'

  return (
    <div className="flex-1 flex flex-col">
      {/* Header */}
      <div className="border-b border-gray-200 bg-white px-4 py-2.5">
        <div className="flex items-center space-x-3">
          {/* Mobile back button */}
          {onBack && (
            <button
              onClick={onBack}
              className="p-2 text-gray-600 hover:bg-gray-100 rounded-full md:hidden flex-shrink-0"
            >
              <ArrowLeftIcon className="w-5 h-5" />
            </button>
          )}
          {isSupport ? (
            <img
              src={OPTIO_LOGO_URL}
              alt="Optio Support"
              className="w-10 h-10 rounded-full object-contain bg-white border border-gray-100"
            />
          ) : otherUser?.avatar_url ? (
            <img
              src={otherUser.avatar_url}
              alt={displayName}
              className="w-10 h-10 rounded-full object-cover"
            />
          ) : (
            <div className={`w-10 h-10 ${isAdvisor ? 'bg-gradient-to-br from-blue-400 to-purple-500' : 'bg-gradient-to-br from-green-400 to-emerald-500'} rounded-full flex items-center justify-center text-white font-bold text-lg`}>
              {initial}
            </div>
          )}
          <div>
            <h2 className="text-base font-semibold text-gray-900">{displayName}</h2>
            <p className="text-sm text-gray-500">
              {isAdvisor ? 'Your teacher' : isSupport ? 'We usually reply within a day' : 'Direct message'}
            </p>
          </div>
        </div>
      </div>

      {/* Messages */}
      {messagesError ? (
        <div className="flex-1 flex flex-col items-center justify-center bg-gray-50 p-6 text-center">
          <ExclamationTriangleIcon className="w-12 h-12 text-amber-500 mb-3" />
          <h3 className="text-base font-semibold text-gray-800 mb-1">Couldn't load messages</h3>
          <p className="text-sm text-gray-500 mb-4">Something went wrong. Please try again.</p>
          <button
            onClick={() => refetchMessages()}
            className="px-4 py-2 rounded-lg bg-gradient-primary text-white text-sm font-medium hover:shadow-lg transition-shadow"
          >
            Retry
          </button>
        </div>
      ) : (
        <MessageThread
          messages={messagesData?.messages || []}
          otherUser={otherUser}
          isLoading={messagesLoading}
          onToggleReaction={handleToggleReaction}
          onReply={(message) => setReplyTo(buildReplyPreview(message))}
          onEditMessage={handleEditMessage}
          onDeleteMessage={handleDeleteMessage}
        />
      )}

      {/* Input */}
      <MessageInput
        onSendMessage={handleSendMessage}
        disabled={sendMessageMutation.isPending || !!messagesError}
        placeholder={`Message ${displayName}...`}
        replyTo={replyTo}
        onCancelReply={() => setReplyTo(null)}
      />
    </div>
  )
}

export default ChatWindow
