/**
 * Signing a checklist item instead of printing one.
 *
 * iCreate, 2026-08-06: "rather than downloading/signing/scanning/uploading a
 * doc, just give them a place to type their name with a checkbox saying
 * something like 'this counts as my official signature'."
 *
 * The signing block is shared between the SIS staff checklist and the family
 * portal, so both are exercised here — a signature that behaves differently
 * depending on which portal you are in is two features pretending to be one.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render as rtlRender, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import MyChecklists from '../../components/sis/tasks/MyChecklists'
import { AssignmentCard } from '../../components/sis/tasks/ChecklistReview'

// Onboarding reads its checklists through hooks/api (QF-03), so these need a
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

const assignment = (items) => ({
  id: 'a1', template_name: 'Employee onboarding', done_count: 0, total_count: 1,
  signature_statement: STATEMENT, items,
})

const mockChecklist = (items) => {
  api.get.mockImplementation((url) => {
    if (url.includes('/teacher/onboarding')) {
      return Promise.resolve({ data: { assignments: [assignment(items)] } })
    }
    return Promise.resolve({ data: {} })
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  mockUser = { id: 'kate', role: 'org_managed', org_roles: ['advisor'] }
  api.patch.mockResolvedValue({ data: { success: true } })
})

describe('signing a checklist item', () => {
  it('asks for a typed name and the affirmation', async () => {
    mockChecklist([item()])
    render(<MyChecklists orgId="org-1" />)
    expect(await screen.findByPlaceholderText('Type your full name to sign')).toBeInTheDocument()
    expect(screen.getByText(STATEMENT)).toBeInTheDocument()
  })

  it('will not sign until both are given', async () => {
    mockChecklist([item()])
    render(<MyChecklists orgId="org-1" />)
    const sign = await screen.findByRole('button', { name: 'Sign' })
    expect(sign).toBeDisabled()

    fireEvent.change(screen.getByPlaceholderText('Type your full name to sign'), { target: { value: 'Kate Myers' } })
    expect(sign).toBeDisabled()  // name alone is not a signature

    fireEvent.click(screen.getByRole('checkbox', { name: new RegExp('official signature') }))
    expect(sign).toBeEnabled()
  })

  it('sends the name and the affirmation together', async () => {
    mockChecklist([item()])
    render(<MyChecklists orgId="org-1" />)
    fireEvent.change(await screen.findByPlaceholderText('Type your full name to sign'), { target: { value: 'Kate Myers' } })
    fireEvent.click(screen.getByRole('checkbox', { name: new RegExp('official signature') }))
    fireEvent.click(screen.getByRole('button', { name: 'Sign' }))

    await waitFor(() => expect(api.patch).toHaveBeenCalledWith(
      '/api/sis/teacher/onboarding/a1/items/contract',
      expect.objectContaining({ signature_name: 'Kate Myers', signature_agreed: true }),
    ))
  })

  it('shows who signed once it is signed, not the form again', async () => {
    mockChecklist([item({
      status: 'complete',
      signature: { name: 'Kate Myers', signed_at: '2026-08-06T17:00:00Z' },
    })])
    render(<MyChecklists orgId="org-1" />)
    expect(await screen.findByText(/Signed by/)).toBeInTheDocument()
    expect(screen.getByText('Kate Myers')).toBeInTheDocument()
    expect(screen.queryByPlaceholderText('Type your full name to sign')).not.toBeInTheDocument()
  })

  it('does not let a signature item be ticked off like an ordinary one', async () => {
    mockChecklist([item()])
    render(<MyChecklists orgId="org-1" />)
    await screen.findByPlaceholderText('Type your full name to sign')
    expect(screen.getByRole('checkbox', { checked: false, name: '' })).toBeDisabled()
  })

  it('does not let a document item be ticked off without a document either', async () => {
    // iCreate, 2026-09-14: Lisa's I-9 read "complete" and there was nothing to
    // view. Uploading is what completes it; the tick alone must not.
    mockChecklist([item({ key: 'i9', title: 'Upload your I-9 Form', needs_signature: false,
                          needs_document: true, documents: [] })])
    render(<MyChecklists orgId="org-1" />)
    await screen.findByText('Upload your I-9 Form')
    expect(screen.getByRole('checkbox', { checked: false })).toBeDisabled()
    expect(screen.getByText('Upload document')).toBeInTheDocument()
  })

  it('lets a document item with a document on it be unticked', async () => {
    mockChecklist([item({ key: 'i9', title: 'Upload your I-9 Form', needs_signature: false,
                          needs_document: true, status: 'complete',
                          documents: [{ path: 'staff/kate/i9.pdf', filename: 'i9.pdf' }] })])
    render(<MyChecklists orgId="org-1" />)
    await screen.findByText('i9.pdf')
    expect(screen.getByRole('checkbox', { checked: true })).not.toBeDisabled()
  })

  it('leaves ordinary items alone', async () => {
    mockChecklist([item({ key: 'handbook', title: 'Read the handbook', needs_signature: false })])
    render(<MyChecklists orgId="org-1" />)
    await screen.findByText('Read the handbook')
    expect(screen.queryByPlaceholderText('Type your full name to sign')).not.toBeInTheDocument()
  })

  it('shows the link the office gave them', async () => {
    // The family portal always showed item.link; this view never did, so
    // teachers could not reach the I-9 they were asked to fill in.
    mockChecklist([item({ key: 'i9', title: 'Upload your I-9', needs_signature: false,
      link: 'https://example.org/i-9.pdf' })])
    render(<MyChecklists orgId="org-1" />)
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
    mockChecklist([item({ sign_docs: [] })])
    render(<MyChecklists orgId="org-1" />)
    await screen.findByText('Staff agreement')
    expect(screen.queryByPlaceholderText('Type your full name to sign')).not.toBeInTheDocument()
    expect(screen.getByText(/Your document is not here yet/)).toBeInTheDocument()
  })

  it('offers the document to read, then the sign box', async () => {
    mockChecklist([item({ sign_docs: [{ id: 'doc-1', title: 'Contract - Kate Myers.pdf' }] })])
    render(<MyChecklists orgId="org-1" />)
    expect(await screen.findByText('Review before signing')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('Type your full name to sign')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Contract - Kate Myers.pdf' }))
    await waitFor(() => expect(api.get).toHaveBeenCalledWith(
      expect.stringContaining('/api/sis/teacher/my-documents/doc-1/url'),
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
