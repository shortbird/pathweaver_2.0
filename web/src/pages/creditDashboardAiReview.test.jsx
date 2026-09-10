/**
 * The AI review, from the queue's side.
 *
 * Two things this has to hold. The filter and the badges are superadmin-only,
 * because the backend sends the fields to nobody else and an org admin looking
 * at an empty "AI recommends approve" list would read it as nothing being ready
 * rather than as data they cannot see. And the `x` shortcut still confirms --
 * it is a shortcut to the recommendation, not past the decision.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react'
import api from '../services/api'
import { toast } from 'react-hot-toast'
import CreditReviewDashboardPage from './CreditReviewDashboardPage'
import { ConfirmProvider } from '../contexts/ConfirmContext'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

vi.mock('../services/api', () => ({
  default: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() },
}))

vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({ effectiveRole: role, user: { id: 'super-1' } }),
}))

vi.mock('react-hot-toast', () => ({
  toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }),
  default: { success: vi.fn(), error: vi.fn() },
}))

let role = 'superadmin'

const REVIEW = {
  recommendation: 'approve',
  confidence: 0.91,
  summary: 'Looks complete.',
  criteria: [{ index: 1, verdict: 'met', evidence_refs: [], note: 'Shown.' }],
  xp: { requested: 200, recommended: 100, changed: true, rationale: 'One photo.' },
  feedback: { celebrate: 'You tested it properly.', grow_this: 'Add the numbers.' },
  concerns: [], flags: [], evidence: [], evidence_read: { items: 1, read: 1, skipped: 0 },
}

const ITEM = {
  completion_id: 'c0',
  student_id: 's0',
  student_name: 'Clare B',
  task_title: 'Load test',
  quest_title: 'Bridge',
  diploma_status: 'pending_review',
  xp_value: 200,
  evidence_block_count: 1,
  ai_status: 'complete',
  ai_recommendation: 'approve',
  ai_confidence: 0.91,
  ai_xp_recommended: 100,
}

const DETAIL = {
  completion: { id: 'c0', user_id: 's0', diploma_status: 'pending_review',
                user_quest_task_id: 't0' },
  task: { id: 't0', title: 'Load test', xp_value: 200,
          success_criteria: ['Tested it'], subject_xp_distribution: { science: 200 } },
  quest: { id: 'q0', title: 'Bridge' },
  student: { display_name: 'Clare B' },
  evidence_blocks: [], review_rounds: [], suggested_subjects: { science: 200 },
  is_org_student: false,
  ai: { status: 'complete', review: REVIEW },
}

const itemsCalls = () =>
  api.get.mock.calls.filter(([url]) => url === '/api/credit-dashboard/items')

const mockApi = ({ detail = DETAIL, items = [ITEM] } = {}) => {
  api.get.mockImplementation((url) => {
    if (url === '/api/credit-dashboard/items') {
      return Promise.resolve({ data: { data: { items, total: items.length } } })
    }
    if (url.startsWith('/api/credit-dashboard/items/')) {
      return Promise.resolve({ data: { data: detail } })
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

const openFirstItem = async () => {
  await waitFor(() => expect(screen.getByText('Clare B')).toBeInTheDocument())
  fireEvent.click(screen.getByText('Clare B'))
  await waitFor(() => expect(screen.getByText(/recommends approving/i)).toBeInTheDocument())
}

beforeEach(() => {
  role = 'superadmin'
  vi.clearAllMocks()
  mockApi()
})

describe('the AI badge in the queue', () => {
  it('shows the recommendation on each row', async () => {
    renderPage()
    await waitFor(() => expect(screen.getAllByText(/AI: Approve 91%/).length)
      .toBeGreaterThan(0))
  })

  it('shows nothing for an item the AI has not read', async () => {
    mockApi({ items: [{ ...ITEM, ai_status: 'not_run', ai_recommendation: null }] })
    renderPage()
    await waitFor(() => expect(screen.getByText('Clare B')).toBeInTheDocument())
    expect(screen.queryByText(/AI: Approve/)).toBeNull()
  })

  it('is hidden from an org admin entirely', async () => {
    role = 'org_admin'
    renderPage()
    await waitFor(() => expect(screen.getByText('Clare B')).toBeInTheDocument())
    expect(screen.queryByText(/AI: Approve/)).toBeNull()
    expect(screen.queryByLabelText('AI recommendation')).toBeNull()
  })
})

describe('the AI filter', () => {
  it('sends the filter and returns to page one', async () => {
    renderPage()
    await waitFor(() => expect(itemsCalls().length).toBeGreaterThan(0))
    fireEvent.change(screen.getByLabelText('AI recommendation'),
                     { target: { value: 'approve' } })
    await waitFor(() => expect(itemsCalls().at(-1)[1].params.ai).toBe('approve'))
    expect(itemsCalls().at(-1)[1].params.page).toBe(1)
  })

  it('sends nothing when the filter is cleared', async () => {
    renderPage()
    await waitFor(() => expect(itemsCalls().length).toBeGreaterThan(0))
    expect(itemsCalls().at(-1)[1].params.ai).toBeUndefined()
  })

  it('leaves the status filter reachable by name', async () => {
    // Two selects now share the sidebar, so the status one needs its own label.
    renderPage()
    await waitFor(() => expect(screen.getByLabelText('Status')).toBeInTheDocument())
  })
})

describe('re-running a review', () => {
  it('asks the server and shows the new state', async () => {
    renderPage()
    await openFirstItem()
    api.post.mockResolvedValueOnce({ data: { data: { ai: { status: 'queued' } } } })
    fireEvent.click(screen.getByRole('button', { name: 'Re-run' }))
    await waitFor(() => expect(api.post).toHaveBeenCalledWith(
      '/api/credit-dashboard/items/c0/ai-review', {}))
  })

  it('treats an already-running review as success, not an error', async () => {
    renderPage()
    await openFirstItem()
    api.post.mockRejectedValueOnce({ response: { status: 409 } })
    fireEvent.click(screen.getByRole('button', { name: 'Re-run' }))
    await waitFor(() => expect(screen.getByText(/Reading the evidence/i))
      .toBeInTheDocument())
    expect(toast.error).not.toHaveBeenCalled()
  })
})

describe('the x shortcut', () => {
  it('confirms before approving', async () => {
    renderPage()
    await openFirstItem()
    fireEvent.keyDown(document.body, { key: 'x' })
    const dialog = await screen.findByRole('dialog')
    expect(dialog).toHaveTextContent(/Approve at 100 XP/)

    fireEvent.click(within(dialog).getByRole('button', { name: 'Approve' }))
    await waitFor(() => {
      const call = api.post.mock.calls.find(([url]) => url.endsWith('/approve'))
      expect(call).toBeTruthy()
      expect(call[1].xp_value).toBe(100)
      expect(call[1].feedback).toBe('You tested it properly.')
    })
  })

  it('does nothing when no item is open', async () => {
    renderPage()
    await waitFor(() => expect(screen.getByText('Clare B')).toBeInTheDocument())
    fireEvent.keyDown(document.body, { key: 'x' })
    await new Promise(r => setTimeout(r, 20))
    expect(api.post).not.toHaveBeenCalled()
  })
})
