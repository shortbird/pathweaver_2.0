import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render as rtlRender, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

const render = (ui) => rtlRender(<MemoryRouter>{ui}</MemoryRouter>)

let authState = { user: { id: 'u1', role: 'org_admin' } }
let orgState = { organization: { id: 'org-1', name: 'Org' } }

vi.mock('../../contexts/AuthContext', () => ({ useAuth: () => authState }))
vi.mock('../../contexts/OrganizationContext', () => ({ useOrganization: () => orgState }))
vi.mock('react-hot-toast', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
  default: { success: vi.fn(), error: vi.fn() },
}))

const { api } = vi.hoisted(() => {
  const apiData = (url) => {
    if (url.includes('/api/sis/staff')) {
      return { data: { staff: [
        { id: 's1', name: 'Jane Doe', first_name: 'Jane', last_name: 'Doe', email: 'jane@icreate.org',
          roles: ['advisor'], role_labels: ['Teacher'], bio: 'Ceramics teacher for 10 years',
          avatar_url: 'https://cdn.example/staff-photos/s1/x.jpg', last_active: null },
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

import StaffPage from './StaffPage'

beforeEach(() => {
  authState = { user: { id: 'u1', role: 'org_admin' } }
  orgState = { organization: { id: 'org-1', name: 'Org' } }
  vi.clearAllMocks()
})

describe('StaffPage', () => {
  it('shows staff with photo and bio', async () => {
    render(<StaffPage />)
    expect(await screen.findByText('Jane Doe')).toBeInTheDocument()
    expect(screen.getByText('Ceramics teacher for 10 years')).toBeInTheDocument()
    // Photo replaces the initials avatar when avatar_url is set.
    expect(screen.queryByText('JD')).not.toBeInTheDocument()
  })

  it('adds a teacher via the modal', async () => {
    render(<StaffPage />)
    await screen.findByText('Jane Doe')
    fireEvent.click(screen.getByText('Add teacher'))
    fireEvent.change(screen.getByLabelText(/First Name/), { target: { value: 'Sam' } })
    fireEvent.change(screen.getByLabelText(/Last Name/), { target: { value: 'Lee' } })
    fireEvent.change(screen.getByLabelText(/Email/), { target: { value: 'sam@icreate.org' } })
    fireEvent.change(screen.getByLabelText(/Bio/), { target: { value: 'Robotics coach' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add Teacher' }))
    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith('/api/sis/staff', expect.objectContaining({
        first_name: 'Sam', last_name: 'Lee', email: 'sam@icreate.org',
        bio: 'Robotics coach', organization_id: 'org-1',
      })),
    )
  })

  it('edits a teacher bio via the modal', async () => {
    render(<StaffPage />)
    await screen.findByText('Jane Doe')
    fireEvent.click(screen.getByText('Edit'))
    fireEvent.change(screen.getByLabelText(/Bio/), { target: { value: 'Updated bio' } })
    fireEvent.click(screen.getByText('Save changes'))
    await waitFor(() =>
      expect(api.patch).toHaveBeenCalledWith('/api/sis/staff/s1', expect.objectContaining({
        bio: 'Updated bio',
      })),
    )
  })

  it('surfaces a backend error in the modal', async () => {
    api.post.mockRejectedValueOnce({ response: { data: { error: 'A user with this email already exists' } } })
    render(<StaffPage />)
    await screen.findByText('Jane Doe')
    fireEvent.click(screen.getByText('Add teacher'))
    fireEvent.change(screen.getByLabelText(/First Name/), { target: { value: 'Sam' } })
    fireEvent.change(screen.getByLabelText(/Last Name/), { target: { value: 'Lee' } })
    fireEvent.change(screen.getByLabelText(/Email/), { target: { value: 'jane@icreate.org' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add Teacher' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('A user with this email already exists')
  })
})
