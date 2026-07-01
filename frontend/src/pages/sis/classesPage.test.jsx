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
    if (url.includes('/waitlist')) return { data: { waitlist: [] } }
    if (url.includes('/api/courses')) {
      return { data: { courses: [
        { id: 'crs1', title: 'Intro to Robotics', description: 'Build robots', status: 'published',
          visibility: 'public', organization_id: 'other-org', age_range: '10-14', estimated_hours: 12 },
      ] } }
    }
    if (url.includes('/api/sis/classes')) {
      return { data: { classes: [
        { id: 'c1', name: 'Pottery', description: 'Clay', enrolled_count: 2, capacity: 10,
          supply_fee: 15, min_age: 8, max_age: 12, is_full: false, registration_status: 'closed',
          meetings: [] },
      ] } }
    }
    return { data: {} }
  }
  return {
    api: {
      get: vi.fn((url) => Promise.resolve(apiData(url))),
      post: vi.fn(() => Promise.resolve({ data: { class: { id: 'c2' } } })),
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
  it('lists classes with their data points', async () => {
    render(<ClassesPage />)
    expect(await screen.findByText('Pottery')).toBeInTheDocument()
    expect(screen.getByText('8–12')).toBeInTheDocument()
    expect(screen.getByText('$15.00')).toBeInTheDocument()
    expect(api.get).toHaveBeenCalledWith(expect.stringContaining('/api/sis/classes'))
  })

  it('creates a class via the modal', async () => {
    render(<ClassesPage />)
    await screen.findByText('Pottery')
    fireEvent.click(screen.getByText('Create class')) // page button opens modal
    fireEvent.change(screen.getByLabelText(/Class Name/), { target: { value: 'Drawing' } })
    fireEvent.click(screen.getByRole('button', { name: 'Create Class' })) // modal submit
    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith('/api/sis/classes', expect.objectContaining({
        name: 'Drawing', organization_id: 'org-1',
      })),
    )
  })

  it('edits a class via the modal', async () => {
    render(<ClassesPage />)
    await screen.findByText('Pottery')
    fireEvent.click(screen.getByText('Edit'))
    fireEvent.change(screen.getByDisplayValue('Pottery'), { target: { value: 'Pottery II' } })
    fireEvent.click(screen.getByText('Save changes'))
    await waitFor(() =>
      expect(api.patch).toHaveBeenCalledWith('/api/sis/classes/c1', expect.objectContaining({ name: 'Pottery II' })),
    )
  })

  it('toggles registration status', async () => {
    render(<ClassesPage />)
    await screen.findByText('Pottery')
    fireEvent.click(screen.getByRole('switch'))
    await waitFor(() =>
      expect(api.patch).toHaveBeenCalledWith('/api/sis/classes/c1', expect.objectContaining({ registration_status: 'open' })),
    )
  })

  it('archives a class after confirm', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    render(<ClassesPage />)
    await screen.findByText('Pottery')
    fireEvent.click(screen.getByText('Archive'))
    await waitFor(() =>
      expect(api.delete).toHaveBeenCalledWith(expect.stringContaining('/api/sis/classes/c1')),
    )
  })

  it('lists Optio courses in the catalog and opens the enroll modal', async () => {
    render(<ClassesPage />)
    await screen.findByText('Pottery') // default view = org classes
    fireEvent.click(screen.getByText(/^Optio Courses \(/))
    expect(await screen.findByText('Intro to Robotics')).toBeInTheDocument()
    fireEvent.click(screen.getByText('Enroll student'))
    expect(await screen.findByText('Enroll a student')).toBeInTheDocument()
  })

  it('filters to courses only', async () => {
    render(<ClassesPage />)
    await screen.findByText('Pottery')
    fireEvent.click(screen.getByText(/^Optio Courses \(/))
    expect(screen.getByText('Intro to Robotics')).toBeInTheDocument()
    expect(screen.queryByText('Pottery')).not.toBeInTheDocument()
  })
})
