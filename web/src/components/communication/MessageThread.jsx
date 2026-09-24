import React, { useRef, useState } from 'react'
import { UserIcon } from '@heroicons/react/24/outline'
import { useAuth } from '../../contexts/AuthContext'
import { ReactionsRow, MessageActionBar, MessageRow } from './MessageParts'
import MessageBubble from './MessageBubble'
import useThreadScroll from './useThreadScroll'
import { toast } from 'react-hot-toast'
import { useConfirm } from '../../contexts/ConfirmContext'
import { REPORT_REASONS, reportContent } from '../../services/friendsAPI'

const MessageThread = ({
  messages,
  otherUser,
  isLoading,
  onToggleReaction,
  onReply,
  onEditMessage,
  onDeleteMessage,
  // Which thread this is; a change lands the view at the bottom of the new one.
  threadKey,
  // Direct messages only (Friends phase 3): a report the moderation queue
  // can act on. Group chats do not pass it.
  canReport = false,
  // Set only for superadmin support threads: forward a received message to the
  // sender's school inbox.
  onForward,
  // Superadmin only: mail a copy of a message to the viewer's own inbox, so it
  // sits somewhere that nags until it is answered.
  onEmailToSelf
}) => {
  const confirm = useConfirm()
  const { user } = useAuth()
  const scrollerRef = useRef(null)
  const [editingId, setEditingId] = useState(null)
  const [reportingId, setReportingId] = useState(null)
  const [savingEdit, setSavingEdit] = useState(false)

  useThreadScroll(scrollerRef, messages, threadKey ?? otherUser?.id, user?.id)

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

  const handleDelete = async (message) => {
    if (!onDeleteMessage) return
    if (await confirm('Delete this message?')) {
      onDeleteMessage(message)
    }
  }

  const sendReport = async (message, reason) => {
    setReportingId(null)
    try {
      await reportContent('message', message.id, reason)
      toast.success('Thanks. We received your report and will review it.')
    } catch (err) {
      toast.error(err.response?.data?.error || 'Could not send that report.')
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
    <div ref={scrollerRef} className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden bg-gray-50 p-4 w-full">
      {/* Pinned to the bottom, so a short thread sits by the composer and,
          when a row makes room for its action bar, the room opens upward
          into the empty space above rather than pushing the hovered bubble
          down. min-h-full on a wrapper, not justify-end on the scroller:
          that way a tall thread never has unreachable overflow at the top. */}
      <div className="min-h-full flex flex-col justify-end space-y-3">
      {messages.map((message, i) => {
        const isSender = message.sender_id === user?.id
        const isDeleted = !!message.is_deleted
        const isEditing = editingId === message.id

        return (
          <MessageRow key={message.id} isOwn={isSender}>
            {(open, hold) => (
            <div className="relative max-w-[75%] md:max-w-md">
              {/* Hover actions */}
              {!isDeleted && !isEditing && !message.isOptimistic && (
                <MessageActionBar
                  open={open}
                  onHold={hold}
                  isOwn={isSender}
                  canEdit={isSender}
                  canDelete={isSender}
                  canForward={!!onForward && !isSender}
                  canEmailToSelf={!!onEmailToSelf}
                  canReport={canReport && !isSender}
                  onReact={(emoji) => onToggleReaction?.(message, emoji)}
                  onReply={() => onReply?.(message)}
                  onEdit={() => setEditingId(message.id)}
                  onDelete={() => handleDelete(message)}
                  onForward={() => onForward?.(message)}
                  onEmailToSelf={() => onEmailToSelf?.(message)}
                  onReport={() => setReportingId(message.id)}
                />
              )}
              {reportingId === message.id && (
                <div className="mb-1 rounded-lg border border-gray-200 bg-white shadow-md py-1 text-sm">
                  <p className="px-3 py-1.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Why are you reporting this?</p>
                  {REPORT_REASONS.map((r) => (
                    <button
                      key={r.value}
                      type="button"
                      onClick={() => sendReport(message, r.value)}
                      className="w-full text-left px-3 py-2 hover:bg-gray-50"
                    >
                      {r.label}
                    </button>
                  ))}
                  <button type="button" onClick={() => setReportingId(null)} className="w-full text-left px-3 py-2 text-gray-500 hover:bg-gray-50">
                    Cancel
                  </button>
                </div>
              )}

              <MessageBubble
                message={message}
                isOwn={isSender}
                isEditing={isEditing}
                onSaveEdit={(content) => handleSaveEdit(message, content)}
                onCancelEdit={() => setEditingId(null)}
                savingEdit={savingEdit}
                // The read time, so the receipt says when (9b46c748).
                seen={isSender && i === messages.length - 1 && message.read_at ? message.read_at : false}
              />

              {/* Reactions */}
              {!isDeleted && (
                <ReactionsRow
                  reactions={message.reactions}
                  onToggle={(emoji) => onToggleReaction?.(message, emoji)}
                  align={isSender ? 'end' : 'start'}
                />
              )}
            </div>
            )}
          </MessageRow>
        )
      })}
      </div>
    </div>
  )
}

export default MessageThread
