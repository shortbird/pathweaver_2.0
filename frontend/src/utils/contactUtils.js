/**
 * Contact Utilities for Communication Tab
 *
 * Provides utilities for normalizing and deduplicating contacts from
 * multiple sources (friends, observers, children, advisor contacts, conversations).
 */

/**
 * Relationship type priority for badge display
 * Lower number = higher priority
 */
const RELATIONSHIP_PRIORITY = {
  advisor: 1,
  student: 2,
  child: 3,
  observer: 4,
  friend: 5
}

/**
 * Relationship badge configuration
 */
export const RELATIONSHIP_CONFIG = {
  advisor: {
    label: 'Advisor',
    bgColor: 'bg-blue-100',
    textColor: 'text-blue-700',
    borderColor: 'border-blue-200'
  },
  student: {
    label: 'Student',
    bgColor: 'bg-amber-100',
    textColor: 'text-amber-700',
    borderColor: 'border-amber-200'
  },
  child: {
    label: 'Child',
    bgColor: 'bg-green-100',
    textColor: 'text-green-700',
    borderColor: 'border-green-200'
  },
  observer: {
    label: 'Observer',
    bgColor: 'bg-purple-100',
    textColor: 'text-purple-700',
    borderColor: 'border-purple-200'
  },
  friend: {
    label: 'Friend',
    bgColor: 'bg-gray-100',
    textColor: 'text-gray-700',
    borderColor: 'border-gray-200'
  }
}

/**
 * Normalize a contact from various source formats into a standard structure
 *
 * @param {Object} contact - The contact data from any source
 * @param {string} source - The source type: 'friend', 'observer', 'child', 'advisor_contact', 'conversation'
 * @returns {Object} Normalized contact object
 */
export function normalizeContact(contact, source) {
  // Handle different source formats
  let userId, displayName, firstName, lastName, avatarUrl, role, relationshipType

  switch (source) {
    case 'friend':
      // From friendsAPI.getFriends() - direct user object
      userId = contact.id
      displayName = contact.display_name || `${contact.first_name || ''} ${contact.last_name || ''}`.trim()
      firstName = contact.first_name
      lastName = contact.last_name
      avatarUrl = contact.avatar_url
      role = contact.role
      relationshipType = 'friend'
      break

    case 'observer':
      // From observerAPI.getMyObservers() - nested observer object
      const observer = contact.observer || contact
      userId = observer.id
      displayName = `${observer.first_name || ''} ${observer.last_name || ''}`.trim()
      firstName = observer.first_name
      lastName = observer.last_name
      avatarUrl = observer.avatar_url
      role = 'observer'
      relationshipType = 'observer'
      break

    case 'child':
      // From parentAPI.getMyChildren() - prefixed fields
      userId = contact.student_id
      displayName = contact.student_display_name || `${contact.student_first_name || ''} ${contact.student_last_name || ''}`.trim()
      firstName = contact.student_first_name
      lastName = contact.student_last_name
      avatarUrl = contact.student_avatar_url
      role = 'student'
      relationshipType = 'child'
      break

    case 'advisor_contact':
      // From useMessagingContacts - direct object with relationship field
      userId = contact.id
      displayName = contact.display_name || `${contact.first_name || ''} ${contact.last_name || ''}`.trim()
      firstName = contact.first_name
      lastName = contact.last_name
      avatarUrl = contact.avatar_url
      role = contact.role
      relationshipType = contact.relationship || 'advisor' // 'advisor' or 'student'
      break

    case 'conversation':
      // From existing conversation - other_user nested object
      const otherUser = contact.other_user || contact
      userId = otherUser.id
      displayName = otherUser.display_name || `${otherUser.first_name || ''} ${otherUser.last_name || ''}`.trim()
      firstName = otherUser.first_name
      lastName = otherUser.last_name
      avatarUrl = otherUser.avatar_url
      role = otherUser.role
      relationshipType = contact.type || 'friend'
      break

    default:
      // Generic fallback
      userId = contact.id
      displayName = contact.display_name || `${contact.first_name || ''} ${contact.last_name || ''}`.trim()
      firstName = contact.first_name
      lastName = contact.last_name
      avatarUrl = contact.avatar_url
      role = contact.role
      relationshipType = 'friend'
  }

  return {
    id: userId,
    displayName: displayName || 'Unknown',
    firstName,
    lastName,
    avatarUrl,
    role,
    relationshipTypes: [relationshipType],
    // Preserve conversation metadata if present
    lastMessageAt: contact.last_message_at || null,
    lastMessagePreview: contact.last_message_preview || null,
    unreadCount: contact.unread_count || 0
  }
}

/**
 * Get the primary relationship type from a list of relationship types
 * Uses priority order: advisor > student > child > observer > friend
 *
 * @param {string[]} types - Array of relationship types
 * @returns {string} The highest priority relationship type
 */
export function getPrimaryRelationship(types) {
  if (!types || types.length === 0) return 'friend'

  return types.reduce((primary, current) => {
    const primaryPriority = RELATIONSHIP_PRIORITY[primary] || 999
    const currentPriority = RELATIONSHIP_PRIORITY[current] || 999
    return currentPriority < primaryPriority ? current : primary
  }, types[0])
}

/**
 * Merge contacts from multiple sources, deduplicating by user ID
 * Combines relationship types when the same user appears in multiple sources
 *
 * @param {Object} sources - Object containing arrays of contacts from different sources
 * @param {Array} sources.friends - Friends/learning partners
 * @param {Array} sources.observers - Observers
 * @param {Array} sources.children - Children (for parent accounts)
 * @param {Array} sources.advisorContacts - Advisor/student contacts
 * @param {Array} sources.conversations - Existing conversation contacts
 * @returns {Object[]} Array of merged, deduplicated contacts
 */
export function mergeContacts(sources) {
  const contactMap = new Map()

  const addToMap = (contacts, source) => {
    if (!contacts || !Array.isArray(contacts)) return

    contacts.forEach(contact => {
      const normalized = normalizeContact(contact, source)

      if (!normalized.id) return // Skip contacts without valid ID

      if (contactMap.has(normalized.id)) {
        // Merge with existing contact
        const existing = contactMap.get(normalized.id)

        // Merge relationship types (unique only)
        const allTypes = [...new Set([...existing.relationshipTypes, ...normalized.relationshipTypes])]

        // Use the most recent message data
        const lastMessageAt = normalized.lastMessageAt && (!existing.lastMessageAt ||
          new Date(normalized.lastMessageAt) > new Date(existing.lastMessageAt))
          ? normalized.lastMessageAt : existing.lastMessageAt

        contactMap.set(normalized.id, {
          ...existing,
          relationshipTypes: allTypes,
          lastMessageAt: lastMessageAt || existing.lastMessageAt,
          lastMessagePreview: normalized.lastMessagePreview || existing.lastMessagePreview,
          unreadCount: Math.max(existing.unreadCount || 0, normalized.unreadCount || 0),
          // Use newer display data if available
          displayName: normalized.displayName || existing.displayName,
          avatarUrl: normalized.avatarUrl || existing.avatarUrl
        })
      } else {
        contactMap.set(normalized.id, normalized)
      }
    })
  }

  // Process each source
  if (sources.friends) addToMap(sources.friends, 'friend')
  if (sources.observers) addToMap(sources.observers, 'observer')
  if (sources.children) addToMap(sources.children, 'child')
  if (sources.advisorContacts) addToMap(sources.advisorContacts, 'advisor_contact')
  if (sources.conversations) addToMap(sources.conversations, 'conversation')

  return Array.from(contactMap.values())
}

/**
 * Sort contacts by priority:
 * 1. Unread count (descending)
 * 2. Last message time (descending/most recent first)
 * 3. Alphabetical by display name
 *
 * @param {Object[]} contacts - Array of normalized contacts
 * @returns {Object[]} Sorted array of contacts
 */
export function sortContacts(contacts) {
  return [...contacts].sort((a, b) => {
    // First: unread count (higher first)
    const unreadDiff = (b.unreadCount || 0) - (a.unreadCount || 0)
    if (unreadDiff !== 0) return unreadDiff

    // Second: last message time (more recent first)
    if (a.lastMessageAt && b.lastMessageAt) {
      const timeDiff = new Date(b.lastMessageAt) - new Date(a.lastMessageAt)
      if (timeDiff !== 0) return timeDiff
    } else if (a.lastMessageAt) {
      return -1 // a has messages, b doesn't
    } else if (b.lastMessageAt) {
      return 1 // b has messages, a doesn't
    }

    // Third: alphabetical by display name
    return (a.displayName || '').localeCompare(b.displayName || '')
  })
}

/**
 * Convert a normalized contact back to the conversation format expected by ConversationItem
 *
 * @param {Object} contact - Normalized contact object
 * @returns {Object} Conversation object for ConversationItem
 */
export function contactToConversation(contact) {
  const primaryRelationship = getPrimaryRelationship(contact.relationshipTypes)

  return {
    id: contact.id,
    type: primaryRelationship,
    other_user: {
      id: contact.id,
      display_name: contact.displayName,
      first_name: contact.firstName,
      last_name: contact.lastName,
      avatar_url: contact.avatarUrl,
      role: contact.role
    },
    last_message_at: contact.lastMessageAt,
    last_message_preview: contact.lastMessagePreview || 'Start a conversation',
    unread_count: contact.unreadCount || 0,
    relationshipTypes: contact.relationshipTypes,
    primaryRelationship
  }
}

/**
 * Filter contacts by search query (matches display name, first name, or last name)
 *
 * @param {Object[]} contacts - Array of contacts
 * @param {string} query - Search query
 * @returns {Object[]} Filtered contacts
 */
export function filterContactsBySearch(contacts, query) {
  if (!query || !query.trim()) return contacts

  const lowerQuery = query.toLowerCase().trim()

  return contacts.filter(contact => {
    const displayName = (contact.displayName || '').toLowerCase()
    const firstName = (contact.firstName || '').toLowerCase()
    const lastName = (contact.lastName || '').toLowerCase()

    return displayName.includes(lowerQuery) ||
           firstName.includes(lowerQuery) ||
           lastName.includes(lowerQuery)
  })
}
