/**
 * The queue and the grader, working together.
 *
 * The page owns the list and the keyboard; the grader owns the decision. These
 * tests hold the seam: j opens the grader and walks it, a decision drops the
 * row and moves on, Escape comes back to the queue, and when the loaded page
 * runs dry with more on the server the next fetch opens its first row.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import api from '../services/api'
import CreditReviewDashboardPage from './CreditReviewDashboardPage'
import { ConfirmProvider } from '../contexts/ConfirmContext'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

vi.mock('../services/api', () => ({
  default: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() },
}))

vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({ effectiveRole: 'superadmin', user: { id: 'super-1' } }),
}))

vi.mock('react-hot-toast', () => ({
  toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }),
  default: { success: vi.fn(), error: vi.fn() },
}))

const row = (n) => ({
  completion_id: `c${n}`,
  student_id: `s${n}`,
  student_name: `Student ${n}`,
  task_title: `Task ${n}`,
  quest_title: 'Bridge',
  diploma_status: 'pending_review',
  xp_value: 100,
  evidence_block_count: 1,
  ai_status: 'not_run',
})

const detailFor = (id) => ({
  completion: { id, user_id: `s${id.slice(1)}`, diploma_status: 'pending_review',
                user_quest_task_id: `t${id}` },
  task: { id: `t${id}`, title: `Task ${id.slice(1)}`, xp_value: 100,
          success_criteria: ['Did it'], subject_xp_distribution: { science: 100 } },
  quest: { id: 'q0', title: 'Bridge' },
  student: { display_name: `Student ${id.slice(1)}` },
  evidence_blocks: [], review_rounds: [], suggested_subjects: { science: 100 },
  is_org_student: false,
  ai: { status: 'not_run' },
})

const itemsCalls = () =>
  api.get.mock.calls.filter(([url]) => url === '/api/credit-dashboard/items')

let pages
const mockApi = () => {
  api.get.mockImplementation((url) => {
    if (url === '/api/credit-dashboard/items') {
      const items = pages.shift() || []
      return Promise.resolve({ data: { data: { items, total: 3 } } })
    }
    if (url.startsWith('/api/credit-dashboard/items/')) {
      return Promise.resolve({ data: { data: detailFor(url.split('/').pop()) } })
    }
    if (url.startsWith('/api/credit/')) {
      return Promise.resolve({ data: { success: true, messages: [] } })
    }
    return Promise.resolve({ data: { data: {} } })
  })
  api.post.mockResolvedValue({ data: { data: { success: true } } })
}

const renderPage = () => render(
  <QueryClientProvider client={new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })}>
    <ConfirmProvider><CreditReviewDashboardPage /></ConfirmProvider>
  </QueryClientProvider>,
)

const grader = () => screen.queryByRole('region', { name: 'Credit grader' })
const heading = (n) => screen.findByRole('heading', { name: `Task ${n}` })

beforeEach(() => {
  vi.clearAllMocks()
  pages = [[row(0), row(1)]]
  mockApi()
})

describe('opening the grader', () => {
  it('is closed until a row is chosen', async () => {
    renderPage()
    await waitFor(() => expect(screen.getByText('Student 0')).toBeInTheDocument())
    expect(grader()).toBeNull()
  })

  it('opens from the Start grading button on the first row', async () => {
    renderPage()
    await waitFor(() => expect(screen.getByText('Student 0')).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: 'Start grading' }))
    await heading(0)
    expect(grader()).toBeInTheDocument()
    expect(screen.getByText('1 / 2')).toBeInTheDocument()
  })

  it('opens from j and walks with j and k', async () => {
    renderPage()
    await waitFor(() => expect(screen.getByText('Student 0')).toBeInTheDocument())
    fireEvent.keyDown(document.body, { key: 'j' })
    await heading(0)
    fireEvent.keyDown(document.body, { key: 'j' })
    await heading(1)
    expect(screen.getByText('2 / 2')).toBeInTheDocument()
    fireEvent.keyDown(document.body, { key: 'k' })
    await heading(0)
  })

  it('closes on Escape and on the Queue button', async () => {
    renderPage()
    await waitFor(() => expect(screen.getByText('Student 0')).toBeInTheDocument())
    fireEvent.keyDown(document.body, { key: 'j' })
    await heading(0)
    fireEvent.keyDown(document.body, { key: 'Escape' })
    await waitFor(() => expect(grader()).toBeNull())

    fireEvent.click(screen.getByText('Student 1'))
    await heading(1)
    fireEvent.click(screen.getByRole('button', { name: 'Back to queue' }))
    await waitFor(() => expect(grader()).toBeNull())
  })
})

describe('deciding from the grader', () => {
  it('a approves the open item and moves to the next', async () => {
    renderPage()
    await waitFor(() => expect(screen.getByText('Student 0')).toBeInTheDocument())
    fireEvent.keyDown(document.body, { key: 'j' })
    await heading(0)
    fireEvent.keyDown(document.body, { key: 'a' })
    await waitFor(() => expect(api.post).toHaveBeenCalledWith(
      '/api/credit-dashboard/items/c0/approve', expect.objectContaining({ subjects: { science: 100 } })))
    await heading(1)
    expect(screen.getByText('1 / 1')).toBeInTheDocument()
  })

  it('a does nothing with the grader closed', async () => {
    renderPage()
    await waitFor(() => expect(screen.getByText('Student 0')).toBeInTheDocument())
    fireEvent.keyDown(document.body, { key: 'a' })
    await new Promise(r => setTimeout(r, 20))
    expect(api.post).not.toHaveBeenCalled()
  })

  it('g with an empty note focuses the note rather than sending', async () => {
    renderPage()
    await waitFor(() => expect(screen.getByText('Student 0')).toBeInTheDocument())
    fireEvent.keyDown(document.body, { key: 'j' })
    await heading(0)
    fireEvent.keyDown(document.body, { key: 'g' })
    await waitFor(() => expect(document.activeElement).toBe(
      screen.getByPlaceholderText(/feedback/i)))
    expect(api.post).not.toHaveBeenCalled()
  })

  it('fetches the next page and keeps grading when the loaded rows run out', async () => {
    pages = [[row(0)], [row(2)]]
    renderPage()
    await waitFor(() => expect(screen.getByText('Student 0')).toBeInTheDocument())
    fireEvent.keyDown(document.body, { key: 'j' })
    await heading(0)
    fireEvent.click(screen.getByRole('button', { name: /^Approve at 100 XP/ }))
    await heading(2)
    expect(itemsCalls().length).toBe(2)
    expect(grader()).toBeInTheDocument()
  })

  it('returns to the queue when nothing is left', async () => {
    pages = [[row(0)]]
    api.get.mockImplementation((url) => {
      if (url === '/api/credit-dashboard/items') {
        return Promise.resolve({ data: { data: { items: pages.shift() || [], total: 1 } } })
      }
      if (url.startsWith('/api/credit-dashboard/items/')) {
        return Promise.resolve({ data: { data: detailFor(url.split('/').pop()) } })
      }
      return Promise.resolve({ data: { data: {} } })
    })
    renderPage()
    await waitFor(() => expect(screen.getByText('Student 0')).toBeInTheDocument())
    fireEvent.keyDown(document.body, { key: 'j' })
    await heading(0)
    fireEvent.click(screen.getByRole('button', { name: /^Approve at 100 XP/ }))
    await waitFor(() => expect(grader()).toBeNull())
  })
})
