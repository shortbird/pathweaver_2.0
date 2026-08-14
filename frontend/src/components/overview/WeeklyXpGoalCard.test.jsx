import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import WeeklyXpGoalCard from './WeeklyXpGoalCard'

vi.mock('../../services/api', () => ({
  default: { get: vi.fn(), put: vi.fn(), delete: vi.fn() }
}))
vi.mock('react-hot-toast', () => ({
  default: { success: vi.fn(), error: vi.fn() }
}))

import api from '../../services/api'

const goal = (overrides = {}) => ({
  enabled: true,
  week_start: '2026-08-10',
  week_end: '2026-08-16',
  xp_earned: 200,
  tasks_completed: 2,
  target_xp: 500,
  note: null,
  set_by_role: 'student',
  set_by_self: true,
  met: false,
  remaining_xp: 300,
  percent: 40,
  can_edit: true,
  ...overrides
})

const renderCard = (props = {}) =>
  render(<WeeklyXpGoalCard studentId="s1" studentFirstName="Ada" {...props} />)

describe('WeeklyXpGoalCard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders nothing for a school without the feature', async () => {
    api.get.mockResolvedValue({ data: { goal: { enabled: false } } })
    const { container } = renderCard()
    await waitFor(() => expect(api.get).toHaveBeenCalled())
    expect(container).toBeEmptyDOMElement()
  })

  it('renders nothing when the server refuses the caller', async () => {
    // A 403 hides the card rather than breaking the page it sits on.
    api.get.mockRejectedValue({ response: { status: 403 } })
    const { container } = renderCard()
    await waitFor(() => expect(api.get).toHaveBeenCalled())
    expect(container).toBeEmptyDOMElement()
  })

  it('shows progress toward the target', async () => {
    api.get.mockResolvedValue({ data: { goal: goal() } })
    renderCard({ viewerIsStudent: true })
    expect(await screen.findByText('Weekly XP Goal')).toBeInTheDocument()
    expect(screen.getByText(/200/)).toBeInTheDocument()
    expect(screen.getByText('40%')).toBeInTheDocument()
    expect(screen.getByText('300 XP to go this week.')).toBeInTheDocument()
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '40')
  })

  it('congratulates the student when the goal is met', async () => {
    api.get.mockResolvedValue({
      data: { goal: goal({ xp_earned: 600, met: true, remaining_xp: 0, percent: 100 }) }
    })
    renderCard({ viewerIsStudent: true })
    expect(await screen.findByText(/Goal met/)).toBeInTheDocument()
  })

  it('names the student for a parent or teacher viewing the page', async () => {
    api.get.mockResolvedValue({
      data: { goal: goal({ xp_earned: 600, met: true, remaining_xp: 0, percent: 100, set_by_self: false, set_by_role: 'advisor' }) }
    })
    renderCard({ viewerIsStudent: false })
    expect(await screen.findByText("Ada met this week's goal.")).toBeInTheDocument()
    expect(screen.getByText('Set by a teacher')).toBeInTheDocument()
  })

  it('hides the editor from a viewer the server did not authorize', async () => {
    api.get.mockResolvedValue({ data: { goal: goal({ can_edit: false }) } })
    renderCard()
    expect(await screen.findByText('Weekly XP Goal')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /change/i })).not.toBeInTheDocument()
  })

  it('saves a new target and shows what came back', async () => {
    const user = userEvent.setup()
    api.get.mockResolvedValue({ data: { goal: goal({ target_xp: null, percent: null, remaining_xp: null }) } })
    api.put.mockResolvedValue({ data: { goal: goal({ target_xp: 750, percent: 27, remaining_xp: 550 }) } })

    renderCard()
    await user.click(await screen.findByRole('button', { name: /set a goal/i }))
    await user.click(screen.getByRole('button', { name: '750' }))
    await user.click(screen.getByRole('button', { name: /save goal/i }))

    await waitFor(() => expect(api.put).toHaveBeenCalledWith(
      '/api/xp-goals/student/s1',
      { target_xp: 750, note: null }
    ))
    expect(await screen.findByText('27%')).toBeInTheDocument()
  })

  it('refuses an out-of-range target without calling the server', async () => {
    const user = userEvent.setup()
    api.get.mockResolvedValue({ data: { goal: goal() } })

    renderCard()
    await user.click(await screen.findByRole('button', { name: /change/i }))
    const input = screen.getByLabelText(/XP to earn each week/i)
    await user.clear(input)
    await user.type(input, '99999')
    await user.click(screen.getByRole('button', { name: /save goal/i }))

    expect(api.put).not.toHaveBeenCalled()
  })
})
