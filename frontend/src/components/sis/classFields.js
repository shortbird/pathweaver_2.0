/**
 * Shared vocabulary for editing a class: day/time helpers, the draft shape, and
 * the conversion to an API payload.
 *
 * These lived in CreateClassModal, with ClassesTable importing some of them and
 * keeping its own near-copies of the rest (its own DAY list, its own
 * numOrUndef, its own draft builder). Two copies of "what a class is" is how the
 * two editors drifted apart — and how supply_budget_per_student ended up in the
 * row editor's draft but not in its payload, and assistant_instructor_ids in
 * neither. One module, one answer.
 *
 * The canonical draft uses SIS day integers (0=Sun..6=Sat) and the API's own
 * field names where they exist. Screens that need something else convert at
 * their own boundary rather than teaching this module a second dialect.
 */

// The form only ever offers the school week.
export const DAY_OPTIONS = [
  { dow: 1, code: 'mon', short: 'M', label: 'Mon' },
  { dow: 2, code: 'tue', short: 'T', label: 'Tue' },
  { dow: 3, code: 'wed', short: 'W', label: 'Wed' },
  { dow: 4, code: 'thu', short: 'T', label: 'Thu' },
  { dow: 5, code: 'fri', short: 'F', label: 'Fri' },
]
export const CODE_TO_DOW = Object.fromEntries(DAY_OPTIONS.map((d) => [d.code, d.dow]))
export const DOW_TO_CODE = Object.fromEntries(DAY_OPTIONS.map((d) => [d.dow, d.code]))
export const DAY_LETTER = { 0: 'Su', 1: 'M', 2: 'T', 3: 'W', 4: 'Th', 5: 'F', 6: 'Sa' }

export const hhmm = (t) => (t ? String(t).slice(0, 5) : '')

const toMin = (t) => {
  const [h, m] = hhmm(t).split(':').map(Number)
  return Number.isNaN(h) ? null : h * 60 + (m || 0)
}

export const minutesBetween = (start, end) => {
  if (!start || !end) return ''
  const s = toMin(start)
  const e = toMin(end)
  return s == null || e == null ? '' : e - s
}

export const blockMinutes = (b) => minutesBetween(b.start, b.end) || 60

/** 12-hour time without the meridiem — for block pills, where am/pm is obvious. */
export const fmt12 = (t) => {
  const [h, m] = hhmm(t).split(':').map(Number)
  if (Number.isNaN(h)) return ''
  const h12 = h % 12 === 0 ? 12 : h % 12
  return `${h12}${m ? `:${String(m).padStart(2, '0')}` : ''}`
}

/** 12-hour time WITH am/pm — for times shown outside a block context. */
export const fmt12ap = (t) => {
  const [h, m] = hhmm(t).split(':').map(Number)
  if (Number.isNaN(h)) return ''
  const h12 = h % 12 === 0 ? 12 : h % 12
  return `${h12}${m ? `:${String(m).padStart(2, '0')}` : ''}${h >= 12 ? 'pm' : 'am'}`
}

export const blockLabel = (b) => `${fmt12(b.start)}–${fmt12(b.end)}`

/** "HH:MM" start + duration minutes -> "HH:MM" end. */
export const addMin = (t, mins) => {
  const total = (toMin(t) ?? 0) + Number(mins || 0)
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
}

/**
 * End-time choices for a class starting at `start`: the end of that block and of
 * every later teaching block — long classes span multiple blocks (a 2-hour
 * class, a full school day). Label-only blocks (e.g. Lunch) aren't valid end
 * points, and a pre-existing custom end time stays selectable so opening the
 * editor never silently changes a class.
 */
export const blockEndOptions = (timeBlocks, start, currentEnd = null) => {
  const s = toMin(start)
  if (s == null) return []
  const ends = timeBlocks
    .filter((b) => !b.label && toMin(b.end) != null && toMin(b.end) > s)
    .map((b) => hhmm(b.end))
  if (currentEnd && toMin(currentEnd) > s && !ends.includes(hhmm(currentEnd))) ends.push(hhmm(currentEnd))
  return [...new Set(ends)].sort((a, b) => toMin(a) - toMin(b))
}

/** A class's meetings -> the single {days, start, duration} the form edits. */
export const meetingsToForm = (meetings = []) => {
  const first = meetings[0]
  return {
    days_of_week: [...new Set(meetings.map((m) => m.day_of_week).filter((d) => d != null))],
    start_time: first ? hhmm(first.start_time) : '',
    duration_minutes: first ? String(minutesBetween(first.start_time, first.end_time)) : '',
  }
}

export const numOrUndef = (v) => (v === '' || v == null ? undefined : Number(v))

/** Every editable attribute of a class, as flat form strings. */
export const toDraft = (c = {}) => {
  const seed = meetingsToForm(c.meetings || [])
  return {
    name: c.name || '',
    description: c.description || '',
    primary_instructor_id: c.primary_instructor_id || '',
    assistant_instructor_ids: c.assistant_instructor_ids || [],
    show_assistants: c.show_assistants !== false,
    location: c.location || '',
    days_of_week: seed.days_of_week,
    start_time: seed.start_time || '',
    duration_minutes: String(seed.duration_minutes || ''),
    capacity: c.capacity != null ? String(c.capacity) : '',
    tuition: c.price_cents != null ? String(c.price_cents / 100) : '',
    supply_fee: c.supply_fee != null ? String(c.supply_fee) : '',
    supply_budget_per_student: c.supply_budget_per_student != null
      ? String(c.supply_budget_per_student) : '',
    min_age: c.min_age != null ? String(c.min_age) : '',
    max_age: c.max_age != null ? String(c.max_age) : '',
    requires_full_day: !!c.requires_full_day,
  }
}

/**
 * A draft -> the PATCH/POST body.
 *
 * Every editable field goes in. The bug this module exists to stop was a payload
 * builder that listed fields by hand and quietly missed some, so an assistant
 * teacher or a supply budget you set came back empty after a save.
 */
export const draftToPayload = (d) => ({
  name: (d.name || '').trim(),
  description: d.description,
  location: (d.location || '').trim() || null,
  primary_instructor_id: d.primary_instructor_id || null,
  assistant_instructor_ids: (d.assistant_instructor_ids || []).filter(Boolean),
  show_assistants: !!d.show_assistants,
  days_of_week: d.days_of_week,
  start_time: d.start_time || undefined,
  duration_minutes: numOrUndef(d.duration_minutes),
  capacity: numOrUndef(d.capacity),
  price_cents: d.tuition === '' || d.tuition == null ? null : Math.round(Number(d.tuition) * 100),
  supply_fee: numOrUndef(d.supply_fee),
  // '' means "use the school default", which is a null column, not 0.
  supply_budget_per_student: d.supply_budget_per_student === '' ? null
    : numOrUndef(d.supply_budget_per_student),
  min_age: numOrUndef(d.min_age),
  max_age: numOrUndef(d.max_age),
  requires_full_day: !!d.requires_full_day,
})
