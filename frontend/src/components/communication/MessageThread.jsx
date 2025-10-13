import React, { useEffect, useRef } from 'react'
import { User } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'

const MessageThread = ({ messages, otherUser, isLoading }) => {
  const { user } = useAuth()
  const messagesEndRef = useRef(null)

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
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

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center bg-gray-50">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#6d469b]"></div>
      </div>
    )
  }

  if (!messages || messages.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center bg-gray-50 p-8">
        <User className="w-16 h-16 text-gray-300 mb-4" />
        <p className="text-gray-500 text-center">
          No messages yet. Start the conversation!
        </p>
      </div>
    )
  }

  return (
    <div className="flex-1 overflow-y-auto bg-gray-50 p-4 space-y-4">
      {messages.map((message) => {
        const isSender = message.sender_id === user?.id
        const isRecipient = message.recipient_id === user?.id

        return (
          <div
            key={message.id}
            className={`flex ${isSender ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-[70%] ${
                isSender
                  ? 'bg-gradient-to-r from-[#ef597b] to-[#6d469b] text-white rounded-l-2xl rounded-tr-2xl'
                  : 'bg-white text-gray-800 rounded-r-2xl rounded-tl-2xl shadow-sm'
              } p-3`}
            >
              <p className="whitespace-pre-wrap break-words">
                {message.message_content}
              </p>
              <div className="flex items-center justify-between mt-2 pt-2 border-t border-opacity-20 border-current">
                <span className={`text-xs ${isSender ? 'text-white/80' : 'text-gray-500'}`}>
                  {formatTime(message.created_at)}
                </span>
                {isSender && (
                  <span className="text-xs text-white/80">
                    {message.read_at ? 'Read' : 'Sent'}
                  </span>
                )}
              </div>
            </div>
          </div>
        )
      })}
      <div ref={messagesEndRef} />
    </div>
  )
}

export default MessageThread
