/**
 * safeHref — allowlist a URL before binding it into an anchor `href`.
 *
 * User- and admin-supplied URLs (notification links, quest step links, credit
 * items) were bound into raw `href` attributes. A `javascript:` (or `data:`)
 * URL there becomes stored XSS the moment the victim clicks the link. This
 * helper returns the URL only when it uses a safe scheme, else a harmless
 * fallback ('#').
 *
 * Allowed: internal app paths ('/...'), and absolute http(s)/mailto/tel URLs.
 * Rejected: javascript:, data:, vbscript:, blob:, file:, and anything else.
 */
export function safeHref(url, fallback = '#') {
  if (url == null) return fallback;
  const raw = String(url).trim();
  if (!raw) return fallback;

  // Protocol-relative URLs ("//evil.com") resolve to an external origin —
  // reject them outright rather than let the URL parser normalize them to http.
  if (raw.startsWith('//')) return fallback;

  // Internal app paths are safe.
  if (raw.startsWith('/')) return raw;

  // Fragment / query-only links are safe.
  if (raw.startsWith('#') || raw.startsWith('?')) return raw;

  try {
    // Resolve against the current origin to normalize the scheme.
    const parsed = new URL(raw, window.location.origin);
    const scheme = parsed.protocol.toLowerCase();
    if (['http:', 'https:', 'mailto:', 'tel:'].includes(scheme)) {
      return parsed.href;
    }
  } catch (_) {
    // Unparseable → not safe.
  }
  return fallback;
}

export default safeHref;
