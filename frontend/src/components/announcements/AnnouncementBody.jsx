import React, { useMemo } from 'react'
import { ArrowTopRightOnSquareIcon } from '@heroicons/react/24/outline'
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
 *
 * Links render as buttons, not as URLs. Staff paste full Google-Docs and
 * sign-up URLs into announcements, and a 90-character URL is noise a parent
 * has to read around. Every http(s) link — pasted into a plain body, typed as
 * bare text in the editor, or a proper editor link — becomes a small labeled
 * button. A link whose visible text IS its URL gets the site's hostname as its
 * label; text the author actually wrote is kept.
 */

const LINK_CLS = 'inline-flex max-w-full items-center gap-1.5 rounded-lg bg-optio-purple/10 px-3 py-1 text-sm font-medium text-optio-purple no-underline hover:bg-optio-purple/20 transition-colors align-middle'

const URL_RE = /https?:\/\/[^\s<>"']+/g

/** "https://www.acme.com/x/y" -> "acme.com" — the label a pasted URL gets. */
const hostLabel = (url) => {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}

/** Trailing sentence punctuation belongs to the sentence, not the URL. */
const trimUrl = (url) => url.replace(/[.,;:!?)\]]+$/, '')

/** Split plain text into alternating { text } and { url } segments. */
const splitUrls = (text) => {
  const parts = []
  let last = 0
  for (const m of text.matchAll(URL_RE)) {
    const url = trimUrl(m[0])
    if (m.index > last) parts.push({ text: text.slice(last, m.index) })
    parts.push({ url })
    last = m.index + url.length
  }
  if (last < text.length) parts.push({ text: text.slice(last) })
  return parts
}

// heroicons/24/outline arrow-top-right-on-square, built with DOM calls because
// it goes inside an innerHTML string.
const ICON_D = 'M13.5 6H5.25A2.25 2.25 0 0 0 3 8.25v10.5A2.25 2.25 0 0 0 5.25 21h10.5A2.25 2.25 0 0 0 18 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25'

const externalIcon = (doc) => {
  const svg = doc.createElementNS('http://www.w3.org/2000/svg', 'svg')
  svg.setAttribute('viewBox', '0 0 24 24')
  svg.setAttribute('fill', 'none')
  svg.setAttribute('stroke', 'currentColor')
  svg.setAttribute('stroke-width', '1.5')
  svg.setAttribute('class', 'w-3.5 h-3.5 flex-shrink-0')
  svg.setAttribute('aria-hidden', 'true')
  const path = doc.createElementNS('http://www.w3.org/2000/svg', 'path')
  path.setAttribute('stroke-linecap', 'round')
  path.setAttribute('stroke-linejoin', 'round')
  path.setAttribute('d', ICON_D)
  svg.appendChild(path)
  return svg
}

/**
 * Turn every link in ALREADY-SANITIZED HTML into a labeled button. Runs after
 * sanitizeHtml on purpose: it only ever adds anchors whose href matched URL_RE
 * (so no javascript: can get in this way) and text set via textContent.
 */
const buttonizeLinks = (safeHtml) => {
  const doc = new DOMParser().parseFromString(safeHtml, 'text/html')

  // Heal auto-linker truncations. An editor that linkifies while the author
  // types can close the anchor early, stranding the tail of the URL as plain
  // text right after it — a real iCreate announcement held
  // <a href=".../camps--workshops">…</a>.html, a button pointing at the wrong
  // URL with ".html" dangling after it. When an anchor's text IS its href and
  // the next characters continue with no whitespace, they are the rest of the
  // URL: fold them in. Sentence punctuation ("<a>…</a>. Thanks") survives
  // because trimUrl reduces a bare "." to nothing.
  for (const a of doc.body.querySelectorAll('a[href]')) {
    const href = a.getAttribute('href') || ''
    if (!/^https?:/i.test(href)) continue
    if ((a.textContent || '').trim() !== href) continue
    const next = a.nextSibling
    if (!next || next.nodeType !== Node.TEXT_NODE) continue
    const m = (next.nodeValue || '').match(/^[^\s<]+/)
    if (!m) continue
    const tail = trimUrl(m[0])
    if (!tail) continue
    a.setAttribute('href', href + tail)
    a.textContent = href + tail
    next.nodeValue = next.nodeValue.slice(tail.length)
  }

  // Bare URLs typed as text in the editor become links first.
  const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT)
  const textNodes = []
  while (walker.nextNode()) textNodes.push(walker.currentNode)
  for (const node of textNodes) {
    if (node.parentElement?.closest('a')) continue
    const segments = splitUrls(node.nodeValue || '')
    if (!segments.some((s) => s.url)) continue
    const frag = doc.createDocumentFragment()
    for (const s of segments) {
      if (s.url) {
        const a = doc.createElement('a')
        a.setAttribute('href', s.url)
        a.textContent = s.url
        frag.appendChild(a)
      } else {
        frag.appendChild(doc.createTextNode(s.text))
      }
    }
    node.parentNode.replaceChild(frag, node)
  }

  for (const a of doc.body.querySelectorAll('a[href]')) {
    const href = a.getAttribute('href') || ''
    const external = /^https?:/i.test(href)
    const label = (a.textContent || '').trim()
    if (external && trimUrl(label) === trimUrl(href)) a.textContent = hostLabel(href)
    a.setAttribute('class', LINK_CLS)
    a.setAttribute('title', href)
    if (external) {
      a.setAttribute('target', '_blank')
      a.setAttribute('rel', 'noopener noreferrer')
      a.appendChild(externalIcon(doc))
    }
  }
  return doc.body.innerHTML
}

// The render site re-sanitizes buttonizeLinks' output, so the LAST thing
// before the DOM is always DOMPurify (and the S2 lint can see it there).
// The external-link SVG the buttons carry would be stripped by the default
// allowlist; these entries let exactly it through.
const LINK_BUTTON_CONFIG = {
  ADD_TAGS: ['svg', 'path'],
  ADD_ATTR: ['target', 'rel', 'viewBox', 'fill', 'stroke',
             'stroke-width', 'stroke-linecap', 'stroke-linejoin', 'd'],
}

export default function AnnouncementBody({ text, className = '' }) {
  const html = useMemo(
    () => (text && isHtml(text) ? buttonizeLinks(sanitizeHtml(text)) : null),
    [text],
  )
  if (!text) return null
  if (html !== null) {
    return (
      <div
        className={`prose rich-body max-w-none ${className}`}
        dangerouslySetInnerHTML={{ __html: sanitizeHtml(html, LINK_BUTTON_CONFIG) }}
      />
    )
  }
  const segments = splitUrls(text)
  return (
    <p className={`whitespace-pre-wrap ${className}`}>
      {segments.map((s, i) => (s.url ? (
        <a
          key={i}
          href={s.url}
          target="_blank"
          rel="noopener noreferrer"
          title={s.url}
          className={LINK_CLS}
        >
          <span className="truncate">{hostLabel(s.url)}</span>
          <ArrowTopRightOnSquareIcon className="w-3.5 h-3.5 flex-shrink-0" aria-hidden="true" />
        </a>
      ) : (
        <React.Fragment key={i}>{s.text}</React.Fragment>
      )))}
    </p>
  )
}
