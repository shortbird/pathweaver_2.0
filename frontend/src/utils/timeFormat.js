/**
 * Time display helpers for the SIS.
 *
 * Class meeting times are stored as 24-hour "HH:MM[:SS]" strings. Staff asked
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
