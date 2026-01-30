import React, { useState, useRef, useEffect } from 'react'
import {
  PaperAirplaneIcon,
  Cog6ToothIcon,
  UsersIcon,
  ArrowLeftIcon
} from '@heroicons/react/24/outline'
import { useAuth } from '../../contexts/AuthContext'
import { useGroupMessages, useSendGroupMessage, useMarkGroupAsRead } from '../../hooks/api/useGroupMessages'
import GroupSettingsModal from './GroupSettingsModal'

const GroupChatWindow = ({ group, onBack }) => {
  const { user } = useAuth()
  const [message, setMessage] = useState('')
  const [showSettings, setShowSettings] = useState(false)
  const messagesEndRef = useRef(null)
  const inputRef = useRef(null)

  const { data: messagesData, isLoading } = useGroupMessages(group?.id, user?.id, {
    enabled: !!group?.id && !!user?.id
  })

  const sendMessageMutation = useSendGroupMessage()
  const markAsReadMutation = useMarkGroupAsRead()

  const messages = messagesData?.messages || []

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [messages])

  // Mark as read when viewing
  useEffect(() => {
    if (group?.id && user?.id) {
      markAsReadMutation.mutate(group.id)
    }
  }, [group?.id, user?.id])

  // Focus input on group change
  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.focus()
    }
  }, [group?.id])

  const handleSend = async (e) => {
    e.preventDefault()

    const content = message.trim()
    if (!content || !group?.id) return

    setMessage('')

    try {
      await sendMessageMutation.mutateAsync({
        groupId: group.id,
        content,
        currentUserId: user?.id
      })
    } catch (error) {
      // Error handled by mutation
      setMessage(content) // Restore message on error
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
            <p className="text-xs text-gray-500">{group.member_count || 0} members</p>
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

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-gray-50">
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
            const showAvatar = index === 0 || messages[index - 1]?.sender_id !== msg.sender_id
            const senderName = msg.sender?.display_name ||
              `${msg.sender?.first_name || ''} ${msg.sender?.last_name || ''}`.trim() || 'Unknown'

            return (
              <div
                key={msg.id}
                className={`flex ${isOwn ? 'justify-end' : 'justify-start'}`}
              >
                <div className={`max-w-[75%] ${isOwn ? 'order-2' : ''}`}>
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

                    {/* Message bubble */}
                    <div
                      className={`px-4 py-2 rounded-2xl ${
                        isOwn
                          ? 'bg-gradient-to-r from-optio-purple to-optio-pink text-white rounded-br-md'
                          : 'bg-white text-gray-900 border border-gray-200 rounded-bl-md'
                      } ${msg.isOptimistic ? 'opacity-70' : ''}`}
                    >
                      <p className="whitespace-pre-wrap break-words">{msg.message_content}</p>
                      <p className={`text-xs mt-1 ${isOwn ? 'text-white/70' : 'text-gray-400'}`}>
                        {formatTime(msg.created_at)}
                        {msg.isOptimistic && ' (Sending...)'}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            )
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Message Input */}
      <form onSubmit={handleSend} className="p-4 border-t border-gray-200 bg-white">
        <div className="flex items-center gap-3">
          <input
            ref={inputRef}
            type="text"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Type a message..."
            maxLength={2000}
            className="flex-1 px-4 py-2 border border-gray-300 rounded-full focus:outline-none focus:ring-2 focus:ring-optio-purple focus:border-transparent"
          />
          <button
            type="submit"
            disabled={!message.trim() || sendMessageMutation.isPending}
            className="p-3 bg-gradient-to-r from-optio-purple to-optio-pink text-white rounded-full hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <PaperAirplaneIcon className="w-5 h-5" />
          </button>
        </div>
      </form>

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
