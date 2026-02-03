import React, { useState, useRef, useEffect } from 'react'

/**
 * ChatPanel - AI conversation interface with suggestions
 *
 * Features:
 * - Message list (user + AI)
 * - Input field for refinements
 * - Suggestion chips (clickable quick actions)
 * - Loading state while AI processes
 * - Auto-scroll to newest message
 */
const ChatPanel = ({
  conversation = [],
  suggestions = [],
  onSendMessage,
  onSuggestionClick,
  sending = false
}) => {
  const [message, setMessage] = useState('')
  const messagesEndRef = useRef(null)
  const inputRef = useRef(null)

  // Auto-scroll to bottom when conversation updates
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [conversation])

  // Focus input when not sending
  useEffect(() => {
    if (!sending) {
      inputRef.current?.focus()
    }
  }, [sending])

  // Handle form submit
  const handleSubmit = (e) => {
    e.preventDefault()
    if (message.trim() && !sending) {
      onSendMessage(message.trim())
      setMessage('')
    }
  }

  // Handle suggestion click
  const handleSuggestion = (suggestion) => {
    if (!sending && onSuggestionClick) {
      onSuggestionClick(suggestion)
    }
  }

  // Handle keyboard shortcut
  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit(e)
    }
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-6 py-4 border-b border-gray-200 bg-white">
        <h3 className="font-semibold text-gray-900">AI Assistant</h3>
        <p className="text-sm text-gray-500">
          Describe changes you would like to make to the outline
        </p>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
        {conversation.length === 0 && (
          <div className="text-center text-gray-500 py-8">
            <p>Start by describing the course you want to create.</p>
          </div>
        )}

        {conversation.map((msg) => (
          <MessageBubble key={msg.id} message={msg} />
        ))}

        {/* Typing indicator */}
        {sending && (
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-full bg-gradient-to-r from-optio-purple to-optio-pink flex items-center justify-center">
              <span className="text-white text-xs font-medium">AI</span>
            </div>
            <div className="bg-white border border-gray-200 rounded-lg px-4 py-3 shadow-sm">
              <div className="flex gap-1">
                <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Suggestions */}
      {suggestions.length > 0 && !sending && (
        <div className="px-6 py-3 border-t border-gray-100 bg-gray-50">
          <p className="text-xs text-gray-500 mb-2">Suggestions:</p>
          <div className="flex flex-wrap gap-2">
            {suggestions.map((suggestion, index) => (
              <button
                key={index}
                onClick={() => handleSuggestion(suggestion)}
                disabled={sending}
                className="px-3 py-1.5 text-sm bg-white border border-gray-200 rounded-full hover:border-optio-purple hover:text-optio-purple transition-colors disabled:opacity-50"
              >
                {suggestion}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Input */}
      <form onSubmit={handleSubmit} className="px-6 py-4 border-t border-gray-200 bg-white">
        <div className="flex gap-3">
          <textarea
            ref={inputRef}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type your refinement request..."
            disabled={sending}
            rows={2}
            className="flex-1 px-4 py-2 border border-gray-300 rounded-lg resize-none focus:ring-2 focus:ring-optio-purple focus:border-transparent disabled:bg-gray-50 disabled:text-gray-500"
          />
          <button
            type="submit"
            disabled={sending || !message.trim()}
            className="px-4 py-2 bg-gradient-to-r from-optio-purple to-optio-pink text-white rounded-lg font-medium hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-opacity self-end"
          >
            {sending ? (
              <span className="flex items-center gap-2">
                <span className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full" />
              </span>
            ) : (
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
              </svg>
            )}
          </button>
        </div>
        <p className="text-xs text-gray-400 mt-2">
          Press Enter to send, Shift+Enter for new line
        </p>
      </form>
    </div>
  )
}

/**
 * Individual message bubble component
 */
const MessageBubble = ({ message }) => {
  const isUser = message.role === 'user'

  return (
    <div className={`flex items-start gap-3 ${isUser ? 'flex-row-reverse' : ''}`}>
      {/* Avatar */}
      {isUser ? (
        <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center">
          <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
          </svg>
        </div>
      ) : (
        <div className="w-8 h-8 rounded-full bg-gradient-to-r from-optio-purple to-optio-pink flex items-center justify-center">
          <span className="text-white text-xs font-medium">AI</span>
        </div>
      )}

      {/* Message content */}
      <div
        className={`max-w-[80%] rounded-lg px-4 py-3 ${
          isUser
            ? 'bg-gradient-to-r from-optio-purple to-optio-pink text-white'
            : 'bg-white border border-gray-200 shadow-sm'
        }`}
      >
        <p className={`text-sm whitespace-pre-wrap ${isUser ? 'text-white' : 'text-gray-700'}`}>
          {message.content}
        </p>

        {/* Timestamp */}
        {message.timestamp && (
          <p className={`text-xs mt-1 ${isUser ? 'text-white/70' : 'text-gray-400'}`}>
            {formatTime(message.timestamp)}
          </p>
        )}
      </div>
    </div>
  )
}

/**
 * Format timestamp for display
 */
const formatTime = (timestamp) => {
  try {
    const date = new Date(timestamp)
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  } catch {
    return ''
  }
}

export default ChatPanel
