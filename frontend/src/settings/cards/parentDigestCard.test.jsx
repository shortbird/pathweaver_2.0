import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

/**
 * The "Send parent weekly digest email" switch (Dallin Bird, Gryffin,
 * 2026-09-07).
 *
 * Two things must hold, and both have burned this codebase before:
 * the switch is OFF for a school that never touched it, and saving it does not
 * wipe the rest of that school's settings — PUT /api/admin/organizations
 * REPLACES feature_flags with whatever the card sends.
 */

const { api } = vi.hoisted(() => ({ api: { put: vi.fn() } }))
vi.mock('../../services/api', () => ({ default: api }))

import ParentDigestCard from './ParentDigestCard'

const ORG = {
  id: 'org-1',
  timezone: 'America/Denver',
  feature_flags: {
    step_printing: true,
    sis_settings: { add_drop_deadline: '2026-09-08' },
  },
}

const flags = () => api.put.mock.calls[0][1].feature_flags

beforeEach(() => {
  vi.clearAllMocks()
  api.put.mockResolvedValue({ data: {} })
})

describe('ParentDigestCard', () => {
  it('is off for a school that never turned it on', () => {
    render(<ParentDigestCard orgId="org-1" org={ORG} />)
    expect(screen.getByRole('switch')).toHaveAttribute('aria-checked', 'false')
    // No schedule to argue about until it is on.
    expect(screen.queryByLabelText('Digest send day')).not.toBeInTheDocument()
  })

  it('saves the default Sunday 5pm schedule when switched on', async () => {
    render(<ParentDigestCard orgId="org-1" org={ORG} />)
    fireEvent.click(screen.getByRole('switch'))
    await waitFor(() => expect(api.put).toHaveBeenCalled())
    expect(flags().sis_settings.parent_weekly_digest)
      .toEqual({ enabled: true, day: 'sunday', hour: 17 })
  })

  it('keeps every other setting the school has', async () => {
    render(<ParentDigestCard orgId="org-1" org={ORG} />)
    fireEvent.click(screen.getByRole('switch'))
    await waitFor(() => expect(api.put).toHaveBeenCalled())
    expect(flags().step_printing).toBe(true)
    expect(flags().sis_settings.add_drop_deadline).toBe('2026-09-08')
  })

  it('shows the schedule, in the school\'s timezone, once it is on', () => {
    const on = {
      ...ORG,
      feature_flags: {
        ...ORG.feature_flags,
        sis_settings: { parent_weekly_digest: { enabled: true, day: 'friday', hour: 8 } },
      },
    }
    render(<ParentDigestCard orgId="org-1" org={on} />)
    expect(screen.getByLabelText('Digest send day')).toHaveValue('friday')
    expect(screen.getByLabelText('Digest send time')).toHaveValue('8')
    expect(screen.getByText('America/Denver')).toBeInTheDocument()
  })

  it('changing the day keeps it enabled', async () => {
    const on = {
      ...ORG,
      feature_flags: {
        ...ORG.feature_flags,
        sis_settings: { parent_weekly_digest: { enabled: true, day: 'sunday', hour: 17 } },
      },
    }
    render(<ParentDigestCard orgId="org-1" org={on} />)
    fireEvent.change(screen.getByLabelText('Digest send day'), { target: { value: 'monday' } })
    await waitFor(() => expect(api.put).toHaveBeenCalled())
    expect(flags().sis_settings.parent_weekly_digest)
      .toEqual({ enabled: true, day: 'monday', hour: 17 })
  })

  it('reads a hand-written boolean as on', () => {
    const on = {
      ...ORG,
      feature_flags: { sis_settings: { parent_weekly_digest: true } },
    }
    render(<ParentDigestCard orgId="org-1" org={on} />)
    expect(screen.getByRole('switch')).toHaveAttribute('aria-checked', 'true')
  })
})
