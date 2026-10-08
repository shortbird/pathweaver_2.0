import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render as rtlRender, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import GoalsPage from './GoalsPage'
import { isPathHidden } from './sisModules'

/**
 * Goals is one page since 2026-10-08 (docs/sis/SIS_SIMPLIFICATION.md,
 * decision 3): This week and Year goals follow weekly_goals, Family goals
 * follows goals, and a tab whose module is off is not there.
 */

const render = (ui, entry = '/goals') => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return rtlRender(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[entry]}>{ui}</MemoryRouter>
    </QueryClientProvider>,
  )
}

const org = (modules) => ({ id: 'org-1', name: 'Apogee', feature_flags: { sis_enabled: true, modules } })
let orgState = { organization: org({ weekly_goals: true, goals: true }) }

vi.mock('../../contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'u1', role: 'org_admin' } }) }))
vi.mock('../../contexts/OrganizationContext', () => ({ useOrganization: () => orgState }))
vi.mock('react-hot-toast', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
  default: { success: vi.fn(), error: vi.fn() },
}))
vi.mock('./WeeklyGoalsPage', () => ({ default: () => <div>weekly board</div> }))
vi.mock('./GoalsReviewPage', () => ({ default: () => <div>family goals</div> }))

const { api } = vi.hoisted(() => ({
  api: {
    get: vi.fn(() => Promise.resolve({ data: {
      subjects: ['Reading', 'Math'],
      students: [{ student_id: 's1', name: 'Ada Kid', year_goals: { Reading: 'Read 20 books' } }],
    } })),
    put: vi.fn(() => Promise.resolve({ data: { success: true } })),
  },
}))
vi.mock('../../services/api', () => ({ default: api }))

beforeEach(() => {
  vi.clearAllMocks()
  orgState = { organization: org({ weekly_goals: true, goals: true }) }
})

describe('GoalsPage', () => {
  it('opens on this week, with year goals and family goals beside it', () => {
    render(<GoalsPage />)
    expect(screen.getByText('weekly board')).toBeInTheDocument()
    for (const name of ['This week', 'Year goals', 'Family goals']) {
      expect(screen.getByRole('tab', { name })).toBeInTheDocument()
    }
  })

  it('a school without the parents goal setting has no Family goals tab', () => {
    orgState = { organization: org({ weekly_goals: true }) }
    render(<GoalsPage />)
    expect(screen.queryByRole('tab', { name: 'Family goals' })).not.toBeInTheDocument()
  })

  it('a school with only the parents goal setting sees just those, without tabs', () => {
    orgState = { organization: org({ goals: true }) }
    render(<GoalsPage />)
    expect(screen.getByText('family goals')).toBeInTheDocument()
    expect(screen.queryByRole('tab')).not.toBeInTheDocument()
  })

  it('saves a student year goals on the weekly goals door', async () => {
    render(<GoalsPage />, '/goals?tab=year')
    fireEvent.click(await screen.findByText('Ada Kid'))
    fireEvent.change(screen.getByLabelText('Math'), { target: { value: 'Finish fractions' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save year goals' }))
    await waitFor(() => expect(api.put).toHaveBeenCalledTimes(1))
    expect(api.put.mock.calls[0][0]).toContain('/api/sis/weekly-goals/students/s1/year')
    expect(api.put.mock.calls[0][1]).toEqual({ subjects: [
      { subject: 'Reading', year_goal: 'Read 20 books' },
      { subject: 'Math', year_goal: 'Finish fractions' },
    ] })
  })
})

describe('the Goals nav item', () => {
  it('shows while either kind of goal is on, and hides when both are off', () => {
    expect(isPathHidden('/goals', org({ weekly_goals: true }))).toBe(false)
    expect(isPathHidden('/goals', org({ goals: true }))).toBe(false)
    expect(isPathHidden('/goals', org({}))).toBe(true)
  })
})
