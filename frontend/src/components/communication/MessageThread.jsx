import React, { useEffect, useRef, useState } from 'react'
import { UserIcon } from '@heroicons/react/24/outline'
import { useAuth } from '../../contexts/AuthContext'
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

const MessageThread = ({
  messages,
  otherUser,
  isLoading,
  onToggleReaction,
  onReply,
  onEditMessage,
  onDeleteMessage
}) => {
  const { user } = useAuth()
  const messagesEndRef = useRef(null)
  const [editingId, setEditingId] = useState(null)
  const [savingEdit, setSavingEdit] = useState(false)

  const scrollToBottom = () => {
    scrollThreadToBottom(messagesEndRef.current)
  }

  useEffect(() => {
    // Only scroll to bottom if there are messages
    // This prevents unwanted scroll on initial empty load
    if (messages && messages.length > 0) {
      scrollToBottom()
    }
  }, [messages])

  const formatTime = (timestamp) => {
    if (!timestamp) return ''
    const date = new Date(timestamp)
    const now = new Date()
    const isToday = date.toDateString() === now.toDateString()

    if (isToday) {
      return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
    } else {
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
    }
  }

  const handleSaveEdit = async (message, content) => {
    if (!onEditMessage) return
    setSavingEdit(true)
    try {
      await onEditMessage(message, content)
      setEditingId(null)
    } catch (error) {
      // Error toast handled by the mutation
    } finally {
      setSavingEdit(false)
    }
  }

  const handleDelete = (message) => {
    if (!onDeleteMessage) return
    if (window.confirm('Delete this message?')) {
      onDeleteMessage(message)
    }
  }

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center bg-gray-50">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-optio-purple"></div>
      </div>
    )
  }

  if (!messages || messages.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center bg-gray-50 p-8">
        <UserIcon className="w-16 h-16 text-gray-300 mb-4" />
        <p className="text-gray-500 text-center">
          No messages yet. Start the conversation!
        </p>
      </div>
    )
  }

  return (
    <div className="flex-1 overflow-y-auto bg-gray-50 p-4 space-y-3 w-full">
      {messages.map((message) => {
        const isSender = message.sender_id === user?.id
        const isDeleted = !!message.is_deleted
        const isEditing = editingId === message.id

        return (
          <div
            key={message.id}
            className={`group relative flex ${isSender ? 'justify-end' : 'justify-start'}`}
          >
            <div className="relative max-w-[75%] md:max-w-md">
              {/* Hover actions */}
              {!isDeleted && !isEditing && !message.isOptimistic && (
                <MessageActionBar
                  isOwn={isSender}
                  canEdit={isSender}
                  canDelete={isSender}
                  onReact={(emoji) => onToggleReaction?.(message, emoji)}
                  onReply={() => onReply?.(message)}
                  onEdit={() => setEditingId(message.id)}
                  onDelete={() => handleDelete(message)}
                />
              )}

              <div
                className={`${
                  isSender
                    ? 'bg-gradient-primary text-white rounded-l-2xl rounded-tr-2xl'
                    : 'bg-white text-gray-800 rounded-r-2xl rounded-tl-2xl shadow-sm'
                } px-3.5 py-2.5 text-sm ${message.isOptimistic ? 'opacity-70' : ''}`}
              >
                {isDeleted ? (
                  <p className={`italic text-sm ${isSender ? 'text-white/70' : 'text-gray-400'}`}>
                    Message deleted
                  </p>
                ) : isEditing ? (
                  <MessageEditForm
                    initialContent={message.message_content}
                    onSave={(content) => handleSaveEdit(message, content)}
                    onCancel={() => setEditingId(null)}
                    saving={savingEdit}
                  />
                ) : (
                  <>
                    <ReplyQuote replyTo={message.reply_to} light={isSender} />
                    {message.message_content && (
                      <p className="whitespace-pre-wrap break-words">
                        {message.message_content}
                      </p>
                    )}
                    <AttachmentList attachments={message.attachments} light={isSender} />
                  </>
                )}
                <div className="flex items-center justify-between mt-1.5 pt-1.5 border-t border-opacity-20 border-current gap-2 flex-wrap">
                  <span className={`text-xs ${isSender ? 'text-white/80' : 'text-gray-500'}`}>
                    {formatTime(message.created_at)}
                    {message.edited_at && !isDeleted && (
                      <span className={isSender ? 'text-white/60' : 'text-gray-400'}> (edited)</span>
                    )}
                  </span>
                  {isSender && !isDeleted && (
                    <span className="text-xs text-white/80">
                      {message.read_at ? 'Read' : 'Sent'}
                    </span>
                  )}
                </div>
              </div>

              {/* Reactions */}
              {!isDeleted && (
                <ReactionsRow
                  reactions={message.reactions}
                  onToggle={(emoji) => onToggleReaction?.(message, emoji)}
                  align={isSender ? 'end' : 'start'}
                />
              )}
            </div>
          </div>
        )
      })}
      <div ref={messagesEndRef} />
    </div>
  )
}

export default MessageThread
