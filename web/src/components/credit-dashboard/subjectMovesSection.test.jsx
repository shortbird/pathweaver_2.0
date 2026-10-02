/**
 * Families asking Optio to move a quest's credit to another subject
 * (2026-10-02). Approve moves it; Decline needs a note the family reads.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import api from '../../services/api'
import SubjectMovesSection from './SubjectMovesSection'

vi.mock('../../services/api', () => ({
  default: { get: vi.fn(), post: vi.fn() },
}))

vi.mock('react-hot-toast', () => ({
  toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }),
}))

const ITEM = {
  id: 'req-1',
  quest_id: 'q-archery',
  quest_title: 'Archery',
  student_id: 'kid-1',
  student_name: 'Ada Waechtler',
  requested_by_name: 'Kristine Waechtler',
  from_subject: 'electives',
  from_subject_name: 'Electives',
  to_subject: 'pe',
  to_subject_name: 'PE',
  xp: 250,
  reason: 'Archery is a sport',
  status: 'pending',
  created_at: '2026-10-02T15:00:00Z',
}

const renderSection = () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <SubjectMovesSection />
    </QueryClientProvider>
  )
}

describe('SubjectMovesSection', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    api.get.mockResolvedValue({ data: { data: { items: [ITEM] } } })
    api.post.mockResolvedValue({ data: { data: { request: { ...ITEM, status: 'approved' } } } })
  })

  it('lists who asked, the quest, the subjects, the XP and why', async () => {
    renderSection()
    const card = (await screen.findByText('Archery')).closest('li')
    expect(api.get).toHaveBeenCalledWith('/api/credit-dashboard/subject-moves', { params: { status: 'pending' } })
    expect(card).toHaveTextContent('Ada Waechtler, asked by Kristine Waechtler')
    expect(card).toHaveTextContent('250 XP from Electives to PE')
    expect(card).toHaveTextContent('Archery is a sport')
  })

  it('approves through the dashboard route', async () => {
    const user = userEvent.setup()
    renderSection()
    const card = (await screen.findByText('Archery')).closest('li')
    await user.click(within(card).getByRole('button', { name: 'Approve' }))
    await waitFor(() => expect(api.post).toHaveBeenCalledWith(
      '/api/credit-dashboard/subject-moves/req-1/approve', {}))
  })

  it('will not decline without a note, and sends the note', async () => {
    const user = userEvent.setup()
    renderSection()
    const card = (await screen.findByText('Archery')).closest('li')
    await user.click(within(card).getByRole('button', { name: 'Decline' }))
    const confirm = within(card).getByRole('button', { name: 'Decline' })
    expect(confirm).toBeDisabled()

    await user.type(within(card).getByLabelText(/Why not/), 'This was a club, not PE.')
    await user.click(confirm)
    await waitFor(() => expect(api.post).toHaveBeenCalledWith(
      '/api/credit-dashboard/subject-moves/req-1/decline', { note: 'This was a club, not PE.' }))
  })

  it('says so when nothing is waiting', async () => {
    api.get.mockResolvedValue({ data: { data: { items: [] } } })
    renderSection()
    expect(await screen.findByText('No subject moves waiting')).toBeInTheDocument()
  })
})
