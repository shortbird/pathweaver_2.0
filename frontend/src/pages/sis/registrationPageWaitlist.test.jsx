import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render as rtlRender, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

const render = (ui) => rtlRender(<MemoryRouter>{ui}</MemoryRouter>)

vi.mock('react-hot-toast', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
  default: { success: vi.fn(), error: vi.fn() },
}))
vi.mock('./useSisOrg', () => ({
  useSisOrg: () => ({ orgId: 'org-1', setOrgId: vi.fn(), orgs: [], isSuperadmin: false, loading: false }),
  withOrg: (url, orgId) => `${url}${url.includes('?') ? '&' : '?'}organization_id=${orgId}`,
}))
// The funnel-config card is a big form irrelevant to the waitlist specs.
vi.mock('../../components/sis/ICreateRegistrationSettings', () => ({ default: () => null }))

const { api, state } = vi.hoisted(() => {
  const state = { entries: [], gates: [] }
  const apiData = (url) => {
    if (url.includes('/enrollment-waitlist')) return { data: { entries: state.entries } }
    if (url.includes('/age-exception-requests')) return { data: { requests: [] } }
    if (url.includes('/family-directives')) return { data: { directives: [] } }
    if (url.includes('/api/admin/organizations/')) {
      return { data: { organization: { id: 'org-1', name: 'iCreate', feature_flags: {
        sis_settings: { enrollment_age_gates: state.gates },
      } } } }
    }
    return { data: {} }
  }
  return {
    state,
    api: {
      get: vi.fn((url) => Promise.resolve(apiData(url))),
      post: vi.fn(() => Promise.resolve({ data: { emailed: true, fee_due_cents: 0 } })),
      // The page refetches the org after a save (the card remounts and re-reads
      // server state), so the mock must persist gate writes.
      put: vi.fn((url, body) => {
        const gates = body?.feature_flags?.sis_settings?.enrollment_age_gates
        if (gates) state.gates = gates
        return Promise.resolve({ data: {} })
      }),
    },
  }
})
vi.mock('../../services/api', () => ({ default: api }))

import RegistrationPage from './RegistrationPage'

const WAITING = (over = {}) => ({
  id: 'w1', status: 'waiting', student_name: 'Kid One', guardian_name: 'Parent One',
  age_snapshot: 7, band_min_age: 5, band_max_age: 9, band_label: 'ages 5–9', position: 1,
  ...over,
})

beforeEach(() => {
  state.entries = []
  state.gates = []
  vi.clearAllMocks()
})

describe('AgeGatesCard', () => {
  it('adds a waitlisted age band into sis_settings', async () => {
    render(<RegistrationPage />)
    await screen.findByText('Enrollment age groups')
    fireEvent.change(screen.getByLabelText('Minimum age'), { target: { value: '5' } })
    fireEvent.change(screen.getByLabelText('Maximum age'), { target: { value: '9' } })
    fireEvent.click(screen.getByRole('button', { name: 'Waitlist this age group' }))
    await waitFor(() =>
      expect(api.put).toHaveBeenCalledWith('/api/admin/organizations/org-1', expect.objectContaining({
        feature_flags: expect.objectContaining({
          sis_settings: expect.objectContaining({
            enrollment_age_gates: [{ min_age: 5, max_age: 9, mode: 'waitlist' }],
          }),
        }),
      })),
    )
    expect(await screen.findByText(/Ages 5–9/)).toBeInTheDocument()
  })

  it('reopens a band by removing it from the gates', async () => {
    state.gates = [{ min_age: 5, max_age: 9, mode: 'waitlist' }]
    render(<RegistrationPage />)
    await screen.findByText(/Ages 5–9/)
    fireEvent.click(screen.getByRole('button', { name: 'Open this group' }))
    await waitFor(() =>
      expect(api.put).toHaveBeenCalledWith('/api/admin/organizations/org-1', expect.objectContaining({
        feature_flags: expect.objectContaining({
          sis_settings: expect.objectContaining({ enrollment_age_gates: [] }),
        }),
      })),
    )
  })
})

describe('EnrollmentWaitlistCard', () => {
  it('renders nothing when no one has ever been waitlisted', async () => {
    render(<RegistrationPage />)
    await screen.findByText('Enrollment age groups')
    expect(screen.queryByText('Enrollment waitlist')).not.toBeInTheDocument()
  })

  it('lists waiting students in queue order and releases one', async () => {
    state.entries = [
      WAITING(),
      WAITING({ id: 'w2', student_name: 'Kid Two', position: 2 }),
    ]
    render(<RegistrationPage />)
    expect(await screen.findByText(/#1 Kid One/)).toBeInTheDocument()
    expect(screen.getByText(/#2 Kid Two/)).toBeInTheDocument()
    fireEvent.click(screen.getAllByRole('button', { name: 'Release' })[0])
    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith('/api/sis/enrollment-waitlist/w1/release',
        { organization_id: 'org-1' }),
    )
  })

  it('releases a whole band after a count confirm', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    state.entries = [WAITING(), WAITING({ id: 'w2', student_name: 'Kid Two', position: 2 })]
    render(<RegistrationPage />)
    fireEvent.click(await screen.findByRole('button', { name: 'Release all 2' }))
    expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining('2 waiting students'))
    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith('/api/sis/enrollment-waitlist/release-band', {
        organization_id: 'org-1', band_min_age: 5, band_max_age: 9,
      }),
    )
  })

  it('shows released students in the collapsed history', async () => {
    state.entries = [WAITING({ id: 'w3', status: 'released', student_name: 'Old Kid' })]
    render(<RegistrationPage />)
    expect(await screen.findByText('Released (1)')).toBeInTheDocument()
  })

  it('badges a student who has sibling priority', async () => {
    state.entries = [WAITING({ priority: true })]
    render(<RegistrationPage />)
    // The badge (identified by its tooltip) sits on the student's row.
    expect(await screen.findByTitle(/this child has sibling priority/)).toBeInTheDocument()
  })

  it('rejects a student (refund) after a confirm', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    api.post.mockResolvedValueOnce({ data: { rejected: true, refund_cents: 4167, emailed: true } })
    state.entries = [WAITING()]
    render(<RegistrationPage />)
    fireEvent.click(await screen.findByRole('button', { name: 'Not accepted' }))
    expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining('NOT accepted'))
    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith('/api/sis/enrollment-waitlist/w1/reject',
        { organization_id: 'org-1' }),
    )
  })

  it('does not reject when the confirm is dismissed', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false)
    state.entries = [WAITING()]
    render(<RegistrationPage />)
    fireEvent.click(await screen.findByRole('button', { name: 'Not accepted' }))
    expect(api.post).not.toHaveBeenCalledWith('/api/sis/enrollment-waitlist/w1/reject',
      { organization_id: 'org-1' })
  })
})
