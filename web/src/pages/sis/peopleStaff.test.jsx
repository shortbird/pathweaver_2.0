import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render as rtlRender, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RecordDoorsProvider } from '../../components/sis/RecordDoors'

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
      <MemoryRouter><RecordDoorsProvider>{ui}</RecordDoorsProvider></MemoryRouter>
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

/**
 * Staff on the one People table. The Staff tab is gone (2026-09-16); a teacher
 * is a row like anyone else, and their record opens from "Staff record" in
 * the row menu: one modal with Profile, Employment and Account tabs (M13c).
 */
vi.mock('./SisOrgPicker', () => ({ default: () => null }))
vi.mock('./useSisOrg', () => ({
  useSisOrg: () => ({ orgId: 'org-1', setOrgId: vi.fn(), orgs: [], isSuperadmin: false, activeOrg: null }),
  withOrg: (p) => p,
}))
vi.mock('./teacherPreview', () => ({ setPreviewTeacher: vi.fn(), getPreviewTeacher: () => null }))
vi.mock('./StudentDetailModal', () => ({ default: () => <div /> }))
vi.mock('./FamilyDetailModal', () => ({ default: () => <div /> }))
vi.mock('../../contexts/ConfirmContext', () => ({ useConfirm: () => () => Promise.resolve(true) }))

const { api } = vi.hoisted(() => {
  const apiData = (url) => {
    if (url.includes('/api/sis/roster')) {
      return { data: { roster: [
        { student_id: 's1', name: 'Jane Doe', first_name: 'Jane', last_name: 'Doe', email: 'jane@icreate.org',
          is_student: false, role: 'advisor', roles: ['advisor'], bio: 'Ceramics teacher for 10 years',
          avatar_url: 'https://cdn.example/staff-photos/s1/x.jpg', last_active: '2026-09-01T00:00:00Z',
          login_pending: false, is_placeholder: false, class_count: 2 },
        { student_id: 'ph1', name: 'Liz', first_name: 'Liz', last_name: '',
          email: 'liz@icreate-staff.placeholder.optioeducation.com',
          is_student: false, role: 'advisor', roles: ['advisor'], bio: null,
          avatar_url: null, last_active: null, is_placeholder: true, login_pending: false, class_count: 0 },
      ] } }
    }
    return { data: {} }
  }
  return {
    api: {
      get: vi.fn((url) => Promise.resolve(apiData(url))),
      post: vi.fn(() => Promise.resolve({ data: { teacher: { id: 's2' } } })),
      patch: vi.fn(() => Promise.resolve({ data: { staff: { id: 's1' } } })),
    },
  }
})
vi.mock('../../services/api', () => ({ default: api }))

import PeoplePage from './PeoplePage'

beforeEach(() => {
  authState = { user: { id: 'u1', role: 'org_admin' } }
  orgState = { organization: { id: 'org-1', name: 'Org' } }
  vi.clearAllMocks()
})

const openStaffRecord = async (name) => {
  await screen.findByText(name)
  const row = screen.getByText(name).closest('tr')
  fireEvent.click(row.querySelector('button[aria-label="Actions"]'))
  fireEvent.click(screen.getByText('Staff record'))
}

const addTeacher = () => {
  fireEvent.click(screen.getByRole('button', { name: '+ Add' }))
  fireEvent.click(screen.getByRole('menuitem', { name: 'Teacher' }))
}

describe('Staff on the People table', () => {
  it('shows a teacher as a row with their photo, role and classes', async () => {
    render(<PeoplePage />)
    expect(await screen.findByText('Jane Doe')).toBeInTheDocument()
    const row = screen.getByText('Jane Doe').closest('tr')
    expect(row).toHaveTextContent('Teacher')
    expect(row).toHaveTextContent('2 classes')
    // Photo replaces the initials avatar when avatar_url is set.
    expect(screen.queryByText('JD')).not.toBeInTheDocument()
  })

  it('adds a teacher via the modal', async () => {
    render(<PeoplePage />)
    await screen.findByText('Jane Doe')
    addTeacher()
    // Email is the only thing an admin supplies; the teacher names themselves
    // when they set their password.
    expect(screen.queryByLabelText(/First Name/)).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/Bio/)).not.toBeInTheDocument()
    fireEvent.change(screen.getByLabelText(/Email/), { target: { value: 'sam@icreate.org' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add Teacher' }))
    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith('/api/sis/staff', expect.objectContaining({
        email: 'sam@icreate.org', organization_id: 'org-1',
      })),
    )
  })

  it('edits a teacher bio on the record\'s Profile tab', async () => {
    render(<PeoplePage />)
    await openStaffRecord('Jane Doe')
    fireEvent.change(await screen.findByLabelText(/Bio/), { target: { value: 'Updated bio' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save profile' }))
    await waitFor(() =>
      expect(api.patch).toHaveBeenCalledWith('/api/sis/staff/s1', expect.objectContaining({
        bio: 'Updated bio', first_name: 'Jane', last_name: 'Doe', email: 'jane@icreate.org',
      })),
    )
  })

  it('flags placeholder staff and hides the synthetic email', async () => {
    render(<PeoplePage />)
    expect(await screen.findByText('Liz')).toBeInTheDocument()
    expect(screen.getByText('No login yet')).toBeInTheDocument()
    expect(screen.queryByText('liz@icreate-staff.placeholder.optioeducation.com')).not.toBeInTheDocument()
  })

  it('opens the staff record as one modal with three tabs', async () => {
    render(<PeoplePage />)
    await openStaffRecord('Liz')
    expect(await screen.findByRole('tab', { name: 'Profile' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Employment' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Account' })).toBeInTheDocument()
    // A placeholder's synthetic email is not offered for editing.
    expect(screen.getByText(/No login yet\. Link their account on the Account tab/)).toBeInTheDocument()
  })

  it('links a placeholder account on the Account tab', async () => {
    api.post.mockResolvedValueOnce({ data: { linked: 'invited', email_sent: true } })
    render(<PeoplePage />)
    await openStaffRecord('Liz')
    fireEvent.click(await screen.findByRole('tab', { name: 'Account' }))
    fireEvent.change(screen.getByLabelText(/Email/), { target: { value: 'liz@gmail.com' } })
    fireEvent.click(screen.getByRole('button', { name: 'Link account' }))
    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith('/api/sis/staff/ph1/link', {
        email: 'liz@gmail.com', organization_id: 'org-1',
      }),
    )
  })

  it('surfaces a link refusal on the Account tab', async () => {
    api.post.mockRejectedValueOnce({ response: { data: { error: 'This email belongs to a student account' } } })
    render(<PeoplePage />)
    await openStaffRecord('Liz')
    fireEvent.click(await screen.findByRole('tab', { name: 'Account' }))
    fireEvent.change(screen.getByLabelText(/Email/), { target: { value: 'kid@gmail.com' } })
    fireEvent.click(screen.getByRole('button', { name: 'Link account' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('This email belongs to a student account')
  })

  it('the Employment tab saves position and hours where StaffProfileModal used to', async () => {
    api.put = vi.fn(() => Promise.resolve({ data: {} }))
    render(<PeoplePage />)
    await openStaffRecord('Jane Doe')
    fireEvent.click(await screen.findByRole('tab', { name: 'Employment' }))
    fireEvent.change(await screen.findByLabelText('Position'), { target: { value: 'Art teacher' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save employment' }))
    await waitFor(() =>
      expect(api.put).toHaveBeenCalledWith('/api/sis/staff-admin/profiles/s1', expect.objectContaining({
        position: 'Art teacher', organization_id: 'org-1',
      })),
    )
  })

  it('surfaces a backend error in the modal', async () => {
    api.post.mockRejectedValueOnce({ response: { data: { error: 'A user with this email already exists' } } })
    render(<PeoplePage />)
    await screen.findByText('Jane Doe')
    addTeacher()
    fireEvent.change(screen.getByLabelText(/Email/), { target: { value: 'jane@icreate.org' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add Teacher' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('A user with this email already exists')
  })
})
