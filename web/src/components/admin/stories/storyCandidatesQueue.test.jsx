import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import StoryCandidatesQueue from './StoryCandidatesQueue'
import { storiesApi } from '../../../services/storiesApi'

/**
 * The story queue on /admin/stories: feed items bookmarked in the app,
 * each with the same draft-for-review button the grader has.
 */

const navigate = vi.fn()
vi.mock('react-router-dom', () => ({ useNavigate: () => navigate }))
vi.mock('react-hot-toast', () => ({ toast: Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn() }) }))
vi.mock('../../../services/storiesApi', () => ({
  storiesApi: { candidates: vi.fn(), dismissCandidate: vi.fn(), start: vi.fn() },
  errorDetails: (err) => err?.response?.data?.details || {},
}))

const finalizedTask = {
  id: 'cand-1', target_type: 'task_completed', target_id: 'comp-1', note: 'the drone video',
  created_at: '2026-09-15T00:00:00Z', flagged_by_name: 'Dr. Tanner',
  student: { id: 's1', display_name: 'Romney H.' },
  item: { title: 'Build a drone', quest_title: 'Flight', credited: true },
  sources: {
    credit_submission: { source_id: 'comp-1', eligible: true, reasons: [], existing_story: null },
    quest: { source_id: 'uq-1', can_start: true, complete: false, submitted_task_count: 2, credited_task_count: 1, task_count: 3, existing_story: null },
  },
}
// Credit is not a gate (2026-09-15): a task still under review can start a
// story; the row says the credit is pending. A confidential one cannot.
const draftTask = {
  ...finalizedTask, id: 'cand-2', target_id: 'comp-2', note: null,
  item: { title: 'Paint the wing', quest_title: 'Flight', credited: false },
  sources: {
    credit_submission: { source_id: 'comp-2', eligible: true, reasons: [], existing_story: null },
    quest: { source_id: 'uq-1', can_start: true, complete: false, submitted_task_count: 2, credited_task_count: 1, task_count: 3, existing_story: null },
  },
}
const confidentialTask = {
  ...finalizedTask, id: 'cand-4', target_id: 'comp-4', note: null,
  item: { title: 'A private letter', quest_title: 'Flight', credited: false },
  sources: {
    credit_submission: { source_id: 'comp-4', eligible: false, reasons: ['confidential'], existing_story: null },
    quest: { source_id: 'uq-9', can_start: false, complete: false, submitted_task_count: 0, credited_task_count: 0, task_count: 3, existing_story: null },
  },
}
const moment = {
  id: 'cand-3', target_type: 'learning_moment', target_id: 'evt-1', note: null, created_at: '2026-09-14T00:00:00Z',
  student: { id: 's1', display_name: 'Romney H.' },
  item: { title: 'First solo flight', description: 'It flew.' },
  sources: {},
}

function renderQueue() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={client}><StoryCandidatesQueue /></QueryClientProvider>)
}

describe('StoryCandidatesQueue', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    storiesApi.candidates.mockResolvedValue({ candidates: [finalizedTask, draftTask, moment] })
    storiesApi.start.mockResolvedValue({ story: { id: 'story-9' } })
    storiesApi.dismissCandidate.mockResolvedValue({ candidate: { id: 'cand-1', status: 'dismissed' } })
  })

  it('lists what was flagged, with the note and who flagged it', async () => {
    renderQueue()
    expect(await screen.findByText('3 waiting')).toBeInTheDocument()
    expect(screen.getByText('Build a drone')).toBeInTheDocument()
    expect(screen.getByText('“the drone video”')).toBeInTheDocument()
    expect(screen.getAllByText(/Flagged .* by Dr. Tanner/).length).toBe(2)
    expect(screen.getByText('First solo flight')).toBeInTheDocument()
    expect(screen.getByText('Learning moments are not a story source yet.')).toBeInTheDocument()
  })

  it('drafts a story for review from a finalized task and opens the editor', async () => {
    renderQueue()
    const buttons = await screen.findAllByRole('button', { name: 'Draft from this task' })
    await userEvent.click(buttons[0])
    await waitFor(() => expect(storiesApi.start).toHaveBeenCalledWith({
      sourceType: 'credit_submission', sourceId: 'comp-1', mode: 'review', candidateId: 'cand-1',
    }))
    expect(navigate).toHaveBeenCalledWith('/admin/stories/story-9')
  })

  it('drafts from a task still under review and says the credit is pending', async () => {
    renderQueue()
    const buttons = await screen.findAllByRole('button', { name: 'Draft from this task' })
    expect(buttons[1]).toBeEnabled()
    expect(screen.getByText('credit pending')).toBeInTheDocument()
    const whole = screen.getAllByRole('button', { name: 'Draft from the whole quest' })
    expect(whole[0]).toBeEnabled()
    expect(screen.getAllByText('(2/3 submitted, 1 credited)').length).toBe(2)
  })

  it('will not draft from a confidential task, nor from a quest with nothing submitted', async () => {
    storiesApi.candidates.mockResolvedValue({ candidates: [confidentialTask] })
    renderQueue()
    const button = await screen.findByRole('button', { name: 'Draft from this task' })
    expect(button).toBeDisabled()
    expect(screen.getByText('(marked confidential)')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Draft from the whole quest' })).toBeDisabled()
  })

  it('dismisses a bookmark', async () => {
    renderQueue()
    await userEvent.click(await screen.findByRole('button', { name: 'Dismiss First solo flight' }))
    await waitFor(() => expect(storiesApi.dismissCandidate).toHaveBeenCalledWith('cand-3'))
  })

  it('renders nothing when the queue is empty', async () => {
    storiesApi.candidates.mockResolvedValue({ candidates: [] })
    const { container } = renderQueue()
    await waitFor(() => expect(storiesApi.candidates).toHaveBeenCalled())
    expect(container).toBeEmptyDOMElement()
  })
})
