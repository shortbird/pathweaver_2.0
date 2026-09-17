import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

import ParentDigestCard from './ParentDigestCard'

/**
 * The "Send parent weekly digest email" switch (Dallin Bird, Gryffin,
 * 2026-09-07).
 *
 * Two things must hold, and both have burned this codebase before:
 * the switch is OFF for a school that never touched it, and saving it does not
 * wipe the rest of that school's settings. Since M8a the card PATCHes the one
 * key it owns through /api/sis/settings and the server merges it onto what is
 * stored (backend/tests/test_sis_settings_patch.py holds that half); what
 * this side proves is that the card names its key and nothing else.
 */

const { api } = vi.hoisted(() => ({ api: { patch: vi.fn() } }))
vi.mock('../../services/api', () => ({ default: api }))

const ORG = {
  id: 'org-1',
  timezone: 'America/Denver',
  feature_flags: {
    step_printing: true,
    sis_settings: { add_drop_deadline: '2026-09-08' },
  },
}

const sent = () => api.patch.mock.calls[0][1]

beforeEach(() => {
  vi.clearAllMocks()
  api.patch.mockResolvedValue({ data: {} })
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
    await waitFor(() => expect(api.patch).toHaveBeenCalled())
    expect(api.patch.mock.calls[0][0]).toBe('/api/sis/settings?organization_id=org-1')
    expect(sent().sis_settings.parent_weekly_digest)
      .toEqual({ enabled: true, day: 'sunday', hour: 17 })
  })

  it('sends only the key it owns, so every other setting the school has is untouched', async () => {
    render(<ParentDigestCard orgId="org-1" org={ORG} />)
    fireEvent.click(screen.getByRole('switch'))
    await waitFor(() => expect(api.patch).toHaveBeenCalled())
    expect(sent()).toEqual({
      sis_settings: { parent_weekly_digest: { enabled: true, day: 'sunday', hour: 17 } },
    })
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
    await waitFor(() => expect(api.patch).toHaveBeenCalled())
    expect(sent().sis_settings.parent_weekly_digest)
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
