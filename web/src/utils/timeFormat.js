/**
 * Time display helpers.
 *
 * SIS: class meeting times are stored as 24-hour "HH:MM[:SS]" strings. Staff asked
 * for am/pm everywhere (military time reads as confusing on rosters), so display
 * surfaces should run raw times through `to12h` rather than slicing to "HH:MM".
 */

// "13:00" | "13:00:00" -> "1:00 PM". Returns '' for empty/unparseable input.
export const to12h = (value) => {
  if (!value) return ''
  const [hStr, mStr = '00'] = String(value).split(':')
  let h = parseInt(hStr, 10)
  const m = parseInt(mStr, 10)
  if (Number.isNaN(h)) return String(value)
  const suffix = h >= 12 ? 'PM' : 'AM'
  h = h % 12
  if (h === 0) h = 12
  const mm = Number.isNaN(m) ? '00' : String(m).padStart(2, '0')
  return `${h}:${mm} ${suffix}`
}

// "13:00"–"14:00" -> "1:00 PM–2:00 PM". Handles a missing end time.
export const range12h = (start, end) => {
  const s = to12h(start)
  if (!s) return ''
  const e = to12h(end)
  return e ? `${s}–${e}` : s
}

/**
 * "Just now" | "3h ago" | "2d ago" -- the coarse relative stamp activity
 * lists use (dashboard RecentCompletions, the family dashboard's child
 * cards). Coarse on purpose: a parent glancing at a card wants "yesterday",
 * not a timestamp. Missing input reads "Recently".
 */
export const timeAgo = (timestamp, now = new Date()) => {
  if (!timestamp) return 'Recently'
  const time = new Date(timestamp)
  if (Number.isNaN(time.getTime())) return 'Recently'
  const hours = Math.floor((now - time) / (1000 * 60 * 60))
  if (hours < 1) return 'Just now'
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}
