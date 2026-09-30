import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

import FriendsCard from './FriendsCard'
import { settingsCardsFor } from '../settingsRegistry'

/**
 * The school's Friends switch (Apogee Odessa, 2026-09-30).
 *
 * The org default for students with no parent linked had an API since
 * 2026-09-16 and no screen, so a school whose families have no accounts could
 * not turn Friends on, and Collaborate never reached their students. What
 * holds: the card reads the school's setting, writes only the key it changed,
 * and renders nothing for a caller the API refuses (a campus coordinator).
 */

const { api } = vi.hoisted(() => ({ api: { get: vi.fn(), put: vi.fn() } }))
vi.mock('../../services/api', () => ({ default: api }))

const OFF = { default_enabled: false, default_approval_mode: 'auto', school_pool: false }

beforeEach(() => {
  vi.clearAllMocks()
  api.get.mockResolvedValue({ data: { data: OFF } })
  api.put.mockImplementation((_url, body) =>
    Promise.resolve({ data: { data: { ...OFF, ...body } } }))
})

describe('FriendsCard', () => {
  it('shows the school setting and turns Friends on with one key', async () => {
    render(<FriendsCard orgId="org-1" />)
    const main = await screen.findByRole('switch', { name: 'Turn on Friends for students' })
    expect(main).toHaveAttribute('aria-checked', 'false')
    expect(screen.queryByRole('switch', { name: 'Find anyone at the school' })).toBeNull()

    fireEvent.click(main)
    await waitFor(() => expect(api.put).toHaveBeenCalledTimes(1))
    expect(api.put.mock.calls[0][0]).toBe('/api/connections/org/settings')
    expect(api.put.mock.calls[0][1]).toEqual({ default_enabled: true, organization_id: 'org-1' })
    await waitFor(() => expect(main).toHaveAttribute('aria-checked', 'true'))
    expect(screen.getByRole('switch', { name: 'Find anyone at the school' })).toBeInTheDocument()
  })

  it('renders nothing when the caller may not read the setting', async () => {
    api.get.mockRejectedValue({ response: { status: 403 } })
    const { container } = render(<FriendsCard orgId="org-1" />)
    await waitFor(() => expect(api.get).toHaveBeenCalled())
    expect(container).toBeEmptyDOMElement()
  })
})

describe('settingsCardsFor: the Friends card', () => {
  const keys = (surface, org) => settingsCardsFor({ surface, org, seesFinance: true }).map((c) => c.key)

  it('is on both surfaces when the Friends block is on', () => {
    const org = { feature_flags: {}, effective_modules: ['friends'] }
    expect(keys('learning', org)).toContain('friends')
    expect(keys('console', org)).toContain('friends')
  })

  it('is gone when the school turned the Friends block off', () => {
    const org = { feature_flags: {}, effective_modules: [] }
    expect(keys('learning', org)).not.toContain('friends')
  })
})
