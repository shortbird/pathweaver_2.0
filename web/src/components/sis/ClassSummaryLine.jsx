/**
 * One line describing a class to a family: seats, ages, price, meeting times.
 *
 * Six screens said "Full — waitlist", "Full — waitlist available", "Class
 * full", "Full · Waitlist: 3", "N spots left" and "N seats left" for the same
 * class in the same state, and three of them spelled the age band their own
 * way (docs/icreate/FRANKENSTEIN_AUDIT_2026-09-17.md, E6; M11 in
 * docs/sis/CONSOLIDATION_PLAN.md). The words live here.
 *
 * Two payload shapes reach these screens: the SIS and parent APIs send
 * `is_full`, `spots_left`, `capacity` and `waitlist_count`; the public embed
 * sends `open_seats` and `waitlist_count`. `seatState` reads either.
 */
import React from 'react'

/** "ages 5–9", "ages 12+", "up to age 11", or '' with no bounds. */
export const ageBandText = (cls, { capital = false } = {}) => {
  const min = cls?.min_age; const max = cls?.max_age
  const text = min != null && max != null ? `ages ${min}–${max}`
    : min != null ? `ages ${min}+`
    : max != null ? `up to age ${max}` : ''
  return capital && text ? text[0].toUpperCase() + text.slice(1) : text
}

/** { kind: 'open' | 'seats' | 'full', left, waiting } from either payload shape. */
export const seatState = (cls) => {
  const left = cls?.open_seats ?? cls?.spots_left ?? null
  const waiting = Number(cls?.waitlist_count) || 0
  const full = cls?.is_full === true || (cls?.is_full == null && left != null && left <= 0)
  if (full) return { kind: 'full', left: 0, waiting }
  if (left == null) return { kind: 'open', left: null, waiting }
  return { kind: 'seats', left, waiting }
}

/**
 * The words for a seat state. Long form: "Open enrollment", "3 seats left",
 * "Full — waitlist", "Full — 4 waiting". Short form, for a tight cell:
 * "Open", "3 left", "Full", "Full · 4 waiting".
 */
export const seatText = (cls, { short = false } = {}) => {
  const s = seatState(cls)
  if (s.kind === 'open') return short ? 'Open' : 'Open enrollment'
  if (s.kind === 'seats') return short ? `${s.left} left` : `${s.left} seat${s.left === 1 ? '' : 's'} left`
  if (s.waiting > 0) return short ? `Full · ${s.waiting} waiting` : `Full — ${s.waiting} waiting`
  return short ? 'Full' : 'Full — waitlist'
}

const PILL_TONE = {
  open: 'bg-green-50 text-green-700 ring-1 ring-green-200',
  seats: 'bg-green-50 text-green-700 ring-1 ring-green-200',
  full: 'bg-amber-100 text-amber-700',
}

/** A small pill carrying `seatText`. */
export const SeatPill = ({ cls, short = false, className = '' }) => (
  <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ${PILL_TONE[seatState(cls).kind]} ${className}`}>
    {seatText(cls, { short })}
  </span>
)

/**
 * The line: meeting text (the caller's, since staff and family screens phrase
 * the week differently), then price, ages and seats, each in its own span so
 * a test or a screen reader can find one segment. `hideOpen` drops the seat
 * segment for an unlimited class where "Open enrollment" would only be noise.
 */
const ClassSummaryLine = ({
  cls, meetings = '', price = '', short = false, hideOpen = false, showAges = true, showSeats = true, className = '',
}) => {
  const seats = showSeats && !(hideOpen && seatState(cls).kind === 'open') ? seatText(cls, { short }) : ''
  const parts = [meetings, price, showAges ? ageBandText(cls) : '', seats].filter(Boolean)
  if (!parts.length) return null
  return (
    <span className={className}>
      {parts.map((p, i) => (
        <React.Fragment key={i}>{i > 0 && ' · '}<span>{p}</span></React.Fragment>
      ))}
    </span>
  )
}

export default ClassSummaryLine
