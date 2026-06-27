import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render as rtlRender, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

const render = (ui) => rtlRender(<MemoryRouter>{ui}</MemoryRouter>)

vi.mock('react-hot-toast', () => ({
  toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }),
  default: { success: vi.fn(), error: vi.fn() },
}))

const { api } = vi.hoisted(() => ({
  api: { get: vi.fn(), post: vi.fn(), delete: vi.fn() },
}))
vi.mock('../services/api', () => ({ default: api }))

import ClassRegistrationPage from './ClassRegistrationPage'

const withContext = (orgs) => (url) => {
  if (url.includes('/parent/context')) return Promise.resolve({ data: { orgs } })
  if (url.includes('/parent/classes')) return Promise.resolve({ data: { classes: [
    { id: 'c1', name: 'Pottery', price_cents: 5000, capacity: 10, spots_left: 8, is_full: false, registration_status: 'open', meetings: [] },
  ] } })
  if (url.includes('/parent/registrations')) return Promise.resolve({ data: { registrations: [] } })
  return Promise.resolve({ data: {} })
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('ClassRegistrationPage', () => {
  it('shows an empty state when the family is not set up', async () => {
    api.get.mockImplementation(withContext([]))
    render(<ClassRegistrationPage />)
    expect(await screen.findByText(/isn’t available for your family yet/)).toBeInTheDocument()
  })

  it('lists open classes for a guardian and starts a registration', async () => {
    api.get.mockImplementation(withContext([
      { organization_id: 'org1', organization_name: 'Micro School', students: [{ student_id: 's1', name: 'Kid One' }] },
    ]))
    api.post.mockResolvedValue({ data: { registration: { id: 'reg1' } } })
    // After start, openRegistration fetches detail + quote
    api.get.mockImplementation((url) => {
      if (url.includes('/registrations/reg1/quote')) return Promise.resolve({ data: { quote: { subtotal_cents: 5000, discount_cents: 0, total_cents: 5000 } } })
      if (url.includes('/registrations/reg1')) return Promise.resolve({ data: { registration: { id: 'reg1', student_name: 'Kid One', status: 'in_progress', items: [] } } })
      return withContext([
        { organization_id: 'org1', organization_name: 'Micro School', students: [{ student_id: 's1', name: 'Kid One' }] },
      ])(url)
    })

    render(<ClassRegistrationPage />)
    expect(await screen.findByText('Pottery')).toBeInTheDocument()

    fireEvent.click(screen.getByText('Start a registration'))
    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith('/api/sis/parent/registrations',
        expect.objectContaining({ organization_id: 'org1', student_user_id: 's1' })),
    )
    // the active registration panel appears (unique to the open registration)
    expect(await screen.findByText('Submit registration')).toBeInTheDocument()
  })
})
