import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom'

/**
 * My tasks — the inbox, the first tab of the one Tasks page.
 *
 * The page's job is to be the one place a person looks, so what these tests
 * hold down is that things are actually finishable here: a document sent for
 * signature is signed in place, a policy is acknowledged in one click, and a
 * task the office made from a message links to the thread it came from, where
 * the answer is written. A teacher (not an admin) is the person here: they see
 * My tasks and none of the office's tabs. My documents moved to the Library
 * on 2026-09-24.
 */

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'kate', role: 'org_managed', org_roles: ['advisor'] } }),
}))
vi.mock('./teacherPreview', () => ({
  getPreviewTeacher: () => null,
  withPreview: (p) => p,
  setPreviewTeacher: vi.fn(),
  clearPreviewTeacher: vi.fn(),
}))

vi.mock('react-hot-toast', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
  default: { success: vi.fn(), error: vi.fn() },
}))
vi.mock('./SisOrgPicker', () => ({ default: () => null }))
vi.mock('./useSisOrg', () => ({
  useSisOrg: () => ({ orgId: 'org-1', setOrgId: vi.fn(), orgs: [], isSuperadmin: false, activeOrg: null }),
  withOrg: (url, orgId) => `${url}${url.includes('?') ? '&' : '?'}organization_id=${orgId}`,
}))
vi.mock('../../components/sis/BackToDashboard', () => ({ default: () => null }))

const { api } = vi.hoisted(() => ({
  api: {
    get: vi.fn(),
    post: vi.fn(() => Promise.resolve({ data: {} })),
    patch: vi.fn(() => Promise.resolve({ data: {} })),
  },
}))
vi.mock('../../services/api', () => ({ default: api }))

import TasksPage from './TasksPage'

// Tasks as GET /api/sis/my-tasks shapes them (sis_tasks_service.shape_task).
const SIGN_TASK = {
  id: 't-sign', type: 'task', title: 'Employee handbook', status: 'todo', native_status: 'pending',
  due_date: null, priority: null, action: 'do', created_at: '2026-08-14T00:00:00Z',
  done_count: 0, total_count: 1,
  items: [{ key: 'sign', title: 'Sign the employee handbook', status: 'pending', required: true,
    needs_signature: true, sign_docs: [{ id: 'doc-1', title: 'Employee handbook.pdf' }] }],
}
// A family wrote in; the office turned the message into a task for Kate.
const REPLY_TASK = {
  id: 't-reply', type: 'task', title: 'Printer in Room 3', status: 'todo', native_status: 'pending',
  priority: 'high', action: 'reply', due_date: null, created_at: '2026-08-10T00:00:00Z',
  thread_link: '/inbox?tab=school&conversation=c1', done_count: 0, total_count: 1,
  items: [{ key: 'reply', title: 'Printer in Room 3', status: 'pending', required: true }],
}
const ACK_TASK = {
  id: 'ack:r1', type: 'ack', title: 'Acknowledge: Safeguarding policy',
  context: 'Staff resources', status: 'todo', native_status: 'pending',
  resource_id: 'r1', link: '/resources?highlight=r1',
}
const UPLOAD_TASK = {
  id: 't-cert', type: 'task', title: 'Upload your first-aid certificate', status: 'todo',
  native_status: 'pending', action: 'do', done_count: 0, total_count: 1,
  items: [{ key: 'cert', title: 'Upload your first-aid certificate', status: 'pending',
    required: true, needs_document: true }],
}
const DONE_TASK = {
  id: 't-done', type: 'task', title: 'Turn in your roster', status: 'done', native_status: 'complete',
  action: 'do', done_count: 1, total_count: 1,
  items: [{ key: 'roster', title: 'Turn in your roster', status: 'complete', required: true }],
}

const respond = (tasks, counts = {}) => {
  api.get.mockImplementation((url) => {
    if (url.startsWith('/api/sis/my-tasks')) {
      const withDone = url.includes('include_done=1')
      const shown = withDone ? tasks : tasks.filter((t) => t.status !== 'done')
      return Promise.resolve({ data: {
        success: true, tasks: shown,
        counts: { open: tasks.filter((t) => t.status !== 'done').length, overdue: 0, ...counts },
        signature_statement: 'I am typing my own name below, and I intend it to count as my official signature.',
      } })
    }
    return Promise.resolve({ data: {} })
  })
}

const Where = () => {
  const loc = useLocation()
  return <div data-testid="where">{loc.pathname}{loc.search}</div>
}

const renderPage = (path = '/tasks') => render(
  <MemoryRouter initialEntries={[path]}>
    <Routes>
      <Route path="/tasks" element={<TasksPage />} />
      <Route path="/library" element={<Where />} />
    </Routes>
  </MemoryRouter>)

beforeEach(() => {
  vi.clearAllMocks()
  api.post.mockResolvedValue({ data: {} })
  api.patch.mockResolvedValue({ data: {} })
})

describe('the inbox gathers every kind of task', () => {
  it('lists every kind of task together', async () => {
    respond([SIGN_TASK, REPLY_TASK, ACK_TASK, UPLOAD_TASK])
    renderPage()
    expect(await screen.findByRole('heading', { name: 'Employee handbook' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Printer in Room 3' })).toBeInTheDocument()
    expect(screen.getByText('Acknowledge: Safeguarding policy')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Upload your first-aid certificate' })).toBeInTheDocument()
  })

  it('shows how many are open', async () => {
    respond([SIGN_TASK, REPLY_TASK], { open: 2 })
    renderPage()
    expect(await screen.findByText('2')).toBeInTheDocument()
  })

  it('says so plainly when nothing is waiting', async () => {
    respond([])
    renderPage()
    expect(await screen.findByText(/Nothing is waiting on you/i)).toBeInTheDocument()
  })

  it('asks for finished tasks only when they are wanted', async () => {
    respond([])
    renderPage()
    await waitFor(() => expect(api.get).toHaveBeenCalled())
    expect(api.get.mock.calls[0][0]).not.toContain('include_done')
    fireEvent.click(screen.getByLabelText(/Show finished/i))
    await waitFor(() => expect(
      api.get.mock.calls.some(([u]) => u.includes('include_done=1'))).toBe(true))
  })

  it('does a step in place: ticking it completes it', async () => {
    respond([REPLY_TASK])
    renderPage()
    fireEvent.click(await screen.findByRole('checkbox', { name: 'Done: Printer in Room 3' }))
    await waitFor(() => expect(api.patch).toHaveBeenCalledWith(
      '/api/sis/tasks/t-reply/items/reply', { status: 'complete' }))
  })
})

describe('signing a document without leaving the page', () => {
  it('offers the document to read before signing', async () => {
    respond([SIGN_TASK])
    renderPage()
    expect(await screen.findByText('Employee handbook.pdf')).toBeInTheDocument()
  })

  it('opens the document through the task', async () => {
    respond([SIGN_TASK])
    renderPage()
    fireEvent.click(await screen.findByRole('button', { name: 'Employee handbook.pdf' }))
    await waitFor(() => expect(api.get).toHaveBeenCalledWith(
      '/api/sis/tasks/t-sign/sign-documents/doc-1/url'))
  })

  it('signs the step of the task', async () => {
    respond([SIGN_TASK])
    renderPage()
    fireEvent.change(await screen.findByPlaceholderText('Type your full name to sign'),
      { target: { value: 'Kate Myers' } })
    fireEvent.click(screen.getByRole('checkbox', { name: /official signature/i }))
    fireEvent.click(screen.getByRole('button', { name: 'Sign' }))
    await waitFor(() => expect(api.patch).toHaveBeenCalledWith(
      '/api/sis/tasks/t-sign/items/sign',
      expect.objectContaining({ signature_name: 'Kate Myers', signature_agreed: true })))
  })

  it('has no tick box for a signature step: signing is how it is done', async () => {
    respond([SIGN_TASK])
    renderPage()
    await screen.findByPlaceholderText('Type your full name to sign')
    expect(screen.queryByRole('checkbox', { name: /^Done:/ })).not.toBeInTheDocument()
  })

  it('withholds the sign box until the office has uploaded the document', async () => {
    respond([{ ...SIGN_TASK, items: [{ ...SIGN_TASK.items[0], sign_docs: [] }] }])
    renderPage()
    expect(await screen.findByText(/document is not here yet/i)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Sign' })).not.toBeInTheDocument()
  })
})

describe('acknowledging a policy', () => {
  it('records the acknowledgment from the inbox', async () => {
    respond([ACK_TASK])
    renderPage()
    fireEvent.click(await screen.findByRole('button', { name: /I have read this/i }))
    await waitFor(() => expect(api.post).toHaveBeenCalledWith(
      '/api/sis/my-tasks/acknowledge',
      expect.objectContaining({ resource_id: 'r1' })))
  })
})

describe('a task made from a message', () => {
  it('links to the thread it came from, where the answer is written', async () => {
    respond([REPLY_TASK])
    renderPage()
    const link = await screen.findByRole('link', { name: /Open the thread/i })
    expect(link).toHaveAttribute('href', '/inbox?tab=school&conversation=c1')
  })
})

describe('overdue work is unmissable', () => {
  it('marks an overdue task', async () => {
    respond([{ ...SIGN_TASK, due_date: '2026-08-01', overdue: true }],
      { overdue: 1 })
    renderPage()
    const expected = new Date('2026-08-01T12:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
    expect(await screen.findByText(`Overdue, due ${expected}`)).toBeInTheDocument()
    expect(screen.getByText('1 overdue')).toBeInTheDocument()
  })
})

describe('the finished half is still reachable', () => {
  // An inbox drops what is done, so an empty page says "nothing outstanding"
  // and reads as "your onboarding is gone" -- which is how iCreate's teachers
  // reported it on 2026-09-10. Finished tasks, ticks and all, are one toggle
  // away (they were a separate "By checklist" view until 2026-09-24).
  it('shows finished tasks under their own heading when asked', async () => {
    respond([DONE_TASK])
    renderPage()
    expect(await screen.findByText(/Nothing is waiting on you/i)).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Turn in your roster' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByLabelText(/Show finished/i))
    expect(await screen.findByRole('heading', { name: 'Finished' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Turn in your roster' })).toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: 'Done: Turn in your roster' })).toBeChecked()
  })

  it('opens on the task a notification named', async () => {
    respond([SIGN_TASK, UPLOAD_TASK])
    renderPage('/tasks?task=t-cert')
    await screen.findByText('Employee handbook')
    expect(document.getElementById('task-t-cert').className).toContain('ring-2')
    expect(document.getElementById('task-t-sign').className).not.toContain('ring-2')
  })
})

describe('the office tabs are the office\'s', () => {
  it('shows a teacher only their own tasks, and lands an office tab link on My tasks', async () => {
    respond([REPLY_TASK])
    renderPage('/tasks?tab=requests')
    expect(await screen.findByRole('heading', { name: 'Printer in Room 3' })).toBeInTheDocument()
    // One section is no section: no tab bar at all.
    expect(screen.queryByRole('tab')).not.toBeInTheDocument()
    expect(screen.queryByRole('tab', { name: 'Requests' })).not.toBeInTheDocument()
    expect(screen.queryByRole('tab', { name: 'Assigned' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Assign a task/ })).not.toBeInTheDocument()
    expect(screen.queryByText(/New request/i)).not.toBeInTheDocument()
    // Nothing of the office's was fetched for them.
    expect(api.get.mock.calls.some(([u]) => u.includes('/staff-admin/'))).toBe(false)
    expect(api.get.mock.calls.some(([u]) => u.includes('/api/sis/tasks/assigned'))).toBe(false)
  })

  it('sends an old My documents link to the Library', async () => {
    respond([])
    renderPage('/tasks?tab=documents')
    expect(await screen.findByTestId('where')).toHaveTextContent('/library?tab=documents&docs=mine')
  })

  it('never says checklist', async () => {
    respond([SIGN_TASK, REPLY_TASK, ACK_TASK, UPLOAD_TASK])
    renderPage()
    await screen.findByText('Employee handbook')
    expect(document.body.textContent).not.toMatch(/checklist/i)
  })
})
