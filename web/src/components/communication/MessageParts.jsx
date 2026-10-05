/**
 * Shared building blocks for message bubbles (DMs, group chats, the SIS
 * inbox): reply quotes, attachments, reaction pills, the hover action bar,
 * the inline edit form, and the one timestamp rule.
 *
 * The bubble itself is MessageBubble.jsx and the scroll rules are
 * useThreadScroll.js. Nothing here knows which surface it
 * is on: the same message reads the same on /messages and in the school
 * console, which is the whole point of the file.
 */
import React, { useState, useRef, useEffect, useLayoutEffect, forwardRef, useImperativeHandle } from 'react'
import {
  FaceSmileIcon,
  ArrowUturnLeftIcon,
  ArrowUturnRightIcon,
  PencilIcon,
  TrashIcon,
  MapPinIcon,
  EnvelopeIcon,
  DocumentIcon,
  FlagIcon
} from '@heroicons/react/24/outline'

// The only reactions the backend accepts.
export const REACTION_EMOJI = ['👍', '❤️', '😂', '🎉', '😮', '😢']

export const formatFileSize = (bytes) => {
  if (typeof bytes !== 'number' || Number.isNaN(bytes)) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

/**
 * "9:30 AM" today, "Tue 9:30 AM" inside the week, "Aug 30, 9:30 AM" beyond.
 * One rule for every bubble; three surfaces used to each have their own.
 */
export const formatMessageTime = (timestamp) => {
  if (!timestamp) return ''
  const date = new Date(timestamp)
  const now = new Date()
  if (date.toDateString() === now.toDateString()) {
    return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
  }
  const diffDays = Math.floor((now - date) / (1000 * 60 * 60 * 24))
  if (diffDays >= 0 && diffDays < 7) {
    return date.toLocaleDateString('en-US', { weekday: 'short', hour: 'numeric', minute: '2-digit' })
  }
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

// Footer label for a message's origin. The backend only puts `sent_from` on a
// row for a superadmin viewer (messaging_extras_service.enrich_messages), so
// for everyone else there is nothing to label.
const SENT_FROM_LABELS = { mobile: 'Mobile', web: 'Web', sis: 'SIS', email: 'Email' }

/**
 * "MOBILE" / "WEB" in a bubble's footer: which surface sent the message.
 * Renders nothing when the row carries no `sent_from` -- every non-superadmin
 * viewer, and every message from before 2026-09-16.
 */
export const SentFromTag = ({ sentFrom }) => {
  const label = sentFrom ? SENT_FROM_LABELS[sentFrom] : null
  if (!label) return null
  return (
    <span
      aria-label={`Sent from ${label}`}
      className="inline-block text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded bg-gray-100 text-gray-500"
    >
      {label}
    </span>
  )
}

/** Small quoted block above a message's content showing what it replies to. */
export const ReplyQuote = ({ replyTo }) => {
  if (!replyTo) return null
  return (
    <div className="mb-1.5 px-2.5 py-1.5 rounded-lg border-l-2 text-xs bg-gray-900/5 border-optio-purple text-gray-600">
      <p className="font-semibold text-optio-purple">{replyTo.sender_name || 'Unknown'}</p>
      <p className="truncate">{replyTo.content}</p>
    </div>
  )
}

/**
 * Renders a message's attachments (images, video, audio, generic files).
 *
 * A row read from the server carries a signed `url`. A row that is still the
 * sender's optimistic bubble carries what the upload returned: `url` is the
 * durable pointer into a private bucket (what gets stored) and `display_url`
 * the signed twin. Rendering `url` on the bubble showed a blank image box
 * until the saved row arrived -- "it appears blank for a bit right before it
 * posts" -- so the twin is preferred whenever it is there.
 */
export const AttachmentList = ({ attachments }) => {
  if (!attachments?.length) return null
  return (
    <div className="mt-1.5 space-y-2">
      {attachments.map((raw, i) => {
        const att = { ...raw, url: raw.display_url || raw.url }
        const key = att.url || i
        if (att.type === 'image') {
          return (
            <a key={key} href={att.url} target="_blank" rel="noopener noreferrer" className="block">
              <img
                src={att.url}
                alt={att.name || 'Image attachment'}
                className="max-h-56 rounded-lg object-cover"
              />
            </a>
          )
        }
        if (att.type === 'video') {
          return (
            <video key={key} controls src={att.url} className="max-h-56 w-full rounded-lg" />
          )
        }
        if (att.type === 'audio') {
          return <audio key={key} controls src={att.url} className="w-full" />
        }
        return (
          <a
            key={key}
            href={att.url}
            download={att.name}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs max-w-[240px] bg-gray-100 text-gray-700 hover:bg-gray-200 transition-colors"
          >
            <DocumentIcon className="w-4 h-4 flex-shrink-0" />
            <span className="truncate font-medium">{att.name || 'File'}</span>
            {att.size ? (
              <span className="flex-shrink-0 text-gray-400">{formatFileSize(att.size)}</span>
            ) : null}
          </a>
        )
      })}
    </div>
  )
}

/**
 * "Sam Lee, Kate Myers and 3 others" — who is behind a reaction pill.
 *
 * A count says how many; the question asked was who (iCreate, 2026-09-05: "is
 * there a way to see who reacts with an emoji?"). The server sends up to a
 * dozen names, so a pill on a class-wide thumbs-up still reads as a sentence
 * rather than a roster.
 */
export const reactorSummary = (r) => {
  const names = r?.names || []
  // No names is not "nobody": a message loaded before the server sent them, or
  // a cached payload. The pill says what it always said rather than inventing.
  if (!names.length) return ''
  const extra = (r.count || names.length) - names.length
  const listed = names.length === 1 ? names[0]
    : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
  return extra > 0 ? `${listed} and ${extra} other${extra === 1 ? '' : 's'}` : listed
}

/** Row of reaction pills under a bubble. Own reactions get an optio-purple ring. */
export const ReactionsRow = ({ reactions, onToggle, align = 'start' }) => {
  const visible = (reactions || []).filter((r) => r.count > 0)
  if (!visible.length) return null
  return (
    <div className={`flex flex-wrap gap-1 mt-1 ${align === 'end' ? 'justify-end' : ''}`}>
      {visible.map((r) => (
        <button
          key={r.emoji}
          type="button"
          onClick={() => onToggle?.(r.emoji)}
          aria-pressed={!!r.reacted}
          // Hover on a mouse, and read out by a screen reader — the two ways
          // the names are reachable without a tap target of their own.
          title={reactorSummary(r) ? `${reactorSummary(r)} reacted with ${r.emoji}` : undefined}
          aria-label={reactorSummary(r)
            ? `${r.emoji} ${r.count} — ${reactorSummary(r)}`
            : `${r.emoji} ${r.count}`}
          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border bg-white text-xs transition-colors ${
            r.reacted
              ? 'border-optio-purple ring-1 ring-optio-purple text-optio-purple'
              : 'border-gray-200 text-gray-600 hover:border-optio-purple'
          }`}
        >
          <span>{r.emoji}</span>
          <span className="font-medium">{r.count}</span>
        </button>
      ))}
    </div>
  )
}

// The action bar's slot, in px: a 34px bar plus 4px of air above the bubble.
// The slot opens to exactly this and the scroller moves by exactly this, so
// the hovered bubble does not move.
export const ACTION_BAR_PX = 38

/**
 * One message's row: alignment, and the hover/focus state that opens its
 * action bar. Renders `children(open, hold)`; the child puts the
 * MessageActionBar where it belongs in its own layout and hands it both.
 *
 * The bar is IN the flow, above the bubble, so the thread makes room for it
 * rather than the bar covering anything. Making room means the row grows by
 * ACTION_BAR_PX at its top, which would push the hovered bubble down under
 * the cursor. So the scroller is moved by the same amount in the same commit,
 * before paint: the bubble under the cursor and everything below it stay
 * put, and the messages above slide up to make the room. Leaving the row
 * puts them back. The scroll position is read in the event handler, before
 * React touches the DOM -- reading it after the slot has already collapsed
 * would see a value the browser had clamped to the shorter content, and a
 * reader at the bottom of the thread would land a bar's height above it.
 *
 * `hold` is how the bar keeps the row open while its emoji picker is up and
 * the mouse has wandered off.
 */
export const MessageRow = forwardRef(({ isOwn = false, className = '', children }, ref) => {
  const rowRef = useRef(null)
  useImperativeHandle(ref, () => rowRef.current)
  const [hovered, setHovered] = useState(false)
  const [held, setHeld] = useState(false)
  const open = hovered || held
  const pending = useRef(null)

  const capture = () => {
    const scroller = rowRef.current?.closest('.overflow-y-auto')
    pending.current = scroller ? { scroller, top: scroller.scrollTop } : null
  }
  const setOpenState = (setter) => (next) => {
    capture()
    setter(next)
  }
  const hover = setOpenState(setHovered)
  const hold = setOpenState(setHeld)

  const wasOpen = useRef(false)
  useLayoutEffect(() => {
    if (open === wasOpen.current) return
    wasOpen.current = open
    const p = pending.current
    pending.current = null
    if (!p) return
    p.scroller.scrollTop = p.top + (open ? ACTION_BAR_PX : -ACTION_BAR_PX)
  }, [open])

  return (
    <div
      ref={rowRef}
      className={`flex ${isOwn ? 'justify-end' : 'justify-start'} ${className}`}
      onMouseEnter={() => hover(true)}
      onMouseLeave={() => hover(false)}
      onFocus={() => hover(true)}
      onBlur={(e) => {
        if (!rowRef.current?.contains(e.relatedTarget)) hover(false)
      }}
    >
      {children(open, hold)}
    </div>
  )
})
MessageRow.displayName = 'MessageRow'

/**
 * The action bar above a message: react (emoji picker popover), reply, and
 * forward/email/report/pin/edit/delete when permitted. Rendered inside a
 * MessageRow, which passes `open` (hover or keyboard focus on the row) and
 * `onHold` (see there). Its buttons are always in the DOM so the keyboard can
 * reach them; the slot is just 0px tall until it is wanted.
 *
 * The slot has the bar's HEIGHT and no width: it is in the flow vertically,
 * so the thread makes room, and out of it horizontally, so a two-word
 * bubble is not stretched to the width of seven buttons. The bar hangs off
 * the bubble's outer edge -- right for own messages, left for others.
 */
export const MessageActionBar = ({
  open = false,
  onHold,
  isOwn = false,
  canEdit = false,
  canDelete = false,
  canPin = false,
  canForward = false,
  canEmailToSelf = false,
  canReport = false,
  onReact,
  onReply,
  onEdit,
  onDelete,
  onPin,
  onForward,
  onEmailToSelf,
  onReport
}) => {
  const [showPicker, setShowPicker] = useState(false)
  const [pickerBelow, setPickerBelow] = useState(false)
  const rootRef = useRef(null)
  const shown = open || showPicker

  const setPicker = (next) => {
    onHold?.(next)
    setShowPicker(next)
  }

  // The picker prefers opening upward, but the first message(s) in a thread
  // have no room above inside the scroll container — flip it below the bar.
  const togglePicker = () => {
    if (!showPicker && rootRef.current) {
      const rect = rootRef.current.getBoundingClientRect()
      const scroller = rootRef.current.closest('.overflow-y-auto')
      const topEdge = scroller ? scroller.getBoundingClientRect().top : 0
      setPickerBelow(rect.top - topEdge < 56)
    }
    setPicker(!showPicker)
  }

  // Close the emoji picker on outside click
  useEffect(() => {
    if (!showPicker) return undefined
    const handle = (e) => {
      if (rootRef.current && !rootRef.current.contains(e.target)) setPicker(false)
    }
    document.addEventListener('mousedown', handle)
    return () => document.removeEventListener('mousedown', handle)
  }, [showPicker])

  const itemClass =
    'p-1.5 text-gray-500 hover:text-optio-purple hover:bg-gray-100 rounded-full transition-colors'

  return (
    <div
      data-testid="message-action-bar"
      data-open={shown ? 'true' : 'false'}
      className={`relative w-0 ${isOwn ? 'ml-auto' : ''} ${shown ? 'overflow-visible z-10' : 'overflow-hidden'}`}
      style={{ height: shown ? ACTION_BAR_PX : 0 }}
    >
      <div
        ref={rootRef}
        className={`absolute top-0 ${isOwn ? 'right-0' : 'left-0'} flex items-center gap-0.5 whitespace-nowrap bg-white border border-gray-200 rounded-full px-1 py-0.5 shadow-md ${
          shown ? 'motion-safe:animate-bar-bounce' : ''
        }`}
      >
        <button
          type="button"
          title="React"
          aria-label="Add reaction"
          onClick={togglePicker}
          className={itemClass}
        >
          <FaceSmileIcon className="w-4 h-4" />
        </button>
        <button type="button" title="Reply" aria-label="Reply" onClick={onReply} className={itemClass}>
          <ArrowUturnLeftIcon className="w-4 h-4" />
        </button>
        {canForward && (
          <button
            type="button"
            title="Forward to the school's admins"
            aria-label="Forward to the school's admins"
            onClick={onForward}
            className={itemClass}
          >
            <ArrowUturnRightIcon className="w-4 h-4" />
          </button>
        )}
        {canEmailToSelf && (
          <button
            type="button"
            title="Email this to me"
            aria-label="Email this message to me"
            onClick={onEmailToSelf}
            className={itemClass}
          >
            <EnvelopeIcon className="w-4 h-4" />
          </button>
        )}
        {canReport && (
          <button type="button" title="Report" aria-label="Report message" onClick={onReport} className={itemClass}>
            <FlagIcon className="w-4 h-4" />
          </button>
        )}
        {canPin && (
          <button type="button" title="Pin" aria-label="Pin message" onClick={onPin} className={itemClass}>
            <MapPinIcon className="w-4 h-4" />
          </button>
        )}
        {canEdit && (
          <button type="button" title="Edit" aria-label="Edit message" onClick={onEdit} className={itemClass}>
            <PencilIcon className="w-4 h-4" />
          </button>
        )}
        {canDelete && (
          <button
            type="button"
            title="Delete"
            aria-label="Delete message"
            onClick={onDelete}
            className="p-1.5 text-gray-500 hover:text-red-500 hover:bg-red-50 rounded-full transition-colors"
          >
            <TrashIcon className="w-4 h-4" />
          </button>
        )}

        {showPicker && (
          <div className={`absolute ${pickerBelow ? 'top-full mt-1.5' : 'bottom-full mb-1.5'} ${isOwn ? 'right-0' : 'left-0'} flex items-center gap-1 bg-white border border-gray-200 rounded-full px-2 py-1.5 shadow-lg z-20`}>
            {REACTION_EMOJI.map((emoji) => (
              <button
                key={emoji}
                type="button"
                aria-label={`React with ${emoji}`}
                onClick={() => {
                  onReact?.(emoji)
                  setPicker(false)
                }}
                className="text-lg leading-none hover:scale-125 transition-transform"
              >
                {emoji}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

/** Inline edit form replacing the bubble content while editing a message. */
export const MessageEditForm = ({ initialContent, onSave, onCancel, saving = false }) => {
  const [value, setValue] = useState(initialContent || '')

  const handleSave = () => {
    const trimmed = value.trim()
    if (trimmed) onSave(trimmed)
  }

  return (
    <div className="w-full min-w-[200px]">
      <textarea
        autoFocus
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault()
            handleSave()
          }
          if (e.key === 'Escape') onCancel()
        }}
        rows={2}
        maxLength={2000}
        aria-label="Edit message"
        className="w-full text-sm text-gray-900 bg-white border border-gray-300 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-optio-purple focus:border-transparent resize-none"
      />
      <div className="flex items-center justify-end gap-2 mt-1">
        <button
          type="button"
          onClick={onCancel}
          className="text-xs px-2 py-1 rounded text-gray-600 bg-white border border-gray-200 hover:bg-gray-50"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={!value.trim() || saving}
          className="text-xs px-2.5 py-1 rounded bg-optio-purple text-white hover:bg-optio-purple/90 disabled:opacity-50"
        >
          Save
        </button>
      </div>
    </div>
  )
}
