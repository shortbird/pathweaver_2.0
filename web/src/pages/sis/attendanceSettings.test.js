import { describe, it, expect, vi } from 'vitest'

import {
  attendanceSettingsFor, defaultAttendanceSettings, isSchoolDay, nearestSchoolDay,
  rollStatuses, stepSchoolDay,
} from './attendanceSettings'
import { navItemVisible } from './sisNavVisibility'

vi.mock('./teacherPreview', () => ({ getPreviewTeacher: () => null }))

/**
 * The attendance settings as the web reads them (ticket 0680d03c). The
 * defaults must be how every school worked before the setting existed, and
 * they mirror backend parse_attendance_settings.
 */

const org = (attendance, extra = {}) => ({ id: 'o', feature_flags: { ...extra, sis_settings: { attendance } } })

describe('attendance settings', () => {
  it('defaults: no daily roll, no check-out, all four statuses, Mon-Fri', () => {
    expect(attendanceSettingsFor(null)).toEqual(defaultAttendanceSettings())
    expect(defaultAttendanceSettings()).toEqual({
      daily_roll: false, checkout: false,
      statuses: ['present', 'absent', 'late', 'excused'], school_days: [1, 2, 3, 4, 5],
    })
  })

  it('reads an unreadable value as the default', () => {
    const s = attendanceSettingsFor(org({ daily_roll: 'yes', statuses: ['late'], school_days: [] }))
    expect(s).toEqual(defaultAttendanceSettings())
  })

  it('the class roll offers the school statuses, plus a stored mark the school turned off', () => {
    const o = org({ statuses: ['present', 'absent'] })
    expect(rollStatuses(o, 'present')).toEqual(['present', 'absent'])
    expect(rollStatuses(o, 'late')).toEqual(['present', 'absent', 'late'])
    expect(rollStatuses(null, 'present')).toEqual(['present', 'absent', 'late', 'excused'])
  })

  it('steps over the days the school is closed (Mon-Thu)', () => {
    const days = [1, 2, 3, 4]
    // 2026-10-16 is a Friday.
    expect(isSchoolDay('2026-10-16', days)).toBe(false)
    expect(nearestSchoolDay('2026-10-16', days, -1)).toBe('2026-10-15')
    expect(stepSchoolDay('2026-10-15', days, 1)).toBe('2026-10-19')
    expect(stepSchoolDay('2026-10-19', days, -1)).toBe('2026-10-15')
  })
})

describe('the Attendance nav entry', () => {
  const item = { name: 'Attendance', path: '/attendance', dailyRollOnly: true }
  const ctx = (activeOrg) => ({ activeOrg, previewing: false, isSuperadmin: false,
    isAdmin: false, seesFinance: false, seesHr: false })

  it('is hidden where the daily roll is off', () => {
    expect(navItemVisible(item, ctx(org({})))).toBe(false)
  })

  it('is shown to a teacher where the daily roll is on, even with classes hidden', () => {
    expect(navItemVisible(item, ctx(org({ daily_roll: true }, { sis_enabled: true, modules: { classes: false, attendance: true } }))))
      .toBe(true)
  })
})
