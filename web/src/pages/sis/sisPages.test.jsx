import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render as rtlRender, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

// All SIS pages may render react-router <Link>s — wrap every render in a router.
// These SIS pages read their data through hooks/api (QF-03), so they need a
// QueryClient. A fresh client per render keeps one test's cache out of the
// next one's; retry:false makes a failed query fail the assertion rather than
// hang through three backoff rounds.
// RecordDoorsProvider is the console's one mount of the student record
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

// StudentDetailModal reads the context object directly (it is rendered bare
// in other tests), so the mock exports it alongside the hook; the context
// value is null here, which the modal treats as "not an admin".
vi.mock('../../contexts/AuthContext', async () => {
  const React = await import('react')
  return { useAuth: () => authState, AuthContext: React.createContext(null) }
})
vi.mock('../../contexts/OrganizationContext', () => ({ useOrganization: () => orgState }))
vi.mock('react-hot-toast', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
  default: { success: vi.fn(), error: vi.fn() },
}))
// The announcement composer writes through TipTap, whose contenteditable can't
// be typed into in jsdom. Stand in a textarea with the same placeholder so
// these tests keep testing the page, not the editor.
vi.mock('../../components/course/outline/RichTextEditor', () => ({
  default: ({ value, onChange, placeholder }) => (
    <textarea value={value} placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)} />
  ),
}))

// Hoisted so the mock factory (which runs at import time, before module-body
// consts initialize) can reference it.
const { api, apiData } = vi.hoisted(() => {
  const apiData = (url) => {
    if (url.includes('/api/sis/dashboard')) {
      return { data: { data: {
        organization: { name: 'Org' },
        snapshot: { total_students: 3, active_last_7_days: 1, households: 2,
                    enrollment_status: { enrolled: 2, applicant: 1 } },
        attention: {}, today: {}, events: [], settings: { hidden_modules: [] },
      } } }
    }
    if (url.includes('/api/sis/roster')) {
      return { data: { roster: [
        { student_id: 's1', name: 'Alice Student', email: 'a@x.com', total_xp: 10, is_student: true,
          role: 'student', roles: ['student'], enrollment_status: 'enrolled', household_name: 'Fam', household_id: 'h1' },
        { student_id: 's2', name: 'Bob Builder', email: 'b@x.com', total_xp: 30, is_student: true,
          role: 'student', roles: ['student'], enrollment_status: 'applicant', household_name: null },
        { student_id: 's3', name: 'Carol Gone', email: 'c@x.com', total_xp: 5, is_student: true,
          role: 'student', roles: ['student'], enrollment_status: 'withdrawn', household_name: null },
        { student_id: 'p1', name: 'Paula Parent', email: 'p@x.com', is_student: false,
          role: 'parent', roles: ['parent'], enrollment_status: null, household_name: 'Fam', household_id: 'h1' },
        { student_id: 's9', name: 'Zed Unassigned', email: 'zed@x.com', is_student: true,
          role: 'student', roles: ['student'], enrollment_status: 'unassigned', household_name: null },
      ] } }
    }
    if (url.includes('/api/sis/members')) {
      return { data: { members: [
        { id: 's1', name: 'Alice Student', is_student: true },
        { id: 's9', name: 'Zed Unassigned', email: 'zed@x.com', is_student: true },
      ] } }
    }
    if (url.includes('/api/sis/unassigned-students')) {
      return { data: { students: [
        { id: 's9', name: 'Zed Unassigned', email: 'zed@x.com',
          enrollment_status: 'unassigned', possible_duplicate_of: [] },
      ] } }
    }
    if (url.includes('/api/sis/households')) {
      return { data: { households: [
        { id: 'h1', name: 'Fam', members: [{ user_id: 's1', name: 'Alice Student', relationship: 'student' }] },
      ] } }
    }
    if (url.includes('emergency-contacts')) return { data: { contacts: [] } }
    return { data: {} }
  }
  return {
    apiData,
    api: {
      get: vi.fn((url) => Promise.resolve(apiData(url))),
      post: vi.fn(() => Promise.resolve({ data: { household: { id: 'h2' }, contact: { id: 'c1' } } })),
      patch: vi.fn(() => Promise.resolve({ data: {} })),
      delete: vi.fn(() => Promise.resolve({ data: {} })),
    },
  }
})
vi.mock('../../services/api', () => ({ default: api }))

import SisDashboard from './SisDashboard'
import PeoplePage from './PeoplePage'
import SisOrgPicker from './SisOrgPicker'
import StudentDetailModal from './StudentDetailModal'
import { RecordDoorsProvider } from '../../components/sis/RecordDoors'
import { withConfirm } from '../../tests/confirmTestUtils'

beforeEach(() => {
  authState = { user: { id: 'u1', role: 'org_admin' } }
  orgState = { organization: { id: 'org-1', name: 'Org' } }
  vi.clearAllMocks()
  // Restore default implementations (a test may override api.get for one case).
  api.get.mockImplementation((url) => Promise.resolve(apiData(url)))
  api.post.mockImplementation(() => Promise.resolve({ data: { household: { id: 'h2' }, contact: { id: 'c1' } } }))
  api.patch.mockImplementation(() => Promise.resolve({ data: {} }))
  api.delete.mockImplementation(() => Promise.resolve({ data: {} }))
})

describe('SisDashboard', () => {
  it('loads and shows school stats', async () => {
    render(<SisDashboard />)
    expect(await screen.findByText('School Dashboard')).toBeInTheDocument()
    // "Current" rather than "Total": this card counted withdrawn and graduated
    // students while the People page hid them, so the school saw two different
    // student totals and could not tell which was real.
    expect(await screen.findByText('Current students')).toBeInTheDocument()
    expect(api.get).toHaveBeenCalledWith(expect.stringContaining('/api/sis/dashboard'))
  })
})

describe('PeoplePage', () => {
  it('lists every account with a role column, not just students', async () => {
    render(<PeoplePage />)
    expect(await screen.findByText('Alice Student')).toBeInTheDocument()
    expect(screen.getByText('Bob Builder')).toBeInTheDocument()
    expect(screen.getAllByText('Fam').length).toBeGreaterThan(0) // family column
    // non-student accounts appear with their role pill
    expect(screen.getByText('Paula Parent')).toBeInTheDocument()
    expect(screen.getByText('Parent')).toBeInTheDocument()
    expect(screen.getAllByText('Student').length).toBeGreaterThan(0)
  })

  it('opens the student detail modal from a row, through Manage', async () => {
    render(<PeoplePage />)
    // The row asks what you want first, since 2026-09-22; the per-row menu
    // that used to hold the other answers is gone, and Manage is first.
    fireEvent.click(await screen.findByText('Alice Student'))
    fireEvent.click(await screen.findByRole('button', { name: 'Manage' }))
    expect(await screen.findByText('Emergency contacts')).toBeInTheDocument()
  })

  it('hides withdrawn/graduated students by default and can show them', async () => {
    render(<PeoplePage />)
    expect(await screen.findByText('Alice Student')).toBeInTheDocument()
    expect(screen.getByText('Bob Builder')).toBeInTheDocument()
    expect(screen.queryByText('Carol Gone')).not.toBeInTheDocument() // withdrawn, hidden
    fireEvent.click(screen.getByLabelText(/Hide withdrawn/))
    expect(await screen.findByText('Carol Gone')).toBeInTheDocument()
  })

  it('filters the roster by search text', async () => {
    render(<PeoplePage />)
    await screen.findByText('Alice Student')
    fireEvent.change(screen.getByPlaceholderText(/Search by name/), { target: { value: 'bob' } })
    expect(screen.queryByText('Alice Student')).not.toBeInTheDocument()
    expect(screen.getByText('Bob Builder')).toBeInTheDocument()
  })

  it('sorts by name when the Name header is clicked', async () => {
    render(<PeoplePage />)
    await screen.findByText('Alice Student')
    // Default sort is name-ascending; clicking the Name header toggles to descending.
    fireEvent.click(screen.getByRole('button', { name: /^Name/ }))
    const names = screen.getAllByRole('row').slice(1).map((r) => r.querySelector('td')?.textContent)
    // descending: Zed, Paula, Bob, Alice (Carol is withdrawn and hidden)
    expect(names[0]).toContain('Zed')
    expect(names[1]).toContain('Paula')
    expect(names[2]).toContain('Bob')
    expect(names[3]).toContain('Alice')
  })

  it('creates a family from the Add menu', async () => {
    render(<PeoplePage />)
    await screen.findByText('Alice Student')
    fireEvent.click(screen.getByRole('button', { name: '+ Add' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Family' }))
    fireEvent.change(screen.getByPlaceholderText('New family / household name'), {
      target: { value: 'The Garcia Family' },
    })
    fireEvent.click(screen.getByText('Create'))
    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith('/api/sis/households', expect.objectContaining({ name: 'The Garcia Family' })),
    )
  })

  it('surfaces household-less students as a filter, and Manage puts one in a family', async () => {
    render(<PeoplePage />)
    // Zed is a student in the org but in no household; Alice is in Fam.
    await screen.findByText('Alice Student')
    fireEvent.click(screen.getByRole('button', { name: 'Show them' }))
    expect(screen.getByText('Zed Unassigned')).toBeInTheDocument()
    expect(screen.queryByText('Alice Student')).not.toBeInTheDocument()

    // The Manage modal's Family section does the assigning.
    fireEvent.click(screen.getByText('Zed Unassigned'))
    fireEvent.click(await screen.findByRole('button', { name: 'Manage' }))
    const section = (await screen.findByText('Not in a family yet.')).closest('section')
    fireEvent.change(await within(section).findByPlaceholderText(/Search families/), { target: { value: 'Fam' } })
    fireEvent.mouseDown(await within(await screen.findByTestId('search-select-menu')).findByText('Fam'))
    fireEvent.click(within(section).getByText('Assign'))
    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith('/api/sis/households/h1/members',
        expect.objectContaining({ user_id: 's9', relationship: 'student' })),
    )
  })
})

describe('SisOrgPicker', () => {
  it('renders nothing for non-superadmin', () => {
    const { container } = render(
      <SisOrgPicker isSuperadmin={false} orgs={[]} orgId={null} setOrgId={vi.fn()} />,
    )
    expect(container).toBeEmptyDOMElement()
  })

  it('renders a selector for superadmin', () => {
    render(
      <SisOrgPicker isSuperadmin orgs={[{ id: 'o1', name: 'Org One' }]} orgId="o1" setOrgId={vi.fn()} />,
    )
    expect(screen.getByText('Org One')).toBeInTheDocument()
  })
})

describe('StudentDetailModal', () => {
  it('renders and adds an emergency contact', async () => {
    render(
      <StudentDetailModal
        student={{ student_id: 's1', name: 'Alice Student', enrollment_status: 'enrolled' }}
        orgId="org-1"
        onClose={vi.fn()}
        onSaved={vi.fn()}
      />,
    )
    expect(await screen.findByText('Alice Student')).toBeInTheDocument()
    fireEvent.click(screen.getByText('+ Emergency Contact'))   // reveal the add form
    fireEvent.change(screen.getByPlaceholderText('Name'), { target: { value: 'Mom' } })
    fireEvent.click(screen.getByText('Add contact'))
    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith(
        '/api/sis/students/s1/emergency-contacts',
        expect.objectContaining({ name: 'Mom' }),
      ),
    )
  })
})
