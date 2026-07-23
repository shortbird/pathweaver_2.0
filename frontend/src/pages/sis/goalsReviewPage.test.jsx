import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render as rtlRender, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

const render = (ui) => rtlRender(<MemoryRouter>{ui}</MemoryRouter>)

let authState = { user: { id: 'u1', role: 'org_admin' } }
let orgState = { organization: { id: 'org-1', name: 'Gryffin Learning Center' } }

vi.mock('../../contexts/AuthContext', () => ({ useAuth: () => authState }))
vi.mock('../../contexts/OrganizationContext', () => ({ useOrganization: () => orgState }))
vi.mock('react-hot-toast', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
  default: { success: vi.fn(), error: vi.fn() },
}))

const { api, apiData } = vi.hoisted(() => {
  const apiData = (url) => {
    if (url.includes('/api/sis/goals')) {
      return { data: {
        goals: [
          { id: 'g1', status: 'submitted', student_name: 'Alice Kid', parent_name: 'Paula Parent',
            school_year: '2026-2027', direction: 'Trade school for welding', direction_notes: 'Loves metalwork',
            submitted_at: '2026-07-20T10:00:00',
            subjects: [{ subject: 'Math', year_goal: 'Finish pre-algebra', long_term: 'Shop math fluency' }] },
          { id: 'g2', status: 'reviewed', student_name: 'Bob Kid', parent_name: 'Paula Parent',
            school_year: '2026-2027', direction: 'College', subjects: [],
            reviewed_at: '2026-07-01T10:00:00', review_notes: 'Great meeting, solid plan' },
          { id: 'g3', status: 'draft', student_name: 'Cara Kid', parent_name: null,
            school_year: '2026-2027', direction: '', subjects: [] },
        ],
        config: { subjects: ['Math'], school_year: '2026-2027', school_years: ['2026-2027', '2025-2026'] },
      } }
    }
    return { data: {} }
  }
  return {
    apiData,
    api: {
      get: vi.fn((url) => Promise.resolve(apiData(url))),
      post: vi.fn(() => Promise.resolve({ data: { goal: { id: 'g1', status: 'reviewed' } } })),
      put: vi.fn(() => Promise.resolve({ data: {} })),
      delete: vi.fn(() => Promise.resolve({ data: {} })),
    },
  }
})
vi.mock('../../services/api', () => ({ default: api }))

import GoalsReviewPage from './GoalsReviewPage'

beforeEach(() => {
  authState = { user: { id: 'u1', role: 'org_admin' } }
  orgState = { organization: { id: 'org-1', name: 'Gryffin Learning Center' } }
  vi.clearAllMocks()
  api.get.mockImplementation((url) => Promise.resolve(apiData(url)))
  api.post.mockImplementation(() => Promise.resolve({ data: { goal: { id: 'g1', status: 'reviewed' } } }))
})

describe('GoalsReviewPage', () => {
  it('groups goal rows by status with counts, submitted first', async () => {
    render(<GoalsReviewPage />)
    expect(await screen.findByText('Alice Kid')).toBeInTheDocument()
    expect(screen.getByText('Submitted (1)')).toBeInTheDocument()
    expect(screen.getByText('Draft (1)')).toBeInTheDocument()
    expect(screen.getByText('Reviewed (1)')).toBeInTheDocument()
    expect(api.get).toHaveBeenCalledWith(expect.stringContaining('/api/sis/goals'))
    // submitted group renders above reviewed
    const headings = screen.getAllByText(/\(\d\)$/).map((el) => el.textContent)
    expect(headings.indexOf('Submitted (1)')).toBeLessThan(headings.indexOf('Reviewed (1)'))
  })

  it('opens the detail panel with direction, subjects, and parent info', async () => {
    render(<GoalsReviewPage />)
    fireEvent.click(await screen.findByText('Alice Kid'))
    expect(await screen.findByText(/Set by Paula Parent/)).toBeInTheDocument()
    expect(screen.getAllByText('Trade school for welding').length).toBeGreaterThan(0)
    expect(screen.getByText('Finish pre-algebra')).toBeInTheDocument()
    expect(screen.getByText('Shop math fluency')).toBeInTheDocument()
  })

  it('marks a submitted goal reviewed with notes', async () => {
    render(<GoalsReviewPage />)
    fireEvent.click(await screen.findByText('Alice Kid'))
    fireEvent.change(await screen.findByPlaceholderText('Notes from the goal review meeting'), {
      target: { value: 'Aligned on welding track' },
    })
    fireEvent.click(screen.getByText('Mark reviewed'))
    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith('/api/sis/goals/g1/review',
        expect.objectContaining({ review_notes: 'Aligned on welding track', organization_id: 'org-1' })),
    )
  })

  it('shows review info (no Mark reviewed button) for reviewed rows', async () => {
    render(<GoalsReviewPage />)
    fireEvent.click(await screen.findByText('Bob Kid'))
    expect(await screen.findByText('Great meeting, solid plan')).toBeInTheDocument()
    expect(screen.queryByText('Mark reviewed')).not.toBeInTheDocument()
  })

  it('filters by school year', async () => {
    render(<GoalsReviewPage />)
    await screen.findByText('Alice Kid')
    fireEvent.change(screen.getByLabelText('School year'), { target: { value: '2025-2026' } })
    await waitFor(() =>
      expect(api.get).toHaveBeenCalledWith(expect.stringContaining('school_year=2025-2026')),
    )
  })

  it('shows the empty state when the org has no goals yet', async () => {
    api.get.mockImplementation(() => Promise.resolve({ data: { goals: [], config: { school_years: [] } } }))
    render(<GoalsReviewPage />)
    expect(await screen.findByText(/No family goals yet/)).toBeInTheDocument()
  })
})
