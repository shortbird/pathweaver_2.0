import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render as rtlRender, screen, fireEvent, waitFor } from '@testing-library/react'
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
const { api } = vi.hoisted(() => {
  const apiData = (url) => {
    if (url.includes('/api/sis/dashboard')) {
      return { data: { data: {
        organization: { name: 'Org' }, total_students: 3, active_last_7_days: 1,
        households: 2, enrollment_status: { enrolled: 2, applicant: 1 },
      } } }
    }
    if (url.includes('/api/sis/roster')) {
      return { data: { roster: [
        { student_id: 's1', name: 'Alice Student', email: 'a@x.com', total_xp: 10,
          enrollment_status: 'enrolled', household_name: 'Fam' },
        { student_id: 's2', name: 'Bob Builder', email: 'b@x.com', total_xp: 30,
          enrollment_status: 'applicant', household_name: null },
        { student_id: 's3', name: 'Carol Gone', email: 'c@x.com', total_xp: 5,
          enrollment_status: 'withdrawn', household_name: null },
      ] } }
    }
    if (url.includes('/api/sis/members')) {
      return { data: { members: [{ id: 's1', name: 'Alice Student', is_student: true }] } }
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
  it('lists students with their family', async () => {
    render(<RosterPage />)
    expect(await screen.findByText('Alice Student')).toBeInTheDocument()
    expect(screen.getByText('Bob Builder')).toBeInTheDocument()
    expect(screen.getByText('Fam')).toBeInTheDocument()   // Alice's family
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

  it('sorts by name when the Student header is clicked', async () => {
    render(<RosterPage />)
    await screen.findByText('Alice Student')
    // Default sort is name-ascending; clicking the Student header toggles to descending.
    fireEvent.click(screen.getByRole('button', { name: /^Student/ }))
    const names = screen.getAllByRole('row').slice(1).map((r) => r.querySelector('td')?.textContent)
    // descending: Bob before Alice (Carol is withdrawn and hidden)
    expect(names[0]).toContain('Bob')
    expect(names[1]).toContain('Alice')
  })
})

describe('HouseholdsPage', () => {
  it('lists families and creates a new one', async () => {
    render(<HouseholdsPage />)
    expect(await screen.findByText('Fam')).toBeInTheDocument()

    fireEvent.change(screen.getByPlaceholderText('New family / household name'), {
      target: { value: 'The Garcia Family' },
    })
    fireEvent.click(screen.getByText('Create family'))
    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith('/api/sis/households', expect.objectContaining({ name: 'The Garcia Family' })),
    )
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
