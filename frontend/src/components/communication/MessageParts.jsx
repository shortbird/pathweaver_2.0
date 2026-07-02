/**
 * Shared building blocks for message bubbles (DMs and group chats):
 * reply quotes, attachments, reaction pills, the hover action bar and
 * inline edit form.
 */
import React, { useState, useRef, useEffect } from 'react'
import {
  FaceSmileIcon,
  ArrowUturnLeftIcon,
  PencilIcon,
  TrashIcon,
  MapPinIcon,
  DocumentIcon
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
 * Small quoted block above a message's content showing what it replies to.
 * `light` renders it for use on the gradient (own-message) bubble.
 */
export const ReplyQuote = ({ replyTo, light = false }) => {
  if (!replyTo) return null
  return (
    <div
      className={`mb-1.5 px-2.5 py-1.5 rounded-lg border-l-2 text-xs ${
        light
          ? 'bg-white/15 border-white/60 text-white/90'
          : 'bg-gray-100 border-optio-purple text-gray-600'
      }`}
    >
      <p className={`font-semibold ${light ? 'text-white' : 'text-optio-purple'}`}>
        {replyTo.sender_name || 'Unknown'}
      </p>
      <p className="truncate">{replyTo.content}</p>
    </div>
  )
}

/** Renders a message's attachments (images, video, audio, generic files). */
export const AttachmentList = ({ attachments, light = false }) => {
  if (!attachments?.length) return null
  return (
    <div className="mt-1.5 space-y-2">
      {attachments.map((att, i) => {
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
            className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs max-w-[240px] ${
              light
                ? 'bg-white/15 text-white hover:bg-white/25'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            } transition-colors`}
          >
            <DocumentIcon className="w-4 h-4 flex-shrink-0" />
            <span className="truncate font-medium">{att.name || 'File'}</span>
            {att.size ? (
              <span className={`flex-shrink-0 ${light ? 'text-white/70' : 'text-gray-400'}`}>
                {formatFileSize(att.size)}
              </span>
            ) : null}
          </a>
        )
      })}
    </div>
  )
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
          aria-label={`${r.emoji} ${r.count}`}
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

/**
 * Floating action bar shown on message hover (desktop): react (emoji picker
 * popover), reply, and edit/delete/pin when permitted. Rendered inside a
 * `group relative` message row.
 */
export const MessageActionBar = ({
  isOwn = false,
  canEdit = false,
  canDelete = false,
  canPin = false,
  onReact,
  onReply,
  onEdit,
  onDelete,
  onPin
}) => {
  const [showPicker, setShowPicker] = useState(false)
  const [pickerBelow, setPickerBelow] = useState(false)
  const rootRef = useRef(null)

  // The picker prefers opening upward, but the first message(s) in a thread
  // have no room above inside the scroll container — flip it below the bar.
  const togglePicker = () => {
    if (!showPicker && rootRef.current) {
      const rect = rootRef.current.getBoundingClientRect()
      const scroller = rootRef.current.closest('.overflow-y-auto')
      const topEdge = scroller ? scroller.getBoundingClientRect().top : 0
      setPickerBelow(rect.top - topEdge < 56)
    }
    setShowPicker((v) => !v)
  }

  // Close the emoji picker on outside click
  useEffect(() => {
    if (!showPicker) return undefined
    const handle = (e) => {
      if (rootRef.current && !rootRef.current.contains(e.target)) setShowPicker(false)
    }
    document.addEventListener('mousedown', handle)
    return () => document.removeEventListener('mousedown', handle)
  }, [showPicker])

  const itemClass =
    'p-1.5 text-gray-500 hover:text-optio-purple hover:bg-gray-100 rounded-full transition-colors'

  return (
    <div
      ref={rootRef}
      className={`absolute -top-3.5 ${isOwn ? 'right-1' : 'left-1'} z-10 transition-opacity ${
        showPicker
          ? 'opacity-100'
          : 'opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto focus-within:opacity-100 focus-within:pointer-events-auto'
      }`}
    >
      <div className="relative flex items-center gap-0.5 bg-white border border-gray-200 rounded-full px-1 py-0.5 shadow-md">
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
                  setShowPicker(false)
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
