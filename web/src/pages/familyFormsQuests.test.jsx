/**
 * The To do page's own quests (/family/forms, once the Forms page).
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

const mockPortal = ({ quests = [QUEST], tasks = [], training = [], modules } = {}) => {
  api.get.mockImplementation((url) => {
    if (url.includes('/parent/context')) {
      const org = { organization_id: 'org-1', organization_name: 'iCreate' }
      return Promise.resolve({ data: { orgs: [modules ? { ...org, modules } : org] } })
    }
    if (url.includes('/parent/quests')) return Promise.resolve({ data: { quests } })
    if (url.includes('/api/sis/tasks/mine')) return Promise.resolve({ data: { success: true, tasks, counts: { open: tasks.length } } })
    if (url.includes('/parent/training')) return Promise.resolve({ data: { training } })
    return Promise.resolve({ data: {} })
  })
}

beforeEach(() => vi.clearAllMocks())

describe('quests the school set for families', () => {
  it('lists them under To do', async () => {
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
    expect(await screen.findByText('Nothing to do right now.')).toBeInTheDocument()
    expect(screen.queryByText('Quests from your school')).not.toBeInTheDocument()
  })

  it('still shows the quests when there are no tasks', async () => {
    mockPortal({ tasks: [] })
    render(<FamilyFormsPage />)
    expect(await screen.findByText('Back to school night')).toBeInTheDocument()
    expect(screen.queryByText('Nothing to do right now.')).not.toBeInTheDocument()
  })

  it('names the school, not "your school"', async () => {
    mockPortal()
    render(<FamilyFormsPage />)
    expect(await screen.findByText('Quests from iCreate')).toBeInTheDocument()
  })
})

/**
 * Ending a school quest from the To do page.
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

  it('re-reads the list afterwards, and a finished quest leaves To do', async () => {
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
      if (url.includes('/api/sis/tasks/mine')) return Promise.resolve({ data: { success: true, tasks: [], counts: { open: 0 } } })
      return Promise.resolve({ data: {} })
    })
    api.post.mockImplementation(async () => { ended = true; return { data: { success: true } } })
    render(<FamilyFormsPage />)
    fireEvent.click(await screen.findByRole('button', { name: 'End quest' }))
    expect(await screen.findByText('Nothing to do right now.')).toBeInTheDocument()
    expect(screen.queryByText('Back to school night')).not.toBeInTheDocument()
  })
})

// Training the school set for families that is a video or a document rather
// than a quest. "It'd be nice to be able to upload the training from last
// friday without creating an entire quest" (iCreate, Molly, 2026-09-22,
// ae16c5da). There is nothing to break into tasks, so: open it, press Done.
describe('family training links', () => {
  const LINK = {
    id: 'l1', kind: 'link', title: 'Back to school night recording',
    url: 'https://loom.com/bts', description: 'Forty minutes, watch any time.',
    is_required: true, my_done: null,
  }

  beforeEach(() => {
    api.post.mockResolvedValue({ data: { training: { ...LINK, my_done: { done_at: 'now' } } } })
    api.delete = vi.fn().mockResolvedValue({ data: { training: { ...LINK, my_done: null } } })
  })

  it('lists one with a link straight to it', async () => {
    mockPortal({ quests: [], training: [LINK] })
    render(<FamilyFormsPage />)
    const link = await screen.findByRole('link', { name: 'Back to school night recording' })
    expect(link).toHaveAttribute('href', 'https://loom.com/bts')
  })

  it('marks it done for the caller', async () => {
    mockPortal({ quests: [], training: [LINK] })
    render(<FamilyFormsPage />)
    fireEvent.click(await screen.findByRole('button', { name: 'Mark done' }))
    // The empty object matters: without a body axios omits Content-Type and
    // the CSRF middleware refuses the request.
    await waitFor(() => expect(api.post).toHaveBeenCalledWith(
      '/api/sis/parent/training/l1/done?organization_id=org-1', {}))
    expect(await screen.findByRole('button', { name: /Done/ })).toBeInTheDocument()
  })

  it('can be undone', async () => {
    mockPortal({ quests: [], training: [{ ...LINK, my_done: { done_at: 'now' } }] })
    render(<FamilyFormsPage />)
    fireEvent.click(await screen.findByRole('button', { name: /Done/ }))
    await waitFor(() => expect(api.delete).toHaveBeenCalledWith(
      '/api/sis/parent/training/l1/done?organization_id=org-1'))
  })

  it('says Required only while it is still outstanding', async () => {
    mockPortal({ quests: [], training: [{ ...LINK, my_done: { done_at: 'now' } }] })
    render(<FamilyFormsPage />)
    await screen.findByRole('button', { name: /Done/ })
    expect(screen.queryByText('Required')).toBeNull()
  })

  // The route is @require_module('training'), not the tasks module's, so a
  // school running training without tasks still sees them.
  it('is asked for when the school runs training but no tasks', async () => {
    mockPortal({ quests: [], training: [LINK], modules: ['training'] })
    render(<FamilyFormsPage />)
    expect(await screen.findByText('Back to school night recording')).toBeInTheDocument()
    expect(api.get).not.toHaveBeenCalledWith(expect.stringContaining('/api/sis/tasks/mine'))
  })

  it('is not asked for when the school does not run training', async () => {
    mockPortal({ quests: [], training: [LINK], modules: ['onboarding'] })
    render(<FamilyFormsPage />)
    await waitFor(() => expect(api.get).toHaveBeenCalledWith(expect.stringContaining('/parent/quests')))
    expect(api.get).not.toHaveBeenCalledWith(expect.stringContaining('/parent/training'))
  })
})
