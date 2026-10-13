import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

import AttendanceSettingsCard from './AttendanceSettingsCard'
import { settingsCardsFor } from '../settingsRegistry'

/**
 * The Attendance settings card (ticket 0680d03c, Apogee Cache Valley: a
 * whole-school daily roll with Present / Absent / Picked up, school days
 * Mon-Thu). A school that never opens it keeps exactly how it worked before:
 * no daily roll, no check-out, all four statuses, Monday to Friday. The server
 * cleans and checks the value again (backend/tests/test_sis_attendance_daily_roll.py).
 */

const { api } = vi.hoisted(() => ({ api: { patch: vi.fn() } }))
vi.mock('../../services/api', () => ({ default: api }))

const org = (attendance) => ({ id: 'org-1', feature_flags: { sis_settings: attendance ? { attendance } : {} } })
const sent = () => api.patch.mock.calls[0][1]

beforeEach(() => {
  vi.clearAllMocks()
  api.patch.mockResolvedValue({ data: {} })
})

describe('AttendanceSettingsCard', () => {
  it('shows the defaults for a school that never set it', () => {
    render(<AttendanceSettingsCard orgId="org-1" org={org()} />)
    expect(screen.getByLabelText(/Daily roll/)).not.toBeChecked()
    expect(screen.getByLabelText(/Pickup check-out/)).not.toBeChecked()
    for (const s of ['Present', 'Absent', 'Late', 'Excused']) expect(screen.getByLabelText(s)).toBeChecked()
    for (const d of ['Mon', 'Tue', 'Wed', 'Thu', 'Fri']) expect(screen.getByLabelText(d)).toBeChecked()
    for (const d of ['Sat', 'Sun']) expect(screen.getByLabelText(d)).not.toBeChecked()
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
  })

  it('Present and Absent cannot be turned off', () => {
    render(<AttendanceSettingsCard orgId="org-1" org={org()} />)
    expect(screen.getByLabelText('Present')).toBeDisabled()
    expect(screen.getByLabelText('Absent')).toBeDisabled()
    expect(screen.getByLabelText('Late')).not.toBeDisabled()
  })

  it("saves Apogee's setup as one object under sis_settings.attendance", async () => {
    render(<AttendanceSettingsCard orgId="org-1" org={org()} />)
    fireEvent.click(screen.getByLabelText(/Daily roll/))
    fireEvent.click(screen.getByLabelText(/Pickup check-out/))
    fireEvent.click(screen.getByLabelText('Late'))
    fireEvent.click(screen.getByLabelText('Excused'))
    fireEvent.click(screen.getByLabelText('Fri'))
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(api.patch).toHaveBeenCalled())
    expect(api.patch.mock.calls[0][0]).toBe('/api/sis/settings?organization_id=org-1')
    expect(sent()).toEqual({ sis_settings: { attendance: {
      daily_roll: true, checkout: true, statuses: ['present', 'absent'], school_days: [1, 2, 3, 4],
    } } })
  })

  it('a saved value wins over the defaults', () => {
    render(<AttendanceSettingsCard orgId="org-1"
      org={org({ daily_roll: true, checkout: false, statuses: ['present', 'absent'], school_days: [1, 2, 3, 4] })} />)
    expect(screen.getByLabelText(/Daily roll/)).toBeChecked()
    expect(screen.getByLabelText('Late')).not.toBeChecked()
    expect(screen.getByLabelText('Fri')).not.toBeChecked()
  })

  it('refuses to save with no school day', () => {
    render(<AttendanceSettingsCard orgId="org-1" org={org({ school_days: [1] })} />)
    fireEvent.click(screen.getByLabelText('Mon'))
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(screen.getByRole('alert')).toHaveTextContent('Pick at least one school day.')
    expect(api.patch).not.toHaveBeenCalled()
  })

  it('is on the console Settings page only where the attendance module is on', () => {
    const keys = (flags) => settingsCardsFor({ surface: 'console', org: { id: 'o', feature_flags: flags }, seesFinance: true })
      .map((c) => c.key)
    expect(keys({ sis_enabled: true, modules: { attendance: true } })).toContain('attendance')
    expect(keys({ sis_enabled: true, modules: { attendance: false }, sis_settings: { hidden_modules: ['attendance'] } }))
      .not.toContain('attendance')
    expect(settingsCardsFor({ surface: 'learning', org: { id: 'o', feature_flags: {} }, seesFinance: true })
      .map((c) => c.key)).not.toContain('attendance')
  })
})
