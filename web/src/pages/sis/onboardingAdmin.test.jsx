/**
 * The Assigned list, ordered by how often an admin does each thing.
 *
 * It used to read in exactly the reverse order: authoring templates (rare) sat
 * at the top and injected a full inline editor when opened, assigning (weekly)
 * came next, and tracking (daily) was last. Worse, the one thing the tab exists
 * to surface — a step somebody has finished that is now waiting on the office
 * to approve — was reachable only by opening every person's task in turn.
 * (Assigning is the Tasks page's own button; taskCenter.test covers it.
 * Authoring templates is the Templates tab since 2026-09-24.)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render as rtlRender, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
// Assigned reads its tasks through hooks/api (QF-03), so these need a
// QueryClient. Fresh client per render keeps one test's cache out of the next
// one's; retry:false makes a failed query fail rather than hang on backoff.
const render = (ui) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return rtlRender(<QueryClientProvider client={client}>{ui}</QueryClientProvider>)
}
import { MemoryRouter } from 'react-router-dom'

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'admin-1', role: 'org_managed', org_roles: ['org_admin'] } }),
}))
vi.mock('react-hot-toast', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
  default: { success: vi.fn(), error: vi.fn() },
}))
vi.mock('./useSisOrg', () => ({
  useSisOrg: () => ({ orgId: 'org-1', setOrgId: vi.fn(), orgs: [], isSuperadmin: false }),
  withOrg: (url, orgId) => `${url}${url.includes('?') ? '&' : '?'}organization_id=${orgId}`,
}))

const { api } = vi.hoisted(() => ({
  api: {
    get: vi.fn(), post: vi.fn(() => Promise.resolve({ data: {} })),
    patch: vi.fn(() => Promise.resolve({ data: {} })),
    put: vi.fn(() => Promise.resolve({ data: {} })),
    delete: vi.fn(() => Promise.resolve({ data: {} })),
  },
}))
vi.mock('../../services/api', () => ({ default: api }))

import AssignedWork from '../../components/sis/tasks/AssignedWork'
import { TaskTemplatesManager } from '../../components/sis/tasks/TaskTemplatesManager'

const SIG = '/api/sis/staff-admin/signature-requests'

const TEMPLATE = {
  id: 't1', name: 'Employee onboarding', audience: 'staff', role_type: 'employee',
  items: [{ key: 'handbook', title: 'Sign the handbook', needs_approval: true }],
}

// Sam has finished the background check and is waiting on the office; the
// handbook is done and needs nothing. One person's task, in the shape
// GET /api/sis/tasks/assigned returns it (sis_tasks_service.shape_task).
const SAM = {
  id: 'a1', user_id: 'sam', user_name: 'Sam Teacher', title: 'Employee onboarding',
  audience: 'staff', status: 'in_progress', native_status: 'in_progress',
  done_count: 2, total_count: 3, finished_at: null,
  items: [
    { key: 'handbook', title: 'Read the handbook', status: 'approved', needs_approval: false },
    { key: 'bgcheck', title: 'Background check', status: 'complete', needs_approval: true },
    { key: 'w4', title: 'Submit a W-4', status: 'pending', needs_approval: true },
  ],
}

const batchOf = (people) => ({
  key: 'b1', title: 'Employee onboarding', audiences: ['staff'], priority: null, action: 'do',
  due_date: null, assigned_by_name: 'Ada Admin', created_at: '2026-09-01T00:00:00Z',
  people, done: people.filter((p) => p.status === 'done').length, total: people.length,
  awaiting_review: people.flatMap((p) => p.items)
    .filter((i) => i.needs_approval && i.status === 'complete').length,
  outstanding: people.some((p) => p.status !== 'done'),
})

const mockData = ({ people = [SAM], templates = [TEMPLATE] } = {}) => {
  api.get.mockImplementation((url) => {
    if (url.startsWith('/api/sis/tasks/assigned')) return Promise.resolve({ data: { batches: [batchOf(people)] } })
    if (url.startsWith('/api/sis/tasks/schedules')) return Promise.resolve({ data: { schedules: [] } })
    if (url.includes('signature-requests')) return Promise.resolve({ data: { batches: [] } })
    if (url.includes('/onboarding/templates')) return Promise.resolve({ data: { templates } })
    if (url.includes('/onboarding/assignments')) return Promise.resolve({ data: { assignments: [] } })
    return Promise.resolve({ data: {} })
  })
}

const renderTab = (props = {}) => render(
  <MemoryRouter><AssignedWork orgId="org-1" sigEndpoint={SIG} {...props} /></MemoryRouter>)

beforeEach(() => {
  vi.clearAllMocks()
  mockData()
})

describe('what needs the admin', () => {
  it('lifts steps awaiting approval out of the collapsed rows', async () => {
    renderTab()
    const strip = (await screen.findByText(/Needs your review \(1\)/)).closest('div')
    // Finished and waiting on us.
    expect(within(strip).getByText('Background check')).toBeInTheDocument()
    expect(within(strip).getByText('Sam Teacher')).toBeInTheDocument()
    // Not finished, so not ours to act on yet.
    expect(within(strip).queryByText('Submit a W-4')).not.toBeInTheDocument()
  })

  it('approves straight from the review strip', async () => {
    renderTab()
    const strip = (await screen.findByText(/Needs your review/)).closest('div')
    fireEvent.click(within(strip).getByRole('button', { name: 'Approve' }))
    await waitFor(() => expect(api.patch).toHaveBeenCalled())
    const [url, body] = api.patch.mock.calls[0]
    expect(url).toContain('/api/sis/teacher/onboarding/a1/items/bgcheck')
    expect(body.status).toBe('approved')
  })

  it('says nothing at all when nothing is waiting', async () => {
    mockData({ people: [{ ...SAM, items: [SAM.items[0]] }] })
    renderTab()
    await screen.findAllByText('Sam Teacher')
    expect(screen.queryByText(/Needs your review/)).not.toBeInTheDocument()
  })

  it('reports the review count to the tab bar', async () => {
    const onCount = vi.fn()
    renderTab({ onCount })
    await waitFor(() => expect(onCount).toHaveBeenCalledWith(1))
  })
})

describe('where each job lives now', () => {
  it('keeps the rare job — authoring templates — off the daily list', async () => {
    renderTab()
    await screen.findAllByText('Sam Teacher')
    // Templates are their own tab of the Tasks page now.
    expect(screen.queryByText(/Task templates/)).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument()
  })

  it('keeps the template library closed until asked for', async () => {
    render(<MemoryRouter><TaskTemplatesManager orgId="org-1" /></MemoryRouter>)
    await screen.findByRole('button', { name: /Task templates/ })
    expect(screen.queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Task templates/ }))
    expect(await screen.findByRole('button', { name: 'Edit' })).toBeInTheDocument()
  })

  it('edits a template over the page rather than inside it', async () => {
    render(<MemoryRouter><TaskTemplatesManager orgId="org-1" embedded open /></MemoryRouter>)
    fireEvent.click(await screen.findByRole('button', { name: 'Edit' }))
    // A dialog, so the list underneath is not shoved off screen by a form with
    // one card per step.
    expect(await screen.findByRole('dialog', { name: /Task template/i })).toBeInTheDocument()
  })
})

describe('removing a task from somebody', () => {
  it('keeps Unassign out of the row you click to expand', async () => {
    renderTab()
    // The rows arrive with the assigned query, so wait for a row.
    await screen.findAllByText('Sam Teacher')
    // "Sam Teacher" names them in the review strip and the batch's table too;
    // their own card is the one wrapped in a <summary>.
    const summary = screen.getAllByText('Sam Teacher')
      .map((el) => el.closest('summary')).find(Boolean)
    expect(summary).toBeTruthy()
    // A destructive action a pixel from the expand target is a mis-click
    // waiting to happen; it lives in the body.
    expect(within(summary).queryByText(/Unassign/)).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^Unassign$/ })).toBeInTheDocument()
  })
})

describe('what they uploaded', () => {
  // Cassea uploaded her background check, the step read "complete", and the
  // office could not find the file anywhere (iCreate, 2026-08-31). The step row
  // shows what was attached and opens it through the admin door, which also
  // knows about family buckets.
  it('opens what they uploaded through the admin doc-url', async () => {
    mockData({
      people: [{
        ...SAM, audience: 'staff',
        items: [{
          key: 'bgcheck', title: 'Background check', status: 'complete', needs_approval: false,
          documents: [{ path: 'org-1/sam/bg.pdf', filename: 'BackCkSam.pdf' }],
        }],
      }],
    })
    const base = api.get.getMockImplementation()
    api.get.mockImplementation((url) => (url.includes('/staff-admin/onboarding/doc-url')
      ? Promise.resolve({ data: { url: 'https://signed.example/bg.pdf' } })
      : base(url)))
    const open = vi.spyOn(window, 'open').mockImplementation(() => null)

    renderTab()
    fireEvent.click(await screen.findByRole('button', { name: 'BackCkSam.pdf' }))

    await waitFor(() => expect(open).toHaveBeenCalledWith('https://signed.example/bg.pdf', '_blank', 'noopener'))
    const call = api.get.mock.calls.map(([u]) => u).find((u) => u.includes('doc-url'))
    expect(call).toContain(`path=${encodeURIComponent('org-1/sam/bg.pdf')}`)
    expect(call).toContain('audience=staff')
    open.mockRestore()
  })
})
