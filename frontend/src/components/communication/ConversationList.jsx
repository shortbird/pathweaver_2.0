import React from 'react'
import { Bot, User, Pin, Search, Users } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { useQuery } from '@tanstack/react-query'
import { parentAPI } from '../../services/api'

const ConversationList = ({ conversations, selectedConversation, onSelectConversation, isLoading }) => {
  const { user } = useAuth()
  const [searchQuery, setSearchQuery] = React.useState('')

  // Fetch linked children if user is a parent
  const { data: linkedChildren = [] } = useQuery({
    queryKey: ['linkedChildren', user?.id],
    queryFn: () => parentAPI.getMyChildren(),
    enabled: user?.role === 'parent',
    select: (response) => response.children || []
  })

  const formatTime = (timestamp) => {
    if (!timestamp) return ''
    const date = new Date(timestamp)
    const now = new Date()
    const diffInHours = Math.floor((now - date) / (1000 * 60 * 60))

    if (diffInHours < 1) return 'Just now'
    if (diffInHours < 24) return `${diffInHours}h ago`
    const diffInDays = Math.floor(diffInHours / 24)
    if (diffInDays < 7) return `${diffInDays}d ago`
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  }

  // Separate pinned conversations (advisor, bot) from friends
  const pinnedConversations = []
  const friendConversations = []

  // Always add OptioBot as first pinned
  pinnedConversations.push({
    id: 'optiobot',
    type: 'bot',
    other_user: {
      id: 'bot',
      display_name: 'OptioBot',
      first_name: 'OptioBot',
      role: 'bot'
    },
    last_message_at: new Date().toISOString(),
    last_message_preview: 'Your AI Learning Companion',
    unread_count: 0
  })

  // Add advisor if user has one
  if (user?.advisor_id) {
    const advisorConvo = conversations?.find(c =>
      c.other_user?.id === user.advisor_id || c.other_user?.role === 'advisor'
    )

    if (advisorConvo) {
      pinnedConversations.push({
        ...advisorConvo,
        type: 'advisor'
      })
    } else {
      // Create placeholder for advisor even if no messages yet
      pinnedConversations.push({
        id: `advisor-${user.advisor_id}`,
        type: 'advisor',
        other_user: {
          id: user.advisor_id,
          display_name: 'Your Advisor',
          first_name: 'Your',
          last_name: 'Advisor',
          role: 'advisor'
        },
        last_message_at: null,
        last_message_preview: 'Start a conversation',
        unread_count: 0
      })
    }
  }

  // Add friend conversations
  conversations?.forEach(convo => {
    if (convo.other_user?.role !== 'advisor' && convo.type !== 'bot') {
      friendConversations.push({
        ...convo,
        type: 'friend'
      })
    }
  })

  // Filter by search query
  const filteredFriends = friendConversations.filter(convo => {
    const name = convo.other_user?.display_name || `${convo.other_user?.first_name} ${convo.other_user?.last_name}`
    return name.toLowerCase().includes(searchQuery.toLowerCase())
  })

  const ConversationItem = ({ conversation }) => {
    const isSelected = selectedConversation?.id === conversation.id
    const isPinned = conversation.type === 'bot' || conversation.type === 'advisor'
    const displayName = conversation.other_user?.display_name ||
      `${conversation.other_user?.first_name} ${conversation.other_user?.last_name}`
    const initial = displayName?.charAt(0)?.toUpperCase() || '?'

    let bgColor = 'bg-purple-100'
    let iconColor = 'text-optio-purple'

    if (conversation.type === 'bot') {
      bgColor = 'bg-purple-100'
      iconColor = 'text-optio-purple'
    } else if (conversation.type === 'advisor') {
      bgColor = 'bg-purple-100'
      iconColor = 'text-optio-purple'
    } else {
      bgColor = 'bg-purple-100'
      iconColor = 'text-optio-purple'
    }

    return (
      <button
        onClick={() => onSelectConversation(conversation)}
        className={`w-full p-3 flex items-start space-x-3 hover:bg-gray-50 transition-colors ${
          isSelected ? 'bg-purple-50 border-l-4 border-optio-purple' : ''
        }`}
      >
        {/* Avatar */}
        <div className="relative flex-shrink-0">
          {conversation.type === 'bot' ? (
            <div className={`w-12 h-12 ${bgColor} rounded-full flex items-center justify-center`}>
              <Bot className={`w-6 h-6 ${iconColor}`} />
            </div>
          ) : conversation.other_user?.avatar_url ? (
            <img
              src={conversation.other_user.avatar_url}
              alt={displayName}
              className="w-12 h-12 rounded-full object-cover"
            />
          ) : (
            <div className={`w-12 h-12 ${bgColor} rounded-full flex items-center justify-center ${iconColor} font-bold`}>
              {initial}
            </div>
          )}
          {isPinned && (
            <div className="absolute -top-1 -right-1 w-5 h-5 bg-blue-500 rounded-full flex items-center justify-center">
              <Pin className="w-3 h-3 text-white" />
            </div>
          )}
          {conversation.unread_count > 0 && (
            <div className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 rounded-full flex items-center justify-center">
              <span className="text-white text-xs font-bold">
                {conversation.unread_count > 9 ? '9+' : conversation.unread_count}
              </span>
            </div>
          )}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0 text-left">
          <div className="flex items-center justify-between mb-1">
            <h3 className={`font-semibold truncate ${conversation.unread_count > 0 ? 'text-gray-900' : 'text-gray-700'}`}>
              {displayName}
            </h3>
            {conversation.last_message_at && (
              <span className="text-xs text-gray-500 flex-shrink-0 ml-2">
                {formatTime(conversation.last_message_at)}
              </span>
            )}
          </div>
          <p className={`text-sm truncate ${conversation.unread_count > 0 ? 'text-gray-700 font-medium' : 'text-gray-500'}`}>
            {conversation.last_message_preview || 'No messages yet'}
          </p>
        </div>
      </button>
    )
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-optio-purple"></div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full bg-white border-r border-gray-200">
      {/* Search */}
      <div className="p-4 border-b border-gray-200">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input
            type="text"
            placeholder="Search conversations..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#6d469b] focus:border-transparent"
          />
        </div>
      </div>

      {/* Conversations List */}
      <div className="flex-1 overflow-y-auto">
        {/* Pinned Section */}
        {pinnedConversations.length > 0 && (
          <div>
            <div className="px-4 py-2 bg-gray-50 border-b border-gray-200">
              <h4 className="text-xs font-semibold text-gray-600 uppercase tracking-wide flex items-center">
                <Pin className="w-3 h-3 mr-1" />
                Pinned
              </h4>
            </div>
            {pinnedConversations.map(convo => (
              <ConversationItem key={convo.id} conversation={convo} />
            ))}
          </div>
        )}

        {/* Children Section (Parents Only) */}
        {user?.role === 'parent' && linkedChildren.length > 0 && (
          <div>
            <div className="px-4 py-2 bg-gray-50 border-b border-gray-200">
              <h4 className="text-xs font-semibold text-gray-600 uppercase tracking-wide flex items-center">
                <Users className="w-3 h-3 mr-1" />
                Children
              </h4>
            </div>
            {linkedChildren.map(child => {
              // Create conversation object for child
              const childConvo = {
                id: `child-${child.student_id}`,
                type: 'child',
                other_user: {
                  id: child.student_id,
                  display_name: child.student_display_name || `${child.student_first_name} ${child.student_last_name}`,
                  first_name: child.student_first_name,
                  last_name: child.student_last_name,
                  avatar_url: child.student_avatar_url,
                  role: 'student'
                },
                last_message_at: null,
                last_message_preview: 'Send a message',
                unread_count: 0
              }
              return <ConversationItem key={childConvo.id} conversation={childConvo} />
            })}
          </div>
        )}

        {/* Friends Section */}
        {filteredFriends.length > 0 && (
          <div>
            <div className="px-4 py-2 bg-gray-50 border-b border-gray-200">
              <h4 className="text-xs font-semibold text-gray-600 uppercase tracking-wide">
                Friends
              </h4>
            </div>
            {filteredFriends.map(convo => (
              <ConversationItem key={convo.id} conversation={convo} />
            ))}
          </div>
        )}

        {/* Empty State */}
        {filteredFriends.length === 0 && pinnedConversations.length === 0 && (
          <div className="flex flex-col items-center justify-center h-64 p-4 text-center">
            <User className="w-16 h-16 text-gray-300 mb-4" />
            <h3 className="text-lg font-medium text-gray-700 mb-2">No conversations yet</h3>
            <p className="text-sm text-gray-500">
              Start chatting with OptioBot or connect with friends to begin
            </p>
          </div>
        )}
      </div>
    </div>
  )
}

export default ConversationList
