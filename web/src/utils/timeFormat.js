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

// "13:00" -> "1pm", "13:30" -> "1:30pm": the compact form the month grids use
// where a cell has room for four characters, not eight.
export const compact12h = (value) => {
  if (!value) return ''
  const [h, m] = String(value).split(':').map(Number)
  if (Number.isNaN(h)) return String(value)
  const ampm = h >= 12 ? 'pm' : 'am'
  const h12 = h % 12 === 0 ? 12 : h % 12
  return `${h12}${m ? `:${String(m).padStart(2, '0')}` : ''}${ampm}`
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

/*
 * School event stamps, read as the wall clock the office typed.
 *
 * EVENT_STAMPS_ARE_WALL_CLOCK
 * ---------------------------
 * `sis_events.start_at` / `end_at` do NOT name an instant. The office types
 * "18:30" into the SIS calendar form and routes/sis/events.py stores that
 * string verbatim into a timestamptz column, so Postgres tags it +00 without
 * converting: a 6:30 PM event is on the row as `18:30:00+00`. The stamp is a
 * wall clock wearing a UTC label.
 *
 * So read it in UTC and it says 6:30, which is what the office meant. Read it
 * as an instant -- `new Date(...)` then format in local time -- and it says
 * 12:30 in Denver. That is how the 10am Hang Time reached a parent as 4am
 * (Perch 1d0d41a9), how "NO CLASS - LABOR DAY" on the 7th rendered as Sun,
 * Sep 6 (iCreate, 2026-08-31), and how the 6:30 Moms' Group Night reached
 * every Denver parent as 12:30 (Marika, 2026-09-15: "this would likely
 * explain our low turnout at all events thus far"). Three times, each time a
 * new reader of the stamps written without the rule; the SIS admin's own
 * Community page had it until M12 (docs/sis/CONSOLIDATION_PLAN.md).
 *
 * These are the only functions that may turn an event stamp into text;
 * src/__tests__/schoolEventWallClock.test.js refuses a reader that does it
 * anywhere else. The mobile app carries the same helpers and the same guard
 * in components/school/format.ts. The real repair is upstream -- store a true
 * instant converted through organizations.timezone and migrate the rows --
 * and until then every reader agrees to read the wall clock.
 */

const utcDay = (d, withYear) => d.toLocaleDateString(undefined, {
  weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC',
  ...(withYear ? { year: 'numeric' } : {}),
})
const utcTime = (d) => d.toLocaleTimeString(undefined, {
  hour: 'numeric', minute: '2-digit', timeZone: 'UTC',
})

/** "Tue, Sep 22 · 6:30 PM", "Tue, Sep 22 · all day"; the year appears when
 *  it is not this year, because a school calendar runs across New Year. */
export const fmtEventWhen = (e) => {
  if (!e?.start_at) return ''
  const d = new Date(e.start_at)
  if (Number.isNaN(d.getTime())) return ''
  try {
    const day = utcDay(d, d.getUTCFullYear() !== new Date().getFullYear())
    if (e.all_day) return `${day} · all day`
    return `${day} · ${utcTime(d)}`
  } catch { return '' }
}

/** The day of an event alone: "Sep 22, 2026". */
export const fmtEventDay = (e) => {
  if (!e?.start_at) return ''
  const d = new Date(e.start_at)
  if (Number.isNaN(d.getTime())) return ''
  try {
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })
  } catch { return '' }
}

/** The time cell of a calendar row: "6:30 PM – 8:00 PM", "6:30 PM", or "All day". */
export const fmtEventTimeRange = (e) => {
  if (!e || e.all_day || !e.start_at) return 'All day'
  const t = (v) => {
    if (!v) return ''
    const d = new Date(v)
    if (Number.isNaN(d.getTime())) return ''
    try { return utcTime(d) } catch { return '' }
  }
  const start = t(e.start_at)
  const end = t(e.end_at)
  return end && end !== start ? `${start} – ${end}` : start
}

/** The stamp split into the calendar's own parts, without parsing it as an
 *  instant: { date: 'YYYY-MM-DD', time: 'HH:MM' }. The month grids key days
 *  by the date part and print the time part through to12h. */
export const splitEventStamp = (iso) => ({
  date: String(iso || '').slice(0, 10),
  time: String(iso || '').slice(11, 16),
})

/*
 * Dates that are days, not instants -- a birthday, a lost-and-found date, a
 * calendar day heading. Built from parts, never parsed as a Date:
 * `new Date('2026-09-09')` is midnight UTC and lands on the 8th anywhere west
 * of Greenwich.
 */
const fromParts = (ymd) => {
  const [y, m, d] = String(ymd || '').slice(0, 10).split('-').map(Number)
  return y && m && d ? new Date(y, m - 1, d) : null
}

/** "Sep 22, 2026" (default), "Tue 22" (weekday), "Tuesday, September 22" (long). */
export const fmtDateOnly = (ymd, style = 'short') => {
  const d = fromParts(ymd)
  if (!d) return ''
  try {
    if (style === 'weekday') {
      // Composed by hand: the locale decides whether "Wed 9" or "9 Wed"
      // comes out of a weekday+day request, and a calendar heading wants
      // one shape everywhere.
      return `${d.toLocaleDateString(undefined, { weekday: 'short' })} ${d.getDate()}`
    }
    const opts = style === 'long'
      ? { weekday: 'long', month: 'long', day: 'numeric' }
      : { month: 'short', day: 'numeric', year: 'numeric' }
    return d.toLocaleDateString(undefined, opts)
  } catch { return '' }
}

/** A calendar day's own heading from its 'YYYY-MM-DD' key: "Tue 9". */
export const fmtDayHeading = (ymd) => fmtDateOnly(ymd, 'weekday')

/*
 * Real instants -- when something was posted, edited, scheduled -- read in
 * the viewer's own zone, which is right for them.
 */

/** "Sep 22" -- the short stamp on a feed item. */
export const fmtShortDate = (iso) => {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  try { return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) } catch { return '' }
}

/** "Sep 22, 2026" -- with the year, for a list that spans one. */
export const fmtLongDate = (iso) => {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  try { return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) } catch { return '' }
}

/** "Sep 22, 6:30 PM" -- a scheduled instant, in the viewer's zone. */
export const fmtInstant = (iso) => {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  try {
    return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
  } catch { return '' }
}

/** True for a bare 'YYYY-MM-DD' value, which is a day and not an instant. */
export const isDateOnly = (v) => /^\d{4}-\d{2}-\d{2}$/.test(String(v || ''))
