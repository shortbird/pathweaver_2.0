import React from 'react'
import { ReplyQuote, SentFromTag, AttachmentList, MessageEditForm, formatMessageTime } from './MessageParts'
import MessageText from './MessageText'

/**
 * One message bubble, for every surface that shows a thread: DMs and group
 * chats on /messages, the class chats in the school console, and the school
 * inbox. It used to be three copies (four with the parent's read-only view),
 * each with its own corner radii, footer and timestamp rule, so a fix to one
 * shipped to one.
 *
 * Own messages sit on a brand tint with dark text, not the purple-pink
 * gradient with white text they used to. The gradient was the loudest thing
 * on the page, and every element inside a sent bubble -- reply quote,
 * attachment chip, link, timestamp -- needed a second, "light" styling so it
 * could be read on it. One ground for both sides, and everything inside a
 * bubble is styled once.
 *
 * `seen` is the one read receipt: " · Seen" on the last message in the
 * thread, when it is ours and the other side has opened it. DMs used to
 * stamp every own message "Read" or "Sent" while the school inbox said
 * "Seen" once; the quiet one won ("Don't even know if he saw it", 4ae1c6d1,
 * is answered either way). `meta` is appended after it for what only one
 * surface has to say (" · Sent by Kate").
 *
 * Since 2026-09-23 (iCreate, 9b46c748: "add read receipts") the receipt says
 * WHEN: pass the read time as `seen` and it reads " · Seen 2:14 PM" (`true`
 * still reads " · Seen"). A group has no one reader, so `seenBy` is the list
 * of members who have read past this message: " · Seen by 3", with their
 * names on hover.
 *
 * `message.sender_label` ("Kate for iCreate") is set by the server on a school
 * message a staff member wrote with their name shown -- a teacher answering a
 * thread the office handed them (d93b24d2). It sits above the text, where a
 * group chat puts the sender's name.
 */
export const OWN_BUBBLE_CLASS = 'bg-optio-purple/10 border border-optio-purple/20 text-gray-900 rounded-2xl rounded-br-md'
export const OTHER_BUBBLE_CLASS = 'bg-white border border-gray-200 text-gray-900 rounded-2xl rounded-bl-md'

const MessageBubble = ({
  message,
  isOwn = false,
  isEditing = false,
  onSaveEdit,
  onCancelEdit,
  savingEdit = false,
  seen = false,
  seenBy = null,
  meta = null
}) => {
  const seenText = seen
    ? (typeof seen === 'string' ? ` · Seen ${formatMessageTime(seen)}` : ' · Seen')
    : ''
  const seenByNames = (seenBy || []).filter(Boolean)
  const isDeleted = !!message.is_deleted
  return (
    <div
      className={`px-3.5 py-2 text-sm ${isOwn ? OWN_BUBBLE_CLASS : OTHER_BUBBLE_CLASS} ${
        message.isOptimistic ? 'opacity-70' : ''
      }`}
    >
      {isDeleted && !message.deleted_visible_to_admin ? (
        <p className="italic text-sm text-gray-400">Message deleted</p>
      ) : isEditing ? (
        <MessageEditForm
          initialContent={message.message_content}
          onSave={onSaveEdit}
          onCancel={onCancelEdit}
          saving={savingEdit}
        />
      ) : (
        <>
          {isDeleted && message.deleted_visible_to_admin && (
            <span className="inline-block text-[10px] font-semibold uppercase tracking-wide mb-1 px-1.5 py-0.5 rounded bg-red-100 text-red-600">
              Deleted
            </span>
          )}
          {message.sender_label && (
            <p className="text-xs font-semibold text-optio-purple mb-0.5">{message.sender_label}</p>
          )}
          <ReplyQuote replyTo={message.reply_to} />
          <MessageText text={message.message_content} />
          <AttachmentList attachments={message.attachments} />
        </>
      )}
      <p className="inline-flex items-center gap-1.5 mt-1 text-xs text-gray-500">
        <SentFromTag sentFrom={message.sent_from} />
        <span>
          {formatMessageTime(message.created_at)}
          {message.edited_at && !isDeleted && <span className="text-gray-400"> (edited)</span>}
          {message.isOptimistic && ' (Sending...)'}
          {seenText}
          {seenByNames.length > 0 && (
            <span title={seenByNames.join(', ')}>{` · Seen by ${seenByNames.length}`}</span>
          )}
          {meta}
        </span>
      </p>
    </div>
  )
}

export default MessageBubble
