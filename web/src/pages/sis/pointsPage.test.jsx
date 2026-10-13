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
      { id: 'e2', student_id: 's2', student_name: 'Ben Kid', amount: 3, reason: 'Fed the chickens',
        source: 'student', added_by_student: true, created_by_name: 'Ben Kid',
        created_at: '2026-10-08T16:00:00Z' },
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
    fireEvent.click((await screen.findAllByRole('button', { name: 'Undo' }))[0])
    await waitFor(() => expect(api.delete).toHaveBeenCalledTimes(1))
    expect(api.delete.mock.calls[0][0]).toContain('/api/sis/points/entries/e1')
  })

  it('marks points a student added for themselves, and they undo like any entry', async () => {
    // Ticket 910668d8, David Nilson: "where we Coaches can take them away if
    // upon inspection they shouldn't have been received."
    render(<PointsPage />)
    const row = (await screen.findByText('Fed the chickens')).closest('li')
    expect(row).toHaveTextContent('Added by student')
    expect(screen.getAllByText('Added by student')).toHaveLength(1)
    fireEvent.click(row.querySelector('button'))
    await waitFor(() => expect(api.delete).toHaveBeenCalledTimes(1))
    expect(api.delete.mock.calls[0][0]).toContain('/api/sis/points/entries/e2')
  })
})

/**
 * Points helpers (ticket 0f401a62, Apogee Cache Valley): "We don't want all
 * of them to have access to the point system but we do have a studio leader
 * each session that tracks points." An admin names helpers here; a helper's
 * entries say who gave them, so a coach can check and undo.
 */
describe('PointsPage points helpers', () => {
  const helperEntry = {
    id: 'e3', student_id: 's1', student_name: 'Ada Kid', amount: 5, reason: 'Daily job',
    source: 'staff', added_by_student: false, given_by_student: true, created_by_name: 'Hal Kid',
    created_at: '2026-10-13T16:00:00Z',
  }

  const serve = ({ helpers = [], canEdit = true, recent } = {}) => {
    api.get.mockImplementation((url) => {
      if (url.includes('/api/sis/points/helpers')) {
        return Promise.resolve({ data: { success: true, helpers, can_edit: canEdit } })
      }
      const b = board()
      if (recent) b.data.recent = recent
      return Promise.resolve(b)
    })
  }

  it('marks a helper entry as given by the helper, and it undoes like any entry', async () => {
    serve({ recent: [helperEntry] })
    render(<PointsPage />)
    const row = (await screen.findByText(/Given by Hal Kid/)).closest('li')
    expect(row).toHaveTextContent('Daily job')
    expect(row).not.toHaveTextContent('Added by student')
    fireEvent.click(row.querySelector('button'))
    await waitFor(() => expect(api.delete).toHaveBeenCalledTimes(1))
    expect(api.delete.mock.calls[0][0]).toContain('/api/sis/points/entries/e3')
  })

  it('shows who the helpers are', async () => {
    serve({ helpers: [{ student_id: 's2', name: 'Ben Kid' }] })
    render(<PointsPage />)
    expect(await screen.findByText('Points helpers: Ben Kid')).toBeInTheDocument()
  })

  it('an admin picks helpers from the students and saves them', async () => {
    serve({ helpers: [{ student_id: 's2', name: 'Ben Kid' }] })
    render(<PointsPage />)
    fireEvent.click(await screen.findByRole('button', { name: 'Points helpers' }))
    expect(screen.getByText(/They cannot take points/)).toBeInTheDocument()
    const dialog = screen.getByText('Save helpers').closest('div.bg-white')
    const ada = dialog.querySelector('input[aria-label="Select Ada Kid"]')
    const ben = dialog.querySelector('input[aria-label="Select Ben Kid"]')
    expect(ben).toBeChecked()
    fireEvent.click(ada)
    fireEvent.click(screen.getByRole('button', { name: 'Save helpers' }))
    await waitFor(() => expect(api.put).toHaveBeenCalledTimes(1))
    expect(api.put.mock.calls[0][0]).toContain('/api/sis/points/helpers')
    expect(api.put.mock.calls[0][1]).toEqual({ student_ids: ['s2', 's1'] })
  })

  it('a staff member who cannot edit the list gets no button', async () => {
    serve({ helpers: [{ student_id: 's2', name: 'Ben Kid' }], canEdit: false })
    render(<PointsPage />)
    expect(await screen.findByText('Points helpers: Ben Kid')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Points helpers' })).not.toBeInTheDocument()
  })
})
