import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'

/**
 * Secure documents: naming a file, renaming it, and filing one upload against
 * several people.
 *
 * iCreate, 2026-08-11: "Can we have a way for teachers to NAME the file and
 * also a way for us to rename them file?" and "Can we do have a drop down to
 * attach it to a person so we can upload a document for multiple people?"
 *
 * The office was reading raw camera filenames ("IMG_4021.jpg") in the list and
 * could file a document against exactly one person per upload.
 */

let authState = { user: { id: 'u1', role: 'org_admin' } }
let orgState = { organization: { id: 'org-1', name: 'Org' } }

vi.mock('../../contexts/AuthContext', () => ({ useAuth: () => authState }))
vi.mock('../../contexts/OrganizationContext', () => ({ useOrganization: () => orgState }))
vi.mock('react-hot-toast', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
  default: { success: vi.fn(), error: vi.fn() },
}))

const { api } = vi.hoisted(() => ({
  api: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() },
}))
vi.mock('../../services/api', () => ({ default: api }))

import SecureDocumentsPage from './SecureDocumentsPage'

const ROSTER = [
  { student_id: 'staff-1', name: 'Jane Doe', is_student: false, role: 'Teacher' },
  { student_id: 'staff-2', name: 'Sam Lee', is_student: false, role: 'Teacher' },
  { student_id: 'stu-1', name: 'Ada Small', is_student: true },
]

// One document from before titles existed, one named since.
const UNTITLED = {
  id: 'd1', filename: 'IMG_4021.pdf', title: null, category: 'Contract',
  owner_user_id: 'staff-1', owner_name: 'Jane Doe', created_at: '2026-08-01T00:00:00Z',
}
const NAMED = {
  id: 'd2', filename: 'scan0007.pdf', title: 'Lee - Background check',
  owner_user_id: 'staff-2', owner_name: 'Sam Lee', created_at: '2026-08-02T00:00:00Z',
}

let DOCS = [UNTITLED, NAMED]

beforeEach(() => {
  authState = { user: { id: 'u1', role: 'org_admin' } }
  orgState = { organization: { id: 'org-1', name: 'Org' } }
  DOCS = [UNTITLED, NAMED]
  vi.clearAllMocks()
  api.get.mockImplementation((url) => (
    url.includes('/roster')
      ? Promise.resolve({ data: { roster: ROSTER } })
      : Promise.resolve({ data: { documents: DOCS } })
  ))
  api.post.mockResolvedValue({ data: { documents: [{ id: 'new' }] } })
  api.patch.mockResolvedValue({ data: {} })
})

const show = async () => {
  render(<SecureDocumentsPage />)
  await screen.findByText('Lee - Background check')
}

const attachFile = () => {
  const input = document.querySelector('input[type="file"]')
  const file = new File(['x'], 'IMG_4021.pdf', { type: 'application/pdf' })
  fireEvent.change(input, { target: { files: [file] } })
}

const uploadedForm = () => api.post.mock.calls[0][1]

describe('naming a document', () => {
  it('sends the name the office typed', async () => {
    await show()
    attachFile()
    fireEvent.change(screen.getByLabelText('Document name'),
      { target: { value: 'Smith - Contract 2026' } })
    fireEvent.click(screen.getByText('Upload document'))
    await waitFor(() => expect(api.post).toHaveBeenCalled())
    expect(uploadedForm().get('title')).toBe('Smith - Contract 2026')
  })

  it('sends no name at all when the box is left alone, rather than an empty one', async () => {
    // The backend falls back to the filename; an empty string would have to be
    // special-cased there instead.
    await show()
    attachFile()
    fireEvent.click(screen.getByText('Upload document'))
    await waitFor(() => expect(api.post).toHaveBeenCalled())
    expect(uploadedForm().has('title')).toBe(false)
  })

  it('shows the title in the list, falling back to the filename for older files', async () => {
    await show()
    expect(screen.getByText('Lee - Background check')).toBeInTheDocument()
    expect(screen.getByText('IMG_4021.pdf')).toBeInTheDocument()
  })

  it('still shows what the file arrived as once it has been renamed', async () => {
    await show()
    expect(screen.getByText('File: scan0007.pdf')).toBeInTheDocument()
  })
})

describe('renaming a document later', () => {
  const startRename = async () => {
    await show()
    const row = screen.getByText('Lee - Background check').closest('tr')
    // By name, not position — the Sharing cell also holds two buttons now.
    fireEvent.click(within(row).getByRole('button', { name: 'Rename' }))
    return screen.getByLabelText('Rename Lee - Background check')
  }

  it('saves the new name against that document', async () => {
    const input = await startRename()
    fireEvent.change(input, { target: { value: 'Lee - BGC 2026' } })
    fireEvent.click(screen.getByText('Save'))
    await waitFor(() => expect(api.patch).toHaveBeenCalled())
    expect(api.patch.mock.calls[0][0]).toBe('/api/sis/secure-documents/d2')
    expect(api.patch.mock.calls[0][1].title).toBe('Lee - BGC 2026')
  })

  it('shows the new name straight away without waiting for a reload', async () => {
    const input = await startRename()
    fireEvent.change(input, { target: { value: 'Lee - BGC 2026' } })
    fireEvent.click(screen.getByText('Save'))
    expect(await screen.findByText('Lee - BGC 2026')).toBeInTheDocument()
  })

  it('puts the old name back if the save fails', async () => {
    api.patch.mockRejectedValueOnce({ response: { data: { error: 'nope' } } })
    const input = await startRename()
    fireEvent.change(input, { target: { value: 'Lee - BGC 2026' } })
    fireEvent.click(screen.getByText('Save'))
    await waitFor(() => expect(api.patch).toHaveBeenCalled())
    expect(await screen.findByText('Lee - Background check')).toBeInTheDocument()
  })

  it('cancelling changes nothing', async () => {
    const input = await startRename()
    fireEvent.change(input, { target: { value: 'Whatever' } })
    fireEvent.click(screen.getByText('Cancel'))
    expect(api.patch).not.toHaveBeenCalled()
    expect(screen.getByText('Lee - Background check')).toBeInTheDocument()
  })
})

describe('filing one upload against several people', () => {
  const attachPerson = (name) => {
    fireEvent.focus(screen.getByPlaceholderText('Search staff, parents, or students…'))
    fireEvent.mouseDown(screen.getByText(name))
  }

  it('sends every staff member picked', async () => {
    await show()
    attachFile()
    attachPerson('Jane Doe (Teacher)')
    attachPerson('Sam Lee (Teacher)')
    fireEvent.click(screen.getByText('Upload document'))
    await waitFor(() => expect(api.post).toHaveBeenCalled())
    expect(uploadedForm().getAll('owner_user_id')).toEqual(['staff-1', 'staff-2'])
  })

  it('sends a student under the student field, not the owner field', async () => {
    await show()
    attachFile()
    attachPerson('Ada Small (Student)')
    fireEvent.click(screen.getByText('Upload document'))
    await waitFor(() => expect(api.post).toHaveBeenCalled())
    expect(uploadedForm().getAll('student_user_id')).toEqual(['stu-1'])
    expect(uploadedForm().getAll('owner_user_id')).toEqual([])
  })

  it('lets a person be taken back off before uploading', async () => {
    await show()
    attachFile()
    attachPerson('Jane Doe (Teacher)')
    fireEvent.click(screen.getByLabelText('Remove Jane Doe'))
    fireEvent.click(screen.getByText('Upload document'))
    await waitFor(() => expect(api.post).toHaveBeenCalled())
    expect(uploadedForm().getAll('owner_user_id')).toEqual([])
  })

  it('does not offer someone already picked', async () => {
    await show()
    attachPerson('Jane Doe (Teacher)')
    fireEvent.focus(screen.getByPlaceholderText('Search staff, parents, or students…'))
    // The chip remains (its remove button is the unambiguous handle on it —
    // "Jane Doe" also appears in the table's About column); the dropdown entry
    // does not.
    expect(screen.queryByText('Jane Doe (Teacher)')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Remove Jane Doe')).toBeInTheDocument()
  })
})
