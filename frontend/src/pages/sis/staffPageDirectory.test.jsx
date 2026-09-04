import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render as rtlRender, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

/**
 * The staff directory: list view, invite tracking, and the duplicate merge.
 *
 * iCreate, 2026-08-01: "It'd be nice to have a list view for staff. And I also
 * would like a list of teachers I've invited but haven't accepted yet. And I
 * also messed up and invited Julia 'ADD TEACHER' instead of inviting her from
 * her card that was already created!"
 *
 * Julia is on the list twice: the placeholder card imported from the schedule
 * sheet (holding twelve classes) and the account she was invited to by email
 * (holding none). Merging is the existing /link endpoint — what was missing was
 * anything saying the two rows were the same person.
 */

// These SIS pages read their data through hooks/api (QF-03), so they need a
// QueryClient. A fresh client per render keeps one test's cache out of the
// next one's; retry:false makes a failed query fail the assertion rather than
// hang through three backoff rounds.
const render = (ui) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return rtlRender(
    <QueryClientProvider client={client}>
      <MemoryRouter>{withConfirm(ui)}</MemoryRouter>
    </QueryClientProvider>,
  )
}

let authState = { user: { id: 'u1', role: 'org_admin' } }
let orgState = { organization: { id: 'org-1', name: 'Org' } }

vi.mock('../../contexts/AuthContext', () => ({ useAuth: () => authState }))
vi.mock('../../contexts/OrganizationContext', () => ({ useOrganization: () => orgState }))
vi.mock('react-hot-toast', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
  default: { success: vi.fn(), error: vi.fn() },
}))

const PLACEHOLDER = {
  id: 'ph1', name: 'Julia Connor', first_name: 'Julia', last_name: 'Connor',
  email: 'julia@icreate-staff.placeholder.optioeducation.com',
  roles: ['advisor'], is_placeholder: true, login_pending: false,
  class_count: 12, last_active: null, created_at: '2026-06-01T00:00:00Z',
  duplicate_of: { id: 'inv1', name: 'Julia Connor', email: 'juliaconnor03@gmail.com',
                  is_placeholder: false, class_count: 0 },
}
const INVITED = {
  id: 'inv1', name: 'Julia Connor', first_name: 'Julia', last_name: 'Connor',
  email: 'juliaconnor03@gmail.com', roles: ['advisor'],
  is_placeholder: false, login_pending: true, class_count: 0, last_active: null,
  created_at: new Date(Date.now() - 3 * 86400000).toISOString(),
  duplicate_of: { id: 'ph1', name: 'Julia Connor', email: PLACEHOLDER.email,
                  is_placeholder: true, class_count: 12 },
}
const ACTIVE = {
  id: 's1', name: 'Nate Vance', first_name: 'Nate', last_name: 'Vance',
  email: 'nate@icreate.org', roles: ['advisor'], is_placeholder: false,
  login_pending: false, class_count: 3, last_active: '2026-07-31T12:00:00Z',
  created_at: '2026-05-01T00:00:00Z',
}

let STAFF = [PLACEHOLDER, INVITED, ACTIVE]

const { api } = vi.hoisted(() => ({
  api: {
    get: vi.fn(),
    post: vi.fn(() => Promise.resolve({ data: { linked: 'merged' } })),
    patch: vi.fn(() => Promise.resolve({ data: {} })),
  },
}))
vi.mock('../../services/api', () => ({ default: api }))

import StaffPage from './StaffPage'
import { withConfirm, answerConfirm, confirmText } from '../../tests/confirmTestUtils'

beforeEach(() => {
  authState = { user: { id: 'u1', role: 'org_admin' } }
  orgState = { organization: { id: 'org-1', name: 'Org' } }
  STAFF = [PLACEHOLDER, INVITED, ACTIVE]
  vi.clearAllMocks()
  localStorage.clear()
  api.get.mockImplementation((url) => (
    url.includes('/api/sis/staff')
      ? Promise.resolve({ data: { staff: STAFF } })
      : Promise.resolve({ data: {} })
  ))
})

const showList = async () => {
  render(<StaffPage />)
  await screen.findByText('Nate Vance')
  fireEvent.click(screen.getByTitle('List view'))
}

describe('staff directory — list view', () => {
  it('lays the staff out as rows with their classes and status', async () => {
    await showList()
    const row = screen.getByText('Nate Vance').closest('tr')
    expect(row).toHaveTextContent('nate@icreate.org')
    expect(row).toHaveTextContent('3')          // classes taught
    expect(row).toHaveTextContent('Signed in')
  })

  it('keeps the synthetic placeholder email out of the list', async () => {
    await showList()
    expect(screen.queryByText(PLACEHOLDER.email)).not.toBeInTheDocument()
  })

  it('remembers the chosen view', async () => {
    await showList()
    expect(localStorage.getItem('sis_staff_view')).toBe('list')
  })

  it('opens the same detail modal a card does', async () => {
    await showList()
    fireEvent.click(screen.getByText('Nate Vance'))
    expect(await screen.findByText('Edit profile')).toBeInTheDocument()
  })
})

describe('staff directory — who has not accepted', () => {
  it('filters down to invited accounts that were never signed into', async () => {
    render(<StaffPage />)
    await screen.findByText('Nate Vance')
    fireEvent.click(screen.getByRole('button', { name: /Invited, not accepted \(1\)/ }))
    expect(screen.getByText('Invite pending')).toBeInTheDocument()
    expect(screen.queryByText('Nate Vance')).not.toBeInTheDocument()
  })

  it('says how long the invite has been sitting there', async () => {
    render(<StaffPage />)
    await screen.findByText('Nate Vance')
    expect(screen.getAllByText('invited 3 days ago').length).toBeGreaterThan(0)
  })

  it('counts placeholders separately — nobody was ever emailed', async () => {
    render(<StaffPage />)
    await screen.findByText('Nate Vance')
    fireEvent.click(screen.getByRole('button', { name: /No login yet \(1\)/ }))
    expect(screen.getByText('No login yet')).toBeInTheDocument()
    expect(screen.queryByText('Invite pending')).not.toBeInTheDocument()
  })

  it('searches by name', async () => {
    render(<StaffPage />)
    await screen.findByText('Nate Vance')
    fireEvent.change(screen.getByLabelText('Search staff'), { target: { value: 'nate' } })
    expect(screen.getByText('1 of 3 staff members')).toBeInTheDocument()
  })
})

describe('staff directory — the same person twice', () => {
  it('names the duplicate and what merging does', async () => {
    render(<StaffPage />)
    await screen.findByText('Nate Vance')
    const banner = screen.getByText(/is on the list twice/)
    expect(banner).toHaveTextContent('holding 12 classes')
    expect(banner).toHaveTextContent('juliaconnor03@gmail.com')
  })

  it('merges the placeholder into the invited account', async () => {
    render(<StaffPage />)
    await screen.findByText('Nate Vance')
    fireEvent.click(screen.getByRole('button', { name: 'Merge into invited account' }))
    // The classes moving is the point, so the confirm says so before it happens.
    expect(await confirmText()).toMatch(/12 class assignments move/)
    await answerConfirm()
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/api/sis/staff/ph1/link', {
      email: 'juliaconnor03@gmail.com', organization_id: 'org-1',
    }))
  })

  it('does nothing when the merge is declined', async () => {
    render(<StaffPage />)
    await screen.findByText('Nate Vance')
    fireEvent.click(screen.getByRole('button', { name: 'Merge into invited account' }))
    await answerConfirm(false)
    expect(api.post).not.toHaveBeenCalled()
  })

  it('reports a refusal instead of pretending it merged', async () => {
    const { toast } = await import('react-hot-toast')
    api.post.mockRejectedValueOnce({ response: { data: { error: 'This email belongs to a student account' } } })
    render(<StaffPage />)
    await screen.findByText('Nate Vance')
    fireEvent.click(screen.getByRole('button', { name: 'Merge into invited account' }))
    await answerConfirm()
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith('This email belongs to a student account'))
  })

  it('stays quiet when nobody is duplicated', async () => {
    STAFF = [ACTIVE]
    render(<StaffPage />)
    await screen.findByText('Nate Vance')
    expect(screen.queryByText(/is on the list twice/)).not.toBeInTheDocument()
  })
})

describe('adding a teacher who is already on the list', () => {
  it('offers the existing cards and links instead of creating a second record', async () => {
    render(<StaffPage />)
    await screen.findByText('Nate Vance')
    fireEvent.click(screen.getByText('Add teacher'))
    fireEvent.change(screen.getByLabelText(/Email/), { target: { value: 'juliaconnor03@gmail.com' } })
    // The placeholder is offered by name, with the classes at stake.
    fireEvent.change(screen.getByLabelText(/already on the staff list/), { target: { value: 'ph1' } })
    expect(screen.getByRole('option', { name: /Julia Connor — 12 classes/ })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Link Julia Connor account/ }))
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/api/sis/staff/ph1/link', {
      email: 'juliaconnor03@gmail.com', organization_id: 'org-1',
    }))
  })

  it('still creates a new teacher when nobody is chosen', async () => {
    api.post.mockResolvedValueOnce({ data: { teacher: { id: 'new' } } })
    render(<StaffPage />)
    await screen.findByText('Nate Vance')
    fireEvent.click(screen.getByText('Add teacher'))
    fireEvent.change(screen.getByLabelText(/Email/), { target: { value: 'sam@icreate.org' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add Teacher' }))
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/api/sis/staff',
      expect.objectContaining({ email: 'sam@icreate.org' })))
  })
})
