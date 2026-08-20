import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'

/**
 * My Documents under the teacher-portal preview.
 *
 * iCreate, 2026-08-19: the office uploaded a contract per teacher, then used
 * "View portal" to check each had landed — and saw the same file under every
 * name, the admin's own background check, because this page asked for its own
 * documents no matter whose portal it was standing in. What these tests hold
 * down is that the preview reaches the read (and that a document cannot be
 * sent in on somebody else's behalf while it does).
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
  api: { get: vi.fn(), post: vi.fn(() => Promise.resolve({ data: {} })) },
}))
vi.mock('../../services/api', () => ({ default: api }))

import MyDocumentsPage from './MyDocumentsPage'
import { setPreviewTeacher, clearPreviewTeacher } from './teacherPreview'

const CONTRACT = {
  id: 'doc-1', filename: 'Teacher Employee Agreement - Ana Rogers.pdf',
  title: 'Teacher Employee Agreement - Ana Rogers.pdf', category: 'Contract',
  size_bytes: 108796, created_at: '2026-08-18T05:15:41Z',
  shared_with_owner: true, uploaded_by_owner: false,
}

const ok = (documents, previewing = false) =>
  Promise.resolve({ data: { success: true, documents, previewing } })

describe('MyDocumentsPage under teacher preview', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    clearPreviewTeacher()
  })
  afterEach(() => clearPreviewTeacher())

  it('asks for the previewed teacher, not the admin', async () => {
    setPreviewTeacher({ id: 'teach-1', name: 'Ana Rogers' })
    api.get.mockReturnValue(ok([CONTRACT], true))

    render(<MyDocumentsPage />)

    await waitFor(() => expect(api.get).toHaveBeenCalled())
    expect(api.get.mock.calls[0][0]).toContain('teacher_id=teach-1')
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent("Ana Rogers's documents")
    expect(screen.getByText(CONTRACT.title)).toBeInTheDocument()
  })

  it('hides the send-a-document box in preview — an upload would be filed as the admin', async () => {
    setPreviewTeacher({ id: 'teach-1', name: 'Ana Rogers' })
    api.get.mockReturnValue(ok([CONTRACT], true))

    render(<MyDocumentsPage />)

    await waitFor(() => expect(api.get).toHaveBeenCalled())
    expect(screen.queryByText('Send a document to the office')).not.toBeInTheDocument()
    expect(screen.getByText(/Previewing Ana Rogers/)).toBeInTheDocument()
  })

  it('is the caller’s own page with no preview active', async () => {
    api.get.mockReturnValue(ok([]))

    render(<MyDocumentsPage />)

    await waitFor(() => expect(api.get).toHaveBeenCalled())
    expect(api.get.mock.calls[0][0]).not.toContain('teacher_id')
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('My Documents')
    expect(await screen.findByText('Send a document to the office')).toBeInTheDocument()
  })

  it('says why a coordinator sees nothing, instead of an empty list', async () => {
    setPreviewTeacher({ id: 'teach-1', name: 'Ana Rogers' })
    api.get.mockReturnValue(Promise.reject({
      response: { status: 403, data: { error: "Only an administrator can view another person's documents" } },
    }))

    render(<MyDocumentsPage />)

    expect(await screen.findByText(/Only an administrator can view another person's documents/))
      .toBeInTheDocument()
    expect(screen.queryByText(/Nothing shared with/)).not.toBeInTheDocument()
  })
})
