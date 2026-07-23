import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render as rtlRender, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

// All SIS pages may render react-router <Link>s — wrap every render in a router.
const render = (ui) => rtlRender(<MemoryRouter>{ui}</MemoryRouter>)

let authState = { user: { id: 'u1', role: 'org_admin' } }
let orgState = { organization: { id: 'org-1', name: 'Org' } }

vi.mock('../../contexts/AuthContext', () => ({ useAuth: () => authState }))
vi.mock('../../contexts/OrganizationContext', () => ({ useOrganization: () => orgState }))
vi.mock('react-hot-toast', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
  default: { success: vi.fn(), error: vi.fn() },
}))

// Hoisted so the mock factory (which runs at import time, before module-body
// consts initialize) can reference it.
const { api, apiData } = vi.hoisted(() => {
  const apiData = (url) => {
    if (url.includes('/api/sis/dashboard')) {
      return { data: { data: {
        organization: { name: 'Org' }, total_students: 3, active_last_7_days: 1,
        households: 2, enrollment_status: { enrolled: 2, applicant: 1 },
      } } }
    }
    if (url.includes('/api/sis/roster')) {
      return { data: { roster: [
        { student_id: 's1', name: 'Alice Student', email: 'a@x.com', total_xp: 10, is_student: true,
          role: 'student', roles: ['student'], enrollment_status: 'enrolled', household_name: 'Fam' },
        { student_id: 's2', name: 'Bob Builder', email: 'b@x.com', total_xp: 30, is_student: true,
          role: 'student', roles: ['student'], enrollment_status: 'applicant', household_name: null },
        { student_id: 's3', name: 'Carol Gone', email: 'c@x.com', total_xp: 5, is_student: true,
          role: 'student', roles: ['student'], enrollment_status: 'withdrawn', household_name: null },
        { student_id: 'p1', name: 'Paula Parent', email: 'p@x.com', is_student: false,
          role: 'parent', roles: ['parent'], enrollment_status: null, household_name: 'Fam' },
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
import RosterPage from './RosterPage'
import HouseholdsPage from './HouseholdsPage'
import FamilyMessagingPage from './FamilyMessagingPage'
import SisOrgPicker from './SisOrgPicker'
import StudentDetailModal from './StudentDetailModal'

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
    expect(await screen.findByText('Total students')).toBeInTheDocument()
    expect(api.get).toHaveBeenCalledWith(expect.stringContaining('/api/sis/dashboard'))
  })
})

describe('RosterPage', () => {
  it('lists every account with a role column, not just students', async () => {
    render(<RosterPage />)
    expect(await screen.findByText('Alice Student')).toBeInTheDocument()
    expect(screen.getByText('Bob Builder')).toBeInTheDocument()
    expect(screen.getAllByText('Fam').length).toBeGreaterThan(0) // family column
    // non-student accounts appear with their role pill
    expect(screen.getByText('Paula Parent')).toBeInTheDocument()
    expect(screen.getByText('Parent')).toBeInTheDocument()
    expect(screen.getAllByText('Student').length).toBeGreaterThan(0)
  })

  it('opens the student detail modal from a row', async () => {
    render(<RosterPage />)
    // The roster is a directory now: click a row (no per-row "Details" button).
    fireEvent.click(await screen.findByText('Alice Student'))
    expect(await screen.findByText('Emergency contacts')).toBeInTheDocument()
  })

  it('hides withdrawn/graduated students by default and can show them', async () => {
    render(<RosterPage />)
    expect(await screen.findByText('Alice Student')).toBeInTheDocument()
    expect(screen.getByText('Bob Builder')).toBeInTheDocument()
    expect(screen.queryByText('Carol Gone')).not.toBeInTheDocument() // withdrawn, hidden
    fireEvent.click(screen.getByLabelText(/Hide withdrawn/))
    expect(await screen.findByText('Carol Gone')).toBeInTheDocument()
  })

  it('filters the roster by search text', async () => {
    render(<RosterPage />)
    await screen.findByText('Alice Student')
    fireEvent.change(screen.getByPlaceholderText(/Search by name/), { target: { value: 'bob' } })
    expect(screen.queryByText('Alice Student')).not.toBeInTheDocument()
    expect(screen.getByText('Bob Builder')).toBeInTheDocument()
  })

  it('sorts by name when the Name header is clicked', async () => {
    render(<RosterPage />)
    await screen.findByText('Alice Student')
    // Default sort is name-ascending; clicking the Name header toggles to descending.
    fireEvent.click(screen.getByRole('button', { name: /^Name/ }))
    const names = screen.getAllByRole('row').slice(1).map((r) => r.querySelector('td')?.textContent)
    // descending: Paula, Bob, Alice (Carol is withdrawn and hidden)
    expect(names[0]).toContain('Paula')
    expect(names[1]).toContain('Bob')
    expect(names[2]).toContain('Alice')
  })
})

describe('HouseholdsPage', () => {
  it('lists families and creates a new one', async () => {
    render(<HouseholdsPage />)
    expect(await screen.findByText('Fam')).toBeInTheDocument()

    // Manual creation is behind a toggle now (search-first UI).
    fireEvent.click(screen.getByText('+ Create a family manually'))
    fireEvent.change(screen.getByPlaceholderText('New family / household name'), {
      target: { value: 'The Garcia Family' },
    })
    fireEvent.click(screen.getByText('Create'))
    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith('/api/sis/households', expect.objectContaining({ name: 'The Garcia Family' })),
    )
  })

  it('surfaces household-less students and adds one to a family', async () => {
    render(<HouseholdsPage />)
    // Zed is a student in the org but in no household; Alice is in Fam.
    const heading = await screen.findByText('Students without a family')
    const panel = heading.closest('.bg-amber-50')
    expect(within(panel).getByText('Zed Unassigned')).toBeInTheDocument()
    expect(within(panel).queryByText('Alice Student')).not.toBeInTheDocument()

    // Pick the family in Zed's row, then Add.
    fireEvent.change(within(panel).getAllByPlaceholderText('Search families…')[0], { target: { value: 'Fam' } })
    fireEvent.mouseDown(await within(panel).findByText('Fam'))
    fireEvent.click(within(panel).getByText('Add'))
    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith('/api/sis/households/h1/members',
        expect.objectContaining({ user_id: 's9', relationship: 'student' })),
    )
  })

  it('connects a student by account email', async () => {
    render(<HouseholdsPage />)
    const heading = await screen.findByText('Students without a family')
    const panel = heading.closest('.bg-amber-50')
    fireEvent.change(within(panel).getByPlaceholderText('student@example.com'), {
      target: { value: 'kid@family.com' },
    })
    fireEvent.change(within(panel).getAllByPlaceholderText('Search families…')[1], { target: { value: 'Fam' } })
    fireEvent.mouseDown(await within(panel).findByText('Fam'))
    fireEvent.click(within(panel).getByText('Connect'))
    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith('/api/sis/households/h1/members',
        expect.objectContaining({ email: 'kid@family.com', relationship: 'student' })),
    )
  })

  it('warns on a likely duplicate and re-submits with confirmation when accepted', async () => {
    // First add is rejected with a duplicate warning; after the admin confirms,
    // the same add re-runs with confirm_duplicate so the student is still added.
    api.post
      .mockRejectedValueOnce({
        response: { status: 409, data: {
          needs_confirmation: true,
          error: 'This family already includes Zachary Barlow, which looks like the same student. Add anyway?',
          duplicates: [{ user_id: 's1', name: 'Zachary Barlow' }],
        } },
      })
      .mockResolvedValueOnce({ data: { member: { user_id: 's9' } } })
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true)

    render(<HouseholdsPage />)
    const heading = await screen.findByText('Students without a family')
    const panel = heading.closest('.bg-amber-50')
    fireEvent.change(within(panel).getAllByPlaceholderText('Search families…')[0], { target: { value: 'Fam' } })
    fireEvent.mouseDown(await within(panel).findByText('Fam'))
    fireEvent.click(within(panel).getByText('Add'))

    await waitFor(() => expect(confirmSpy).toHaveBeenCalled())
    await waitFor(() =>
      expect(api.post).toHaveBeenLastCalledWith('/api/sis/households/h1/members',
        expect.objectContaining({ user_id: 's9', relationship: 'student', confirm_duplicate: true })),
    )
    expect(api.post).toHaveBeenCalledTimes(2)
    confirmSpy.mockRestore()
  })

  it('does not add the duplicate when the admin declines the warning', async () => {
    api.post.mockRejectedValueOnce({
      response: { status: 409, data: {
        needs_confirmation: true,
        error: 'This family already includes Zachary Barlow, which looks like the same student. Add anyway?',
      } },
    })
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false)

    render(<HouseholdsPage />)
    const heading = await screen.findByText('Students without a family')
    const panel = heading.closest('.bg-amber-50')
    fireEvent.change(within(panel).getAllByPlaceholderText('Search families…')[0], { target: { value: 'Fam' } })
    fireEvent.mouseDown(await within(panel).findByText('Fam'))
    fireEvent.click(within(panel).getByText('Add'))

    await waitFor(() => expect(confirmSpy).toHaveBeenCalled())
    expect(api.post).toHaveBeenCalledTimes(1) // never retried
    confirmSpy.mockRestore()
  })

  it('marks a student graduated to remove them from the list', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true)
    render(<HouseholdsPage />)
    const heading = await screen.findByText('Students without a family')
    const panel = heading.closest('.bg-amber-50')
    fireEvent.click(within(panel).getByText('Graduated'))
    await waitFor(() =>
      expect(api.patch).toHaveBeenCalledWith('/api/sis/enrollments/s9',
        expect.objectContaining({ status: 'graduated', organization_id: 'org-1' })),
    )
    confirmSpy.mockRestore()
  })

  it('badges an unassigned student who looks like someone already in a family', async () => {
    api.get.mockImplementation((url) =>
      url.includes('/api/sis/unassigned-students')
        ? Promise.resolve({ data: { students: [
            { id: 's9', name: 'Zed Unassigned', email: 'zed@x.com', enrollment_status: 'unassigned',
              possible_duplicate_of: [{ household_id: 'h1', household_name: 'Fam', name: 'Zed Twin' }] },
          ] } })
        : Promise.resolve(apiData(url)))
    render(<HouseholdsPage />)
    const heading = await screen.findByText('Students without a family')
    const panel = heading.closest('.bg-amber-50')
    expect(within(panel).getByText(/Possible duplicate of Zed Twin/)).toBeInTheDocument()
  })
})

describe('FamilyMessagingPage', () => {
  it('sends an announcement via /api/announcements', async () => {
    render(<FamilyMessagingPage />)
    fireEvent.change(screen.getByPlaceholderText('Subject line'), { target: { value: 'Hello' } })
    fireEvent.change(screen.getByPlaceholderText('Write your announcement…'), { target: { value: 'Body text' } })
    fireEvent.click(screen.getByText('Send announcement'))
    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith('/api/announcements', expect.objectContaining({
        title: 'Hello', message: 'Body text', audiences: ['parents'],
      })),
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
