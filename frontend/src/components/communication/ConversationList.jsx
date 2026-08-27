import React, { useMemo, useEffect, useRef, useCallback, useState } from 'react'
import { AcademicCapIcon, MagnifyingGlassIcon, MapPinIcon, UserIcon, UsersIcon, PlusIcon, LifebuoyIcon } from '@heroicons/react/24/outline'
import { useSearchParams } from 'react-router-dom'
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

// Row size in CSS pixels. Passed to every <img> so the browser reserves the
// space before the bytes land and the list stops reflowing as avatars arrive.
const AVATAR_PX = 40

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

// An avatar that falls back to the person's initial when the image does not
// load — the state every one of these URLs reaches sooner or later:
//
//   * A signed storage URL expires (STORAGE_SIGNED_URL_TTL, currently an hour).
//     Leave Messages open over lunch and every photo on screen 400s.
//   * Google OAuth avatars (44 accounts) are served by lh3.googleusercontent
//     .com, which throttles a burst of concurrent requests from one client —
//     measured 8 of 44 failing on one load and 0 on the next, from URLs that
//     each return 200 when fetched alone. Nothing we control.
//   * An avatar_url whose object has since been deleted (1 row today).
//
// Without this the row rendered Chrome's broken-image glyph with the alt text
// spilling out of the 40px circle. The initial is what an account with no photo
// already shows, so the failure is invisible rather than ugly.
const Avatar = React.memo(({ src, name, initial }) => {
  const [failed, setFailed] = useState(false)
  // A re-signed URL for the same person is a fresh chance to load.
  useEffect(() => { setFailed(false) }, [src])

  if (!src || failed) {
    return (
      <div className="w-10 h-10 bg-optio-purple/10 rounded-full flex items-center justify-center text-optio-purple font-bold">
        {initial}
      </div>
    )
  }
  return (
    <img
      src={src}
      alt={name}
      width={AVATAR_PX}
      height={AVATAR_PX}
      // A school directory is a long list and most of it is below the fold;
      // without this every offscreen avatar downloaded on load.
      loading="lazy"
      decoding="async"
      onError={() => setFailed(true)}
      className="w-10 h-10 rounded-full object-cover bg-optio-purple/10"
    />
  )
})
Avatar.displayName = 'Avatar'

const UnreadBadge = ({ count }) => (
  <div className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 bg-red-500 rounded-full flex items-center justify-center">
    <span className="text-white text-[10px] font-bold">{count > 9 ? '9+' : count}</span>
  </div>
)

// These three live at module scope, NOT inside ConversationList. Declared in
// the parent's body they were a new component type on every render, so React
// tore down and rebuilt every row — including its <img> — each time the search
// box changed by one character. Typing a name flickered the whole list and
// re-fetched every avatar in it.
//
// Module scope + memo means a keystroke re-renders only the rows whose props
// actually changed. `onSelect` must stay referentially stable for that to hold,
// which is what the useCallback in the parent is for.

const ConversationItem = React.memo(({ conversation, isSelected, onSelect }) => {
  const isPinned = conversation.type === 'advisor'
  const isSupport = conversation.type === 'support' || conversation.relationshipTypes?.includes('support')
  const isSchool = conversation.type === 'school' || conversation.relationshipTypes?.includes('school') ||
    conversation.other_user?.is_school
  const hasThread = !!conversation.last_message_at
  const isUnread = conversation.unread_count > 0
  const displayName = `${conversation.other_user?.first_name || ''} ${conversation.other_user?.last_name || ''}`.trim() ||
    conversation.other_user?.display_name || 'Unknown'
  const initial = displayName?.charAt(0)?.toUpperCase() || '?'

  return (
    <button
      onClick={() => onSelect(conversation)}
      className={`w-full px-4 py-2.5 flex items-center gap-3 border-l-2 transition-colors ${
        isSelected
          ? 'bg-optio-purple/5 border-optio-purple'
          : 'border-transparent hover:bg-gray-50'
      }`}
    >
      {/* Avatar */}
      <div className="relative flex-shrink-0">
        {isSupport ? (
          <img
            src={OPTIO_LOGO_URL}
            alt="Optio Support"
            width={AVATAR_PX}
            height={AVATAR_PX}
            decoding="async"
            className="w-10 h-10 rounded-full object-contain bg-white border border-gray-100"
          />
        ) : isSchool ? (
          <div className="w-10 h-10 bg-gradient-to-br from-optio-purple to-optio-pink rounded-full flex items-center justify-center">
            <AcademicCapIcon className="w-5 h-5 text-white" />
          </div>
        ) : (
          <Avatar
            src={conversation.other_user?.avatar_url}
            name={displayName}
            initial={initial}
          />
        )}
        {isPinned && (
          <div className="absolute -top-1 -right-1 w-4 h-4 bg-blue-500 rounded-full flex items-center justify-center" title="Teacher">
            <MapPinIcon className="w-2.5 h-2.5 text-white" />
          </div>
        )}
        {isUnread && <UnreadBadge count={conversation.unread_count} />}
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
})
ConversationItem.displayName = 'ConversationItem'

const GroupConversationItem = React.memo(({ group, isSelected, onSelect }) => {
  const isUnread = group.unread_count > 0

  return (
    <button
      onClick={() => onSelect({ ...group, type: 'group' })}
      className={`w-full px-4 py-2.5 flex items-center gap-3 border-l-2 transition-colors ${
        isSelected ? 'bg-optio-purple/5 border-optio-purple' : 'border-transparent hover:bg-gray-50'
      }`}
    >
      <div className="relative flex-shrink-0">
        <div className="w-10 h-10 bg-gradient-primary rounded-full flex items-center justify-center">
          <UsersIcon className="w-5 h-5 text-white" />
        </div>
        {isUnread && <UnreadBadge count={group.unread_count} />}
      </div>

      <div className="flex-1 min-w-0 text-left">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 min-w-0">
            <h3 className={`truncate ${isUnread ? 'font-bold text-gray-900' : 'font-semibold text-gray-800'}`}>
              {group.name}
            </h3>
            {group.source_class_id && (
              <span className="flex-shrink-0 text-[10px] font-semibold uppercase tracking-wide text-optio-purple bg-optio-purple/10 px-1.5 py-0.5 rounded-full">
                Class
              </span>
            )}
          </div>
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
})
GroupConversationItem.displayName = 'GroupConversationItem'

const SectionHeader = ({ icon, label }) => (
  <div className="px-4 pt-4 pb-1 flex items-center gap-1.5 text-xs font-semibold text-gray-400 uppercase tracking-wide">
    {icon}
    {label}
  </div>
)

// Rows in the shape of the real thing, rather than a centred spinner. The list
// is assembled from four requests that land at different times; a skeleton
// keeps the layout still while they arrive instead of replacing the panel
// wholesale when the last one lands.
const ConversationSkeleton = () => (
  <div className="pt-4" aria-hidden="true">
    {Array.from({ length: 7 }).map((_, i) => (
      <div key={i} className="px-4 py-2.5 flex items-center gap-3">
        <div className="w-10 h-10 rounded-full bg-gray-100 animate-pulse flex-shrink-0" />
        <div className="flex-1 min-w-0 space-y-2">
          <div className="h-3.5 bg-gray-100 rounded animate-pulse" style={{ width: `${55 + ((i * 7) % 30)}%` }} />
          <div className="h-3 bg-gray-100 rounded animate-pulse" style={{ width: `${35 + ((i * 11) % 40)}%` }} />
        </div>
      </div>
    ))}
  </div>
)

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
  const [searchParams] = useSearchParams()

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

  // Optio Support. Every account gets this contact from the backend
  // (routes/direct_messages.py::_append_support_contact), but it arrived last
  // in an alphabetical Contacts list under every teacher, observer and child —
  // a Hearthwood parent wrote in on 2026-08-25 saying there was nowhere in the
  // portal to contact us. It is now a permanent row at the foot of the list,
  // outside the scroll and unaffected by the search box, so "how do I ask Optio
  // for help" has one answer that is always on screen.
  const supportContact = useMemo(
    () => unifiedContacts.find(c => c.relationshipTypes?.includes('support')) || null,
    [unifiedContacts]
  )
  const supportConversation = useMemo(
    () => (supportContact ? contactToConversation(supportContact) : null),
    [supportContact]
  )

  // Contacts directory: people you can message but have no active thread with.
  // The school's shared inbox leads the list (then the pinned teacher above it).
  // Support is excluded — it has its own pinned row below the list.
  const directoryRows = useMemo(() => {
    const mapped = searchedContacts
      .filter(c => !c.lastMessageAt && c.id !== supportContact?.id)
      .map(contactToConversation)
    const rows = [
      ...mapped.filter(r => r.type === 'school'),
      ...mapped.filter(r => r.type !== 'school')
    ]
    if (advisor && advisorMatchesSearch && !advisor.last_message_at) rows.unshift(advisor)
    return rows
  }, [searchedContacts, advisor, advisorMatchesSearch, supportContact?.id])

  // Set by either of the two effects below: whichever opens a thread first wins,
  // so a ?user= deep link is not overwritten by the desktop auto-select.
  const hasAutoSelectedRef = useRef(false)

  // Deep-link: ?user=<id> opens that person's thread — how "Message Sarah" on
  // the carpool board arrives here. Matches the mobile app's messages?user=
  // param. Consumed once per id so pressing back doesn't bounce straight in
  // again, and silently ignored when that person isn't a contact of this
  // account (an unreachable id must not open an empty chat).
  const openedForUserRef = useRef(null)
  useEffect(() => {
    const targetId = searchParams.get('user')
    if (!targetId || openedForUserRef.current === targetId || isLoading) return
    const match = unifiedContacts.find(c => c.id === targetId)
    if (!match) return
    openedForUserRef.current = targetId
    hasAutoSelectedRef.current = true
    onSelectConversation(contactToConversation(match))
  }, [searchParams, unifiedContacts, isLoading, onSelectConversation])

  // Auto-select the most-recent conversation on desktop (once), so the chat
  // panel isn't empty on load. Falls back to the empty state when there are no
  // active conversations yet.
  useEffect(() => {
    if (hasAutoSelectedRef.current || selectedConversation || isLoading) return
    const isDesktop = typeof window !== 'undefined' && window.innerWidth >= 768
    if (!isDesktop) return
    const first = conversationRows[0]
    if (!first) return
    hasAutoSelectedRef.current = true
    onSelectConversation(first.kind === 'group' ? { ...first.group, type: 'group' } : first.convo)
  }, [isLoading, conversationRows, selectedConversation, onSelectConversation])

  // Stable identity, so the memoized rows above genuinely skip re-rendering.
  const handleSelect = useCallback((c) => onSelectConversation(c), [onSelectConversation])

  const hasAnything = conversationRows.length > 0 || directoryRows.length > 0

  return (
    <div className="flex flex-col h-full bg-white border-r border-gray-200">
      {/* Page header */}
      <div className="px-4 py-3 border-b border-gray-200">
        <h2 className="text-lg font-bold text-gray-900">Messages</h2>
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
          <ConversationSkeleton />
        ) : (
          <>
            {/* Conversations (active threads + groups) */}
            {conversationRows.length > 0 && (
              <div className="pb-2">
                <SectionHeader icon={<MapPinIcon className="w-3 h-3" />} label="Conversations" />
                {conversationRows.map(row =>
                  row.kind === 'group'
                    ? <GroupConversationItem
                        key={row.key}
                        group={row.group}
                        isSelected={selectedConversation?.id === row.group.id && selectedConversation?.type === 'group'}
                        onSelect={handleSelect}
                      />
                    : <ConversationItem
                        key={row.key}
                        conversation={row.convo}
                        isSelected={selectedConversation?.id === row.convo.id && selectedConversation?.type !== 'group'}
                        onSelect={handleSelect}
                      />
                )}
              </div>
            )}

            {/* Contacts (directory of people to start a conversation with) */}
            {directoryRows.length > 0 && (
              <div className="pb-2">
                <SectionHeader icon={<UserIcon className="w-3 h-3" />} label="Contacts" />
                {directoryRows.map(convo => (
                  <ConversationItem
                    key={`contact-${convo.id}`}
                    conversation={convo}
                    isSelected={selectedConversation?.id === convo.id && selectedConversation?.type !== 'group'}
                    onSelect={handleSelect}
                  />
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

      {/* Optio Support and New group — pinned below the scrolling list. */}
      {(supportConversation || (canCreateGroups && onCreateGroup)) && (
        <div className="border-t border-gray-200 p-3 space-y-2">
          {supportConversation && (
            <button
              onClick={() => onSelectConversation(supportConversation)}
              className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg border text-left transition-colors ${
                selectedConversation?.id === supportConversation.id && selectedConversation?.type !== 'group'
                  ? 'bg-optio-purple/5 border-optio-purple'
                  : 'border-gray-200 hover:bg-optio-purple/5 hover:border-optio-purple'
              }`}
            >
              <LifebuoyIcon className="w-5 h-5 text-optio-purple flex-shrink-0" />
              <span className="min-w-0">
                <span className="block text-sm font-semibold text-gray-800">Need help? Message Optio</span>
                <span className="block text-xs text-gray-500 truncate">
                  {supportConversation.last_message_preview ||
                    'Questions about the app, your account, or a name that looks wrong'}
                </span>
              </span>
              {supportConversation.unread_count > 0 && (
                <span className="ml-auto min-w-[18px] h-[18px] px-1 bg-red-500 rounded-full flex items-center justify-center flex-shrink-0">
                  <span className="text-white text-[10px] font-bold">
                    {supportConversation.unread_count > 9 ? '9+' : supportConversation.unread_count}
                  </span>
                </span>
              )}
            </button>
          )}
          {canCreateGroups && onCreateGroup && (
            <button
              onClick={onCreateGroup}
              className="w-full flex items-center justify-center gap-2 py-2 rounded-lg border border-dashed border-gray-300 text-sm font-medium text-optio-purple hover:bg-optio-purple/5 hover:border-optio-purple transition-colors"
            >
              <PlusIcon className="w-4 h-4" />
              New group
            </button>
          )}
        </div>
      )}
    </div>
  )
}

export default ConversationList
