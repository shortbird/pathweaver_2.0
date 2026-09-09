/**
 * Name Utilities
 *
 * Platform-wide standard for displaying user names.
 * Always uses first_name + last_name. Falls back to display_name or email.
 */

/**
 * Get the full display name for a user.
 * Priority: first_name + last_name > first_name > display_name > email > fallback
 *
 * @param {Object} user - User object with name fields
 * @param {string} [fallback='Unknown'] - Fallback if no name available
 * @returns {string} The user's display name
 */
export function getUserName(user, fallback = 'Unknown') {
  if (!user) return fallback

  const first = (user.first_name || '').trim()
  const last = (user.last_name || '').trim()

  if (first && last) return `${first} ${last}`
  if (first) return first
  if (last) return last
  if (user.display_name) return user.display_name
  if (user.email) return user.email
  return fallback
}

/**
 * Get just the first name for a user.
 * Used for informal/short displays (e.g., "Welcome back, Julia")
 *
 * @param {Object} user - User object with name fields
 * @param {string} [fallback=''] - Fallback if no name available
 * @returns {string} The user's first name
 */
export function getFirstName(user, fallback = '') {
  if (!user) return fallback
  return (user.first_name || '').trim() || user.display_name || fallback
}

/**
 * Get initials for avatar display.
 *
 * @param {Object} user - User object with name fields
 * @returns {string} 1-2 character initials
 */
export function getUserInitials(user) {
  if (!user) return '?'

  const first = (user.first_name || '').trim()
  const last = (user.last_name || '').trim()

  if (first && last) return `${first[0]}${last[0]}`.toUpperCase()
  if (first) return first[0].toUpperCase()
  if (user.display_name) return user.display_name[0].toUpperCase()
  if (user.email) return user.email[0].toUpperCase()
  return '?'
}
