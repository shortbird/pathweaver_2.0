import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render as rtlRender, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

const render = (ui) => rtlRender(<MemoryRouter>{ui}</MemoryRouter>)

vi.mock('react-hot-toast', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
  default: { success: vi.fn(), error: vi.fn() },
}))

const { api } = vi.hoisted(() => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(() => Promise.resolve({ data: { goal: { status: 'draft' } } })),
    delete: vi.fn(),
  },
}))
vi.mock('../services/api', () => ({ default: api }))

import FamilyGoalsPage from './FamilyGoalsPage'

const CONFIG = {
  subjects: ['Math', 'Science'],
  school_year: '2026-2027',
  organization_name: 'Gryffin Learning Center',
}

const STUDENTS = [
  { id: 's1', name: 'Kid One', avatar_url: null, goal: null, config: CONFIG },
  { id: 's2', name: 'Kid Two', avatar_url: null,
    goal: { status: 'submitted', direction: 'College', direction_notes: '',
            subjects: [{ subject: 'Math', year_goal: 'Algebra II', long_term: 'STEM degree' }] },
    config: CONFIG },
]

beforeEach(() => {
  vi.clearAllMocks()
  api.get.mockResolvedValue({ data: { students: STUDENTS } })
  api.put.mockResolvedValue({ data: { goal: { status: 'draft' } } })
})

describe('FamilyGoalsPage', () => {
  it('renders child tabs, the direction card, and a card per subject', async () => {
    render(<FamilyGoalsPage />)
    expect(await screen.findByText('Goal Setting')).toBeInTheDocument()
    expect(screen.getByText('Kid One')).toBeInTheDocument()
    expect(screen.getByText('Kid Two')).toBeInTheDocument()
    expect(screen.getByText(/What direction is Kid heading\? \(college, trade school, career/)).toBeInTheDocument()
    expect(screen.getByText('Math')).toBeInTheDocument()
    expect(screen.getByText('Science')).toBeInTheDocument()
    expect(api.get).toHaveBeenCalledWith('/api/sis/goals/mine')
  })

  it('saves a draft with the entered direction and subject goals', async () => {
    render(<FamilyGoalsPage />)
    await screen.findByText('Goal Setting')
    fireEvent.change(screen.getByPlaceholderText('e.g. Trade school for welding'), {
      target: { value: 'Trade school' },
    })
    fireEvent.click(screen.getByText('Save draft'))
    await waitFor(() =>
      expect(api.put).toHaveBeenCalledWith('/api/sis/goals/students/s1', expect.objectContaining({
        direction: 'Trade school',
        submit: false,
        subjects: expect.arrayContaining([expect.objectContaining({ subject: 'Math' })]),
      })),
    )
  })

  it('submits for review after confirming the meeting dialog', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true)
    render(<FamilyGoalsPage />)
    await screen.findByText('Goal Setting')
    fireEvent.click(screen.getByText('Submit for review'))
    await waitFor(() =>
      expect(api.put).toHaveBeenCalledWith('/api/sis/goals/students/s1',
        expect.objectContaining({ submit: true })),
    )
    expect(confirmSpy).toHaveBeenCalledWith(expect.stringContaining('Gryffin Learning Center'))
    confirmSpy.mockRestore()
  })

  it('does not submit when the confirm dialog is declined', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false)
    render(<FamilyGoalsPage />)
    await screen.findByText('Goal Setting')
    fireEvent.click(screen.getByText('Submit for review'))
    expect(api.put).not.toHaveBeenCalled()
    confirmSpy.mockRestore()
  })

  it('shows the submitted banner for a child whose goals are in review', async () => {
    render(<FamilyGoalsPage />)
    await screen.findByText('Goal Setting')
    fireEvent.click(screen.getByText('Kid Two'))
    expect(await screen.findByText(/Submitted — you'll review these at your meeting with the school/)).toBeInTheDocument()
    // saved values hydrate the form
    expect(screen.getByDisplayValue('College')).toBeInTheDocument()
    expect(screen.getByDisplayValue('Algebra II')).toBeInTheDocument()
  })

  it('shows review notes on a reviewed goal', async () => {
    api.get.mockResolvedValue({ data: { students: [
      { id: 's1', name: 'Kid One', goal: { status: 'reviewed', direction: 'College', subjects: [],
        review_notes: 'Nice plan, see you in the spring' }, config: CONFIG },
    ] } })
    render(<FamilyGoalsPage />)
    expect(await screen.findByText('Reviewed by the school')).toBeInTheDocument()
    expect(screen.getByText('Nice plan, see you in the spring')).toBeInTheDocument()
  })

  it('shows a friendly empty state when no students are eligible', async () => {
    api.get.mockResolvedValue({ data: { students: [] } })
    render(<FamilyGoalsPage />)
    expect(await screen.findByText(/Goal setting isn't set up for your family yet/)).toBeInTheDocument()
  })
})
