import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render as rtlRender, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import PointsPage, { signed } from './PointsPage'

const render = (ui) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return rtlRender(<QueryClientProvider client={client}><MemoryRouter>{ui}</MemoryRouter></QueryClientProvider>)
}

let authState = { user: { id: 'u1', role: 'org_admin' } }
let orgState = { organization: { id: 'org-1', name: 'Apogee Cache Valley' } }

vi.mock('../../contexts/AuthContext', () => ({ useAuth: () => authState }))
vi.mock('../../contexts/OrganizationContext', () => ({ useOrganization: () => orgState }))
vi.mock('react-hot-toast', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
  default: { success: vi.fn(), error: vi.fn() },
}))

const { api, board } = vi.hoisted(() => {
  const board = () => ({ data: {
    success: true,
    buttons: [{ label: 'Daily job', amount: 5 }, { id: 'b2', label: 'Park trip', amount: -20 }],
    students: [
      { student_id: 's1', name: 'Ada Kid', balance: 30, earned: 40, spent: 10 },
      { student_id: 's2', name: 'Ben Kid', balance: 4, earned: 4, spent: 0 },
    ],
    recent: [
      { id: 'e1', student_id: 's1', student_name: 'Ada Kid', amount: 5, reason: 'Daily job',
        source: 'staff', created_by_name: 'Mandie G', created_at: '2026-10-08T15:00:00Z' },
    ],
  } })
  return {
    board,
    api: {
      get: vi.fn(() => Promise.resolve(board())),
      post: vi.fn(() => Promise.resolve({ data: { success: true } })),
      put: vi.fn(() => Promise.resolve({ data: { success: true, buttons: [] } })),
      delete: vi.fn(() => Promise.resolve({ data: { success: true } })),
    },
  }
})
vi.mock('../../services/api', () => ({ default: api }))

beforeEach(() => {
  vi.clearAllMocks()
  api.get.mockImplementation(() => Promise.resolve(board()))
})

describe('signed', () => {
  it('puts a plus on a give and keeps the minus on a take', () => {
    expect(signed(5)).toBe('+5')
    expect(signed(-20)).toBe('-20')
  })
})

describe('PointsPage', () => {
  it('lists each student with the balance the server sent', async () => {
    render(<PointsPage />)
    expect(await screen.findByLabelText('Ada Kid balance')).toHaveTextContent('30')
    expect(screen.getByLabelText('Ben Kid balance')).toHaveTextContent('4')
    expect(api.get).toHaveBeenCalledWith(expect.stringContaining('/api/sis/points'))
  })

  it('gives every ticked student the quick button amount in one request', async () => {
    render(<PointsPage />)
    const daily = await screen.findByRole('button', { name: /Daily job \+5/ })
    expect(daily).toBeDisabled()
    fireEvent.click(screen.getByLabelText('Select all'))
    fireEvent.click(daily)
    await waitFor(() => expect(api.post).toHaveBeenCalledTimes(1))
    expect(api.post.mock.calls[0][0]).toContain('/api/sis/points/entries')
    expect(api.post.mock.calls[0][1]).toEqual({ student_ids: ['s1', 's2'], amount: 5, reason: 'Daily job' })
  })

  it('takes a custom amount as a negative entry with its reason', async () => {
    render(<PointsPage />)
    fireEvent.click(await screen.findByLabelText('Select Ada Kid'))
    fireEvent.change(screen.getByLabelText('Points'), { target: { value: '12' } })
    fireEvent.change(screen.getByLabelText('Reason'), { target: { value: 'Crochet kit' } })
    fireEvent.click(screen.getByRole('button', { name: 'Take' }))
    await waitFor(() => expect(api.post).toHaveBeenCalledTimes(1))
    expect(api.post.mock.calls[0][1]).toEqual({ student_ids: ['s1'], amount: -12, reason: 'Crochet kit' })
  })

  it('undoes a recent entry by deleting it', async () => {
    render(<PointsPage />)
    fireEvent.click(await screen.findByRole('button', { name: 'Undo' }))
    await waitFor(() => expect(api.delete).toHaveBeenCalledTimes(1))
    expect(api.delete.mock.calls[0][0]).toContain('/api/sis/points/entries/e1')
  })
})
