import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

/**
 * Secure documents: letting the person a document belongs to see it.
 *
 * iCreate, 2026-08-18. Nineteen teacher contracts were uploaded and filed
 * against the right nineteen teachers, and not one teacher could open or sign
 * theirs. An uploaded document is private until somebody says otherwise, and
 * the only way to say otherwise was a per-row toggle labelled "Private" with
 * nothing on it about signing. The signature item on each teacher's checklist
 * needs a SHARED document to sign against, so all nineteen read "your document
 * is not here yet".
 *
 * So the decision is available in both places the office is already standing:
 * on the upload form as the document is filed, and over a selection for the
 * batch that is already sitting in the list.
 */

let authState = { user: { id: 'u1', role: 'org_admin' } }
let orgState = { organization: { id: 'org-1', name: 'Org' } }

vi.mock('../../contexts/AuthContext', () => ({ useAuth: () => authState }))
vi.mock('../../contexts/OrganizationContext', () => ({ useOrganization: () => orgState }))
vi.mock('react-hot-toast', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
  default: { success: vi.fn(), error: vi.fn() },
}))

const { api, confirmMock } = vi.hoisted(() => ({
  api: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() },
  confirmMock: vi.fn(),
}))
vi.mock('../../services/api', () => ({ default: api }))
vi.mock('../../contexts/ConfirmContext', () => ({ useConfirm: () => confirmMock }))

import SecureDocumentsPage from './SecureDocumentsPage'

const ROSTER = [
  { student_id: 'staff-1', name: 'Karin Jaccard', is_student: false, role: 'Teacher' },
  { student_id: 'staff-2', name: 'Lisa Price', is_student: false, role: 'Teacher' },
  { student_id: 'stu-1', name: 'Ada Small', is_student: true },
]

const KARIN = {
  id: 'd1', filename: 'karin.pdf', title: 'Contract - Karin', category: 'Contract',
  owner_user_id: 'staff-1', owner_name: 'Karin Jaccard', shared_with_owner: false,
  created_at: '2026-08-18T00:00:00Z',
}
const LISA = {
  id: 'd2', filename: 'lisa.pdf', title: 'Contract - Lisa', category: 'Contract',
  owner_user_id: 'staff-2', owner_name: 'Lisa Price', shared_with_owner: false,
  created_at: '2026-08-18T00:00:00Z',
}
// Filed about a student: a student is the subject of a document, never its
// owner, so there is nobody to share it with.
const ABOUT_A_STUDENT = {
  id: 'd3', filename: 'medical.pdf', title: 'Medical - Ada', category: 'Medical',
  student_user_id: 'stu-1', student_name: 'Ada Small', owner_user_id: null,
  shared_with_owner: false, created_at: '2026-08-18T00:00:00Z',
}
// Already theirs — they sent it in.
const SENT_IN = {
  id: 'd4', filename: 'i9.pdf', title: 'I9 - Karin', owner_user_id: 'staff-1',
  owner_name: 'Karin Jaccard', uploaded_by_owner: true, shared_with_owner: true,
  created_at: '2026-08-18T00:00:00Z',
}

let DOCS = []

beforeEach(() => {
  authState = { user: { id: 'u1', role: 'org_admin' } }
  orgState = { organization: { id: 'org-1', name: 'Org' } }
  DOCS = [KARIN, LISA, ABOUT_A_STUDENT, SENT_IN]
  vi.clearAllMocks()
  confirmMock.mockResolvedValue(true)
  api.get.mockImplementation((url) => (
    url.includes('/roster')
      ? Promise.resolve({ data: { roster: ROSTER } })
      : Promise.resolve({ data: { documents: DOCS } })
  ))
  api.post.mockResolvedValue({ data: { documents: [{ id: 'new' }] } })
  api.patch.mockResolvedValue({ data: { updated: 2, skipped: 0 } })
})

const show = async () => {
  render(<SecureDocumentsPage />)
  await screen.findByText('Contract - Karin')
}

const attachFile = () => {
  const input = document.querySelector('input[type="file"]')
  fireEvent.change(input, {
    target: { files: [new File(['x'], 'contract.pdf', { type: 'application/pdf' })] },
  })
}

const uploadedForm = () => api.post.mock.calls[0][1]
const select = (title) => fireEvent.click(screen.getByLabelText(`Select ${title}`))
// The upload checkbox and the bulk action deliberately share their wording —
// same decision, same words — so these are looked up by role, not by text.
const shareButton = () => screen.getByRole('button', { name: 'Let them see it' })
const shareCheckbox = () => screen.getByRole('checkbox', { name: /Let them see it/ })

describe('deciding it as the document is filed', () => {
  it('sends the sharing choice with the upload', async () => {
    await show()
    attachFile()
    fireEvent.click(shareCheckbox())
    fireEvent.click(screen.getByText('Upload document'))
    await waitFor(() => expect(api.post).toHaveBeenCalled())
    expect(uploadedForm().get('shared_with_owner')).toBe('true')
  })

  it('says nothing at all when the box is left alone', async () => {
    // Silence has to mean private: this store holds background checks, and the
    // backend defaults to private on a missing field.
    await show()
    attachFile()
    fireEvent.click(screen.getByText('Upload document'))
    await waitFor(() => expect(api.post).toHaveBeenCalled())
    expect(uploadedForm().has('shared_with_owner')).toBe(false)
  })

  it('stays ticked for the next upload', async () => {
    // Nineteen contracts in one sitting is one decision, not nineteen. It is
    // still on screen and still unticked on a fresh load.
    await show()
    attachFile()
    fireEvent.click(shareCheckbox())
    fireEvent.click(screen.getByText('Upload document'))
    await waitFor(() => expect(api.post).toHaveBeenCalled())
    expect(shareCheckbox().checked).toBe(true)
  })
})

describe('deciding it for a batch already uploaded', () => {
  it('shares the whole selection in one request', async () => {
    await show()
    select('Contract - Karin')
    select('Contract - Lisa')
    fireEvent.click(shareButton())
    await waitFor(() => expect(api.patch).toHaveBeenCalled())
    expect(api.patch).toHaveBeenCalledWith('/api/sis/secure-documents', {
      organization_id: 'org-1', document_ids: ['d1', 'd2'], shared_with_owner: true,
    })
  })

  it('asks before showing paperwork to people', async () => {
    await show()
    select('Contract - Karin')
    fireEvent.click(shareButton())
    await waitFor(() => expect(confirmMock).toHaveBeenCalled())
    expect(String(confirmMock.mock.calls[0][0])).toContain('Karin Jaccard')
  })

  it('does nothing if the office backs out', async () => {
    confirmMock.mockResolvedValue(false)
    await show()
    select('Contract - Karin')
    fireEvent.click(shareButton())
    await waitFor(() => expect(confirmMock).toHaveBeenCalled())
    expect(api.patch).not.toHaveBeenCalled()
  })

  it('shows the rows as shared without waiting for a reload', async () => {
    await show()
    select('Contract - Karin')
    fireEvent.click(shareButton())
    await waitFor(() => expect(api.patch).toHaveBeenCalled())
    const row = screen.getByText('Contract - Karin').closest('tr')
    await waitFor(() => expect(row.textContent).toContain('Shared with them'))
  })

  it('can take sharing back, and does not ask to', async () => {
    // Hiding a document again is not the risky direction.
    await show()
    select('Contract - Karin')
    fireEvent.click(screen.getByRole('button', { name: 'Make private' }))
    await waitFor(() => expect(api.patch).toHaveBeenCalled())
    expect(api.patch.mock.calls[0][1].shared_with_owner).toBe(false)
    expect(confirmMock).not.toHaveBeenCalled()
  })

  it('hides the actions until something is selected', async () => {
    await show()
    expect(screen.queryByText('Make private')).not.toBeInTheDocument()
    select('Contract - Karin')
    expect(screen.getByText('1 selected')).toBeInTheDocument()
  })
})

describe('what can be selected', () => {
  it('will not offer a document nobody owns', async () => {
    // Sharing needs somebody to share with; the server refuses these too.
    await show()
    expect(screen.getByLabelText('Select Medical - Ada')).toBeDisabled()
  })

  it('will not offer a document the person sent in themselves', async () => {
    await show()
    expect(screen.getByLabelText('Select I9 - Karin')).toBeDisabled()
  })

  it('select-all takes only what can actually be shared', async () => {
    await show()
    fireEvent.click(screen.getByLabelText('Select all documents'))
    expect(screen.getByText('2 selected')).toBeInTheDocument()
  })

  it('select-all follows the filter, so a search narrows what gets shared', async () => {
    await show()
    fireEvent.change(screen.getByPlaceholderText('Filter documents…'),
      { target: { value: 'Karin' } })
    fireEvent.click(screen.getByLabelText('Select all documents'))
    // Karin's contract, not her I9 — that one is already hers.
    expect(screen.getByText('1 selected')).toBeInTheDocument()
  })
})
