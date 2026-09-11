/**
 * Where a link can be shown inside the page, and at what address.
 *
 * Most editors refuse to be framed and most viewers do not, so a Google Doc's
 * `/edit` link comes back as its `/preview`, a Canva design gets `?embed`, and
 * so on. Anything unrecognised is returned as it came: the site decides whether
 * it loads in a frame, and the reviewer gets an "Open in new tab" link either
 * way. Non-http schemes return null and are never framed.
 */

const ALLOWED = ['http:', 'https:']

export const getEmbedUrl = (url) => {
  if (!url) return null
  let parsed
  try {
    parsed = new URL(String(url).trim())
  } catch {
    return null
  }
  if (!ALLOWED.includes(parsed.protocol)) return null

  const host = parsed.hostname.replace(/^www\./, '')
  const path = parsed.pathname

  // Google Docs / Sheets / Slides. A "publish to web" link (/d/e/...) is
  // already a viewer; leave it be.
  if (host === 'docs.google.com') {
    if (path.includes('/d/e/')) return parsed.href
    const m = path.match(/^\/(document|spreadsheets|presentation)\/d\/([^/]+)/)
    if (m) return `https://docs.google.com/${m[1]}/d/${m[2]}/preview`
    return parsed.href
  }

  // Drive files: the viewer, not the share page.
  if (host === 'drive.google.com') {
    const m = path.match(/\/file\/d\/([^/]+)/) || (parsed.searchParams.get('id')
      ? [null, parsed.searchParams.get('id')] : null)
    if (m) return `https://drive.google.com/file/d/${m[1]}/preview`
    return parsed.href
  }

  if (host === 'canva.com') {
    const m = path.match(/^\/design\/([^/]+)\/([^/]+)\/(?:view|edit)/)
    if (m) return `https://www.canva.com/design/${m[1]}/${m[2]}/view?embed`
    return parsed.href
  }

  if (host === 'figma.com') {
    return `https://www.figma.com/embed?embed_host=optio&url=${encodeURIComponent(parsed.href)}`
  }

  if (host === 'scratch.mit.edu') {
    const m = path.match(/^\/projects\/(\d+)/)
    if (m) return `https://scratch.mit.edu/projects/${m[1]}/embed`
    return parsed.href
  }

  return parsed.href
}

/** The part of a URL a reviewer recognises at a glance. */
export const hostLabel = (url) => {
  try {
    return new URL(String(url)).hostname.replace(/^www\./, '')
  } catch {
    return 'link'
  }
}

export default getEmbedUrl
