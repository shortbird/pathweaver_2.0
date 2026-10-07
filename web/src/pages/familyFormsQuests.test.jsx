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
 * Leaving or finishing a school quest from the To do page.
 *
 * iCreate's Exploration Quest was auto-assigned to every parent (80 of them,
 * none finished), and the row offered Start and Continue and nothing else --
 * so a parent who did not want it had it on this page for good (2026-09-16,
 * seen on Lynette Evans's account). That got an "End quest" here, forced past
 * the 400 XP goal.
 *
 * Ticket e17134c6 (2026-10-07) replaced it with the quest page's two exits on
 * the parent's OWN copy (no student_id): Save for later, one question with two
 * answers ("I'm done with it" is the way out of an unwanted quest and hides
 * the row), and Mark done under the quest page's rule -- at the XP goal, or
 * with no goal after one finished task -- without force.
 */
describe('leaving or finishing a quest the school set', () => {
  const started = { ...QUEST, progress: { started: true, completed: false, done: 1, total: 3 }, xp_threshold: null, earned_xp: 50 }

  beforeEach(() => {
    confirmSpy.mockResolvedValue(true)
    api.post.mockResolvedValue({ data: { success: true } })
  })

  it('offers Save for later and Mark done on a quest under way, and no End quest', async () => {
    mockPortal({ quests: [started] })
    render(<FamilyFormsPage />)
    expect(await screen.findByRole('button', { name: 'Save for later' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Mark done' })).toBeEnabled()
    expect(screen.queryByRole('button', { name: 'End quest' })).not.toBeInTheDocument()
  })

  it('offers neither on a quest never started', async () => {
    mockPortal()
    render(<FamilyFormsPage />)
    await screen.findByText('Back to school night')
    expect(screen.queryByRole('button', { name: 'Save for later' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Mark done' })).not.toBeInTheDocument()
  })

  it("\"I'm done with it\" archives the parent's own copy with reason lost_interest", async () => {
    mockPortal({ quests: [started] })
    render(<FamilyFormsPage />)
    fireEvent.click(await screen.findByRole('button', { name: 'Save for later' }))
    expect(await screen.findByText('Will you come back to this quest?')).toBeInTheDocument()
    expect(screen.getByText('All work and XP are kept either way.')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /I'm done with it/ }))
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/api/quests/q1/archive',
      { reason: 'lost_interest', feedback: undefined }))
  })

  it("\"I'll come back to it\" archives without a reason; Cancel sends nothing", async () => {
    mockPortal({ quests: [started] })
    render(<FamilyFormsPage />)
    fireEvent.click(await screen.findByRole('button', { name: 'Save for later' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Cancel' }))
    expect(api.post).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Save for later' }))
    fireEvent.click(await screen.findByRole('button', { name: /I'll come back to it/ }))
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/api/quests/q1/archive',
      { reason: undefined, feedback: undefined }))
  })

  it('Mark done asks first, says what is unfinished and what is kept, then ends the own copy without force', async () => {
    mockPortal({ quests: [started] })
    render(<FamilyFormsPage />)
    fireEvent.click(await screen.findByRole('button', { name: 'Mark done' }))
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/api/quests/q1/end', {}))
    expect(confirmSpy.mock.calls[0][0]).toMatchObject({
      title: 'Mark "Back to school night" done?',
      body: 'All work and XP are kept, and the quest moves to your completed quests, where you can reopen it. 2 unfinished tasks will leave the dashboard.',
    })
  })

  it('Mark done is off with no finished task and no XP goal, and says why', async () => {
    mockPortal({ quests: [{ ...started, earned_xp: 0, progress: { ...started.progress, done: 0 } }] })
    render(<FamilyFormsPage />)
    expect(await screen.findByRole('button', { name: 'Mark done' })).toBeDisabled()
    expect(screen.getByText('Finish at least one task to mark this quest done.')).toBeInTheDocument()
  })

  it('Mark done is off below the XP goal, and says how much is left', async () => {
    mockPortal({ quests: [{ ...started, xp_threshold: 400, earned_xp: 50 }] })
    render(<FamilyFormsPage />)
    expect(await screen.findByRole('button', { name: 'Mark done' })).toBeDisabled()
    expect(screen.getByText('350 XP to go before you can mark this quest done.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Save for later' })).toBeEnabled()
  })

  it('does nothing when the parent backs out of Mark done', async () => {
    confirmSpy.mockResolvedValue(false)
    mockPortal({ quests: [started] })
    render(<FamilyFormsPage />)
    fireEvent.click(await screen.findByRole('button', { name: 'Mark done' }))
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
    fireEvent.click(await screen.findByRole('button', { name: 'Mark done' }))
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
