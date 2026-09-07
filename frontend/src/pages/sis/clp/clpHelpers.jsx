/**
 * Shared vocabulary of the CLP meeting view (QF-02): time and money
 * formatting, the meeting-overlap arithmetic that decides whether a class
 * conflicts with a student's schedule, and the three badge components every
 * region of the page renders.
 *
 * Pulled out of ClpPage.jsx verbatim -- these were module scope there, and the
 * regions that use them now live in their own files.
 */
import React from 'react'

export const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
export const DEFAULT_DAYS = [1, 2, 3, 4, 5] // Mon–Fri

export const fmtTime = (hhmm) => {
  if (!hhmm) return ''
  const [h, m] = String(hhmm).split(':').map(Number)
  if (Number.isNaN(h)) return ''
  const ampm = h >= 12 ? 'pm' : 'am'
  const h12 = h % 12 === 0 ? 12 : h % 12
  return `${h12}${m ? `:${String(m).padStart(2, '0')}` : ''}${ampm}`
}

export const toMinutes = (hhmm) => {
  const [h, m] = String(hhmm || '').split(':').map(Number)
  return Number.isNaN(h) ? null : h * 60 + (m || 0)
}

// Two meetings overlap when they share a weekday and their time ranges intersect.
export const meetingsOverlap = (a, b) => {
  if (a.day_of_week == null || b.day_of_week == null) return false
  if (a.day_of_week !== b.day_of_week) return false
  const as = toMinutes(a.start_time)
  const ae = toMinutes(a.end_time)
  const bs = toMinutes(b.start_time)
  const be = toMinutes(b.end_time)
  if (as == null || ae == null || bs == null || be == null) return false
  return as < be && bs < ae
}

// Does any meeting of `cls` overlap any meeting in the enrolled schedule
// (ignoring the class itself)?
export const conflictsWithSchedule = (cls, schedule) => {
  const others = schedule.filter((s) => s.class_id !== cls.class_id)
  return cls.meetings.some((m) => others.some((s) => s.meetings.some((sm) => meetingsOverlap(m, sm))))
}

// A short "Mon/Wed 9:00–10:00am" style summary; groups meetings by identical time.
export const meetingSummary = (meetings) => {
  const recurring = meetings.filter((m) => m.day_of_week != null && m.start_time)
  if (!recurring.length) {
    const oneOff = meetings.find((m) => m.specific_date)
    return oneOff ? `${oneOff.specific_date} ${fmtTime(oneOff.start_time)}` : 'No set time'
  }
  const byTime = {}
  for (const m of recurring) {
    const key = `${m.start_time}-${m.end_time}`
    ;(byTime[key] = byTime[key] || { days: [], m }).days.push(m.day_of_week)
  }
  return Object.values(byTime)
    .map(({ days, m }) => {
      const label = days.sort((a, b) => a - b).map((d) => DAY_LABELS[d]).join('/')
      return `${label} ${fmtTime(m.start_time)}–${fmtTime(m.end_time)}`
    })
    .join(', ')
}

export const priceLabel = (cents) => (cents ? `$${(cents / 100).toFixed(cents % 100 ? 2 : 0)}` : null)

export const dollars = (n) => `$${Number(n).toFixed(Number(n) % 1 ? 2 : 0)}`

// Sortable "when does this class first meet" key: day * 1440 + start minutes.
// Unscheduled classes sort to the end.
export const firstSlot = (c) => {
  let best = Infinity
  for (const m of c.meetings || []) {
    if (m.day_of_week == null) continue
    const mins = toMinutes(m.start_time)
    const key = m.day_of_week * 1440 + (mins == null ? 0 : mins)
    if (key < best) best = key
  }
  return best
}

// Does this class admit a student of `age`? Unknown ages and unbounded classes pass.
export const fitsAge = (cls, age) => {
  if (age == null) return true
  if (cls.min_age != null && age < cls.min_age) return false
  if (cls.max_age != null && age > cls.max_age) return false
  return true
}

export const Pill = ({ children, className = '' }) => (
  <span className={`inline-flex items-center text-[11px] font-semibold rounded-full px-2 py-0.5 ${className}`}>{children}</span>
)

export const CheckIcon = ({ className = '', label }) => (
  <svg className={className} viewBox="0 0 20 20" fill="currentColor"
    role={label ? 'img' : undefined} aria-label={label} aria-hidden={label ? undefined : true}>
    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
  </svg>
)

export const LEARNING_DAY_LABELS = {
  quest_learning_day: 'Quest Learning Day',
  elementary_at_home: 'Elementary At-Home Academic Learning Day',
}

export const FUNDING_LABELS = {
  ufa: 'UFA', ufa_private: 'UFA – Private School',
  private_pay: 'Private Pay', other: 'Other',
}

// Seats "3 / 12 · 9 left" or "8 / 8 · Full" or "Unlimited".
export const SeatsPill = ({ cls }) => {
  if (cls.capacity == null) return <Pill className="bg-neutral-100 text-neutral-600">Unlimited</Pill>
  if (cls.is_full) return <Pill className="bg-rose-100 text-rose-700">{cls.enrolled_count} / {cls.capacity} · Full</Pill>
  return (
    <Pill className="bg-emerald-100 text-emerald-700">
      {cls.enrolled_count} / {cls.capacity} · {cls.spots_left} left
    </Pill>
  )
}
