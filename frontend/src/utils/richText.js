/**
 * Message bodies that may or may not be formatted.
 *
 * Announcements written before the editor existed are plain text; ones written
 * with it are HTML. Every place that reads a body has to handle both — these
 * three helpers are how, and they mirror backend/utils/rich_text.py exactly so
 * the two sides agree on what "empty" and "the text of this" mean.
 */

const HTML_TAG = /<(?:[a-z][a-z0-9]*)\b[^>]*>/i
const BLOCK_TAG = /<\/?(?:p|div|li|ul|ol|h[1-6]|blockquote|pre|tr|br|hr)\b[^>]*>/gi

/** True when this body was written with the editor rather than typed plain. */
export const isHtml = (value) => typeof value === 'string' && HTML_TAG.test(value)

/**
 * The readable text of a body — for previews, counting, and deciding whether
 * anything was actually written. Block boundaries become newlines so a list
 * doesn't collapse into one line.
 */
export const htmlToText = (value) => {
  if (!value || typeof value !== 'string') return ''
  if (!isHtml(value)) return value
  const withBreaks = value.replace(BLOCK_TAG, '\n')
  const el = document.createElement('div')
  el.innerHTML = withBreaks
  return (el.textContent || '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .join('\n')
}

/**
 * True when a body has nothing in it. An empty editor still emits "<p></p>",
 * which is why `!content.trim()` is not the check.
 */
export const isBlank = (value) => !htmlToText(value).trim()
