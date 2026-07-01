import React, { useMemo, useEffect, useRef } from 'react'
import { MagnifyingGlassIcon, MapPinIcon, UserIcon, UsersIcon, PlusIcon } from '@heroicons/react/24/outline'
import { useAuth } from '../../contexts/AuthContext'
import { useQuery } from '@tanstack/react-query'
import { parentAPI, observerAPI } from '../../services/api'
import { useMessagingContacts } from '../../hooks/api/useDirectMessages'
import {
  mergeContacts,
  sortContacts,
  filterContactsBySearch,
  contactToConversation
} from '../../utils/contactUtils'

// Optio "favicon" mark, used as the avatar for the Optio Support contact.
const OPTIO_LOGO_URL = 'https://auth.optioeducation.com/storage/v1/object/public/site-assets/logos/gradient_fav.svg'

const ConversationList = ({
  conversations,
  selectedConversation,
  onSelectConversation,
  isLoading,
  onCreateGroup,
  groupConversations = []
}) => {
  const { user } = useAuth()
  const [searchQuery, setSearchQuery] = React.useState('')

  // Get effective role (resolves org_managed to org_role)
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

  const observers = observersData?.observers || []
  const messagingContacts = contactsData?.contacts || []

  // Build the pinned advisor (a student's primary contact)
  const advisor = useMemo(() => {
    if (!user?.advisor_id) return null
    const advisorConvo = conversations?.find(c =>
      c.other_user?.id === user.advisor_id || c.other_user?.role === 'advisor'
    )
    if (advisorConvo) return { ...advisorConvo, type: 'advisor' }
    return {
      id: user.advisor_id,
      type: 'advisor',
      other_user: {
        id: user.advisor_id,
        display_name: 'Your Teacher',
        first_name: 'Your',
        last_name: 'Teacher',
        role: 'advisor'
      },
      last_message_at: null,
      last_message_preview: 'Start a conversation',
      unread_count: 0
    }
  }, [user?.advisor_id, conversations])

  // Merge and deduplicate all contacts (excluding the pinned advisor)
  const unifiedContacts = useMemo(() => {
    const merged = mergeContacts({
      friends: [],
      observers: observers,
      children: user?.role === 'parent' ? linkedChildren : [],
      advisorContacts: messagingContacts,
      conversations: conversations?.filter(c => c.other_user?.role !== 'advisor') || []
    })
    const filtered = merged.filter(contact =>
      contact.id !== advisor?.id && contact.id !== 'bot'
    )
    return sortContacts(filtered)
  }, [observers, linkedChildren, messagingContacts, conversations, advisor?.id, user?.role])

  // Apply the search query across people (and group names below)
  const searchedContacts = useMemo(
    () => filterContactsBySearch(unifiedContacts, searchQuery),
    [unifiedContacts, searchQuery]
  )

  const advisorMatchesSearch = useMemo(() => {
    if (!advisor) return false
    if (!searchQuery.trim()) return true
    const name = `${advisor.other_user?.first_name || ''} ${advisor.other_user?.last_name || ''} ${advisor.other_user?.display_name || ''}`.toLowerCase()
    return name.includes(searchQuery.toLowerCase().trim())
  }, [advisor, searchQuery])

  // Filter groups by search
  const filteredGroups = useMemo(() => {
    if (!searchQuery.trim()) return groupConversations
    const lowerQuery = searchQuery.toLowerCase().trim()
    return groupConversations.filter(group => group.name?.toLowerCase().includes(lowerQuery))
  }, [groupConversations, searchQuery])

  // Active conversations: DMs/groups with a real thread, plus the advisor if
  // they have one. Sorted unread-first, then most-recent.
  const conversationRows = useMemo(() => {
    const rows = []
    if (advisor && advisorMatchesSearch && advisor.last_message_at) {
      rows.push({ key: `advisor-${advisor.id}`, kind: 'dm', sortAt: advisor.last_message_at, unread: advisor.unread_count || 0, convo: advisor })
    }
    for (const c of searchedContacts) {
      if (!c.lastMessageAt) continue
      rows.push({ key: `dm-${c.id}`, kind: 'dm', sortAt: c.lastMessageAt, unread: c.unreadCount || 0, convo: contactToConversation(c) })
    }
    for (const g of filteredGroups) {
      rows.push({ key: `group-${g.id}`, kind: 'group', sortAt: g.last_message_at, unread: g.unread_count || 0, group: g })
    }
    return rows.sort((a, b) => (b.unread - a.unread) || (new Date(b.sortAt || 0) - new Date(a.sortAt || 0)))
  }, [advisor, advisorMatchesSearch, searchedContacts, filteredGroups])

  // Contacts directory: people you can message but have no active thread with.
  const directoryRows = useMemo(() => {
    const rows = searchedContacts
      .filter(c => !c.lastMessageAt)
      .map(contactToConversation)
    if (advisor && advisorMatchesSearch && !advisor.last_message_at) rows.unshift(advisor)
    return rows
  }, [searchedContacts, advisor, advisorMatchesSearch])

  // Auto-select the most-recent conversation on desktop (once), so the chat
  // panel isn't empty on load. Falls back to the empty state when there are no
  // active conversations yet.
  const hasAutoSelectedRef = useRef(false)
  useEffect(() => {
    if (hasAutoSelectedRef.current || selectedConversation || isLoading) return
    const isDesktop = typeof window !== 'undefined' && window.innerWidth >= 768
    if (!isDesktop) return
    const first = conversationRows[0]
    if (!first) return
    hasAutoSelectedRef.current = true
    onSelectConversation(first.kind === 'group' ? { ...first.group, type: 'group' } : first.convo)
  }, [isLoading, conversationRows, selectedConversation, onSelectConversation])

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

  const ConversationItem = ({ conversation }) => {
    const isSelected = selectedConversation?.id === conversation.id && selectedConversation?.type !== 'group'
    const isPinned = conversation.type === 'advisor'
    const isSupport = conversation.type === 'support' || conversation.relationshipTypes?.includes('support')
    const hasThread = !!conversation.last_message_at
    const isUnread = conversation.unread_count > 0
    const displayName = `${conversation.other_user?.first_name || ''} ${conversation.other_user?.last_name || ''}`.trim() ||
      conversation.other_user?.display_name || 'Unknown'
    const initial = displayName?.charAt(0)?.toUpperCase() || '?'

    return (
      <button
        onClick={() => onSelectConversation(conversation)}
        className={`w-full px-4 py-2.5 flex items-center gap-3 border-l-2 transition-colors ${
          isSelected
            ? 'bg-purple-50 border-optio-purple'
            : 'border-transparent hover:bg-gray-50'
        }`}
      >
        {/* Avatar */}
        <div className="relative flex-shrink-0">
          {isSupport ? (
            <img
              src={OPTIO_LOGO_URL}
              alt="Optio Support"
              className="w-10 h-10 rounded-full object-contain bg-white border border-gray-100"
            />
          ) : conversation.other_user?.avatar_url ? (
            <img
              src={conversation.other_user.avatar_url}
              alt={displayName}
              className="w-10 h-10 rounded-full object-cover"
            />
          ) : (
            <div className="w-10 h-10 bg-purple-100 rounded-full flex items-center justify-center text-optio-purple font-bold">
              {initial}
            </div>
          )}
          {isPinned && (
            <div className="absolute -top-1 -right-1 w-4 h-4 bg-blue-500 rounded-full flex items-center justify-center" title="Teacher">
              <MapPinIcon className="w-2.5 h-2.5 text-white" />
            </div>
          )}
          {isUnread && (
            <div className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 bg-red-500 rounded-full flex items-center justify-center">
              <span className="text-white text-[10px] font-bold">
                {conversation.unread_count > 9 ? '9+' : conversation.unread_count}
              </span>
            </div>
          )}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0 text-left">
          <div className="flex items-center justify-between gap-2">
            <h3 className={`truncate ${isUnread ? 'font-bold text-gray-900' : 'font-semibold text-gray-800'}`}>
              {displayName}
            </h3>
            {hasThread && (
              <span className="text-xs text-gray-400 flex-shrink-0">
                {formatTime(conversation.last_message_at)}
              </span>
            )}
          </div>
          <p className={`text-sm truncate ${isUnread ? 'text-gray-800 font-medium' : hasThread ? 'text-gray-500' : 'text-gray-400 italic'}`}>
            {conversation.last_message_preview || 'No messages yet'}
          </p>
        </div>
      </button>
    )
  }

  const GroupConversationItem = ({ group }) => {
    const isSelected = selectedConversation?.id === group.id && selectedConversation?.type === 'group'
    const isUnread = group.unread_count > 0

    return (
      <button
        onClick={() => onSelectConversation({ ...group, type: 'group' })}
        className={`w-full px-4 py-2.5 flex items-center gap-3 border-l-2 transition-colors ${
          isSelected ? 'bg-purple-50 border-optio-purple' : 'border-transparent hover:bg-gray-50'
        }`}
      >
        <div className="relative flex-shrink-0">
          <div className="w-10 h-10 bg-gradient-to-br from-optio-purple to-optio-pink rounded-full flex items-center justify-center">
            <UsersIcon className="w-5 h-5 text-white" />
          </div>
          {isUnread && (
            <div className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 bg-red-500 rounded-full flex items-center justify-center">
              <span className="text-white text-[10px] font-bold">
                {group.unread_count > 9 ? '9+' : group.unread_count}
              </span>
            </div>
          )}
        </div>

        <div className="flex-1 min-w-0 text-left">
          <div className="flex items-center justify-between gap-2">
            <h3 className={`truncate ${isUnread ? 'font-bold text-gray-900' : 'font-semibold text-gray-800'}`}>
              {group.name}
            </h3>
            {group.last_message_at && (
              <span className="text-xs text-gray-400 flex-shrink-0">
                {formatTime(group.last_message_at)}
              </span>
            )}
          </div>
          <p className={`text-sm truncate ${isUnread ? 'text-gray-800 font-medium' : 'text-gray-500'}`}>
            {group.last_message_preview || `${group.member_count || 0} members`}
          </p>
        </div>
      </button>
    )
  }

  const SectionHeader = ({ icon, label }) => (
    <div className="px-4 pt-4 pb-1 flex items-center gap-1.5 text-xs font-semibold text-gray-400 uppercase tracking-wide">
      {icon}
      {label}
    </div>
  )

  const hasAnything = conversationRows.length > 0 || directoryRows.length > 0

  return (
    <div className="flex flex-col h-full bg-white border-r border-gray-200">
      {/* Page header */}
      <div className="px-4 py-3 border-b border-gray-200">
        <h2 className="text-lg font-bold text-gray-900" style={{ fontFamily: 'Poppins' }}>Messages</h2>
      </div>

      {/* Search */}
      <div className="p-3 border-b border-gray-200">
        <div className="relative">
          <MagnifyingGlassIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input
            type="text"
            placeholder="Search people and conversations..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#6d469b] focus:border-transparent"
          />
        </div>
      </div>

      {/* Lists */}
      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="flex items-center justify-center h-40">
            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-optio-purple" />
          </div>
        ) : (
          <>
            {/* Conversations (active threads + groups) */}
            {conversationRows.length > 0 && (
              <div className="pb-2">
                <SectionHeader icon={<MapPinIcon className="w-3 h-3" />} label="Conversations" />
                {conversationRows.map(row =>
                  row.kind === 'group'
                    ? <GroupConversationItem key={row.key} group={row.group} />
                    : <ConversationItem key={row.key} conversation={row.convo} />
                )}
              </div>
            )}

            {/* Contacts (directory of people to start a conversation with) */}
            {directoryRows.length > 0 && (
              <div className="pb-2">
                <SectionHeader icon={<UserIcon className="w-3 h-3" />} label="Contacts" />
                {directoryRows.map(convo => (
                  <ConversationItem key={`contact-${convo.id}`} conversation={convo} />
                ))}
              </div>
            )}

            {/* Empty / no-results states */}
            {!hasAnything && (
              <div className="flex flex-col items-center justify-center h-64 p-4 text-center">
                <UserIcon className="w-14 h-14 text-gray-300 mb-3" />
                <h3 className="text-base font-medium text-gray-700 mb-1">
                  {searchQuery ? 'No matches' : 'No conversations yet'}
                </h3>
                <p className="text-sm text-gray-500">
                  {searchQuery ? 'Try a different name.' : 'Your teachers and contacts will appear here.'}
                </p>
              </div>
            )}
          </>
        )}
      </div>

      {/* New group — pinned at the bottom of the list */}
      {canCreateGroups && onCreateGroup && (
        <div className="border-t border-gray-200 p-3">
          <button
            onClick={onCreateGroup}
            className="w-full flex items-center justify-center gap-2 py-2 rounded-lg border border-dashed border-gray-300 text-sm font-medium text-optio-purple hover:bg-purple-50 hover:border-optio-purple transition-colors"
          >
            <PlusIcon className="w-4 h-4" />
            New group
          </button>
        </div>
      )}
    </div>
  )
}

export default ConversationList
