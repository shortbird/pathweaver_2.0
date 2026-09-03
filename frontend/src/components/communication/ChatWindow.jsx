import React, { useEffect, useState, useRef } from 'react'
import { toast } from 'react-hot-toast'
import { AcademicCapIcon, ChatBubbleLeftRightIcon, ArrowLeftIcon, ExclamationTriangleIcon } from '@heroicons/react/24/outline'
import api from '../../services/api'
import { useAuth } from '../../contexts/AuthContext'
import { useConfirm } from '../../contexts/ConfirmContext'
import {
  useConversationMessages,
  useSendMessage,
  useMarkConversationAsRead,
  useToggleMessageReaction,
  useEditMessage,
  useDeleteMessage
} from '../../hooks/api/useDirectMessages'
import useMessagingRealtime from '../../hooks/api/useMessagingRealtime'
import MessageThread from './MessageThread'
import MessageInput from './MessageInput'

const ChatWindow = ({ conversation, onBack }) => {
  const { user } = useAuth()
  const confirm = useConfirm()
  const [replyTo, setReplyTo] = useState(null)
  // The header photo fails the same ways the list rows do — an expired signed
  // URL, a throttled Google CDN avatar, a deleted object. Fall back to the
  // initial rather than a broken-image glyph. See the Avatar note in
  // ConversationList.
  const [avatarFailed, setAvatarFailed] = useState(false)

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
  const markConversationReadMutation = useMarkConversationAsRead()
  const toggleReactionMutation = useToggleMessageReaction()
  const editMessageMutation = useEditMessage()
  const deleteMessageMutation = useDeleteMessage()

  // Live updates for the open conversation (polling remains as a fallback)
  useMessagingRealtime({ kind: 'dm', id: conversation?.id, enabled: !!conversation?.id })

  // Reset reply state when switching conversations
  useEffect(() => {
    setReplyTo(null)
    setAvatarFailed(false)
  }, [conversation?.id])

  // Mark the thread read when it opens, or when a message arrives while it is
  // open. One request for the whole conversation — this used to fire a PUT per
  // unread message, each one invalidating the conversation list on the way
  // back, so a busy thread refetched the heaviest query on the page twenty
  // times over while the user read it.
  //
  // `markedReadRef` keeps that to one call per (conversation, unread state):
  // the mutation invalidates the message query it is triggered from, so
  // without it the success handler would re-arm this effect indefinitely.
  const markedReadRef = useRef(null)
  useEffect(() => {
    const messages = messagesData?.messages
    if (!conversation?.id || !user?.id || !messages?.length) return
    const unreadCount = messages.filter(
      m => m.recipient_id === user.id && !m.read_at
    ).length
    if (!unreadCount) return
    const token = `${conversation.id}:${unreadCount}`
    if (markedReadRef.current === token) return
    markedReadRef.current = token
    markConversationReadMutation.mutate(conversation.id, {
      // Let a failed attempt be retried; otherwise the badge stays lit until
      // the unread count happens to change.
      onError: () => { markedReadRef.current = null }
    })
  }, [messagesData?.messages, user?.id, conversation?.id])

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

  // Superadmin (Optio Support): hand a member's message off to their school's
  // org admins — it lands in the admins' own Messages and in their email. The
  // member gets an automatic note that the school will follow up, so nothing
  // else is needed here.
  const canForwardToSchool = user?.role === 'superadmin'
  const handleForwardToSchool = async (message) => {
    const ok = await confirm(
      "Forward this message to the sender's school? Their org admins get it in their Optio messages and by email, and the sender is told the school will follow up."
    )
    if (!ok) return
    try {
      const r = await api.post(`/api/messages/${message.id}/forward-to-school`, {})
      const orgName = r.data?.data?.organization?.name
      const emailed = r.data?.data?.emailed_admins || 0
      toast.success(
        emailed
          ? `Forwarded to ${orgName || 'the school'} and emailed ${emailed} admin${emailed === 1 ? '' : 's'}`
          : `Forwarded to ${orgName || 'the school'}`
      )
      refetchMessages()
    } catch (error) {
      toast.error(error?.response?.data?.error || 'Could not forward this message')
    }
  }

  if (!conversation) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center bg-gray-50 p-6 text-center">
        <div className="w-16 h-16 rounded-2xl bg-gradient-primary flex items-center justify-center mb-4">
          <ChatBubbleLeftRightIcon className="w-9 h-9 text-white" />
        </div>
        <h2 className="text-xl font-semibold text-gray-800 mb-1">Your messages</h2>
        <p className="text-gray-500 max-w-xs">
          Pick a conversation from the list, or choose a contact to start a new one.
        </p>
      </div>
    )
  }

  // Render advisor / support / school / friend chat
  const isAdvisor = chatType === 'advisor'
  const isSupport = chatType === 'support' || conversation?.relationshipTypes?.includes('support')
  const isSchool = chatType === 'school' || conversation?.relationshipTypes?.includes('school') ||
    otherUser?.is_school
  const displayName = `${otherUser?.first_name || ''} ${otherUser?.last_name || ''}`.trim() || otherUser?.display_name || 'Unknown'
  const initial = displayName?.charAt(0)?.toUpperCase() || '?'
  // Backend-supplied, and only for superadmin viewers: the school this person
  // belongs to. Optio Support answers members from every org in one inbox, so
  // the header has to say whose member this is.
  const memberOrgName = otherUser?.organization_name
  const OPTIO_LOGO_URL = 'https://auth.optioeducation.com/storage/v1/object/public/site-assets/logos/gradient_fav.svg'

  return (
    <div className="flex-1 flex flex-col min-h-0">
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
          ) : isSchool ? (
            <div className="w-10 h-10 bg-gradient-to-br from-optio-purple to-optio-pink rounded-full flex items-center justify-center">
              <AcademicCapIcon className="w-5 h-5 text-white" />
            </div>
          ) : otherUser?.avatar_url && !avatarFailed ? (
            <img
              src={otherUser.avatar_url}
              alt={displayName}
              width={40}
              height={40}
              decoding="async"
              onError={() => setAvatarFailed(true)}
              className="w-10 h-10 rounded-full object-cover"
            />
          ) : (
            <div className={`w-10 h-10 ${isAdvisor ? 'bg-gradient-to-br from-blue-400 to-optio-purple' : 'bg-gradient-to-br from-green-400 to-emerald-500'} rounded-full flex items-center justify-center text-white font-bold text-lg`}>
              {initial}
            </div>
          )}
          <div>
            <h2 className="text-base font-semibold text-gray-900">{displayName}</h2>
            <p className="text-sm text-gray-500">
              {isAdvisor ? 'Your teacher'
                : isSupport ? 'We usually reply within a day'
                : isSchool ? "Goes to the school's front office"
                : memberOrgName ? `Member of ${memberOrgName}`
                : 'Direct message'}
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
          onForward={canForwardToSchool ? handleForwardToSchool : undefined}
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
