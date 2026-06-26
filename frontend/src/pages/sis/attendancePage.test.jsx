import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render as rtlRender, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

const render = (ui) => rtlRender(<MemoryRouter>{ui}</MemoryRouter>)

let authState = { user: { id: 'u1', role: 'advisor' } }
let orgState = { organization: { id: 'org-1', name: 'Org' } }

vi.mock('../../contexts/AuthContext', () => ({ useAuth: () => authState }))
vi.mock('../../contexts/OrganizationContext', () => ({ useOrganization: () => orgState }))
vi.mock('react-hot-toast', () => ({
  toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }),
  default: { success: vi.fn(), error: vi.fn() },
}))

const { api } = vi.hoisted(() => {
  const apiData = (url) => {
    if (url.includes('/attendance')) {
      return { data: { roster: [{ student_user_id: 's1', name: 'Bo', status: null }] } }
    }
    if (url.includes('/api/sis/classes')) {
      return { data: { classes: [{ id: 'c1', name: 'Pottery' }] } }
    }
    return { data: {} }
  }
  return {
    api: {
      get: vi.fn((url) => Promise.resolve(apiData(url))),
      post: vi.fn(() => Promise.resolve({ data: { count: 1 } })),
    },
  }
})
vi.mock('../../services/api', () => ({ default: api }))

import AttendancePage from './AttendancePage'

beforeEach(() => {
  authState = { user: { id: 'u1', role: 'advisor' } }
  orgState = { organization: { id: 'org-1', name: 'Org' } }
  vi.clearAllMocks()
})

describe('AttendancePage', () => {
  it('loads roster after picking a class and marks + saves attendance', async () => {
    render(<AttendancePage />)
    // pick the class
    const classSelect = await screen.findByRole('combobox')
    fireEvent.change(classSelect, { target: { value: 'c1' } })
    // roster appears
    expect(await screen.findByText('Bo')).toBeInTheDocument()
    // mark present
    fireEvent.click(screen.getByText('present'))
    fireEvent.click(screen.getByText('Save attendance'))
    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith('/api/sis/classes/c1/attendance', expect.objectContaining({
        entries: [{ student_user_id: 's1', status: 'present' }],
      })),
    )
  })
})
