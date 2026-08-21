import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

/**
 * The internal task system on the forms queue (iCreate Phase 2, 2026-08-09).
 *
 * The backend has carried an assigned_to column since 20260722 that no UI
 * could ever set. This locks the queue's task controls: assign to a staff
 * member, set priority and due date, move through the working statuses, and
 * comment on the thread.
 */

const authState = { user: { id: 'admin-1', role: 'org_managed', org_roles: ['org_admin'] } }
vi.mock('../../contexts/AuthContext', () => ({ useAuth: () => authState }))
vi.mock('react-hot-toast', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
  default: { success: vi.fn(), error: vi.fn() },
}))
vi.mock('./SisOrgPicker', () => ({ default: () => null }))
vi.mock('./useSisOrg', () => ({
  useSisOrg: () => ({ orgId: 'org-1', setOrgId: vi.fn(), orgs: [], isSuperadmin: false, activeOrg: null }),
  withOrg: (url, orgId) => `${url}${url.includes('?') ? '&' : '?'}organization_id=${orgId}`,
}))
vi.mock('./teacherPreview', () => ({
  getPreviewTeacher: () => null,
  withPreview: (p) => p,
  setPreviewTeacher: vi.fn(),
  clearPreviewTeacher: vi.fn(),
}))

const { api } = vi.hoisted(() => ({
  api: {
    get: vi.fn(),
    post: vi.fn(() => Promise.resolve({ data: {} })),
    patch: vi.fn(() => Promise.resolve({ data: {} })),
  },
}))
vi.mock('../../services/api', () => ({ default: api }))

import StaffFormsPage from './StaffFormsPage'

const SUBMISSION = {
  id: 'f1', form_type: 'maintenance', form_type_label: 'Maintenance request',
  title: 'Printer in Room 3', status: 'submitted', priority: 'normal',
  submitted_by_name: 'A Teacher', submitter_role: 'staff',
  payload: { body: 'It is jammed' }, created_at: '2026-08-09T12:00:00Z',
}
const STAFF = [
  { id: 'cc-1', name: 'Kate Coordinator', roles: ['campus_coordinator'] },
  { id: 't-1', name: 'A Teacher', roles: ['advisor'] },
]

beforeEach(() => {
  vi.clearAllMocks()
  api.get.mockImplementation((url) => {
    if (url.includes('/comments')) {
      return Promise.resolve({ data: { comments: [{ id: 'c1', body: 'On it', author_name: 'Kate Coordinator', created_at: '2026-08-09T13:00:00Z' }] } })
    }
    if (url.includes('/api/sis/staff-admin/forms')) {
      return Promise.resolve({ data: { submissions: [SUBMISSION], form_types: { maintenance: 'Maintenance request', task: 'Task' } } })
    }
    if (url.includes('/api/sis/teacher/forms')) {
      return Promise.resolve({ data: { submissions: [], form_types: { maintenance: 'Maintenance request', task: 'Task' } } })
    }
    if (url.includes('/api/sis/staff')) {
      return Promise.resolve({ data: { staff: STAFF } })
    }
    return Promise.resolve({ data: {} })
  })
})

const renderPage = () => render(<MemoryRouter><StaffFormsPage /></MemoryRouter>)

// A queue row is a scan line until it is opened — every control below lives in
// the expanded body. See the AdminQueue comment for why editing is a state of
// the row rather than its resting shape.
const openRow = async (title) => {
  const label = await screen.findByText(title)
  fireEvent.click(label)
  return label.closest('li')
}

describe('the task queue', () => {
  it('assigns a submission to a staff member', async () => {
    renderPage()
    const row = await openRow('Printer in Room 3')
    const assignee = within(row).getByLabelText(/assign/i)
    fireEvent.change(assignee, { target: { value: 'cc-1' } })
    await waitFor(() => expect(api.patch).toHaveBeenCalled())
    const [url, body] = api.patch.mock.calls[0]
    expect(url).toContain('/api/sis/staff-admin/forms/f1')
    expect(body.assigned_to).toBe('cc-1')
  })

  it('offers the working statuses', async () => {
    renderPage()
    const row = await openRow('Printer in Room 3')
    const status = within(row).getByLabelText(/status/i)
    const options = [...status.querySelectorAll('option')].map((o) => o.value)
    for (const s of ['submitted', 'under_review', 'in_progress', 'waiting', 'resolved']) {
      expect(options).toContain(s)
    }
    fireEvent.change(status, { target: { value: 'in_progress' } })
    await waitFor(() => expect(api.patch).toHaveBeenCalled())
    expect(api.patch.mock.calls[0][1].status).toBe('in_progress')
  })

  it('sets priority and due date', async () => {
    renderPage()
    const row = await openRow('Printer in Room 3')
    fireEvent.change(within(row).getByLabelText(/priority/i), { target: { value: 'high' } })
    await waitFor(() => expect(api.patch).toHaveBeenCalled())
    expect(api.patch.mock.calls[0][1].priority).toBe('high')

    fireEvent.change(within(row).getByLabelText(/due/i), { target: { value: '2026-08-15' } })
    await waitFor(() => expect(api.patch).toHaveBeenCalledTimes(2))
    expect(api.patch.mock.calls[1][1].due_date).toBe('2026-08-15')
  })

  it('does not save a half-typed due date', async () => {
    /**
     * iCreate, 2026-08-20: "there is a bit of a bug with the due date letting
     * me enter that in. It wouldn't let me enter in the year." A native date
     * input reports an empty value until the whole date is valid, so saving on
     * every keystroke saved a null halfway through typing and reloaded the row
     * on top of it — the year could never be finished.
     */
    renderPage()
    const row = await openRow('Printer in Room 3')
    const due = within(row).getByLabelText(/due/i)

    fireEvent.change(due, { target: { value: '' } })      // mid-typing
    expect(api.patch).not.toHaveBeenCalled()

    fireEvent.change(due, { target: { value: '2026-08-15' } })   // finished
    await waitFor(() => expect(api.patch).toHaveBeenCalledTimes(1))
    expect(api.patch.mock.calls[0][1].due_date).toBe('2026-08-15')
  })

  it('clears a due date when the box is emptied and left', async () => {
    api.get.mockImplementation((url) => {
      if (url.includes('/api/sis/staff-admin/forms')) {
        return Promise.resolve({ data: {
          submissions: [{ ...SUBMISSION, due_date: '2026-08-15' }],
          form_types: { maintenance: 'Maintenance request' },
        } })
      }
      if (url.includes('/api/sis/staff')) return Promise.resolve({ data: { staff: STAFF } })
      return Promise.resolve({ data: {} })
    })
    renderPage()
    const row = await openRow('Printer in Room 3')
    const due = within(row).getByLabelText(/due/i)
    fireEvent.change(due, { target: { value: '' } })
    fireEvent.blur(due)
    await waitFor(() => expect(api.patch).toHaveBeenCalledTimes(1))
    expect(api.patch.mock.calls[0][1].due_date).toBe(null)
  })

  it('filters the queue by who it is assigned to', async () => {
    api.get.mockImplementation((url) => {
      if (url.includes('/api/sis/staff-admin/forms')) {
        return Promise.resolve({ data: {
          submissions: [
            SUBMISSION,
            { ...SUBMISSION, id: 'f2', title: 'Cover Thursday', assigned_to: 'cc-1',
              assigned_to_name: 'Kate Coordinator' },
          ],
          form_types: { maintenance: 'Maintenance request' },
        } })
      }
      if (url.includes('/api/sis/staff')) return Promise.resolve({ data: { staff: STAFF } })
      return Promise.resolve({ data: {} })
    })
    renderPage()
    await screen.findByText('Cover Thursday')

    fireEvent.change(screen.getByLabelText('Filter by assignee'), { target: { value: 'cc-1' } })
    expect(screen.getByText('Cover Thursday')).toBeInTheDocument()
    expect(screen.queryByText('Printer in Room 3')).not.toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('Filter by assignee'), { target: { value: 'none' } })
    expect(screen.getByText('Printer in Room 3')).toBeInTheDocument()
    expect(screen.queryByText('Cover Thursday')).not.toBeInTheDocument()
  })

  it('shows and posts comments on the thread', async () => {
    renderPage()
    const row = await openRow('Printer in Room 3')
    fireEvent.click(within(row).getByRole('button', { name: /comments/i }))
    await screen.findByText('On it')
    const input = within(row).getByPlaceholderText(/add a comment/i)
    fireEvent.change(input, { target: { value: 'Fixed the jam' } })
    fireEvent.click(within(row).getByRole('button', { name: /^post$/i }))
    await waitFor(() => expect(api.post).toHaveBeenCalled())
    const [url, body] = api.post.mock.calls.find(([u]) => u.includes('/comments'))
    expect(url).toContain('/api/sis/staff-admin/forms/f1/comments')
    expect(body.body).toBe('Fixed the jam')
  })

  it('lets an admin create a task assigned to someone', async () => {
    renderPage()
    await screen.findByText('Printer in Room 3')
    // The admin submit form carries assignment fields; posting goes through
    // the staff-admin create door, which may assign.
    fireEvent.change(screen.getByLabelText(/assign to/i), { target: { value: 'cc-1' } })
    fireEvent.change(screen.getByPlaceholderText(/what happened/i), { target: { value: 'Replace supplies in Room 4' } })
    fireEvent.click(screen.getByRole('button', { name: /^submit$/i }))
    await waitFor(() => expect(api.post).toHaveBeenCalled())
    const [url, body] = api.post.mock.calls.find(([u]) => u.includes('/staff-admin/forms'))
    expect(url).toContain('/api/sis/staff-admin/forms')
    expect(body.assigned_to).toBe('cc-1')
  })
})

/**
 * The queue is a scanning surface first. Before this it rendered every
 * submission fully expanded — four selects, a resolution box and a comment
 * toggle each — and loaded every status, so resolved history was interleaved
 * with live work and the page could only grow.
 */
describe('reading the queue at a glance', () => {
  it("opens on the work that is still somebody's problem", async () => {
    renderPage()
    await screen.findByText('Printer in Room 3')
    const queueCalls = api.get.mock.calls.map(([u]) => u)
      .filter((u) => u.includes('/api/sis/staff-admin/forms') && !u.includes('/comments'))
    expect(queueCalls[0]).toContain('status=open')
  })

  it('keeps a row collapsed until it is opened', async () => {
    renderPage()
    const row = (await screen.findByText('Printer in Room 3')).closest('li')
    // The scan line shows what you triage on...
    expect(within(row).getByText('Maintenance request')).toBeInTheDocument()
    // ...and none of what you edit with.
    expect(within(row).queryByLabelText(/^status$/i)).not.toBeInTheDocument()
    expect(within(row).queryByLabelText(/assigned to/i)).not.toBeInTheDocument()
    expect(within(row).queryByText('It is jammed')).not.toBeInTheDocument()

    fireEvent.click(screen.getByText('Printer in Room 3'))
    expect(within(row).getByLabelText(/^status$/i)).toBeInTheDocument()
    expect(within(row).getByText('It is jammed')).toBeInTheDocument()
  })

  it('shows who a request is assigned to without opening it', async () => {
    api.get.mockImplementation((url) => {
      if (url.includes('/comments')) return Promise.resolve({ data: { comments: [] } })
      if (url.includes('/api/sis/staff-admin/forms')) {
        return Promise.resolve({ data: {
          submissions: [{ ...SUBMISSION, assigned_to: 'cc-1', assigned_to_name: 'Kate Coordinator' }],
          counts: { open: 4, resolved: 9 },
        } })
      }
      if (url.includes('/api/sis/teacher/forms')) return Promise.resolve({ data: { submissions: [], form_types: {} } })
      if (url.includes('/api/sis/staff')) return Promise.resolve({ data: { staff: STAFF } })
      return Promise.resolve({ data: {} })
    })
    renderPage()
    const row = (await screen.findByText('Printer in Room 3')).closest('li')
    expect(within(row).getByText(/Kate Coordinator/)).toBeInTheDocument()
  })

  it('counts the queue on its filter chips', async () => {
    api.get.mockImplementation((url) => {
      if (url.includes('/comments')) return Promise.resolve({ data: { comments: [] } })
      if (url.includes('/api/sis/staff-admin/forms')) {
        return Promise.resolve({ data: { submissions: [SUBMISSION], counts: { open: 4, resolved: 9 } } })
      }
      if (url.includes('/api/sis/teacher/forms')) return Promise.resolve({ data: { submissions: [], form_types: {} } })
      if (url.includes('/api/sis/staff')) return Promise.resolve({ data: { staff: STAFF } })
      return Promise.resolve({ data: {} })
    })
    renderPage()
    expect(await screen.findByRole('button', { name: 'Open (4)' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Completed (9)' })).toBeInTheDocument()
  })

  it('asks the server for completed work rather than filtering in the page', async () => {
    renderPage()
    fireEvent.click(await screen.findByRole('button', { name: /^Completed/ }))
    await waitFor(() => expect(api.get.mock.calls.some(
      ([u]) => u.includes('/api/sis/staff-admin/forms') && u.includes('status=resolved'))).toBe(true))
  })
})

describe('the admin submit form', () => {
  it('still files a task from the forms page itself', async () => {
    renderPage()
    await screen.findByText('Printer in Room 3')
    // The admin submit form carries assignment fields; posting goes through
    // the staff-admin create door, which may assign.
    fireEvent.change(screen.getByLabelText(/assign to/i), { target: { value: 'cc-1' } })
    fireEvent.change(screen.getByPlaceholderText(/what happened/i), { target: { value: 'Replace supplies in Room 4' } })
    fireEvent.click(screen.getByRole('button', { name: /^submit$/i }))
    await waitFor(() => expect(api.post).toHaveBeenCalled())
    const [url, body] = api.post.mock.calls.find(([u]) => u.includes('/staff-admin/forms'))
    expect(url).toContain('/api/sis/staff-admin/forms')
    expect(body.assigned_to).toBe('cc-1')
  })
})
