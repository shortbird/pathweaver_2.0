import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render as rtlRender, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

const render = (ui) => rtlRender(<MemoryRouter>{ui}</MemoryRouter>)

let authState = { user: { id: 'u1', role: 'org_admin' } }
let orgState = { organization: { id: 'org-1', name: 'Org' } }

vi.mock('../../contexts/AuthContext', () => ({ useAuth: () => authState }))
vi.mock('../../contexts/OrganizationContext', () => ({ useOrganization: () => orgState }))
vi.mock('react-hot-toast', () => ({
  toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }),
  default: { success: vi.fn(), error: vi.fn() },
}))

const { api, exceptionState } = vi.hoisted(() => {
  const exceptionState = { rows: [] }
  const apiData = (url) => {
    if (url.includes('/api/sis/age-exception-requests')) {
      return { data: { requests: exceptionState.rows } }
    }
    if (url.includes('/api/sis/registrations/r1')) {
      return { data: { registration: {
        id: 'r1', student_name: 'Alice', status: 'in_progress',
        items: [{ id: 'i1', class_name: 'Pottery', status: 'selected', price_snapshot_cents: 5000 }],
      } } }
    }
    if (url.includes('/api/sis/registrations')) {
      return { data: { registrations: [{ id: 'r1', student_name: 'Alice', status: 'in_progress', item_count: 1 }] } }
    }
    if (url.includes('/api/sis/members')) {
      return { data: { members: [{ id: 's1', name: 'Alice', is_student: true }] } }
    }
    if (url.includes('/api/sis/classes')) {
      return { data: { classes: [{ id: 'c1', name: 'Pottery', is_full: false }] } }
    }
    return { data: {} }
  }
  return {
    api: {
      get: vi.fn((url) => Promise.resolve(apiData(url))),
      post: vi.fn(() => Promise.resolve({ data: { registration: { id: 'r1' }, evaluation: { warnings: ['Student is 6; class minimum age is 8.'] } } })),
      delete: vi.fn(() => Promise.resolve({ data: {} })),
    },
    exceptionState,
  }
})
vi.mock('../../services/api', () => ({ default: api }))

import RegistrationsPage from './RegistrationsPage'

beforeEach(() => {
  authState = { user: { id: 'u1', role: 'org_admin' } }
  orgState = { organization: { id: 'org-1', name: 'Org' } }
  exceptionState.rows = []
  vi.clearAllMocks()
})

describe('RegistrationsPage', () => {
  it('lists registrations', async () => {
    render(<RegistrationsPage />)
    expect(await screen.findByRole('button', { name: /Alice/ })).toBeInTheDocument()
    expect(api.get).toHaveBeenCalledWith(expect.stringContaining('/api/sis/registrations'))
  })

  it('starts a registration for a chosen student', async () => {
    render(<RegistrationsPage />)
    await screen.findByRole('button', { name: /Alice/ })
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 's1' } })
    fireEvent.click(screen.getByText('Start registration'))
    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith('/api/sis/registrations', expect.objectContaining({ student_user_id: 's1' })),
    )
  })

  it('opens detail and adds a class', async () => {
    render(<RegistrationsPage />)
    fireEvent.click(await screen.findByRole('button', { name: /Alice/ }))
    // detail panel shows the selected class
    expect((await screen.findAllByText('Pottery')).length).toBeGreaterThan(0)
    const selects = screen.getAllByRole('combobox')
    const addSelect = selects[selects.length - 1]
    fireEvent.change(addSelect, { target: { value: 'c1' } })
    fireEvent.click(screen.getByText('Add'))
    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith('/api/sis/registrations/r1/items', expect.objectContaining({ class_id: 'c1' })),
    )
  })

  it('lists pending age exception requests and approves one', async () => {
    exceptionState.rows = [{
      id: 'x1', status: 'pending', student_name: 'Alice', guardian_name: 'Dana Parent',
      class_name: 'Robotics', student_age: 8, class_min_age: 9, class_max_age: 12,
      message: 'She has done two robotics camps', created_at: '2026-07-14T10:00:00Z',
    }]
    render(<RegistrationsPage />)
    expect(await screen.findByText('Age exception requests')).toBeInTheDocument()
    expect(screen.getByText(/Requested by Dana Parent/)).toBeInTheDocument()
    expect(screen.getByText(/She has done two robotics camps/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Approve & enroll' }))
    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith('/api/sis/age-exception-requests/x1/resolve',
        expect.objectContaining({ action: 'approve' })),
    )
  })

  it('declines a request and tucks resolved ones behind a summary', async () => {
    exceptionState.rows = [
      { id: 'x1', status: 'pending', student_name: 'Alice', guardian_name: 'Dana Parent',
        class_name: 'Robotics', created_at: '2026-07-14T10:00:00Z' },
      { id: 'x0', status: 'approved', student_name: 'Ben', guardian_name: 'Dana Parent',
        class_name: 'Pottery', created_at: '2026-07-01T10:00:00Z', resolved_at: '2026-07-02T09:00:00Z' },
    ]
    render(<RegistrationsPage />)
    expect(await screen.findByText(/Resolved age exception requests \(1\)/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Decline' }))
    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith('/api/sis/age-exception-requests/x1/resolve',
        expect.objectContaining({ action: 'decline' })),
    )
  })
})
