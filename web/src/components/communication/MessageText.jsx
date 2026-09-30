import React from 'react'
import { splitUrls } from '../announcements/AnnouncementBody'

/**
 * A message body, with its links clickable.
 *
 * Chat messages are plain text and were rendered as plain text, so a teacher
 * who pasted a Google Doc or a sign-up form into a class chat had posted a
 * 90-character string that everyone had to select and copy by hand — on a
 * phone, mostly (iCreate, 2026-09-04: "hyperlinks in class chat groups would
 * be very helpful").
 *
 * Deliberately NOT AnnouncementBody: an announcement is a staff-written
 * newsletter and its links become labeled buttons, which is right for a notice
 * and wrong inside a chat bubble, where a link sits mid-sentence and the
 * bubble is already tinted. Same URL detection (splitUrls), different dress.
 *
 * The text is rendered as text — React escapes it — so nothing a person types
 * into a chat can become markup, and only an http(s) match becomes an anchor.
 *
 * `[overflow-wrap:anywhere]` and not only `break-words`: break-words wraps a
 * long word once the box is sized, but does not lower the box's min-content
 * width, so inside a flex row an unbroken email or domain still set the
 * bubble's width and ran off the edge of the chat (iCreate, 2026-09-29,
 * f2ad5cda: "Some of the messages I've received extend too far horizontally
 * past the frame of the chat so I can't see the full message").
 */
export default function MessageText({ text, className = '' }) {
  if (!text) return null
  const segments = splitUrls(text)
  return (
    <p className={`whitespace-pre-wrap break-words [overflow-wrap:anywhere] ${className}`}>
      {segments.map((s, i) => (s.url ? (
        <a
          key={i}
          href={s.url}
          target="_blank"
          rel="noopener noreferrer"
          // Both bubbles are dark text on a light ground (MessageBubble), so
          // one link color reads on either.
          className="text-optio-purple underline decoration-1 underline-offset-2 hover:text-optio-purple-dark break-all"
        >
          {s.url}
        </a>
      ) : (
        <React.Fragment key={i}>{s.text}</React.Fragment>
      )))}
    </p>
  )
}
