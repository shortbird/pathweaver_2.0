import React, { useMemo } from 'react'
import { AcademicCapIcon, ChatBubbleLeftEllipsisIcon, EyeIcon, MagnifyingGlassIcon, MapPinIcon, UserIcon, UsersIcon, PlusIcon } from '@heroicons/react/24/outline'
import { useAuth } from '../../contexts/AuthContext'
import { useAIAccess } from '../../contexts/AIAccessContext'
import { useQuery } from '@tanstack/react-query'
import { parentAPI, friendsAPI, observerAPI } from '../../services/api'
import { useMessagingContacts } from '../../hooks/api/useDirectMessages'
import {
  mergeContacts,
  sortContacts,
  filterContactsBySearch,
  contactToConversation,
  getPrimaryRelationship,
  RELATIONSHIP_CONFIG
} from '../../utils/contactUtils'

const ConversationList = ({
  conversations,
  selectedConversation,
  onSelectConversation,
  isLoading,
  onCreateGroup,
  groupConversations = []
}) => {
  const { user } = useAuth()
  const { canUseChatbot } = useAIAccess()
  const [searchQuery, setSearchQuery] = React.useState('')

  // Get effective role (resolves org_managed to org_role)
  // Platform users: organization_id = NULL, use role directly
  // Org users: organization_id set, role = 'org_managed', actual role in org_role
  const effectiveRole = user?.role === 'org_managed' && user?.org_role ? user.org_role : user?.role

  // Check if user can create groups (advisor, org_admin, superadmin)
  const canCreateGroups = ['advisor', 'org_admin', 'superadmin'].includes(effectiveRole)

  // Fetch linked children if user is a parent (with optimized caching)
  const { data: linkedChildren = [] } = useQuery({
    queryKey: ['linkedChildren', user?.id],
    queryFn: async () => {
      const response = await parentAPI.getMyChildren()
      return response
    },
    enabled: user?.role === 'parent',
    select: (response) => response.data?.children || [],
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    refetchOnWindowFocus: false,
    refetchOnMount: false
  })

  // Fetch friends (learning partners) - available to all users
  const { data: friendsData } = useQuery({
    queryKey: ['friends', user?.id],
    queryFn: async () => {
      const response = await friendsAPI.getFriends()
      return response.data
    },
    enabled: !!user?.id,
    staleTime: 2 * 60 * 1000,
    gcTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false
  })

  // Fetch observers - available to all users
  const { data: observersData } = useQuery({
    queryKey: ['observers', user?.id],
    queryFn: async () => {
      const response = await observerAPI.getMyObservers()
      return response.data
    },
    enabled: !!user?.id,
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    refetchOnWindowFocus: false
  })

  // Fetch messaging contacts (advisors/students) - available to all users
  const { data: contactsData } = useMessagingContacts(user?.id, {
    enabled: !!user?.id
  })

  const learningPartners = friendsData?.friends || []
  const observers = observersData?.observers || []
  const messagingContacts = contactsData?.contacts || []

  // Build pinned conversations (OptioBot + primary advisor)
  const pinnedConversations = useMemo(() => {
    const pinned = []

    // Only add OptioBot if AI chatbot is enabled
    if (canUseChatbot) {
      pinned.push({
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
    }

    // Add advisor if user has one
    if (user?.advisor_id) {
      const advisorConvo = conversations?.find(c =>
        c.other_user?.id === user.advisor_id || c.other_user?.role === 'advisor'
      )

      if (advisorConvo) {
        pinned.push({
          ...advisorConvo,
          type: 'advisor'
        })
      } else {
        pinned.push({
          id: user.advisor_id,
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

    return pinned
  }, [canUseChatbot, user?.advisor_id, conversations])

  // Get IDs that are already pinned to exclude from contacts list
  const pinnedIds = useMemo(() => {
    return new Set(pinnedConversations
      .filter(p => p.type !== 'bot')
      .map(p => p.other_user?.id)
    )
  }, [pinnedConversations])

  // Merge and deduplicate all contacts
  const unifiedContacts = useMemo(() => {
    // Merge all contact sources
    const merged = mergeContacts({
      friends: learningPartners,
      observers: observers,
      children: user?.role === 'parent' ? linkedChildren : [],
      advisorContacts: messagingContacts,
      conversations: conversations?.filter(c =>
        c.other_user?.role !== 'advisor' && c.type !== 'bot'
      ) || []
    })

    // Filter out pinned contacts and bots
    const filtered = merged.filter(contact =>
      !pinnedIds.has(contact.id) && contact.id !== 'bot'
    )

    // Sort by unread > recent message > alphabetical
    return sortContacts(filtered)
  }, [learningPartners, observers, linkedChildren, messagingContacts, conversations, pinnedIds, user?.role])

  // Filter by search query
  const filteredContacts = useMemo(() => {
    const filtered = filterContactsBySearch(unifiedContacts, searchQuery)
    return filtered.map(contactToConversation)
  }, [unifiedContacts, searchQuery])

  // Filter groups by search
  const filteredGroups = useMemo(() => {
    if (!searchQuery.trim()) return groupConversations
    const lowerQuery = searchQuery.toLowerCase().trim()
    return groupConversations.filter(group =>
      group.name?.toLowerCase().includes(lowerQuery)
    )
  }, [groupConversations, searchQuery])

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

  // Get relationship icon component
  const getRelationshipIcon = (type) => {
    switch (type) {
      case 'advisor':
        return <AcademicCapIcon className="w-3 h-3" />
      case 'student':
        return <UserIcon className="w-3 h-3" />
      case 'child':
        return <UsersIcon className="w-3 h-3" />
      case 'observer':
        return <EyeIcon className="w-3 h-3" />
      default:
        return <UsersIcon className="w-3 h-3" />
    }
  }

  const ConversationItem = ({ conversation }) => {
    const isSelected = selectedConversation?.id === conversation.id
    const isPinned = conversation.type === 'bot' || conversation.type === 'advisor'
    const displayName = conversation.other_user?.display_name ||
      `${conversation.other_user?.first_name} ${conversation.other_user?.last_name}`
    const initial = displayName?.charAt(0)?.toUpperCase() || '?'

    // Get primary relationship for badge
    const primaryRelationship = conversation.primaryRelationship ||
      getPrimaryRelationship(conversation.relationshipTypes || [conversation.type])
    const relationshipConfig = RELATIONSHIP_CONFIG[primaryRelationship]

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
            <div className="w-12 h-12 bg-purple-100 rounded-full flex items-center justify-center">
              <ChatBubbleLeftEllipsisIcon className="w-6 h-6 text-optio-purple" />
            </div>
          ) : conversation.other_user?.avatar_url ? (
            <img
              src={conversation.other_user.avatar_url}
              alt={displayName}
              className="w-12 h-12 rounded-full object-cover"
            />
          ) : (
            <div className="w-12 h-12 bg-purple-100 rounded-full flex items-center justify-center text-optio-purple font-bold">
              {initial}
            </div>
          )}
          {isPinned && (
            <div className="absolute -top-1 -right-1 w-5 h-5 bg-blue-500 rounded-full flex items-center justify-center">
              <MapPinIcon className="w-3 h-3 text-white" />
            </div>
          )}
          {conversation.unread_count > 0 && !isPinned && (
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
            <div className="flex items-center gap-2 min-w-0">
              <h3 className={`font-semibold truncate ${conversation.unread_count > 0 ? 'text-gray-900' : 'text-gray-700'}`}>
                {displayName}
              </h3>
              {/* Relationship badge - only show for non-pinned, non-bot contacts */}
              {!isPinned && conversation.type !== 'bot' && relationshipConfig && (
                <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 text-xs rounded-full ${relationshipConfig.bgColor} ${relationshipConfig.textColor} border ${relationshipConfig.borderColor}`}>
                  {getRelationshipIcon(primaryRelationship)}
                  <span className="hidden sm:inline">{relationshipConfig.label}</span>
                </span>
              )}
            </div>
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

  const GroupConversationItem = ({ group }) => {
    const isSelected = selectedConversation?.id === group.id && selectedConversation?.type === 'group'

    return (
      <button
        onClick={() => onSelectConversation({ ...group, type: 'group' })}
        className={`w-full p-3 flex items-start space-x-3 hover:bg-gray-50 transition-colors ${
          isSelected ? 'bg-purple-50 border-l-4 border-optio-purple' : ''
        }`}
      >
        {/* Group Avatar */}
        <div className="relative flex-shrink-0">
          <div className="w-12 h-12 bg-gradient-to-br from-optio-purple to-optio-pink rounded-full flex items-center justify-center">
            <UsersIcon className="w-6 h-6 text-white" />
          </div>
          {group.unread_count > 0 && (
            <div className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 rounded-full flex items-center justify-center">
              <span className="text-white text-xs font-bold">
                {group.unread_count > 9 ? '9+' : group.unread_count}
              </span>
            </div>
          )}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0 text-left">
          <div className="flex items-center justify-between mb-1">
            <h3 className={`font-semibold truncate ${group.unread_count > 0 ? 'text-gray-900' : 'text-gray-700'}`}>
              {group.name}
            </h3>
            {group.last_message_at && (
              <span className="text-xs text-gray-500 flex-shrink-0 ml-2">
                {formatTime(group.last_message_at)}
              </span>
            )}
          </div>
          <p className={`text-sm truncate ${group.unread_count > 0 ? 'text-gray-700 font-medium' : 'text-gray-500'}`}>
            {group.last_message_preview || 'No messages yet'}
          </p>
          <p className="text-xs text-gray-400 mt-0.5">
            {group.member_count || 0} members
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

  const hasContacts = filteredContacts.length > 0 || pinnedConversations.length > 0 || filteredGroups.length > 0

  return (
    <div className="flex flex-col h-full bg-white border-r border-gray-200">
      {/* Search */}
      <div className="p-4 border-b border-gray-200">
        <div className="relative">
          <MagnifyingGlassIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
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
                <MapPinIcon className="w-3 h-3 mr-1" />
                Pinned
              </h4>
            </div>
            {pinnedConversations.map(convo => (
              <ConversationItem key={convo.id} conversation={convo} />
            ))}
          </div>
        )}

        {/* Group Chats Section */}
        {(filteredGroups.length > 0 || canCreateGroups) && (
          <div>
            <div className="px-4 py-2 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
              <h4 className="text-xs font-semibold text-gray-600 uppercase tracking-wide flex items-center">
                <UsersIcon className="w-3 h-3 mr-1" />
                Group Chats
              </h4>
              {canCreateGroups && onCreateGroup && (
                <button
                  onClick={onCreateGroup}
                  className="p-1 text-optio-purple hover:bg-purple-100 rounded-full transition-colors"
                  title="Create Group"
                >
                  <PlusIcon className="w-4 h-4" />
                </button>
              )}
            </div>
            {filteredGroups.length > 0 ? (
              filteredGroups.map(group => (
                <GroupConversationItem key={group.id} group={group} />
              ))
            ) : canCreateGroups ? (
              <div className="px-4 py-3 text-sm text-gray-500 text-center">
                No group chats yet. Create one to get started.
              </div>
            ) : null}
          </div>
        )}

        {/* Contacts Section (unified, deduplicated list) */}
        {filteredContacts.length > 0 && (
          <div>
            <div className="px-4 py-2 bg-gray-50 border-b border-gray-200">
              <h4 className="text-xs font-semibold text-gray-600 uppercase tracking-wide flex items-center">
                <UserIcon className="w-3 h-3 mr-1" />
                Contacts
              </h4>
            </div>
            {filteredContacts.map(convo => (
              <ConversationItem key={convo.id} conversation={convo} />
            ))}
          </div>
        )}

        {/* Empty State */}
        {!hasContacts && (
          <div className="flex flex-col items-center justify-center h-64 p-4 text-center">
            <UserIcon className="w-16 h-16 text-gray-300 mb-4" />
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
