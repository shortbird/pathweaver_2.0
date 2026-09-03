/**
 * One label for a class wherever staff pick one from a list.
 *
 * Same class names repeat across sections (three "Reading Tutoring"s), so a
 * picker that shows the bare name is a guessing game — every class label
 * carries its schedule. Extracted from AttendancePage so the attendance
 * picker, the messaging class filter, the enroll-in-class search, and the
 * submissions filter all say the same thing.
 */

import { range12h } from '../../utils/timeFormat'

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

// "Mon/Wed 9:30 AM–10:30 AM" — all meeting days, times from the first meeting.
export const meetingText = (meetings = []) => {
  if (!meetings.length) return ''
  const days = [...new Set(meetings.map((m) => m.day_of_week).filter((d) => d != null))]
    .sort().map((d) => DAYS[d]).join('/')
  const m = meetings[0]
  return `${days} ${range12h(m.start_time, m.end_time)}`.trim()
}

// "Reading Tutoring — Tue 10:30 AM–11:30 AM"; just the name when the class has
// no scheduled meetings (or the option is synthetic, e.g. "All classes").
export const classLabel = (c) => {
  const when = meetingText(c.meetings)
  return when ? `${c.name} — ${when}` : c.name
}
