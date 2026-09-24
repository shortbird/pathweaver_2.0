/**
 * The family To do page (/family/forms): what the school is waiting on this
 * family for.
 *
 * Until 2026-09-16 a parent had two sidebar items, "Checklists" and
 * "Requests"; they merged into one Forms page. On 2026-09-23 iCreate dropped
 * requests and forms altogether: everything the school asks of anybody is a
 * task, and a family that needs something from the school sends it a
 * message. This file pins what is left: the family's open tasks from
 * /api/sis/tasks/mine, each one a TaskCard with its comment thread; no request
 * composer and no call to the retired /api/sis/parent/forms; a pointer to
 * Messages instead; ?task= highlighting the task a notification named; the
 * tasks hidden when the block is off; and the old path still landing here.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render as rtlRender, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { readFileSync } from 'fs'
import { join } from 'path'

const render = (ui, { route = '/family/forms' } = {}) => rtlRender(
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <MemoryRouter initialEntries={[route]}>{ui}</MemoryRouter>
  </QueryClientProvider>,
)

vi.mock('react-hot-toast', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
  default: { success: vi.fn(), error: vi.fn() },
}))

const { api } = vi.hoisted(() => ({
  api: { get: vi.fn(), patch: vi.fn(), post: vi.fn() },
}))
vi.mock('../services/api', () => ({ default: api }))

import FamilyFormsPage from './FamilyFormsPage'

const ORG = {
  organization_id: 'org-1', organization_name: 'iCreate',
  students: [{ student_id: 's1', name: 'Mack' }],
}
const TASK = {
  id: 't1', title: 'Student Behavior Agreement Form', status: 'todo',
  done_count: 0, total_count: 1, comment_count: 0,
  items: [{ key: 'agree', title: 'Read and agree', required: true, status: 'pending' }],
}
const DONE_TASK = {
  id: 't9', title: 'Emergency contacts', status: 'done', done_count: 1, total_count: 1,
  items: [{ key: 'contacts', title: 'Emergency contacts', required: true, status: 'complete' }],
}

const mockApi = ({ org = ORG, tasks = [], quests = [], training = [] } = {}) => {
  api.get.mockImplementation((url) => {
    if (url.includes('/parent/context')) return Promise.resolve({ data: { orgs: [org] } })
    if (url.includes('/api/sis/tasks/mine')) {
      const shown = url.includes('include_done=1') ? tasks : tasks.filter((t) => t.status !== 'done')
      return Promise.resolve({ data: { success: true, tasks: shown, counts: { open: shown.length } } })
    }
    if (url.includes('/comments')) return Promise.resolve({ data: { comments: [] } })
    if (url.includes('/parent/quests')) return Promise.resolve({ data: { quests } })
    if (url.includes('/parent/training')) return Promise.resolve({ data: { training } })
    return Promise.resolve({ data: {} })
  })
  api.post.mockResolvedValue({ data: { success: true } })
  api.patch.mockResolvedValue({ data: { success: true } })
}

const calledUrl = (fn, part) => fn.mock.calls.some(([url]) => String(url).includes(part))

beforeEach(() => vi.clearAllMocks())

describe('what the school needs from the family', () => {
  it('lists the family’s open tasks under To do, asked of the family audience in this org', async () => {
    mockApi({ tasks: [TASK] })
    render(<FamilyFormsPage />)
    expect(await screen.findByText('Student Behavior Agreement Form')).toBeInTheDocument()
    expect(api.get).toHaveBeenCalledWith('/api/sis/tasks/mine?audience=family&organization_id=org-1')
    // The page's title is the school shell's letterhead; the panel has none of its own.
    expect(screen.queryByRole('heading', { level: 1 })).not.toBeInTheDocument()
    const headings = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)
    expect(headings).toEqual(['To do'])
  })

  it('says so quietly when the school needs nothing', async () => {
    mockApi()
    render(<FamilyFormsPage />)
    expect(await screen.findByText('Nothing to do right now.')).toBeInTheDocument()
  })

  it('ticks a step through the task’s own route', async () => {
    mockApi({ tasks: [TASK] })
    render(<FamilyFormsPage />)
    fireEvent.click(await screen.findByRole('checkbox', { name: 'Done: Read and agree' }))
    await waitFor(() => expect(api.patch).toHaveBeenCalledWith(
      '/api/sis/tasks/t1/items/agree', { status: 'complete' }))
  })

  it('shows finished tasks only when asked', async () => {
    mockApi({ tasks: [TASK, DONE_TASK] })
    render(<FamilyFormsPage />)
    await screen.findByText('Student Behavior Agreement Form')
    expect(screen.queryByText('Finished')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('checkbox', { name: 'Show finished' }))
    expect(await screen.findByText('Finished')).toBeInTheDocument()
    expect(api.get).toHaveBeenCalledWith('/api/sis/tasks/mine?audience=family&organization_id=org-1&include_done=1')
    expect(screen.getAllByText('Emergency contacts').length).toBeGreaterThan(0)
  })

  it('highlights the task a notification opened (?task=)', async () => {
    mockApi({ tasks: [TASK, { ...TASK, id: 't2', title: 'Photo release' }] })
    render(<FamilyFormsPage />, { route: '/family/forms?task=t2' })
    await screen.findByText('Photo release')
    expect(document.getElementById('task-t2').className).toMatch(/ring-2/)
    expect(document.getElementById('task-t1').className).not.toMatch(/ring-2/)
  })
})

describe('talking to the office about a task', () => {
  it('opens the task’s comment thread and posts to it', async () => {
    mockApi({ tasks: [TASK] })
    api.post.mockResolvedValue({ data: { comment: { id: 'c1', author_name: 'Dana', body: 'Signed copy is in the bag.' } } })
    render(<FamilyFormsPage />)
    const card = (await screen.findByText('Student Behavior Agreement Form')).closest('article')
    fireEvent.click(within(card).getByRole('button', { name: 'Comments' }))
    await waitFor(() => expect(api.get).toHaveBeenCalledWith('/api/sis/tasks/t1/comments'))
    expect(await within(card).findByText('No comments yet.')).toBeInTheDocument()
    fireEvent.change(within(card).getByLabelText('Write a comment'), { target: { value: 'Signed copy is in the bag.' } })
    fireEvent.click(within(card).getByRole('button', { name: 'Send' }))
    await waitFor(() => expect(api.post).toHaveBeenCalledWith(
      '/api/sis/tasks/t1/comments', { body: 'Signed copy is in the bag.' }))
    expect(await within(card).findByText('Signed copy is in the bag.')).toBeInTheDocument()
  })
})

describe('no requests any more (iCreate, 2026-09-23)', () => {
  it('offers no request composer and never asks for the retired forms route', async () => {
    mockApi({ tasks: [TASK] })
    render(<FamilyFormsPage />)
    await screen.findByText('Student Behavior Agreement Form')
    expect(screen.queryByRole('button', { name: 'Send request' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'New request' })).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Your requests' })).not.toBeInTheDocument()
    expect(calledUrl(api.get, '/parent/forms')).toBe(false)
    expect(calledUrl(api.post, '/parent/forms')).toBe(false)
  })

  it('sends a family that needs something to Messages instead', async () => {
    mockApi()
    render(<FamilyFormsPage />)
    const link = await screen.findByRole('link', { name: 'Send them a message' })
    expect(link).toHaveAttribute('href', '/messages')
  })
})

describe('a school that does not run tasks', () => {
  it('hides the tasks when neither tasks nor onboarding is on, and never asks for them', async () => {
    mockApi({ org: { ...ORG, modules: ['training'] }, tasks: [TASK] })
    render(<FamilyFormsPage />)
    expect(await screen.findByText('Nothing to do right now.')).toBeInTheDocument()
    expect(screen.queryByText('Student Behavior Agreement Form')).not.toBeInTheDocument()
    expect(screen.queryByRole('checkbox', { name: 'Show finished' })).not.toBeInTheDocument()
    expect(calledUrl(api.get, '/api/sis/tasks/mine')).toBe(false)
  })

  it.each([['tasks'], ['onboarding']])('shows them when only %s is on', async (mod) => {
    mockApi({ org: { ...ORG, modules: [mod] }, tasks: [TASK] })
    render(<FamilyFormsPage />)
    expect(await screen.findByText('Student Behavior Agreement Form')).toBeInTheDocument()
  })
})

describe('the old Checklists path', () => {
  // Notifications sent before 2026-09-16 (onboarding, signatures, secure
  // documents: sis_onboarding_service, sis_tasks_service, secure_documents.py)
  // link to /family/portal, and the mobile app opens /family/* on the web. Read
  // the route table itself: a rendered redirect here would only test itself.
  it('still resolves, as a redirect to the To do page', () => {
    const app = readFileSync(join(__dirname, '..', 'App.jsx'), 'utf8')
    expect(app).toMatch(/<Route path="family\/portal" element=\{<Navigate to="\/family\/forms" replace \/>\} \/>/)
    expect(app).not.toMatch(/FamilyPortalPage/)
  })
})
