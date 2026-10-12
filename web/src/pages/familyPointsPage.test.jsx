import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render as rtlRender, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import FamilyPointsPage from './FamilyPointsPage'

/**
 * Ticket 910668d8, David Nilson: "I would also like both the Adventurers and
 * us Coaches to be able to input Points." A student adds their own; a parent
 * cannot.
 */

const render = (ui) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return rtlRender(<QueryClientProvider client={client}>{ui}</QueryClientProvider>)
}

vi.mock('react-hot-toast', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
  default: { success: vi.fn(), error: vi.fn() },
}))

const { api } = vi.hoisted(() => ({
  api: { get: vi.fn(), post: vi.fn(() => Promise.resolve({ data: { success: true } })) },
}))
vi.mock('../services/api', () => ({ default: api }))

const student = (extra = {}) => ({
  student_id: 's1', name: 'Ada Kid', balance: 12, earned: 12, spent: 0,
  entries: [{ id: 'e1', amount: 3, reason: 'Fed the chickens', created_at: '2026-10-12T15:00:00Z',
    added_by_student: true }],
  ...extra,
})

const serve = (students) => api.get.mockResolvedValue({ data: { success: true, students } })

beforeEach(() => {
  vi.clearAllMocks()
  api.post.mockResolvedValue({ data: { success: true } })
})

describe('FamilyPointsPage', () => {
  it('a student sees the add form and adds points with a reason', async () => {
    serve([student({ can_add: true, daily_cap: 20, added_today: 3 })])
    render(<FamilyPointsPage />)
    expect(await screen.findByText(/17 left today/)).toBeInTheDocument()
    expect(screen.getByText(/added by you/)).toBeInTheDocument()
    const add = screen.getByRole('button', { name: 'Add' })
    expect(add).toBeDisabled()
    fireEvent.change(screen.getByLabelText('Points to add'), { target: { value: '5' } })
    fireEvent.change(screen.getByLabelText('What for'), { target: { value: 'Swept the floor' } })
    fireEvent.click(add)
    await waitFor(() => expect(api.post).toHaveBeenCalledTimes(1))
    expect(api.post).toHaveBeenCalledWith('/api/sis/points/mine', { amount: 5, reason: 'Swept the floor' })
  })

  it('an amount past what is left today cannot be sent', async () => {
    serve([student({ can_add: true, daily_cap: 20, added_today: 18 })])
    render(<FamilyPointsPage />)
    fireEvent.change(await screen.findByLabelText('Points to add'), { target: { value: '5' } })
    fireEvent.change(screen.getByLabelText('What for'), { target: { value: 'Job' } })
    expect(screen.getByRole('button', { name: 'Add' })).toBeDisabled()
  })

  it('a parent sees no add form', async () => {
    serve([student({ can_add: false })])
    render(<FamilyPointsPage />)
    expect(await screen.findByText('Fed the chickens')).toBeInTheDocument()
    expect(screen.queryByText('Add points')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Points to add')).not.toBeInTheDocument()
    expect(screen.getByText(/added by the student/)).toBeInTheDocument()
  })
})
