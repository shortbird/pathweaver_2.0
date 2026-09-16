import React, { useEffect, useState } from 'react'
import { AcademicCapIcon, MapPinIcon } from '@heroicons/react/24/outline'

// Optio "favicon" mark, used as the avatar for the Optio Support contact.
export const OPTIO_LOGO_URL = 'https://auth.optioeducation.com/storage/v1/object/public/site-assets/logos/gradient_fav.svg'

// Row size in CSS pixels. Passed to every <img> so the browser reserves the
// space before the bytes land and the list stops reflowing as avatars arrive.
export const AVATAR_PX = 40

export const formatListTime = (timestamp) => {
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
export const Avatar = React.memo(({ src, name, initial }) => {
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

export const UnreadBadge = ({ count }) => (
  <div className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 bg-red-500 rounded-full flex items-center justify-center">
    <span className="text-white text-[10px] font-bold">{count > 9 ? '9+' : count}</span>
  </div>
)

/**
 * One row in a list of one-to-one threads: avatar, name, when, last line,
 * unread badge. /messages and the school inbox both render it; the inbox used
 * to carry its own copy of the same forty lines.
 *
 * Memoized, and declared at module scope rather than inside a list. Declared
 * in a parent's body it was a new component type on every render, so React
 * tore down and rebuilt every row — including its <img> — each time the search
 * box changed by one character. Typing a name flickered the whole list and
 * re-fetched every avatar in it. Memo means a keystroke re-renders only the
 * rows whose props actually changed; `onSelect` must stay referentially stable
 * for that to hold, which is what the useCallback in the parent is for.
 */
const ThreadRow = React.memo(({ conversation, isSelected, onSelect }) => {
  const isPinned = conversation.type === 'advisor'
  const isSupport = conversation.type === 'support' || conversation.relationshipTypes?.includes('support')
  const isSchool = conversation.type === 'school' || conversation.relationshipTypes?.includes('school') ||
    conversation.other_user?.is_school
  const hasThread = !!conversation.last_message_at
  const isUnread = conversation.unread_count > 0
  const displayName = `${conversation.other_user?.first_name || ''} ${conversation.other_user?.last_name || ''}`.trim() ||
    conversation.other_user?.display_name || 'Unknown'
  const initial = displayName?.charAt(0)?.toUpperCase() || '?'
  // Only the backend fills this in, and only for superadmin viewers: which
  // school this person belongs to, so the support inbox knows whose member
  // is writing without opening another tab.
  const orgName = conversation.other_user?.organization_name

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
          <div className="flex items-center gap-1.5 min-w-0">
            <h3 className={`truncate ${isUnread ? 'font-bold text-gray-900' : 'font-semibold text-gray-800'}`}>
              {displayName}
            </h3>
            {orgName && (
              <span
                title={orgName}
                className="flex-shrink-0 max-w-[45%] truncate text-[11px] font-medium text-optio-purple bg-optio-purple/10 px-1.5 py-0.5 rounded-full"
              >
                {orgName}
              </span>
            )}
          </div>
          {hasThread && (
            <span className="text-xs text-gray-400 flex-shrink-0">
              {formatListTime(conversation.last_message_at)}
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
ThreadRow.displayName = 'ThreadRow'

export default ThreadRow
