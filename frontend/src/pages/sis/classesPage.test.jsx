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
    if (url.includes('/api/sis/programs')) {
      return { data: { programs: [{ id: 'p1', name: 'Full Day', class_count: 1 }] } }
    }
    if (url.includes('/meetings')) {
      return { data: { meetings: [] } }
    }
    if (url.includes('/api/sis/classes')) {
      return { data: { classes: [
        { id: 'c1', name: 'Pottery', program_name: 'Full Day', enrolled_count: 2, capacity: 10,
          price_cents: 5000, is_full: false, registration_status: 'closed', meetings: [] },
      ] } }
    }
    return { data: {} }
  }
  return {
    api: {
      get: vi.fn((url) => Promise.resolve(apiData(url))),
      post: vi.fn(() => Promise.resolve({ data: { program: { id: 'p2' }, class: { id: 'c2' }, meeting: { id: 'm1' } } })),
      patch: vi.fn(() => Promise.resolve({ data: { class: { id: 'c1' } } })),
      delete: vi.fn(() => Promise.resolve({ data: {} })),
    },
  }
})
vi.mock('../../services/api', () => ({ default: api }))

import ClassesPage from './ClassesPage'

beforeEach(() => {
  authState = { user: { id: 'u1', role: 'org_admin' } }
  orgState = { organization: { id: 'org-1', name: 'Org' } }
  vi.clearAllMocks()
})

describe('ClassesPage', () => {
  it('lists programs and classes', async () => {
    render(<ClassesPage />)
    expect(await screen.findByText('Pottery')).toBeInTheDocument()
    expect(screen.getAllByText(/Full Day/).length).toBeGreaterThan(0)
    expect(api.get).toHaveBeenCalledWith(expect.stringContaining('/api/sis/classes'))
  })

  it('creates a program', async () => {
    render(<ClassesPage />)
    await screen.findByText('Pottery')
    fireEvent.change(screen.getByPlaceholderText(/New program name/), { target: { value: 'Half-Day' } })
    fireEvent.click(screen.getByText('Add program'))
    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith('/api/sis/programs', expect.objectContaining({ name: 'Half-Day' })),
    )
  })

  it('creates a class converting price to cents', async () => {
    render(<ClassesPage />)
    await screen.findByText('Pottery')
    fireEvent.change(screen.getByPlaceholderText('New class name'), { target: { value: 'Drawing' } })
    fireEvent.change(screen.getByPlaceholderText('Price $'), { target: { value: '49.50' } })
    fireEvent.click(screen.getByText('Add'))
    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith('/api/sis/classes', expect.objectContaining({
        name: 'Drawing', price_cents: 4950,
      })),
    )
  })

  it('toggles registration status', async () => {
    render(<ClassesPage />)
    await screen.findByText('Pottery')
    fireEvent.click(screen.getByText('Registration closed'))
    await waitFor(() =>
      expect(api.patch).toHaveBeenCalledWith('/api/sis/classes/c1', expect.objectContaining({ registration_status: 'open' })),
    )
  })

  it('renames a program', async () => {
    render(<ClassesPage />)
    await screen.findByText('Pottery')
    fireEvent.click(screen.getAllByText('Edit')[0]) // first Edit = program row
    const input = screen.getByDisplayValue('Full Day')
    fireEvent.change(input, { target: { value: 'Full-Day Microschool' } })
    fireEvent.click(screen.getByText('Save'))
    await waitFor(() =>
      expect(api.patch).toHaveBeenCalledWith('/api/sis/programs/p1', expect.objectContaining({ name: 'Full-Day Microschool' })),
    )
  })

  it('archives a program after confirm', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    render(<ClassesPage />)
    await screen.findByText('Pottery')
    fireEvent.click(screen.getAllByText('Archive')[0]) // first Archive = program row
    await waitFor(() =>
      expect(api.delete).toHaveBeenCalledWith(expect.stringContaining('/api/sis/programs/p1')),
    )
  })

  it('edits a class converting price to cents', async () => {
    render(<ClassesPage />)
    await screen.findByText('Pottery')
    fireEvent.click(screen.getAllByText('Edit')[1]) // second Edit = class card
    fireEvent.change(screen.getByDisplayValue('50.00'), { target: { value: '75.00' } })
    fireEvent.click(screen.getByText('Save'))
    await waitFor(() =>
      expect(api.patch).toHaveBeenCalledWith('/api/sis/classes/c1', expect.objectContaining({ price_cents: 7500 })),
    )
  })

  it('archives a class after confirm', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    render(<ClassesPage />)
    await screen.findByText('Pottery')
    fireEvent.click(screen.getAllByText('Archive')[1]) // second Archive = class row
    await waitFor(() =>
      expect(api.delete).toHaveBeenCalledWith(expect.stringContaining('/api/sis/classes/c1')),
    )
  })
})
