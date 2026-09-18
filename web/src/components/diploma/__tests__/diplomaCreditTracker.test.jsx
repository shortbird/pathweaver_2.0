/**
 * The Diploma Credit Tracker's Approved tab.
 *
 * Until 2026-09-18 the tracker counted approved credit in its header and
 * listed none of it: the tabs were Grow This and the two Awaiting states, so
 * the note a reviewer typed on Approve was written to the review round and
 * shown to nobody. The tab makes it readable; the preview cap keeps a
 * long-enrolled student's dashboard from becoming a hundred-row list.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import DiplomaCreditTracker from '../DiplomaCreditTracker'

vi.mock('../../../hooks/useStudentScope', () => ({
  useStudentScope: () => ({ params: {}, studentId: null, scopeId: undefined, isDelegated: false }),
}))
// Fetches its own history on expand; not what these tests are about.
vi.mock('../CreditIterationHistory', () => ({ default: () => null }))
vi.mock('../../../services/api', () => ({
  default: { get: vi.fn() },
}))
import api from '../../../services/api'

const request = (overrides) => ({
  completion_id: overrides.completion_id,
  task_id: `task-${overrides.completion_id}`,
  quest_id: 'q1',
  task_title: overrides.task_title || `Task ${overrides.completion_id}`,
  quest_title: 'Bridges',
  xp_value: 100,
  subjects: { science: 100 },
  revision_number: 1,
  credit_requested_at: '2026-09-10T10:00:00Z',
  latest_feedback: null,
  finalized_at: null,
  ...overrides,
})

const approved = (id, extra = {}) => request({
  completion_id: id, diploma_status: 'finalized',
  finalized_at: '2026-09-14T15:12:00Z', ...extra,
})

function renderTracker(requests) {
  api.get.mockResolvedValue({ data: { data: { credit_requests: requests } } })
  return render(<MemoryRouter><DiplomaCreditTracker /></MemoryRouter>)
}

beforeEach(() => {
  api.get.mockReset()
})

describe('DiplomaCreditTracker — Approved tab', () => {
  it('lists approved credit when nothing is waiting, and opens to the note', async () => {
    renderTracker([approved('a1', {
      task_title: 'Load test', latest_feedback: 'Clear method. The graph sold it.',
    })])
    const row = await screen.findByRole('button', { name: /Load test/ })
    expect(screen.getByText('All caught up!')).toBeInTheDocument()
    expect(screen.queryByText(/Complete tasks and request diploma credit/)).toBeNull()

    await userEvent.click(row)
    expect(screen.getByText('Clear method. The graph sold it.')).toBeInTheDocument()
    expect(screen.getByText(/Approved 9\/14\/2026|Approved 14\/09\/2026|Approved 2026/)).toBeInTheDocument()
  })

  it('shows no note box for an approval that came without one', async () => {
    renderTracker([approved('a1', { task_title: 'Load test' })])
    await userEvent.click(await screen.findByRole('button', { name: /Load test/ }))
    expect(screen.queryByText(/Teacher Feedback/)).toBeNull()
  })

  it('offers Approved beside Grow This, and Grow This wins the auto-select', async () => {
    renderTracker([
      request({ completion_id: 'g1', diploma_status: 'grow_this', task_title: 'Grow me',
                latest_feedback: 'Add the data table.' }),
      approved('a1', { task_title: 'Done one' }),
    ])
    const tabs = await screen.findByRole('tablist')
    expect(within(tabs).getByRole('tab', { name: 'Grow This (1)' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('button', { name: /Grow me/ })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Done one/ })).toBeNull()

    await userEvent.click(within(tabs).getByRole('tab', { name: 'Approved (1)' }))
    expect(screen.getByRole('button', { name: /Done one/ })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Grow me/ })).toBeNull()
  })

  it('keeps the tabs hidden when there is only one category', async () => {
    renderTracker([approved('a1'), approved('a2')])
    await screen.findByRole('button', { name: /Task a1/ })
    expect(screen.queryByRole('tablist')).toBeNull()
  })

  it('previews the newest approvals and shows the rest on request', async () => {
    const many = Array.from({ length: 10 }, (_, i) => approved(`a${i + 1}`))
    renderTracker(many)
    await screen.findByRole('button', { name: /Task a1/ })
    expect(screen.getAllByRole('button', { name: /^Task a/ })).toHaveLength(8)

    await userEvent.click(screen.getByRole('button', { name: 'Show all 10 approved' }))
    await waitFor(() =>
      expect(screen.getAllByRole('button', { name: /^Task a/ })).toHaveLength(10))
    expect(screen.queryByRole('button', { name: /Show all/ })).toBeNull()
  })
})
