/**
 * The Forms page's own quests (the "To complete" half).
 *
 * iCreate, 2026-08-06: "back to school night with families will be a quest."
 *
 * These are the guardian's, on the guardian's account — the copy says "these are
 * yours to do" for the same reason the backend never touches a student record
 * here. A parent who reads it as their child's homework will not do it.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render as rtlRender, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

// The page reads the guardian context through react-query
// (hooks/api/useSchoolContext), so it needs a client; a fresh one per render
// keeps the context stub of one test out of the next.
const render = (ui) => rtlRender(
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <MemoryRouter>{ui}</MemoryRouter>
  </QueryClientProvider>,
)

vi.mock('react-hot-toast', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
  default: { success: vi.fn(), error: vi.fn() },
}))

const { confirmSpy } = vi.hoisted(() => ({ confirmSpy: vi.fn(async () => true) }))
vi.mock('../contexts/ConfirmContext', () => ({ useConfirm: () => confirmSpy }))

const { api } = vi.hoisted(() => ({
  api: { get: vi.fn(), patch: vi.fn(), post: vi.fn() },
}))
vi.mock('../services/api', () => ({ default: api }))

import FamilyFormsPage from './FamilyFormsPage'

const QUEST = {
  quest_id: 'q1', title: 'Back to school night', description: 'Come and meet us',
  category: 'Community', is_required: true,
  progress: { started: false, completed: false, done: 0, total: 0 },
}

const mockPortal = ({ quests = [QUEST], assignments = [] } = {}) => {
  api.get.mockImplementation((url) => {
    if (url.includes('/parent/context')) {
      return Promise.resolve({ data: { orgs: [{ organization_id: 'org-1', organization_name: 'iCreate' }] } })
    }
    if (url.includes('/parent/quests')) return Promise.resolve({ data: { quests } })
    if (url.includes('/parent/onboarding')) return Promise.resolve({ data: { assignments } })
    return Promise.resolve({ data: {} })
  })
}

beforeEach(() => vi.clearAllMocks())

describe('quests the school set for families', () => {
  it('lists them under To complete', async () => {
    mockPortal()
    render(<FamilyFormsPage />)
    expect(await screen.findByText('Back to school night')).toBeInTheDocument()
    expect(screen.getByText('Required')).toBeInTheDocument()
  })

  it('says the quest is the parent’s own to do', async () => {
    mockPortal()
    render(<FamilyFormsPage />)
    expect(await screen.findByText(/These are yours to do/i)).toBeInTheDocument()
  })

  it('links into the quest to start it', async () => {
    mockPortal()
    render(<FamilyFormsPage />)
    const link = await screen.findByRole('link', { name: 'Start this quest' })
    expect(link).toHaveAttribute('href', '/quests/q1')
  })

  it('says Continue once it is under way, with the task count', async () => {
    mockPortal({ quests: [{ ...QUEST, progress: { started: true, completed: false, done: 1, total: 3 } }] })
    render(<FamilyFormsPage />)
    expect(await screen.findByRole('link', { name: 'Continue' })).toBeInTheDocument()
    expect(screen.getByText('1 of 3 tasks')).toBeInTheDocument()
  })

  it('shows nothing at a school that has set none', async () => {
    mockPortal({ quests: [] })
    render(<FamilyFormsPage />)
    expect(await screen.findByText('Nothing to sign or complete right now.')).toBeInTheDocument()
    expect(screen.queryByText('Quests from your school')).not.toBeInTheDocument()
  })

  it('still shows the quests when there are no checklists', async () => {
    mockPortal({ assignments: [] })
    render(<FamilyFormsPage />)
    expect(await screen.findByText('Back to school night')).toBeInTheDocument()
    expect(screen.queryByText('Nothing to sign or complete right now.')).not.toBeInTheDocument()
  })

  it('names the school, not "your school"', async () => {
    mockPortal()
    render(<FamilyFormsPage />)
    expect(await screen.findByText('Quests from iCreate')).toBeInTheDocument()
  })
})

/**
 * Ending a school quest from the Forms page.
 *
 * iCreate's Exploration Quest was auto-assigned to every parent (80 of them,
 * none finished), and the row offered Start and Continue and nothing else --
 * so a parent who did not want it had it on this page for good (2026-09-16,
 * seen on Lynette Evans's account). The quest page's End button was no way
 * out either: the quest carries a 400 XP goal and POST /end refuses below it.
 * So this ends the parent's OWN copy (no student_id, whichever child the
 * family scope points at) with force -- leaving, not finishing for credit.
 */
describe('ending a quest the school set', () => {
  const started = { ...QUEST, progress: { started: true, completed: false, done: 1, total: 3 } }

  beforeEach(() => {
    confirmSpy.mockResolvedValue(true)
    api.post.mockResolvedValue({ data: { success: true } })
  })

  it('offers End quest on a quest that is under way', async () => {
    mockPortal({ quests: [started] })
    render(<FamilyFormsPage />)
    expect(await screen.findByRole('button', { name: 'End quest' })).toBeInTheDocument()
  })

  it('does not offer it on a quest never started -- there is nothing to end', async () => {
    mockPortal()
    render(<FamilyFormsPage />)
    await screen.findByText('Back to school night')
    expect(screen.queryByRole('button', { name: 'End quest' })).not.toBeInTheDocument()
  })

  it('asks first, says what is unfinished and what is kept, then ends the parent’s own copy', async () => {
    mockPortal({ quests: [started] })
    render(<FamilyFormsPage />)
    fireEvent.click(await screen.findByRole('button', { name: 'End quest' }))
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/api/quests/q1/end', { force: true }))
    expect(confirmSpy.mock.calls[0][0]).toMatch(/End "Back to school night"\? 2 tasks are still unfinished/)
    expect(confirmSpy.mock.calls[0][0]).toMatch(/XP are kept/)
  })

  it('does nothing when the parent backs out', async () => {
    confirmSpy.mockResolvedValue(false)
    mockPortal({ quests: [started] })
    render(<FamilyFormsPage />)
    fireEvent.click(await screen.findByRole('button', { name: 'End quest' }))
    await waitFor(() => expect(confirmSpy).toHaveBeenCalled())
    expect(api.post).not.toHaveBeenCalled()
  })

  it('re-reads the list afterwards, and a finished quest leaves To complete', async () => {
    let ended = false
    api.get.mockImplementation((url) => {
      if (url.includes('/parent/context')) {
        return Promise.resolve({ data: { orgs: [{ organization_id: 'org-1', organization_name: 'iCreate' }] } })
      }
      if (url.includes('/parent/quests')) {
        return Promise.resolve({ data: { quests: [ended
          ? { ...started, progress: { ...started.progress, completed: true } }
          : started] } })
      }
      if (url.includes('/parent/onboarding')) return Promise.resolve({ data: { assignments: [] } })
      return Promise.resolve({ data: {} })
    })
    api.post.mockImplementation(async () => { ended = true; return { data: { success: true } } })
    render(<FamilyFormsPage />)
    fireEvent.click(await screen.findByRole('button', { name: 'End quest' }))
    expect(await screen.findByText('Nothing to sign or complete right now.')).toBeInTheDocument()
    expect(screen.queryByText('Back to school night')).not.toBeInTheDocument()
  })
})
