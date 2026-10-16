import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

import TeacherAcceptanceCard from './TeacherAcceptanceCard'
import { settingsCardsFor } from '../settingsRegistry'

/**
 * Ticket 536a3018, Jackie Hill (Arete Academy): "Can you also make it so the
 * evidence submissions are not on their portfolios until I approve it? And
 * also have the xp not be awarded until it's approved?" The switch writes
 * sis_settings.require_teacher_acceptance through the one settings PATCH,
 * starts off, states its promise plainly, and shows only where Submissions
 * is on.
 */

const { api } = vi.hoisted(() => ({ api: { patch: vi.fn() } }))
vi.mock('../../services/api', () => ({ default: api }))

beforeEach(() => {
  vi.clearAllMocks()
  api.patch.mockResolvedValue({ data: { success: true, feature_flags: {} } })
})

describe('TeacherAcceptanceCard', () => {
  it('starts off, states the promise, and turns on with one PATCH of the one key', async () => {
    const onUpdate = vi.fn()
    render(<TeacherAcceptanceCard orgId="org-1" org={{ feature_flags: {} }} onUpdate={onUpdate} />)
    const toggle = screen.getByRole('switch', { name: 'Teachers accept work first' })
    expect(toggle).toHaveAttribute('aria-checked', 'false')
    expect(screen.getByText(/Students get XP for a task, and the work appears on their portfolio, only after a\s+teacher accepts it in Submissions\./)).toBeInTheDocument()
    expect(screen.getByText(/Work already accepted or completed before you\s+turn this on is not affected\./)).toBeInTheDocument()

    fireEvent.click(toggle)
    await waitFor(() => expect(api.patch).toHaveBeenCalledTimes(1))
    expect(api.patch.mock.calls[0][0]).toContain('/api/sis/settings')
    expect(api.patch.mock.calls[0][1]).toEqual({ sis_settings: { require_teacher_acceptance: true } })
    await waitFor(() => expect(toggle).toHaveAttribute('aria-checked', 'true'))
    expect(onUpdate).toHaveBeenCalled()
  })

  it('reads the stored value and turns it off', async () => {
    render(<TeacherAcceptanceCard orgId="org-1" org={{ feature_flags: { sis_settings: { require_teacher_acceptance: true } } }} />)
    const toggle = screen.getByRole('switch', { name: 'Teachers accept work first' })
    expect(toggle).toHaveAttribute('aria-checked', 'true')
    fireEvent.click(toggle)
    await waitFor(() => expect(api.patch.mock.calls[0][1]).toEqual({ sis_settings: { require_teacher_acceptance: false } }))
    await waitFor(() => expect(toggle).toHaveAttribute('aria-checked', 'false'))
  })

  it('treats anything but a stored true as off', () => {
    render(<TeacherAcceptanceCard orgId="org-1" org={{ feature_flags: { sis_settings: { require_teacher_acceptance: 'yes' } } }} />)
    expect(screen.getByRole('switch', { name: 'Teachers accept work first' })).toHaveAttribute('aria-checked', 'false')
  })

  it('keeps the old value and says so when the save fails', async () => {
    api.patch.mockRejectedValueOnce({ response: { data: { error: 'Teachers accept work first must be on or off.' } } })
    const alert = vi.spyOn(window, 'alert').mockImplementation(() => {})
    render(<TeacherAcceptanceCard orgId="org-1" org={{ feature_flags: {} }} />)
    const toggle = screen.getByRole('switch', { name: 'Teachers accept work first' })
    fireEvent.click(toggle)
    await waitFor(() => expect(alert).toHaveBeenCalledWith('Teachers accept work first must be on or off.'))
    expect(toggle).toHaveAttribute('aria-checked', 'false')
    alert.mockRestore()
  })
})

describe('settingsCardsFor: the teacher acceptance card', () => {
  const keys = (flags) => settingsCardsFor({
    surface: 'console', seesFinance: true,
    org: { id: 'org-1', feature_flags: flags, effective_modules: flags.modules?.submissions === false ? ['sis'] : ['sis', 'submissions'] },
  }).map((c) => c.key)

  it('is on the SIS Settings page only when Submissions is on', () => {
    expect(keys({})).toContain('teacher-acceptance')
    expect(keys({ modules: { submissions: false } })).not.toContain('teacher-acceptance')
  })
})
