import React, { useState, useRef, useEffect } from 'react'
import {
  Cog6ToothIcon,
  UsersIcon,
  ArrowLeftIcon,
  MapPinIcon,
  XMarkIcon
} from '@heroicons/react/24/outline'
import { useAuth } from '../../contexts/AuthContext'
import {
  useGroup,
  useGroupMessages,
  useSendGroupMessage,
  useMarkGroupAsRead,
  useToggleGroupMessageReaction,
  useEditGroupMessage,
  useDeleteGroupMessage,
  usePinGroupMessage
} from '../../hooks/api/useGroupMessages'
import useMessagingRealtime from '../../hooks/api/useMessagingRealtime'
import GroupSettingsModal from './GroupSettingsModal'
import MessageInput from './MessageInput'
import {
  ReplyQuote,
  AttachmentList,
  ReactionsRow,
  MessageActionBar,
  MessageEditForm
} from './MessageParts'

const scrollThreadToBottom = (endEl, smooth = true) => {
  const container = endEl?.closest('.overflow-y-auto')
  if (!container) return
  // Element.scrollTo is missing in some environments (jsdom) — fall back.
  if (typeof container.scrollTo === 'function') {
    container.scrollTo({ top: container.scrollHeight, behavior: smooth ? 'smooth' : 'auto' })
  } else {
    container.scrollTop = container.scrollHeight
  }
}

const GroupChatWindow = ({ group, onBack }) => {
  const { user } = useAuth()
  const [showSettings, setShowSettings] = useState(false)
  const [replyTo, setReplyTo] = useState(null)
  const [editingId, setEditingId] = useState(null)
  const [savingEdit, setSavingEdit] = useState(false)
  const messagesEndRef = useRef(null)
  const messageRefs = useRef({})

  const { data: messagesData, isLoading } = useGroupMessages(group?.id, user?.id, {
    enabled: !!group?.id && !!user?.id
  })

  // Group details: members (with role), pinned_message, announcement_only
  const { data: groupData } = useGroup(group?.id, { enabled: !!group?.id })

  const sendMessageMutation = useSendGroupMessage()
  const markAsReadMutation = useMarkGroupAsRead()
  const toggleReactionMutation = useToggleGroupMessageReaction()
  const editMessageMutation = useEditGroupMessage()
  const deleteMessageMutation = useDeleteGroupMessage()
  const pinMessageMutation = usePinGroupMessage()

  // Live updates for the open group (polling remains as a fallback)
  useMessagingRealtime({ kind: 'group', id: group?.id, enabled: !!group?.id })

  const messages = messagesData?.messages || []
  const groupDetails = groupData?.group || groupData || group
  const members = groupDetails?.members || []
  const isAdmin = members.some((m) => (m.user_id || m.user?.id) === user?.id && m.role === 'admin')
  const announcementOnly = !!groupDetails?.announcement_only
  const pinnedMessage = groupDetails?.pinned_message || null
  const canPost = !announcementOnly || isAdmin

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (messagesEndRef.current) {
      scrollThreadToBottom(messagesEndRef.current)
    }
  }, [messages])

  // Mark as read when viewing
  useEffect(() => {
    if (group?.id && user?.id) {
      markAsReadMutation.mutate(group.id)
    }
  }, [group?.id, user?.id])

  // Reset composer state on group change
  useEffect(() => {
    setReplyTo(null)
    setEditingId(null)
  }, [group?.id])

  const senderNameOf = (msg) =>
    `${msg.sender?.first_name || ''} ${msg.sender?.last_name || ''}`.trim() ||
    msg.sender?.display_name || 'Unknown'

  const buildReplyPreview = (msg) => ({
    id: msg.id,
    sender_name: msg.sender_id === user?.id ? 'You' : senderNameOf(msg),
    content: msg.message_content || (msg.attachments?.length ? 'Attachment' : '')
  })

  const handleSend = async (content, { attachments = [], replyToMessageId = null } = {}) => {
    if (!group?.id) return
    const replyToPreview = replyTo || null
    setReplyTo(null)
    try {
      await sendMessageMutation.mutateAsync({
        groupId: group.id,
        content,
        currentUserId: user?.id,
        attachments,
        replyToMessageId,
        replyToPreview
      })
    } catch (error) {
      // Error handled by mutation
    }
  }

  const handleToggleReaction = (msg, emoji) => {
    toggleReactionMutation.mutate({ groupId: group.id, messageId: msg.id, emoji })
  }

  const handleSaveEdit = async (msg, content) => {
    setSavingEdit(true)
    try {
      await editMessageMutation.mutateAsync({ groupId: group.id, messageId: msg.id, content })
      setEditingId(null)
    } catch (error) {
      // Error toast handled by the mutation
    } finally {
      setSavingEdit(false)
    }
  }

  const handleDelete = (msg) => {
    if (window.confirm('Delete this message?')) {
      deleteMessageMutation.mutate({ groupId: group.id, messageId: msg.id })
    }
  }

  const handlePin = (msg) => {
    pinMessageMutation.mutate({ groupId: group.id, messageId: msg.id })
  }

  const handleUnpin = () => {
    pinMessageMutation.mutate({ groupId: group.id, messageId: null })
  }

  const scrollToPinned = () => {
    if (pinnedMessage?.id) {
      (() => {
        const el = messageRefs.current[pinnedMessage.id]
        const container = el?.closest('.overflow-y-auto')
        if (el && container) {
          const offset = el.getBoundingClientRect().top - container.getBoundingClientRect().top
          container.scrollTo({ top: container.scrollTop + offset - 80, behavior: 'smooth' })
        }
      })()
    }
  }

  const formatTime = (timestamp) => {
    if (!timestamp) return ''
    const date = new Date(timestamp)
    const now = new Date()
    const isToday = date.toDateString() === now.toDateString()

    if (isToday) {
      return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
    }

    const diffDays = Math.floor((now - date) / (1000 * 60 * 60 * 24))
    if (diffDays < 7) {
      return date.toLocaleDateString('en-US', { weekday: 'short', hour: 'numeric', minute: '2-digit' })
    }

    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
  }

  if (!group) {
    return (
      <div className="flex-1 flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <UsersIcon className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-700 mb-2">Select a group chat</h3>
          <p className="text-sm text-gray-500">Choose a group from the sidebar to start chatting</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex-1 flex flex-col h-full bg-white">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 bg-white">
        <div className="flex items-center gap-3">
          {onBack && (
            <button
              onClick={onBack}
              className="p-2 text-gray-600 hover:bg-gray-100 rounded-full md:hidden"
            >
              <ArrowLeftIcon className="w-5 h-5" />
            </button>
          )}

          <div className="w-10 h-10 bg-gradient-to-br from-optio-purple to-optio-pink rounded-full flex items-center justify-center">
            <UsersIcon className="w-5 h-5 text-white" />
          </div>

          <div>
            <h2 className="font-semibold text-gray-900">{group.name}</h2>
            <p className="text-xs text-gray-500">
              {groupDetails?.member_count || members.length || group.member_count || 0} members
              {announcementOnly && ' · Announcement-only'}
            </p>
          </div>
        </div>

        <button
          onClick={() => setShowSettings(true)}
          className="p-2 text-gray-600 hover:bg-gray-100 rounded-full transition-colors"
          title="Group Settings"
        >
          <Cog6ToothIcon className="w-5 h-5" />
        </button>
      </div>

      {/* Pinned message banner */}
      {pinnedMessage && (
        <div className="flex items-center gap-2 px-4 py-2 bg-purple-50 border-b border-purple-100">
          <button
            type="button"
            onClick={scrollToPinned}
            className="flex-1 min-w-0 flex items-center gap-2 text-left"
            title="Go to pinned message"
          >
            <MapPinIcon className="w-4 h-4 text-optio-purple flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <span className="text-xs font-semibold text-optio-purple">
                Pinned · {senderNameOf(pinnedMessage)}
              </span>
              <p className="text-xs text-gray-600 truncate">{pinnedMessage.message_content}</p>
            </div>
          </button>
          {isAdmin && (
            <button
              type="button"
              onClick={handleUnpin}
              aria-label="Unpin message"
              title="Unpin"
              className="p-1 text-gray-400 hover:text-gray-600 rounded-full hover:bg-white flex-shrink-0"
            >
              <XMarkIcon className="w-4 h-4" />
            </button>
          )}
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-gray-50">
        {isLoading ? (
          <div className="flex items-center justify-center h-32">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-optio-purple"></div>
          </div>
        ) : messages.length === 0 ? (
          <div className="text-center py-8">
            <UsersIcon className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500">No messages yet. Start the conversation!</p>
          </div>
        ) : (
          messages.map((msg, index) => {
            const isOwn = msg.sender_id === user?.id
            const isDeleted = !!msg.is_deleted
            const isEditing = editingId === msg.id
            const showAvatar = index === 0 || messages[index - 1]?.sender_id !== msg.sender_id
            const senderName = senderNameOf(msg)

            return (
              <div
                key={msg.id}
                ref={(el) => { messageRefs.current[msg.id] = el }}
                className={`group relative flex ${isOwn ? 'justify-end' : 'justify-start'}`}
              >
                <div className={`max-w-[75%] md:max-w-md ${isOwn ? 'order-2' : ''}`}>
                  {/* Sender name (for others' messages) */}
                  {!isOwn && showAvatar && (
                    <p className="text-xs text-gray-500 mb-1 ml-1">{senderName}</p>
                  )}

                  <div className="flex items-end gap-2">
                    {/* Avatar for others' messages */}
                    {!isOwn && showAvatar && (
                      msg.sender?.avatar_url ? (
                        <img
                          src={msg.sender.avatar_url}
                          alt={senderName}
                          className="w-8 h-8 rounded-full object-cover flex-shrink-0"
                        />
                      ) : (
                        <div className="w-8 h-8 bg-purple-100 rounded-full flex items-center justify-center text-optio-purple font-medium text-sm flex-shrink-0">
                          {senderName.charAt(0).toUpperCase()}
                        </div>
                      )
                    )}

                    {/* Spacer for messages without avatar */}
                    {!isOwn && !showAvatar && <div className="w-8 flex-shrink-0" />}

                    {/* Message bubble + hover actions */}
                    <div className="relative">
                      {!isDeleted && !isEditing && !msg.isOptimistic && (
                        <MessageActionBar
                          isOwn={isOwn}
                          canEdit={isOwn}
                          canDelete={isOwn || isAdmin}
                          canPin={isAdmin}
                          onReact={(emoji) => handleToggleReaction(msg, emoji)}
                          onReply={() => setReplyTo(buildReplyPreview(msg))}
                          onEdit={() => setEditingId(msg.id)}
                          onDelete={() => handleDelete(msg)}
                          onPin={() => handlePin(msg)}
                        />
                      )}

                      <div
                        className={`px-3.5 py-2 rounded-2xl text-sm ${
                          isOwn
                            ? 'bg-gradient-to-r from-optio-purple to-optio-pink text-white rounded-br-md'
                            : 'bg-white text-gray-900 border border-gray-200 rounded-bl-md'
                        } ${msg.isOptimistic ? 'opacity-70' : ''}`}
                      >
                        {isDeleted ? (
                          <p className={`italic text-sm ${isOwn ? 'text-white/70' : 'text-gray-400'}`}>
                            Message deleted
                          </p>
                        ) : isEditing ? (
                          <MessageEditForm
                            initialContent={msg.message_content}
                            onSave={(content) => handleSaveEdit(msg, content)}
                            onCancel={() => setEditingId(null)}
                            saving={savingEdit}
                          />
                        ) : (
                          <>
                            <ReplyQuote replyTo={msg.reply_to} light={isOwn} />
                            {msg.message_content && (
                              <p className="whitespace-pre-wrap break-words">{msg.message_content}</p>
                            )}
                            <AttachmentList attachments={msg.attachments} light={isOwn} />
                          </>
                        )}
                        <p className={`text-xs mt-1 ${isOwn ? 'text-white/70' : 'text-gray-400'}`}>
                          {formatTime(msg.created_at)}
                          {msg.edited_at && !isDeleted && ' (edited)'}
                          {msg.isOptimistic && ' (Sending...)'}
                        </p>
                      </div>

                      {/* Reactions */}
                      {!isDeleted && (
                        <ReactionsRow
                          reactions={msg.reactions}
                          onToggle={(emoji) => handleToggleReaction(msg, emoji)}
                          align={isOwn ? 'end' : 'start'}
                        />
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Message Input (or the announcement-only notice) */}
      {canPost ? (
        <MessageInput
          onSendMessage={handleSend}
          disabled={sendMessageMutation.isPending}
          placeholder="Type a message..."
          replyTo={replyTo}
          onCancelReply={() => setReplyTo(null)}
        />
      ) : (
        <div className="p-4 border-t border-gray-200 bg-white">
          <p className="text-sm text-gray-500 text-center py-2.5 bg-gray-50 rounded-lg">
            Only teachers can post in this group
          </p>
        </div>
      )}

      {/* Settings Modal */}
      {showSettings && (
        <GroupSettingsModal
          isOpen={showSettings}
          onClose={() => setShowSettings(false)}
          group={group}
        />
      )}
    </div>
  )
}

export default GroupChatWindow
