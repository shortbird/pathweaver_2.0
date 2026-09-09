import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render as rtlRender, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

/**
 * The CLP meeting screen's new surfaces, from iCreate's 2026-07-31 batch:
 *
 *  - "It would be helpful to have any waitlist or age exceptions that parents
 *     have requested listed here somewhere."
 *  - "Can we get a list somewhere that shows who all has completed their CLP?"
 *  - "maybe we could check the box during the CLP" (school of record)
 */

const render = (ui) => rtlRender(<MemoryRouter>{ui}</MemoryRouter>)

let authState = { user: { id: 'u1', role: 'org_admin' } }
let orgState = { organization: { id: 'org-1', name: 'Org' } }

vi.mock('../../contexts/AuthContext', () => ({ useAuth: () => authState }))
vi.mock('../../contexts/OrganizationContext', () => ({ useOrganization: () => orgState }))
vi.mock('react-hot-toast', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
  default: { success: vi.fn(), error: vi.fn() },
}))

const STUDENT = {
  success: true,
  student: { student_id: 's1', name: 'Alice Ant', age: 10 },
  family: { household_id: 'h1', name: 'Ant Family', school_name: 'iCreate Academy',
            enrolled_private_school: false },
  clp_record: { finished: false, notes: '' },
  schedule: [],
  classes: [],
  open_requests: {
    waitlist: [{ entry_id: 'w1', class_id: 'c9', class_name: 'Miniatures', status: 'offered',
                 sections: [{ class_id: 'c10', name: 'Miniatures (Thu 1:00)', capacity: 12, enrolled_count: 8 }] }],
    age_exceptions: [{ request_id: 'x1', class_id: 'c4', class_name: 'Teen Lab', message: 'She is 10' }],
  },
}

const DIRECTORY = {
  families: [
    { household_id: 'h1', name: 'Ant Family', student_count: 2, students: [
      { student_id: 's1', name: 'Alice Ant', age: 10, clp_finished: true },
      { student_id: 's2', name: 'Bob Ant', age: 13, clp_finished: false },
    ] },
  ],
  students: [],
  counts: { total: 2, clp_finished: 1, clp_todo: 1 },
}

const { api } = vi.hoisted(() => ({
  api: {
    get: vi.fn(),
    post: vi.fn(() => Promise.resolve({ data: { success: true } })),
    patch: vi.fn(() => Promise.resolve({ data: {} })),
    delete: vi.fn(() => Promise.resolve({ data: { success: true } })),
  },
}))
vi.mock('../../services/api', () => ({ default: api }))

import ClpPage from './ClpPage'

beforeEach(() => {
  vi.clearAllMocks()
  authState = { user: { id: 'u1', role: 'org_admin' } }
  api.get.mockImplementation((url) => {
    if (url.includes('/clp/directory')) return Promise.resolve({ data: DIRECTORY })
    if (url.includes('/clp/students/')) return Promise.resolve({ data: STUDENT })
    return Promise.resolve({ data: {} })
  })
})

const openStudent = async () => {
  render(<ClpPage />)
  fireEvent.click(await screen.findByText('Alice Ant'))
  return screen.findByText('Open requests')
}

describe('CLP directory lenses', () => {
  it('counts who still needs their CLP and who is done', async () => {
    render(<ClpPage />)
    expect(await screen.findByRole('button', { name: 'CLP to do · 1' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'CLP done · 1' })).toBeInTheDocument()
  })

  it('filters the picker to students whose CLP is not done', async () => {
    render(<ClpPage />)
    fireEvent.click(await screen.findByRole('button', { name: 'CLP to do · 1' }))
    expect(screen.getByText('Bob Ant')).toBeInTheDocument()
    expect(screen.queryByText('Alice Ant')).not.toBeInTheDocument()
  })
})

describe('CLP open requests', () => {
  it('lists the family\'s waitlist places and age-exception requests', async () => {
    await openStudent()
    expect(screen.getByText(/Waitlist · Miniatures/)).toBeInTheDocument()
    expect(screen.getByText(/seat offered/)).toBeInTheDocument()
    expect(screen.getByText(/Age exception · Teen Lab/)).toBeInTheDocument()
  })

  it('enrolls straight from the waitlist row', async () => {
    await openStudent()
    fireEvent.click(screen.getByRole('button', { name: 'Enroll now' }))
    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith('/api/sis/waitlist/w1/enroll', { organization_id: 'org-1' }),
    )
  })

  it('resolves an age exception from the meeting screen', async () => {
    await openStudent()
    fireEvent.click(screen.getByRole('button', { name: 'Approve' }))
    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith('/api/sis/age-exception-requests/x1/resolve',
        { action: 'approve', organization_id: 'org-1' }),
    )
  })

  // iCreate, 2026-08-01: "Maybe on Open requests it can show if there are other
  // sections available for a waitlisted class?"
  it('names other sections with room, and offers one to the family', async () => {
    await openStudent()
    expect(screen.getByText(/Other sections with room/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /offer Miniatures \(Thu 1:00\)/ }))
    await waitFor(() => expect(api.post).toHaveBeenCalledWith(
      '/api/sis/waitlist/w1/offer-section',
      { organization_id: 'org-1', class_id: 'c10' },
    ))
  })
})

describe('CLP school of record', () => {
  it('can be set during the meeting', async () => {
    await openStudent()
    fireEvent.click(screen.getByRole('button', { name: /Not iCreate Academy/ }))
    await waitFor(() => expect(api.patch).toHaveBeenCalledWith('/api/sis/households/h1',
      { enrolled_private_school: true, organization_id: 'org-1' }))
  })
})
