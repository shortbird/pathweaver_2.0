/**
 * Filing a document the office already holds against the item it answers.
 *
 * iCreate, 2026-09-05: "I have uploaded Molly's background check and yet it
 * shows on her onboarding that her background check is 'pending'. I have like
 * 18 or so people in that same boat where the background check is uploaded but
 * is just sitting in task center docs all on its own while their onboarding
 * status still says pending. I need to be able to connect the two things."
 *
 * Uploading to the store and answering a checklist item were two unconnected
 * acts, and the office does them in that order.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
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

import { AssignmentCard } from './OnboardingPage'

// Molly's exact situation on the day of the report: the background check is on
// file and the item is still pending.
const PENDING_ITEM = {
  key: 'bgcheck', title: 'Background check', status: 'pending',
  needs_document: true, needs_approval: false, documents: [],
}

const ASSIGNMENT = {
  id: 'a1', user_id: 'molly', user_name: 'Molly Christensen',
  template_name: 'Employee onboarding', audience: 'staff',
  status: 'in_progress', done_count: 0, total_count: 1,
  items: [PENDING_ITEM],
}

const FILED = [
  { id: 'doc-bg', title: 'Background check — Molly', category: 'Background check' },
  { id: 'doc-w4', title: 'W-4', category: 'Tax' },
]

const mockDocs = (documents = FILED) => {
  api.get.mockImplementation((url) => (
    url.includes('/attachable-documents')
      ? Promise.resolve({ data: { documents } })
      : Promise.resolve({ data: {} })
  ))
}

const show = async (assignment = ASSIGNMENT) => {
  render(
    <MemoryRouter>
      <AssignmentCard orgId="org-1" assignment={assignment} onChanged={vi.fn()} />
    </MemoryRouter>,
  )
  // The card is a <details>; open it so the items render.
  fireEvent.click(screen.getByText('Molly Christensen'))
  return screen.findByText('Background check')
}

beforeEach(() => {
  vi.clearAllMocks()
  mockDocs()
})

describe('attaching a document the office already holds', () => {
  it('offers the way back on an item still waiting for a document', async () => {
    await show()
    expect(screen.getByRole('button', { name: 'Attach filed document' })).toBeInTheDocument()
  })

  it('lists what the office holds for that person, not for the school', async () => {
    await show()
    fireEvent.click(screen.getByRole('button', { name: 'Attach filed document' }))
    await waitFor(() => expect(api.get).toHaveBeenCalled())
    expect(api.get.mock.calls[0][0]).toContain(
      '/api/sis/staff-admin/onboarding/assignments/a1/attachable-documents')
  })

  it('attaches the chosen document and answers the item in one go', async () => {
    await show()
    fireEvent.click(screen.getByRole('button', { name: 'Attach filed document' }))
    const picker = await screen.findByLabelText('Attach a filed document to Background check')
    await screen.findByText(/Background check — Molly/)
    fireEvent.change(picker, { target: { value: 'doc-bg' } })
    await waitFor(() => expect(api.patch).toHaveBeenCalled())
    const [url, body] = api.patch.mock.calls[0]
    expect(url).toContain('/onboarding/a1/items/bgcheck')
    expect(body).toMatchObject({ attach_document_id: 'doc-bg', status: 'complete' })
  })

  it('says so plainly when the office holds nothing for them', async () => {
    mockDocs([])
    await show()
    fireEvent.click(screen.getByRole('button', { name: 'Attach filed document' }))
    expect(await screen.findByText('Nothing on file for them')).toBeInTheDocument()
  })

  it('is not offered on an item that is already answered', async () => {
    await show({
      ...ASSIGNMENT,
      items: [{ ...PENDING_ITEM, status: 'complete' }],
    })
    expect(screen.queryByRole('button', { name: 'Attach filed document' })).not.toBeInTheDocument()
  })

  it('is not offered on an item that never wanted a document', async () => {
    await show({
      ...ASSIGNMENT,
      items: [{ ...PENDING_ITEM, needs_document: false }],
    })
    expect(screen.queryByRole('button', { name: 'Attach filed document' })).not.toBeInTheDocument()
  })
})

describe('an attached document, once it is on the item', () => {
  const ATTACHED = {
    ...ASSIGNMENT,
    items: [{
      ...PENDING_ITEM,
      status: 'complete',
      documents: [{ secure_document_id: 'doc-bg', title: 'Background check — Molly' }],
    }],
  }

  it('opens through the store, not the checklist bucket', async () => {
    // The blob never moved: the checklist holds a link, and signing a link
    // against the checklist bucket's path would 404.
    await show(ATTACHED)
    fireEvent.click(screen.getByRole('button', { name: 'Background check — Molly' }))
    await waitFor(() => expect(api.get).toHaveBeenCalled())
    expect(api.get.mock.calls[0][0]).toContain('/api/sis/secure-documents/doc-bg/url')
  })

  it('can be unlinked without touching the file', async () => {
    await show(ATTACHED)
    const row = screen.getByText('Background check').closest('li')
    fireEvent.click(within(row).getByTitle('Unlink this document — the file stays in Documents'))
    await waitFor(() => expect(api.patch).toHaveBeenCalled())
    expect(api.patch.mock.calls[0][1]).toMatchObject({ remove_document: 'doc-bg' })
  })
})
