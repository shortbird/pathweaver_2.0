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

const STUDENT_PAYLOAD = {
  success: true,
  student: { student_id: 's1', name: 'Alice Ant', age: 10 },
  family: { household_id: 'h1', name: 'Ant Family', payment_intent: ['Self-Pay', 'Utah Fits All'] },
  clp_record: { finished: false, finished_at: null, notes: 'First draft', updated_at: null },
  learning_day: { choice: 'elementary_at_home' },
  siblings: [{ student_id: 's2', name: 'Bob Ant', age: 13 }],
  schedule: [
    { class_id: 'c1', name: 'Art', is_enrolled: true, on_waitlist: false, supply_fee: 35, meetings: [
      { day_of_week: 1, start_time: '09:00', end_time: '10:00' },
    ], primary_instructor: { name: 'Mr T' } },
    { class_id: 'c5', name: 'Clay', is_enrolled: true, on_waitlist: false, supply_fee: 12.5, meetings: [
      { day_of_week: 1, start_time: '10:30', end_time: '11:30' },
    ] },
  ],
  classes: [
    { class_id: 'c1', name: 'Art', is_enrolled: true, on_waitlist: false, capacity: 10,
      enrolled_count: 4, spots_left: 6, is_full: false, waitlist_count: 0, supply_fee: 35,
      meetings: [{ day_of_week: 1, start_time: '09:00', end_time: '10:00' }], primary_instructor: { name: 'Mr T' } },
    { class_id: 'c5', name: 'Clay', is_enrolled: true, on_waitlist: false, supply_fee: 12.5,
      meetings: [{ day_of_week: 1, start_time: '10:30', end_time: '11:30' }] },
    { class_id: 'c2', name: 'Band', is_enrolled: false, on_waitlist: false, capacity: 8,
      enrolled_count: 4, spots_left: 4, is_full: false, waitlist_count: 0,
      meetings: [{ day_of_week: 2, start_time: '11:00', end_time: '12:00' }] },
    { class_id: 'c3', name: 'Choir', is_enrolled: false, on_waitlist: false, capacity: 6,
      enrolled_count: 6, spots_left: 0, is_full: true, waitlist_count: 2,
      meetings: [{ day_of_week: 3, start_time: '13:00', end_time: '14:00' }] },
    { class_id: 'c4', name: 'Teen Lab', is_enrolled: false, on_waitlist: false, capacity: 8,
      enrolled_count: 1, spots_left: 7, is_full: false, waitlist_count: 0, min_age: 13,
      meetings: [{ day_of_week: 4, start_time: '09:00', end_time: '10:00' }] },
  ],
}

const { api } = vi.hoisted(() => {
  const apiData = (url) => {
    if (url.includes('/api/sis/clp/directory')) {
      return { data: { families: [
        { household_id: 'h1', name: 'Ant Family', student_count: 2, students: [
          { student_id: 's1', name: 'Alice Ant', grade_level: '3', age: 10, clp_finished: true },
          { student_id: 's2', name: 'Bob Ant', grade_level: '5', age: 13, clp_finished: false },
        ] },
      ], students: [] } }
    }
    if (url.includes('/api/sis/clp/students/')) return { data: STUDENT_PAYLOAD }
    return { data: {} }
  }
  return {
    api: {
      get: vi.fn((url) => Promise.resolve(apiData(url))),
      post: vi.fn(() => Promise.resolve({ data: { success: true } })),
      patch: vi.fn(() => Promise.resolve({ data: {} })),
      delete: vi.fn(() => Promise.resolve({ data: { success: true } })),
    },
  }
})
vi.mock('../../services/api', () => ({ default: api }))

import ClpPage from './ClpPage'

beforeEach(() => {
  authState = { user: { id: 'u1', role: 'org_admin' } }
  orgState = { organization: { id: 'org-1', name: 'Org' } }
  vi.clearAllMocks()
})

describe('ClpPage', () => {
  it('lists families and loads a student schedule + available classes', async () => {
    render(<ClpPage />)
    expect(await screen.findByText('Customized Learning Plan')).toBeInTheDocument()
    // Directory shows the family and its kids.
    expect(await screen.findByText('Ant Family · 2')).toBeInTheDocument()
    fireEvent.click(screen.getByText('Alice Ant'))

    // Student header + enrolled class in the schedule grid.
    expect(await screen.findByText('Weekly schedule')).toBeInTheDocument()
    expect(api.get).toHaveBeenCalledWith(expect.stringContaining('/api/sis/clp/students/s1'))
    // Enrolled class NOT in the available list; unenrolled ones are.
    expect(await screen.findByText('Band')).toBeInTheDocument()
    expect(screen.getByText('Choir')).toBeInTheDocument()
  })

  it('enrolls a student into an available class', async () => {
    render(<ClpPage />)
    fireEvent.click(await screen.findByText('Alice Ant'))
    await screen.findByText('Band')
    // Band has an "Enroll" button (open seats).
    fireEvent.click(screen.getAllByText('Enroll')[0])
    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith(
        '/api/sis/classes/c2/enrollments',
        expect.objectContaining({ student_user_id: 's1', organization_id: 'org-1' }),
      ),
    )
  })

  it('offers "Join waitlist" for a full class', async () => {
    render(<ClpPage />)
    fireEvent.click(await screen.findByText('Alice Ant'))
    await screen.findByText('Choir')
    fireEvent.click(screen.getByText('Join waitlist'))
    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith(
        '/api/sis/classes/c3/waitlist',
        expect.objectContaining({ student_user_id: 's1' }),
      ),
    )
  })

  it('shows ages, payment form, and per-day supply totals', async () => {
    render(<ClpPage />)
    fireEvent.click(await screen.findByText('Alice Ant'))
    await screen.findByText('Weekly schedule')
    // Age next to the student's name (header) and the sibling chip.
    expect(screen.getAllByText('· 10').length).toBeGreaterThan(0)
    // Family's registration "Form of Payment" answers.
    expect(screen.getByText('Form of payment:')).toBeInTheDocument()
    expect(screen.getByText('Self-Pay')).toBeInTheDocument()
    expect(screen.getByText('Utah Fits All')).toBeInTheDocument()
    // Monday column: Art $35 + Clay $12.50 = $47.50.
    expect(screen.getByText('Supplies:')).toBeInTheDocument()
    expect(screen.getByText('$47.50')).toBeInTheDocument()
  })

  it('filters available classes to the student\'s age with an All-ages override', async () => {
    render(<ClpPage />)
    fireEvent.click(await screen.findByText('Alice Ant'))
    await screen.findByText('Band')
    // Teen Lab (min_age 13) hidden for a 10-year-old by default.
    expect(screen.queryByText('Teen Lab')).not.toBeInTheDocument()
    expect(screen.getByText('for age 10')).toBeInTheDocument()
    fireEvent.click(screen.getByLabelText('All ages'))
    expect(await screen.findByText('Teen Lab')).toBeInTheDocument()
  })

  it('enters presentation mode hiding the student search', async () => {
    render(<ClpPage />)
    fireEvent.click(await screen.findByText('Alice Ant'))
    await screen.findByText('Weekly schedule')
    fireEvent.click(screen.getByText('Presentation mode'))
    expect(await screen.findByText('Exit presentation')).toBeInTheDocument()
    // The directory search is gone in presentation mode.
    expect(screen.queryByPlaceholderText('Search students or families…')).not.toBeInTheDocument()
  })

  // ── CLP finished flag + meeting notes + learning day (2026-07-21) ──────────
  it('shows the directory check only for students whose CLP is finished', async () => {
    render(<ClpPage />)
    const alice = (await screen.findByText('Alice Ant')).closest('button')
    const bob = screen.getByText('Bob Ant').closest('button')
    expect(alice.querySelector('[aria-label="CLP finished"]')).toBeTruthy()
    expect(bob.querySelector('[aria-label="CLP finished"]')).toBeFalsy()
  })

  it('marks the CLP finished from the student header', async () => {
    render(<ClpPage />)
    fireEvent.click(await screen.findByText('Alice Ant'))
    await screen.findByText('Weekly schedule')
    fireEvent.click(screen.getByRole('button', { name: 'Mark CLP finished' }))
    await waitFor(() => expect(api.patch).toHaveBeenCalledWith(
      expect.stringContaining('/api/sis/clp/students/s1/record'), { finished: true },
    ))
  })

  it('a finished CLP shows the badge with a reopen link', async () => {
    STUDENT_PAYLOAD.clp_record = { ...STUDENT_PAYLOAD.clp_record, finished: true }
    try {
      render(<ClpPage />)
      fireEvent.click(await screen.findByText('Alice Ant'))
      expect(await screen.findByText('CLP finished')).toBeInTheDocument()
      fireEvent.click(screen.getByRole('button', { name: 'Reopen' }))
      await waitFor(() => expect(api.patch).toHaveBeenCalledWith(
        expect.stringContaining('/api/sis/clp/students/s1/record'), { finished: false },
      ))
    } finally {
      STUDENT_PAYLOAD.clp_record = { ...STUDENT_PAYLOAD.clp_record, finished: false }
    }
  })

  it('saves meeting notes on blur', async () => {
    render(<ClpPage />)
    fireEvent.click(await screen.findByText('Alice Ant'))
    const box = await screen.findByPlaceholderText(/Notes from the CLP meeting/)
    expect(box).toHaveValue('First draft')
    fireEvent.change(box, { target: { value: 'Wants art electives' } })
    fireEvent.blur(box)
    await waitFor(() => expect(api.patch).toHaveBeenCalledWith(
      expect.stringContaining('/api/sis/clp/students/s1/record'), { notes: 'Wants art electives' },
    ))
  })

  it('hides meeting notes in presentation mode', async () => {
    render(<ClpPage />)
    fireEvent.click(await screen.findByText('Alice Ant'))
    await screen.findByPlaceholderText(/Notes from the CLP meeting/)
    fireEvent.click(screen.getByText('Presentation mode'))
    await screen.findByText('Exit presentation')
    expect(screen.queryByPlaceholderText(/Notes from the CLP meeting/)).not.toBeInTheDocument()
  })

  it('shows the learning-day choice on the student header', async () => {
    render(<ClpPage />)
    fireEvent.click(await screen.findByText('Alice Ant'))
    await screen.findByText('Weekly schedule')
    expect(screen.getByText('Learning day:')).toBeInTheDocument()
    expect(screen.getByText('Elementary At-Home Academic Learning Day')).toBeInTheDocument()
  })
})
