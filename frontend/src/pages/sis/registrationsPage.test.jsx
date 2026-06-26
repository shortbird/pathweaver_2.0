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

const { api } = vi.hoisted(() => {
  const apiData = (url) => {
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
  }
})
vi.mock('../../services/api', () => ({ default: api }))

import RegistrationsPage from './RegistrationsPage'

beforeEach(() => {
  authState = { user: { id: 'u1', role: 'org_admin' } }
  orgState = { organization: { id: 'org-1', name: 'Org' } }
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
})
