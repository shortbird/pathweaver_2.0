/**
 * Signing a task's step instead of printing one.
 *
 * iCreate, 2026-08-06: "rather than downloading/signing/scanning/uploading a
 * doc, just give them a place to type their name with a checkbox saying
 * something like 'this counts as my official signature'."
 *
 * The signing block is one TaskCard for every task in the school (staff My
 * tasks, the family To do page, the hold screen), and the office's side of
 * the same step is AssignmentCard -- a signature that behaves differently
 * depending on which portal you are in is two features pretending to be one.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render as rtlRender, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import TaskCard from '../../components/sis/tasks/TaskCard'
import { taskApi } from '../../hooks/api/useTasks'
import { AssignmentCard } from '../../components/sis/tasks/ChecklistReview'

// The office's card reads through hooks/api (QF-03), so these need a
// QueryClient. Fresh client per render keeps one test's cache out of the next
// one's; retry:false makes a failed query fail rather than hang on backoff.
const render = (ui) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return rtlRender(<QueryClientProvider client={client}>{<MemoryRouter>{withConfirm(ui)}</MemoryRouter>}</QueryClientProvider>)
}

let mockUser = { id: 'kate', role: 'org_managed', org_roles: ['advisor'] }
vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({ user: mockUser }),
}))
vi.mock('react-hot-toast', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
  default: { success: vi.fn(), error: vi.fn() },
}))
vi.mock('./useSisOrg', async () => ({
  useSisOrg: () => ({ orgId: 'org-1', setOrgId: () => {}, orgs: [], isSuperadmin: false }),
  withOrg: (url, orgId) => `${url}${url.includes('?') ? '&' : '?'}organization_id=${orgId}`,
}))

const STATEMENT = 'I am typing my own name below, and I intend it to count as my official signature.'

const { api } = vi.hoisted(() => ({
  api: { get: vi.fn(), patch: vi.fn(), post: vi.fn(), delete: vi.fn(), put: vi.fn() },
}))
vi.mock('../../services/api', () => ({ default: api }))

import { withConfirm, answerConfirm, confirmText } from '../../tests/confirmTestUtils'

const item = (over = {}) => ({
  key: 'contract', title: 'Staff agreement', required: true,
  needs_signature: true, needs_document: false, status: 'pending',
  signature: null, ...over,
})

// One task as GET /api/sis/my-tasks shapes it (sis_tasks_service.shape_task).
const task = (items) => ({
  id: 'a1', type: 'task', title: 'Employee onboarding', status: 'todo',
  native_status: 'pending', done_count: 0, total_count: items.length,
  signature_statement: STATEMENT, items,
})

const renderTask = (items) => render(<TaskCard task={task(items)} api={taskApi} onChanged={() => {}} />)

beforeEach(() => {
  vi.clearAllMocks()
  mockUser = { id: 'kate', role: 'org_managed', org_roles: ['advisor'] }
  api.patch.mockResolvedValue({ data: { success: true } })
  api.get.mockResolvedValue({ data: {} })
})

describe('signing a step of a task', () => {
  it('asks for a typed name and the affirmation', async () => {
    renderTask([item()])
    expect(await screen.findByPlaceholderText('Type your full name to sign')).toBeInTheDocument()
    expect(screen.getByText(STATEMENT)).toBeInTheDocument()
  })

  it('will not sign until both are given', async () => {
    renderTask([item()])
    const sign = await screen.findByRole('button', { name: 'Sign' })
    expect(sign).toBeDisabled()

    fireEvent.change(screen.getByPlaceholderText('Type your full name to sign'), { target: { value: 'Kate Myers' } })
    expect(sign).toBeDisabled()  // name alone is not a signature

    fireEvent.click(screen.getByRole('checkbox', { name: new RegExp('official signature') }))
    expect(sign).toBeEnabled()
  })

  it('sends the name and the affirmation together', async () => {
    renderTask([item()])
    fireEvent.change(await screen.findByPlaceholderText('Type your full name to sign'), { target: { value: 'Kate Myers' } })
    fireEvent.click(screen.getByRole('checkbox', { name: new RegExp('official signature') }))
    fireEvent.click(screen.getByRole('button', { name: 'Sign' }))

    await waitFor(() => expect(api.patch).toHaveBeenCalledWith(
      '/api/sis/tasks/a1/items/contract',
      expect.objectContaining({ signature_name: 'Kate Myers', signature_agreed: true }),
    ))
  })

  it('shows who signed once it is signed, not the form again', async () => {
    renderTask([item({
      status: 'complete',
      signature: { name: 'Kate Myers', signed_at: '2026-08-06T17:00:00Z' },
    })])
    expect(await screen.findByText(/Signed by/)).toBeInTheDocument()
    expect(screen.getByText('Kate Myers')).toBeInTheDocument()
    expect(screen.queryByPlaceholderText('Type your full name to sign')).not.toBeInTheDocument()
  })

  it('does not let a signature step be ticked off like an ordinary one', async () => {
    renderTask([item()])
    await screen.findByPlaceholderText('Type your full name to sign')
    // Signing is the only way to finish it: no tick box at all, only the
    // affirmation inside the sign box.
    expect(screen.queryByRole('checkbox', { name: /^Done:/ })).not.toBeInTheDocument()
    expect(screen.getAllByRole('checkbox')).toHaveLength(1)
  })

  it('does not let a document step be ticked off without a document either', async () => {
    // iCreate, 2026-09-14: Lisa's I-9 read "complete" and there was nothing to
    // view. Uploading is what completes it; the tick alone must not.
    renderTask([item({ key: 'i9', title: 'Upload your I-9 Form', needs_signature: false,
                          needs_document: true, documents: [] })])
    await screen.findByText('Upload your I-9 Form')
    expect(screen.getByRole('checkbox', { name: 'Done: Upload your I-9 Form' })).toBeDisabled()
    expect(screen.getByText('Upload document')).toBeInTheDocument()
  })

  it('lets a document step with a document on it be unticked', async () => {
    renderTask([item({ key: 'i9', title: 'Upload your I-9 Form', needs_signature: false,
                          needs_document: true, status: 'complete',
                          documents: [{ path: 'staff/kate/i9.pdf', filename: 'i9.pdf' }] })])
    await screen.findByText('i9.pdf')
    const tick = screen.getByRole('checkbox', { name: 'Done: Upload your I-9 Form' })
    expect(tick).toBeChecked()
    expect(tick).not.toBeDisabled()
  })

  it('leaves ordinary steps alone', async () => {
    renderTask([item({ key: 'handbook', title: 'Read the handbook', needs_signature: false })])
    await screen.findByText('Read the handbook')
    expect(screen.queryByPlaceholderText('Type your full name to sign')).not.toBeInTheDocument()
  })

  it('shows the link the office gave them', async () => {
    // The family portal always showed item.link; the staff view once did not,
    // so teachers could not reach the I-9 they were asked to fill in.
    renderTask([item({ key: 'i9', title: 'Upload your I-9', needs_signature: false,
      link: 'https://example.org/i-9.pdf' })])
    const link = await screen.findByRole('link', { name: 'Open link' })
    expect(link).toHaveAttribute('href', 'https://example.org/i-9.pdf')
  })
})

describe('signing a document from the office', () => {
  // iCreate, 2026-08-12: "User can sign contract without having one." The item
  // said the contract would be uploaded to the teacher's portal, and the sign
  // box appeared anyway — teachers signed against nothing. sign_docs (from the
  // backend) is the office's uploads for this person; empty means nothing to
  // sign yet.
  it('withholds the sign box until the office uploads the document', async () => {
    renderTask([item({ sign_docs: [] })])
    await screen.findByText('Staff agreement')
    expect(screen.queryByPlaceholderText('Type your full name to sign')).not.toBeInTheDocument()
    expect(screen.getByText(/Your document is not here yet/)).toBeInTheDocument()
  })

  it('offers the document to read, then the sign box', async () => {
    renderTask([item({ sign_docs: [{ id: 'doc-1', title: 'Contract - Kate Myers.pdf' }] })])
    expect(await screen.findByText('Review before signing')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('Type your full name to sign')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Contract - Kate Myers.pdf' }))
    await waitFor(() => expect(api.get).toHaveBeenCalledWith(
      '/api/sis/tasks/a1/sign-documents/doc-1/url',
    ))
  })
})

describe('clearing a signature as an admin', () => {
  it('displays signed status and lets admin clear signature', async () => {
    mockUser = { id: 'admin1', role: 'org_managed', org_roles: ['org_admin'] }

    const signedAssignment = {
      id: 'a1', template_name: 'Employee onboarding', user_name: 'Karina Worlton',
      done_count: 1, total_count: 1,
      items: [item({
        key: 'contract', title: 'Staff agreement', status: 'complete',
        signature: { name: 'Karina Worlton', signed_at: '2026-08-12T10:00:00Z' },
      })],
    }

    api.get.mockImplementation((url) => {
      if (url.includes('/staff-admin/onboarding/templates')) {
        return Promise.resolve({ data: { templates: [] } })
      }
      if (url.includes('/staff-admin/onboarding/assignments')) {
        return Promise.resolve({ data: { assignments: [signedAssignment] } })
      }
      return Promise.resolve({ data: {} })
    })

    render(<AssignmentCard orgId="org-1" assignment={signedAssignment} onChanged={() => {}} />)

    expect(await screen.findByText(/Signed by/)).toBeInTheDocument()
    expect(screen.getAllByText('Karina Worlton').length).toBeGreaterThan(0)

    const clearBtn = screen.getByRole('button', { name: 'Clear signature' })
    fireEvent.click(clearBtn)
    await answerConfirm()

    await waitFor(() => expect(api.patch).toHaveBeenCalledWith(
      '/api/sis/teacher/onboarding/a1/items/contract',
      expect.objectContaining({ organization_id: 'org-1', clear_signature: true }),
    ))
  })
})
