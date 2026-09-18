import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render as rtlRender, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RecordDoorsProvider } from '../../components/sis/RecordDoors'

/**
 * Staff on the one People table: invite tracking and the duplicate merge.
 * (The Staff tab and its card/list toggle went on 2026-09-16; the table is
 * the list view.)
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
// RecordDoorsProvider is the console's one mount of the staff record
// (SisLayout renders it); a page rendered bare opens nothing without it.
const render = (ui) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return rtlRender(
    <QueryClientProvider client={client}>
      <MemoryRouter><RecordDoorsProvider>{withConfirm(ui)}</RecordDoorsProvider></MemoryRouter>
    </QueryClientProvider>,
  )
}

let authState = { user: { id: 'u1', role: 'org_admin' } }
let orgState = { organization: { id: 'org-1', name: 'Org' } }

vi.mock('../../contexts/AuthContext', () => ({ useAuth: () => authState }))
vi.mock('../../contexts/OrganizationContext', () => ({ useOrganization: () => orgState }))
vi.mock('./SisOrgPicker', () => ({ default: () => null }))
vi.mock('./useSisOrg', () => ({
  useSisOrg: () => ({ orgId: 'org-1', setOrgId: vi.fn(), orgs: [], isSuperadmin: false, activeOrg: null }),
  withOrg: (p) => p,
}))
vi.mock('./teacherPreview', () => ({ setPreviewTeacher: vi.fn(), getPreviewTeacher: () => null }))
vi.mock('./StudentDetailModal', () => ({ default: () => <div /> }))
vi.mock('./FamilyDetailModal', () => ({ default: () => <div /> }))
vi.mock('react-hot-toast', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
  default: { success: vi.fn(), error: vi.fn() },
}))

const PLACEHOLDER = {
  student_id: 'ph1', name: 'Julia Connor', first_name: 'Julia', last_name: 'Connor',
  email: 'julia@icreate-staff.placeholder.optioeducation.com', is_student: false,
  role: 'advisor', roles: ['advisor'], is_placeholder: true, login_pending: false,
  class_count: 12, last_active: null, joined_at: '2026-06-01T00:00:00Z',
  duplicate_of: { id: 'inv1', name: 'Julia Connor', email: 'juliaconnor03@gmail.com',
                  is_placeholder: false, class_count: 0 },
}
const INVITED = {
  student_id: 'inv1', name: 'Julia Connor', first_name: 'Julia', last_name: 'Connor',
  email: 'juliaconnor03@gmail.com', is_student: false, role: 'advisor', roles: ['advisor'],
  is_placeholder: false, login_pending: true, class_count: 0, last_active: null,
  joined_at: new Date(Date.now() - 3 * 86400000).toISOString(),
  duplicate_of: { id: 'ph1', name: 'Julia Connor', email: PLACEHOLDER.email,
                  is_placeholder: true, class_count: 12 },
}
const ACTIVE = {
  student_id: 's1', name: 'Nate Vance', first_name: 'Nate', last_name: 'Vance',
  email: 'nate@icreate.org', is_student: false, role: 'advisor', roles: ['advisor'], is_placeholder: false,
  login_pending: false, class_count: 3, last_active: '2026-07-31T12:00:00Z',
  joined_at: '2026-05-01T00:00:00Z',
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

import PeoplePage from './PeoplePage'
import { withConfirm, answerConfirm, confirmText } from '../../tests/confirmTestUtils'

beforeEach(() => {
  authState = { user: { id: 'u1', role: 'org_admin' } }
  orgState = { organization: { id: 'org-1', name: 'Org' } }
  STAFF = [PLACEHOLDER, INVITED, ACTIVE]
  vi.clearAllMocks()
  localStorage.clear()
  api.get.mockImplementation((url) => (
    url.includes('/api/sis/roster')
      ? Promise.resolve({ data: { roster: STAFF } })
      : Promise.resolve({ data: {} })
  ))
})

const show = async () => {
  render(<PeoplePage />)
  await screen.findByText('Nate Vance')
}

describe('staff on the table', () => {
  it('lays the staff out as rows with their classes and status', async () => {
    await show()
    const row = screen.getByText('Nate Vance').closest('tr')
    expect(row).toHaveTextContent('nate@icreate.org')
    expect(row).toHaveTextContent('3 classes')
    const invited = screen.getAllByText('Julia Connor').map((e) => e.closest('tr'))
      .find((r) => r && r.textContent.includes('juliaconnor03'))
    expect(invited).toHaveTextContent('Invite pending')
  })

  it('keeps the synthetic placeholder email out of the list', async () => {
    await show()
    expect(screen.queryByText(PLACEHOLDER.email)).not.toBeInTheDocument()
  })

  it('opens the staff record from the row menu', async () => {
    await show()
    const row = screen.getByText('Nate Vance').closest('tr')
    fireEvent.click(row.querySelector('button[aria-label="Actions"]'))
    fireEvent.click(screen.getByText('Staff record'))
    expect(await screen.findByRole('tab', { name: 'Employment' })).toBeInTheDocument()
  })
})

describe('who has not accepted', () => {
  it('filters down to invited accounts that were never signed into', async () => {
    await show()
    fireEvent.change(screen.getByLabelText('Status'), { target: { value: 'invite_pending' } })
    expect(screen.getByText('Invite pending')).toBeInTheDocument()
    expect(screen.queryByText('Nate Vance')).not.toBeInTheDocument()
  })

  it('says how long the invite has been sitting there', async () => {
    await show()
    expect(screen.getAllByText('invited 3 days ago').length).toBeGreaterThan(0)
  })

  it('counts placeholders separately — nobody was ever emailed', async () => {
    await show()
    expect(screen.getByRole('option', { name: 'No login yet (1)' })).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Status'), { target: { value: 'no_login' } })
    expect(screen.getByText('No login yet')).toBeInTheDocument()
    expect(screen.queryByText('Invite pending')).not.toBeInTheDocument()
  })

  it('searches by name', async () => {
    await show()
    fireEvent.change(screen.getByLabelText('Search people'), { target: { value: 'nate' } })
    expect(screen.getByText(/Showing 1 of 3 people/)).toBeInTheDocument()
  })
})

describe('staff directory — the same person twice', () => {
  it('names the duplicate and what merging does', async () => {
    render(<PeoplePage />)
    await screen.findByText('Nate Vance')
    const banner = screen.getByText(/is on the list twice/)
    expect(banner).toHaveTextContent('holding 12 classes')
    expect(banner).toHaveTextContent('juliaconnor03@gmail.com')
  })

  it('merges the placeholder into the invited account', async () => {
    render(<PeoplePage />)
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
    render(<PeoplePage />)
    await screen.findByText('Nate Vance')
    fireEvent.click(screen.getByRole('button', { name: 'Merge into invited account' }))
    await answerConfirm(false)
    expect(api.post).not.toHaveBeenCalled()
  })

  it('reports a refusal instead of pretending it merged', async () => {
    const { toast } = await import('react-hot-toast')
    api.post.mockRejectedValueOnce({ response: { data: { error: 'This email belongs to a student account' } } })
    render(<PeoplePage />)
    await screen.findByText('Nate Vance')
    fireEvent.click(screen.getByRole('button', { name: 'Merge into invited account' }))
    await answerConfirm()
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith('This email belongs to a student account'))
  })

  it('stays quiet when nobody is duplicated', async () => {
    STAFF = [ACTIVE]
    render(<PeoplePage />)
    await screen.findByText('Nate Vance')
    expect(screen.queryByText(/is on the list twice/)).not.toBeInTheDocument()
  })
})

describe('adding a teacher who is already on the list', () => {
  it('offers the existing cards and links instead of creating a second record', async () => {
    render(<PeoplePage />)
    await screen.findByText('Nate Vance')
    fireEvent.click(screen.getByRole('button', { name: '+ Add' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Teacher' }))
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
    render(<PeoplePage />)
    await screen.findByText('Nate Vance')
    fireEvent.click(screen.getByRole('button', { name: '+ Add' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Teacher' }))
    fireEvent.change(screen.getByLabelText(/Email/), { target: { value: 'sam@icreate.org' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add Teacher' }))
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/api/sis/staff',
      expect.objectContaining({ email: 'sam@icreate.org' })))
  })
})
