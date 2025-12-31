import React, { useState, useEffect } from 'react'
import { CalendarIcon, ChatBubbleLeftEllipsisIcon, ChatBubbleLeftRightIcon, UserIcon } from '@heroicons/react/24/outline'
import api from '../../services/api'
import toast from 'react-hot-toast'
import { renderMarkdown } from '../../utils/markdownRenderer'
import { Modal } from '../ui'

const ChatLogsModal = ({ user, onClose }) => {
  const [conversations, setConversations] = useState([])
  const [selectedConversation, setSelectedConversation] = useState(null)
  const [messages, setMessages] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadingConversation, setLoadingConversation] = useState(false)

  useEffect(() => {
    if (user?.id) {
      fetchUserConversations()
    }
  }, [user?.id])

  const fetchUserConversations = async () => {
    try {
      setLoading(true)
      const response = await api.get(`/api/admin/users/${user.id}/conversations`)
      setConversations(response.data.data.conversations || [])
    } catch (error) {
      console.error('Error fetching conversations:', error)
      toast.error('Failed to load user conversations')
    } finally {
      setLoading(false)
    }
  }

  const fetchConversationMessages = async (conversationId) => {
    try {
      setLoadingConversation(true)
      const response = await api.get(`/api/admin/conversations/${conversationId}`)
      setSelectedConversation(response.data.data.conversation)
      setMessages(response.data.data.messages || [])
    } catch (error) {
      console.error('Error fetching conversation:', error)
      toast.error('Failed to load conversation details')
    } finally {
      setLoadingConversation(false)
    }
  }

  const formatDate = (dateString) => {
    if (!dateString) return 'Never'
    const date = new Date(dateString)
    return date.toLocaleString()
  }

  const getModeDisplay = (mode) => {
    const modes = {
      'study_buddy': 'Study Buddy',
      'teacher': 'Teacher',
      'discovery': 'Discovery',
      'review': 'Review',
      'creative': 'Creative'
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

  return (
    <Modal
      isOpen={true}
      onClose={onClose}
      className="max-w-full sm:max-w-4xl mx-2 sm:mx-0"
      header={
        <div className="flex items-center gap-3">
          <ChatBubbleLeftRightIcon className="w-6 h-6 text-white" />
          <div>
            <h2 className="text-2xl font-bold text-white">Chat Logs</h2>
            <p className="text-white/80 text-sm">
              {user.first_name} {user.last_name} ({user.email})
            </p>
          </div>
        </div>
      }
      bodyClassName="p-0"
    >
      <div className="flex flex-col sm:flex-row h-[70vh] overflow-hidden">
          {/* Conversations List */}
          <div className="w-full sm:w-1/3 border-r border-b sm:border-b-0 bg-gray-50 flex flex-col">
            <div className="p-4 border-b">
              <h3 className="font-semibold text-gray-900">Conversations</h3>
              <p className="text-sm text-gray-600">
                {conversations.length} total conversations
              </p>
            </div>

            <div className="flex-1 overflow-y-auto">
              {loading ? (
                <div className="flex items-center justify-center p-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-optio-purple"></div>
                </div>
              ) : conversations.length === 0 ? (
                <div className="text-center p-8">
                  <ChatBubbleLeftRightIcon className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                  <p className="text-gray-500">No conversations found</p>
                </div>
              ) : (
                <div className="space-y-1 p-2">
                  {conversations.map((conv) => (
                    <button
                      key={conv.id}
                      onClick={() => fetchConversationMessages(conv.id)}
                      className={`w-full text-left p-3 rounded-lg hover:bg-white transition-colors min-h-[44px] ${
                        selectedConversation?.id === conv.id ? 'bg-white shadow-sm border border-optio-purple' : ''
                      }`}
                    >
                      <div className="flex justify-between items-start mb-2">
                        <h4 className="font-medium text-sm text-gray-900 truncate">
                          {conv.title || 'Untitled Chat'}
                        </h4>
                        <span className={`text-xs px-2 py-1 rounded-full ${getModeColor(conv.conversation_mode)}`}>
                          {getModeDisplay(conv.conversation_mode)}
                        </span>
                      </div>
                      <div className="text-xs text-gray-500 space-y-1">
                        <div className="flex items-center space-x-1">
                          <CalendarIcon className="w-3 h-3" />
                          <span>{formatDate(conv.created_at)}</span>
                        </div>
                        <div className="flex items-center space-x-1">
                          <ChatBubbleLeftRightIcon className="w-3 h-3" />
                          <span>{conv.message_count || 0} messages</span>
                        </div>
                        {!conv.is_active && (
                          <span className="text-red-500 text-xs">Inactive</span>
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Messages View */}
          <div className="flex-1 flex flex-col">
            {selectedConversation ? (
              <>
                {/* Conversation Header */}
                <div className="p-4 border-b bg-gray-50">
                  <div className="flex justify-between items-start">
                    <div>
                      <h3 className="font-semibold text-gray-900">
                        {selectedConversation.title || 'Untitled Chat'}
                      </h3>
                      <div className="text-xs sm:text-sm text-gray-600 flex flex-col sm:flex-row gap-2 sm:space-x-4 mt-1">
                        <span>Mode: {getModeDisplay(selectedConversation.conversation_mode)}</span>
                        <span>Created: {formatDate(selectedConversation.created_at)}</span>
                        <span>Messages: {messages.length}</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Messages */}
                <div className="flex-1 max-h-[60vh] overflow-y-auto p-4 space-y-4">
                  {loadingConversation ? (
                    <div className="flex items-center justify-center h-64">
                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-optio-purple"></div>
                    </div>
                  ) : messages.length === 0 ? (
                    <div className="text-center py-12">
                      <ChatBubbleLeftRightIcon className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                      <p className="text-gray-500">No messages in this conversation</p>
                    </div>
                  ) : (
                    messages.map((message) => (
                      <div
                        key={message.id}
                        className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
                      >
                        <div
                          className={`max-w-[85%] ${
                            message.role === 'user'
                              ? 'bg-optio-purple text-white rounded-l-2xl rounded-tr-2xl'
                              : 'bg-gray-100 text-gray-800 rounded-r-2xl rounded-tl-2xl'
                          } p-3 shadow-sm`}
                        >
                          <div className="flex items-start space-x-2">
                            {message.role === 'assistant' && (
                              <ChatBubbleLeftEllipsisIcon className="w-4 h-4 text-optio-purple flex-shrink-0 mt-0.5" />
                            )}
                            {message.role === 'user' && (
                              <UserIcon className="w-4 h-4 text-white flex-shrink-0 mt-0.5" />
                            )}
                            <div className="flex-1">
                              <div className="prose prose-sm max-w-none">
                                {message.role === 'assistant' ? renderMarkdown(message.content) : (
                                  <p className="whitespace-pre-wrap">{message.content}</p>
                                )}
                              </div>
                              <div className="text-xs opacity-70 mt-2">
                                {formatDate(message.created_at)}
                                {message.safety_level && message.safety_level !== 'safe' && (
                                  <span className="ml-2 px-1 py-0.5 bg-yellow-200 text-yellow-800 rounded text-xs">
                                    {message.safety_level}
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </>
            ) : (
              <div className="flex-1 flex items-center justify-center">
                <div className="text-center">
                  <ChatBubbleLeftRightIcon className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                  <h3 className="text-lg font-medium text-gray-900 mb-2">Select a Conversation</h3>
                  <p className="text-gray-500">Choose a conversation from the list to view messages</p>
                </div>
              </div>
            )}
          </div>
        </div>
    </Modal>
  )
}

export default ChatLogsModal