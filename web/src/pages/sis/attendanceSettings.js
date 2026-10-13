/**
 * A school's attendance settings, read from
 * organizations.feature_flags.sis_settings.attendance (ticket 0680d03c,
 * Apogee Cache Valley: a whole-school daily roll with Present / Absent /
 * Picked up, school days Mon-Thu).
 *
 * The backend owns the rule (services/sis_attendance_service.py
 * parse_attendance_settings) and refuses a bad value on save; this mirrors its
 * defaults so the sidebar, the routes, the class roll and the settings card
 * read a stored blob the same way. The defaults are how every school worked
 * before the setting existed: no daily roll, no pickup check-out, all four
 * statuses, Monday to Friday.
 */

export const ATTENDANCE_STATUSES = ['present', 'absent', 'late', 'excused']
// A roll without these is not a roll, and the class roll defaults everyone
// to present. The server refuses a list without them.
export const REQUIRED_STATUSES = ['present', 'absent']
export const DEFAULT_SCHOOL_DAYS = [1, 2, 3, 4, 5] // ISO weekdays, Monday = 1

export function defaultAttendanceSettings() {
  return {
    daily_roll: false,
    checkout: false,
    statuses: [...ATTENDANCE_STATUSES],
    school_days: [...DEFAULT_SCHOOL_DAYS],
  }
}

export function parseAttendanceSettings(raw) {
  const out = defaultAttendanceSettings()
  if (!raw || typeof raw !== 'object') return out
  if (typeof raw.daily_roll === 'boolean') out.daily_roll = raw.daily_roll
  if (typeof raw.checkout === 'boolean') out.checkout = raw.checkout
  const st = raw.statuses
  if (Array.isArray(st) && st.every((s) => ATTENDANCE_STATUSES.includes(s))
      && REQUIRED_STATUSES.every((s) => st.includes(s))) {
    out.statuses = ATTENDANCE_STATUSES.filter((s) => st.includes(s))
  }
  const days = raw.school_days
  if (Array.isArray(days) && days.length
      && days.every((d) => Number.isInteger(d) && d >= 1 && d <= 7)) {
    out.school_days = [...new Set(days)].sort((a, b) => a - b)
  }
  return out
}

export function attendanceSettingsFor(org) {
  return parseAttendanceSettings(org?.feature_flags?.sis_settings?.attendance)
}

export function dailyRollOn(org) {
  return attendanceSettingsFor(org).daily_roll
}

/** The buttons a roll offers: the school's statuses, plus a stored mark the
 *  school has since turned off, so a saved status is never invisible. */
export function rollStatuses(org, currentMark) {
  const list = attendanceSettingsFor(org).statuses
  return currentMark && !list.includes(currentMark) ? [...list, currentMark] : list
}

/** Local YYYY-MM-DD, not UTC: toISOString() rolls over at 6pm Mountain. */
export function localIso(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function isoWeekday(d) {
  return d.getDay() === 0 ? 7 : d.getDay()
}

/** The nearest school day from `from` in `step` direction (1 forward, -1
 *  back), `from` itself when it is one. Seven tries at most. */
export function nearestSchoolDay(fromIso, schoolDays, step = 1) {
  const days = schoolDays?.length ? schoolDays : DEFAULT_SCHOOL_DAYS
  const [y, m, dd] = fromIso.split('-').map(Number)
  const d = new Date(y, m - 1, dd)
  for (let i = 0; i < 7; i += 1) {
    if (days.includes(isoWeekday(d))) return localIso(d)
    d.setDate(d.getDate() + step)
  }
  return fromIso
}

/** The school day after (step 1) or before (step -1) `fromIso`. */
export function stepSchoolDay(fromIso, schoolDays, step) {
  const [y, m, dd] = fromIso.split('-').map(Number)
  const d = new Date(y, m - 1, dd + step)
  return nearestSchoolDay(localIso(d), schoolDays, step)
}

export function isSchoolDay(iso, schoolDays) {
  const [y, m, dd] = iso.split('-').map(Number)
  return (schoolDays?.length ? schoolDays : DEFAULT_SCHOOL_DAYS).includes(isoWeekday(new Date(y, m - 1, dd)))
}
