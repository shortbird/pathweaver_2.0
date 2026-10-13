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

/**
 * Points helpers (ticket 0f401a62): "we do have a studio leader each session
 * that tracks points." A student the admins named gets a Give points tab:
 * tick several students, tap a button, done.
 */
describe('FamilyPointsPage give points', () => {
  const helperBoard = {
    success: true,
    students: [
      { student_id: 's2', name: 'Ben Kid', balance: 4 },
      { student_id: 's3', name: 'Cy Kid', balance: 9 },
    ],
    buttons: [{ id: 'b1', label: 'Daily job', amount: 5 }],
    max_amount: 10,
    recent: [{ id: 'g1', student_id: 's2', student_name: 'Ben Kid', amount: 5, reason: 'Daily job',
      created_at: '2026-10-13T15:00:00Z', given_by_student: true }],
  }

  const serveHelper = (isHelper) => api.get.mockImplementation((url) => Promise.resolve(
    url === '/api/sis/points/helper'
      ? { data: helperBoard }
      : { data: { success: true, students: [student({ can_add: true, daily_cap: 20, added_today: 0, is_helper: isHelper })] } },
  ))

  it('a helper gives a quick button to several students at once', async () => {
    serveHelper(true)
    render(<FamilyPointsPage />)
    fireEvent.click(await screen.findByRole('tab', { name: 'Give points' }))
    expect(await screen.findByText('What you gave lately')).toBeInTheDocument()
    expect(screen.getByLabelText('Cy Kid balance')).toHaveTextContent('9')
    const daily = screen.getByRole('button', { name: /Daily job \+5/ })
    expect(daily).toBeDisabled()
    fireEvent.click(screen.getByLabelText('Select Ben Kid'))
    fireEvent.click(screen.getByLabelText('Select Cy Kid'))
    fireEvent.click(daily)
    await waitFor(() => expect(api.post).toHaveBeenCalledTimes(1))
    expect(api.post).toHaveBeenCalledWith('/api/sis/points/helper/entries',
      { student_ids: ['s2', 's3'], amount: 5, reason: 'Daily job' })
  })

  it('a custom amount needs a reason and stays under the limit', async () => {
    serveHelper(true)
    render(<FamilyPointsPage />)
    fireEvent.click(await screen.findByRole('tab', { name: 'Give points' }))
    fireEvent.click(await screen.findByLabelText('Select Ben Kid'))
    const give = screen.getByRole('button', { name: 'Give' })
    fireEvent.change(screen.getByLabelText('Points to give'), { target: { value: '11' } })
    fireEvent.change(screen.getAllByLabelText('What for').at(-1), { target: { value: 'Led cleanup' } })
    expect(give).toBeDisabled()
    expect(screen.getByText(/Up to 10 points at a time/)).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Points to give'), { target: { value: '8' } })
    fireEvent.click(give)
    await waitFor(() => expect(api.post).toHaveBeenCalledTimes(1))
    expect(api.post).toHaveBeenCalledWith('/api/sis/points/helper/entries',
      { student_ids: ['s2'], amount: 8, reason: 'Led cleanup' })
  })

  it('a student who is not a helper sees no tab and never asks for the helper screen', async () => {
    serveHelper(false)
    render(<FamilyPointsPage />)
    expect(await screen.findByText(/left today/)).toBeInTheDocument()
    expect(screen.queryByRole('tab', { name: 'Give points' })).not.toBeInTheDocument()
    expect(api.get).not.toHaveBeenCalledWith('/api/sis/points/helper')
  })

  it('an entry a helper gave says who gave it', async () => {
    serve([student({ can_add: false, entries: [{ id: 'e9', amount: 5, reason: 'Daily job',
      created_at: '2026-10-13T15:00:00Z', given_by_student: true, created_by_name: 'Hal Kid' }] })])
    render(<FamilyPointsPage />)
    expect(await screen.findByText(/given by Hal Kid/)).toBeInTheDocument()
  })
})
