/**
 * Shared helpers for the public embeddable widgets (catalog + schedule).
 *
 * These pages are iframed onto external sites, so they fetch the PUBLIC
 * /api/embed endpoints with plain `fetch` (NOT the authed axios `api` client,
 * which attaches httpOnly cookies + CSRF and would fail cross-origin).
 */

// Same base the app's axios client uses: http://localhost:5001 in dev,
// https://api.optioeducation.com in prod (Render env VITE_API_URL). The embed
// endpoints send Access-Control-Allow-Origin: * so this cross-origin GET works.
export const API_BASE = import.meta.env.VITE_API_URL || ''

// Fetch public embed JSON. No credentials (public data, avoids CORS credential
// rules). Throws on a non-2xx so pages can show an error state.
export const fetchEmbed = async (path) => {
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'GET',
    credentials: 'omit',
    headers: { Accept: 'application/json' },
  })
  if (!res.ok) {
    const err = new Error(`Request failed (${res.status})`)
    err.status = res.status
    throw err
  }
  return res.json()
}

// day_of_week is 0=Sunday .. 6=Saturday (JS Date.getDay convention).
export const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
export const DAY_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

// [1, 3] -> "Mon, Wed". Empty -> "".
export const daysLabel = (days) =>
  (days || []).map((d) => DAY_SHORT[d]).filter(Boolean).join(', ')

// Ages -> a compact human label. "Ages 8-12" / "Ages 11+" / "Up to 8" / "".
export const agesLabel = (min, max) => {
  if (min != null && max != null) return `Ages ${min}-${max}`
  if (min != null) return `Ages ${min}+`
  if (max != null) return `Up to age ${max}`
  return ''
}

// 365 -> "$365"; 35.5 -> "$35.50". null/undefined -> ''.
export const money = (value) => {
  if (value == null) return ''
  return Number.isInteger(value) ? `$${value}` : `$${value.toFixed(2)}`
}
