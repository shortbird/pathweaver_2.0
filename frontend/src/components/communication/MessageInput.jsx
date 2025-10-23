import React, { useState, useRef } from 'react'
import { Send } from 'lucide-react'

const MessageInput = ({ onSendMessage, disabled = false, placeholder = "Type a message..." }) => {
  const [message, setMessage] = useState('')
  const textareaRef = useRef(null)

  const handleSubmit = (e) => {
    e.preventDefault()
    if (message.trim() && !disabled) {
      onSendMessage(message.trim())
      setMessage('')
      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto'
      }
    }
  }

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit(e)
    }
  }

  const handleChange = (e) => {
    setMessage(e.target.value)
    // Auto-resize textarea
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 120)}px`
    }
  }

  return (
    <form onSubmit={handleSubmit} className="border-t border-gray-200 bg-white p-4">
      <div className="flex items-end space-x-2">
        <div className="flex-1">
          <textarea
            ref={textareaRef}
            value={message}
            onChange={handleChange}
            onKeyPress={handleKeyPress}
            placeholder={placeholder}
            disabled={disabled}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#6d469b] focus:border-transparent disabled:bg-gray-100 disabled:cursor-not-allowed resize-none"
            rows="1"
            maxLength={2000}
            style={{ minHeight: '44px', maxHeight: '120px' }}
          />
          <div className="flex justify-between items-center mt-1 px-1">
            <span className="text-xs text-gray-500">
              {message.length}/2000
            </span>
            <span className="text-xs text-gray-400">
              Press Enter to send, Shift+Enter for new line
            </span>
          </div>
        </div>
        <button
          type="submit"
          disabled={!message.trim() || disabled}
          className="bg-gradient-to-r bg-gradient-primary-reverse text-white p-3 rounded-lg hover:shadow-lg transition-shadow disabled:opacity-50 disabled:cursor-not-allowed flex-shrink-0"
        >
          <Send className="w-5 h-5" />
        </button>
      </div>
    </form>
  )
}

export default MessageInput
