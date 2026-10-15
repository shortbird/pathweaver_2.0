import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

import BloomyInboxCard from './BloomyInboxCard'
import { settingsCardsFor } from '../settingsRegistry'

/**
 * Ticket bc68a12e, Apogee Cache Valley: "Bloomy submissions are the only ones
 * that I'd prefer not to review." The switch writes
 * sis_settings.skip_bloomy_in_inbox through the one settings PATCH, starts
 * off, and shows only where the bloomy module is on.
 */

const { api } = vi.hoisted(() => ({ api: { patch: vi.fn() } }))
vi.mock('../../services/api', () => ({ default: api }))

beforeEach(() => {
  vi.clearAllMocks()
  api.patch.mockResolvedValue({ data: { success: true, feature_flags: {} } })
})

describe('BloomyInboxCard', () => {
  it('starts off, with plain help text, and turns on with one PATCH of the one key', async () => {
    const onUpdate = vi.fn()
    render(<BloomyInboxCard orgId="org-1" org={{ feature_flags: {} }} onUpdate={onUpdate} />)
    const toggle = screen.getByRole('switch', { name: 'Skip work Bloomy already verified' })
    expect(toggle).toHaveAttribute('aria-checked', 'false')
    expect(screen.getByText(/Bloomy lessons your students mastered stay out of the Submissions inbox/)).toBeInTheDocument()

    fireEvent.click(toggle)
    await waitFor(() => expect(api.patch).toHaveBeenCalledTimes(1))
    expect(api.patch.mock.calls[0][0]).toContain('/api/sis/settings')
    expect(api.patch.mock.calls[0][1]).toEqual({ sis_settings: { skip_bloomy_in_inbox: true } })
    await waitFor(() => expect(toggle).toHaveAttribute('aria-checked', 'true'))
    expect(onUpdate).toHaveBeenCalled()
  })

  it('reads the stored value and turns it off', async () => {
    render(<BloomyInboxCard orgId="org-1" org={{ feature_flags: { sis_settings: { skip_bloomy_in_inbox: true } } }} />)
    const toggle = screen.getByRole('switch', { name: 'Skip work Bloomy already verified' })
    expect(toggle).toHaveAttribute('aria-checked', 'true')
    fireEvent.click(toggle)
    await waitFor(() => expect(api.patch.mock.calls[0][1]).toEqual({ sis_settings: { skip_bloomy_in_inbox: false } }))
    await waitFor(() => expect(toggle).toHaveAttribute('aria-checked', 'false'))
  })
})

describe('settingsCardsFor: the Bloomy card', () => {
  const keys = (surface, mods) => settingsCardsFor({
    surface, seesFinance: true, org: { id: 'org-1', feature_flags: {}, effective_modules: ['sis', ...mods] },
  }).map((c) => c.key)

  it('is on the SIS Settings page only when the bloomy module is on', () => {
    expect(keys('console', ['bloomy'])).toContain('bloomy-inbox')
    expect(keys('console', [])).not.toContain('bloomy-inbox')
  })
})
