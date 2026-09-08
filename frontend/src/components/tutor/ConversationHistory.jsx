import React, { useState, useEffect } from 'react'
import { ChatBubbleLeftRightIcon, CalendarIcon, ClockIcon, ArrowLeftIcon } from '@heroicons/react/24/outline'
import api from '../../services/api'
import toast from 'react-hot-toast'
import logger from '../../utils/logger'

const ConversationHistory = ({ onSelectConversation, onBack, onCreateNew }) => {
  const [conversations, setConversations] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchUserConversations()
  }, [])

  const fetchUserConversations = async () => {
    try {
      setLoading(true)
      const response = await api.get('/api/tutor/conversations')
      // Backend wraps response in {data: {...}, success: true}
      const data = response.data?.data || response.data
      setConversations(data.conversations || [])
      logger.debug('ConversationHistory: Fetched conversations:', data.conversations?.length || 0)
    } catch (error) {
      logger.error('ConversationHistory: Error fetching conversations:', error)
      logger.error('ConversationHistory: Error response:', error.response)
      toast.error('Failed to load conversation history')
    } finally {
      setLoading(false)
    }
  }

  const formatDate = (dateString) => {
    if (!dateString) return 'Never'
    const date = new Date(dateString)
    const now = new Date()
    const diffInHours = (now - date) / (1000 * 60 * 60)

    if (diffInHours < 1) return 'Just now'
    if (diffInHours < 24) return `${Math.floor(diffInHours)} hours ago`
    if (diffInHours < 48) return 'Yesterday'
    return date.toLocaleDateString()
  }

  const getModeDisplay = (mode) => {
    const modes = {
      'study_buddy': 'Study Buddy',
      'teacher': 'Teacher',
      'discovery': 'Explorer',
      'review': 'Reviewer',
      'creative': 'Creator'
    }
    return modes[mode] || mode
  }

  const getModeColor = (mode) => {
    const colors = {
      'study_buddy': 'bg-blue-100 text-blue-700',
      'teacher': 'bg-green-100 text-green-700',
      'discovery': 'bg-purple-100 text-purple-700',
      'review': 'bg-orange-100 text-orange-700',
      'creative': 'bg-pink-100 text-pink-700'
    }
    return colors[mode] || 'bg-gray-100 text-gray-700'
  }

  const getModeIcon = (mode) => {
    const icons = {
      'study_buddy': '🤝',
      'teacher': '🎓',
      'discovery': '🔍',
      'review': '📝',
      'creative': '🎨'
    }
    return icons[mode] || '💬'
  }

  return (
    <div className="flex flex-col h-full bg-white">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-gray-200 bg-gradient-primary text-white">
        <div className="flex items-center space-x-3">
          <button
            onClick={onBack}
            className="p-2 hover:bg-white/10 rounded-lg transition-colors"
          >
            <ArrowLeftIcon className="w-5 h-5" />
          </button>
          <div>
            <h2 className="text-xl font-bold">Chat History</h2>
            <p className="text-pink-100 text-sm">
              {conversations.length} conversations
            </p>
          </div>
        </div>
        <button
          onClick={onCreateNew}
          className="px-4 py-2 bg-white/20 hover:bg-white/30 rounded-lg transition-colors text-sm font-medium"
        >
          New Chat
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center p-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-optio-purple"></div>
          </div>
        ) : conversations.length === 0 ? (
          <div className="text-center p-8">
            <ChatBubbleLeftRightIcon className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">No conversations yet</h3>
            <p className="text-gray-500 mb-4">
              Start your first chat to get help with your studies!
            </p>
            <button
              onClick={onCreateNew}
              className="px-6 py-2 bg-gradient-primary text-white rounded-lg hover:shadow-md transition-shadow"
            >
              Start New Chat
            </button>
          </div>
        ) : (
          <div className="p-4 space-y-3">
            {conversations.map((conv) => (
              <button
                key={conv.id}
                onClick={() => onSelectConversation(conv.id)}
                className="w-full text-left p-4 rounded-xl border border-gray-200 hover:border-optio-purple hover:shadow-md transition-all duration-200 bg-white"
              >
                <div className="flex justify-between items-start mb-3">
                  <div className="flex items-center space-x-2">
                    <span className="text-lg">{getModeIcon(conv.conversation_mode)}</span>
                    <h3 className="font-semibold text-gray-900 truncate">
                      {conv.title || 'Untitled Chat'}
                    </h3>
                  </div>
                  <span className={`text-xs px-2 py-1 rounded-full font-medium ${getModeColor(conv.conversation_mode)}`}>
                    {getModeDisplay(conv.conversation_mode)}
                  </span>
                </div>

                {/* Context info if available */}
                {conv.context && (
                  <p className="text-sm text-gray-600 mb-2 truncate">
                    {conv.context}
                  </p>
                )}

                <div className="flex items-center justify-between text-xs text-gray-500">
                  <div className="flex items-center space-x-4">
                    <div className="flex items-center space-x-1">
                      <ChatBubbleLeftRightIcon className="w-3 h-3" />
                      <span>{conv.message_count || 0} messages</span>
                    </div>
                    <div className="flex items-center space-x-1">
                      <ClockIcon className="w-3 h-3" />
                      <span>{formatDate(conv.updated_at || conv.created_at)}</span>
                    </div>
                  </div>
                  {!conv.is_active && (
                    <span className="text-red-500 font-medium">Archived</span>
                  )}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

export default ConversationHistory