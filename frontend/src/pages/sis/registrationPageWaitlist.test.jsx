import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render as rtlRender, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { withConfirm, answerConfirm, confirmText } from '../../tests/confirmTestUtils'

// The queues live on the Registration page's second tab (the default tab is
// the editable registration form), so mount the page with ?tab=queues.
const render = (ui) => rtlRender(<MemoryRouter initialEntries={['/registration?tab=queues']}>{withConfirm(ui)}</MemoryRouter>)

vi.mock('react-hot-toast', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
  default: { success: vi.fn(), error: vi.fn() },
}))
vi.mock('./useSisOrg', () => ({
  useSisOrg: () => ({ orgId: 'org-1', setOrgId: vi.fn(), orgs: [], isSuperadmin: false, loading: false }),
  withOrg: (url, orgId) => `${url}${url.includes('?') ? '&' : '?'}organization_id=${orgId}`,
}))
// Adding to / reordering the waitlist is admin-only, so the card needs a user.
let authState = { user: { id: 'admin-1', role: 'org_admin' } }
vi.mock('../../contexts/AuthContext', () => ({ useAuth: () => authState }))
// The registration CONFIG lives on the page's Setup tab (the editable funnel);
// the Queues tab holds the enrollment operations, including the waitlist.

const { api, state } = vi.hoisted(() => {
  const state = { entries: [], gates: [] }
  const apiData = (url) => {
    if (url.includes('/enrollment-waitlist')) return { data: { entries: state.entries } }
    if (url.includes('/api/sis/members')) {
      return { data: { members: [
        { id: 'stu-form', name: 'Form Kid', is_student: true },
        { id: 'stu-other', name: 'Other Kid', is_student: true },
        { id: 'par-1', name: 'A Parent', is_student: false },
      ] } }
    }
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
  authState = { user: { id: 'admin-1', role: 'org_admin' } }
  vi.clearAllMocks()
})

describe('EnrollmentWaitlistCard', () => {
  it('always shows the container, with an empty state when nothing is gated', async () => {
    render(<RegistrationPage />)
    expect(await screen.findByText('Enrollment waitlist')).toBeInTheDocument()
    // Empty state renders after the waitlist load resolves (loading -> bands empty).
    expect(await screen.findByText(/No age groups are waitlisted/)).toBeInTheDocument()
  })

  it('shows an active waitlist age group even with nobody waiting', async () => {
    state.gates = [{ min_age: 5, max_age: 9, mode: 'waitlist' }]
    render(<RegistrationPage />)
    // The empty per-band note only renders for a configured gate band with no
    // students, proving the group shows from the gate (not from any entry).
    expect(await screen.findByText(/No students waiting in this group yet/)).toBeInTheDocument()
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
    state.entries = [WAITING(), WAITING({ id: 'w2', student_name: 'Kid Two', position: 2 })]
    render(<RegistrationPage />)
    fireEvent.click(await screen.findByRole('button', { name: 'Release all 2' }))
    expect(await confirmText()).toContain('2 waiting students')
    await answerConfirm()
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

  it('badges a student who has sibling priority, with the oldest sibling age', async () => {
    state.entries = [WAITING({
      priority: true,
      sibling_top_age: 16,
      siblings: [{ user_id: 's1', name: 'Big Sis', age: 16 }],
    })]
    render(<RegistrationPage />)
    expect(await screen.findByText(/sibling priority · sibling 16/)).toBeInTheDocument()
    // The tooltip names the siblings and their ages so staff can tell a
    // high-schooler's little brother from a 10-year-old's.
    expect(screen.getByTitle(/Accepted sibling: Big Sis \(16\)/)).toBeInTheDocument()
  })

  it('lists every accepted sibling oldest-first in the tooltip', async () => {
    state.entries = [WAITING({
      priority: true,
      sibling_top_age: 17,
      siblings: [
        { user_id: 's1', name: 'Eldest', age: 17 },
        { user_id: 's2', name: 'Middle', age: 11 },
      ],
    })]
    render(<RegistrationPage />)
    expect(await screen.findByTitle(/Accepted siblings: Eldest \(17\), Middle \(11\)/)).toBeInTheDocument()
  })

  it('still shows a frozen-prefix student sibling, without claiming priority', async () => {
    // Registered before the priority cutoff: their place is frozen, but staff
    // deciding who to release still need to see the sibling.
    state.entries = [WAITING({
      priority: false,
      sibling_top_age: 15,
      siblings: [{ user_id: 's1', name: 'Big Bro', age: 15 }],
    })]
    render(<RegistrationPage />)
    expect(await screen.findByText(/has sibling · 15/)).toBeInTheDocument()
    // No priority badge — the tooltip is the one unique to a prioritized row.
    expect(screen.queryByTitle(/Sibling priority moves this child up/)).toBeNull()
  })

  it('shows no sibling badge when there is no accepted sibling', async () => {
    state.entries = [WAITING({ priority: false, siblings: [] })]
    render(<RegistrationPage />)
    expect(await screen.findByText(/Kid One/)).toBeInTheDocument()
    expect(screen.queryByTitle(/Accepted sibling/)).toBeNull()
  })

  it('rejects a student (refund) after a confirm', async () => {
    api.post.mockResolvedValueOnce({ data: { rejected: true, refund_cents: 4167, emailed: true } })
    state.entries = [WAITING()]
    render(<RegistrationPage />)
    fireEvent.click(await screen.findByRole('button', { name: 'Not accepted' }))
    expect(await confirmText()).toContain('NOT accepted')
    await answerConfirm()
    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith('/api/sis/enrollment-waitlist/w1/reject',
        { organization_id: 'org-1' }),
    )
  })

  it('does not reject when the confirm is dismissed', async () => {
    state.entries = [WAITING()]
    render(<RegistrationPage />)
    fireEvent.click(await screen.findByRole('button', { name: 'Not accepted' }))
    await answerConfirm(false)
    expect(api.post).not.toHaveBeenCalledWith('/api/sis/enrollment-waitlist/w1/reject',
      { organization_id: 'org-1' })
  })

  // Staff-managed queue: admins can correct the order and add families who
  // queued outside the registration funnel.
  describe('staff-managed queue', () => {
    it('moves a student up and sends the whole band back in the new order', async () => {
      state.entries = [
        WAITING(),
        WAITING({ id: 'w2', student_name: 'Kid Two', position: 2 }),
        WAITING({ id: 'w3', student_name: 'Kid Three', position: 3 }),
      ]
      render(<RegistrationPage />)
      fireEvent.click(await screen.findByRole('button', { name: 'Move Kid Three up' }))
      await waitFor(() =>
        expect(api.post).toHaveBeenCalledWith('/api/sis/enrollment-waitlist/reorder', {
          organization_id: 'org-1', band_min_age: 5, band_max_age: 9,
          entry_ids: ['w1', 'w3', 'w2'],
        }),
      )
    })

    it('cannot move the first student up or the last one down', async () => {
      state.entries = [WAITING(), WAITING({ id: 'w2', student_name: 'Kid Two', position: 2 })]
      render(<RegistrationPage />)
      expect(await screen.findByRole('button', { name: 'Move Kid One up' })).toBeDisabled()
      expect(screen.getByRole('button', { name: 'Move Kid Two down' })).toBeDisabled()
    })

    it('offers no reordering when a band has a single student', async () => {
      state.entries = [WAITING()]
      render(<RegistrationPage />)
      await screen.findByText(/#1 Kid One/)
      expect(screen.queryByRole('button', { name: /Move Kid One/ })).not.toBeInTheDocument()
    })

    it('adds a student who signed up on the old form, dated to when they queued', async () => {
      state.gates = [{ min_age: 5, max_age: 9, mode: 'waitlist' }]
      state.entries = [WAITING()]
      api.post.mockResolvedValueOnce({ data: { student_name: 'Form Kid', position: 1 } })
      render(<RegistrationPage />)
      fireEvent.click(await screen.findByRole('button', { name: 'Add student' }))
      fireEvent.focus(await screen.findByPlaceholderText('Search students…'))
      fireEvent.change(screen.getByPlaceholderText('Search students…'), { target: { value: 'Form' } })
      fireEvent.mouseDown(await screen.findByText('Form Kid'))
      fireEvent.change(screen.getByLabelText('Got in line on'), { target: { value: '2026-07-05' } })
      fireEvent.click(screen.getByRole('button', { name: 'Add to waitlist' }))
      await waitFor(() =>
        expect(api.post).toHaveBeenCalledWith('/api/sis/enrollment-waitlist/manual',
          expect.objectContaining({
            organization_id: 'org-1',
            student_user_id: 'stu-form',
            queued_at: '2026-07-05T12:00:00Z',
          })),
      )
    })

    it('keeps students already waiting out of the add picker', async () => {
      state.gates = [{ min_age: 5, max_age: 9, mode: 'waitlist' }]
      state.entries = [WAITING({ student_user_id: 'stu-form' })]
      render(<RegistrationPage />)
      fireEvent.click(await screen.findByRole('button', { name: 'Add student' }))
      fireEvent.focus(await screen.findByPlaceholderText('Search students…'))
      fireEvent.change(screen.getByPlaceholderText('Search students…'), { target: { value: 'Form' } })
      await waitFor(() => expect(screen.queryByText('Form Kid')).not.toBeInTheDocument())
    })

    it('hides adding and reordering from non-admin staff', async () => {
      authState = { user: { id: 'adv-1', role: 'advisor' } }
      state.entries = [WAITING(), WAITING({ id: 'w2', student_name: 'Kid Two', position: 2 })]
      render(<RegistrationPage />)
      await screen.findByText(/#1 Kid One/)
      expect(screen.queryByRole('button', { name: 'Add student' })).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: /Move Kid One/ })).not.toBeInTheDocument()
    })
  })
})
