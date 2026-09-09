import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

/**
 * My Tasks — the unified inbox.
 *
 * The page's job is to be the one place a person looks, so what these tests
 * hold down is that things are actually finishable here: a document sent for
 * signature is signed in place, a policy is acknowledged in one click, and a
 * request — which is a conversation, not a one-click job — links out to its own
 * page rather than pretending to be completable in a list.
 */

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

import MyTasksPage from './MyTasksPage'

const SIGNATURE_TASK = {
  id: 'onb:a1:sign', type: 'signature', title: 'Sign: Employee handbook',
  context: 'Employee handbook', status: 'todo', native_status: 'pending',
  due_date: null, priority: null, created_at: '2026-08-14T00:00:00Z',
  sign_docs: [{ id: 'doc-1', title: 'Employee handbook.pdf' }],
  link: '/onboarding?assignment=a1&item=sign',
}
const REQUEST_TASK = {
  id: 'form:f1', type: 'request', title: 'Printer in Room 3',
  context: 'Maintenance request', status: 'in_progress', native_status: 'under_review',
  priority: 'high', due_date: null, created_at: '2026-08-10T00:00:00Z',
  link: '/forms?submission=f1',
}
const ACK_TASK = {
  id: 'ack:r1', type: 'ack', title: 'Acknowledge: Safeguarding policy',
  context: 'Staff resources', status: 'todo', native_status: 'pending',
  resource_id: 'r1', link: '/resources?highlight=r1',
}
const UPLOAD_TASK = {
  id: 'onb:a2:cert', type: 'document_upload', title: 'Upload your first-aid certificate',
  context: 'Employee onboarding', status: 'todo', native_status: 'pending',
  link: '/onboarding?assignment=a2&item=cert',
}

const respond = (tasks, counts = {}) => {
  api.get.mockImplementation((url) => {
    if (url.startsWith('/api/sis/my-tasks')) {
      return Promise.resolve({ data: {
        success: true, tasks, counts: { open: tasks.length, overdue: 0, ...counts },
        signature_statement: 'I am typing my own name below, and I intend it to count as my official signature.',
      } })
    }
    return Promise.resolve({ data: {} })
  })
}

const renderPage = () => render(<MemoryRouter><MyTasksPage /></MemoryRouter>)

beforeEach(() => {
  vi.clearAllMocks()
  api.post.mockResolvedValue({ data: {} })
  api.patch.mockResolvedValue({ data: {} })
})

describe('the inbox gathers every kind of task', () => {
  it('lists tasks from all four sources together', async () => {
    respond([SIGNATURE_TASK, REQUEST_TASK, ACK_TASK, UPLOAD_TASK])
    renderPage()
    expect(await screen.findByText('Sign: Employee handbook')).toBeInTheDocument()
    expect(screen.getByText('Printer in Room 3')).toBeInTheDocument()
    expect(screen.getByText('Acknowledge: Safeguarding policy')).toBeInTheDocument()
    expect(screen.getByText('Upload your first-aid certificate')).toBeInTheDocument()
  })

  it('shows how many are open', async () => {
    respond([SIGNATURE_TASK, REQUEST_TASK], { open: 2 })
    renderPage()
    expect(await screen.findByText('2')).toBeInTheDocument()
  })

  it('says so plainly when nothing is waiting', async () => {
    respond([])
    renderPage()
    expect(await screen.findByText(/Nothing is waiting on you/i)).toBeInTheDocument()
  })

  it('asks for completed tasks only when they are wanted', async () => {
    respond([])
    renderPage()
    await waitFor(() => expect(api.get).toHaveBeenCalled())
    expect(api.get.mock.calls[0][0]).not.toContain('include_done')
    fireEvent.click(screen.getByLabelText(/Show completed/i))
    await waitFor(() => expect(
      api.get.mock.calls.some(([u]) => u.includes('include_done=1'))).toBe(true))
  })
})

describe('signing a document without leaving the page', () => {
  it('offers the document to read before signing', async () => {
    respond([SIGNATURE_TASK])
    renderPage()
    expect(await screen.findByText('Employee handbook.pdf')).toBeInTheDocument()
  })

  it('signs the underlying checklist item', async () => {
    respond([SIGNATURE_TASK])
    renderPage()
    fireEvent.change(await screen.findByPlaceholderText('Your full name'),
      { target: { value: 'Kate Myers' } })
    fireEvent.click(screen.getByRole('checkbox', { name: /official signature/i }))
    fireEvent.click(screen.getByRole('button', { name: 'Sign' }))
    await waitFor(() => expect(api.patch).toHaveBeenCalledWith(
      '/api/sis/teacher/onboarding/a1/items/sign',
      expect.objectContaining({ signature_name: 'Kate Myers', signature_agreed: true })))
  })

  it('withholds the sign box until the office has uploaded the document', async () => {
    respond([{ ...SIGNATURE_TASK, sign_docs: [] }])
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

describe('a request keeps its own page', () => {
  it('links to the request rather than trying to finish it here', async () => {
    respond([REQUEST_TASK])
    renderPage()
    const link = await screen.findByRole('link', { name: /Open request/i })
    expect(link).toHaveAttribute('href', '/forms?submission=f1')
  })

  it('has no checkbox — a conversation is not ticked off', async () => {
    respond([REQUEST_TASK])
    renderPage()
    await screen.findByText('Printer in Room 3')
    expect(screen.queryByRole('checkbox', { name: '' })).not.toBeInTheDocument()
  })
})

describe('overdue work is unmissable', () => {
  it('marks an overdue task', async () => {
    respond([{ ...SIGNATURE_TASK, due_date: '2026-08-01', overdue: true }],
      { overdue: 1 })
    renderPage()
    expect(await screen.findByText(/Overdue — due 2026-08-01/)).toBeInTheDocument()
    expect(screen.getByText('1 overdue')).toBeInTheDocument()
  })
})
