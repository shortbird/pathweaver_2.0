import React from 'react'
import { sanitizeHtml } from '../../utils/sanitize'
import { isHtml } from '../../utils/richText'

/**
 * An announcement or noticeboard body, however it was written.
 *
 * Bodies written with the editor are HTML; everything posted before it existed
 * (and anything typed into a plain field) is text with line breaks. Rendering
 * one as the other is the visible failure — raw `<p>` tags on the family page,
 * or a wall of unbroken text — so both cases live in one component that every
 * reader uses.
 *
 * HTML is sanitized at render as well as on the way in, because a body that
 * predates the sanitizer is still in the table.
 */
export default function AnnouncementBody({ text, className = '' }) {
  if (!text) return null
  if (isHtml(text)) {
    return (
      <div
        className={`prose prose-sm max-w-none ${className}`}
        dangerouslySetInnerHTML={{ __html: sanitizeHtml(text) }}
      />
    )
  }
  return <p className={`whitespace-pre-wrap ${className}`}>{text}</p>
}
