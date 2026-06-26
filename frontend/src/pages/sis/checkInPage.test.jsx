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

const { api } = vi.hoisted(() => ({
  api: {
    get: vi.fn((url) => {
      if (url.includes('/checkin/day')) {
        return Promise.resolve({ data: { board: [
          { student_user_id: 's1', name: 'Bo', status: null },
        ] } })
      }
      return Promise.resolve({ data: {} })
    }),
    post: vi.fn(() => Promise.resolve({ data: {} })),
  },
}))
vi.mock('../../services/api', () => ({ default: api }))

import CheckInPage from './CheckInPage'

beforeEach(() => {
  authState = { user: { id: 'u1', role: 'org_admin' } }
  orgState = { organization: { id: 'org-1', name: 'Org' } }
  vi.clearAllMocks()
})

describe('CheckInPage', () => {
  it('lists enrolled students and checks one in', async () => {
    render(<CheckInPage />)
    expect(await screen.findByText('Bo')).toBeInTheDocument()
    fireEvent.click(screen.getByText('Check in'))
    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith('/api/sis/checkin/s1/check-in', expect.objectContaining({ organization_id: 'org-1' })),
    )
  })
})
